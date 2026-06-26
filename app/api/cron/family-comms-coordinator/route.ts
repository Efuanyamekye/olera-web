import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/admin";
import { sendEmail, reserveEmailLogId, appendTrackingParams } from "@/lib/email";
import { withCronRun } from "@/lib/crons/run";
import { getSiteUrl } from "@/lib/site-url";
import { generateFamilyInboxUrl } from "@/lib/claim-tokens";
import { calculateFamilyCompleteness } from "@/lib/admin/profile-completeness";
import { findAlternativeProviders, careTypeToBrowseSlug } from "@/lib/family-comms/alternatives";
import {
  connectionOutcomeCheckEmail,
  providerSilentEmail,
  familyNeverEngagedEmail,
  familyNeverEngagedSubject,
  day10AwaitingEmail,
  familyPendingReachOutNudgeEmail,
  familyNudgeEmail,
} from "@/lib/email-templates";

/**
 * GET /api/cron/family-comms-coordinator
 *
 * The Family Comms Coordinator — the family-side arbitration brain. Replaces the
 * uncoordinated firehose of 6 connection-triggered family crons (outcome-check,
 * provider-silent, never-engaged, day-10-awaiting, matches-family-nudge,
 * lead-family-nudge) with ONE daily cron that picks the single highest-priority
 * message per family per cycle, in a fixed priority ladder. (The 7th cron,
 * family-nudges, is the demoted publish/completion machine; it stays separate but
 * subordinated — governed by the family cap + a coordinator-awareness guard.)
 *
 * The ladder encodes the compare-led flywheel (project_family_help_cascade,
 * project_family_comms_channels): compare options is the hero, benefits the closer
 * (the personalized quiz), completion is woven in as a value-exchange (never a naked
 * ask). Responsiveness is an INTERNAL ranking signal only — no response-time claims.
 *   0. GLOBAL STOPS  — unsubscribed / self-reported "yes" / active live thread
 *   1. outcome-check          → family_outcome_check       (the self-report sensor)
 *   2. provider-silent → compare cards + benefits quiz     → family_provider_silent
 *   3. never-engaged → compare cards (guide fallback)      → family_never_engaged
 *   4. provider-responded → compare + how-to-choose        → day_10_awaiting
 *   5. pending reach-out      → family_reach_out_nudge
 *   6. stuck → completion-as-value-exchange (the quiz)     → family_nudge
 *      (publish nudges are DEMOTED out — owned by the subordinated family-nudges cron)
 *
 * Sends flow through sendEmail(), which now enforces the per-family nudge cap, so
 * the coordinator can never over-mail. ?dry_run=true returns the per-family
 * selection without sending. See plans/family-comms-system.md.
 */

export const maxDuration = 300;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

interface ThreadMsg {
  from_profile_id: string;
  text?: string;
  created_at?: string;
  is_auto_reply?: boolean;
}

interface ProfileRow {
  id: string;
  display_name?: string | null;
  email?: string | null;
  phone?: string | null;
  slug?: string | null;
  city?: string | null;
  state?: string | null;
  care_types?: string[] | null;
  account_id?: string | null;
  metadata?: Record<string, unknown> | null;
  lat?: number | null;
  lng?: number | null;
}

interface ConnRow {
  id: string;
  type: string;
  status: string;
  message?: string | null;
  created_at: string;
  from_profile_id: string;
  to_profile_id: string;
  metadata?: Record<string, unknown> | null;
  from_profile?: ProfileRow | ProfileRow[] | null;
  to_profile?: ProfileRow | ProfileRow[] | null;
}

interface FamilyBucket {
  familyId: string;
  profile?: ProfileRow;
  inquiries: ConnRow[];
  requests: ConnRow[];
}

/** A chosen ladder rung, ready to send. */
interface RungPlan {
  rung: string;
  emailType: string;
  subject: string;
  metadata: Record<string, unknown>;
  /** Builds the email HTML (needs the reserved log id for tracking links). */
  buildHtml: (emailLogId: string | null, authEmail: string) => string | Promise<string>;
  /** Stamps the existing per-rung dedup flag(s) after a successful send. */
  stamp: (sentAt: string) => Promise<void>;
}

function norm(rel: ProfileRow | ProfileRow[] | null | undefined): ProfileRow | undefined {
  if (!rel) return undefined;
  return Array.isArray(rel) ? rel[0] : rel;
}

function threadOf(conn: ConnRow): ThreadMsg[] {
  return ((conn.metadata as Record<string, unknown> | null)?.thread as ThreadMsg[]) || [];
}

function metaOf(conn: ConnRow): Record<string, unknown> {
  return (conn.metadata as Record<string, unknown>) || {};
}

function familySentMessage(conn: ConnRow, familyId: string): boolean {
  return threadOf(conn).some((m) => m.from_profile_id === familyId && !m.is_auto_reply && m.text?.trim());
}

function providerRespondedIn(conn: ConnRow): boolean {
  return threadOf(conn).some((m) => m.from_profile_id === conn.to_profile_id && !m.is_auto_reply && m.text?.trim());
}

function providerFirstResponseAt(conn: ConnRow): number | null {
  let earliest: number | null = null;
  for (const m of threadOf(conn)) {
    if (m.from_profile_id === conn.to_profile_id && !m.is_auto_reply && m.text?.trim() && m.created_at) {
      const t = new Date(m.created_at).getTime();
      if (earliest === null || t < earliest) earliest = t;
    }
  }
  return earliest;
}

function familyRepliedAfter(conn: ConnRow, familyId: string, afterMs: number): boolean {
  return threadOf(conn).some(
    (m) =>
      m.from_profile_id === familyId &&
      !m.is_auto_reply &&
      m.text?.trim() &&
      m.created_at &&
      new Date(m.created_at).getTime() > afterMs,
  );
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const { searchParams } = new URL(request.url);
  const querySecret = searchParams.get("secret");
  const dryRun = searchParams.get("dry_run") === "true";
  const maxConns = Math.min(8000, parseInt(searchParams.get("limit") || "5000", 10));
  const isAuthed =
    authHeader === `Bearer ${process.env.CRON_SECRET}` || querySecret === process.env.CRON_SECRET;

  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return withCronRun("family-comms-coordinator", async () => {
    const db = getServiceClient();
    const siteUrl = getSiteUrl();
    const now = Date.now();

    const counts = {
      families: 0,
      sent: 0,
      skipped: 0,
      dry_run: dryRun,
      byRung: {} as Record<string, number>,
      stops: { unsubscribed: 0, self_reported_yes: 0, active_thread: 0, no_email: 0, no_rung: 0, send_failed: 0 },
    };
    const bump = (rung: string) => {
      counts.byRung[rung] = (counts.byRung[rung] || 0) + 1;
    };

    // 1. Gather candidates broadly. Inquiry connections drive rungs 1-4 & 6; request
    //    connections drive rung 5. day-10 (rung 4) keys off provider-response age, not
    //    connection age, so we pull all pending/accepted inquiries (the rung filters).
    const familySel =
      "id, display_name, email, phone, city, state, care_types, account_id, metadata, lat, lng";
    const providerSel = "id, display_name, slug, city, state, care_types, metadata";

    const { data: inquiryRows, error: inqErr } = await db
      .from("connections")
      .select(
        `id, type, status, message, created_at, from_profile_id, to_profile_id, metadata,
         from_profile:business_profiles!connections_from_profile_id_fkey(${familySel}),
         to_profile:business_profiles!connections_to_profile_id_fkey(${providerSel})`,
      )
      .eq("type", "inquiry")
      .in("status", ["pending", "accepted"])
      .order("created_at", { ascending: false })
      .limit(maxConns);
    if (inqErr) throw new Error(`inquiry fetch: ${inqErr.message}`);

    const { data: requestRows, error: reqErr } = await db
      .from("connections")
      .select(
        `id, type, status, message, created_at, from_profile_id, to_profile_id, metadata,
         from_profile:business_profiles!connections_from_profile_id_fkey(id, display_name, city, state),
         to_profile:business_profiles!connections_to_profile_id_fkey(${familySel})`,
      )
      .eq("type", "request")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(maxConns);
    if (reqErr) throw new Error(`request fetch: ${reqErr.message}`);

    // 2. Group by family.
    const fams = new Map<string, FamilyBucket>();
    const ensure = (id: string): FamilyBucket => {
      let b = fams.get(id);
      if (!b) {
        b = { familyId: id, inquiries: [], requests: [] };
        fams.set(id, b);
      }
      return b;
    };
    for (const row of (inquiryRows as unknown as ConnRow[]) || []) {
      const b = ensure(row.from_profile_id);
      b.inquiries.push(row);
      if (!b.profile) b.profile = norm(row.from_profile);
    }
    for (const row of (requestRows as unknown as ConnRow[]) || []) {
      const b = ensure(row.to_profile_id);
      b.requests.push(row);
      if (!b.profile) b.profile = norm(row.to_profile);
    }

    // 3. Evaluate each family through the ladder; send the first eligible rung.
    for (const fam of fams.values()) {
      counts.families++;
      const fp = fam.profile;
      if (!fp) {
        counts.skipped++;
        continue;
      }
      const familyMeta = (fp.metadata as Record<string, unknown>) || {};

      // ── Rung 0: GLOBAL STOPS ──────────────────────────────────────────────
      if (familyMeta.nudges_unsubscribed === true) {
        counts.skipped++;
        counts.stops.unsubscribed++;
        continue;
      }
      const selfReportedYes = fam.inquiries.some(
        (c) => (metaOf(c).outcome as { value?: string } | undefined)?.value === "yes",
      );
      if (selfReportedYes) {
        counts.skipped++;
        counts.stops.self_reported_yes++;
        continue;
      }
      // Active live conversation: provider replied AND family replied, latest activity < 7d.
      const inActiveThread = fam.inquiries.some((c) => {
        if (!providerRespondedIn(c) || !familySentMessage(c, fam.familyId)) return false;
        const latest = threadOf(c)
          .map((m) => (m.created_at ? new Date(m.created_at).getTime() : 0))
          .reduce((a, b) => Math.max(a, b), 0);
        return latest > 0 && now - latest < 7 * DAY;
      });
      if (inActiveThread) {
        counts.skipped++;
        counts.stops.active_thread++;
        continue;
      }

      // Email resolution is LAZY: rung eligibility never needs the email, and most families
      // match no rung on a given day. The expensive auth-admin fallback runs only AFTER a rung
      // is picked (and is skipped entirely in dry-run). recipient/authEmailFinal are assigned in
      // the send path below; the buildHtml closures read them at invocation time, after assignment.
      const directEmail = fp.email?.trim() || undefined;
      // Hoisted in the fp-narrowed scope so the nested pickRung closure can use them
      // without TS re-widening fp to possibly-undefined.
      const familyLat = fp.lat ?? null;
      const familyLng = fp.lng ?? null;
      let recipient = directEmail || "";
      let authEmailFinal = directEmail || "";
      const familyName = fp.display_name || "";
      const ageMs = (c: ConnRow) => now - new Date(c.created_at).getTime();
      const providerRespondedAnywhere = fam.inquiries.some(providerRespondedIn);
      const familyEngagedAnywhere = fam.inquiries.some((c) => familySentMessage(c, fam.familyId));

      // Rung-6 inputs, computed here in the narrowed (fp-defined) outer scope so the nested
      // pickRung() closure can reference them without re-deref'ing the optional fp. Completeness
      // uses the direct profile email (the auth-fallback only affects deliverability, not the
      // completeness threshold meaningfully).
      const completeness = calculateFamilyCompleteness(fp, directEmail || "");
      const isComplete = completeness.percentage >= 60;

      // ── Compare-led URL builders (v2 flywheel) ──────────────────────────
      // Both read authEmailFinal at *invocation* time (inside buildHtml, after the
      // send-path resolves the deliverable email) — never during rung eligibility.
      // buildBrowseUrl deep-links to a PRE-FILTERED browse: `type` (care-type slug)
      // + `location` (city, state) — the exact params app/browse/page.tsx reads.
      // careTypeToBrowseSlug returns null for unknown tokens → we omit `type` rather
      // than send a broken filter.
      const buildBrowseUrl = (provider: ProfileRow | undefined, eid: string | null): string => {
        const typeSlug = careTypeToBrowseSlug((provider?.care_types as string[] | undefined)?.[0]);
        const loc = [provider?.city, provider?.state].filter(Boolean).join(", ");
        const qs = new URLSearchParams();
        if (typeSlug) qs.set("type", typeSlug);
        if (loc) qs.set("location", loc);
        const path = qs.toString() ? `/browse?${qs.toString()}` : "/browse";
        return generateFamilyInboxUrl(authEmailFinal, appendTrackingParams(path, eid), siteUrl);
      };
      // The benefits CLOSER: personalized quiz (auto-prefills from the family profile
      // on arrival via the inbox magic-link).
      const buildQuizUrl = (eid: string | null): string =>
        generateFamilyInboxUrl(authEmailFinal, appendTrackingParams("/benefits/finder", eid), siteUrl);
      // Map an alternative provider → a compare card (image + rating + distance), with a
      // tracked, auth deep-linked view URL. Shared across the compare rungs (R2/R3/R4).
      const toCard = (
        p: Awaited<ReturnType<typeof findAlternativeProviders>>[number],
        eid: string | null,
      ) => ({
        name: p.name,
        viewUrl: generateFamilyInboxUrl(
          authEmailFinal,
          appendTrackingParams(`/provider/${p.slug}?rp=${p.slug}`, eid),
          siteUrl,
        ),
        imageUrl: p.imageUrl,
        priceRange: p.priceRange,
        rating: p.rating,
        reviewCount: p.reviewCount,
        distanceMi: p.distanceMi,
      });

      // Build the ladder for this family; first non-null plan wins.
      const plan = await pickRung();

      async function pickRung(): Promise<RungPlan | null> {
        // ── Rung 1: outcome-check (sensor) — inquiry 48-72h, provider silent ──
        const r1 = fam.inquiries.find((c) => {
          const a = ageMs(c);
          const m = metaOf(c);
          return (
            a >= 48 * HOUR &&
            a <= 72 * HOUR &&
            !m.outcome &&
            !m.outcome_check_sent_at &&
            !providerRespondedIn(c)
          );
        });
        if (r1) {
          const provider = norm(r1.to_profile);
          const providerName = provider?.display_name || "the provider";
          return {
            rung: "outcome_check",
            emailType: "family_outcome_check",
            subject: `Did ${providerName} get back to you?`,
            metadata: { connection_id: r1.id },
            buildHtml: (eid) => {
              const link = (v: string) =>
                `${siteUrl}${appendTrackingParams(`/connection-outcome?cid=${r1.id}&v=${v}`, eid)}`;
              return connectionOutcomeCheckEmail({
                familyName,
                providerName,
                yesUrl: link("yes"),
                notYetUrl: link("not_yet"),
                noUrl: link("no"),
              });
            },
            stamp: async (sentAt) => {
              await db
                .from("connections")
                .update({ metadata: { ...metaOf(r1), outcome_check_sent_at: sentAt, outcome_check_sent_by: "cron:family-comms-coordinator" } })
                .eq("id", r1.id);
            },
          };
        }

        // ── Rung 2: provider silent → alternatives — inquiry 96-120h, family engaged,
        //    provider silent everywhere, ≥3 responsive alternatives ──
        const alreadyAlt = fam.inquiries.some((c) => metaOf(c).family_alternatives_sent_at);
        const r2trigger = fam.inquiries.find((c) => {
          const a = ageMs(c);
          return a >= 96 * HOUR && a <= 120 * HOUR;
        });
        if (r2trigger && familyEngagedAnywhere && !providerRespondedAnywhere && !alreadyAlt) {
          const provider = norm(r2trigger.to_profile);
          const providerName = provider?.display_name || "the provider";
          const alts = await findAlternativeProviders(
            db,
            r2trigger.to_profile_id,
            provider?.city || undefined,
            provider?.state || undefined,
            (provider?.care_types as string[]) || [],
            familyLat,
            familyLng,
          );
          if (alts.length >= 3) {
            const m = metaOf(r2trigger);
            const providerPassed = ["not_accepting_clients", "not_a_fit"].includes(m.archive_reason as string);
            return {
              rung: "provider_silent",
              emailType: "family_provider_silent",
              subject: providerPassed
                ? "A few other providers near you, while you wait"
                : "A few other providers near you",
              metadata: { connection_id: r2trigger.id, recommended_count: alts.length, provider_passed: providerPassed },
              buildHtml: (eid) => {
                const browseUrl = buildBrowseUrl(provider, eid);
                const recommendedProviders = alts.map((p) => toCard(p, eid));
                return providerSilentEmail({
                  familyName,
                  providerName,
                  providerPassed,
                  declineMessage: providerPassed ? (m.archive_message as string) || null : null,
                  recommendedProviders,
                  browseUrl,
                  city: provider?.city || null,
                  benefitsQuizUrl: buildQuizUrl(eid),
                });
              },
              stamp: async (sentAt) => {
                for (const c of fam.inquiries) {
                  await db
                    .from("connections")
                    .update({
                      metadata: {
                        ...metaOf(c),
                        family_alternatives_sent_at: sentAt,
                        family_alternatives_sent_by: "cron:family-comms-coordinator",
                        family_alternatives_count: alts.length,
                      },
                    })
                    .eq("id", c.id);
                }
              },
            };
          }
        }

        // ── Rung 3: never engaged → resource — inquiry 120-144h, family NEVER engaged,
        //    provider silent everywhere ──
        const alreadyNever = fam.inquiries.some((c) => metaOf(c).family_never_engaged_sent_at);
        const r3trigger = fam.inquiries.find((c) => {
          const a = ageMs(c);
          return a >= 120 * HOUR && a <= 144 * HOUR;
        });
        if (r3trigger && !familyEngagedAnywhere && !providerRespondedAnywhere && !alreadyNever) {
          const provider = norm(r3trigger.to_profile);
          const providerName = provider?.display_name || "the provider";
          // Compare-led when we have alternatives to show; guide-led fallback otherwise.
          const alts3 = await findAlternativeProviders(
            db,
            r3trigger.to_profile_id,
            provider?.city || undefined,
            provider?.state || undefined,
            (provider?.care_types as string[]) || [],
            familyLat,
            familyLng,
          );
          const hasAlts3 = alts3.length >= 3;
          return {
            rung: "never_engaged",
            emailType: "family_never_engaged",
            subject: familyNeverEngagedSubject(hasAlts3),
            metadata: { connection_id: r3trigger.id, recommended_count: alts3.length },
            buildHtml: (eid) => {
              const guideUrl = `${siteUrl}${appendTrackingParams("/olera-senior-care-guide-one-page.pdf", eid)}`;
              const inboxUrl = generateFamilyInboxUrl(authEmailFinal, appendTrackingParams("/portal/inbox", eid), siteUrl);
              const recommendedProviders = hasAlts3 ? alts3.map((p) => toCard(p, eid)) : undefined;
              return familyNeverEngagedEmail({
                familyName,
                providerName,
                guideUrl,
                inboxUrl,
                recommendedProviders,
                browseUrl: hasAlts3 ? buildBrowseUrl(provider, eid) : null,
                benefitsQuizUrl: buildQuizUrl(eid),
              });
            },
            stamp: async (sentAt) => {
              for (const c of fam.inquiries) {
                await db
                  .from("connections")
                  .update({
                    metadata: {
                      ...metaOf(c),
                      family_never_engaged_sent_at: sentAt,
                      family_never_engaged_sent_by: "cron:family-comms-coordinator",
                    },
                  })
                  .eq("id", c.id);
              }
            },
          };
        }

        // ── Rung 4: awaiting match — provider replied 9-11d ago, family hasn't replied ──
        const r4 = fam.inquiries.find((c) => {
          if (metaOf(c).day_10_awaiting_sent_at) return false;
          const firstResp = providerFirstResponseAt(c);
          if (firstResp === null) return false;
          const daysSince = (now - firstResp) / DAY;
          if (daysSince < 9 || daysSince > 11) return false;
          return !familyRepliedAfter(c, fam.familyId, firstResp);
        });
        if (r4) {
          const provider = norm(r4.to_profile);
          const providerName = provider?.display_name || "the provider";
          // A couple of others to compare against the one who responded.
          const alts4 = await findAlternativeProviders(
            db,
            r4.to_profile_id,
            provider?.city || undefined,
            provider?.state || undefined,
            (provider?.care_types as string[]) || [],
            familyLat,
            familyLng,
          );
          const hasAlts4 = alts4.length >= 2;
          return {
            rung: "awaiting_match",
            emailType: "day_10_awaiting",
            subject: hasAlts4
              ? `How does ${providerName} compare? A couple of others to weigh`
              : "Need a hand with the next step?",
            metadata: { connection_id: r4.id, recommended_count: alts4.length },
            buildHtml: (eid) => {
              const inboxUrl = generateFamilyInboxUrl(authEmailFinal, appendTrackingParams("/portal/inbox", eid), siteUrl);
              const alternativesUrl = buildBrowseUrl(provider, eid);
              const supportUrl = "mailto:support@olera.care?subject=Help%20with%20next%20steps";
              const recommendedProviders = hasAlts4 ? alts4.slice(0, 2).map((p) => toCard(p, eid)) : undefined;
              return day10AwaitingEmail({
                familyName,
                providerName,
                inboxUrl,
                supportUrl,
                alternativesUrl,
                recommendedProviders,
                benefitsQuizUrl: buildQuizUrl(eid),
              });
            },
            stamp: async (sentAt) => {
              await db
                .from("connections")
                .update({ metadata: { ...metaOf(r4), day_10_awaiting_sent_at: sentAt, day_10_awaiting_sent_by: "cron:family-comms-coordinator" } })
                .eq("id", r4.id);
            },
          };
        }

        // ── Rung 5: pending reach-out — request connection pending ≥3d, cooldown 7d ──
        const r5 = fam.requests.find((c) => {
          if (ageMs(c) < 3 * DAY) return false;
          const last = metaOf(c).family_reach_out_nudged_at as string | undefined;
          return !last || now - new Date(last).getTime() > 7 * DAY;
        });
        if (r5) {
          const provider = norm(r5.from_profile); // request: provider is from_profile
          const providerName = provider?.display_name || "a provider";
          const providerCity = provider?.city || provider?.state || "your area";
          return {
            rung: "pending_reach_out",
            emailType: "family_reach_out_nudge",
            subject: `${providerName} is waiting to hear from you`,
            metadata: { connection_id: r5.id },
            buildHtml: (eid) => {
              const viewUrl = generateFamilyInboxUrl(authEmailFinal, appendTrackingParams("/portal/inbox", eid), siteUrl);
              return familyPendingReachOutNudgeEmail({
                familyName,
                providerName,
                providerCity,
                messagePreview: r5.message || null,
                daysSinceReachOut: Math.floor((now - new Date(r5.created_at).getTime()) / DAY),
                viewUrl,
              });
            },
            stamp: async (sentAt) => {
              const m = metaOf(r5);
              await db
                .from("connections")
                .update({
                  metadata: {
                    ...m,
                    family_reach_out_nudged_at: sentAt,
                    family_reach_out_nudged_by: "cron:family-comms-coordinator",
                    family_reach_out_nudge_count: ((m.family_reach_out_nudge_count as number) || 0) + 1,
                  },
                })
                .eq("id", r5.id);
            },
          };
        }

        // ── Rung 6: stuck → completion as VALUE-EXCHANGE (the quiz) — inquiry ≥2d,
        //    profile incomplete, cooldown 7d. v2: completion is never a naked ask —
        //    the quiz both sharpens matches AND surfaces benefits. PUBLISH nudges are
        //    DEMOTED out of the coordinator entirely: the subordinated family-nudges
        //    machine owns them now (so complete-but-unpublished families match no
        //    coordinator rung here). ──
        if (!isComplete) {
          const flag = "family_nudged_at";
          const r6 = fam.inquiries.find((c) => {
            if (ageMs(c) < 2 * DAY) return false;
            const last = metaOf(c)[flag] as string | undefined;
            return !last || now - new Date(last).getTime() > 7 * DAY;
          });
          if (r6) {
            const provider = norm(r6.to_profile);
            const providerName = provider?.display_name || "the provider";
            return {
              rung: "lead_complete",
              emailType: "family_nudge",
              // The real inbox subject (front-loaded, mobile-safe). The cost hook
              // rides in the template's preheader so both show in the inbox row.
              subject: "A few more care options near you",
              metadata: { connection_id: r6.id },
              buildHtml: (eid) => {
                const profileUrl = appendTrackingParams(`${siteUrl}/portal/profile`, eid);
                return familyNudgeEmail({
                  unsubscribeId: fam.familyId,
                  familyName,
                  providerName,
                  missingFields: completeness.missingFields.slice(0, 5),
                  completionPercent: completeness.percentage,
                  profileUrl,
                  benefitsQuizUrl: buildQuizUrl(eid),
                });
              },
              stamp: async (sentAt) => {
                for (const c of fam.inquiries) {
                  await db
                    .from("connections")
                    .update({ metadata: { ...metaOf(c), [flag]: sentAt, family_nudged_by: "cron:family-comms-coordinator" } })
                    .eq("id", c.id);
                }
              },
            };
          }
        }

        return null;
      }

      if (!plan) {
        counts.skipped++;
        counts.stops.no_rung++;
        continue;
      }

      if (dryRun) {
        bump(plan.rung);
        counts.sent++;
        continue;
      }

      // A rung matched — NOW resolve the deliverable email (direct, then auth-admin fallback).
      {
        let familyEmail = directEmail;
        let authEmail = directEmail;
        if (fp.account_id) {
          const { data: acct } = await db.from("accounts").select("user_id").eq("id", fp.account_id).single();
          if (acct?.user_id) {
            const {
              data: { user: authUser },
            } = await db.auth.admin.getUserById(acct.user_id);
            if (authUser?.email) {
              authEmail = authUser.email;
              if (!familyEmail) familyEmail = authEmail;
            }
          }
        }
        if (!familyEmail) {
          counts.skipped++;
          counts.stops.no_email++;
          continue;
        }
        recipient = familyEmail;
        authEmailFinal = authEmail || familyEmail;
      }

      // Reserve → build → send → stamp.
      const emailLogId = await reserveEmailLogId({
        to: recipient,
        subject: plan.subject,
        emailType: plan.emailType,
        recipientType: "family",
        metadata: { ...plan.metadata, coordinator_rung: plan.rung },
      });
      const html = await plan.buildHtml(emailLogId, authEmailFinal);
      const { success } = await sendEmail({
        to: recipient,
        subject: plan.subject,
        html,
        emailType: plan.emailType,
        recipientType: "family",
        metadata: { ...plan.metadata, coordinator_rung: plan.rung },
        emailLogId: emailLogId ?? undefined,
      });
      if (!success) {
        counts.skipped++;
        counts.stops.send_failed++;
        continue;
      }

      const sentAt = new Date().toISOString();
      await plan.stamp(sentAt);
      // Unified coordinator stamp on the family profile (subordinated crons read this).
      await db
        .from("business_profiles")
        .update({ metadata: { ...familyMeta, last_coordinator_email_at: sentAt, last_coordinator_rung: plan.rung } })
        .eq("id", fam.familyId);

      bump(plan.rung);
      counts.sent++;
    }

    return { ok: true, ...counts };
  });
}
