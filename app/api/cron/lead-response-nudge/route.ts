import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/admin";
import { sendEmail, reserveEmailLogId, appendTrackingParams } from "@/lib/email";
import { providerMultiLeadNudgeEmail } from "@/lib/email-templates";
import { withCronRun } from "@/lib/crons/run";
import { getSiteUrl } from "@/lib/site-url";

/**
 * GET /api/cron/lead-response-nudge
 *
 * Runs weekly on Thursday 2 PM UTC (~9 AM ET). Nudges providers who haven't
 * engaged with leads. Sends ONE consolidated email per provider listing all
 * their waiting leads.
 *
 * Criteria:
 * - Connection type is 'inquiry' (family→provider lead)
 * - Lead is at least 3 days old
 * - Provider has NOT engaged (no lead_opened, contact_revealed, phone_clicked,
 *   email_link_clicked, continue_in_inbox, or message response)
 * - Provider HAS an email address
 * - Provider was NOT nudged in the last 7 days (checked per connection)
 */

// Engagement events that indicate the provider has seen/acted on the lead
const ENGAGEMENT_EVENTS = [
  "lead_opened",
  "contact_revealed",
  "phone_clicked",
  "email_link_clicked",
  "continue_in_inbox",
] as const;
export const maxDuration = 120;

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

type ThreadMessage = {
  from_profile_id: string;
  text?: string;
  created_at: string;
  is_auto_reply?: boolean;
  type?: string;
};

interface EligibleLead {
  connectionId: string;
  familyName: string;
  daysSinceInquiry: number;
  metadata: Record<string, unknown>;
}

interface ProviderGroup {
  providerId: string;
  providerEmail: string;
  providerName: string;
  providerSlug: string;
  leads: EligibleLead[];
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const { searchParams } = new URL(request.url);
  const querySecret = searchParams.get("secret");
  const dryRun = searchParams.get("dry_run") === "true";
  const parsedLimit = parseInt(searchParams.get("limit") || "500", 10);
  const limit = Math.min(500, Number.isNaN(parsedLimit) ? 500 : parsedLimit);
  const isAuthed =
    authHeader === `Bearer ${process.env.CRON_SECRET}` ||
    querySecret === process.env.CRON_SECRET;

  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return withCronRun("lead-response-nudge", async () => {
    const db = getServiceClient();
    const siteUrl = getSiteUrl();
    const now = Date.now();
    const threeDaysAgo = new Date(now - THREE_DAYS_MS).toISOString();

    const counts = {
      connections_processed: 0,
      providers_nudged: 0,
      leads_included: 0,
      skipped: 0,
      skipReasons: {
        engaged: 0,        // Provider viewed lead, revealed contact, clicked phone/email, etc.
        responded: 0,      // Provider sent a message in the thread
        no_email: 0,
        recently_nudged: 0,
        send_failed: 0,
        admin_archived_provider: 0, // Admin archived the provider (no emails to them)
      },
      dry_run: dryRun,
    };

    // Fetch leads that are at least 3 days old
    // Only process "inquiry" connections (family→provider)
    // For "request" (Matches), the provider initiated so there's no response to wait for
    const { data: connections, error: fetchError } = await db
      .from("connections")
      .select(
        `
        id,
        from_profile_id,
        to_profile_id,
        metadata,
        created_at,
        from_profile:business_profiles!connections_from_profile_id_fkey(display_name),
        to_profile:business_profiles!connections_to_profile_id_fkey(id, display_name, slug, source_provider_id, email, metadata)
      `
      )
      .eq("type", "inquiry")
      .lte("created_at", threeDaysAgo)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (fetchError) {
      console.error("[cron/lead-response-nudge] Fetch error:", fetchError);
      throw new Error(`Database error: ${fetchError.message}`);
    }

    if (!connections?.length) {
      return {
        ok: true,
        message: "No leads to process",
        ...counts,
      };
    }

    // Collect all connection IDs to check for engagement events
    const allConnectionIds = connections.map((c) => c.id);

    // Query provider_activity for any engagement events on these connections
    // Note: lead_opened stores connection_id, other events store lead_id (both are conn.id)
    //
    // Scalability note: This fetches engagement events and filters in JS since we can't
    // easily filter by JSONB metadata values. Limit of 100k is a safety valve.
    // At very high scale, consider a DB index on metadata->>lead_id or junction table.
    const ENGAGEMENT_QUERY_LIMIT = 100000;
    const { data: engagementEvents, error: engagementError } = await db
      .from("provider_activity")
      .select("metadata")
      .in("event_type", ENGAGEMENT_EVENTS)
      .limit(ENGAGEMENT_QUERY_LIMIT);

    if (engagementEvents && engagementEvents.length >= ENGAGEMENT_QUERY_LIMIT) {
      console.warn(
        `[cron/lead-response-nudge] Hit engagement query limit (${ENGAGEMENT_QUERY_LIMIT}). ` +
        "Some engagement events may be missed. Consider optimizing the query."
      );
    }

    // Fail-closed: if we can't check engagement, don't send nudges (Rule #1 protection)
    if (engagementError) {
      console.error("[cron/lead-response-nudge] Engagement query failed:", engagementError);
      throw new Error(`Failed to check engagement events: ${engagementError.message}`);
    }

    // Build a Set of connection IDs that have been engaged with
    // Check both connection_id and lead_id since different events use different keys
    const engagedConnectionIds = new Set<string>();
    const connectionIdSet = new Set(allConnectionIds); // O(1) lookup instead of O(n)
    for (const event of engagementEvents || []) {
      const meta = event.metadata as Record<string, unknown>;
      const connId = (meta?.connection_id as string) || (meta?.lead_id as string);
      if (connId && connectionIdSet.has(connId)) {
        engagedConnectionIds.add(connId);
      }
    }

    // Group eligible leads by provider
    const providerGroups = new Map<string, ProviderGroup>();

    for (const conn of connections) {
      counts.connections_processed++;

      // Normalize joined relations
      const fromProfile = Array.isArray(conn.from_profile)
        ? conn.from_profile[0]
        : conn.from_profile;
      const toProfile = Array.isArray(conn.to_profile)
        ? conn.to_profile[0]
        : conn.to_profile;

      // Check if provider has engaged with this lead (viewed, revealed contact, etc.)
      if (engagedConnectionIds.has(conn.id)) {
        counts.skipped++;
        counts.skipReasons.engaged++;
        continue;
      }

      const meta = (conn.metadata as Record<string, unknown>) ?? {};
      const thread = (meta.thread as ThreadMessage[]) || [];

      // Check if provider has REALLY responded (non-auto, non-system, with actual text)
      // OR explicitly marked the lead as replied / already connected
      const hasThreadResponse = thread.some(
        (m) =>
          m.from_profile_id === conn.to_profile_id &&
          m.is_auto_reply !== true &&
          m.type !== "system" &&
          m.from_profile_id !== "system" &&
          !!m.text?.trim()
      );
      const providerResponded = hasThreadResponse;
      if (providerResponded) {
        counts.skipped++;
        counts.skipReasons.responded++;
        continue;
      }

      // Check if provider has email
      const providerEmail = toProfile?.email?.trim();
      if (!providerEmail) {
        counts.skipped++;
        counts.skipReasons.no_email++;
        continue;
      }

      // Check if provider is admin-archived (no emails sent to them)
      const toProfileMeta = (toProfile?.metadata as Record<string, unknown>) ?? {};
      if (toProfileMeta.admin_archived === true) {
        counts.skipped++;
        counts.skipReasons.admin_archived_provider = (counts.skipReasons.admin_archived_provider || 0) + 1;
        continue;
      }

      // Check cooldown (7 days per connection)
      const lastNudgedAt = meta.nudged_at as string | undefined;
      if (lastNudgedAt) {
        const timeSinceNudge = now - new Date(lastNudgedAt).getTime();
        if (timeSinceNudge < SEVEN_DAYS_MS) {
          counts.skipped++;
          counts.skipReasons.recently_nudged++;
          continue;
        }
      }

      // Calculate days since inquiry
      const daysSinceInquiry = Math.floor(
        (now - new Date(conn.created_at).getTime()) / (1000 * 60 * 60 * 24)
      );

      const providerId = conn.to_profile_id;
      const providerSlug = toProfile?.slug || toProfile?.source_provider_id || "";
      const providerName = toProfile?.display_name || "Your Organization";
      const familyName = fromProfile?.display_name || "A family";

      // Add to provider group
      if (!providerGroups.has(providerId)) {
        providerGroups.set(providerId, {
          providerId,
          providerEmail,
          providerName,
          providerSlug,
          leads: [],
        });
      }

      providerGroups.get(providerId)!.leads.push({
        connectionId: conn.id,
        familyName,
        daysSinceInquiry,
        metadata: meta,
      });
    }

    // Send one consolidated email per provider
    for (const [providerId, group] of providerGroups) {
      const leadCount = group.leads.length;

      if (dryRun) {
        console.log(
          `[cron/lead-response-nudge] [DRY RUN] Would send consolidated nudge to ${group.providerEmail} for ${leadCount} lead(s)`
        );
        counts.providers_nudged++;
        counts.leads_included += leadCount;
        continue;
      }

      // Build subject line
      const subject =
        leadCount === 1
          ? `${group.leads[0].familyName} is waiting for a response`
          : `${leadCount} families are waiting for a response`;

      // Reserve email log ID
      const emailLogId = await reserveEmailLogId({
        to: group.providerEmail,
        subject,
        emailType: "provider_nudge",
        recipientType: "provider",
        providerId: group.providerSlug,
        metadata: {
          connection_ids: group.leads.map((l) => l.connectionId),
          nudged_by: "cron:lead-response-nudge",
          lead_count: leadCount,
        },
      });

      // Build view URL
      const viewUrl = appendTrackingParams(`${siteUrl}/provider/connections`, emailLogId);

      // Build consolidated email
      const html = providerMultiLeadNudgeEmail({
        providerName: group.providerName,
        leads: group.leads.map((l) => ({
          familyName: l.familyName,
          daysSinceInquiry: l.daysSinceInquiry,
        })),
        viewUrl,
        providerSlug: group.providerSlug,
      });

      // Send email
      const { success, error: sendError } = await sendEmail({
        to: group.providerEmail,
        subject,
        html,
        emailType: "provider_nudge",
        recipientType: "provider",
        providerId: group.providerSlug,
        metadata: {
          connection_ids: group.leads.map((l) => l.connectionId),
          nudged_by: "cron:lead-response-nudge",
          lead_count: leadCount,
        },
        emailLogId: emailLogId ?? undefined,
      });

      if (!success) {
        console.error(
          `[cron/lead-response-nudge] Send failed for provider ${providerId}:`,
          sendError
        );
        counts.skipped += leadCount;
        counts.skipReasons.send_failed += leadCount;
        continue;
      }

      // Update metadata for all connections in this batch
      const nudgedAt = new Date().toISOString();
      for (const lead of group.leads) {
        const updatedMeta = {
          ...lead.metadata,
          nudged_at: nudgedAt,
          nudged_by: "cron:lead-response-nudge",
          nudge_count: ((lead.metadata.nudge_count as number) || 0) + 1,
        };

        const { error: updateError } = await db
          .from("connections")
          .update({ metadata: updatedMeta })
          .eq("id", lead.connectionId);

        if (updateError) {
          console.error(
            `[cron/lead-response-nudge] Failed to update metadata for ${lead.connectionId}:`,
            updateError
          );
        }
      }

      counts.providers_nudged++;
      counts.leads_included += leadCount;
    }

    return {
      ok: true,
      ...counts,
    };
  });
}
