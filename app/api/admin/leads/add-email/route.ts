import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient, logAuditAction } from "@/lib/admin";
import { sendEmail, reserveEmailLogId, appendTrackingParams } from "@/lib/email";
import { connectionRequestEmail } from "@/lib/email-templates";
import { generateNotificationUrl } from "@/lib/claim-tokens";

/**
 * POST /api/admin/leads/add-email
 *
 * Add email to a provider (business_profiles + olera-providers) and
 * send deferred lead notification emails for flagged connections.
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

    const { profileId, email } = await request.json();

    if (!profileId || !email) {
      return NextResponse.json({ error: "Missing profileId or email" }, { status: 400 });
    }

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }

    const db = getServiceClient();

    // Get the business profile
    const { data: profile, error: profileErr } = await db
      .from("business_profiles")
      .select("id, display_name, email, source_provider_id, slug, metadata")
      .eq("id", profileId)
      .single();

    if (profileErr || !profile) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
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

    // Check if provider has opted out of lead emails
    const profileMeta = (profile.metadata as Record<string, unknown>) || {};
    if (profileMeta.leads_unsubscribed) {
      // Still clear flags and update email, but don't send notification emails
      const { data: flagged } = await db
        .from("connections")
        .select("id, metadata")
        .eq("to_profile_id", profileId)
        .eq("status", "pending")
        .contains("metadata", { needs_provider_email: true });

      for (const conn of flagged ?? []) {
        const meta = (conn.metadata as Record<string, unknown>) || {};
        delete meta.needs_provider_email;
        meta.email_skipped_unsubscribed = true;
        await db.from("connections").update({ metadata: meta }).eq("id", conn.id);
      }

      await logAuditAction({
        adminUserId: adminUser.id,
        action: "add_provider_email",
        targetType: "business_profile",
        targetId: profileId,
        details: { email: effectiveEmail, providerName: profile.display_name, emailsSent: 0, flagsCleared: flagged?.length ?? 0, skippedReason: "provider_unsubscribed" },
      });

      return NextResponse.json({ success: true, emailsSent: 0, skipped: "unsubscribed" });
    }

    // Find and process flagged connections
    const { data: flaggedConnections } = await db
      .from("connections")
      .select("id, message, from_profile:business_profiles!connections_from_profile_id_fkey(display_name)")
      .eq("to_profile_id", profileId)
      .eq("status", "pending")
      .contains("metadata", { needs_provider_email: true });

    let emailsSent = 0;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";

    if (flaggedConnections && flaggedConnections.length > 0) {
      const careTypeMap: Record<string, string> = {
        home_care: "Home Care",
        home_health: "Home Health Care",
        assisted_living: "Assisted Living",
        memory_care: "Memory Care",
      };

      for (const conn of flaggedConnections) {
        try {
          // Skip if already sent (e.g. via questions add-email)
          const { data: connData } = await db
            .from("connections")
            .select("metadata")
            .eq("id", conn.id)
            .single();
          const meta = (connData?.metadata as Record<string, unknown>) || {};
          if (meta.email_sent_at) {
            delete meta.needs_provider_email;
            await db.from("connections").update({ metadata: meta }).eq("id", conn.id);
            continue;
          }

          let careType: string | null = null;
          let additionalNotes: string | null = null;
          let familyName = "A family";
          try {
            const msg = JSON.parse(conn.message || "{}");
            careType = msg.care_type ? (careTypeMap[msg.care_type] || msg.care_type) : null;
            additionalNotes = msg.additional_notes || null;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const fromProfile = (conn as any).from_profile as { display_name: string } | null;
            familyName = fromProfile?.display_name || `${msg.seeker_first_name || ""} ${msg.seeker_last_name || ""}`.trim() || "A family";
          } catch { /* use defaults */ }

          const emailSubject = `A family is looking for care from ${profile.display_name || "your organization"}`;
          const emailLogId = await reserveEmailLogId({
            to: effectiveEmail,
            subject: emailSubject,
            emailType: "add_email_notification",
            recipientType: "provider",
            providerId: profileId,
          });

          // Generate one-click URL with signed token for auto-sign-in
          const providerSlug = profile.slug || profile.source_provider_id || profileId;
          let viewUrl: string;
          try {
            viewUrl = generateNotificationUrl(providerSlug, effectiveEmail, "lead", conn.id, siteUrl);
            viewUrl = appendTrackingParams(viewUrl, emailLogId);
          } catch {
            // Fallback: direct URL without token
            viewUrl = appendTrackingParams(`${siteUrl}/provider/${providerSlug}/onboard?action=lead&actionId=${conn.id}`, emailLogId);
          }

          await sendEmail({
            to: effectiveEmail,
            subject: emailSubject,
            html: connectionRequestEmail({
              providerName: profile.display_name || "Provider",
              familyName,
              careType,
              message: additionalNotes,
              viewUrl,
              providerSlug,
            }),
            emailType: "add_email_notification",
            recipientType: "provider",
            providerId: profileId,
            emailLogId: emailLogId ?? undefined,
          });

          // Clear the flag
          delete meta.needs_provider_email;
          meta.email_sent_at = new Date().toISOString();
          await db
            .from("connections")
            .update({ metadata: meta })
            .eq("id", conn.id);

          emailsSent++;
        } catch (emailErr) {
          console.error(`Failed to send deferred email for connection ${conn.id}:`, emailErr);
        }
      }
    }

    // Cross-clear: also send deferred question notifications for this provider
    // Questions can be stored under various identifiers (slug, UUID, source_provider_id)
    let questionEmailsSent = 0;
    const possibleProviderIds: string[] = [profileId]; // business_profile UUID
    if (profile.slug) possibleProviderIds.push(profile.slug);
    if (profile.source_provider_id && !possibleProviderIds.includes(profile.source_provider_id)) {
      possibleProviderIds.push(profile.source_provider_id);
    }
    // Use canonical slug for URLs
    const canonicalSlug = profile.slug || profile.source_provider_id || profileId;

    if (possibleProviderIds.length > 0) {
      const { data: flaggedQuestions } = await db
        .from("provider_questions")
        .select("id, question, asker_name, metadata")
        .in("provider_id", possibleProviderIds)
        .contains("metadata", { needs_provider_email: true });

      if (flaggedQuestions && flaggedQuestions.length > 0) {
        const { questionReceivedEmail, questionReceivedInbox, assignQuestionVariant } = await import("@/lib/email-templates");
        for (const q of flaggedQuestions) {
          try {
            const meta = (q.metadata as Record<string, unknown>) || {};
            if (meta.email_sent_at) {
              delete meta.needs_provider_email;
              await db.from("provider_questions").update({ metadata: meta }).eq("id", q.id);
              continue;
            }

            const qaVariant = assignQuestionVariant();
            const qaInbox = questionReceivedInbox({
              providerName: profile.display_name || "your organization",
              question: q.question,
              variant: qaVariant,
            });
            const qLogId = await reserveEmailLogId({
              to: effectiveEmail,
              subject: qaInbox.subject,
              emailType: "question_received",
              recipientType: "provider",
              providerId: profileId,
            });

            await sendEmail({
              to: effectiveEmail,
              subject: qaInbox.subject,
              html: questionReceivedEmail({
                providerName: profile.display_name || "Provider",
                askerName: q.asker_name || "A family",
                question: q.question,
                providerUrl: appendTrackingParams(`${siteUrl}/provider/${canonicalSlug}/onboard`, qLogId),
                providerSlug: canonicalSlug,
                preheader: qaInbox.preheader,
              }),
              emailType: "question_received",
              recipientType: "provider",
              providerId: profileId,
              emailLogId: qLogId ?? undefined,
              metadata: { variant: qaVariant, phi_filtered: qaInbox.phiFiltered },
            });

            delete meta.needs_provider_email;
            meta.email_sent_at = new Date().toISOString();
            await db.from("provider_questions").update({ metadata: meta }).eq("id", q.id);
            questionEmailsSent++;
          } catch (err) {
            console.error(`Failed to send deferred question email for ${q.id}:`, err);
          }
        }
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
        lead_emails_sent: emailsSent,
        question_emails_sent: questionEmailsSent,
      },
    });

    return NextResponse.json({
      success: true,
      emailsSent: emailsSent + questionEmailsSent,
    });
  } catch (err) {
    console.error("Add email error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
