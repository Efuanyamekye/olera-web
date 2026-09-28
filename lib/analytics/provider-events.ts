import { createClient } from "@supabase/supabase-js";

type ProviderEventType =
  | "lead_received"
  | "review_received"
  | "question_received"
  // A family Olera offered her, from her inbox (migration 264).
  | "ad_family_offer_viewed"
  | "ad_family_taken"
  | "ad_family_passed";

interface RecordProviderEventInput {
  provider_id: string;
  event_type: ProviderEventType;
  profile_id?: string | null;
  metadata?: Record<string, unknown>;
}

function getServiceDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

/**
 * Fire-and-forget write to provider_activity from server-side creation routes.
 * Never throws — analytics failures must not break the user-facing action that
 * triggered them. Callers should `void recordProviderEvent(...)`.
 */
export async function recordProviderEvent(input: RecordProviderEventInput): Promise<void> {
  try {
    const db = getServiceDb();
    if (!db) return;

    const { error } = await db.from("provider_activity").insert({
      provider_id: input.provider_id,
      profile_id: input.profile_id ?? null,
      event_type: input.event_type,
      metadata: input.metadata ?? {},
    });

    if (error) {
      console.error(`[provider-events] ${input.event_type} insert failed:`, error);
    }

    if (input.event_type === "lead_received") {
      const metadata = input.metadata ?? {};
      const anonymousId = typeof metadata.session_id === "string" ? metadata.session_id : null;
      const conversionId = typeof metadata.connection_id === "string" ? metadata.connection_id : null;
      if (anonymousId && conversionId) {
        const { error: growthError } = await db.from("growth_attribution_events").upsert({
          anonymous_id: anonymousId,
          visit_id: typeof metadata.visit_id === "string" ? metadata.visit_id : anonymousId,
          subject_id: typeof metadata.subject_id === "string" ? metadata.subject_id : null,
          event_type: "lead_created",
          page_path: `/provider/${input.provider_id}`,
          page_category: "provider",
          cta_id: typeof metadata.entry_point === "string"
            ? metadata.entry_point
            : typeof metadata.cta_variant === "string" ? `provider_${metadata.cta_variant}` : "provider_inquiry",
          cta_surface: typeof metadata.cta_surface === "string" ? metadata.cta_surface : null,
          conversion_type: "provider_inquiry",
          conversion_id: conversionId,
          metadata,
        }, { onConflict: "conversion_type,conversion_id", ignoreDuplicates: true });
        if (growthError) console.error("[provider-events] Growth conversion mirror failed:", growthError);
      }
    }
  } catch (err) {
    console.error(`[provider-events] ${input.event_type} threw:`, err);
  }
}
