import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/admin";
import { sendEmail, reserveEmailLogId, appendTrackingParams } from "@/lib/email";
import { staleConversationProviderEmail, staleConversationFamilyEmail, careUnsubscribeUrl } from "@/lib/email-templates";
import { withCronRun } from "@/lib/crons/run";
import { getSiteUrl } from "@/lib/site-url";
import { generateFamilyInboxUrl } from "@/lib/claim-tokens";

/**
 * GET /api/cron/conversation-stale
 *
 * Runs daily at 4 PM UTC. Nudges both parties when a conversation has gone
 * stale (5+ days since last message).
 *
 * Criteria:
 * - Connection type is 'inquiry' or 'request'
 * - Status is 'pending' or 'accepted'
 * - Thread has 2+ human messages (conversation started)
 * - Last human message is 5+ days old
 * - Connection was NOT nudged for staleness in the last 14 days
 */
export const maxDuration = 120;

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

type ThreadMessage = {
  from_profile_id: string;
  text?: string;
  created_at: string;
  is_auto_reply?: boolean;
};

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const { searchParams } = new URL(request.url);
  const querySecret = searchParams.get("secret");
  const dryRun = searchParams.get("dry_run") === "true";
  const limit = Math.min(500, parseInt(searchParams.get("limit") || "500", 10));
  const isAuthed =
    authHeader === `Bearer ${process.env.CRON_SECRET}` ||
    querySecret === process.env.CRON_SECRET;

  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return withCronRun("conversation-stale", async () => {
    const db = getServiceClient();
    const siteUrl = getSiteUrl();
    const now = Date.now();

    const counts = {
      connections_processed: 0,
      providers_nudged: 0,
      families_nudged: 0,
      skipped: 0,
      skipReasons: {
        no_thread: 0,
        not_stale: 0,
        recently_nudged: 0,
        no_email: 0,
        send_failed: 0,
      },
      dry_run: dryRun,
    };

    // Fetch active connections
    const { data: connections, error: fetchError } = await db
      .from("connections")
      .select(
        `
        id,
        type,
        from_profile_id,
        to_profile_id,
        metadata,
        from_profile:business_profiles!connections_from_profile_id_fkey(id, display_name, email, account_id, type, claim_token, slug),
        to_profile:business_profiles!connections_to_profile_id_fkey(id, display_name, email, account_id, type, claim_token, slug)
      `
      )
      .in("type", ["inquiry", "request"])
      .in("status", ["pending", "accepted"])
      .order("updated_at", { ascending: true })
      .limit(limit);

    if (fetchError) {
      console.error("[cron/conversation-stale] Fetch error:", fetchError);
      throw new Error(`Database error: ${fetchError.message}`);
    }

    if (!connections?.length) {
      return {
        ok: true,
        message: "No connections to process",
        ...counts,
      };
    }

    for (const conn of connections) {
      counts.connections_processed++;

      // Normalize joined relations
      const fromProfile = Array.isArray(conn.from_profile)
        ? conn.from_profile[0]
        : conn.from_profile;
      const toProfile = Array.isArray(conn.to_profile)
        ? conn.to_profile[0]
        : conn.to_profile;

      const meta = (conn.metadata as Record<string, unknown>) ?? {};
      const thread = (meta.thread as ThreadMessage[]) || [];

      // Filter to human messages only
      const humanMessages = thread.filter((m) => !m.is_auto_reply);
      if (humanMessages.length < 2) {
        counts.skipped++;
        counts.skipReasons.no_thread++;
        continue;
      }

      // Check if last message is 5+ days old
      const lastMessage = humanMessages[humanMessages.length - 1];
      const lastMessageTime = new Date(lastMessage.created_at).getTime();
      const timeSinceLastMessage = now - lastMessageTime;

      if (timeSinceLastMessage < FIVE_DAYS_MS) {
        counts.skipped++;
        counts.skipReasons.not_stale++;
        continue;
      }

      // Check cooldown (14 days per connection)
      const lastStaleNudge = meta.stale_conversation_nudged_at as string | undefined;
      if (lastStaleNudge) {
        const timeSinceNudge = now - new Date(lastStaleNudge).getTime();
        if (timeSinceNudge < FOURTEEN_DAYS_MS) {
          counts.skipped++;
          counts.skipReasons.recently_nudged++;
          continue;
        }
      }

      const daysSinceLastMessage = Math.floor(timeSinceLastMessage / (1000 * 60 * 60 * 24));

      // Determine family and provider based on connection type
      // inquiry: from=family, to=provider
      // request: from=provider, to=family
      const isInquiry = conn.type === "inquiry";
      const familyProfile = isInquiry ? fromProfile : toProfile;
      const providerProfile = isInquiry ? toProfile : fromProfile;

      const familyName = familyProfile?.display_name || "there";
      const providerName = providerProfile?.display_name || "A care provider";

      // Track if we sent at least one email for this connection
      let sentAny = false;

      // Send to provider
      let providerEmail = providerProfile?.email?.trim();
      if (!providerEmail && providerProfile?.account_id) {
        const { data: providerAccount } = await db
          .from("accounts")
          .select("user_id")
          .eq("id", providerProfile.account_id)
          .single();

        if (providerAccount?.user_id) {
          const { data: { user: authUser } } = await db.auth.admin.getUserById(providerAccount.user_id);
          providerEmail = authUser?.email;
        }
      }

      if (providerEmail && !dryRun) {
        const providerLogId = await reserveEmailLogId({
          to: providerEmail,
          subject: `Continue your conversation with ${familyName}?`,
          emailType: "stale_conversation",
          recipientType: "provider",
          providerId: providerProfile?.id,
          metadata: {
            connection_id: conn.id,
            nudged_by: "cron:conversation-stale",
            days_since_last_message: daysSinceLastMessage,
          },
        });

        // Build provider URL based on whether they've claimed their listing
        const isClaimed = !!providerProfile?.account_id;
        let providerViewUrl: string;

        if (isClaimed) {
          // Claimed provider → inbox with magic link
          const providerInboxPath = `/portal/inbox?role=provider&id=${conn.id}`;
          const trackedProviderDest = appendTrackingParams(providerInboxPath, providerLogId);
          providerViewUrl = `${siteUrl}${trackedProviderDest}`;

          try {
            const { data: linkData, error: linkError } = await db.auth.admin.generateLink({
              type: "magiclink",
              email: providerEmail,
              options: {
                redirectTo: `${siteUrl}/auth/magic-link?next=${encodeURIComponent(trackedProviderDest)}`,
              },
            });

            if (!linkError && linkData?.properties?.action_link) {
              providerViewUrl = linkData.properties.action_link;
            }
          } catch (linkErr) {
            console.error("[cron/conversation-stale] Provider magic link failed:", linkErr);
          }
        } else {
          // Unclaimed provider → onboard page to claim listing first
          const providerSlug = providerProfile?.slug || providerProfile?.id;
          const onboardPath = `/provider/${providerSlug}/onboard?action=message&actionId=${conn.id}`;
          const trackedOnboardDest = appendTrackingParams(onboardPath, providerLogId);
          providerViewUrl = `${siteUrl}${trackedOnboardDest}`;

          // Try to generate magic link for onboard page too
          try {
            const { data: linkData, error: linkError } = await db.auth.admin.generateLink({
              type: "magiclink",
              email: providerEmail,
              options: {
                redirectTo: `${siteUrl}/auth/magic-link?next=${encodeURIComponent(trackedOnboardDest)}`,
              },
            });

            if (!linkError && linkData?.properties?.action_link) {
              providerViewUrl = linkData.properties.action_link;
            }
          } catch (linkErr) {
            console.error("[cron/conversation-stale] Provider magic link failed:", linkErr);
          }
        }

        const { success: providerSuccess } = await sendEmail({
          to: providerEmail,
          subject: `Continue your conversation with ${familyName}?`,
          html: staleConversationProviderEmail({
            providerName,
            recipientName: providerName,
            familyName,
            daysSinceLastMessage,
            viewUrl: providerViewUrl,
          }),
          emailType: "stale_conversation",
          recipientType: "provider",
          providerId: providerProfile?.id,
          emailLogId: providerLogId ?? undefined,
          recipientProfileId: providerProfile?.id,
        });

        if (providerSuccess) {
          counts.providers_nudged++;
          sentAny = true;
        } else {
          counts.skipReasons.send_failed++;
        }
      } else if (!providerEmail) {
        counts.skipReasons.no_email++;
      }

      // Send to family
      let familyEmail = familyProfile?.email?.trim();
      if (!familyEmail && familyProfile?.account_id) {
        const { data: familyAccount } = await db
          .from("accounts")
          .select("user_id")
          .eq("id", familyProfile.account_id)
          .single();

        if (familyAccount?.user_id) {
          const { data: { user: authUser } } = await db.auth.admin.getUserById(familyAccount.user_id);
          familyEmail = authUser?.email;
        }
      }

      if (familyEmail && !dryRun) {
        const familyLogId = await reserveEmailLogId({
          to: familyEmail,
          subject: `Still looking for care? ${providerName} is here to help`,
          emailType: "stale_conversation",
          recipientType: "family",
          metadata: {
            connection_id: conn.id,
            nudged_by: "cron:conversation-stale",
            days_since_last_message: daysSinceLastMessage,
          },
        });

        // Build family inbox URL
        const familyInboxPath = `/portal/inbox?id=${conn.id}`;
        const trackedFamilyDest = appendTrackingParams(familyInboxPath, familyLogId);

        // Generate HMAC token URL for family inbox (72-hour expiry, more reliable than Supabase magic links)
        const familyViewUrl = generateFamilyInboxUrl(familyEmail, trackedFamilyDest, siteUrl);

        const { success: familySuccess } = await sendEmail({
          to: familyEmail,
          subject: `Still looking for care? ${providerName} is here to help`,
          html: staleConversationFamilyEmail({
            familyName,
            providerName,
            daysSinceLastMessage,
            viewUrl: familyViewUrl,
            unsubscribeId: familyProfile?.id,
          }),
          emailType: "stale_conversation",
          recipientType: "family",
          emailLogId: familyLogId ?? undefined,
          recipientProfileId: familyProfile?.id,
          listUnsubscribeUrl: familyProfile?.id ? careUnsubscribeUrl(familyProfile.id) : undefined,
        });

        if (familySuccess) {
          counts.families_nudged++;
          sentAny = true;
        } else {
          counts.skipReasons.send_failed++;
        }
      } else if (!familyEmail) {
        counts.skipReasons.no_email++;
      }

      // Update metadata if we sent at least one email
      if (sentAny) {
        const nudgedAt = new Date().toISOString();
        const { error: updateError } = await db
          .from("connections")
          .update({
            metadata: {
              ...meta,
              stale_conversation_nudged_at: nudgedAt,
              stale_conversation_nudged_by: "cron:conversation-stale",
              stale_conversation_nudge_count: ((meta.stale_conversation_nudge_count as number) || 0) + 1,
            },
          })
          .eq("id", conn.id);

        if (updateError) {
          console.error(
            `[cron/conversation-stale] Failed to update metadata for ${conn.id}:`,
            updateError
          );
        }
      }

      if (dryRun && (providerEmail || familyEmail)) {
        console.log(
          `[cron/conversation-stale] [DRY RUN] Would nudge conversation ${conn.id}: provider=${providerEmail || "none"}, family=${familyEmail || "none"}, days=${daysSinceLastMessage}`
        );
        if (providerEmail) counts.providers_nudged++;
        if (familyEmail) counts.families_nudged++;
      }
    }

    return {
      ok: true,
      ...counts,
    };
  });
}
