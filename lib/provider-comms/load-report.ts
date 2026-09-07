import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ONBOARDING_EMAIL_TYPES,
  deliveryState,
  isInternalRecipient,
  outreachBeforeClaim,
  suppressionReason,
  type EmailRecord,
  type Recipient,
  type OnboardingType,
  type ProviderCommsReport,
} from "./reporting";

// Stable pagination and fail-closed totals: never turn a truncated read into a rate.
async function readAll<T>(
  query: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < 50_000; from += 500) {
    const { data, error } = await query(from, from + 499);
    if (error) throw new Error("Provider comms data unavailable");
    rows.push(...(data ?? []));
    if ((data ?? []).length < 500) return rows;
  }
  throw new Error("Reporting window too large; choose a shorter range");
}
interface Profile {
  id: string;
  slug: string;
  source_provider_id: string | null;
  display_name: string;
  claimed_at: string | null;
}
interface Touch {
  provider_id: string;
  created_at: string;
}
interface Tracking {
  provider_id: string;
  sequence_started_at: string | null;
  fax_sent_at: string | null;
  mail_sent_at: string | null;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadProviderCommsReport(
  db: SupabaseClient,
  from: string,
  to: string,
  includeInternal = false,
): Promise<ProviderCommsReport> {
  const emails = await readAll<EmailRecord>((a, b) =>
    db
      .from("email_log")
      .select(
        "id,provider_id,recipient,email_type,status,error_message,resend_id,created_at,delivered_at,first_opened_at,first_clicked_at,bounced_at,complained_at",
      )
      .eq("recipient_type", "provider")
      .eq("channel", "email")
      .in("email_type", ONBOARDING_EMAIL_TYPES)
      .gte("created_at", from)
      .lt("created_at", to)
      .order("id")
      .range(a, b),
  );
  const selected = emails.filter(
    (row) => includeInternal || !isInternalRecipient(row.recipient),
  );
  const rawIds = [
    ...new Set(
      selected.map((row) => row.provider_id).filter((id): id is string => !!id),
    ),
  ];
  const directoryAliases = new Map<string, string>();
  const codes = rawIds.filter((id) => !UUID.test(id));
  for (let i = 0; i < codes.length; i += 80) {
    const aliases = await readAll<{ slug: string; provider_id: string }>(
      (a, b) =>
        db
          .from("olera-providers")
          .select("slug,provider_id")
          .in("slug", codes.slice(i, i + 80))
          .order("provider_id")
          .range(a, b),
    );
    aliases.forEach((row) => directoryAliases.set(row.slug, row.provider_id));
  }
  const profiles = new Map<string, Profile>();
  // Same BP UUID / BP slug / directory ID identity variants as existing admin
  // reporting, with checked, paginated lookups so an identity-query failure
  // cannot silently relabel outreach providers as unknown source.
  for (const field of ["id", "slug", "source_provider_id"] as const) {
    const ids =
      field === "id"
        ? rawIds.filter((id) => UUID.test(id))
        : [...new Set([...rawIds, ...directoryAliases.values()])];
    for (let i = 0; i < ids.length; i += 80) {
      const rows = await readAll<Profile>((a, b) =>
        db
          .from("business_profiles")
          .select("id,slug,source_provider_id,display_name,claimed_at")
          .in(field, ids.slice(i, i + 80))
          .order("id")
          .range(a, b),
      );
      rows.forEach((row) => profiles.set(row.id, row));
    }
  }
  const variants = new Map<string, Profile>();
  const ambiguous = new Set<string>();
  for (const profile of profiles.values())
    for (const key of [profile.id, profile.slug, profile.source_provider_id]) {
      if (!key) continue;
      if (variants.has(key) && variants.get(key)!.id !== profile.id)
        ambiguous.add(key);
      else variants.set(key, profile);
    }
  // Ambiguous aliases have no reliable claim timestamp. Keep them unresolved.
  ambiguous.forEach((key) => variants.delete(key));
  for (const [alias, directoryId] of directoryAliases) {
    if (!variants.has(alias) && variants.has(directoryId))
      variants.set(alias, variants.get(directoryId)!);
  }
  const sourceIds = [
    ...new Set(
      [...profiles.values()]
        .map((p) => p.source_provider_id)
        .filter((id): id is string => !!id),
    ),
  ];
  const dates = new Map<string, string[]>();
  const add = (id: string, values: (string | null)[]) =>
    dates.set(id, [
      ...(dates.get(id) ?? []),
      ...values.filter((v): v is string => !!v),
    ]);
  for (let i = 0; i < sourceIds.length; i += 80) {
    const ids = sourceIds.slice(i, i + 80);
    const [touches, tracking] = await Promise.all([
      readAll<Touch>((a, b) =>
        db
          .from("provider_outreach_touchpoints")
          .select("provider_id,created_at")
          .in("provider_id", ids)
          .in("touchpoint_type", [
            "email_sent",
            "smartlead_enrolled",
            "sequence_launched",
            "contact_form_sent",
            "fax_sent",
            "mail_sent",
          ])
          .order("id")
          .range(a, b),
      ),
      readAll<Tracking>((a, b) =>
        db
          .from("provider_outreach_tracking")
          .select("provider_id,sequence_started_at,fax_sent_at,mail_sent_at")
          .in("provider_id", ids)
          .order("id")
          .range(a, b),
      ),
    ]);
    touches.forEach((t) => add(t.provider_id, [t.created_at]));
    tracking.forEach((t) =>
      add(t.provider_id, [
        t.sequence_started_at,
        t.fax_sent_at,
        t.mail_sent_at,
      ]),
    );
  }
  const recipients = selected
    .map((row): Recipient => {
      const profile = row.provider_id
        ? variants.get(row.provider_id)
        : undefined;
      const state = deliveryState(row);
      const transmitted =
        state !== "suppressed" && state !== "failed" && state !== "pending";
      return {
        id: row.id,
        providerKey:
          profile?.source_provider_id ??
          profile?.id ??
          row.provider_id ??
          `email:${row.recipient.toLowerCase()}`,
        providerName: profile?.display_name || "Unresolved provider",
        directoryId: profile?.source_provider_id ?? profile?.id ?? null,
        email: row.recipient,
        type: row.email_type as OnboardingType,
        attemptedAt: row.created_at,
        source: !profile
          ? "unresolved"
          : outreachBeforeClaim(
                profile.claimed_at,
                dates.get(profile.source_provider_id ?? "") ?? [],
              )
            ? "outreach"
            : "unknown",
        state,
        reason:
          suppressionReason(row.error_message) ??
          (state === "failed" ? "Send failed — inspect the email log" : null),
        accepted: transmitted,
        delivered: transmitted && !!row.delivered_at,
        opened: transmitted && !!row.first_opened_at,
        clicked: transmitted && !!row.first_clicked_at,
      };
    })
    .sort(
      (a, b) =>
        b.attemptedAt.localeCompare(a.attemptedAt) || a.id.localeCompare(b.id),
    );
  return {
    generatedAt: new Date().toISOString(),
    range: { from, to },
    excludedInternal: includeInternal ? 0 : emails.length - selected.length,
    unresolved: recipients.filter((row) => row.source === "unresolved").length,
    recipients,
  };
}
