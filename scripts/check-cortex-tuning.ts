/**
 * Deterministic checks for Cortex tuning (lib/war-room/tuning.ts).
 *
 *   npx tsx scripts/check-cortex-tuning.ts
 */
import assert from "node:assert/strict";
import { foldTuning, gradeFromReaction, initiativeFromPostKey, parseTuningReply, shouldSpeakDaily, shouldSpeakWeekly, tuningAck } from "../lib/war-room/tuning";

// Defaults when nothing has been said: daily, directory fences alone.
const empty = foldTuning("directory", []);
assert.equal(empty.cadence, "daily");
assert.deepEqual(empty.fences, { renames: "alone", archive: "alone" });

// Newest row wins for cadence and for each fence; lessons accumulate; grades count.
const folded = foldTuning("directory", [
  { initiative: "directory", kind: "cadence", value: "weekly", created_at: "2026-10-07T01:00:00Z" },
  { initiative: "directory", kind: "cadence", value: "daily", created_at: "2026-10-06T01:00:00Z" },
  { initiative: "directory", kind: "fence", value: "renames=ask", created_at: "2026-10-07T02:00:00Z" },
  { initiative: "directory", kind: "fence", value: "renames=alone", created_at: "2026-10-06T02:00:00Z" },
  { initiative: "directory", kind: "fence", value: "bogus=ask", created_at: "2026-10-07T03:00:00Z" },
  { initiative: "directory", kind: "lesson", value: "Franchise locations are not duplicates.", created_at: "2026-10-05T00:00:00Z" },
  { initiative: "directory", kind: "grade", value: "up", created_at: "2026-10-05T00:00:00Z" },
  { initiative: "directory", kind: "grade", value: "down", created_at: "2026-10-05T00:00:00Z" },
  { initiative: "directory", kind: "grade", value: "up", created_at: "2026-10-05T00:00:00Z" },
]);
assert.equal(folded.cadence, "weekly", "the 7 Oct row beats the 6 Oct row whatever order they arrive in");
assert.equal(folded.fences.renames, "ask");
assert.equal(folded.fences.archive, "alone");
assert.equal(folded.fences.bogus, "ask", "an unknown setting is kept (harmless) rather than crashing");
assert.deepEqual(folded.lessons, ["Franchise locations are not duplicates."]);
assert.deepEqual(folded.grades, { up: 2, down: 1 });

// Cadence: weekly speaks on Mondays only; off never; the Monday state post survives weekly.
const monday = new Date("2026-10-12T06:00:00Z");
const tuesday = new Date("2026-10-13T06:00:00Z");
assert.ok(shouldSpeakDaily("daily", tuesday));
assert.ok(shouldSpeakDaily("weekly", monday));
assert.ok(!shouldSpeakDaily("weekly", tuesday));
assert.ok(!shouldSpeakDaily("off", monday));
assert.ok(shouldSpeakWeekly("weekly"));
assert.ok(!shouldSpeakWeekly("off"));

// Post keys map to initiatives.
assert.equal(initiativeFromPostKey("thread:directory"), "directory");
assert.equal(initiativeFromPostKey("directory:2026-10-07"), "directory");
assert.equal(initiativeFromPostKey("directory-week:2026-10-12"), "directory");
assert.equal(initiativeFromPostKey("providers:2026-10-12"), "providers");
assert.equal(initiativeFromPostKey("meeting:abc"), "meetings");
assert.equal(initiativeFromPostKey("handoffs:2026-10-07"), "product");
assert.equal(initiativeFromPostKey("thread:nonsense"), null);
assert.equal(initiativeFromPostKey("something-else"), null);

// Reactions: verdicts only.
assert.equal(gradeFromReaction("+1"), "up");
assert.equal(gradeFromReaction("thumbsup::skin-tone-4"), "up");
assert.equal(gradeFromReaction("-1"), "down");
assert.equal(gradeFromReaction("eyes"), null);

// The model's answer: JSON with known keys only; NONE and junk are null.
assert.equal(parseTuningReply("directory", "NONE"), null);
assert.equal(parseTuningReply("directory", "sure thing"), null);
assert.deepEqual(parseTuningReply("directory", '{"cadence":"weekly"}'), { cadence: "weekly" });
assert.deepEqual(parseTuningReply("directory", 'Here you go: {"fence":{"setting":"renames","value":"ask"}}'), { fence: { setting: "renames", value: "ask" } });
assert.equal(parseTuningReply("directory", '{"fence":{"setting":"category","value":"ask"}}'), null, "a knob the initiative does not have is dropped");
assert.equal(parseTuningReply("directory", '{"cadence":"hourly"}'), null);
assert.deepEqual(parseTuningReply("directory", '{"lesson":"Franchise locations are not duplicates."}'), { lesson: "Franchise locations are not duplicates." });

// The acknowledgement names the way back.
assert.match(tuningAck("directory", { cadence: "weekly" }), /Mondays only.*"daily"/);
assert.match(tuningAck("directory", { fence: { setting: "renames", value: "ask" } }), /waits for a person.*renames alone/);

console.log("cortex tuning checks passed");
