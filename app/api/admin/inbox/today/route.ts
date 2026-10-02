import { NextRequest, NextResponse } from "next/server";
import { getAdminUser, getAuthUser, getServiceClient } from "@/lib/admin";
import {
  currentText, handleInboxCommand, latestVersion, needsNamedApproval, openItems, pageLabel, sendsOnApproval,
  type InboxCommand, type StoredItem,
} from "@/lib/war-room/inbox-operator.server";
import { isFounderEmail } from "@/lib/war-room/slack-user-token.server";

/**
 * Today's inbox items on a web page (/admin/inbox/today), the same numbered
 * items the Telegram synopsis and the inbox report show. TJ, 2026-10-02: "So I
 * can handle these emails on my computer." Every action runs through
 * handleInboxCommand, the exact path a Telegram reply takes, so the rewrite
 * hold, the fact-check, the provider-send rule and the claim-once guard all
 * apply, and the next pass sees the same state either way.
 */

export const maxDuration = 120;

async function admin() {
  const user = await getAuthUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const row = await getAdminUser(user.id);
  if (!row) return { error: NextResponse.json({ error: "Access denied" }, { status: 403 }) };
  return { user, admin: row };
}

function view(item: StoredItem) {
  const latest = latestVersion(item);
  return {
    number: item.number,
    kind: item.kind,
    category: item.category,
    who: pageLabel(item),
    summary: item.kind === "sms_draft" || item.category === "email:draft:care_seeker" ? item.summary.replace(/^(Email|Text)\s+[^(".]+?(?= re "| \(waiting|\. They said)/, `$1 ${pageLabel(item)}`) : item.summary,
    text: currentText(item) || null,
    version: latest ? (latest.by === "cortex" ? "Cortex's rewrite" : "your version") : null,
    checked: Boolean(latest?.checked),
    sends: sendsOnApproval(item),
    namedOnly: needsNamedApproval(item),
    permalink: typeof item.target?.permalink === "string" ? item.target.permalink : null,
    carried: Boolean(item.target?.carried),
  };
}

export async function GET() {
  const auth = await admin();
  if ("error" in auth) return auth.error;
  const open = (await openItems(getServiceClient())).filter((item) => !(item as StoredItem & { decided_at?: string | null }).decided_at);
  return NextResponse.json({ passId: open[0]?.pass_id ?? null, items: open.map(view) });
}

export async function POST(request: NextRequest) {
  const auth = await admin();
  if ("error" in auth) return auth.error;
  // Approving posts Slack replies as TJ and sends from support@ under his
  // approval record, so only he acts here; other admins can read.
  if (!isFounderEmail(auth.admin.email ?? auth.user.email)) {
    return NextResponse.json({ error: "Only TJ can act on these items; they go out under his name." }, { status: 403 });
  }
  const body = await request.json().catch(() => null) as { action?: string; number?: number; text?: string | null } | null;
  const number = Number(body?.number);
  const verb = body?.action === "approve" ? "approve" : body?.action === "skip" ? "skip" : body?.action === "check" ? "check" : null;
  if (!verb || !Number.isInteger(number)) return NextResponse.json({ error: "Send { action: approve|check|skip, number, text? }" }, { status: 400 });
  const edit = typeof body?.text === "string" && body.text.trim() ? body.text.trim() : null;
  const db = getServiceClient();
  // An edit only counts when it differs from what is stored; an unchanged text
  // area must not bypass the rewrite hold by arriving as "his words".
  const item = (await openItems(db)).find((open) => open.number === number);
  if (!item) return NextResponse.json({ error: `${number} is not open any more (done, skipped, or from an older pass).` }, { status: 409 });
  const changed = edit !== null && edit !== currentText(item).trim();
  const command: InboxCommand = { verb, numbers: [number], edit: verb === "skip" ? null : changed ? edit : null };
  try {
    const result = await handleInboxCommand(db, command);
    return NextResponse.json({ ok: true, result: result ?? "Nothing open." });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Action failed" }, { status: 500 });
  }
}
