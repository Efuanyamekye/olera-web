/**
 * Providers getting traction but not engaged, the pure part: scoring, the
 * two lists, and the words. The database side is provider-traction.server.ts;
 * scripts/check-provider-traction.ts checks this file.
 *
 * TJ's activity list, 7 Oct 2026: "Identification and analysis of providers
 * who are getting traction, but not engaged." Traction is families acting on
 * the page in the last 28 days: questions asked, inquiries sent, page views.
 * Engaged is the provider acting: answered, opened a lead, edited the
 * profile, arrived at the dashboard, clicked through from an email.
 *
 * Two lists come out, because they want different things:
 *   unclaimed      demand on a listing nobody owns  -> a claim invitation
 *   claimed_silent demand on a listing someone owns and has not touched in 28 days -> a nudge
 * Bulk claims made from inside Olera (an olera.care owner) are not "the
 * provider has an account" and are listed as unclaimed.
 */

export const TRACTION_WINDOW_DAYS = 28;

/** Provider-as-actor events in provider_activity. page_view and the family-side events are not. */
export const ACTOR_EVENT_TYPES = [
  "question_responded", "lead_opened", "provider_profile_edited", "dashboard_arrival",
  "one_click_access", "email_click", "claim_completed", "phone_clicked", "email_link_clicked",
] as const;

export type TractionRow = {
  provider_id: string;
  slug: string;
  provider_name: string | null;
  city: string | null;
  state: string | null;
  category: string | null;
  views: number;
  questions: number;
  inquiries: number;
  /** Claimed by someone outside Olera. */
  claimed: boolean;
  /** Last provider-as-actor event, any time. */
  lastActorAt: string | null;
  hasEmail: boolean;
};

export type TractionBucket = "unclaimed" | "claimed_silent" | "claimed_active";

/** Questions and inquiries are intent; views are interest. One inquiry outweighs a page of views. */
export function tractionScore(r: Pick<TractionRow, "views" | "questions" | "inquiries">): number {
  return r.views + 10 * r.questions + 25 * r.inquiries;
}

export function bucketOf(r: TractionRow, now: Date): TractionBucket {
  if (!r.claimed) return "unclaimed";
  const cutoff = now.getTime() - TRACTION_WINDOW_DAYS * 86_400_000;
  return r.lastActorAt && Date.parse(r.lastActorAt) >= cutoff ? "claimed_active" : "claimed_silent";
}

export type TractionLists = {
  unclaimed: TractionRow[];
  claimedSilent: TractionRow[];
  counts: Record<TractionBucket, number>;
};

/**
 * Rank and split. Only providers with intent (a question or an inquiry)
 * qualify: views alone are too easy to get from a city page listing.
 */
export function buildTractionLists(rows: TractionRow[], now: Date, limit = 10): TractionLists {
  const counts: Record<TractionBucket, number> = { unclaimed: 0, claimed_silent: 0, claimed_active: 0 };
  const withIntent = rows.filter((r) => r.questions + r.inquiries > 0);
  const byScore = (a: TractionRow, b: TractionRow) => tractionScore(b) - tractionScore(a);
  const unclaimed: TractionRow[] = [];
  const claimedSilent: TractionRow[] = [];
  for (const r of withIntent) {
    const b = bucketOf(r, now);
    counts[b] += 1;
    if (b === "unclaimed") unclaimed.push(r);
    else if (b === "claimed_silent") claimedSilent.push(r);
  }
  return { unclaimed: unclaimed.sort(byScore).slice(0, limit), claimedSilent: claimedSilent.sort(byScore).slice(0, limit), counts };
}

const n = (v: number) => v.toLocaleString("en-US");

function demandWords(r: TractionRow): string {
  const parts: string[] = [];
  if (r.inquiries) parts.push(`${n(r.inquiries)} inquir${r.inquiries === 1 ? "y" : "ies"}`);
  if (r.questions) parts.push(`${n(r.questions)} question${r.questions === 1 ? "" : "s"}`);
  if (r.views) parts.push(`${n(r.views)} view${r.views === 1 ? "" : "s"}`);
  return parts.join(", ");
}

function silentWords(r: TractionRow, now: Date): string {
  if (!r.lastActorAt) return "never acted";
  const days = Math.floor((now.getTime() - Date.parse(r.lastActorAt)) / 86_400_000);
  return `last acted ${n(days)} days ago`;
}

/**
 * The Monday post. Names come with links; the counts say how big each pile
 * is beyond the names shown. Null when nothing qualifies, so a quiet month
 * says nothing (the Monday state line is elsewhere).
 */
export function tractionText(lists: TractionLists, now: Date, siteUrl: string): string | null {
  const link = (r: TractionRow) => `<${siteUrl}/provider/${r.slug}|${r.provider_name ?? r.slug}>${r.city ? ` (${r.city}${r.state ? `, ${r.state}` : ""})` : ""}`;
  if (!lists.claimedSilent.length && !lists.unclaimed.length) return null;
  const lines: string[] = [`*Providers with traction, last ${TRACTION_WINDOW_DAYS} days.* Families acted on these pages; the providers did not.`];
  if (lists.claimedSilent.length) {
    lines.push(`Claimed and silent (${n(lists.counts.claimed_silent)}): the owner has an account and has not touched it since the families came.`);
    for (const r of lists.claimedSilent) lines.push(`• ${link(r)}: ${demandWords(r)}; ${silentWords(r, now)}${r.hasEmail ? "" : "; no email on file"}`);
  }
  if (lists.unclaimed.length) {
    lines.push(`Unclaimed with demand (${n(lists.counts.unclaimed)}): nobody owns the page the families are using.`);
    for (const r of lists.unclaimed) lines.push(`• ${link(r)}: ${demandWords(r)}${r.hasEmail ? "" : "; no email on file"}`);
  }
  const active = lists.counts.claimed_active;
  lines.push(`${n(active)} claimed provider${active === 1 ? "" : "s"} with demand did act this month. Reply here with a name and I will pull up what I know; nothing is sent to anyone without a person.`);
  return lines.join("\n");
}
