import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient, logAuditAction } from "@/lib/admin";
import { sendDeferredNotificationsForProvider } from "@/lib/admin/send-deferred-notifications";

/**
 * PATCH /api/admin/provider-outreach/update-email
 *
 * Update a provider's email address in olera-providers table.
 * Also triggers deferred notifications for any pending questions/leads.
 *
 * Body:
 *   - provider_id: string (required)
 *   - email: string (required) - new email to set
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const adminUser = await getAdminUser(user.id);
    if (!adminUser) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const body = await request.json();
    const { provider_id, email } = body;

    if (!provider_id) {
      return NextResponse.json({ error: "provider_id is required" }, { status: 400 });
    }

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }

    const db = getServiceClient();
    const trimmedEmail = email.trim();

    // Get current provider data
    const { data: existing } = await db
      .from("olera-providers")
      .select("email, provider_name, slug")
      .eq("provider_id", provider_id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }

    // Update the email
    const { error: updateError } = await db
      .from("olera-providers")
      .update({ email: trimmedEmail })
      .eq("provider_id", provider_id);

    if (updateError) {
      console.error("[provider-outreach/update-email] Update error:", updateError);
      return NextResponse.json({ error: "Failed to update email" }, { status: 500 });
    }

    // Check for linked business_profile
    const { data: linkedProfile } = await db
      .from("business_profiles")
      .select("id, slug, metadata, account_id, email")
      .eq("source_provider_id", provider_id)
      .maybeSingle();

    // Sync email to business_profile if linked, but protect claimed accounts
    // If account is claimed (has account_id) AND already has an email, don't overwrite
    // The provider owns their email and should update it themselves
    if (linkedProfile && linkedProfile.id) {
      const isClaimed = !!linkedProfile.account_id;
      const hasEmail = !!linkedProfile.email;

      if (isClaimed && hasEmail) {
        // Don't overwrite claimed account's email, but continue with other operations
        console.log(`[provider-outreach/update-email] Skipping business_profile sync for claimed account ${linkedProfile.id}`);
      } else {
        // Safe to sync: either unclaimed, or claimed but no email yet (enrichment case)
        await db
          .from("business_profiles")
          .update({ email: trimmedEmail })
          .eq("id", linkedProfile.id);
      }
    }

    // Build slug variants for deferred notifications
    const providerSlug = existing.slug || linkedProfile?.slug || provider_id;
    const additionalSlugVariants: string[] = [];
    if (existing.slug && existing.slug !== providerSlug) {
      additionalSlugVariants.push(existing.slug);
    }
    if (linkedProfile?.slug && linkedProfile.slug !== providerSlug) {
      additionalSlugVariants.push(linkedProfile.slug);
    }
    if (provider_id !== providerSlug) {
      additionalSlugVariants.push(provider_id);
    }

    // Send deferred notifications for any pending questions/leads
    let notificationResult = { leadEmailsSent: 0, questionEmailsSent: 0, leadsSkipped: 0 };
    try {
      notificationResult = await sendDeferredNotificationsForProvider({
        profileId: linkedProfile?.id || "",
        email: trimmedEmail,
        providerName: existing.provider_name || providerSlug,
        providerSlug,
        additionalSlugVariants,
      });
    } catch (notifErr) {
      // Log but don't fail the request - email was saved successfully
      console.error("[provider-outreach/update-email] Deferred notification error:", notifErr);
    }

    // Clear email_dead/needs_provider_email flags from questions
    const allSlugVariants = [providerSlug, ...additionalSlugVariants];
    let questionFlagsCleared = 0;
    try {
      const { data: flaggedQuestions } = await db
        .from("provider_questions")
        .select("id, metadata")
        .in("provider_id", allSlugVariants);

      if (flaggedQuestions?.length) {
        for (const q of flaggedQuestions) {
          const meta = (q.metadata || {}) as Record<string, unknown>;
          if (meta.email_dead || meta.needs_provider_email) {
            delete meta.email_dead;
            delete meta.needs_provider_email;
            const { error: flagUpdateErr } = await db
              .from("provider_questions")
              .update({ metadata: meta })
              .eq("id", q.id);
            if (!flagUpdateErr) {
              questionFlagsCleared++;
            }
          }
        }
      }
    } catch (flagErr) {
      console.error("[provider-outreach/update-email] Flag clearing error:", flagErr);
    }

    // Log audit action
    await logAuditAction({
      adminUserId: adminUser.id,
      action: "update_provider_email",
      targetType: "provider",
      targetId: provider_id,
      details: {
        provider_name: existing.provider_name,
        old_email: existing.email,
        new_email: trimmedEmail,
        question_emails_sent: notificationResult.questionEmailsSent,
        lead_emails_sent: notificationResult.leadEmailsSent,
        leads_skipped: notificationResult.leadsSkipped,
        question_flags_cleared: questionFlagsCleared,
      },
    });

    return NextResponse.json({
      success: true,
      email: trimmedEmail,
      notificationsSent: notificationResult.leadEmailsSent + notificationResult.questionEmailsSent,
    });
  } catch (err) {
    console.error("[provider-outreach/update-email] Error:", err);
    return NextResponse.json(
      { error: `Internal server error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
