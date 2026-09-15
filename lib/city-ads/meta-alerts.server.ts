import type { SupabaseClient } from "@supabase/supabase-js";
import { sendSlackAlert } from "@/lib/slack";
import { getSiteUrl } from "@/lib/site-url";

/** Only IDs and an admin link leave Olera; no family contact/health details. */
export function metaAlertText(kind: string, receiptId: string | null, siteUrl: string) {
  const headline = kind === "new_lead" ? "New Meta Instant Form lead — Olera concierge follow-up needed."
    : kind === "import_failed" ? "Meta lead import needs attention after repeated failures."
      : "Olera Meta intake is failing. Check credentials, form configuration and the city clock.";
  return `${headline}${receiptId ? ` Meta receipt: ${receiptId}.` : ""} ${siteUrl}/admin/city-ads`;
}

export async function queueMetaSystemAlert(db: SupabaseClient) {
  // At most one system alert per UTC hour; receipt alerts are once per event.
  const { error } = await db.from("meta_lead_alerts").upsert({
    event_key: `system:${new Date().toISOString().slice(0,13)}`, kind: "system_error",
  }, { onConflict: "event_key", ignoreDuplicates: true });
  if (error) throw new Error("Could not queue Meta system alert");
}

export async function runMetaAlerts(db: SupabaseClient) {
  if (!process.env.SLACK_WEBHOOK_URL) return { configured: false, sent: 0, failed: 0 };
  // A crashed send is ambiguous. Expose it for review, never automatically resend.
  const { error: recoverError } = await db.from("meta_lead_alerts")
    .update({ status: "failed", last_error: "Slack delivery uncertain; check Slack before resending." })
    .eq("status", "sending").lt("claimed_at", new Date(Date.now()-10*60000).toISOString());
  if (recoverError) throw new Error("Could not recover Slack alert status");
  const { data, error } = await db.from("meta_lead_alerts").select("id,kind,receipt_id")
    .eq("status", "pending").order("created_at").limit(5);
  if (error) throw new Error("Could not read Meta alerts");
  let sent = 0, failed = 0;
  for (const row of data ?? []) {
    const { data: claim, error: claimError } = await db.from("meta_lead_alerts")
      .update({ status: "sending", claimed_at: new Date().toISOString() }).eq("id", row.id).eq("status", "pending")
      .select("id").maybeSingle();
    if (claimError) throw new Error("Could not claim Meta alert");
    if (!claim) continue;
    const result = await sendSlackAlert(metaAlertText(row.kind,row.receipt_id,getSiteUrl()), undefined, { timeoutMs: 4000 });
    const { error: updateError } = await db.from("meta_lead_alerts").update({ status: result.success ? "sent" : "failed",
      completed_at: new Date().toISOString(), last_error: result.success ? null : "Slack delivery failed or uncertain; check Slack before resending." }).eq("id",row.id);
    if (updateError) throw new Error("Could not record Meta Slack delivery");
    if (result.success) sent++; else failed++;
  }
  return { configured: true, sent, failed };
}
