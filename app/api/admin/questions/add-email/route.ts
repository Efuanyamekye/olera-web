import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient, logAuditAction } from "@/lib/admin";
import { sendEmail, reserveEmailLogId, appendTrackingParams } from "@/lib/email";
import { questionReceivedEmail, questionReceivedInbox, assignQuestionVariant, connectionRequestEmail } from "@/lib/email-templates";
import { generateProviderSlug } from "@/lib/slugify";
import { generateNotificationUrl } from "@/lib/claim-tokens";

/**
 * POST /api/admin/questions/add-email
 *
 * Add email to a provider and send deferred question notifications.
 * Also clears needs_provider_email flags on any pending leads for the same provider.
 *
 * Body: { providerSlug, email }
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

    const { providerSlug, email } = await request.json();

    if (!providerSlug || !email) {
      return NextResponse.json({ error: "Missing providerSlug or email" }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }

    const db = getServiceClient();

    // Multi-strategy provider lookup (mirrors question submission logic)
    // Strategy 1: business_profiles by slug
    let provider = await db
      .from("business_profiles")
      .select("id, display_name, email, source_provider_id, slug")
      .eq("slug", providerSlug)
      .maybeSingle()
      .then(r => r.data);

    // Strategy 2: olera-providers by slug → linked business_profile
    let iosProvider: { provider_id: string; email: string | null; provider_name: string | null } | null = null;
    if (!provider) {
      iosProvider = await db
        .from("olera-providers")
        .select("provider_id, email, provider_name")
        .eq("slug", providerSlug)
        .not("deleted", "is", true)
        .maybeSingle()
        .then(r => r.data);

      if (!iosProvider) {
        // Strategy 3: olera-providers by provider_id (legacy alphanumeric ID)
        iosProvider = await db
          .from("olera-providers")
          .select("provider_id, email, provider_name")
          .eq("provider_id", providerSlug)
          .not("deleted", "is", true)
          .maybeSingle()
          .then(r => r.data);
      }

      if (!iosProvider) {
        // Strategy 4: reverse-match auto-generated slug
        // When olera-providers.slug is null, iosProviderToProfile generates a slug from
        // provider_name + state (e.g., "acme-home-care-tx"). The stored question
        // provider_id may be this ephemeral slug. Extract a name prefix to narrow the
        // DB search, then confirm by regenerating the full slug.
        // Slug format: "{slugified-name}-{state}" — state is last 2 chars if present
        const slugParts = providerSlug.split("-");
        // Use first few words as a ILIKE prefix to narrow candidates (avoid full table scan)
        const namePrefix = slugParts.slice(0, 3).join("-");
        const { data: candidates } = await db
          .from("olera-providers")
          .select("provider_id, email, provider_name, state")
          .not("deleted", "is", true)
          .is("slug", null)
          .ilike("provider_name", `${namePrefix.replace(/-/g, "%")}%`)
          .limit(20);
        if (candidates) {
          for (const c of candidates) {
            const generatedSlug = generateProviderSlug(c.provider_name, c.state);
            if (generatedSlug === providerSlug) {
              iosProvider = { provider_id: c.provider_id, email: c.email, provider_name: c.provider_name };
              break;
            }
          }
        }
      }

      // If found in olera-providers, try to find linked business_profile
      if (iosProvider) {
        provider = await db
          .from("business_profiles")
          .select("id, display_name, email, source_provider_id, slug")
          .eq("source_provider_id", iosProvider.provider_id)
          .maybeSingle()
          .then(r => r.data);
      }
    }

    if (!provider && !iosProvider) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }

    // Use submitted email, or fall back to existing email on file
    const existingEmail = provider?.email || iosProvider?.email;
    const effectiveEmail = email || existingEmail;

    // Update email on whichever records we found (skip if unchanged)
    if (provider && provider.email !== effectiveEmail) {
      await db
        .from("business_profiles")
        .update({ email: effectiveEmail })
        .eq("id", provider.id);
    }

    const iosProviderId = provider?.source_provider_id || iosProvider?.provider_id;
    if (iosProviderId && iosProvider?.email !== effectiveEmail) {
      await db
        .from("olera-providers")
        .update({ email: effectiveEmail })
        .eq("provider_id", iosProviderId);
    }

    // Derive display name and ID from whichever record we found
    const displayName = provider?.display_name || iosProvider?.provider_name || providerSlug;
    const providerId = provider?.id || iosProviderId || providerSlug;

    // Find flagged questions for this provider (skip any already sent)
    const { data: flaggedQuestions } = await db
      .from("provider_questions")
      .select("id, question, asker_name, asker_email, metadata")
      .eq("provider_id", providerSlug)
      .contains("metadata", { needs_provider_email: true });

    let emailsSent = 0;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";

    if (flaggedQuestions && flaggedQuestions.length > 0) {
      for (const q of flaggedQuestions) {
        try {
          // Skip if this question was already emailed (e.g. via leads add-email)
          const meta = (q.metadata as Record<string, unknown>) || {};
          if (meta.email_sent_at) {
            delete meta.needs_provider_email;
            await db.from("provider_questions").update({ metadata: meta }).eq("id", q.id);
            continue;
          }

          const qaVariant = assignQuestionVariant();
          const qaInbox = questionReceivedInbox({
            providerName: displayName,
            question: q.question,
            variant: qaVariant,
          });
          const emailLogId = await reserveEmailLogId({
            to: effectiveEmail,
            subject: qaInbox.subject,
            emailType: "question_received",
            recipientType: "provider",
            providerId,
          });

          // Generate one-click URL with signed token for auto-sign-in
          let providerUrl: string;
          try {
            providerUrl = generateNotificationUrl(providerSlug, effectiveEmail, "question", q.id, siteUrl);
            providerUrl = appendTrackingParams(providerUrl, emailLogId);
          } catch {
            providerUrl = appendTrackingParams(`${siteUrl}/provider/${providerSlug}/onboard?action=question&actionId=${q.id}`, emailLogId);
          }

          await sendEmail({
            to: effectiveEmail,
            subject: qaInbox.subject,
            html: questionReceivedEmail({
              providerName: displayName,
              askerName: q.asker_name || "A family",
              question: q.question,
              providerUrl,
              providerSlug,
              preheader: qaInbox.preheader,
            }),
            emailType: "question_received",
            recipientType: "provider",
            providerId,
            emailLogId: emailLogId ?? undefined,
            metadata: { variant: qaVariant, phi_filtered: qaInbox.phiFiltered },
          });

          // Clear the flag
          delete meta.needs_provider_email;
          meta.email_sent_at = new Date().toISOString();
          await db
            .from("provider_questions")
            .update({ metadata: meta })
            .eq("id", q.id);

          emailsSent++;
        } catch (emailErr) {
          console.error(`Failed to send deferred question email for ${q.id}:`, emailErr);
        }
      }
    }

    // Cross-send: also send deferred lead notification emails for this provider
    let leadEmailsSent = 0;
    if (provider?.id) {
      const { data: flaggedConnections } = await db
        .from("connections")
        .select("id, message, metadata, from_profile:business_profiles!connections_from_profile_id_fkey(display_name)")
        .eq("to_profile_id", provider.id)
        .eq("status", "pending")
        .contains("metadata", { needs_provider_email: true });

      if (flaggedConnections && flaggedConnections.length > 0) {
        const careTypeMap: Record<string, string> = {
          home_care: "Home Care",
          home_health: "Home Health Care",
          assisted_living: "Assisted Living",
          memory_care: "Memory Care",
        };

        for (const conn of flaggedConnections) {
          try {
            // Skip if already sent (e.g. via leads add-email)
            const meta = (conn.metadata as Record<string, unknown>) || {};
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

            const emailSubject = `A family is looking for care from ${displayName}`;
            const emailLogId = await reserveEmailLogId({
              to: effectiveEmail,
              subject: emailSubject,
              emailType: "connection_request",
              recipientType: "provider",
              providerId,
            });

            // Generate one-click URL with signed token for auto-sign-in
            let viewUrl: string;
            try {
              viewUrl = generateNotificationUrl(providerSlug, effectiveEmail, "lead", conn.id, siteUrl);
              viewUrl = appendTrackingParams(viewUrl, emailLogId);
            } catch {
              viewUrl = appendTrackingParams(`${siteUrl}/provider/${providerSlug}/onboard?action=lead&actionId=${conn.id}`, emailLogId);
            }

            await sendEmail({
              to: effectiveEmail,
              subject: emailSubject,
              html: connectionRequestEmail({
                providerName: displayName,
                familyName,
                careType,
                message: additionalNotes,
                viewUrl,
                providerSlug,
              }),
              emailType: "connection_request",
              recipientType: "provider",
              providerId,
              emailLogId: emailLogId ?? undefined,
            });

            // Clear the flag
            delete meta.needs_provider_email;
            meta.email_sent_at = new Date().toISOString();
            await db
              .from("connections")
              .update({ metadata: meta })
              .eq("id", conn.id);

            leadEmailsSent++;
          } catch (emailErr) {
            console.error(`Failed to send deferred lead email for connection ${conn.id}:`, emailErr);
          }
        }
      }
    }

    await logAuditAction({
      adminUserId: adminUser.id,
      action: "add_provider_email_via_questions",
      targetType: provider ? "business_profile" : "olera_provider",
      targetId: providerId,
      details: {
        provider_name: displayName,
        provider_slug: providerSlug,
        email: effectiveEmail,
        previous_email: existingEmail || null,
        question_emails_sent: emailsSent,
        lead_emails_sent: leadEmailsSent,
      },
    });

    return NextResponse.json({
      success: true,
      emailsSent: emailsSent + leadEmailsSent,
    });
  } catch (err) {
    console.error("Add email (questions) error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
