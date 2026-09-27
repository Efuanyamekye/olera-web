import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Provider moments: a provider email the founder should hear about today.
 *
 * On 2026-09-25 Robbie McCullough at Assisting Hands (Dallas) wrote to
 * support@ asking to be Olera's preferred provider for all of North Texas. The
 * founder called it "a big deal" and answered by hand; Cortex never mentioned
 * it. It was not a blind spot. The support inbox had synced the thread,
 * matched it to his provider profile and summarised it as "expressed interest
 * in becoming a preferred provider across North Texas" before the 10:30 scan.
 * Cortex told the founder it never ingests email, and never looked.
 *
 * What this reads: support@olera.care threads only, from the tables the support
 * inbox already fills. Metadata and the inbox's own one-line summary, plus the
 * founder's latest reply read at brief time so the brief can say what he
 * offered. Nothing is copied into War Room tables, and no other inbox is read.
 */

export const MOMENT_WINDOW_HOURS = 48;
const MOMENT_CATEGORIES = ["provider", "partner"];

export type ProviderMomentKind = "partnership" | "awaiting_reply";

export type ProviderMoment = {
  threadId: string;
  kind: ProviderMomentKind;
  provider: string | null;
  subject: string | null;
  summary: string;
  lastInboundAt: string | null;
  /** The founder's latest reply on the thread, if he has sent one since they wrote. */
  reply: { at: string; text: string } | null;
  /**
   * What they wrote that nobody has answered yet, newest first, read at brief
   * time and not stored. On 2026-09-26 the brief drafted "can we set up a call
   * this week" to Robbie while his two unanswered emails said Assisting Hands
   * has about 150 owners across 35 states, and TJ had already offered times.
   */
  unanswered: Array<{ at: string; text: string }>;
  /** The founder's last reply before those, so a draft does not re-offer it. */
  earlierReply: { at: string; text: string } | null;
};

type ThreadRow = {
  id: string;
  subject: string | null;
  category: string | null;
  state: string | null;
  matched_profile_name: string | null;
  matched_profile_type: string | null;
  agent_summary: string | null;
  last_message_at: string | null;
  handled_at: string | null;
};

type MessageRow = {
  thread_id: string;
  direction: string | null;
  from_email: string | null;
  from_name: string | null;
  internal_date: string | null;
  snippet: string | null;
  body_text: string | null;
};

/** Words that make a summary a partnership signal without asking a model. */
const PARTNERSHIP_WORDS = /\b(partner(ship)?|preferred provider|exclusive|expand(ing)?|all of [A-Z][a-z]+ [A-Z][a-z]+|territor(y|ies)|referral agreement|work together|white[- ]label)\b/i;

function decodeEntities(text: string) {
  return text
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** The reply without quoted history, which is most of any email body. */
function replyText(message: MessageRow) {
  const body = message.body_text ?? message.snippet ?? "";
  // Outlook quotes as "From: ... Date: ..." with no "wrote:" line.
  const cut = body.search(/\n\s*On .{0,120}wrote:|\n-{2,}\s*Original Message|\n>|\n\s*From: .{0,200}\r?\n\s*(Sent|Date): /);
  return decodeEntities(cut > 0 ? body.slice(0, cut) : body).replace(/\s+/g, " ").trim().slice(0, 700);
}

/**
 * Which summaries are partnership or expansion signals.
 *
 * One Haiku call over the inbox's one-line summaries only, never the bodies.
 * The inbox's own priority cannot answer this: Robbie's thread was "normal".
 * If the call fails, the keyword test stands in, so a model outage cannot hide
 * the one kind of email the founder asked never to miss.
 */
export async function partnershipFlags(summaries: string[]): Promise<boolean[]> {
  const byKeyword = summaries.map((summary) => PARTNERSHIP_WORDS.test(summary));
  if (!summaries.length || !process.env.ANTHROPIC_API_KEY) return byKeyword;
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const reply = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 200,
      system: "Each numbered line summarises an email sent to Olera, a senior-care marketplace that lists care providers and sends them families. Answer YES only where a care provider that works with Olera, or wants to be listed, asks for a deeper relationship with Olera itself: becoming a preferred or exclusive provider, covering more locations or a new area through Olera, or growing what they do on Olera. Answer NO for everything else, including: vendors, agencies, medical groups, programs or salespeople pitching their own services or 'referral partnerships' to Olera; routine replies to a lead; profile, listing or login help; billing; complaints; removals; thank-yous; invitations. Reply with one line per input, in order, formatted as the number, a colon, and YES or NO.",
      messages: [{ role: "user", content: summaries.map((summary, i) => `${i + 1}. ${summary.slice(0, 400)}`).join("\n") }],
    }, { timeout: 20_000, maxRetries: 0 });
    const text = reply.content.find((block): block is Anthropic.TextBlock => block.type === "text")?.text ?? "";
    return summaries.map((_, i) => {
      // "1: YES" on a short list, "1. YES" on a long one: Haiku switched format
      // at 27 lines and every answer fell through to the keyword test.
      const line = text.match(new RegExp(`^\\W*${i + 1}\\s*[:.)\\-]\\s*\\**\\s*(YES|NO)`, "im"));
      // The model's answer stands. The keyword test only fills a line it
      // skipped: "partnership" also appears in every vendor's cold pitch, and
      // letting it override a NO put those at the top of the brief in a
      // 30-day backtest.
      return line ? line[1].toUpperCase() === "YES" : byKeyword[i];
    });
  } catch {
    return byKeyword;
  }
}

/**
 * Provider emails from the last two days that the founder should hear about:
 * partnership signals first, whether or not he has replied, then provider
 * messages still waiting on a reply. Always resolves; a read failure is an
 * empty list, and the brief goes out without it.
 */
export async function loadProviderMoments(db: SupabaseClient, now = new Date()): Promise<ProviderMoment[]> {
  const since = new Date(now.getTime() - MOMENT_WINDOW_HOURS * 3_600_000).toISOString();
  const { data: threadData, error } = await db.from("support_email_threads")
    .select("id, subject, category, state, matched_profile_name, matched_profile_type, agent_summary, last_message_at, handled_at")
    .in("category", MOMENT_CATEGORIES)
    .gte("last_message_at", since)
    .order("last_message_at", { ascending: false })
    .limit(20);
  if (error || !threadData?.length) return [];
  const threads = (threadData as ThreadRow[]).filter((thread) => (thread.agent_summary ?? "").trim().length > 0);
  if (!threads.length) return [];

  const { data: messageData } = await db.from("support_email_messages")
    .select("thread_id, direction, from_email, from_name, internal_date, snippet, body_text")
    .in("thread_id", threads.map((thread) => thread.id))
    .order("internal_date", { ascending: false })
    .limit(200);
  const messages = (messageData ?? []) as MessageRow[];

  const flags = await partnershipFlags(threads.map((thread) => thread.agent_summary ?? ""));
  const moments: ProviderMoment[] = [];
  threads.forEach((thread, i) => {
    const own = messages.filter((message) => message.thread_id === thread.id);
    // Mail from the team into support@ is a handoff or a test, not a provider:
    // the first live read surfaced "Test McTest" and a team handoff as
    // providers waiting on a reply.
    const lastInbound = own.find((message) => message.direction === "in"
      && !/@olera\.care$/i.test((message.from_email ?? "").trim())) ?? null;
    // No inbound message in the window means Olera wrote last and nothing new
    // came back; that is not a moment.
    if (!lastInbound?.internal_date || lastInbound.internal_date < since) return;
    const lastOutbound = own.find((message) => message.direction === "out"
      && (message.internal_date ?? "") > (lastInbound.internal_date ?? "")) ?? null;
    // Waiting-on-reply is only for mail matched to a provider profile. The
    // category alone let a teammate's handoff and a voicemail notice through.
    const awaiting = thread.matched_profile_type === "provider"
      && !lastOutbound && !thread.handled_at && thread.state !== "handled";
    const kind: ProviderMomentKind | null = flags[i] ? "partnership" : awaiting ? "awaiting_reply" : null;
    if (!kind) return;
    const earlierOutbound = own.find((message) => message.direction === "out"
      && (message.internal_date ?? "") < (lastInbound.internal_date ?? "")) ?? null;
    const unanswered = lastOutbound
      ? []
      : own
        .filter((message) => message.direction === "in"
          && !/@olera\.care$/i.test((message.from_email ?? "").trim())
          && (message.internal_date ?? "") > (earlierOutbound?.internal_date ?? ""))
        .slice(0, 3)
        .map((message) => ({ at: message.internal_date ?? "", text: replyText(message) }));
    moments.push({
      threadId: thread.id,
      kind,
      provider: thread.matched_profile_name ?? lastInbound.from_name ?? lastInbound.from_email,
      subject: thread.subject,
      summary: thread.agent_summary ?? "",
      lastInboundAt: lastInbound.internal_date,
      reply: lastOutbound?.internal_date ? { at: lastOutbound.internal_date, text: replyText(lastOutbound) } : null,
      unanswered,
      earlierReply: earlierOutbound?.internal_date ? { at: earlierOutbound.internal_date, text: replyText(earlierOutbound) } : null,
    });
  });
  const rank = (moment: ProviderMoment) => (moment.kind === "partnership" ? 0 : 1);
  return moments.sort((a, b) => rank(a) - rank(b) || (b.lastInboundAt ?? "").localeCompare(a.lastInboundAt ?? ""));
}

/**
 * Support inbox, for the conversation. Summaries and metadata only; the founder
 * asks "did anyone email about X" and this answers without reading bodies.
 */
export async function loadSupportInbox(db: SupabaseClient, options: { days: number; category?: string; query?: string }) {
  const since = new Date(Date.now() - options.days * 86_400_000).toISOString();
  let request = db.from("support_email_threads")
    .select("subject, category, priority, state, matched_profile_name, agent_summary, last_message_at, handled_at")
    .gte("last_message_at", since)
    .order("last_message_at", { ascending: false })
    .limit(25);
  if (options.category) request = request.eq("category", options.category);
  if (options.query) {
    const term = options.query.replace(/[%,()]/g, " ").trim();
    if (term) request = request.or(`subject.ilike.%${term}%,matched_profile_name.ilike.%${term}%,agent_summary.ilike.%${term}%`);
  }
  const { data, error } = await request;
  if (error) throw new Error(error.message);
  return {
    mailbox: "support@olera.care",
    note: "Summaries written by the support inbox's own triage, not message bodies. Only support@ is read; no other inbox is.",
    threads: (data ?? []).map((row) => {
      const thread = row as ThreadRow & { priority: string | null };
      return {
        subject: thread.subject,
        from: thread.matched_profile_name,
        category: thread.category,
        priority: thread.priority,
        handled: Boolean(thread.handled_at) || thread.state === "handled",
        lastMessageAt: thread.last_message_at,
        summary: thread.agent_summary,
      };
    }),
  };
}
