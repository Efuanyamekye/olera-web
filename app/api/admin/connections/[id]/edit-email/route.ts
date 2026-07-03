import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import { sendEmail, reserveEmailLogId, appendTrackingParams, markEmailTrusted } from "@/lib/email";
import { connectionRequestEmail } from "@/lib/email-templates";
import { generateLeadClaimUrl, generateProviderPortalUrl } from "@/lib/claim-tokens";
import { getSiteUrl } from "@/lib/site-url";
import { sendDeferredNotificationsForProvider } from "@/lib/admin/send-deferred-notifications";
import { verifyAndCache } from "@/lib/email-verification";

/**
 * POST /api/admin/connections/[id]/edit-email
 *
 * Edit provider email with sequence restart:
 * 1. Update business_profiles.email (override)
 * 2. Store old email in metadata.previous_emails[]
 * 3. Increment metadata.email_version
 * 4. Reset sequence: followup_stage=0, email_sent_at=now, clear stopped fields
 * 5. Send Day 0 email immediately
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const admin = await getAdminUser(user.id);
    if (!admin) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const { id: connectionId } = await params;
    const body = await request.json();
    const newEmail = body.newEmail?.trim();
    const force = body.force === true;

    // Validation
    if (!newEmail) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }

    // Safety net: verify email unless force flag is set
    if (!force) {
      const verdict = await verifyAndCache(newEmail);
      if (verdict.status === "invalid") {
        return NextResponse.json(
          {
            error: "undeliverable",
            message: "That address can't receive mail — it would bounce.",
          },
          { status: 422 }
        );
      }
      // Catch-all ('risky'): the domain accepts all mail at the door, so we can't
      // confirm a real inbox exists. These bounce ~15%, and the cold lane now
      // suppresses catch-all at send (lib/email.ts) — so the deferred notification
      // to this address would be skipped anyway. Warn the operator to find a named
      // inbox; forcing through saves the address but the cold notification still
      // won't fire.
      if (verdict.status === "risky") {
        return NextResponse.json(
          {
            error: "risky",
            message:
              "That looks like a catch-all domain — mail often won't reach a real inbox, and the cold lane will skip it. Use a named address (e.g. a person's, not info@) if you can.",
          },
          { status: 422 }
        );
      }
    }

    const db = getServiceClient();
    const siteUrl = getSiteUrl();

    // Fetch connection with both profiles
    const { data: conn, error: fetchError } = await db
      .from("connections")
      .select(`
        id, type, created_at, from_profile_id, to_profile_id, message, metadata,
        from_profile:business_profiles!connections_from_profile_id_fkey(display_name, care_types, metadata),
        to_profile:business_profiles!connections_to_profile_id_fkey(id, display_name, slug, source_provider_id, email, account_id)
      `)
      .eq("id", connectionId)
      .eq("type", "inquiry")
      .maybeSingle();

    if (fetchError || !conn) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    const fromProfile = Array.isArray(conn.from_profile) ? conn.from_profile[0] : conn.from_profile;
    const toProfile = Array.isArray(conn.to_profile) ? conn.to_profile[0] : conn.to_profile;

    if (!toProfile?.id) {
      return NextResponse.json({ error: "Provider profile not found" }, { status: 404 });
    }

    const oldEmail = toProfile.email?.trim() || null;

    // Special case: "trusting" the same email (force + same email)
    // This happens when admin confirms a failed/invalid email actually works.
    // We trust it AND resend Day 0 (since original may have failed).
    if (oldEmail === newEmail) {
      if (!force) {
        return NextResponse.json({ error: "New email is the same as current email" }, { status: 400 });
      }

      // Trust the email first
      await markEmailTrusted(newEmail, {
        reason: "admin",
        note: `trust-existing-email on connection ${connectionId}`,
        createdBy: `admin:${admin.id}`,
      });

      // Now resend Day 0 notification (the original may have failed)
      // This ensures the provider actually receives the lead notification
      const fromProfile = Array.isArray(conn.from_profile) ? conn.from_profile[0] : conn.from_profile;
      const familyName = fromProfile?.display_name || "A family";
      const careTypes = fromProfile?.care_types as string[] | null;
      const careType = careTypes?.[0] || null;
      const providerName = toProfile.display_name || "Provider";
      const providerSlug = toProfile.slug || toProfile.source_provider_id || toProfile.id;

      // Get care recipient from family metadata
      const familyMeta = (fromProfile?.metadata as Record<string, unknown>) || {};
      const relationshipRaw = familyMeta.relationship_to_recipient as string | undefined;
      const careRecipientMap: Record<string, string | null> = {
        parent: "their parent",
        spouse: "their spouse",
        grandparent: "their grandparent",
        myself: "themselves",
        other: null,
      };
      const careRecipient = relationshipRaw
        ? (careRecipientMap[relationshipRaw] !== undefined ? careRecipientMap[relationshipRaw] : null)
        : null;

      // Get provider city
      let city: string | null = null;
      if (toProfile.source_provider_id) {
        const { data: iosProvider } = await db
          .from("olera-providers")
          .select("city")
          .eq("provider_id", toProfile.source_provider_id)
          .maybeSingle();
        city = iosProvider?.city || null;
      }

      // Get current email version (don't increment - email didn't change)
      const meta = (conn.metadata || {}) as Record<string, unknown>;
      const emailVersion = (meta.email_version as number) || 1;
      const now = new Date().toISOString();

      // Send Day 0 email
      const emailLogId = await reserveEmailLogId({
        to: newEmail,
        subject: `${familyName} is interested in your care services`,
        emailType: "connection_request",
        recipientType: "provider",
        providerId: toProfile.id,
        metadata: {
          connection_id: connectionId,
          email_version: emailVersion,
          sent_by: `admin:${admin.id}`,
          is_trust_resend: true,
        },
      });

      const claimUrl = generateLeadClaimUrl(providerSlug, newEmail, connectionId, siteUrl);
      const viewUrl = appendTrackingParams(claimUrl, emailLogId);
      const manageListingUrl = generateProviderPortalUrl(providerSlug, newEmail, "manage", siteUrl);
      const settingsUrl = generateProviderPortalUrl(providerSlug, newEmail, "settings", siteUrl);

      const html = connectionRequestEmail({
        providerName,
        familyName,
        careType,
        city,
        careRecipient,
        viewUrl,
        manageListingUrl,
        settingsUrl,
      });

      const { success, error: sendError } = await sendEmail({
        to: newEmail,
        subject: `${familyName} is interested in your care services`,
        html,
        emailType: "connection_request",
        recipientType: "provider",
        providerId: toProfile.id,
        metadata: {
          connection_id: connectionId,
          email_version: emailVersion,
          sent_by: `admin:${admin.id}`,
          is_trust_resend: true,
        },
        emailLogId: emailLogId ?? undefined,
      });

      if (!success) {
        console.error("[edit-email] Trust resend failed:", sendError);
        // Email is still trusted, but resend failed
        return NextResponse.json({
          success: true,
          trusted: true,
          resendFailed: true,
          newEmail,
          message: "Email trusted but resend failed. Check email logs.",
        });
      }

      // Reset sequence metadata (fresh start with trusted email)
      const updatedMeta = {
        ...meta,
        email_sent_at: now,
        followup_stage: 0,
        followup_sent_at: null,
        followup_sent_by: null,
        followup_stopped_at: null,
        followup_stopped_reason: null,
        needs_call: false,
        nudge_count: 0,
        nudged_at: null,
      };

      const { error: metaError } = await db
        .from("connections")
        .update({ metadata: updatedMeta })
        .eq("id", connectionId);

      if (metaError) {
        console.error("[edit-email] Trust resend metadata update failed:", metaError);
        // Email was sent but metadata not updated - warn admin
        return NextResponse.json({
          success: true,
          trusted: true,
          resent: true,
          warning: "Email trusted and resent, but sequence state may be inconsistent.",
          newEmail,
        });
      }

      console.log(
        `[edit-email] Trusted and resent Day 0 for connection ${connectionId}: ${newEmail}`
      );

      return NextResponse.json({
        success: true,
        trusted: true,
        resent: true,
        newEmail,
        message: "Email trusted and Day 0 resent. Sequence restarted.",
      });
    }

    // Protection: If this account is claimed (has account_id) AND already has an email,
    // block the change. The provider owns this email and should update it themselves.
    // However, if NO email is on file, allow adding one (for directory enrichment).
    const isAccountClaimed = !!(toProfile as { account_id?: string | null }).account_id;
    if (isAccountClaimed && oldEmail) {
      return NextResponse.json(
        {
          error: "claimed_account",
          message: "This provider has claimed their account. Their email cannot be changed by admins.",
        },
        { status: 403 }
      );
    }

    // Update business_profiles.email
    const { error: updateError } = await db
      .from("business_profiles")
      .update({ email: newEmail })
      .eq("id", toProfile.id);

    if (updateError) {
      console.error("[edit-email] Failed to update business_profiles:", updateError);
      return NextResponse.json({ error: "Failed to update provider email" }, { status: 500 });
    }

    // Also update olera-providers.email if source_provider_id exists (keep databases in sync)
    // Skip if provider has claimed their account (we already checked above, this is for
    // the edge case where the provider is adding their first email to a claimed account)
    let skippedOleraProvidersSync = false;

    if (toProfile.source_provider_id && !isAccountClaimed) {
      await db
        .from("olera-providers")
        .update({ email: newEmail })
        .eq("provider_id", toProfile.source_provider_id);
    } else if (toProfile.source_provider_id && isAccountClaimed) {
      skippedOleraProvidersSync = true;
      console.log(
        `[edit-email] Skipped olera-providers sync for ${toProfile.source_provider_id} ` +
        `because account is claimed (account_id: ${(toProfile as { account_id?: string }).account_id})`
      );
    }

    // Prepare metadata for later update
    const meta = (conn.metadata || {}) as Record<string, unknown>;
    const previousEmails = (meta.previous_emails as Array<{ email: string; changed_at: string; changed_by: string }>) || [];
    const emailVersion = ((meta.email_version as number) || 1) + 1;
    const now = new Date().toISOString();

    if (oldEmail) {
      previousEmails.push({
        email: oldEmail,
        changed_at: now,
        changed_by: `admin:${admin.id}`,
      });
    }

    // Prepare email data
    const familyName = fromProfile?.display_name || "A family";
    const careTypes = fromProfile?.care_types as string[] | null;
    const careType = careTypes?.[0] || null;
    const providerName = toProfile.display_name || "Provider";
    const providerSlug = toProfile.slug || toProfile.source_provider_id || toProfile.id;

    // Get care recipient from family metadata
    const familyMeta = (fromProfile?.metadata as Record<string, unknown>) || {};
    const relationshipRaw = familyMeta.relationship_to_recipient as string | undefined;
    const careRecipientMap: Record<string, string | null> = {
      parent: "their parent",
      spouse: "their spouse",
      grandparent: "their grandparent",
      myself: "themselves",
      other: null,
    };
    const careRecipient = relationshipRaw
      ? (careRecipientMap[relationshipRaw] !== undefined ? careRecipientMap[relationshipRaw] : null)
      : null;

    // Get provider city from olera-providers if available
    let city: string | null = null;
    if (toProfile.source_provider_id) {
      const { data: iosProvider } = await db
        .from("olera-providers")
        .select("city")
        .eq("provider_id", toProfile.source_provider_id)
        .maybeSingle();
      city = iosProvider?.city || null;
    }

    // Send Day 0 email (use canonical UUID for tracking consistency)
    const emailLogId = await reserveEmailLogId({
      to: newEmail,
      subject: `${familyName} is interested in your care services`,
      emailType: "connection_request",
      recipientType: "provider",
      providerId: toProfile.id,
      metadata: {
        connection_id: connectionId,
        email_version: emailVersion,
        sent_by: `admin:${admin.id}`,
        is_email_edit_resend: true,
      },
    });

    const claimUrl = generateLeadClaimUrl(providerSlug, newEmail, connectionId, siteUrl);
    const viewUrl = appendTrackingParams(claimUrl, emailLogId);
    const manageListingUrl = generateProviderPortalUrl(providerSlug, newEmail, "manage", siteUrl);
    const settingsUrl = generateProviderPortalUrl(providerSlug, newEmail, "settings", siteUrl);

    const html = connectionRequestEmail({
      providerName,
      familyName,
      careType,
      city,
      careRecipient,
      viewUrl,
      manageListingUrl,
      settingsUrl,
    });

    const { success, error: sendError } = await sendEmail({
      to: newEmail,
      subject: `${familyName} is interested in your care services`,
      html,
      emailType: "connection_request",
      recipientType: "provider",
      providerId: toProfile.id,
      metadata: {
        connection_id: connectionId,
        email_version: emailVersion,
        sent_by: `admin:${admin.id}`,
        is_email_edit_resend: true,
      },
      emailLogId: emailLogId ?? undefined,
    });

    if (!success) {
      console.error("[edit-email] Failed to send Day 0 email:", sendError);
      // Rollback business_profiles update
      await db.from("business_profiles").update({ email: oldEmail }).eq("id", toProfile.id);
      return NextResponse.json({
        success: false,
        error: "Failed to send email notification",
      }, { status: 500 });
    }

    // If the admin forced past the verification gate, this is a human-trusted
    // address — they have better evidence the inbox is real than ZeroBounce
    // (phoned the provider, pulled it off the official site). Record it on the
    // trust allowlist so future sends AND the connections queue stop re-flagging
    // it as invalid/failed; otherwise the override "reverts" to Needs Email on the
    // next list load. Best-effort (never throws).
    if (force) {
      await markEmailTrusted(newEmail, {
        reason: "admin",
        note: `edit-email override on connection ${connectionId}`,
        createdBy: `admin:${admin.id}`,
      });
    }

    // Email sent successfully - now update connection metadata
    const updatedMeta = {
      ...meta,
      email_version: emailVersion,
      previous_emails: previousEmails,
      email_sent_at: now,
      followup_stage: 0,
      followup_sent_at: null,
      followup_sent_by: null,
      followup_stopped_at: null,
      followup_stopped_reason: null,
      needs_call: false,
      nudge_count: 0,
      nudged_at: null,
    };

    const { error: metaError } = await db
      .from("connections")
      .update({ metadata: updatedMeta })
      .eq("id", connectionId);

    if (metaError) {
      console.error("[edit-email] Failed to update connection metadata:", metaError);
      // Email was sent but metadata update failed - log warning but don't fail
      // Admin can manually check sequence status
      console.warn(`[edit-email] Connection ${connectionId} email sent to ${newEmail} but metadata not updated`);

      return NextResponse.json({
        success: true,
        warning: "Email updated but sequence state may be inconsistent. Check connection status.",
        emailVersion,
        oldEmail,
        newEmail,
      });
    }

    console.log(
      `[edit-email] Successfully edited email for connection ${connectionId}: ` +
      `${oldEmail || "(none)"} → ${newEmail} (v${emailVersion}). Day 0 email sent.`
    );

    // Send deferred notifications for ALL other pending connections/questions
    // This ensures email editing behaves like email adding (consistency)
    let deferredResult = {
      leadEmailsSent: 0,
      questionEmailsSent: 0,
      leadsSkipped: 0,
    };
    let deferredNotificationsSucceeded = true;

    try {
      // Build slug variants for question lookup
      const additionalSlugVariants: string[] = [];
      if (toProfile.slug && toProfile.slug !== providerSlug) {
        additionalSlugVariants.push(toProfile.slug);
      }
      if (toProfile.source_provider_id && toProfile.source_provider_id !== providerSlug) {
        additionalSlugVariants.push(toProfile.source_provider_id);
      }

      // Get provider metadata to check leads_unsubscribed status
      const { data: providerMeta } = await db
        .from("business_profiles")
        .select("metadata")
        .eq("id", toProfile.id)
        .maybeSingle();

      const providerMetadata = (providerMeta?.metadata as Record<string, unknown>) || {};
      const leadsUnsubscribed = !!providerMetadata.leads_unsubscribed;

      deferredResult = await sendDeferredNotificationsForProvider({
        profileId: toProfile.id,
        email: newEmail,
        providerName: toProfile.display_name || providerName,
        providerSlug,
        additionalSlugVariants,
        leadsUnsubscribed,
      });

      // Also clear email_dead and needs_provider_email flags from questions for this provider.
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
          const qMeta = (q.metadata || {}) as Record<string, unknown>;
          if (qMeta.email_dead || qMeta.needs_provider_email) {
            delete qMeta.email_dead;
            delete qMeta.needs_provider_email;
            const { error: updateErr } = await db
              .from("provider_questions")
              .update({ metadata: qMeta })
              .eq("id", q.id);
            if (!updateErr) {
              questionFlagsCleared++;
            }
          }
        }
        if (questionFlagsCleared > 0) {
          console.log(`[edit-email] Cleared email_dead/needs_provider_email flags from ${questionFlagsCleared} question(s) for ${providerSlug}`);
        }
      }

      console.log(
        `[edit-email] Deferred notifications sent: ${deferredResult.leadEmailsSent} leads, ` +
        `${deferredResult.questionEmailsSent} questions, ${deferredResult.leadsSkipped} skipped`
      );
    } catch (deferredErr) {
      console.error("[edit-email] Failed to send deferred notifications:", deferredErr);
      // Non-blocking - email was updated successfully, deferred notifications are best-effort
      deferredNotificationsSucceeded = false;
    }

    return NextResponse.json({
      success: true,
      emailVersion,
      oldEmail,
      newEmail,
      accountClaimed: isAccountClaimed,
      skippedOleraProvidersSync,
      deferredNotifications: {
        ...deferredResult,
        succeeded: deferredNotificationsSucceeded,
      },
    });
  } catch (err) {
    console.error("[edit-email] Fatal error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
