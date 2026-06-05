import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/admin";
import { sendEmail, reserveEmailLogId, appendTrackingParams } from "@/lib/email";
import {
  providerFollowupDay1Email,
  providerFollowupDay3Email,
  providerFollowupDay6Email,
  providerFollowupDay10Email,
  providerFollowupDay17Email,
} from "@/lib/email-templates";
import { withCronRun } from "@/lib/crons/run";
import { getSiteUrl } from "@/lib/site-url";
import { generateLeadClaimUrl, generateProviderPortalUrl } from "@/lib/claim-tokens";

/**
 * GET /api/cron/lead-followup-sequence
 *
 * Runs daily at 14:00 UTC (~9 AM ET). Multi-stage follow-up sequence for
 * provider leads that haven't been viewed.
 *
 * Sequence:
 * - Day 0: Initial email (connectionRequestEmail — sent elsewhere)
 * - Day 1: Follow-up #1 — "In case it got buried" (stage 1)
 * - Day 3: Follow-up #2 — "Still waiting, replying is effortless" (stage 2)
 * - Day 6: Follow-up #3 — "She's deciding, may go elsewhere" (stage 3, HEAVY signature)
 * - Day 10: Final message — "Graceful last call" (stage 4)
 * - Day 14: Mark as "Stuck" — no email, awaiting re-engagement (stage 5)
 * - Day 17: Re-engagement email — "One more try" (stage 6, template pending)
 * - Day 24: Mark as "Needs Call" — no email, requires manual call (stage 7)
 *
 * STOP CONDITION: Sequence stops the moment provider VIEWS the lead (lead_opened event)
 * or takes any engagement action.
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

// Stage thresholds in days since inquiry
const STAGE_THRESHOLDS = {
  1: 1,   // Day 1-2 → Stage 1
  2: 3,   // Day 3-5 → Stage 2
  3: 6,   // Day 6-9 → Stage 3
  4: 10,  // Day 10-13 → Stage 4
  5: 14,  // Day 14-16 → Stage 5 (stuck)
  6: 17,  // Day 17-23 → Stage 6 (re-engagement email, template pending)
  7: 24,  // Day 24+ → Stage 7 (needs_call — manual intervention)
} as const;

type FollowupStage = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

interface FollowupMetadata {
  followup_stage?: FollowupStage;
  followup_sent_at?: string | null;
  followup_sent_by?: string;
  followup_stopped_at?: string | null;
  followup_stopped_reason?: "engaged" | "responded" | "stuck" | "needs_call" | null;
  needs_call?: boolean;
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
  leads: EligibleLead[];
}

/**
 * Calculate expected stage based on days since inquiry.
 */
function calculateExpectedStage(days: number): FollowupStage {
  if (days >= STAGE_THRESHOLDS[7]) return 7;
  if (days >= STAGE_THRESHOLDS[6]) return 6;
  if (days >= STAGE_THRESHOLDS[5]) return 5;
  if (days >= STAGE_THRESHOLDS[4]) return 4;
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
    case 4: return "provider_followup_day10";
    case 6: return "provider_followup_day17";
    default: return "provider_followup";
  }
}

/**
 * Get subject line for stage with fallback for missing family name.
 */
function getSubjectForStage(stage: FollowupStage, familyName: string | null, leadCount: number): string {
  const hasName = familyName && familyName.length > 0 && familyName.toLowerCase() !== "a family";

  if (leadCount > 1) {
    // Multiple leads — use generic subjects
    switch (stage) {
      case 1: return `Did you see these ${leadCount} care requests?`;
      case 2: return `${leadCount} families are still hoping to hear from you`;
      case 3: return `These families may be choosing a provider soon`;
      case 4: return "We'll close these introductions soon";
      case 6: return "One last note about these requests";
      default: return "Families are waiting for your response";
    }
  }

  // Single lead
  switch (stage) {
    case 1:
      return hasName ? `Did you see ${familyName}'s request?` : "Did you see this care request?";
    case 2:
      return hasName ? `${familyName} is still hoping to hear from you` : "A family is still hoping to hear from you";
    case 3:
      return hasName ? `${familyName} may be choosing a provider soon` : "A family may be choosing a provider soon";
    case 4:
      return "We'll close this introduction soon";
    case 6:
      return hasName ? `One last note about ${familyName}'s request` : "One last note about this family's request";
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
      leads_marked_stuck: 0,
      leads_marked_needs_call: 0,
      skipped: 0,
      skipReasons: {
        engaged: 0,
        responded: 0,
        no_email: 0,
        already_at_stage: 0,
        sequence_stopped: 0,
        send_failed: 0,
        not_stuck: 0, // For force_stuck_reengagement mode
      },
      dry_run: dryRun,
      force_stuck_reengagement: forceStuckReengagement,
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

    // Query provider_activity for any engagement events on these connections
    // FAIL-CLOSED: if we can't check engagement, don't send (Rule #1 protection)
    // Include one_click_access to catch multi-lead email clicks (where connection_id is null)
    const ENGAGEMENT_QUERY_LIMIT = 100000;
    const allEngagementEvents = [...ENGAGEMENT_EVENTS, "one_click_access"] as const;
    const { data: engagementEvents, error: engagementError } = await db
      .from("provider_activity")
      .select("provider_id, event_type, metadata")
      .in("event_type", allEngagementEvents)
      .limit(ENGAGEMENT_QUERY_LIMIT);

    if (engagementEvents && engagementEvents.length >= ENGAGEMENT_QUERY_LIMIT) {
      console.warn(
        `[cron/lead-followup-sequence] Hit engagement query limit (${ENGAGEMENT_QUERY_LIMIT}). ` +
        "Some engagement events may be missed. Consider optimizing the query."
      );
    }

    if (engagementError) {
      console.error("[cron/lead-followup-sequence] Engagement query failed:", engagementError);
      throw new Error(`Failed to check engagement events: ${engagementError.message}`);
    }

    // Build a Set of connection IDs that have been engaged with
    const engagedConnectionIds = new Set<string>();
    const connectionIdSet = new Set(allConnectionIds);
    // Also track engaged PROVIDERS (catches multi-lead email clicks)
    const engagedProviderIds = new Set<string>();

    for (const event of engagementEvents || []) {
      const meta = event.metadata as Record<string, unknown>;
      const connId = (meta?.connection_id as string) || (meta?.lead_id as string);

      // Match by connection_id if available
      if (connId && connectionIdSet.has(connId)) {
        engagedConnectionIds.add(connId);
      }

      // For one_click_access and lead_opened, also track the provider as engaged
      // This catches multi-lead emails where connection_id is null
      if ((event.event_type === "one_click_access" || event.event_type === "lead_opened") && event.provider_id) {
        if (allProviderKeys.includes(event.provider_id)) {
          engagedProviderIds.add(event.provider_id);
        }
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

      // FORCE STUCK REENGAGEMENT MODE: Only process connections that are currently stuck
      // This is used for one-time blast to all stuck providers
      if (forceStuckReengagement) {
        if (meta.followup_stopped_reason !== "stuck") {
          counts.skipped++;
          counts.skipReasons.not_stuck++;
          continue;
        }
        // In force mode, we don't skip based on followup_stopped_at
        // because we explicitly want to re-engage stuck connections
      } else {
        // NORMAL MODE: Check if sequence was already stopped
        // Only skip if stopped for engagement/response (success cases) or needs_call (terminal)
        // Don't skip if stopped_reason is "stuck" — allow progression to stages 6/7
        if (meta.followup_stopped_at && meta.followup_stopped_reason !== "stuck") {
          counts.skipped++;
          counts.skipReasons.sequence_stopped++;
          continue;
        }
      }

      // Check if provider has engaged with this lead (connection-level or provider-level)
      // Provider-level check catches multi-lead email clicks where connection_id is null
      const providerKeys = [
        toProfile?.slug,
        toProfile?.source_provider_id,
        toProfile?.id,
      ].filter(Boolean) as string[];
      const isEngaged =
        engagedConnectionIds.has(conn.id) ||
        providerKeys.some((key) => engagedProviderIds.has(key));

      if (isEngaged) {
        // Mark as engaged and stop sequence
        if (!dryRun) {
          const updatedMeta = {
            ...meta,
            followup_stopped_at: new Date().toISOString(),
            followup_stopped_reason: "engaged" as const,
          };
          await db
            .from("connections")
            .update({ metadata: updatedMeta })
            .eq("id", conn.id);
        }
        counts.skipped++;
        counts.skipReasons.engaged++;
        continue;
      }

      const thread = meta.thread || [];

      // Check if provider has REALLY responded (non-auto, non-system, with actual text)
      const providerResponded = thread.some(
        (m) =>
          m.from_profile_id === conn.to_profile_id &&
          m.is_auto_reply !== true &&
          m.type !== "system" &&
          m.from_profile_id !== "system" &&
          !!m.text?.trim()
      );

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

      // Calculate days since inquiry and expected stage
      const daysSinceInquiry = Math.floor(
        (now - new Date(conn.created_at).getTime()) / (1000 * 60 * 60 * 24)
      );
      const currentStage = meta.followup_stage ?? 0;

      // In force mode: always use stage 6 (re-engagement email)
      // In normal mode: calculate based on days
      const expectedStage = forceStuckReengagement ? 6 : calculateExpectedStage(daysSinceInquiry);

      // Skip stage progression checks in force mode
      if (!forceStuckReengagement) {
        // Cap at stage 7 (terminal) — no resurrection of very old leads
        // Stage 7 is needs_call, which is the final state
        if (daysSinceInquiry > 30 && currentStage >= 7) {
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
      }

      const providerId = conn.to_profile_id;
      // Use slug, then source_provider_id, then id as fallback for token generation
      const providerSlug = toProfile?.slug || toProfile?.source_provider_id || toProfile?.id || "";
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

      // Stage 5 = Stuck — no email, just mark stage (sequence continues)
      if (templateStage === 5) {
        if (dryRun) {
          console.log(
            `[cron/lead-followup-sequence] [DRY RUN] Would mark ${leadCount} lead(s) as stuck (stage 5) for provider ${group.providerEmail}`
          );
        } else {
          for (const lead of group.leads) {
            const updatedMeta = {
              ...lead.metadata,
              followup_stage: 5 as FollowupStage,
              followup_sent_at: null,
              // Don't stop sequence — allow progression to stage 6/7
            };
            await db
              .from("connections")
              .update({ metadata: updatedMeta })
              .eq("id", lead.connectionId);
          }
        }
        counts.leads_marked_stuck += leadCount;
        continue;
      }

      // Stage 7 = Needs Call — no email, mark for manual intervention
      if (templateStage === 7) {
        if (dryRun) {
          console.log(
            `[cron/lead-followup-sequence] [DRY RUN] Would mark ${leadCount} lead(s) as needs_call (stage 7) for provider ${group.providerEmail}`
          );
        } else {
          for (const lead of group.leads) {
            const updatedMeta = {
              ...lead.metadata,
              followup_stage: 7 as FollowupStage,
              followup_sent_at: null,
              followup_stopped_at: new Date().toISOString(),
              followup_stopped_reason: "needs_call" as const,
              needs_call: true,
            };
            await db
              .from("connections")
              .update({ metadata: updatedMeta })
              .eq("id", lead.connectionId);
          }
        }
        counts.leads_marked_needs_call += leadCount;
        continue;
      }

      if (dryRun) {
        console.log(
          `[cron/lead-followup-sequence] [DRY RUN] Would send stage ${templateStage} email to ${group.providerEmail} for ${leadCount} lead(s)`
        );
        counts.providers_emailed++;
        counts.leads_included += leadCount;
        continue;
      }

      // Build subject line
      const primaryFamilyName = oldestLead.familyName;
      const subject = getSubjectForStage(templateStage, primaryFamilyName, leadCount);
      const emailType = getEmailTypeForStage(templateStage);

      // Reserve email log ID
      const emailLogId = await reserveEmailLogId({
        to: group.providerEmail,
        subject,
        emailType,
        recipientType: "provider",
        providerId: group.providerSlug,
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
          html = providerFollowupDay1Email(templateOpts);
          break;
        case 2:
          html = providerFollowupDay3Email(templateOpts);
          break;
        case 3:
          html = providerFollowupDay6Email(templateOpts);
          break;
        case 4:
          html = providerFollowupDay10Email(templateOpts);
          break;
        case 6:
          html = providerFollowupDay17Email(templateOpts);
          break;
        default:
          console.error(`[cron/lead-followup-sequence] Unexpected stage ${templateStage}`);
          continue;
      }

      // Send email
      const { success, error: sendError } = await sendEmail({
        to: group.providerEmail,
        subject,
        html,
        emailType,
        recipientType: "provider",
        providerId: group.providerSlug,
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

      // Update metadata for all connections in this batch
      const sentAt = new Date().toISOString();
      for (const lead of group.leads) {
        const updatedMeta: Record<string, unknown> = {
          ...lead.metadata,
          followup_stage: templateStage as FollowupStage,
          followup_sent_at: sentAt,
          followup_sent_by: "cron:lead-followup-sequence",
        };

        // Stage 6 re-engagement: clear stopped fields from stage 5 (stuck)
        // This indicates the sequence has resumed with a final outreach
        if (templateStage === 6) {
          updatedMeta.followup_stopped_at = null;
          updatedMeta.followup_stopped_reason = null;
        }

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
