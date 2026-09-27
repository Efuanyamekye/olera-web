/**
 * Checks for Cortex as inbox operator.
 *
 *   npx tsx --env-file=.env.local scripts/check-cortex-inbox.ts
 *
 * With --live, builds the digest from today's real queue, read-only (Sonnet
 * drafts up to three emails, about $0.06). Nothing is stored or sent.
 */
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import {
  buildInboxProposals, cleanSubject, clip, isSmsBookkeeping, parseInboxCommand, renderDigest, waitingOnUs, type StoredItem,
} from "../lib/war-room/inbox-operator.server";

// --- Commands.
assert.deepEqual(parseInboxCommand("approve 1 2"), { verb: "approve", numbers: [1, 2], edit: null });
assert.deepEqual(parseInboxCommand("send 3"), { verb: "approve", numbers: [3], edit: null });
assert.deepEqual(parseInboxCommand("yes 1, 2 and 4"), { verb: "approve", numbers: [1, 2, 4], edit: null });
assert.deepEqual(parseInboxCommand("skip 4"), { verb: "skip", numbers: [4], edit: null });
assert.deepEqual(parseInboxCommand("approve all"), { verb: "approve", numbers: [], edit: null });
assert.deepEqual(parseInboxCommand("send 3: Hi Barbara, it's TJ. Call Hoop Cares at 228-555-0100."), { verb: "approve", numbers: [3], edit: "Hi Barbara, it's TJ. Call Hoop Cares at 228-555-0100." });
assert.equal(parseInboxCommand("send 2 3: text"), null, "an edit applies to one item");
assert.equal(parseInboxCommand("Approved, go ahead"), null, "a proposal approval is not an inbox command");
assert.equal(parseInboxCommand("send me the plan"), null);
console.log("command checks passed");

// --- SMS bookkeeping vs conversation.
assert.equal(isSmsBookkeeping("STOP", null), "STOP");
assert.equal(isSmsBookkeeping("CALLED", "CALLED"), "CALLED");
assert.equal(isSmsBookkeeping("STUCK", "STUCK"), null, "STUCK is a conversation");
assert.equal(isSmsBookkeeping("My mother fell and we need help", null), null);
console.log("sms triage checks passed");

// --- Never surface handled work: the newest message must be theirs.
const at = (iso: string) => iso;
assert.equal(waitingOnUs([
  { direction: "in", from_email: "robbie@example.com", internal_date: at("2026-09-25T15:11:57Z") },
  { direction: "out", from_email: "support@olera.care", internal_date: at("2026-09-26T23:15:15Z") },
]), false, "TJ replied last");
assert.equal(waitingOnUs([
  { direction: "out", from_email: "support@olera.care", internal_date: at("2026-09-25T07:04:30Z") },
  { direction: "in", from_email: "robbie@example.com", internal_date: at("2026-09-25T15:11:57Z") },
]), true, "their reply after ours is waiting");
assert.equal(waitingOnUs([{ direction: "in", from_email: "ces@olera.care", internal_date: at("2026-09-26T01:00:00Z") }]), false, "a teammate's handoff is not a customer");
console.log("thread direction checks passed");

// --- The digest.
const item = (number: number, kind: StoredItem["kind"], summary: string, body?: string): StoredItem => ({
  id: String(number), pass_id: "p", number, kind, category: kind, target: {}, summary, body: body ?? null, status: "proposed", created_at: "",
});
const digest = renderDigest({
  passId: "p",
  items: [
    item(1, "triage_batch", "Archive 126 noise emails."),
    item(2, "sms_draft", "Text Barbara.", "Hi Barbara, it's Olera."),
    item(3, "email_draft", "Email Robbie.", "Hi Robbie,\nWednesday works."),
    item(4, "question", "Maria texted STUCK."),
  ],
  waitingElsewhere: 9,
  costUsd: 0,
});
assert.match(digest, /\*Clear\*\n1\. Archive 126/);
assert.match(digest, /> Hi Robbie,\n> Wednesday works\./, "a draft is quoted line by line");
assert.match(digest, /You send it/, "email is drafted, never sent");
assert.match(digest, /approve 1 2 3"/, "the question is not in approve-all");
assert.match(digest, /9 more need a person/);
assert.equal(cleanSubject("Re: Re:Ã‚Â Your first step for SMMC"), "Your first step for SMMC");
assert.equal(clip("one two three four five", 12), "one two...");
console.log("digest checks passed");

(async () => {
  const { readOnly } = await import("./replay-cortex-conversation");
  const db = readOnly(createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!));

  // The Robbie regression, live: TJ answered on 26 Sep, so his thread must not be offered.
  const { data: robbie } = await db.from("support_email_messages")
    .select("direction, from_email, internal_date")
    .eq("thread_id", "b5f8a774-bda1-4780-adbe-c0057aa4ce48");
  if (robbie?.length) {
    assert.equal(waitingOnUs(robbie as never), false, "Robbie's thread, answered by TJ, is not surfaced");
    console.log("Robbie regression passed (live thread)");
  }

  if (!process.argv.includes("--live")) return;
  const built = await buildInboxProposals(db);
  const sample = renderDigest({
    passId: "sample",
    items: built.proposed.map((p, i) => ({ ...p, id: String(i), pass_id: "sample", number: i + 1, status: "proposed", created_at: "", body: p.body ?? null })),
    waitingElsewhere: built.waitingElsewhere,
    costUsd: built.costUsd,
  });
  console.log(`\n--- sample digest (drafting cost $${built.costUsd.toFixed(3)}) ---\n${sample}`);
  assert.ok(!built.proposed.some((p) => String(p.target.threadId) === "b5f8a774-bda1-4780-adbe-c0057aa4ce48"), "Robbie is not in today's pass");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
