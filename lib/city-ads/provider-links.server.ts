/**
 * Links in the emails a provider gets about a family from an ad — server only.
 *
 * Every provider email about a family opens that family in her inbox and signs
 * her in on the way, the same way the inquiry message emails already do
 * (app/api/connections/message). The inbox shows nothing to a signed-out
 * visitor, and a link to the list makes her hunt.
 *
 * The token is issued for the email she signs in with, which can differ from
 * the listing's public address. A provider with no account has no inbox, so
 * callers fall back to the one-offer page (/p/offer/{token}), which needs no
 * sign-in. Texts always use that page: a text can land on a shared office
 * line, and a sign-in link there would open her whole account.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { generateFamilyInboxUrl } from "@/lib/claim-tokens";
import { getSiteUrl } from "@/lib/site-url";

export function inboxPathFor(leadId: string): string {
  return `/portal/inbox?role=provider&ad=${leadId}`;
}

/** A signed-in link to this family in her inbox, or null when she has no account. */
export async function providerSignInUrl(db: SupabaseClient, providerId: string, leadId: string): Promise<string | null> {
  try {
    const { data: bp } = await db.from("business_profiles").select("account_id").eq("id", providerId).maybeSingle();
    if (!bp?.account_id) return null;
    const { data: acct } = await db.from("accounts").select("user_id").eq("id", bp.account_id).maybeSingle();
    if (!acct?.user_id) return null;
    const { data } = await db.auth.admin.getUserById(acct.user_id as string);
    const email = data?.user?.email;
    return email ? generateFamilyInboxUrl(email, inboxPathFor(leadId), getSiteUrl()) : null;
  } catch (e) {
    console.error("[city-ads] provider sign-in link failed", e);
    return null;
  }
}
