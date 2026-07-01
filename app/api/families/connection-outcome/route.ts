import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/admin";
import { findAlternativeProviders } from "@/lib/family-comms/alternatives";

/**
 * Family self-report of a connection outcome — the dating-app
 * "Did you meet this person?" pattern.
 *
 * Fired from the one-click /connection-outcome landing page (no login), keyed by
 * the connection id. Records whether the provider got back to the family, which
 * is our ground-truth connection signal (the real outcome happens off-platform
 * and is otherwise invisible — connection.status sits 'pending' forever).
 *
 * IMPORTANT: this records into connections.metadata.outcome + a seeker_activity
 * event. It deliberately does NOT advance connections.status — 'accepted' means
 * "the provider engaged" and is load-bearing for isSuccessfulConnection() and the
 * admin funnel. A family's click is a self-report, not a provider action.
 *
 * On a "no" / "not yet", this is also the cascade trigger: it returns matched
 * alternative providers + the benefits finder for the landing page's mini-cascade.
 *
 * POST /api/families/connection-outcome  body: { cid: string, value: 'yes'|'no'|'not_yet' }
 */

const VALID_VALUES = ["yes", "no", "not_yet"] as const;
type OutcomeValue = (typeof VALID_VALUES)[number];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const cid: string | undefined = body.cid;
    const value = body.value as OutcomeValue | undefined;

    if (!cid || !value || !VALID_VALUES.includes(value)) {
      return NextResponse.json({ error: "cid and a valid value are required" }, { status: 400 });
    }

    const db = getServiceClient();

    const { data: conn } = await db
      .from("connections")
      .select(
        `
        id,
        from_profile_id,
        to_profile_id,
        metadata,
        from_profile:business_profiles!connections_from_profile_id_fkey(care_types, lat, lng),
        to_profile:business_profiles!connections_to_profile_id_fkey(id, display_name, city, state, care_types)
      `,
      )
      .eq("id", cid)
      .eq("type", "inquiry")
      .maybeSingle();

    if (!conn) {
      // Unknown / non-inquiry id. No-op success so the page renders normally and
      // we don't leak which ids exist.
      return NextResponse.json({ success: true, value, noop: "not_found" });
    }

    const fromProfile = Array.isArray(conn.from_profile) ? conn.from_profile[0] : conn.from_profile;
    const toProfile = Array.isArray(conn.to_profile) ? conn.to_profile[0] : conn.to_profile;
    const providerName = (toProfile?.display_name as string) || "the provider";

    // Record the outcome in connection metadata (last-write-wins so a family can
    // change their mind). Never touch status.
    const meta = (conn.metadata as Record<string, unknown>) || {};
    const now = new Date().toISOString();
    meta.outcome = {
      self_reported: true,
      value,
      at: now,
      source: "email_link",
    };

    // If family confirms connection ("yes"), mark it as connected.
    // This is additive data — doesn't override existing connection signals.
    if (value === "yes") {
      meta.family_confirmed = true;
      meta.family_confirmed_at = now;
      // Only stop the sequence if it isn't already stopped
      // (provider may have already connected via phone/email/message)
      if (!meta.followup_stopped_at) {
        meta.followup_stopped_at = now;
        meta.followup_stopped_reason = "family_confirmed";
      }
    }

    const { error: updErr } = await db
      .from("connections")
      .update({ metadata: meta })
      .eq("id", conn.id);
    if (updErr) {
      console.error("[connection-outcome] update failed:", updErr);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    // Activity event (best-effort; constraint added in migration 115).
    await db.from("seeker_activity").insert({
      profile_id: conn.from_profile_id,
      event_type: "connection_outcome_reported",
      related_provider_id: conn.to_profile_id,
      metadata: { value, connection_id: conn.id },
    });

    // YES → real connection (per the family). Nothing more to surface.
    if (value === "yes") {
      return NextResponse.json({ success: true, value, providerName });
    }

    // ── CASCADE TRIGGER SEAM ────────────────────────────────────────────────
    // value is "no" / "not_yet": the provider went quiet. Surface the help
    // cascade. v1 = matched alternative providers + the benefits finder, returned
    // for inline rendering. Future: enqueue auto-outreach to the alternatives,
    // SMS/WhatsApp, concierge handoff, etc.
    const providerCity = toProfile?.city as string | undefined;
    const providerState = toProfile?.state as string | undefined;
    const providerCareTypes = (toProfile?.care_types as string[]) || [];
    const familyCareTypes = (fromProfile?.care_types as string[]) || providerCareTypes;

    const familyLat = typeof fromProfile?.lat === "number" ? fromProfile.lat : null;
    const familyLng = typeof fromProfile?.lng === "number" ? fromProfile.lng : null;
    const alternatives = await findAlternativeProviders(
      db,
      conn.to_profile_id,
      providerCity,
      providerState,
      providerCareTypes,
      familyLat,
      familyLng,
    );

    const browseParams = new URLSearchParams();
    if (familyCareTypes[0]) browseParams.set("care_type", familyCareTypes[0]);
    if (providerCity) browseParams.set("city", providerCity);
    if (providerState) browseParams.set("state", providerState);
    const browseUrl = browseParams.toString() ? `/browse?${browseParams.toString()}` : "/browse";

    return NextResponse.json({
      success: true,
      value,
      providerName,
      alternatives,
      browseUrl,
      benefitsUrl: "/benefits/finder",
    });
  } catch (err) {
    console.error("[connection-outcome] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
