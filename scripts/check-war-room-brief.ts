import assert from "node:assert/strict";
import { buildPriorityLines, priorityFor } from "../lib/war-room/priorities";
import { buildWarRoomBriefText, easternDay, isSweepDay, renewalText, sendableQuestion } from "../lib/war-room/brief-delivery.server";
import { fallbackMove, parseMoveReply, pickMove, toFounder, type MoveCandidate } from "../lib/war-room/brief-move.server";
import { scrubStaleRenewalCounts } from "../lib/war-room/discovery.server";

// The brief leads with one move, asks at most one question he alone can
// answer, and puts everything measured below a divider.

const run = { status: "completed" as const, created_at: "2026-09-24T10:30:09Z", error_message: null, source_summary: {} };
const base = {
  run,
  siteUrl: "https://olera.care",
  readings: [],
  proposals: [],
  approvedOpen: [],
  open: 6,
  watching: 6,
  costUsd: 2.39,
};
const DIVIDER = "───────────";

// 1. A move is the first line, with its draft quoted under it, and the data is below the divider.
const withMove = buildWarRoomBriefText({
  ...base,
  proposals: [{ title: "Funnel split", why_now: "x", decision_required: "y", created_at: "2026-09-23T04:41:41Z" }],
  approvedOpen: [{ title: "Call Liz", approved_at: "2026-09-21T14:04:46Z", assigned_owner: "TJ" }],
  move: { title: "Call Liz", line: "Hoop Cares renews in 29 days. Ces should call Liz Hoop this week.", draft: "Hi Liz,\nQuick one." },
});
const lines = withMove.split("\n");
assert.equal(lines[0], "*Hoop Cares renews in 29 days. Ces should call Liz Hoop this week.*");
assert.ok(withMove.indexOf("> Hi Liz,") < withMove.indexOf(DIVIDER), "draft sits above the divider");
assert.ok(withMove.indexOf("_This scan cost $2.39._") > withMove.indexOf(DIVIDER), "cost sits below the divider");
assert.ok(!withMove.includes("• Call Liz"), "the move is not repeated in the lists below");
assert.ok(withMove.includes("• Funnel split"), "other waiting decisions stay below the divider");

// 2. Nothing passes: one short line, then the data.
const quiet = buildWarRoomBriefText(base);
assert.equal(quiet.split("\n")[0], "Nothing needs you today.");

// 3. A question that fails the founder-answerable test is never sent.
const analystQuestion = {
  investigationId: "i1",
  title: "Direct traffic",
  question: "What composes the 4,992 Direct sessions by landing-page family?",
};
assert.equal(sendableQuestion(analystQuestion), null);
const noBadQuestion = buildWarRoomBriefText({ ...base, question: analystQuestion });
assert.ok(!noBadQuestion.includes("4,992"), "an analyst-grade question is dropped");
assert.equal(noBadQuestion.split("\n")[0], "Nothing needs you today.");

// 4. A good question leads when there is no move, named by its title.
const good = { investigationId: "i2", title: "Starter tier", question: "Seen 42 times since 2026-08-16 and it hasn't moved. Make a real plan for it, or stop raising it?" };
assert.ok(sendableQuestion(good), "the stalled-condition question passes the founder test");
const asked = buildWarRoomBriefText({ ...base, question: good });
assert.ok(asked.startsWith("*Only you can answer this.* Starter tier: Seen 42 times"));
assert.equal((asked.slice(0, asked.indexOf(DIVIDER)).match(/\?/g) ?? []).length, 1, "at most one question above the divider");

// 5. Failed scans still report loudly and ask nothing.
const failed = buildWarRoomBriefText({ ...base, run: { ...run, status: "failed", error_message: "boom" }, question: good });
assert.ok(failed.includes("scan failed") && !failed.includes("Only you can answer"));

// 6. Move choice: approved work nobody did outranks a waiting decision; oldest first.
const candidate = (over: Partial<MoveCandidate>): MoveCandidate => ({
  kind: "decision_waiting", title: "t", why_now: "Because. More.", decision_required: null, assigned_owner: null,
  action_kind: null, proposed_solution: null, finding: null, execution_plan: null, evidence: null, since: null, ...over,
});
const approvedOld = candidate({ kind: "approved_not_done", title: "old", since: "2026-09-01" });
const approvedNew = candidate({ kind: "approved_not_done", title: "new", since: "2026-09-20" });
const waiting = candidate({ title: "waiting", since: "2026-08-01" });
assert.equal(pickMove([approvedNew, approvedOld], [waiting])?.title, "old");
assert.equal(pickMove([], [waiting])?.title, "waiting");
assert.equal(pickMove([], []), null);

// 7. The fallback is one plain sentence from the row, and the model's reply is bounded.
assert.equal(fallbackMove(candidate({ title: "Approve the report" })).line, "Decide: Approve the report. Because.");
// Real titles end in "?" and real why_now text carries em dashes.
assert.equal(
  fallbackMove(candidate({ title: "Are prompts opened at all?", why_now: "Calls are scarce — so check first. More." })).line,
  "Decide: Are prompts opened at all? Calls are scarce, so check first.",
);
assert.equal(
  fallbackMove(candidate({ kind: "approved_not_done", title: "Ask her why she paid", assigned_owner: "TJ (Ces helps)" })).line,
  "Do: Ask her why she paid. Owner: you (Ces helps). Because.",
);
assert.equal(parseMoveReply('{"line":"Call *Liz* Hoop this week.","draft":null}')?.line, "Call Liz Hoop this week.");
assert.deepEqual(parseMoveReply('{"line":"Approve the funnel report today.","draft":null}'), { line: "Approve the funnel report today.", draft: null });
assert.equal(parseMoveReply('{"line":"Call Liz this week — renewal is close.","draft":null}')?.line, "Call Liz this week, renewal is close.");
assert.equal(parseMoveReply("not json"), null);
assert.equal(parseMoveReply('{"line":"short"}'), null);

// 8. A provider moment outranks approved work and waiting decisions.
const moment = candidate({ kind: "provider_moment", title: "Assisting Hands: wants a deeper partnership", since: "2026-09-25" });
assert.equal(pickMove([approvedOld], [waiting], [moment])?.title, "Assisting Hands: wants a deeper partnership");
assert.equal(fallbackMove(moment).line.startsWith("Provider email: "), true);

// 9. Other provider emails are listed below the divider, never repeated as the move.
const withMoments = buildWarRoomBriefText({
  ...base,
  move: { title: "Assisting Hands: wants a deeper partnership", line: "Robbie in Dallas wants to partner.", draft: null, kind: "provider_moment" },
  moments: [{ title: "Assisting Hands: wants a deeper partnership" }, { title: "Hoop Cares: waiting on a reply" }],
});
assert.ok(withMoments.indexOf("• Hoop Cares: waiting on a reply") > withMoments.indexOf(DIVIDER));
assert.ok(!withMoments.includes("• Assisting Hands"), "the leading moment is not listed again");
assert.ok(!withMoments.includes("Already done?"), "only approved work gets the mark-done nudge");

// 10. Stale renewal counts from notes and memory are removed; definitions stay.
assert.equal(scrubStaleRenewalCounts("1 of 12 paid providers with 27-day renewal risk"), "1 of 12 paid providers with renewal risk");
assert.equal(scrubStaleRenewalCounts("one subscriber renewing in 26 days"), "one subscriber renewing on the date in dateFacts");
assert.equal(scrubStaleRenewalCounts("count 30-day inquiries with a failed send"), "count 30-day inquiries with a failed send");

// 11. The renewal is Stripe's next charge, not the ad flight's end, and shows
// above the divider every day it is within 30 days.
const renewal = { name: "Hoop Cares", renewsOn: "2026-10-15", daysUntilRenewal: 20, amount: 75, flightEndsOn: "2026-10-20", daysUntilFlightEnd: 25, source: "stripe" as const };
const withRenewal = buildWarRoomBriefText({ ...base, renewal });
assert.ok(withRenewal.startsWith("_Hoop Cares renews Oct 15 ($75), in 20 days. Her ad flight ends Oct 20._"));
assert.ok(withRenewal.indexOf("Hoop Cares") < withRenewal.indexOf(DIVIDER));
assert.equal(renewalText({ ...renewal, daysUntilRenewal: 45 }), null);
// Stripe unreadable: name the flight end as what it is, never as a renewal.
assert.equal(
  renewalText({ ...renewal, renewsOn: null, daysUntilRenewal: null, source: "flight_end" }),
  "_Hoop Cares's ad flight ends Oct 20, in 25 days. Billing date unread._",
);

// 12. A brief-only day says so instead of pricing a scan that did not run.
const briefOnlyText = buildWarRoomBriefText({ ...base, costUsd: null, briefOnly: true });
assert.ok(briefOnlyText.includes("_No full scan today; it runs Mon, Wed, Fri."));
assert.ok(!briefOnlyText.includes("Scan cost unknown"));

// 13. Sweep days are US Eastern weekdays: 01:00 UTC Tuesday is still Monday in New York.
assert.equal(easternDay(new Date("2026-09-29T01:00:00Z")).date, "2026-09-28");
assert.equal(isSweepDay(new Date("2026-09-29T01:00:00Z")), true);   // Monday ET
assert.equal(isSweepDay(new Date("2026-09-29T14:30:00Z")), false);  // Tuesday ET
assert.equal(isSweepDay(new Date("2026-09-25T14:30:00Z")), true);   // Friday ET

// 14. The four priorities open the brief, every day, and every number is filed under one or cut.
assert.equal(priorityFor("Provider reachability"), "providers");
assert.equal(priorityFor("Support backlog"), "operations");
assert.equal(priorityFor("Organic traffic"), null, "traffic attribution serves none of the four");
assert.equal(priorityFor("Benefits completions"), "benefits");
assert.equal(priorityFor("Paying providers"), "crp");
const priorityLines = buildPriorityLines({
  payingProviders: 1, openCampaigns: 18,
  movers: [{ label: "Support backlog", headline: "1,222 unhandled support threads", previousHeadline: "1,747 unhandled support threads" }, { label: "Organic traffic", headline: "Direct up 4%" }],
  renewal: "Hoop Cares renews Oct 15 ($75), in 17 days.", providerEmailsWaiting: 0, inboxItemsWaiting: 3, since: "Sep 26",
  now: new Date("2026-09-28T12:00:00Z"),
});
assert.deepEqual(priorityLines, [
  "*CRP (Jan):* 1 of 12 paying providers, 14 weeks to the Jan 5 target.",
  "*Benefits Finder:* No measured number moved since Sep 26.",
  "*Providers subscribing:* Hoop Cares renews Oct 15 ($75), in 17 days. 18 campaigns open, 1 paying.",
  "*Operations:* Support backlog 1,747 → 1,222. 3 inbox items waiting on your approval.",
]);
// A priority nothing measures still says what shipped (TJ, 5 Oct: "Benefits Finder: No change since Oct 3" was wrong).
{
  const { groupShipped, shippedLine } = require("../lib/war-room/shipped.server") as typeof import("../lib/war-room/shipped.server");
  const floor = Date.parse("2026-10-02T12:00:00Z");
  const grouped = groupShipped([
    { number: 2330, title: "Benefits knowledge base, Phase 1: judge, provenance, versions", mergedAt: "2026-10-02T08:42:47Z", base: "staging", head: "knowledge-base-phase1" },
    { number: 2336, title: "Benefits fact-check: DC", mergedAt: "2026-10-03T00:37:22Z", base: "staging", head: "benefits-factcheck/1" },
    { number: 2346, title: "Move both phone fields when the judge applies a phone", body: "The judge's --phones path in scripts/benefits-apply-factcheck.js updated one field.", mergedAt: "2026-10-03T00:37:32Z", base: "staging", head: "judge-phone-both" },
    { number: 2348, title: "Promote staging → main: Google reviews refresh, DC fact-check (2026-10-03)", mergedAt: "2026-10-03T09:00:00Z", base: "main", head: "staging" },
    { number: 2360, title: "Scratchpad: Robbie's first pilot family (4 Oct)", mergedAt: "2026-10-04T03:00:00Z", base: "staging", head: "claude/scratchpad" },
    { number: 2366, title: "Own-ad family emails open the provider's inbox, signed in", mergedAt: "2026-10-05T08:00:00Z", base: "staging", head: "lead-email-inbox-link" },
    { number: 2322, title: "Daily inbox synopsis on Telegram, full detail as a handoff", mergedAt: "2026-10-01T22:00:00Z", base: "staging", head: "x" },
  ], floor);
  assert.deepEqual(grouped.benefits?.map((i) => i.number), [2336, 2346], "benefits PRs merged after the floor; the judge fix is filed by its description");
  assert.ok(!Object.values(grouped).flat().some((i) => i.number === 2348 || i.number === 2360 || i.number === 2322), "promotions, scratchpad logs and older merges are left out");
  assert.ok(!grouped.benefits?.some((i) => i.number === 2330), "a PR merged before the last brief is not news again");
  assert.equal(shippedLine(grouped.benefits, "Oct 3"), "Shipped since Oct 3: Benefits fact-check: DC (#2336), Move both phone fields when the judge applies a phone (#2346).");
  assert.equal(shippedLine(undefined, "Oct 3"), null);
  const lines = buildPriorityLines({
    payingProviders: 1, openCampaigns: 20, movers: [], renewal: null, providerEmailsWaiting: 0, inboxItemsWaiting: 0, since: "Oct 3",
    shipped: { benefits: shippedLine(grouped.benefits, "Oct 3") }, now: new Date("2026-10-05T01:00:00Z"),
  });
  assert.equal(lines[1], "*Benefits Finder:* Shipped since Oct 3: Benefits fact-check: DC (#2336), Move both phone fields when the judge applies a phone (#2346).");
  assert.equal(lines[3], "*Operations:* No measured number moved since Oct 3.");
  console.log("shipped checks passed");
}

const withPriorities = buildWarRoomBriefText({ ...base, renewal, priorityLines, readings: [
  { probeId: "traffic_by_page_family", label: "Organic traffic", question: "", headline: "Direct up 4%", detail: "", rows: [], caveat: null, measuredAt: base.run.created_at, movement: "moved", previousHeadline: "Direct flat" } as never,
  { probeId: "support_backlog_composition", label: "Support backlog", question: "", headline: "1,222 unhandled", detail: "", rows: [], caveat: null, measuredAt: base.run.created_at, movement: "moved", previousHeadline: "1,747 unhandled" } as never,
] });
assert.ok(withPriorities.startsWith("*CRP (Jan):*"), "the brief opens with the four");
assert.equal(withPriorities.match(/Hoop Cares renews/g)?.length, 1, "the renewal is said once, in the providers line");
assert.ok(!withPriorities.includes("Organic traffic"), "a number that serves no priority is cut");
assert.ok(/\*What moved\*\n• \*Support backlog\*/.test(withPriorities), "a number that serves one stays");

console.log("war room brief checks passed");

// The line speaks to the founder: a live render on 2026-09-27 wrote "TJ offered Robbie ...".
assert.equal(toFounder("TJ offered Robbie Wed 9/30 at 9:00; now wait for TJ's answer."), "You offered Robbie Wed 9/30 at 9:00; now wait for your answer.");
assert.equal(parseMoveReply('{"line":"TJ and Ces call Liz Hoop this week before her renewal.","draft":"Hi Liz, TJ here."}')?.line, "You and Ces call Liz Hoop this week before her renewal.");
assert.equal(parseMoveReply('{"line":"TJ and Ces call Liz Hoop this week before her renewal.","draft":"Hi Liz, TJ here."}')?.draft, "Hi Liz, TJ here.");
console.log("founder voice checks passed");
assert.ok(!/\bTJ\b/.test(fallbackMove({ kind: "approved_not_done", title: "Ship the funnel split", why_now: "TJ approved it Monday.", assigned_owner: "TJ" } as MoveCandidate).line), "the fallback line speaks to the founder too");
console.log("fallback voice check passed");
