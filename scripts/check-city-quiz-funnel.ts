import assert from "node:assert/strict";
import { classifyReferrer } from "../lib/analytics/referrer";
import { buildQuizFunnel, type QuizEvent, type QuizLead } from "../lib/city-ads/quiz-funnel";
const event = (overrides: Partial<QuizEvent> = {}): QuizEvent => ({ anonymous_id: "paid", visit_id: "visit", page_path: "/care/dallas-tx", occurred_at: "2026-09-10T08:00:00Z", event_type: "page_landed", metadata: { utm_medium: "paid_search", referrer_class: "search", gclid: true }, ...overrides });
const step = (overrides: Partial<QuizEvent> = {}) => event({ event_type: "cta_engaged", occurred_at: "2026-09-10T08:01:00Z", metadata: { referrer_class: "direct" }, ...overrides });
const campaign = [{ slug: "dallas-tx", channel: "google" }];
const lead: QuizLead = { slug: "dallas-tx", utm_source: "olera_city", utm_medium: "paid_search", gclid: "click", fbclid: null, is_test: false };
const result = buildQuizFunnel([
  event(), event(), step(), step(),
  step({ event_type: "lead_started", occurred_at: "2026-09-10T08:02:00Z" }),
  // Same browser, different visit must not credit another stage.
  step({ visit_id: "other" }), step({ page_path: "/care/charlotte-nc" }),
  step({ occurred_at: "2026-09-10T07:59:00Z" }), step({ anonymous_id: null }),
  event({ anonymous_id: "test", metadata: { utm_medium: "paid_search", referrer_class: "olera_internal" } }),
  step({ anonymous_id: "test" }),
  event({ anonymous_id: "direct", metadata: { utm_medium: "paid_meta", referrer_class: "direct" } }),
  // A second paid visit by the same visitor counts as a visit, not a new visitor.
  event({ visit_id: "return" }), step({ visit_id: "return" }),
], [lead, { ...lead, is_test: true }], campaign);
assert.deepEqual(result.rows[0], { slug: "dallas-tx", channel: "google", visitors: 1, visits: 2, starts: 1, contacts: 1, submissions: 1 });
assert.equal(result.excludedLandings, 2);
assert.equal(result.unmatchedEvents, 5);
const conflict = buildQuizFunnel([event(), event({ metadata: { utm_medium: "paid_meta", referrer_class: "social" } }), step()], [], campaign);
assert.equal(conflict.ambiguousVisits, 1); assert.equal(conflict.rows[0].visitors, 0); assert.equal(conflict.rows[0].starts, 0);
assert.equal(buildQuizFunnel([], [lead], campaign).rows[0].submissions, 1, "Untracked historical lead is preserved separately");
assert.equal(buildQuizFunnel([], [], campaign).rows[0].visitors, 0);
console.log("PASS: same-visit attribution, duplicates, internal/direct exclusions, chronology, cross-page isolation, conflicting channels and real lead counts");

// Use the actual ingestion classifier: Nextdoor is "other", not "social".
const nextdoor = buildQuizFunnel([event({ metadata: { utm_medium: "paid_social", referrer_class: classifyReferrer("https://nextdoor.com/") } }), step()], [], []);
assert.equal(nextdoor.rows[0].channel, "nextdoor");
assert.equal(nextdoor.rows[0].visitors, 1);
assert.equal(nextdoor.rows[0].starts, 1);
const partial = buildQuizFunnel([event(), step({ event_type: "lead_started" })], [], campaign);
assert.equal(partial.rows[0].starts, 0, "Do not invent a missing quiz-start event");
assert.equal(partial.rows[0].contacts, 1, "Preserve observed contact reach even if the start ping was lost");
console.log("PASS: Nextdoor ingestion referrer and incomplete stage telemetry");
