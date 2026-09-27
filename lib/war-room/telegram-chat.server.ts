import type { SupabaseClient } from "@supabase/supabase-js";
import { answerFounderQuestion, type ConversationTurn } from "@/lib/war-room/conversation.server";
import { loadChatMemory, memoryPromptText, refreshChatSummary, type ChatStore } from "@/lib/war-room/chat-memory.server";
import { approvalReply, isApproval, MAX_IMAGE_BYTES, nothingWaitingReply } from "@/lib/war-room/dm-intake";
import { wantsVoice } from "@/lib/war-room/voice.server";
import type { WarRoomProposal } from "@/lib/war-room/types";

/**
 * Cortex on Telegram: the founder's pocket, where he already talks to Jade.
 *
 * Same brain as the Slack DM (answerFounderQuestion), with three differences:
 * it remembers the conversation across days (chat-memory.server.ts), it reads
 * voice notes as well as screenshots, and it treats everything as conversation.
 * The Slack DM's "is this an answer to the brief's question?" filing stays in
 * Slack; here nothing he says is filed as evidence behind his back.
 *
 * Only one chat is served. Anything from another chat is dropped without a
 * reply, so a stranger who finds the bot learns nothing.
 */

type TelegramPhoto = { file_id: string; file_size?: number; width?: number; height?: number };
type TelegramFile = { file_id: string; file_size?: number; mime_type?: string; duration?: number };
export type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    date: number;
    chat: { id: number; type?: string };
    from?: { id: number; is_bot?: boolean; first_name?: string };
    text?: string;
    caption?: string;
    photo?: TelegramPhoto[];
    document?: TelegramFile & { file_name?: string };
    voice?: TelegramFile;
    audio?: TelegramFile;
  };
};

/** Everything that touches the outside world, so a check can run it with fakes. */
export type TelegramDeps = {
  db: SupabaseClient;
  store: ChatStore;
  founderChatId: string | null;
  send: (chatId: string, text: string) => Promise<{ success: boolean; error?: string }>;
  typing: (chatId: string) => Promise<void>;
  download: (fileId: string) => Promise<Buffer>;
  transcribe: (audio: Buffer, mimeType?: string) => Promise<string | null>;
  answer?: typeof answerFounderQuestion;
  /** A voice note after a long reply or when he asks "aloud" (voice.server.ts). Optional so checks can leave it out. */
  voice?: (chatId: string, text: string, mode: "reply" | "brief") => Promise<unknown>;
  /** The reaction log (moves.server.ts). Optional so checks can leave it out. */
  reactions?: { reply: (text: string, options: { pushedBack?: boolean; scoreOnly?: boolean }) => Promise<{ scored?: number } | null> };
};

export type TelegramOutcome =
  | { handled: false; reason: string }
  | { handled: true; kind: "setup" | "approval" | "scan" | "answer" | "unreadable" | "voice"; reply: string; costUsd?: number };

const READABLE_IMAGE = /^image\/(png|jpeg|gif|webp)$/;

/**
 * The real type, from the file's first bytes. Telegram photos are JPEG, but a
 * label that disagrees with the bytes is a 400 from the model and no answer.
 */
export function sniffImageType(bytes: Buffer, fallback: string): string {
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.subarray(0, 6).toString("latin1").startsWith("GIF8")) return "image/gif";
  if (bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return fallback;
}

/** The largest size of a photo that still fits the model's image limit. */
export function pickPhoto(photos: TelegramPhoto[] | undefined): TelegramPhoto | null {
  const fitting = (photos ?? []).filter((photo) => !photo.file_size || photo.file_size <= MAX_IMAGE_BYTES);
  return fitting.sort((a, b) => (b.file_size ?? b.width ?? 0) - (a.file_size ?? a.width ?? 0))[0] ?? null;
}

/** The last thing Cortex said and what prompted it, so a correction is caught. */
function lastExchange(recent: Array<{ role: string; text: string; at: string }>): ConversationTurn | null {
  const answerIndex = recent.map((message) => message.role).lastIndexOf("cortex");
  if (answerIndex < 0) return null;
  const question = [...recent.slice(0, answerIndex)].reverse().find((message) => message.role === "founder");
  return { question: question?.text ?? "", answer: recent[answerIndex].text, focusInvestigationId: null, at: recent[answerIndex].at };
}

export async function handleTelegramUpdate(update: TelegramUpdate, deps: TelegramDeps): Promise<TelegramOutcome> {
  const message = update.message;
  if (!message) return { handled: false, reason: "not a new message" };
  const chatId = String(message.chat.id);
  if (message.from?.is_bot) return { handled: false, reason: "from a bot" };

  // Setup: until the chat id is set he cannot be recognised, so /start tells
  // whoever sent it their own chat id and nothing else. Once it is set, every
  // other chat is dropped silently.
  if (!deps.founderChatId) {
    if (/^\/start\b/.test(message.text ?? "")) {
      const reply = `Cortex isn't linked to a chat yet. Your chat id is ${chatId}. Put it in TELEGRAM_CORTEX_CHAT_ID in Vercel and redeploy.`;
      await deps.send(chatId, reply);
      return { handled: true, kind: "setup", reply };
    }
    return { handled: false, reason: "no founder chat configured" };
  }
  if (chatId !== deps.founderChatId) return { handled: false, reason: "not the founder's chat" };

  const reply = async (text: string) => {
    const sent = await deps.send(chatId, text);
    if (!sent.success) console.error("[cortex] telegram send failed:", sent.error);
  };

  let text = (message.text ?? message.caption ?? "").trim();
  if (/^\/start\b/.test(text)) text = "";

  // A voice note is his question, spoken. Transcribed, then treated as typed.
  let heard = "";
  const audio = message.voice ?? message.audio;
  if (audio) {
    try {
      const transcript = await deps.transcribe(await deps.download(audio.file_id), audio.mime_type);
      if (!transcript) {
        const note = "I can't hear voice notes yet (no transcription key is set). Type it and I'm on it.";
        await reply(note);
        return { handled: true, kind: "unreadable", reply: note };
      }
      heard = transcript;
      text = [text, transcript].filter(Boolean).join("\n\n");
    } catch (error) {
      const note = `I couldn't transcribe that voice note (${error instanceof Error ? error.message : "unknown error"}). Try again, or type it.`;
      await reply(note);
      return { handled: true, kind: "unreadable", reply: note };
    }
  }

  // Screenshots: a photo, or an image sent as a file (which keeps full size).
  const images: Array<{ mediaType: string; data: string }> = [];
  let imageNote = "";
  const photo = pickPhoto(message.photo);
  const document = message.document && (message.document.mime_type ?? "").startsWith("image/") ? message.document : null;
  if (message.photo?.length && !photo) imageNote = "\n\n_That image was too large for me to read, so this answers the text only._";
  if (document && (!READABLE_IMAGE.test(document.mime_type ?? "") || (document.file_size ?? 0) > MAX_IMAGE_BYTES)) {
    imageNote = "\n\n_I couldn't read that image (too large, or a format like HEIC). A PNG or JPEG screenshot works._";
  }
  const fileId = photo?.file_id ?? (document && !imageNote ? document.file_id : null);
  if (fileId) {
    try {
      const bytes = await deps.download(fileId);
      images.push({ mediaType: sniffImageType(bytes, photo ? "image/jpeg" : (document?.mime_type ?? "image/png").toLowerCase()), data: bytes.toString("base64") });
    } catch (error) {
      imageNote = `\n\n_I couldn't open the image you sent (${error instanceof Error ? error.message : "download failed"}), so this answers the text only._`;
    }
  }

  if (!text && !images.length) {
    const note = imageNote.trim() || "Send me whatever's on your mind about Olera: a question, a screenshot or a voice note.";
    await reply(note.replace(/^_|_$/g, ""));
    return { handled: true, kind: "unreadable", reply: note };
  }

  // Stored before anything else, keyed by Telegram's update id. A retry of an
  // update already here stops now, so one message is never answered twice.
  const at = new Date(message.date * 1000).toISOString();
  const stored = await deps.store.append(chatId, {
    surface: "telegram",
    role: "founder",
    kind: "message",
    text: [heard ? `(voice note) ${text}` : text, images.length ? "[sent a screenshot]" : ""].filter(Boolean).join(" "),
    at,
    updateId: update.update_id,
  });
  if (!stored) return { handled: false, reason: "retry of an update already handled" };
  const remember = (said: string) => deps.store.append(chatId, {
    surface: "telegram", role: "cortex", kind: "message", text: said, at: new Date().toISOString(),
  }).catch(() => false);

  // A 1 to 10 right after Cortex asked for its weekly rating is the rating:
  // stored with his words as a correction, and thanked, not answered.
  if (deps.reactions) {
    const scored = await deps.reactions.reply(text, { scoreOnly: true }).catch(() => null);
    if (scored?.scored) {
      const said = `Got it, ${scored.scored}/10. Saved with what you said, and it shapes every answer from here.`;
      await reply(said);
      await remember(said);
      return { handled: true, kind: "answer", reply: said };
    }
  }

  // "Approve" approves the one decision waiting on him, as in Slack. Only a
  // message that says approve: "go ahead" mid-conversation is conversation.
  if (isApproval(text) && /approv/i.test(text)) {
    const { data: waiting } = await deps.db.from("war_room_proposals")
      .select("*")
      .eq("status", "proposed")
      .order("created_at", { ascending: true })
      .limit(5);
    const proposals = (waiting ?? []) as WarRoomProposal[];
    let said: string;
    if (proposals.length === 1) {
      const { approveWarRoomProposal } = await import("@/lib/war-room/approve.server");
      said = approvalReply(proposals[0], await approveWarRoomProposal(deps.db, proposals[0], "founder via Telegram"));
    } else if (proposals.length > 1) {
      said = `${proposals.length} decisions are waiting, so I approved none of them. Approve the one you mean on the <https://olera.care/admin/war-room|Cortex page>:\n${proposals.map((proposal) => `• ${proposal.title}`).join("\n")}`;
    } else {
      const { data: last } = await deps.db.from("war_room_proposals")
        .select("title, approved_at, status, execution_error")
        .not("approved_at", "is", null)
        .order("approved_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      said = nothingWaitingReply(last as never);
    }
    await reply(said);
    await remember(said);
    return { handled: true, kind: "approval", reply: said };
  }

  // "aloud" or "voice" on its own means: say what you just said. Answering
  // the word as a question would miss the point.
  if (deps.voice && /^\s*(aloud|voice(\s+(note|memo|message))?|read (it|that|this)( to me| aloud)?)\s*[.!?]?\s*$/i.test(text)) {
    const recent = await deps.store.recent(chatId, 6).catch(() => []);
    const last = [...recent].reverse().find((entry) => entry.role === "cortex");
    if (last) {
      await deps.voice(chatId, last.text, last.kind === "brief" ? "brief" : "reply");
      return { handled: true, kind: "voice", reply: last.text };
    }
  }

  // Loaded only for a scan: it pulls in the workflow runtime.
  const scans = /\bscan\b/i.test(text) ? await import("@/lib/war-room/scan-command.server") : null;
  const command = scans?.parseScanCommand(text) ?? null;
  if (scans && command) {
    const result = await scans.runScanCommand(deps.db, command);
    await reply(result.reply);
    await remember(result.reply);
    return { handled: true, kind: "scan", reply: result.reply };
  }

  // Answering takes 10 to 60 seconds; "typing..." lasts five, so it is renewed.
  await deps.typing(chatId).catch(() => undefined);
  const typing = setInterval(() => { deps.typing(chatId).catch(() => undefined); }, 4_500);
  try {
    const memory = await loadChatMemory(deps.store, chatId);
    // The message just stored is the question, not part of the history.
    // Compared as times: Postgres hands back "+00:00" where this wrote "Z".
    const history = { ...memory, recent: memory.recent.filter((entry, i, all) => !(i === all.length - 1 && entry.role === "founder" && Date.parse(entry.at) === Date.parse(at))) };
    const answer = await (deps.answer ?? answerFounderQuestion)(
      deps.db,
      text || "What is this, and what should I do about it?",
      null,
      lastExchange(history.recent),
      { images, surface: "telegram", memory: memoryPromptText(history) || undefined },
    );
    const said = answer.reply + imageNote;
    await reply(said);
    if (answer.answered) await remember(said);
    // His message answers whatever Cortex last put in front of him.
    await deps.reactions?.reply(text, { pushedBack: Boolean(answer.correction) }).catch(() => null);
    // The text is already with him; the note follows, as Jade's do.
    if (answer.answered && deps.voice && wantsVoice(text, answer.reply)) {
      clearInterval(typing);
      await deps.voice(chatId, answer.reply, "reply");
    }
    // After the reply, so he never waits on it.
    await refreshChatSummary(deps.store, chatId).catch(() => false);
    return { handled: true, kind: "answer", reply: said, costUsd: answer.costUsd };
  } finally {
    clearInterval(typing);
  }
}
