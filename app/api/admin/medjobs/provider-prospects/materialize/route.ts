import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import { getProviderProspectsInCatchment } from "@/lib/medjobs/catchment";

/**
 * POST /api/admin/medjobs/provider-prospects/materialize
 *
 * Body: { provider_id: string, campus_id: string }
 *
 * Materializes a virtual provider prospect into a real student_outreach
 * row with kind='provider'. Validates that the provider is genuinely in
 * the campus's catchment, isn't already a client, and isn't already
 * materialized for this campus.
 *
 * Returns the new student_outreach row id so the caller can open the
 * drawer for it.
 *
 * Requires migration 073 (relaxes stakeholder_type to allow NULL when
 * kind='provider').
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const adminUser = await getAdminUser(user.id);
    if (!adminUser) return NextResponse.json({ error: "Access denied" }, { status: 403 });

    const body = (await request.json()) as { provider_id?: string; campus_id?: string };
    const providerId = body.provider_id?.trim();
    const campusId = body.campus_id?.trim();

    if (!providerId || !campusId) {
      return NextResponse.json(
        { error: "provider_id and campus_id required" },
        { status: 400 },
      );
    }

    const db = getServiceClient();

    // Resolve campus (need slug for catchment + name for organization_name fallback).
    const { data: campus, error: campusErr } = await db
      .from("student_outreach_campuses")
      .select("id, slug, name")
      .eq("id", campusId)
      .eq("is_active", true)
      .maybeSingle();

    if (campusErr || !campus) {
      return NextResponse.json(
        { error: campusErr?.message ?? "Campus not found or inactive" },
        { status: 404 },
      );
    }

    // Query olera-providers (the main provider directory with 75K+ providers)
    const { data: provider, error: providerErr } = await db
      .from("olera-providers")
      .select(
        "provider_id, provider_name, city, state, email, phone, website, slug, created_at",
      )
      .eq("provider_id", providerId)
      .or("deleted.is.null,deleted.eq.false")
      .maybeSingle();

    if (providerErr || !provider) {
      return NextResponse.json(
        { error: providerErr?.message ?? "Provider not found" },
        { status: 404 },
      );
    }

    // Providers from olera-providers are prospects by definition (not clients).
    // They haven't signed up for Olera yet.

    // Verify provider is genuinely in the campus's catchment (defense
    // against caller passing arbitrary provider × campus pairs).
    const inCatchment = await getProviderProspectsInCatchment(campus.slug);
    const isInCatchment = inCatchment.some((p) => p.id === provider.provider_id);
    if (!isInCatchment) {
      return NextResponse.json(
        { error: "Provider is not in this campus's catchment" },
        { status: 400 },
      );
    }

    // Verify uniqueness — no existing student_outreach row for this
    // provider × campus pair. Check by olera_provider_id in research_data.
    //
    // olera_provider_id is stored as a JSONB *string*, so we must extract it
    // as TEXT with `->>` and compare to the string value. The prior `->`
    // (jsonb) form produced `jsonb = text`, which errors → the check silently
    // returned null → every repeat materialize inserted a DUPLICATE row.
    const { data: existing } = await db
      .from("student_outreach")
      .select("id")
      .eq("kind", "provider")
      .eq("campus_id", campus.id)
      .eq("research_data->>olera_provider_id", provider.provider_id)
      .maybeSingle();

    if (existing) {
      // Idempotent: return the existing row id rather than erroring.
      return NextResponse.json({ id: existing.id, already_materialized: true });
    }

    const orgName = provider.provider_name || "(unnamed provider)";

    // Inherit created_at from olera-providers so the materialized row keeps
    // the EXACT same rank in the Prospects sort as the virtual card. The
    // virtual card (lib/medjobs/catchment.ts) falls back to the epoch
    // sentinel when the provider's created_at is null; we MUST use the same
    // fallback here, otherwise null-dated providers materialize with now()
    // and the card jumps to the top of the list on click.
    const inheritedCreatedAt = provider.created_at ?? new Date(0).toISOString();

    // Store olera-providers data in research_data.general_contact so
    // the outreach cadence can use it (email, phone, website, location).
    const generalContact = {
      email: provider.email || null,
      phone: provider.phone || null,
      website: provider.website || null,
      city: provider.city || null,
      state: provider.state || null,
    };

    const { data: inserted, error: insertErr } = await db
      .from("student_outreach")
      .insert({
        campus_id: campus.id,
        kind: "provider",
        // stakeholder_type is NULL for kind='provider' (per migration 073).
        stakeholder_type: null,
        // provider_business_profile_id is NULL for olera-providers entries
        // since they don't have a business_profiles row yet.
        provider_business_profile_id: null,
        organization_name: orgName,
        status: "researched",
        programs: [],
        research_data: {
          general_contact: generalContact,
          olera_provider_id: provider.provider_id,
          olera_provider_slug: provider.slug,
        },
        cadence_day: 0,
        contact_permission: "not_yet",
        ...(inheritedCreatedAt ? { created_at: inheritedCreatedAt } : {}),
      })
      .select("id")
      .single();

    if (insertErr || !inserted) {
      // Race-safe idempotency: two near-simultaneous materialize calls both
      // pass the existence check above and try to insert. Once the partial
      // unique index (campus_id, olera_provider_id WHERE kind='provider') is
      // in place, the loser hits a unique violation (23505) — re-read and
      // return the winner's row instead of erroring, so the caller still gets
      // one row, never a duplicate.
      if (insertErr?.code === "23505") {
        const { data: raced } = await db
          .from("student_outreach")
          .select("id")
          .eq("kind", "provider")
          .eq("campus_id", campus.id)
          .eq("research_data->>olera_provider_id", provider.provider_id)
          .maybeSingle();
        if (raced) {
          return NextResponse.json({ id: raced.id, already_materialized: true });
        }
      }
      const msg = insertErr?.message ?? "Insert failed";
      console.error("[materialize] insert error:", msg);
      // The most likely cause if migration 073 hasn't run yet is a
      // CHECK violation on stakeholder_type. Surface a clear message.
      const hint = msg.toLowerCase().includes("stakeholder_type")
        ? " — run migration 073_student_outreach_provider_kind.sql in Supabase."
        : "";
      return NextResponse.json({ error: `${msg}${hint}` }, { status: 500 });
    }

    // v9 (final architecture): no auto-mirroring. The provider's
    // directory email + phone live as the "General Contact" on the
    // outreach row itself (effective = business_profiles fields with
    // research_data.general_contact overrides on top). Specific
    // Contacts (student_outreach_contacts) are reserved for NAMED
    // individuals admin discovers — owner, hiring manager, etc.
    // Mixing the two systems was confusing operationally; keeping
    // them separate is the explicit user requirement.

    return NextResponse.json({ id: inserted.id, already_materialized: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[materialize] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
