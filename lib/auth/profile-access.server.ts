/**
 * Which profiles a signed-in user may act for — server only.
 *
 * Two ways in: the user owns the profile (business_profiles.account_id is their
 * account), or their sign-in email is a member of it (business_profile_members,
 * migration 272). Members are an agency's staff, such as an intake director
 * who works the families while the owner holds the account.
 *
 * Every route that decides "can this user act as this provider" should ask
 * here instead of comparing account_id itself, or a member is locked out.
 * Uses the service client, so the answer does not depend on RLS.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type ActingUser = { id: string; email?: string | null };

/** Owned profile ids, then member profile ids, optionally limited to some types. */
export async function actingProfileIds(
  db: SupabaseClient,
  user: ActingUser,
  opts: { types?: string[] } = {},
): Promise<string[]> {
  const { data: account } = await db.from("accounts").select("id").eq("user_id", user.id).maybeSingle();
  const email = user.email?.trim().toLowerCase() || null;

  const [owned, member] = await Promise.all([
    account
      ? db.from("business_profiles").select("id, type").eq("account_id", account.id)
      : Promise.resolve({ data: [] as { id: string; type: string }[] }),
    email
      ? db.from("business_profile_members").select("profile_id").eq("email", email)
      : Promise.resolve({ data: [] as { profile_id: string }[] }),
  ]);

  const ownedRows = (owned.data ?? []) as { id: string; type: string }[];
  const memberIds = ((member.data ?? []) as { profile_id: string }[]).map((m) => m.profile_id);

  let memberRows: { id: string; type: string }[] = [];
  if (memberIds.length > 0) {
    const { data } = await db.from("business_profiles").select("id, type").in("id", memberIds);
    memberRows = (data ?? []) as { id: string; type: string }[];
  }

  const keep = (r: { type: string }) => !opts.types || opts.types.includes(r.type);
  return Array.from(new Set([...ownedRows.filter(keep), ...memberRows.filter(keep)].map((r) => String(r.id))));
}

/** True when the user owns the profile or is a member of it. */
export async function canActForProfile(db: SupabaseClient, user: ActingUser, profileId: string): Promise<boolean> {
  if (!profileId) return false;
  const ids = await actingProfileIds(db, user);
  return ids.includes(profileId);
}

/** Emails added as members of a profile (lowercased). */
export async function memberEmails(db: SupabaseClient, profileId: string): Promise<string[]> {
  const { data } = await db.from("business_profile_members").select("email").eq("profile_id", profileId);
  return ((data ?? []) as { email: string }[]).map((m) => m.email);
}
