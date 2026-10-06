import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The provider profile a signed-in account is currently working as.
 *
 * A login may hold several business profiles, one per location, and the
 * navbar's Switch Profile sets `accounts.active_profile_id`. Provider routes
 * used to fetch "the" profile with `.eq("account_id").in("type", …).single()`,
 * which returns PGRST116 ("multiple rows") the moment a second location is
 * claimed: reviews, Google Business, mark-read and review requests would all
 * fail for exactly the providers who have the most to manage.
 *
 * Prefers the active profile when it is a provider profile on this account;
 * otherwise the newest provider profile, so an account that never switched
 * still resolves. Returns `{ data }` so existing `const { data: profile } =`
 * call sites read unchanged.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function activeProviderProfile<T = Record<string, any>>(
  db: SupabaseClient,
  accountId: string,
  select: string,
): Promise<{ data: T | null }> {
  const { data: account } = await db
    .from("accounts")
    .select("active_profile_id")
    .eq("id", accountId)
    .maybeSingle();
  const activeId = (account?.active_profile_id as string | null | undefined) ?? null;
  if (activeId) {
    const { data } = await db
      .from("business_profiles")
      .select(select)
      .eq("id", activeId)
      .eq("account_id", accountId)
      .in("type", ["organization", "caregiver"])
      .maybeSingle();
    if (data) return { data: data as unknown as T };
  }
  const { data } = await db
    .from("business_profiles")
    .select(select)
    .eq("account_id", accountId)
    .in("type", ["organization", "caregiver"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { data: (data as unknown as T) ?? null };
}
