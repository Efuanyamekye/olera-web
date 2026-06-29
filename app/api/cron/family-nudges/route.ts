import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/admin";
import { calculateFamilyCompleteness } from "@/lib/admin/profile-completeness";
import { sendEmail, reserveEmailLogId, appendTrackingParams } from "@/lib/email";
import {
  // Legacy templates (kept for post-connection followup)
  postConnectionFollowupEmail,
  // Publish-sequence templates (completion-sequence templates moved to the coordinator)
  publishNudge1Email,
  publishNudge2Email,
  publishNudge3Email,
  publishNudge4Email,
  publishNudgeSubject,
  publishMaintenanceEmail,
  // Milestone emails
  monthlyProviderRecommendationsEmail,
  inactivityReengagementEmail,
} from "@/lib/email-templates";
import type { CompareCardItem } from "@/lib/email-templates";
import { categoryStockImage } from "@/lib/family-comms/alternatives";
import {
  daysSince,
  getSequenceWithMigration,
  shouldSendPublishNudge,
  PUBLISH_ACTIVE_COUNT,
  MAX_MAINTENANCE_NUDGES,
} from "@/lib/family-comms/nudge-sequence";
import {
  countProvidersInArea,
  countNewProvidersInArea,
  getTopProviders,
} from "@/lib/family-comms/provider-recs.server";
import { withCronRun } from "@/lib/crons/run";
import {
  fetchFamilyProfilesPage,
  countActiveProvidersInArea,
  countRecentProvidersInArea,
  getTopRatedProvidersByCityState,
  getTopRatedProvidersByState,
  getBusinessProfileNameSlug,
  updateFamilyMetadata,
} from "@/lib/providers";
import type { NudgeSequence, FamilyMetadata } from "@/lib/types";

/**
 * GET /api/cron/family-nudges
 *
 * Runs daily at 3 PM UTC. Sequence-based re-engagement system:
 *
 * PROFILE COMPLETENESS: Uses ≥60% threshold to determine if a profile
 * is "complete". This is calculated using calculateFamilyCompleteness()
 * which weighs fields like photo, contact info, care types, payment
 * methods, etc. Lowered from 80% so enrichment completion is sufficient.
 *
 * TIMING: Aggressive early engagement — users are most motivated right
 * after signup. We start same-day and front-load the sequence.
 *
 * PHASE 1: Profile Completion (4 active nudges + 6 monthly max)
 * - Nudge #1: Same day (4h+ after signup) — What's missing, why it matters
 * - Nudge #2: Day 2 (+2 days) — Progress encouragement, provider count
 * - Nudge #3: Day 6 (+4 days) — Social proof, urgency
 * - Nudge #4: Day 13 (+7 days) — Final push with specific providers
 * - Maintenance: Every 30 days, max 6 times — New providers added
 *
 * PHASE 2: Profile Publishing (4 active nudges + 6 monthly max)
 * - Nudge #1: Same day after complete — Benefits of publishing
 * - Nudge #2: Day 2 (+2 days) — Provider count, top rated
 * - Nudge #3: Day 6 (+4 days) — Social proof, success stories
 * - Nudge #4: Day 13 (+7 days) — Soft touch, no pressure
 * - Maintenance: Every 30 days, max 6 times — Updated stats
 *
 * STOP CONDITIONS:
 * - Profile becomes ≥60% complete → stop completion, start publish
 * - Profile gets published → stop ALL sequences (SUCCESS!)
 * - User unsubscribes → stop ALL sequences forever
 * - Was published 30+ days ago then unpublished → don't re-nudge to publish
 * - Max 10 nudges per sequence (4 active + 6 maintenance) → give up gracefully
 *
 * Backward compatible with legacy boolean flags — new code writes sequence
 * metadata, old flags are read-only for migration.
 */
export const maxDuration = 60;

// ── Sequence configuration ──

// Sequence cadence constants (COMPLETION_*, PUBLISH_*, MAINTENANCE_*, MAX_MAINTENANCE_NUDGES)
// now live in lib/family-comms/nudge-sequence (shared with the coordinator's completion track).
const MAX_MONTHLY_RECOMMENDATIONS = 12;    // cap monthly recommendations at 12 (1 year)
const MAX_REENGAGEMENT_ATTEMPTS = 2;       // max re-engagement emails (2 total)
const INACTIVITY_THRESHOLD_DAYS = 30;      // days of inactivity before re-engagement
const REENGAGEMENT_COOLDOWN_DAYS = 30;     // days between re-engagement attempts
const READY_TO_PUBLISH_THRESHOLD = 60;     // ≥60% can publish profile (enrichment completion is sufficient)
const REPUBLISH_GRACE_PERIOD_DAYS = 30;    // don't nudge to re-publish if was published 30+ days ago

// Care-type → olera-providers category mapping, the ProviderRec shape, and the
// area-aware recommendation queries now live in lib/family-comms/provider-recs.server
// (shared with the coordinator's completion track).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = ReturnType<typeof getServiceClient>;

interface FamilyRow {
  id: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  image_url: string | null;
  city: string | null;
  state: string | null;
  description: string | null;
  care_types: string[] | null;
  metadata: FamilyMetadata | null;
  created_at: string;
  account_id: string | null;
  claim_token: string | null;
}

/**
 * Fetch all eligible family profiles in batches (handles >1000 rows).
 * Only fetches profiles created before the cutoff time (4h grace period).
 */
async function fetchAllFamilies(db: DB, cutoffTime: string): Promise<FamilyRow[]> {
  const PAGE_SIZE = 500;
  const allFamilies: FamilyRow[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await fetchFamilyProfilesPage(
      db,
      cutoffTime,
      offset,
      PAGE_SIZE,
    );

    if (error) {
      console.error("[cron/family-nudges] fetchAllFamilies error:", error);
      break;
    }

    if (data && data.length > 0) {
      allFamilies.push(...(data as FamilyRow[]));
      offset += PAGE_SIZE;
      hasMore = data.length === PAGE_SIZE;
    } else {
      hasMore = false;
    }
  }

  return allFamilies;
}

// Area-aware provider recommendation helpers (countProvidersInArea, getTopProviders,
// countNewProvidersInArea) now live in lib/family-comms/provider-recs.server, imported
// above and shared with the coordinator's completion track.

let connectionStatsCache: { familiesThisWeek: number; familiesThisMonth: number } | null = null;

/**
 * Count recent family connections platform-wide (last 7 days and last 30 days).
 * Used for social proof in publish nudges. Returns platform-wide stats since
 * state-level filtering would require expensive joins.
 */
async function getConnectionStats(
  db: DB,
): Promise<{ familiesThisWeek: number; familiesThisMonth: number }> {
  if (connectionStatsCache) {
    return connectionStatsCache;
  }

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Count connections initiated by families (type=request, from_profile_id is the seeker)
  const { count: weekCount } = await db
    .from("connections")
    .select("from_profile_id", { count: "exact", head: true })
    .gte("created_at", weekAgo)
    .eq("type", "request")
    .not("from_profile_id", "is", null);

  const { count: monthCount } = await db
    .from("connections")
    .select("from_profile_id", { count: "exact", head: true })
    .gte("created_at", monthAgo)
    .eq("type", "request")
    .not("from_profile_id", "is", null);

  connectionStatsCache = {
    familiesThisWeek: weekCount ?? 0,
    familiesThisMonth: monthCount ?? 0,
  };

  return connectionStatsCache;
}

// ── Magic link generation ──

/**
 * Generate a magic link for a family to auto-sign-in when clicking email CTAs.
 * Returns the magic link URL, or falls back to plain URL if generation fails.
 */
async function generateMagicLinkUrl(
  db: DB,
  family: FamilyRow,
  destinationPath: string,
  siteUrl: string,
): Promise<string> {
  const plainUrl = `${siteUrl}${destinationPath}`;

  // If family has an account, generate a magic link
  if (family.account_id && family.email) {
    try {
      const { data: account } = await db
        .from("accounts")
        .select("user_id")
        .eq("id", family.account_id)
        .single();

      if (account?.user_id) {
        // Use the existing service client for auth operations (no need to create new client)
        const { data: linkData, error: linkError } = await db.auth.admin.generateLink({
          type: "magiclink",
          email: family.email,
          options: {
            redirectTo: `${siteUrl}/auth/magic-link?next=${encodeURIComponent(destinationPath)}`,
          },
        });

        if (!linkError && linkData?.properties?.action_link) {
          return linkData.properties.action_link;
        } else if (linkError) {
          console.warn("[family-nudges] Failed to generate magic link:", linkError);
        }
      }
    } catch (err) {
      console.warn("[family-nudges] Error generating magic link:", err);
    }
  }

  // Fallback for guest families with claim token
  if (family.claim_token) {
    const separator = destinationPath.includes("?") ? "&" : "?";
    return `${plainUrl}${separator}token=${family.claim_token}`;
  }

  // Final fallback: plain URL (user will need to sign in manually)
  return plainUrl;
}

// Sequence cadence helpers (daysSince, getSequenceOrDefault, getCooldownForNudge,
// shouldSendPublishNudge, ...) now live in lib/family-comms/nudge-sequence, imported above
// and shared with the coordinator's completion track.

// ── Main handler ──

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const { searchParams } = new URL(request.url);
  const querySecret = searchParams.get("secret");
  const dryRun = searchParams.get("dry_run") === "true";
  const isAuthed =
    authHeader === `Bearer ${process.env.CRON_SECRET}` ||
    querySecret === process.env.CRON_SECRET;
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return withCronRun("family-nudges", async () => {
  try {
    const db = getServiceClient();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
    const now = Date.now();
    // 4-hour grace period: let users complete on their own before nudging
    const fourHoursAgo = new Date(now - 4 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

    const counts = {
      // Legacy counts (still tracked for backward compat)
      goLiveReminders: 0,
      profileIncomplete: 0,
      providerRecommendations: 0,
      dormantReengagement: 0,
      postConnectionFollowup: 0,
      // New sequence counts
      completionNudges: 0,
      publishNudges: 0,
      maintenanceNudges: 0,
      // Milestone emails
      completionCelebrations: 0,
      monthlyRecommendations: 0,
      reengagementEmails: 0,
      skipped: 0,
      skippedActiveConversation: 0,  // Users skipped because they're actively engaged
    };

    // ── Step 1: Fetch family profiles (4h+ old) using paginated fetch ──
    const families = await fetchAllFamilies(db, fourHoursAgo);

    if (!families.length) {
      return NextResponse.json({ status: "ok", message: "No eligible families", ...counts });
    }

    // ── Step 2: Resolve emails (account fallback) ──
    const accountIds = families
      .filter((f) => !f.email && f.account_id)
      .map((f) => f.account_id);

    let accountEmailMap: Record<string, string> = {};
    if (accountIds.length > 0) {
      const { data: accounts } = await db
        .from("accounts")
        .select("id, user_id")
        .in("id", accountIds);

      if (accounts?.length) {
        const { data: { users } } = await db.auth.admin.listUsers({ perPage: 500 });
        const userEmailMap: Record<string, string> = {};
        for (const u of users || []) {
          if (u.email) userEmailMap[u.id] = u.email;
        }
        for (const acct of accounts) {
          if (acct.user_id && userEmailMap[acct.user_id]) {
            accountEmailMap[acct.id] = userEmailMap[acct.user_id];
          }
        }
      }
    }

    // ── Step 3: Batch-fetch connections ──
    const familyIds = families.map((f) => f.id);
    const { data: allConnections } = await db
      .from("connections")
      .select("from_profile_id, to_profile_id, created_at, updated_at, type, metadata")
      .in("from_profile_id", familyIds)
      .eq("type", "inquiry")
      .order("created_at", { ascending: true });

    // Helper: Check if connection has real human conversation (messages from both sides)
    interface ThreadMessage {
      from_profile_id: string;
      text: string;
      created_at: string;
      is_auto_reply?: boolean;
    }
    function hasRealConversation(
      metadata: Record<string, unknown> | null,
      familyProfileId: string,
      providerProfileId: string
    ): boolean {
      if (!metadata) return false;
      const thread = (metadata.thread as ThreadMessage[]) || [];
      // Filter out auto-reply messages
      const humanMessages = thread.filter((msg) => !msg.is_auto_reply);
      if (humanMessages.length < 2) return false;
      // Check if both parties have sent at least one human message
      const familySent = humanMessages.some((msg) => msg.from_profile_id === familyProfileId);
      const providerSent = humanMessages.some((msg) => msg.from_profile_id === providerProfileId);
      return familySent && providerSent;
    }

    // Build connection map with activity tracking
    const connectionMap = new Map<string, {
      hasConnections: boolean;
      firstConnectionDate: string | null;
      firstToProfileId: string | null;
      lastActivityDate: string | null;  // Most recent updated_at across all connections
      hadRealConversation: boolean;     // Both parties exchanged human messages
    }>();
    for (const conn of allConnections || []) {
      const connMeta = (conn.metadata || null) as Record<string, unknown> | null;
      const realConvo = hasRealConversation(connMeta, conn.from_profile_id, conn.to_profile_id);

      const existing = connectionMap.get(conn.from_profile_id);
      if (!existing) {
        connectionMap.set(conn.from_profile_id, {
          hasConnections: true,
          firstConnectionDate: conn.created_at,
          firstToProfileId: conn.to_profile_id,
          lastActivityDate: conn.updated_at || conn.created_at,
          hadRealConversation: realConvo,
        });
      } else {
        // Update lastActivityDate if this connection is more recent
        const existingActivity = existing.lastActivityDate ? new Date(existing.lastActivityDate).getTime() : 0;
        const thisActivity = conn.updated_at ? new Date(conn.updated_at).getTime() : 0;
        if (thisActivity > existingActivity) {
          existing.lastActivityDate = conn.updated_at;
        }
        // NOTE: We intentionally do NOT update hadRealConversation here.
        // We only care about the FIRST connection since that's what the
        // post-connection followup email asks about.
      }
    }

    // ── Step 4: Sequence-based nudge loop ──
    for (const family of families) {
      const meta = (family.metadata || {}) as FamilyMetadata;
      const email = family.email || (family.account_id ? accountEmailMap[family.account_id] : null);
      if (!email) { counts.skipped++; continue; }

      // Subordinate to the Family Comms Coordinator: if the coordinator already sent this
      // family a governed email this cycle, stand down (it wins every collision). The
      // coordinator owns the help-cascade rungs; family-nudges is the demoted publish/
      // completion machine and should never pile on. See plans/family-comms-system.md.
      const lastCoordEmailAt = (meta as Record<string, unknown>).last_coordinator_email_at as string | undefined;
      if (lastCoordEmailAt && Date.now() - new Date(lastCoordEmailAt).getTime() < 20 * 60 * 60 * 1000) {
        counts.skipped++;
        continue;
      }

      // Calculate profile completeness using the same function as lead-family-nudge
      const completeness = calculateFamilyCompleteness(family, email);
      const readyToPublish = completeness.percentage >= READY_TO_PUBLISH_THRESHOLD;  // ≥60% can publish

      // Used to determine whether to fetch provider count/list
      const hasLocation = !!(family.city && family.state);

      const carePost = meta.care_post;
      const isPublished = carePost?.status === "active";
      const wasEverPublished = !!carePost?.published_at;
      const connData = connectionMap.get(family.id);
      const hasConnections = connData?.hasConnections || false;
      const firstName = family.display_name?.split(/\s+/)[0] || "there";
      const careTypes = (family.care_types as string[]) || [];

      // ── PUBLISHED FAMILIES: Monthly Provider Recommendations ──
      // For published families (SUCCESS state), we don't send nudges anymore.
      // Instead, send monthly recommendations to keep them engaged with relevant providers.
      if (isPublished) {
        // Check unsubscribe first
        if (meta.nudges_unsubscribed === true) {
          counts.skipped++;
          continue;
        }

        // Check if we have location (required for recommendations)
        if (!hasLocation) {
          counts.skipped++;
          continue;
        }

        // Check monthly cooldown (30 days since last recommendation)
        const daysSinceLastRec = daysSince(meta.monthly_recommendations_sent_at);
        if (daysSinceLastRec < 30) {
          continue; // Not time yet, but don't count as skipped
        }

        // Check if we've hit the max (12 emails = 1 year)
        const recCount = meta.monthly_recommendations_count ?? 0;
        if (recCount >= MAX_MONTHLY_RECOMMENDATIONS) {
          counts.skipped++;
          continue; // Give up gracefully after 1 year
        }

        // Get provider data for recommendations
        const providerCount = await countProvidersInArea(db, family.city!, family.state!, careTypes);
        const newProviderCount = await countNewProvidersInArea(db, family.city!, family.state!, careTypes);
        const topProviders = await getTopProviders(db, family.city!, family.state!, careTypes, 3);

        // Skip if no providers to recommend
        if (topProviders.length === 0) {
          counts.skipped++;
          continue;
        }

        const locationText = family.city || family.state || "your area";
        const mrSubject = newProviderCount > 0
          ? `${newProviderCount} providers in ${locationText} match your search`
          : `Highly-rated providers in ${locationText}`;
        const emailType = "monthly_recommendations";

        if (!dryRun) {
          const logId = await reserveEmailLogId({
            to: email,
            subject: mrSubject,
            emailType,
            recipientType: "family",
            metadata: {
              family_profile_id: family.id,
              new_provider_count: newProviderCount,
              provider_count: providerCount,
            },
          });

          // Build URLs with tracking
          const profilePath = appendTrackingParams("/portal/profile", logId);
          const inboxPath = appendTrackingParams("/portal/inbox", logId);
          const profileUrl = await generateMagicLinkUrl(db, family, profilePath, siteUrl);
          const inboxUrl = await generateMagicLinkUrl(db, family, inboxPath, siteUrl);

          const html = monthlyProviderRecommendationsEmail({
            unsubscribeId: family.id,
            familyName: firstName,
            profileUrl,
            inboxUrl,
            providers: topProviders,
            newProviderCount,
            isPublished: true, // Always true in this branch
            city: family.city || undefined,
            state: family.state || undefined,
          });

          await sendEmail({
            to: email,
            subject: mrSubject,
            html,
            emailType,
            recipientType: "family",
            emailLogId: logId ?? undefined,
          });

          // Update metadata with timestamp and increment count
          await updateFamilyMetadata(db, family.id, {
            ...meta,
            monthly_recommendations_sent_at: new Date().toISOString(),
            monthly_recommendations_count: recCount + 1,
          });
        }

        counts.monthlyRecommendations++;
        continue; // Done with this published family
      }

      // ── STOP CONDITION: User has unsubscribed from nudges ──
      if (meta.nudges_unsubscribed === true) {
        counts.skipped++;
        continue;
      }

      // ── STOP CONDITION: Was published 30+ days ago then unpublished ──
      // Respect their decision — they know how to publish if they want to
      if (wasEverPublished && carePost?.published_at) {
        const daysSinceFirstPublished = daysSince(carePost.published_at);
        if (daysSinceFirstPublished >= REPUBLISH_GRACE_PERIOD_DAYS) {
          counts.skipped++;
          continue;
        }
      }

      // NOTE (Track 2 / Option B, 2026-06-29): the COMPLETION track and the 100%
      // completion CELEBRATION moved to the family-comms-coordinator, which is now the
      // single owner of the "fill your profile" ask (for all incomplete families, with or
      // without a connection). family-nudges no longer sends completion_nudge_*,
      // completion_maintenance, or completion_celebration. It still owns the PUBLISH track
      // (below), monthly recommendations, re-engagement, and post-connection follow-up.
      // See plans/family-comms-system.md "Track 2 — Option B build spec".

      // ── PHASE 2: Profile Publishing (if ready to publish but not published yet) ──
      if (readyToPublish && !isPublished) {
        // Use migration-aware function: if they got the old email, skip nudge #1
        const seq = getSequenceWithMigration(
          meta.publish_sequence,
          meta.go_live_reminder_sent,
        );

        // Use profile_completeness timestamp or created_at as baseline
        const profileCompletedAt = meta.last_active_at;

        if (shouldSendPublishNudge(seq, profileCompletedAt, family.created_at)) {
          // Defensive: check location exists (should always be true for complete profiles)
          const hasLocation = family.city && family.state;
          const providerCount = hasLocation
            ? await countProvidersInArea(db, family.city!, family.state!, careTypes)
            : undefined;
          const topProviders = hasLocation
            ? await getTopProviders(db, family.city!, family.state!, careTypes, 3)
            : [];
          const connectionStats = await getConnectionStats(db);

          const nudgeNumber = seq.nudge_count + 1;
          const isMaintenanceNudge = seq.phase === "maintenance";

          // ── STOP CONDITION: Max maintenance nudges reached (cap at 6 monthly = 10 total) ──
          if (isMaintenanceNudge && nudgeNumber > PUBLISH_ACTIVE_COUNT + MAX_MAINTENANCE_NUDGES) {
            counts.skipped++;
            continue; // Give up gracefully — they're not engaging
          }

          // Step 1: Determine subject, emailType, and increment counters
          let subject: string;
          let emailType: string;
          const locationText = family.city || family.state || "your area";

          // For maintenance, get new provider count for dynamic subject
          let newProviderCount = 0;
          if (isMaintenanceNudge && hasLocation) {
            newProviderCount = await countNewProvidersInArea(db, family.city!, family.state!, careTypes);
          }

          if (isMaintenanceNudge) {
            // Dynamic subject based on new providers
            subject = newProviderCount > 0
              ? `${newProviderCount} new providers joined in ${locationText}`
              : `Providers in ${locationText} are still looking`;
            emailType = "publish_maintenance";
            counts.maintenanceNudges++;
          } else {
            subject = publishNudgeSubject(nudgeNumber);
            emailType = `publish_nudge_${nudgeNumber}`;
            counts.publishNudges++;
            // Also increment legacy counter for backward compat reporting
            counts.goLiveReminders++;
          }

          // Step 2: Reserve logId BEFORE building HTML (so tracking works)
          let logId: string | null = null;
          if (!dryRun) {
            logId = await reserveEmailLogId({
              to: email,
              subject,
              emailType,
              recipientType: "family",
              metadata: {
                family_profile_id: family.id,
                profile_snapshot: {
                  completeness: completeness.percentage,
                  is_published: isPublished,
                },
              },
            });
          }

          // Step 3: Build magic link URL with tracking (auto-signs user in)
          const trackedPath = appendTrackingParams("/welcome", logId);
          const matchesUrl = await generateMagicLinkUrl(db, family, trackedPath, siteUrl);

          // Step 4: Build HTML using magic link URL
          let html: string;
          if (isMaintenanceNudge) {
            html = publishMaintenanceEmail({
              unsubscribeId: family.id,
              familyName: firstName,
              matchesUrl,
              providerCount,
              newProviderCount,
              providers: topProviders,
              city: family.city || undefined,
              state: family.state || undefined,
            });
          } else {
            switch (nudgeNumber) {
              case 1:
                html = publishNudge1Email({
                  unsubscribeId: family.id,
                  familyName: firstName,
                  matchesUrl,
                  providerCount,
                  city: family.city || undefined,
                });
                break;
              case 2: {
                // Photo + hairline cards (completion_nudge_4 / R3 style), not the
                // boxed text cards. Each directory provider gets a category stock
                // image so cards never render blank.
                const pubCards: CompareCardItem[] = topProviders.map((p, i) => ({
                  name: p.name,
                  viewUrl: `${siteUrl}/provider/${p.slug}`,
                  imageUrl: categoryStockImage(p.category, i),
                  priceRange: p.priceRange ?? null,
                  rating: p.rating || null,
                  reviewCount: p.reviewCount || null,
                }));
                html = publishNudge2Email({
                  unsubscribeId: family.id,
                  familyName: firstName,
                  matchesUrl,
                  providerCount,
                  providers: pubCards,
                  city: family.city || undefined,
                });
                break;
              }
              case 3:
                html = publishNudge3Email({
                  unsubscribeId: family.id,
                  familyName: firstName,
                  matchesUrl,
                  familiesThisWeek: connectionStats.familiesThisWeek,
                  familiesThisMonth: connectionStats.familiesThisMonth,
                  providerCount,
                  city: family.city || undefined,
                  state: family.state || undefined,
                });
                break;
              case 4:
              default:
                html = publishNudge4Email({
                  unsubscribeId: family.id,
                  familyName: firstName,
                  matchesUrl,
                  city: family.city || undefined,
                });
                break;
            }
          }

          // Step 5: Send email (if not dryRun)
          if (!dryRun) {
            await sendEmail({
              to: email,
              subject,
              html,
              emailType,
              recipientType: "family",
              emailLogId: logId ?? undefined,
            });

            // Update sequence metadata
            const newSeq: NudgeSequence = {
              nudge_count: nudgeNumber,
              last_nudge_at: new Date().toISOString(),
              phase: nudgeNumber >= PUBLISH_ACTIVE_COUNT ? "maintenance" : "active",
            };
            await updateFamilyMetadata(db, family.id, {
              ...meta,
              publish_sequence: newSeq,
              // Also set legacy flag for backward compat
              go_live_reminder_sent: true,
              // Store calculated completeness for accurate display in Find Families
              profile_completeness: completeness.percentage,
            });
          }
          continue;
        }
      }

      // ── Legacy: Post-Connection Follow-up (30 days after first connection) ──
      // Only send if there was a real human conversation (not just automated messages)
      // Respect user's notification preferences and global unsubscribe
      const notifPrefs = (meta.notification_prefs || {}) as Record<string, Record<string, boolean>>;
      const followupEmailsEnabled = notifPrefs.followup_reviews?.email !== false; // Default to true
      if (
        hasConnections &&
        connData?.firstConnectionDate &&
        connData.firstConnectionDate <= thirtyDaysAgo &&
        connData.hadRealConversation &&
        !meta.post_connection_followup_sent &&
        !meta.nudges_unsubscribed &&
        followupEmailsEnabled
      ) {
        // Fetch provider info - skip if provider deleted or has no slug
        let providerName = "";
        let providerSlug = "";

        if (connData.firstToProfileId) {
          const providerBp = await getBusinessProfileNameSlug(db, connData.firstToProfileId);
          if (providerBp?.slug) {
            providerName = providerBp.display_name || "your provider";
            providerSlug = providerBp.slug;
          }
        }

        // Skip if provider not found or has no slug (would create broken URL)
        if (!providerSlug) {
          continue;
        }

        if (!dryRun) {
          const pcfSubject = `How was your experience with ${providerName}?`;
          const pcfLogId = await reserveEmailLogId({ to: email, subject: pcfSubject, emailType: "post_connection_followup", recipientType: "family" });
          await sendEmail({
            to: email,
            subject: pcfSubject,
            html: postConnectionFollowupEmail({
              unsubscribeId: family.id,
              familyName: firstName,
              providerName,
              providerSlug,
              reviewUrl: appendTrackingParams(`${siteUrl}/provider/${providerSlug}#reviews`, pcfLogId),
            }),
            emailType: "post_connection_followup",
            recipientType: "family",
            emailLogId: pcfLogId ?? undefined,
          });
          await updateFamilyMetadata(db, family.id, { ...meta, post_connection_followup_sent: true });
        }
        counts.postConnectionFollowup++;
        continue;
      }

      // ── INACTIVITY RE-ENGAGEMENT ──
      // Catch-all for families who didn't get any other email and appear inactive.
      // Uses multiple signals to determine last activity since last_active_at may not be set.
      // Max 2 attempts ever, 30-day cooldown between attempts.

      // Skip if already maxed out on re-engagement
      const reengageCount = meta.reengagement_count ?? 0;
      if (reengageCount >= MAX_REENGAGEMENT_ATTEMPTS) {
        continue; // Already tried twice, give up
      }

      // Skip if recently re-engaged
      const daysSinceReengagement = daysSince(meta.reengagement_sent_at);
      if (daysSinceReengagement < REENGAGEMENT_COOLDOWN_DAYS) {
        continue; // Too soon
      }

      // Skip if we sent ANY email recently (avoid back-to-back emails)
      // Check nudge sequences, celebration, and monthly recommendations
      const lastCompletionNudge = meta.completion_sequence?.last_nudge_at;
      const lastPublishNudge = meta.publish_sequence?.last_nudge_at;
      const lastCelebration = meta.completion_celebrated_at;
      const lastMonthlyRec = meta.monthly_recommendations_sent_at;
      const mostRecentEmail = [lastCompletionNudge, lastPublishNudge, lastCelebration, lastMonthlyRec]
        .filter(Boolean)
        .sort()
        .pop(); // Get the most recent timestamp

      const daysSinceAnyEmail = daysSince(mostRecentEmail);
      if (daysSinceAnyEmail < 14) {
        continue; // Got an email recently, don't pile on
      }

      // Determine last activity using multiple signals (fallback chain)
      // Priority: last_active_at > connection activity > published_at > profile updated > created
      const lastActivity = meta.last_active_at
        || connData?.lastActivityDate
        || meta.care_post?.published_at
        || family.created_at;

      const daysSinceActivity = daysSince(lastActivity);
      if (daysSinceActivity < INACTIVITY_THRESHOLD_DAYS) {
        continue; // Not inactive enough
      }

      // Skip if profile is too bare (just signed up and bounced - no meaningful engagement)
      // Require at least: has email AND (has connections OR 40%+ profile OR has care types)
      const hasMeaningfulActivity = hasConnections
        || completeness.percentage >= 40
        || (careTypes.length > 0);
      if (!hasMeaningfulActivity) {
        continue; // No engagement, not worth re-engaging
      }

      // Skip if no location (needed for provider recommendations)
      if (!hasLocation) {
        counts.skipped++;
        continue;
      }

      // Get providers for the email
      const topProviders = await getTopProviders(db, family.city!, family.state!, careTypes, 3);
      if (topProviders.length === 0) {
        counts.skipped++;
        continue;
      }

      const locationText = family.city || family.state || "your area";
      const reSubject = `Still searching for care in ${locationText}?`;
      const emailType = "inactivity_reengagement";

      if (!dryRun) {
        const logId = await reserveEmailLogId({
          to: email,
          subject: reSubject,
          emailType,
          recipientType: "family",
          metadata: {
            family_profile_id: family.id,
            days_inactive: daysSinceActivity,
            reengagement_attempt: reengageCount + 1,
          },
        });

        // Build URLs with tracking
        const profilePath = appendTrackingParams("/portal/profile", logId);
        const inboxPath = appendTrackingParams("/portal/inbox", logId);
        const profileUrl = await generateMagicLinkUrl(db, family, profilePath, siteUrl);
        const inboxUrl = await generateMagicLinkUrl(db, family, inboxPath, siteUrl);

        const html = inactivityReengagementEmail({
          unsubscribeId: family.id,
          familyName: firstName,
          profileUrl,
          inboxUrl,
          providers: topProviders,
          completionPercent: completeness.percentage,
          isPublished,
          city: family.city || undefined,
          state: family.state || undefined,
        });

        await sendEmail({
          to: email,
          subject: reSubject,
          html,
          emailType,
          recipientType: "family",
          emailLogId: logId ?? undefined,
        });

        // Update metadata
        await updateFamilyMetadata(db, family.id, {
          ...meta,
          reengagement_sent_at: new Date().toISOString(),
          reengagement_count: reengageCount + 1,
        });
      }

      counts.reengagementEmails++;
    }

    return NextResponse.json({ status: "ok", dry_run: dryRun, ...counts });
  } catch (err) {
    console.error("[cron/family-nudges] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
  });
}
