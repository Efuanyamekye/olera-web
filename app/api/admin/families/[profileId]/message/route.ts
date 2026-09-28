import { NextRequest, NextResponse } from "next/server";
import { getAdminUser, getAuthUser, getServiceClient } from "@/lib/admin";
import { sendEmail } from "@/lib/email";
import { careUnsubscribeUrl } from "@/lib/email-templates";
import { replyToSmsThread, MAX_SMS_BODY } from "@/lib/sms/inbox-actions.server";
import { last10 } from "@/lib/seeker-touches/label";
import { getSiteUrl } from "@/lib/site-url";
import { noteBenefitsContact } from "@/lib/family-comms/benefits-replies.server";

/**
 * POST /api/admin/families/[profileId]/message
 * Body: { channel: "sms" | "email", body: string, subject?: string, sendNow?: boolean }
 *
 * Olera writing to a family who is not on a city ad and has no open provider
 * conversation, from the case workspace. Until 2026-09-28 the case page said
 * "texts go through Messages" for these families, which was most benefits
 * families: every reply meant leaving the case.
 *
 * Text goes through replyToSmsThread, the inbox's own send path: quiet hours
 * (parks until their morning unless sendNow), do-not-contact refusal, the
 * research answer job stamped with what was sent, the thread marked handled.
 * Email is a plain personal note from Olera with replies to support@, which
 * the case timeline already reads. Either way a benefits family's help clock
 * is marked contacted and a reply hold lifts, as "I contacted them" does.
 */

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function personalEmailHtml(body: string, planUrl: string | null, unsubscribeUrl: string): string {
  const paragraphs = body
    .split(/\n{2,}/)
    .map(
      (p) =>
        `<p style="margin: 0 0 16px; font-size: 16px; line-height: 1.65; color: #1f2937;">${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`,
    )
    .join("\n");
  const plan = planUrl
    ? `<p style="margin: 8px 0 0; font-size: 15px; line-height: 1.6; color: #4b5563;">Your plan: <a href="${planUrl}" style="color: #33261e;">${planUrl.replace(/^https?:\/\//, "")}</a></p>`
    : "";
  return `
<div style="max-width: 560px; margin: 0 auto; padding: 32px 24px; font-family: Georgia, 'Times New Roman', serif;">
  ${paragraphs}
  ${plan}
  <p style="margin: 28px 0 0; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; line-height: 1.6; color: #9ca3af; font-family: Arial, sans-serif;">
    You can reply to this email. A person on the Olera team reads every reply.
    <a href="${unsubscribeUrl}" style="color: #9ca3af;">Stop these emails</a>.
  </p>
</div>`;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ profileId: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const admin = await getAdminUser(user.id);
  if (!admin) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  const { profileId } = await params;

  let payload: { channel?: unknown; body?: unknown; subject?: unknown; sendNow?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const channel = payload.channel === "email" ? "email" : payload.channel === "sms" ? "sms" : null;
  const text = typeof payload.body === "string" ? payload.body.trim() : "";
  const subject = typeof payload.subject === "string" ? payload.subject.trim() : "";
  if (!channel) return NextResponse.json({ error: "Pick text or email" }, { status: 400 });
  if (!text) return NextResponse.json({ error: "Write a message first" }, { status: 400 });

  const db = getServiceClient();
  const { data: profile } = await db
    .from("business_profiles")
    .select("id, type, email, phone, phone_validity, metadata")
    .eq("id", profileId)
    .maybeSingle();
  if (!profile || profile.type !== "family") return NextResponse.json({ error: "Family not found" }, { status: 404 });
  const actor = admin.email || admin.display_name || "admin";
  const now = new Date().toISOString();

  if (channel === "sms") {
    if (text.length > MAX_SMS_BODY) {
      return NextResponse.json({ error: `A text can be ${MAX_SMS_BODY} characters at most` }, { status: 400 });
    }
    const key = last10(String(profile.phone ?? ""));
    if (!key) return NextResponse.json({ error: "No phone number on file" }, { status: 400 });
    if (profile.phone_validity === "opted_out") {
      return NextResponse.json({ error: "They texted STOP, so we can't text them. Try email." }, { status: 409 });
    }
    // Only people who agreed to texts from us, or who texted us first. A
    // phone typed into a provider inquiry is not consent to texts from Olera
    // (412 such families on 2026-09-28), so those are email-only from here.
    const meta = (profile.metadata as Record<string, unknown> | null) || {};
    let mayText = Boolean(meta.sms_consent);
    if (!mayText) {
      const { data: inbound } = await db.from("sms_inbound").select("id").eq("phone_last10", key).limit(1).maybeSingle();
      mayText = Boolean(inbound);
    }
    if (!mayText) {
      return NextResponse.json(
        { error: "They haven't agreed to texts from us and haven't texted us. Email them instead." },
        { status: 409 },
      );
    }
    const result = await replyToSmsThread(db, {
      last10: key,
      body: text,
      actor,
      adminUserId: admin.id,
      sendNow: payload.sendNow === true,
    });
    if (result.status !== 200) {
      return NextResponse.json({ error: String(result.json.error ?? "The text didn't send") }, { status: result.status });
    }
    await noteBenefitsContact(db, profileId, now, actor).catch((err) =>
      console.error("[families/message] benefits contact stamp failed:", err),
    );
    const scheduled = result.json.scheduled as { sendAfter?: string } | undefined;
    return NextResponse.json({
      ok: true,
      message: scheduled?.sendAfter
        ? "It's outside their hours, so it's scheduled for their morning."
        : "Texted.",
    });
  }

  if (!profile.email) return NextResponse.json({ error: "No email on file" }, { status: 400 });
  if (!subject) return NextResponse.json({ error: "Add a subject" }, { status: 400 });
  if (subject.length > 200 || text.length > 10000) {
    return NextResponse.json({ error: "That's too long for one email" }, { status: 400 });
  }
  const { data: tokenRow } = await db
    .from("benefits_results_tokens")
    .select("token")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const planUrl = tokenRow?.token ? `${getSiteUrl()}/m/${tokenRow.token}` : null;
  const res = await sendEmail({
    to: profile.email,
    subject,
    html: personalEmailHtml(text, planUrl, careUnsubscribeUrl(profileId)),
    emailType: "admin_family_email",
    recipientType: "family",
    recipientProfileId: profileId,
    replyTo: "support@olera.care",
    listUnsubscribeUrl: careUnsubscribeUrl(profileId),
    metadata: { family_profile_id: profileId, sent_by: actor },
  });
  if (!res.success || res.skipped) {
    return NextResponse.json({ error: res.skipReason || res.error || "The email didn't send" }, { status: 502 });
  }
  await noteBenefitsContact(db, profileId, now, actor).catch((err) =>
    console.error("[families/message] benefits contact stamp failed:", err),
  );
  return NextResponse.json({ ok: true, message: "Emailed." });
}
