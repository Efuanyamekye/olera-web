import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Click attribution for texts.
 *
 * Texts carry a link to the family's plan page, and until now an arrival there
 * was unattributable: /m/{token} bumped a single overwritten last_viewed_at, so
 * 225 of 362 families had "viewed at some point" and nothing said which message
 * sent them or how many times. The Clicked column on /admin/automations was a
 * dash for every text row because nothing ever wrote first_clicked_at.
 *
 * The mechanism is a one-character marker on the link (?s=f) resolved back to
 * an email_type on arrival. Kept to three characters total because SMS bodies
 * are length-budgeted and the plan URL is already long.
 *
 * Email is deliberately NOT marked this way. Apple Mail rewrites links and
 * strips parameters, so a marker there is unreliable; Resend's own click
 * webhook already fills first_clicked_at for email
 * (lib/resend-events.ts). This exists because SMS has no equivalent.
 */

/**
 * email_type → URL marker. Values are single characters and must stay stable:
 * a link already sent to a family carries the old code forever.
 */
const SOURCE_CODES: Record<string, string> = {
  benefits_results_sms: "r",
  benefits_first_step_sms: "f",
  benefits_check_in_sms: "c",
  benefits_concierge_reply_sms: "n",
  benefits_companion_opener: "o",
  // Self-check only (/admin/sms-click-test). Deliberately its own type so a
  // verification click lands on a row nobody reports on: it belongs to no cron
  // job's smsTypes, so it can never move a real automation's numbers. Proving
  // the pipeline works must not corrupt the thing being proven.
  sms_click_test: "t",
};
/** email_type reserved for the admin self-check. */
export const SMS_CLICK_TEST_TYPE = "sms_click_test";

const EMAIL_TYPE_BY_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(SOURCE_CODES).map(([type, code]) => [code, type]),
);

/** The query parameter carrying the marker. One letter, for SMS length. */
export const SMS_SOURCE_PARAM = "s";

/**
 * Tag a plan link so an arrival can be attributed to the text that sent it.
 * Returns the URL unchanged for an email_type with no code, so an untagged
 * caller degrades to today's behaviour rather than producing a broken link.
 */
export function withSmsSource(url: string, emailType: string): string {
  const code = SOURCE_CODES[emailType];
  if (!code) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}${SMS_SOURCE_PARAM}=${code}`;
}

/** Marker back to the email_type that sent it, or null if unrecognized. */
export function emailTypeForSmsSource(code: string | null | undefined): string | null {
  if (!code || typeof code !== "string") return null;
  return EMAIL_TYPE_BY_CODE[code] ?? null;
}

/** Matches a link this module tagged: ?s= or &s= followed by a known code. */
const TAGGED_LINK = new RegExp(
  `[?&]${SMS_SOURCE_PARAM}=(?:${Object.keys(EMAIL_TYPE_BY_CODE).join("|")})(?:\\b|$)`,
);

/**
 * Could a click on this message ever have been recorded?
 *
 * Reads the stored body (email_log.html_body) and asks whether its link carries
 * a marker. This is the honest denominator for a click rate: texts sent before
 * tagging shipped have untagged links and can never register a click, so
 * dividing clicks by ALL sends would report a falling rate that is really just
 * old sends diluting the pool. Dividing by tagged sends only reports what was
 * actually measurable.
 *
 * Derived from the code table rather than hardcoded, so it stays in step if a
 * rung is added. Self-healing too: as untagged sends age out of the reporting
 * window, the denominator converges on the total with no dated cutoff to
 * maintain.
 */
export function isClickTagged(body: string | null | undefined): boolean {
  if (!body) return false;
  return TAGGED_LINK.test(body);
}

/**
 * Stamp first_clicked_at on the send this arrival came from.
 *
 * Matching: the NEWEST SMS row for this family of this email_type, clicked or
 * not, stamped only if it is still unclicked. The link cannot carry the
 * email_log row id because the URL is built before the row exists, so profile
 * + type + recency is the available join.
 *
 * Selecting the newest row outright rather than the newest UNCLICKED one is
 * load-bearing. Filtering on unclicked meant a second visit skipped past the
 * already-attributed send and stamped an OLDER one, inventing a click on a
 * message nobody opened. 2 of 65 profile+type pairs already have repeat sends,
 * so that was live rather than theoretical. Now a repeat visit finds the newest
 * row already clicked and does nothing.
 *
 * Write-once, mirroring the email path (lib/resend-events.ts), so
 * first_clicked_at means "first arrival" on both channels rather than "most
 * recent" on one.
 *
 * Known imprecision that remains: a family sent the same rung twice who only
 * opens the older link still gets the newer send credited. Bounded, because
 * rungs go out on a cadence rather than in bursts, and it cannot manufacture a
 * click that did not happen — only attribute a real one to the wrong send.
 *
 * Awaited by the caller, not fire-and-forget. The last_viewed_at bump in
 * lib/benefits-token.ts floats safely because it is a single statement; this is
 * a read followed by a write, which doubles the window for Vercel to kill the
 * pending promise after the response. Silently dropping clicks is the one
 * failure this feature cannot tolerate, since undercounting is invisible.
 *
 * Supabase resolves with {data, error} rather than rejecting, so errors are
 * read explicitly and never thrown — an analytics write must not break a
 * family's page.
 */
export async function recordSmsClick(
  client: SupabaseClient,
  opts: { profileId: string; sourceCode: string | null | undefined },
): Promise<void> {
  const emailType = emailTypeForSmsSource(opts.sourceCode);
  if (!emailType || !opts.profileId) return;

  const { data: row, error: findErr } = await client
    .from("email_log")
    .select("id, first_clicked_at")
    .eq("channel", "sms")
    .eq("email_type", emailType)
    .eq("provider_id", opts.profileId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (findErr) {
    console.error("[sms-click] lookup failed:", findErr.message);
    return;
  }
  // No send of this type on file: the link predates click tracking, or the
  // marker was hand-edited. Expected, not an error.
  if (!row) return;
  // Already attributed. A repeat visit must not move it, and must not fall
  // through to an older send.
  if (row.first_clicked_at) return;

  const { error: updateErr } = await client
    .from("email_log")
    .update({ first_clicked_at: new Date().toISOString() })
    .eq("id", row.id);
  if (updateErr) console.error("[sms-click] update failed:", updateErr.message);
}
