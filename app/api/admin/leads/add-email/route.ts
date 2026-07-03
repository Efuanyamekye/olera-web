import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient, logAuditAction } from "@/lib/admin";
import { sendDeferredNotificationsForProvider } from "@/lib/admin/send-deferred-notifications";
import { verifyAndCache } from "@/lib/email-verification";
import { markEmailTrusted } from "@/lib/email";

/**
 * POST /api/admin/leads/add-email
 *
 * Add email to a provider (business_profiles + olera-providers) and
 * send deferred lead AND question notification emails.
 *
 * This uses the unified sendDeferredNotificationsForProvider() which handles:
 * - Finding all pending leads/questions without email_sent_at
 * - Sending notifications for both
 * - Marking them as sent
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const adminUser = await getAdminUser(user.id);
    if (!adminUser) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const { profileId, email, force } = await request.json();

    if (!profileId || !email) {
      return NextResponse.json({ error: "Missing profileId or email" }, { status: 400 });
    }

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }

    // Instant deliverability check on the freshly-fetched address. This endpoint
    // saves the email AND immediately fires the deferred question/lead
    // notification to it — so a dead address here means a guaranteed bounce on
    // a brand-new domain. ZeroBounce verifies + caches the verdict (so the
    // subsequent send is a warm cache hit, never re-checked). If it's invalid,
    // don't save or send — tell the operator to find another address. Force
    // through with { force: true } for the rare case the operator is certain.
    // Fails OPEN: a verification error returns 'unknown' and we proceed.
    if (!force) {
      const verdict = await verifyAndCache(email);
      if (verdict.status === "invalid") {
        return NextResponse.json(
          {
            error: "undeliverable",
            message: "That address can't receive mail — it would bounce. Try another.",
          },
          { status: 422 },
        );
      }
      // Catch-all ('risky'): the domain accepts all mail at the door, so we can't
      // confirm a real inbox exists. These bounce ~15%, and the cold lane now
      // suppresses catch-all at send (lib/email.ts) — so the deferred lead/
      // question notification to this address would be skipped anyway. Warn the
      // operator to find a named inbox; forcing through saves the address but the
      // cold notification still won't fire.
      if (verdict.status === "risky") {
        return NextResponse.json(
          {
            error: "risky",
            message:
              "That looks like a catch-all domain — mail often won't reach a real inbox, and the cold lane will skip it. Use a named address (e.g. a person's, not info@) if you can.",
          },
          { status: 422 },
        );
      }
    }

    const db = getServiceClient();

    // Get the business profile
    const { data: profile, error: profileErr } = await db
      .from("business_profiles")
      .select("id, display_name, email, source_provider_id, slug, metadata, account_id")
      .eq("id", profileId)
      .single();

    if (profileErr || !profile) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }

    // Protection: If this account is claimed (has account_id) AND already has an email,
    // block the change. The provider owns this email and should update it themselves.
    // However, if NO email is on file, allow adding one (for directory enrichment).
    if (profile.account_id && profile.email) {
      return NextResponse.json(
        {
          error: "claimed_account",
          message: "This provider has claimed their account. Their email cannot be changed by admins.",
        },
        { status: 403 }
      );
    }

    // Use submitted email, or fall back to existing email on file
    const effectiveEmail = email || profile.email;

    // Update email on whichever records need it (skip if unchanged)
    if (profile.email !== effectiveEmail) {
      await db
        .from("business_profiles")
        .update({ email: effectiveEmail })
        .eq("id", profileId);
    }

    if (profile.source_provider_id) {
      const { data: iosProvider } = await db
        .from("olera-providers")
        .select("email")
        .eq("provider_id", profile.source_provider_id)
        .maybeSingle();
      if (iosProvider?.email !== effectiveEmail) {
        await db
          .from("olera-providers")
          .update({ email: effectiveEmail })
          .eq("provider_id", profile.source_provider_id);
      }
    }

    // If the admin forced past the verification gate, this is a human-trusted
    // address. Record it on the trust allowlist (email_overrides) so future sends
    // AND the connections queue stop re-flagging it as invalid — otherwise the
    // override reverts to Needs Email on the next list load. Best-effort.
    if (force) {
      await markEmailTrusted(effectiveEmail, {
        reason: "admin",
        note: `add-email override on profile ${profileId}`,
        createdBy: `admin:${adminUser.id}`,
      });
    }

    // Check if provider has opted out of lead emails
    const profileMeta = (profile.metadata as Record<string, unknown>) || {};
    const providerSlug = profile.slug || profile.source_provider_id || profileId;

    // Build additional slug variants for question lookup
    const additionalSlugVariants: string[] = [];
    if (profile.source_provider_id && profile.source_provider_id !== providerSlug) {
      additionalSlugVariants.push(profile.source_provider_id);
    }

    // Send deferred notifications using the unified function
    const result = await sendDeferredNotificationsForProvider({
      profileId,
      email: effectiveEmail,
      providerName: profile.display_name || "Provider",
      providerSlug,
      additionalSlugVariants,
      leadsUnsubscribed: !!profileMeta.leads_unsubscribed,
    });

    // Clear email_dead and needs_provider_email flags from questions for this provider.
    // These flags were set when the previous email bounced or was missing — now that
    // we have a working email, clear them so the questions leave the "Delivery Issues"
    // and "Needs Email" tabs.
    const allSlugVariants = [providerSlug, ...additionalSlugVariants];
    const { data: flaggedQuestions } = await db
      .from("provider_questions")
      .select("id, metadata")
      .in("provider_id", allSlugVariants);

    let questionFlagsCleared = 0;
    if (flaggedQuestions?.length) {
      for (const q of flaggedQuestions) {
        const meta = (q.metadata || {}) as Record<string, unknown>;
        if (meta.email_dead || meta.needs_provider_email) {
          delete meta.email_dead;
          delete meta.needs_provider_email;
          const { error: updateErr } = await db
            .from("provider_questions")
            .update({ metadata: meta })
            .eq("id", q.id);
          if (!updateErr) {
            questionFlagsCleared++;
          }
        }
      }
      if (questionFlagsCleared > 0) {
        console.log(`[leads/add-email] Cleared email_dead/needs_provider_email flags from ${questionFlagsCleared} question(s) for ${providerSlug}`);
      }
    }

    await logAuditAction({
      adminUserId: adminUser.id,
      action: "add_provider_email",
      targetType: "business_profile",
      targetId: profileId,
      details: {
        provider_name: profile.display_name,
        email: effectiveEmail,
        previous_email: profile.email || null,
        lead_emails_sent: result.leadEmailsSent,
        question_emails_sent: result.questionEmailsSent,
        leads_skipped: result.leadsSkipped,
        question_flags_cleared: questionFlagsCleared,
      },
    });

    if (result.leadsSkipped > 0 && result.leadEmailsSent === 0 && result.questionEmailsSent === 0) {
      return NextResponse.json({ success: true, emailsSent: 0, skipped: "unsubscribed" });
    }

    return NextResponse.json({
      success: true,
      emailsSent: result.leadEmailsSent + result.questionEmailsSent,
    });
  } catch (err) {
    console.error("Add email error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
