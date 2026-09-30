/**
 * Checks for Cortex as inbox operator.
 *
 *   npx tsx --env-file=.env.local scripts/check-cortex-inbox.ts
 *
 * With --live, builds the digest from today's real queue, read-only (Sonnet
 * drafts up to three emails, about $0.06). Nothing is stored or sent.
 */
import assert from "node:assert/strict";
import { isRealObjection, parseObjections, renderCheck } from "../lib/war-room/draft-check.server";
import { callbackLine, dedupeByCaller } from "../lib/war-room/voicemail-triage.server";
import { createClient } from "@supabase/supabase-js";
import {
  buildInboxProposals, cleanSubject, clip, currentText, draftAwaitingSend, isSmsBookkeeping, parseInboxCommand, parseRewrites, renderDigest, waitingOnUs, type StoredItem,
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
assert.deepEqual(parseInboxCommand("approve 1 2 3 4\n\nFirst let's handle this chunk and then I'll handle the next after"), { verb: "approve", numbers: [1, 2, 3, 4], edit: null }, "a note under the command is fine");
assert.deepEqual(parseInboxCommand("send 5: Hi,\nsecond line of the text"), { verb: "approve", numbers: [5], edit: "Hi,\nsecond line of the text" }, "a multi-line edit still works");
assert.equal(parseInboxCommand("I think we should approve 1 2 later"), null, "a command mid-sentence is not one");
assert.deepEqual(parseInboxCommand("check 5 6"), { verb: "check", numbers: [5, 6], edit: null });
assert.deepEqual(parseInboxCommand("fact-check 5 and 6"), { verb: "check", numbers: [5, 6], edit: null });
assert.equal(parseInboxCommand("check the voicemails"), null, "check without numbers is a question");
assert.deepEqual(parseInboxCommand("check 8: Having Medicaid is the first thing SMMC needs."), { verb: "check", numbers: [8], edit: "Having Medicaid is the first thing SMMC needs." }, "his version can be checked");
// Rewrites Cortex offers in chat become the latest version: its real reply from 29 Sep.
const cortexReply = "On the voice, you're right. Here they are as a human guide would say them:\n\nsend 5: Waiting on an approval is the worst part. While it sits, call 352-373-7667 and ask two things: where your application stands, and whether you need to file separately for help with cooling costs.\n\nsend 6: That's frustrating, and it happens a lot. Which number did you call, and roughly when?\n\nsend 7: Hi Marti, glad that helped. Medicaid works differently in every state, so tell me which state you're in. TJ, Olera";
assert.deepEqual(parseRewrites(cortexReply).map((r) => r.number), [5, 6, 7]);
assert.equal(parseRewrites(cortexReply)[1].text, "That's frustrating, and it happens a lot. Which number did you call, and roughly when?");
assert.deepEqual(parseRewrites("I'd send 5 as is, it's fine."), [], "mentioning send is not a rewrite");
assert.deepEqual(parseRewrites('Here:\n\n"send 5: Waiting on an approval is the worst part, call them today."').map((r) => r.text), ["Waiting on an approval is the worst part, call them today."], "wrapped in quotes");
assert.deepEqual(parseRewrites("Here:\n\n> send 6: That is frustrating, which number did you call?").map((r) => r.number), [6], "in a blockquote");
assert.deepEqual(parseRewrites("• *send 7:* Hi Marti, tell me which state you are in. TJ, Olera").map((r) => r.number), [7], "bulleted and bold");
assert.deepEqual(parseRewrites("Or reply\nsend 5: <your edited text here please>"), [], "a placeholder is not a rewrite");
const withLatest = { id: "x", pass_id: "p", number: 6, kind: "sms_draft", category: "sms:reply", target: { last10: "1", latest: { text: "New words here for the family.", at: "", by: "cortex" } }, summary: "", body: "Old draft.", status: "proposed", created_at: "" } as StoredItem;
assert.equal(currentText(withLatest), "New words here for the family.", "send sends the version he last saw");
assert.equal(currentText({ ...withLatest, target: { last10: "1" } }), "Old draft.");
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
// An approved draft saved after their last message is waiting on TJ in Gmail, not on a new draft (29 Sep).
const lastIn = [{ direction: "in", internal_date: "2026-09-28T13:59:43Z" }];
assert.equal(draftAwaitingSend({ gmail_draft_id: "r-1", draft_updated_at: "2026-09-29T04:11:45Z" }, lastIn), true);
assert.equal(draftAwaitingSend({ gmail_draft_id: "r-1", draft_updated_at: "2026-09-27T10:00:00Z" }, lastIn), false, "they wrote again after the draft");
assert.equal(draftAwaitingSend({ gmail_draft_id: null, draft_updated_at: null }, lastIn), false);
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
assert.match(renderDigest({ passId: "p", items: [item(1, "triage_batch", "Archive 3.")], waitingElsewhere: 0, costUsd: 0, draftsInGmail: 3 }), /3 approved drafts are in Gmail waiting for you to send\./);
assert.equal(renderDigest({ passId: "p", items: [], waitingElsewhere: 0, costUsd: 0, draftsInGmail: 1 }), "Inbox pass: both inboxes are clear. 1 approved draft is in Gmail waiting for you to send.");
assert.equal(cleanSubject("Re: Re:Ã‚Â Your first step for SMMC"), "Your first step for SMMC");
assert.equal(clip("one two three four five", 12), "one two...");
console.log("digest checks passed");

// --- Draft checks. On 28 Sep Perplexity returned three "Supported by an agency page" rows for a clean draft.
assert.equal(isRealObjection("Supported by an agency page; no contradiction found."), false);
assert.equal(isRealObjection("Not supported by any agency page found."), true, "no source is an objection");
assert.equal(isRealObjection("The agency page gives 352-373-7667 x222 for appointments."), true);
const objections = parseObjections('Here: {"objections":[{"target":"352-373-7667","problem":"Page says call 352-373-7667 x222 for an appointment.","source_quote":"Please call 352-373-7667 x222 for an appointment.","source_url":"https://www.cfcaa.org/weatherization/","confidence":"medium"},{"target":"800-713-9023","problem":"Supported by an agency page.","source_quote":"","source_url":"","confidence":"high"}]}');
assert.equal(objections.length, 1);
assert.equal(parseObjections('{"objections":[{"target":"it&#39;s open","problem":"Page says closed.","confidence":"high"}]}')[0].target, "it's open", "entities are decoded");
const checked = item(6, "sms_draft", "Text a family.", "CFCAA: 352-373-7667.");
assert.match(renderCheck(checked, objections), /6: 1 objection\.[\s\S]*x222[\s\S]*"send 6" sends this version/);
assert.match(renderCheck(checked, []), /6: clean/);
assert.match(renderCheck(checked, [], "Cortex's rewrite"), /6 \(Cortex's rewrite\): clean[\s\S]*"send 6"/, "the checked version is named, and send sends it");
assert.match(renderCheck(checked, new Error("timeout")), /couldn't check it \(timeout\)/);
console.log("draft check checks passed");

// --- Voicemail: one line per caller, the newest kept.
const vm = (id: string, ageDays: number, number: string, worthIt = true) => ({ id, ageDays, worthIt, who: "Jamie", number, reason: "follow-up" });
const deduped = dedupeByCaller([vm("old", 44, "(936) 506-2898"), vm("new", 31, "936-506-2898"), vm("other", 40, "(214) 343-6400"), vm("noise", 5, "", false)]);
assert.deepEqual(deduped.filter((v) => v.worthIt).map((v) => v.id), ["new", "other"], "the older repeat from the same number is archived");
assert.match(deduped.find((v) => v.id === "old")!.reason, /repeat of a newer voicemail/);
assert.equal(callbackLine(vm("x", 0, "214-343-6400")), "Jamie, 214-343-6400: follow-up (today)");
console.log("voicemail checks passed");

(async () => {
  // An unchecked Cortex rewrite is fact-checked on the first "send" and held on a high objection.
  {
    const { handleInboxCommand } = await import("../lib/war-room/inbox-operator.server");
    const row: Record<string, unknown> = {
      id: "i8", pass_id: "p", number: 8, kind: "email_draft", category: "email:draft:care_seeker", summary: "Email a family", body: "Stored draft.", status: "proposed", created_at: new Date().toISOString(), decided_at: null,
      target: { threadId: "t1", latest: { text: "With both Medicare and Medicaid you're eligible for SMMC Long-Term Care.", at: "", by: "cortex" } },
    };
    const updates: unknown[] = [];
    // A chainable fake: every call returns the chain, awaiting it gives rows.
    const fakeDb = { from: (table: string) => {
      let update: unknown = null;
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq", "gte", "order", "limit", "in", "is"]) chain[method] = () => chain;
      chain.update = (value: unknown) => { update = value; return chain; };
      chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
      chain.then = (resolve: (v: unknown) => unknown) => {
        if (update) { updates.push(update); if (table === "cortex_inbox_items") Object.assign(row, update); return Promise.resolve({ data: [row], error: null }).then(resolve); }
        return Promise.resolve({ data: table === "cortex_inbox_items" ? [row] : [], error: null }).then(resolve);
      };
      return chain;
    } } as never;
    const realFetch = globalThis.fetch;
    const realKey = process.env.PERPLEXITY_API_KEY;
    process.env.PERPLEXITY_API_KEY = "test";
    globalThis.fetch = (async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"objections":[{"target":"you\'re eligible","problem":"The agency requires medical and financial eligibility.","source_quote":"must meet both medical and financial eligibility requirements","source_url":"https://ahca.myflorida.com/x","confidence":"high"}]}' } }] }), { status: 200 })) as typeof fetch;
    try {
      const held = await handleInboxCommand(fakeDb, { verb: "approve", numbers: [8], edit: null });
      assert.match(held ?? "", /8 \(Cortex's rewrite\): 1 objection[\s\S]*Not sent\. Say send 8 again/);
      assert.equal(((row.target as { latest: { checked?: boolean } }).latest).checked, true, "marked checked, so the next send goes");
    } finally {
      globalThis.fetch = realFetch;
      if (realKey === undefined) delete process.env.PERPLEXITY_API_KEY; else process.env.PERPLEXITY_API_KEY = realKey;
    }
    console.log("rewrite hold checks passed");
  }

  const { readOnly } = await import("./replay-cortex-conversation");
  const db = readOnly(createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!));

  // The Robbie regression, on the live thread as it stood on 26 Sep: TJ had
  // answered, so it must not be offered. (Robbie wrote back on 27 Sep, so the
  // thread is rightly waiting again after that; the cut keeps the case fixed.)
  const { data: robbie } = await db.from("support_email_messages")
    .select("direction, from_email, internal_date")
    .eq("thread_id", "b5f8a774-bda1-4780-adbe-c0057aa4ce48")
    .lte("internal_date", "2026-09-26T23:59:59Z");
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

})().catch((error) => {
  console.error(error);
  process.exit(1);
});
