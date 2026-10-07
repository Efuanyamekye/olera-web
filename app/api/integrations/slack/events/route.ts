import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/admin";
import { sendSlackDirectMessage } from "@/lib/slack";
import { ingestSlackEventEvidence, verifySlackRequest } from "@/lib/war-room/sources.server";
import { captureFounderAnswer, findAskByThread, findOpenAsk } from "@/lib/war-room/founder-loop.server";
import { answerFounderQuestion, answersOpenAsk, classifyMessage, loadOpenExchange, recordExchange } from "@/lib/war-room/conversation.server";
import { startVisualRoutine, visualizeSubject } from "@/lib/war-room/visualize.server";
import { parseScanCommand, runScanCommand } from "@/lib/war-room/scan-command.server";
import { cleanDmText, imageFiles, isApproval, isOwnMessage, isReadableDm, skippedImages, type DmFile } from "@/lib/war-room/dm-intake";
import { downloadSlackFile } from "@/lib/war-room/attachments.server";
import type { WarRoomProposal } from "@/lib/war-room/types";
import { approvalReply, nothingWaitingReply } from "@/lib/war-room/dm-intake";
import { withoutStaleRenewalCounts } from "@/lib/war-room/stale-counts";
import { postAsCortex } from "@/lib/war-room/team-messages.server";
import { handleInboxCommand, parseInboxCommand } from "@/lib/war-room/inbox-operator.server";
import { applyTuningMessage, initiativeForThread, recordGrade } from "@/lib/war-room/tuning.server";
import { providerCardReply } from "@/lib/war-room/provider-gaps.server";

export const maxDuration = 90;

type SlackEventsEnvelope = {
  type?: string;
  challenge?: string;
  api_app_id?: string;
  authorizations?: Array<{ user_id?: string; is_bot?: boolean }>;
  event?: {
    files?: DmFile[];
    type?: string;
    channel?: string;
    channel_type?: string;
    ts?: string;
    thread_ts?: string;
    text?: string;
    user?: string;
    bot_id?: string;
    app_id?: string;
    subtype?: string;
    /** reaction_added / reaction_removed */
    reaction?: string;
    item?: { type?: string; channel?: string; ts?: string };
  };
};

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!verifySlackRequest(
    request.headers.get("x-slack-signature"),
    request.headers.get("x-slack-request-timestamp"),
    rawBody,
  )) {
    return NextResponse.json({ error: "Invalid Slack signature" }, { status: 401 });
  }

  let payload: SlackEventsEnvelope;
  try {
    payload = JSON.parse(rawBody) as SlackEventsEnvelope;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (payload.type === "url_verification" && payload.challenge) {
    return NextResponse.json({ challenge: payload.challenge });
  }
  if (payload.type !== "event_callback" || !payload.event) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  try {
    const db = getServiceClient();

    // A thumbs up or down on one of Cortex's own posts is a grade on that
    // initiative (lib/war-room/tuning.ts). Needs the reaction_added event
    // subscription and reactions:read on the app; until then this never fires.
    if (payload.event.type === "reaction_added" && payload.event.reaction && payload.event.item?.ts) {
      if (request.headers.get("x-slack-retry-num")) return NextResponse.json({ ok: true, retry: true });
      const grade = await recordGrade(db, { itemTs: payload.event.item.ts, reaction: payload.event.reaction, user: payload.event.user ?? null }).catch(() => ({ recorded: false }));
      return NextResponse.json({ ok: true, grade });
    }

    // A direct message from a human is the founder answering the question the
    // daily brief asked. This is the only path by which his knowledge reaches
    // the investigation loop: probes resolve the unknowns that happen to be SQL,
    // and nothing else did until now.
    //
    // Channel messages still go to the evidence reader below — an answer is a
    // reply in the DM, not a remark in a channel.
    // `app_id` is checked alongside `bot_id` and `subtype` because this branch
    // now REPLIES, and a reply is itself a message in this DM. If Cortex ever
    // read one of its own messages as founder input, an answer ending in a
    // question mark would be classified as a question, answered, and that
    // answer read again -- a loop that costs money on every turn. Three
    // independent signals mark an app-posted message; any one of them is
    // enough, and needing all three to fail at once is the point.
    //
    // Narrowed on 2026-09-26: "any app_id or subtype" also dropped the
    // founder's own messages sent through the Claude connector and any message
    // with a screenshot. See lib/war-room/dm-intake.ts.
    // #cortex is the agent's own channel (CORTEX_SLACK_CHANNEL). A human
    // message there is addressed to Cortex the way a DM is: a question gets
    // the same answer engine, in the thread; the Telegram inbox commands
    // ("approve 5 6", "skip 7", "later") work when the founder types them.
    // The bot already receives message.channels, so nothing else subscribes.
    // Its own posts, joins and other apps are skipped the way the DM path does
    // (lib/war-room/dm-intake.ts), or an answer ending in "?" would be read
    // back as a question and answered again, forever.
    const cortexChannel = process.env.CORTEX_SLACK_CHANNEL?.trim();
    const inCortexChannel = Boolean(cortexChannel) && /^[CG][A-Z0-9]{8,}$/.test(cortexChannel!)
      && payload.event.channel === cortexChannel
      && payload.event.type === "message"
      // The DM path's own filter, not "any app_id": the founder's messages
      // through the Claude connector carry an app id and must still count.
      && !isOwnMessage(payload) && (!payload.event.subtype || payload.event.subtype === "file_share")
      && Boolean(payload.event.user);
    if (inCortexChannel) {
      if (request.headers.get("x-slack-retry-num")) return NextResponse.json({ ok: true, retry: true });
      const text = cleanDmText(payload.event.text).replace(/<@[A-Z0-9]+>/g, "").replace(/\s+/g, " ").trim();
      if (!text) return NextResponse.json({ ok: true, cortexChannel: { ignored: "no text" } });
      // Still evidence: what the team says in #cortex is part of the record,
      // as it was before the channel answered back.
      await ingestSlackEventEvidence(db, payload.event).catch(() => null);
      const threadTs = payload.event.thread_ts ?? payload.event.ts;
      const say = (reply: string) => postAsCortex(payload.event!.channel!, reply, { threadTs }).catch(() => null);
      const founderId = process.env.WAR_ROOM_BRIEF_SLACK_USER_ID?.trim() || null;
      const fromFounder = Boolean(founderId) && payload.event.user === founderId;
      const command = parseInboxCommand(text);
      if (command) {
        if (!fromFounder) {
          await say("Only TJ can approve, skip or snooze inbox items. I can answer questions for anyone, though.");
          return NextResponse.json({ ok: true, cortexChannel: { command: "not the founder" } });
        }
        const reply = await handleInboxCommand(db, command);
        if (reply) await say(reply);
        return NextResponse.json({ ok: true, cortexChannel: { command: command.verb } });
      }
      // The founder replying inside one of Cortex's initiative threads may be
      // tuning it ("weekly, not daily", "ask me first on renames", a standing
      // rule). Saved scoped to the initiative, acknowledged with the way back.
      // Anything that is not an instruction falls through and is answered.
      if (fromFounder && payload.event.thread_ts && payload.event.ts) {
        const thread = await initiativeForThread(db, payload.event.thread_ts).catch(() => null);
        // In the providers thread a name is a request for the card and a
        // drafted note (slice 3). Checked before tuning: it is deterministic
        // and free, and "Bowie Commons" is never an instruction.
        if (thread?.initiative === "providers") {
          const card = await providerCardReply(db, { threadTs: payload.event.thread_ts, text }).catch(() => null);
          if (card) {
            await say(card);
            return NextResponse.json({ ok: true, cortexChannel: { providerCard: true } });
          }
        }
        if (thread) {
          const tuned = await applyTuningMessage(db, { initiative: thread.initiative, lastPost: thread.lastPost, text, slackTs: payload.event.ts, user: payload.event.user ?? null }).catch(() => null);
          if (tuned) {
            await say(tuned.reply);
            return NextResponse.json({ ok: true, cortexChannel: { tuned: thread.initiative, parsed: tuned.parsed } });
          }
        }
      }
      const addressed = payload.event.thread_ts ? await findAskByThread(db, payload.event.thread_ts) : null;
      const openExchange = addressed ? null : await loadOpenExchange(db);
      const answer = await answerFounderQuestion(
        db,
        text,
        addressed?.investigationId ?? openExchange?.focusInvestigationId ?? null,
        openExchange,
        {},
      );
      await say(answer.reply);
      if (answer.answered) {
        await recordExchange(db, {
          question: text.slice(0, 500),
          answer: answer.reply.slice(0, 1_500),
          focusInvestigationId: addressed?.investigationId ?? openExchange?.focusInvestigationId ?? null,
        });
      }
      return NextResponse.json({ ok: true, cortexChannel: { answered: answer.answered } });
    }
    if (payload.event.channel_type === "im" && isReadableDm(payload)) {
      const text = cleanDmText(payload.event.text);
      // Slack retries anything it does not see answered within three seconds,
      // up to three times. Every branch below can exceed that: starting a scan
      // plus confirming it, and answering a question, which measured 2.5 to 6.4
      // seconds against live data. A serverless route cannot answer Slack early
      // and keep working, because it can be frozen the moment it responds.
      //
      // So retries are acknowledged and dropped. The first attempt is doing the
      // work. Without this, one question would be answered three times, charged
      // three times, and one answer would be written to the record three times.
      if (request.headers.get("x-slack-retry-num")) {
        return NextResponse.json({ ok: true, retry: true });
      }

      // `chat.postMessage` accepts either a user id (U.../W...) or an IM channel
      // id (D...) as its channel, so this variable delivers the daily brief
      // correctly whichever shape it holds, and nothing has ever needed to know
      // which. Authorisation does: only a user id can be compared to
      // `event.user`. Comparing a D-channel id against a sender would never
      // match, which would have rejected the founder's own replies and broken
      // the answer loop that works in production today.
      //
      // So the two uses are separated. `dmTarget` delivers, and works either
      // way. `founderUserId` authorises, and is null unless we hold something
      // that can actually identify a person.
      const dmTarget = process.env.WAR_ROOM_BRIEF_SLACK_USER_ID?.trim() || null;
      const founderUserId = dmTarget && /^[UW][A-Z0-9]{2,}$/i.test(dmTarget) ? dmTarget : null;

      // "scan" is a command, not an answer. Checked before capture so the word
      // is never filed as evidence against whatever was last asked.
      const command = parseScanCommand(text);
      if (command) {
        // A scan spends real money, so only the founder may start one. Without
        // this, anyone who can DM the bot could run up the bill, and the
        // confirmation would be delivered to the founder rather than to them --
        // he would see replies to commands he never typed.
        //
        // Being unable to identify him is a misconfiguration, not an
        // unauthorised request, so it says so rather than going quiet. A
        // command that silently does nothing is indistinguishable from a broken
        // deploy, and that ambiguity has cost this project days before.
        if (!founderUserId) {
          if (dmTarget) {
            await sendSlackDirectMessage(
              dmTarget,
              "I cannot start a scan: WAR_ROOM_BRIEF_SLACK_USER_ID is not a Slack user id, so I cannot verify who is asking. It needs to be the U... id, not a D... channel id.",
            ).catch(() => null);
          }
          return NextResponse.json({ ok: true, scanCommand: { ignored: "founder id not a user id" } });
        }
        if (payload.event.user !== founderUserId) {
          return NextResponse.json({ ok: true, scanCommand: { ignored: "not the founder" } });
        }

        const result = await runScanCommand(db, command);
        // Awaited, not fired and forgotten: this route can be frozen the moment
        // it responds, and an unsent confirmation looks exactly like a scan
        // that never started.
        await sendSlackDirectMessage(dmTarget ?? founderUserId, result.reply).catch(() => null);
        return NextResponse.json({ ok: true, scanCommand: { started: result.started, runId: result.runId ?? null } });
      }

      // Anyone who can DM this bot was having their words recorded as a
      // `founder_answered` event and fed to the next scan attributed to the
      // founder. Trust in this path is total and deliberate -- an answer here
      // outranks a probe -- which is exactly why it must be him.
      //
      // Fails OPEN when the env var is unset, because this loop works in
      // production today and an unset variable must not silently break it. It
      // only rejects when we positively know the sender is somebody else.
      if (founderUserId && payload.event.user !== founderUserId) {
        return NextResponse.json({ ok: true, founderAnswer: { captured: false, reason: "not the founder" } });
      }

      // "Approved, go ahead" approves the one decision waiting on him. It used
      // to be read as conversation, and approval only existed on the admin
      // page. With more than one waiting, it names them rather than guess.
      // "Go ahead" or "do it" right after Cortex answered something is a reply
      // to that exchange, not a verdict on the proposal. Only a message that
      // says "approve" approves mid-conversation.
      const approving = isApproval(text)
        && (/approv/i.test(text) || !(await loadOpenExchange(db)));
      if (approving) {
        const { data: waiting } = await db.from("war_room_proposals")
          .select("*")
          .eq("status", "proposed")
          .order("created_at", { ascending: true })
          .limit(5);
        const proposals = (waiting ?? []) as WarRoomProposal[];
        if (proposals.length === 1) {
          const { approveWarRoomProposal } = await import("@/lib/war-room/approve.server");
          const approval = await approveWarRoomProposal(db, proposals[0], "founder via Slack");
          const reply = approvalReply(proposals[0], approval);
          if (dmTarget) await sendSlackDirectMessage(dmTarget, reply, { threadTs: payload.event.thread_ts }).catch(() => null);
          return NextResponse.json({ ok: true, approval: { approved: approval.approved } });
        }
        if (proposals.length > 1 && dmTarget) {
          await sendSlackDirectMessage(
            dmTarget,
            `${proposals.length} decisions are waiting, so I approved none of them. Approve the one you mean on the <https://olera.care/admin/war-room|Cortex page>:\n${proposals.map((proposal) => `• ${proposal.title}`).join("\n")}`,
            { threadTs: payload.event.thread_ts },
          ).catch(() => null);
          return NextResponse.json({ ok: true, approval: { approved: false, reason: "more than one waiting" } });
        }
        // Nothing waiting. On 2026-09-26 this fell through to conversation and
        // "Approved, go ahead" was filed as the founder's answer to the
        // north-star question. An approval is never evidence: say what the
        // last approval was and stop.
        const { data: last } = await db.from("war_room_proposals")
          .select("title, approved_at, status, execution_error")
          .not("approved_at", "is", null)
          .order("approved_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (dmTarget) {
          await sendSlackDirectMessage(dmTarget, nothingWaitingReply(last as never), { threadTs: payload.event.thread_ts }).catch(() => null);
        }
        return NextResponse.json({ ok: true, approval: { approved: false, reason: "nothing waiting" } });
      }

      // Screenshots are read, not ignored. Downloaded with the bot token, which
      // already reads files shared in channels; a failure is said out loud.
      const images: Array<{ mediaType: string; data: string }> = [];
      let imageNote = "";
      const token = process.env.SLACK_BOT_TOKEN;
      // In parallel: the route has 90 seconds and the answer needs most of them.
      const downloads = await Promise.allSettled(imageFiles(payload.event.files).slice(0, 3).map(async (file) => {
        if (!token) throw new Error("no Slack bot token");
        const bytes = await downloadSlackFile(token, file);
        return { mediaType: (file.mimetype ?? "image/png").toLowerCase(), data: Buffer.from(bytes).toString("base64") };
      }));
      for (const download of downloads) {
        if (download.status === "fulfilled") images.push(download.value);
        else imageNote = `\n\n_I couldn't open the image you sent (${download.reason instanceof Error ? download.reason.message : "download failed"}), so this answers the text only._`;
      }
      if (skippedImages(payload.event.files).length && !imageNote) {
        imageNote = "\n\n_I couldn't read one of the images you sent (too large, or a format I can't open, such as HEIC). A PNG or JPEG screenshot works._";
      }
      const imageOnly = !text && (images.length > 0 || Boolean(imageNote));

      // A reply typed in the thread of the brief that asked names its own
      // subject. Outside a thread there is nothing to resolve, so the older
      // latest-ask rule still applies -- stated here rather than hidden, since
      // it is wrong whenever a newer brief landed in between.
      const threadTs = payload.event.thread_ts;
      const addressed = threadTs ? await findAskByThread(db, threadTs) : null;

      // Is an exchange still in progress? A message arriving moments after
      // Cortex answered is the next turn of that conversation, not the answer
      // to something a brief asked yesterday.
      //
      // This is what the lexical classifier cannot see, and tuning it would not
      // help: on 2026-09-22 a two-word correction, "Aging in America", was
      // genuinely not a question by any wording test, and got filed as his
      // answer to an unrelated condition. What marked it as conversation was
      // that Cortex had just spoken.
      //
      // A threaded reply outranks this. Replying in a brief's thread is an
      // explicit statement of subject, and it should win over timing.
      const openExchange = addressed ? null : await loadOpenExchange(db);

      // "visualize ..." hands a brief to a Claude Code routine that publishes a
      // real artifact; see lib/war-room/visualize.server.ts. Never evidence.
      const visualSubject = visualizeSubject(text);
      if (visualSubject !== null && dmTarget) {
        const subject = visualSubject || "the subject of our last exchange";
        const brief = await answerFounderQuestion(
          db,
          `Write the source brief for a visual of: ${subject}`,
          addressed?.investigationId ?? openExchange?.focusInvestigationId ?? null,
          openExchange,
          { mode: "brief" },
        );
        const start = brief.answered
          ? await startVisualRoutine(`TJ asked Cortex in Slack: "${text}"\n\nSource brief gathered by Cortex from Olera's record:\n\n${brief.reply}`)
          : { started: false as const, reason: "I could not gather the material for it" };
        const reply = start.started
          ? `Building the visual in a Claude Code session. <${start.sessionUrl}|Open it here>, and tap Allow when it asks to publish. It takes a few minutes.`
          : `I couldn't start the visual: ${start.reason}.${brief.answered ? `\n\nHere is the material I gathered for it:\n\n${brief.reply.slice(0, 2_800)}` : ""}`;
        await sendSlackDirectMessage(dmTarget, reply, { threadTs }).catch(() => null);
        if (brief.answered) {
          await recordExchange(db, {
            question: text.slice(0, 500),
            answer: reply.slice(0, 1_500),
            focusInvestigationId: addressed?.investigationId ?? openExchange?.focusInvestigationId ?? null,
          });
        }
        return NextResponse.json({ ok: true, visualize: { started: start.started } });
      }

      // A question is not an answer. Filing one as evidence writes it into the
      // record attributed to the founder and hands it to the next scan, which
      // is worse than doing nothing.
      // Filed as evidence only when it is plainly an answer: typed in the
      // brief's thread, or judged to answer the brief's actual question.
      // A screenshot with no words is a question about the screenshot, never an
      // answer to file: empty text classifies as an answer and was filed as
      // "empty reply" when sent in a brief's thread.
      const looksLikeAnswer = !imageOnly && classifyMessage(text) === "answer"
        && (Boolean(addressed) || await answersOpenAsk(db, text));
      if (!looksLikeAnswer || openExchange) {
        const answer = await answerFounderQuestion(
          // A message that is only a screenshot still asks something.
          db,
          text || "What is this, and what should I do about it?",
          addressed?.investigationId ?? openExchange?.focusInvestigationId ?? null,
          openExchange,
          { images },
        );

        // A statement arriving mid-conversation is ambiguous in a way no
        // wording test can settle: "Aging in America" is a correction and
        // "Close it, not worth a plan" is a verdict, and they look identical.
        // Treating it as conversation is right for the first and silently
        // loses the second -- and losing a verdict is the expensive direction,
        // because that is the answer the recurrence question exists to collect.
        //
        // So it is not resolved by guessing. The reply says what was and was
        // not recorded, and names what is still open.
        let note = "";
        if (looksLikeAnswer) {
          const stillOpen = await findOpenAsk(db);
          note = stillOpen
            ? `\n\n_Taken as conversation, not recorded. If that was your answer about *${withoutStaleRenewalCounts(stillOpen.title ?? "the open question")}*, reply in that brief's thread and I will file it._`
            : "\n\n_Taken as conversation, not recorded as evidence._";
        }

        if (dmTarget) {
          await sendSlackDirectMessage(dmTarget, answer.reply + note + imageNote, { threadTs }).catch(() => null);
        }
        // His reply answers whatever Cortex last put in front of him (the
        // brief is mirrored here), so the reaction log sees Slack replies too.
        const { recordFounderReply } = await import("@/lib/war-room/moves.server");
        await recordFounderReply(db, text, { pushedBack: Boolean(answer.correction) }).catch(() => null);
        // Only a real answer continues the exchange. A failure to answer should
        // not hold the conversation open and swallow the next thing he says.
        if (answer.answered) {
          await recordExchange(db, {
            question: text.slice(0, 500),
            answer: answer.reply.slice(0, 1_500),
            focusInvestigationId: addressed?.investigationId ?? openExchange?.focusInvestigationId ?? null,
          });
        }
        return NextResponse.json({ ok: true, question: { answered: answer.answered, continued: Boolean(openExchange) } });
      }

      const captured = await captureFounderAnswer(db, text, addressed);
      // Acknowledged, and naming what it was filed against. Silence is what
      // made a reply landing on the wrong condition indistinguishable from a
      // reply landing nowhere at all.
      if (dmTarget) {
        const ack = captured.captured
          ? `Recorded against *${withoutStaleRenewalCounts(captured.title ?? "the open question")}*.`
          : `I did not record that: ${captured.reason ?? "unknown reason"}.`;
        await sendSlackDirectMessage(dmTarget, ack, { threadTs }).catch(() => null);
      }
      return NextResponse.json({ ok: true, founderAnswer: captured });
    }

    const result = await ingestSlackEventEvidence(db, payload.event);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[war-room] Slack event ingestion failed:", error);
    return NextResponse.json({ error: "Could not store Slack evidence" }, { status: 500 });
  }
}
