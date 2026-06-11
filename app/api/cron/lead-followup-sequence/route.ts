import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/admin";
import { resolveCanonicalProviderId } from "@/lib/provider-identity";
import { sendEmail, reserveEmailLogId, appendTrackingParams } from "@/lib/email";
import {
  providerFollowupDay1Email,
  providerFollowupDay1NotViewedEmail,
  providerFollowupDay1ViewedEmail,
  providerFollowupDay3Email,
  providerFollowupDay6Email,
} from "@/lib/email-templates";
import { withCronRun } from "@/lib/crons/run";
import { getSiteUrl } from "@/lib/site-url";
import { generateLeadClaimUrl, generateProviderPortalUrl } from "@/lib/claim-tokens";
import { parseAdminOverride } from "@/lib/connection-engagement";

// Valid archive reasons from provider portal
const VALID_ARCHIVE_REASONS = ["not_a_fit", "not_accepting_clients", "unable_to_reach", "other"] as const;
type ArchiveReason = typeof VALID_ARCHIVE_REASONS[number];

function parseArchiveReason(value: unknown): ArchiveReason | null {
  if (typeof value !== "string") return null;
  return VALID_ARCHIVE_REASONS.includes(value as ArchiveReason) ? (value as ArchiveReason) : null;
}

/**
 * GET /api/cron/lead-followup-sequence
 *
 * Runs daily at 14:00 UTC (~9 AM ET). Multi-stage follow-up sequence for
 * provider leads that haven't connected.
 *
 * Sequence (compressed — only 3 follow-ups):
 * - Day 0: Initial email (connectionRequestEmail — sent elsewhere)
 * - Day 1: Follow-up #1 — "In case it got buried" (stage 1)
 * - Day 3: Follow-up #2 — "Still waiting, replying is effortless" (stage 2)
 * - Day 5: Follow-up #3 — "One last note" (stage 3, FINAL EMAIL)
 *
 * After Day 5, no more automated emails are sent. Providers with no activity
 * for 10+ days show in "Needs Follow-up" tab for manual intervention.
 *
 * STOP CONDITION: Sequence stops only when provider CONNECTS (not just views):
 *   - Copies phone number (phone_clicked)
 *   - Copies email (email_link_clicked)
 *   - Sends a message to family
 *   - Marks lead as "Replied"
 *   - Archives the lead in their portal
 *
 * Viewing alone (opening drawer) does NOT stop the sequence.
 */

// Connection events from provider_activity that indicate provider reached out
// NOTE: lead_opened and contact_revealed are NOT here — viewing/engaging doesn't stop sequence
const CONNECTION_EVENTS = [
  "phone_clicked",
  "email_link_clicked",
] as const;

export const maxDuration = 120;

// Stage thresholds in days since inquiry (compressed sequence — stops at Day 5)
const STAGE_THRESHOLDS = {
  1: 1,   // Day 1-2 → Stage 1
  2: 3,   // Day 3-4 → Stage 2
  3: 5,   // Day 5+ → Stage 3 (FINAL EMAIL)
} as const;

type FollowupStage = 0 | 1 | 2 | 3;

interface FollowupMetadata {
  followup_stage?: FollowupStage;
  followup_sent_at?: string | null;
  followup_sent_by?: string;
  followup_stopped_at?: string | null;
  followup_stopped_reason?: "connected" | "responded" | "admin_marked_connected" | null;
  thread?: ThreadMessage[];
}

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
  careType: string | null;
  city: string | null;
  careRecipient: string | null;
  daysSinceInquiry: number;
  expectedStage: FollowupStage;
  metadata: FollowupMetadata & Record<string, unknown>;
}

interface ProviderGroup {
  providerId: string;
  providerEmail: string;
  providerName: string;
  providerSlug: string;
  providerKey: string; // canonical olera-providers.slug for email_log.provider_id (frequency gate + dashboard)
  leads: EligibleLead[];
}

/**
 * Calculate expected stage based on days since inquiry.
 * Caps at stage 3 (Day 5) — sequence ends after final email.
 */
function calculateExpectedStage(days: number): FollowupStage {
  if (days >= STAGE_THRESHOLDS[3]) return 3;
  if (days >= STAGE_THRESHOLDS[2]) return 2;
  if (days >= STAGE_THRESHOLDS[1]) return 1;
  return 0;
}

/**
 * Get email type for logging based on stage.
 */
function getEmailTypeForStage(stage: FollowupStage): string {
  switch (stage) {
    case 1: return "provider_followup_day1";
    case 2: return "provider_followup_day3";
    case 3: return "provider_followup_day6";
    default: return "provider_followup";
  }
}

/**
 * Get subject line for stage with fallback for missing family name.
 * For stage 1, requires hasViewed parameter to determine variant.
 */
function getSubjectForStage(
  stage: FollowupStage,
  familyName: string | null,
  leadCount: number,
  hasViewed?: boolean
): string {
  const hasName = familyName && familyName.length > 0 && familyName.toLowerCase() !== "a family";

  if (leadCount > 1) {
    // Multiple leads — use generic subjects
    switch (stage) {
      case 1:
        // Day 1 variants based on viewing status
        if (hasViewed) {
          return `Still deciding on these ${leadCount} requests?`;
        }
        return `${leadCount} families picked your team`;
      case 2: return `${leadCount} families are still hoping to hear from you`;
      case 3: return "One last note about these requests";
      default: return "Families are waiting for your response";
    }
  }

  // Single lead
  switch (stage) {
    case 1:
      // Day 1 variants based on viewing status
      if (hasViewed) {
        return hasName ? `Still deciding on ${familyName}?` : "Still deciding on this request?";
      }
      return hasName ? `${familyName} picked your team` : "A family picked your team";
    case 2:
      return hasName ? `${familyName} is still hoping to hear from you` : "A family is still hoping to hear from you";
    case 3:
      return hasName ? `One last note about ${familyName}` : "One last note about the family";
    default:
      return hasName ? `${familyName} is waiting for a response` : "A family is waiting for a response";
  }
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const { searchParams } = new URL(request.url);
  const querySecret = searchParams.get("secret");
  const dryRun = searchParams.get("dry_run") === "true";
  const parsedLimit = parseInt(searchParams.get("limit") || "500", 10);
  const limit = Math.min(500, Number.isNaN(parsedLimit) ? 500 : parsedLimit);
  // One-time blast: send Day 17 email to all stuck providers regardless of stage
  const forceStuckReengagement = searchParams.get("force_stuck_reengagement") === "true";
  const isAuthed =
    authHeader === `Bearer ${process.env.CRON_SECRET}` ||
    querySecret === process.env.CRON_SECRET;

  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return withCronRun("lead-followup-sequence", async () => {
    const db = getServiceClient();
    const siteUrl = getSiteUrl();
    const now = Date.now();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();

    const counts = {
      connections_processed: 0,
      providers_emailed: 0,
      leads_included: 0,
      skipped: 0,
      skipReasons: {
        connected: 0,  // Provider clicked phone/email
        responded: 0,  // Provider sent message, marked replied, or already connected
        no_email: 0,
        already_at_stage: 0,
        sequence_stopped: 0,
        send_failed: 0,
        nudge_cap: 0, // Frequency gate held this stage — provider over the weekly nudge budget
        admin_marked_connected: 0, // Admin verified provider connected off-platform
        provider_archived: 0, // Provider archived lead in their portal (not a fit, not taking clients, etc.)
      },
      dry_run: dryRun,
    };

    if (forceStuckReengagement) {
      console.log("[cron/lead-followup-sequence] Running in FORCE STUCK REENGAGEMENT mode");
    }

    // Fetch leads that are at least 1 day old and haven't completed the sequence
    // Only process "inquiry" connections (family→provider)
    // Note: care_recipient is in family's metadata.relationship_to_recipient, city comes from provider
    const { data: connections, error: fetchError } = await db
      .from("connections")
      .select(
        `
        id,
        from_profile_id,
        to_profile_id,
        metadata,
        created_at,
        from_profile:business_profiles!connections_from_profile_id_fkey(display_name, care_types, metadata),
        to_profile:business_profiles!connections_to_profile_id_fkey(id, display_name, slug, source_provider_id, email, city)
      `
      )
      .eq("type", "inquiry")
      .lte("created_at", oneDayAgo)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (fetchError) {
      console.error("[cron/lead-followup-sequence] Fetch error:", fetchError);
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

    // Also collect provider keys (slug/source_provider_id/id) for provider-level engagement
    // This catches multi-lead emails where connection_id is null in events
    const providerKeyMap = new Map<string, Set<string>>(); // provider_key -> connection_ids
    for (const conn of connections) {
      const toProfile = Array.isArray(conn.to_profile) ? conn.to_profile[0] : conn.to_profile;
      const keys = [
        toProfile?.slug,
        toProfile?.source_provider_id,
        toProfile?.id,
      ].filter(Boolean) as string[];
      for (const key of keys) {
        if (!providerKeyMap.has(key)) providerKeyMap.set(key, new Set());
        providerKeyMap.get(key)!.add(conn.id);
      }
    }
    const allProviderKeys = [...providerKeyMap.keys()];

    // Query provider_activity for connection events (phone/email clicks)
    // FAIL-CLOSED: if we can't check, don't send (Rule #1 protection)
    // NOTE: We do NOT query lead_opened or contact_revealed — viewing/engaging doesn't stop sequence
    const CONNECTION_QUERY_LIMIT = 100000;
    const { data: connectionEvents, error: connectionError } = await db
      .from("provider_activity")
      .select("provider_id, event_type, metadata")
      .in("event_type", CONNECTION_EVENTS)
      .limit(CONNECTION_QUERY_LIMIT);

    if (connectionEvents && connectionEvents.length >= CONNECTION_QUERY_LIMIT) {
      console.warn(
        `[cron/lead-followup-sequence] Hit connection query limit (${CONNECTION_QUERY_LIMIT}). ` +
        "Some connection events may be missed. Consider optimizing the query."
      );
    }

    if (connectionError) {
      console.error("[cron/lead-followup-sequence] Connection query failed:", connectionError);
      throw new Error(`Failed to check connection events: ${connectionError.message}`);
    }

    // Build a Set of connection IDs where provider has connected (clicked phone/email)
    const connectedConnectionIds = new Set<string>();
    const connectionIdSet = new Set(allConnectionIds);

    for (const event of connectionEvents || []) {
      const meta = event.metadata as Record<string, unknown>;
      const connId = (meta?.connection_id as string) || (meta?.lead_id as string);

      // Match by connection_id if available
      if (connId && connectionIdSet.has(connId)) {
        connectedConnectionIds.add(connId);
      }
    }

    // Query for lead_opened events to determine Day 1 email variant
    // This determines whether provider has VIEWED the lead (not connected, just opened)
    const { data: viewedEvents, error: viewedError } = await db
      .from("provider_activity")
      .select("provider_id, event_type, metadata")
      .eq("event_type", "lead_opened")
      .limit(CONNECTION_QUERY_LIMIT);

    if (viewedEvents && viewedEvents.length >= CONNECTION_QUERY_LIMIT) {
      console.warn(
        `[cron/lead-followup-sequence] Hit lead_opened query limit (${CONNECTION_QUERY_LIMIT}). ` +
        "Some viewing events may be missed. Day 1 emails may incorrectly use not-viewed variant."
      );
    }

    if (viewedError) {
      console.error("[cron/lead-followup-sequence] lead_opened query failed:", viewedError);
      // Non-fatal: fall back to not-viewed variant if query fails
      // This is a fail-safe to ensure nudges are sent rather than completely failing
    }

    // Build a Set of connection IDs where provider has viewed the lead
    const viewedConnectionIds = new Set<string>();
    for (const event of viewedEvents || []) {
      const meta = event.metadata as Record<string, unknown>;
      const connId = (meta?.connection_id as string) || (meta?.lead_id as string);

      if (connId && connectionIdSet.has(connId)) {
        viewedConnectionIds.add(connId);
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

      const meta = (conn.metadata as FollowupMetadata & Record<string, unknown>) ?? {};

      // FORCE STUCK REENGAGEMENT MODE: Obsolete after stuck/needs_call merge
      // The forceStuckReengagement parameter is no longer functional since "stuck"
      // was merged into "needs_follow_up" engagement level
      if (forceStuckReengagement) {
        // Skip all connections in force mode since "stuck" stop reason no longer exists
        counts.skipped++;
        counts.skipReasons.sequence_stopped++;
        continue;
      }

      // Check if sequence was already stopped for a REAL connection
      // Skip if stopped for actual connection ("connected", "responded") or admin verification
      const stopReason = meta.followup_stopped_reason;
      const isRealStop = stopReason === "connected" || stopReason === "responded" || stopReason === "admin_marked_connected";
      if (meta.followup_stopped_at && isRealStop) {
        counts.skipped++;
        counts.skipReasons.sequence_stopped++;
        continue;
      }

      // Check if admin manually marked this connection (verified off-platform activity)
      const adminOverride = meta.admin_override ? parseAdminOverride(meta.admin_override) : null;
      if (adminOverride?.status === "connected") {
        // Admin verified provider connected - stop sequence
        counts.skipped++;
        counts.skipReasons.admin_marked_connected = (counts.skipReasons.admin_marked_connected || 0) + 1;
        continue;
      }

      // Check if provider archived this lead in their portal
      const isArchived = meta.archived === true;
      if (isArchived) {
        // Provider explicitly archived - respect their decision and stop sequence
        // Archive state alone is sufficient (don't require valid reason for robustness)
        const archiveReason = parseArchiveReason(meta.archive_reason);
        if (!archiveReason) {
          console.warn(`[sequence] Archived connection ${conn.id} missing valid archive_reason`);
        }
        counts.skipped++;
        counts.skipReasons.provider_archived = (counts.skipReasons.provider_archived || 0) + 1;
        continue;
      }

      // Check if provider has connected via phone/email click
      const hasClickedContact = connectedConnectionIds.has(conn.id);

      if (hasClickedContact) {
        // Mark as connected and stop sequence
        if (!dryRun) {
          const updatedMeta = {
            ...meta,
            followup_stopped_at: new Date().toISOString(),
            followup_stopped_reason: "connected" as const,
          };
          await db
            .from("connections")
            .update({ metadata: updatedMeta })
            .eq("id", conn.id);
        }
        counts.skipped++;
        counts.skipReasons.connected++;
        continue;
      }

      const thread = meta.thread || [];

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
        // Mark as responded and stop sequence
        if (!dryRun) {
          const updatedMeta = {
            ...meta,
            followup_stopped_at: new Date().toISOString(),
            followup_stopped_reason: "responded" as const,
          };
          await db
            .from("connections")
            .update({ metadata: updatedMeta })
            .eq("id", conn.id);
        }
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

      // Calculate days since sequence started (Day 0 email sent)
      // Use email_sent_at if present (for providers who got email added later)
      // Otherwise fall back to connection creation date
      const sequenceStartDate = (meta.email_sent_at as string) || conn.created_at;
      const daysSinceInquiry = Math.floor(
        (now - new Date(sequenceStartDate).getTime()) / (1000 * 60 * 60 * 24)
      );
      const currentStage = meta.followup_stage ?? 0;

      // Calculate expected stage based on days
      const expectedStage = calculateExpectedStage(daysSinceInquiry);

      // Cap at stage 3 (terminal) — sequence ends after Day 5 email
      // No resurrection of very old leads
      if (daysSinceInquiry > 30 && currentStage >= 3) {
        counts.skipped++;
        counts.skipReasons.already_at_stage++;
        continue;
      }

      // Skip if already at or past expected stage
      if (currentStage >= expectedStage) {
        counts.skipped++;
        counts.skipReasons.already_at_stage++;
        continue;
      }

      // providerId: UUID — used only to GROUP a provider's leads in this run (dedup key).
      // providerSlug: slug/source_provider_id/id — for URL / claim-token generation.
      // providerKey (below): the canonical olera-providers.slug stamped on email_log.provider_id, so
      // this sender's rows aggregate with the digest + dashboard instead of fragmenting. (Reconciled
      // with #1000 — UUID can't be canonical: unclaimed providers have none. See lib/provider-identity.)
      const providerId = conn.to_profile_id; // UUID - grouping key only
      const providerSlug = toProfile?.slug || toProfile?.source_provider_id || toProfile?.id || ""; // For URLs
      const providerName = toProfile?.display_name || "Your Organization";

      // Extract family info with fallbacks
      const familyName = fromProfile?.display_name || "A family";
      const careTypes = fromProfile?.care_types as string[] | null;
      const careType = careTypes?.[0] || null;

      // City comes from the provider's profile (same as connectionRequestEmail)
      const city = (toProfile?.city as string) || null;

      // Care recipient is stored in family's metadata.relationship_to_recipient
      // Map internal values to display format (matching connectionRequestEmail pattern)
      const familyMeta = (fromProfile?.metadata as Record<string, unknown>) || {};
      const relationshipRaw = familyMeta.relationship_to_recipient as string | undefined;
      const careRecipientMap: Record<string, string | null> = {
        parent: "their parent",
        spouse: "their spouse",
        grandparent: "their grandparent",
        myself: "themselves",
        other: null, // Don't display generic "other"
      };
      const careRecipient = relationshipRaw
        ? (careRecipientMap[relationshipRaw] !== undefined ? careRecipientMap[relationshipRaw] : null)
        : null;

      // Add to provider group
      if (!providerGroups.has(providerId)) {
        const providerKey =
          (await resolveCanonicalProviderId(db, {
            sourceProviderId: toProfile?.source_provider_id,
            profileSlug: providerSlug,
          })) ?? providerSlug;
        providerGroups.set(providerId, {
          providerId,
          providerEmail,
          providerName,
          providerSlug,
          providerKey,
          leads: [],
        });
      }

      providerGroups.get(providerId)!.leads.push({
        connectionId: conn.id,
        familyName,
        careType,
        city,
        careRecipient,
        daysSinceInquiry,
        expectedStage,
        metadata: meta,
      });
    }

    // Process each provider group
    for (const [providerId, group] of providerGroups) {
      // Find the oldest lead's expected stage — determines template
      const oldestLead = group.leads.reduce((oldest, lead) =>
        lead.expectedStage > oldest.expectedStage ? lead : oldest
      , group.leads[0]);

      const templateStage = oldestLead.expectedStage;
      const leadCount = group.leads.length;

      if (dryRun) {
        console.log(
          `[cron/lead-followup-sequence] [DRY RUN] Would send stage ${templateStage} email to ${group.providerEmail} for ${leadCount} lead(s)`
        );
        counts.providers_emailed++;
        counts.leads_included += leadCount;
        continue;
      }

      // For Day 1 emails, check if provider has viewed ANY of the leads in this batch
      // This determines which variant to send (viewed vs not-viewed)
      // Also track HOW MANY were viewed for accurate copy
      let hasViewedAnyLead: boolean | undefined = undefined;
      let viewedCount = 0;
      if (templateStage === 1) {
        viewedCount = group.leads.filter((lead) =>
          viewedConnectionIds.has(lead.connectionId)
        ).length;
        hasViewedAnyLead = viewedCount > 0;
      }

      // Build subject line
      const primaryFamilyName = oldestLead.familyName;
      const subject = getSubjectForStage(templateStage, primaryFamilyName, leadCount, hasViewedAnyLead);
      const emailType = getEmailTypeForStage(templateStage);

      // Reserve email log ID (canonical slug — see providerKey)
      const emailLogId = await reserveEmailLogId({
        to: group.providerEmail,
        subject,
        emailType,
        recipientType: "provider",
        providerId: group.providerKey,
        metadata: {
          connection_ids: group.leads.map((l) => l.connectionId),
          followup_stage: templateStage,
          sent_by: "cron:lead-followup-sequence",
          lead_count: leadCount,
        },
      });

      // Build view URL with signed token for one-click access
      // Uses /api/claim-lead which handles server-side auth and redirects to connections
      // For single lead: include connectionId to highlight that specific lead
      // For multiple leads: no connectionId, lands on list view
      const primaryConnectionId = leadCount === 1 ? group.leads[0].connectionId : null;
      const claimUrl = generateLeadClaimUrl(
        group.providerSlug,
        group.providerEmail,
        primaryConnectionId,
        siteUrl
      );
      const viewUrl = appendTrackingParams(claimUrl, emailLogId);

      // Build email HTML based on stage
      const leadsForTemplate = group.leads.map((l) => ({
        familyName: l.familyName,
        daysSinceInquiry: l.daysSinceInquiry,
        careType: l.careType,
        city: l.city,
        careRecipient: l.careRecipient,
      }));

      // Generate magic link URLs for footer
      const manageListingUrl = generateProviderPortalUrl(
        group.providerSlug,
        group.providerEmail,
        "manage",
        siteUrl
      );
      const settingsUrl = generateProviderPortalUrl(
        group.providerSlug,
        group.providerEmail,
        "settings",
        siteUrl
      );

      let html: string;
      const templateOpts = {
        providerName: group.providerName,
        leads: leadsForTemplate,
        viewUrl,
        providerSlug: group.providerSlug,
        manageListingUrl,
        settingsUrl,
      };

      switch (templateStage) {
        case 1:
          // Route to appropriate Day 1 variant based on viewing status
          if (hasViewedAnyLead) {
            html = providerFollowupDay1ViewedEmail({
              ...templateOpts,
              viewedCount, // Pass count for accurate "opened X of these requests" copy
            });
          } else {
            html = providerFollowupDay1NotViewedEmail(templateOpts);
          }
          break;
        case 2:
          html = providerFollowupDay3Email(templateOpts);
          break;
        case 3:
          html = providerFollowupDay6Email(templateOpts);
          break;
        default:
          console.error(`[cron/lead-followup-sequence] Unexpected stage ${templateStage}`);
          continue;
      }

      // Send email
      const { success, skipped, skipReason, error: sendError } = await sendEmail({
        to: group.providerEmail,
        subject,
        html,
        emailType,
        recipientType: "provider",
        providerId: group.providerKey,
        metadata: {
          connection_ids: group.leads.map((l) => l.connectionId),
          followup_stage: templateStage,
          sent_by: "cron:lead-followup-sequence",
          lead_count: leadCount,
        },
        emailLogId: emailLogId ?? undefined,
      });

      if (!success) {
        console.error(
          `[cron/lead-followup-sequence] Send failed for provider ${providerId}:`,
          sendError
        );
        counts.skipped += leadCount;
        counts.skipReasons.send_failed += leadCount;
        continue;
      }

      // Frequency gate held this nudge: do NOT advance followup_stage, so the sequence resumes from
      // the same stage on a later run once the provider's nudge budget frees up. (Other skips — bounce
      // suppression, preference — fall through and advance, matching prior behavior, so a dead address
      // isn't retried forever.)
      if (skipped && skipReason === "nudge_cap") {
        counts.skipped += leadCount;
        counts.skipReasons.nudge_cap += leadCount;
        continue;
      }

      // Update metadata for all connections in this batch
      const sentAt = new Date().toISOString();
      for (const lead of group.leads) {
        const updatedMeta: Record<string, unknown> = {
          ...lead.metadata,
          followup_stage: templateStage as FollowupStage,
          followup_sent_at: sentAt,
          followup_sent_by: "cron:lead-followup-sequence",
          // Increment nudge_count for backwards compatibility with admin panel display
          nudge_count: ((lead.metadata.nudge_count as number) || 0) + 1,
          nudged_at: sentAt,
        };

        const { error: updateError } = await db
          .from("connections")
          .update({ metadata: updatedMeta })
          .eq("id", lead.connectionId);

        if (updateError) {
          console.error(
            `[cron/lead-followup-sequence] Failed to update metadata for ${lead.connectionId}:`,
            updateError
          );
        }
      }

      counts.providers_emailed++;
      counts.leads_included += leadCount;
    }

    return {
      ok: true,
      ...counts,
    };
  });
}
