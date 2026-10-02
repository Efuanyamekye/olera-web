/**
 * Offline checks for the Slack "what you owe" prefilter. No Slack, no model,
 * no database.
 *
 *   npx tsx scripts/check-slack-owed.ts
 */
import Module from "node:module";

// The module imports server-only code (the token store) that throws outside Next.
const load = (Module as unknown as { _load: (request: string, ...rest: unknown[]) => unknown })._load;
(Module as unknown as { _load: (request: string, ...rest: unknown[]) => unknown })._load = function (request: string, ...rest: unknown[]) {
  return request === "server-only" ? {} : load.call(this, request, ...rest);
};

(async () => {
  const assert = (await import("node:assert/strict")).default;
  const owed = await import("../lib/war-room/slack-owed.server");
  const { prefilterOwed, mentionsHim, storedToMessages, identifyTj, toOwedItems, coverageLine } = owed;

  const now = new Date("2026-10-02T12:00:00Z");
  const at = (hoursAgo: number) => String((now.getTime() - hoursAgo * 3_600_000) / 1_000);
  const TJ = "U0131NJURA7";
  const tj = { id: TJ, names: ["TJ Falohun", "TJ"] };
  let n = 0;
  const msg = (over: Partial<owed.OwedMessage> & { ts: string }): owed.OwedMessage => ({
    channelId: "C1", channelLabel: "#careseeker-support", isDm: false, threadTs: over.ts, userId: "UCES", author: "Ces Chavez",
    text: `message ${n++}`, permalink: null, replyCount: null, ...over,
  });

  // --- Mentions.
  assert.equal(mentionsHim("@TJ Falohun update for Kaitlin", null, tj.names), true, "stored text resolves mentions to names");
  assert.equal(mentionsHim("hey <@U0131NJURA7> can you", TJ, tj.names), true, "raw Slack mention");
  assert.equal(mentionsHim("thanks much, TJ!", TJ, tj.names), false, "a thank-you that names him is not a mention");
  assert.equal(mentionsHim("email me at tj@olera.care", TJ, tj.names), false, "an email address is not a mention");

  // (a) A mention he hasn't answered is owed; one he answered later is not.
  {
    const asked = msg({ ts: at(30), text: "@TJ Falohun Jacob responded to your email" });
    const answered = msg({ ts: at(40), text: "@TJ Falohun should I call Elvis?" });
    const reply = msg({ ts: at(39), threadTs: answered.ts, userId: TJ, author: "TJ Falohun", text: "yes call him" });
    const out = prefilterOwed([asked, answered, reply], tj, now);
    assert.deepEqual(out.map((c) => [c.kind, c.message.ts]), [["mention", asked.ts]]);
  }
  // Only the newest unanswered message in a thread becomes the item.
  {
    const parent = msg({ ts: at(50), text: "@TJ Falohun two questions" });
    const follow = msg({ ts: at(48), threadTs: parent.ts, text: "@TJ Falohun also this" });
    const out = prefilterOwed([parent, follow], tj, now);
    assert.equal(out.length, 1);
    assert.equal(out[0].message.ts, follow.ts);
    assert.deepEqual(out[0].context.map((m) => m.ts), [parent.ts], "earlier thread messages ride along as context");
  }
  // A DM to him counts without an @, and his later message anywhere in the DM answers it.
  {
    const dm = msg({ ts: at(20), channelId: "D1", channelLabel: "DM with Logan", isDm: true, userId: "ULOGAN", author: "Logan Lee DuBose", text: "can you look at the deck" });
    const dm2 = msg({ ts: at(26), channelId: "D2", channelLabel: "DM with Ces", isDm: true, text: "quick q" });
    const his = msg({ ts: at(25), channelId: "D2", isDm: true, userId: TJ, author: "TJ Falohun", text: "sure" });
    const later = msg({ ts: at(24), channelId: "D2", isDm: true, text: "thanks" });
    const out = prefilterOwed([dm, dm2, his, later], tj, now);
    assert.deepEqual(out.map((c) => c.message.ts).sort(), [dm.ts, later.ts].sort(), "D2's newest unanswered is 'thanks'; the model drops it as noise");
  }

  // (b) His thread nobody answered, once it has settled a day.
  {
    const lonely = msg({ ts: at(30), userId: TJ, author: "TJ Falohun", text: "Who owns the Hoop renewal?", replyCount: 0 });
    const fresh = msg({ ts: at(3), userId: TJ, author: "TJ Falohun", text: "Anyone seen the new form?" });
    const answeredThread = msg({ ts: at(60), userId: TJ, author: "TJ Falohun", text: "Status on Comfort Keepers?" });
    const answer = msg({ ts: at(59), threadTs: answeredThread.ts, text: "sent yesterday" });
    const out = prefilterOwed([lonely, fresh, answeredThread, answer], tj, now);
    assert.deepEqual(out.map((c) => [c.kind, c.message.ts]), [["unanswered_thread", lonely.ts]]);
  }
  // Slack says it has replies Cortex never stored: not unanswered.
  assert.equal(prefilterOwed([msg({ ts: at(30), userId: TJ, author: "TJ Falohun", text: "Who owns it?", replyCount: 3 })], tj, now).length, 0);

  // (c) A promise with nothing after from him.
  {
    const promise = msg({ ts: at(40), threadTs: at(45), userId: TJ, author: "TJ Falohun", text: "I'll send the deck by Friday" });
    const kept = msg({ ts: at(70), threadTs: at(72), userId: TJ, author: "TJ Falohun", text: "Let me check with Logan" });
    const followed = msg({ ts: at(60), threadTs: at(72), userId: TJ, author: "TJ Falohun", text: "Logan says yes" });
    const out = prefilterOwed([promise, kept, followed], tj, now);
    assert.deepEqual(out.map((c) => [c.kind, c.message.ts]), [["promise", promise.ts]]);
  }
  assert.equal(prefilterOwed([msg({ ts: at(40), userId: TJ, author: "TJ Falohun", text: "Thanks all, great work" , replyCount: 2 })], tj, now).length, 0, "no commitment, no item");

  // Outside 14 days: never.
  assert.equal(prefilterOwed([msg({ ts: at(15 * 24), text: "@TJ Falohun old ask" })], tj, now).length, 0);
  // Authorship by name when the id is unknown.
  assert.equal(prefilterOwed([msg({ ts: at(30), userId: null, author: "TJ Falohun", text: "Who owns it?", replyCount: 0 })], { id: null, names: tj.names }, now)[0]?.kind, "unanswered_thread");
  console.log("prefilter checks passed");

  // --- Stored rows.
  const rows = [
    { source_group: "careseeker-support", source_url: "https://olera.slack.com/archives/C1/p1790903562531599", external_id: "C1:1790903562.531599", occurred_at: "2026-10-02T00:00:00Z", content: "hi", metadata: { channel_id: "C1", user_id: "UCES", author_name: "Ces Chavez", thread_ts: null } },
    { source_group: "product-development", source_url: null, external_id: "C2:1790903600.000100", occurred_at: "2026-10-02T00:00:00Z", content: "reply", metadata: { channel_id: "C2", user_id: TJ, author_name: "TJ Falohun", thread_ts: "1790903562.000001", reply_count: 0 } },
    { source_group: "x", source_url: null, external_id: "notion:abc", occurred_at: "2026-10-02T00:00:00Z", content: "skip", metadata: null },
  ];
  const stored = storedToMessages(rows);
  assert.equal(stored.length, 2, "a row without a channel:ts id is skipped");
  assert.equal(stored[0].threadTs, stored[0].ts, "a standalone message is its own thread");
  assert.equal(stored[1].threadTs, "1790903562.000001");
  assert.equal(stored[0].channelLabel, "#careseeker-support");
  assert.deepEqual(identifyTj(stored, null, null), { id: TJ, names: ["TJ Falohun", "TJ"], via: "his name on stored messages" });
  assert.equal(identifyTj(stored, "UTOKEN", "UENV").via, "his Slack token");
  assert.equal(identifyTj(stored, null, "UENV").id, "UENV");
  console.log("stored-row checks passed");

  // --- Items: the model's picks, or the filter's list with no drafts when it fails.
  {
    const a = msg({ ts: at(30), text: "@TJ Falohun question" });
    const b = msg({ ts: at(31), channelId: "D9", isDm: true, channelLabel: "DM with Logan", text: "ping" });
    const candidates = prefilterOwed([a, b], tj, now);
    const items = toOwedItems(candidates, [{ id: 1, keep: true, kind: "mention", draft: "Yes — Tuesday works" }, { id: 0, keep: false, kind: "mention", draft: "" }], now);
    assert.equal(items.length, 1);
    assert.equal(items[0].draftReply, "Yes, Tuesday works", "em dashes come out of drafts");
    assert.equal(items[0].threadTs, null, "a standalone DM is answered at the top of the DM");
    assert.equal(items[0].ageDays, 1.3);
    const fallback = toOwedItems(candidates, null, now);
    assert.equal(fallback.length, 2);
    assert.ok(fallback.every((item) => item.draftReply === null));
    assert.equal(fallback.find((item) => !item.channelId.startsWith("D"))?.threadTs, a.ts, "a channel message is answered in its thread");
  }
  assert.equal(coverageLine({ channels: ["#a", "#b"], dms: "not connected", unreadable: ["#careshifts-summer-project-team"], via: "x" }), "Read 2 channels, last 14 days; DMs not covered (connect Slack as yourself to include them); can't read #careshifts-summer-project-team.");
  assert.equal(coverageLine({ channels: ["#a"], dms: "covered", unreadable: [], via: "x" }), "Read 1 channel, last 14 days; your DMs covered.");
  console.log("item checks passed");
})().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
