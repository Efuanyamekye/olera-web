import { NextRequest, NextResponse } from "next/server";
import { countyForZip } from "@/lib/benefits/zip-county.server";
import { getServiceClient } from "@/lib/admin";
import { validateBenefitsOutcomeToken } from "@/lib/claim-tokens";
import { findLocalAAA } from "@/lib/benefits/local-aaa";
import { zipToState } from "@/lib/benefits/zip-lookup";

/**
 * Local Area Agency on Aging lookup for the benefits-outcome "I want help"
 * landing path. POST, not GET: it banks the ZIP/county on the family profile
 * (no GET may mutate — the hard rule from the email-chip scanners lesson),
 * and it's only ever called by the landing page's fetch, never linked.
 *
 * The intake never captured ZIP or county, and sbf_area_agencies routes by
 * county (TX alone has 57 agencies), so the page asks for a ZIP at the moment
 * the family asks for help and we resolve county → agency here. A state-level
 * fallback match is deliberately NOT returned as an agency — promising the
 * wrong institution is worse than pointing at the Eldercare Locator.
 *
 * POST /api/families/benefits-outcome/aaa  body: { tok: string, zip: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const tok: string = body.tok || "";
    const zip: string = (body.zip || "").trim();

    const validation = validateBenefitsOutcomeToken(tok);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    if (!/^\d{5}$/.test(zip)) {
      return NextResponse.json({ error: "A 5-digit ZIP code is required" }, { status: 400 });
    }

    const db = getServiceClient();
    const { data: profile } = await db
      .from("business_profiles")
      .select("id, state, metadata")
      .eq("id", validation.familyProfileId)
      .maybeSingle();

    // The ZIP is the freshest location signal we hold — trust it over the
    // profile state (a family may be applying for a parent in another state).
    const zipState = zipToState(zip);
    const stateCode = zipState || profile?.state || null;
    if (!stateCode) return NextResponse.json({ agency: null });

    const county = await countyForZip(zip);

    // Quietly bank the location for Phase 3 (real situation capture) — the
    // family just told us where they are; wasting that would be silly.
    if (profile) {
      const meta = (profile.metadata as Record<string, unknown>) || {};
      const { error: updErr } = await db
        .from("business_profiles")
        .update({ metadata: { ...meta, zip_code: zip, county: county || meta.county } })
        .eq("id", profile.id);
      if (updErr) console.error("[benefits-outcome/aaa] location bank failed:", updErr);
    }

    const result = await findLocalAAA(db, stateCode, zip, county);

    // County/ZIP matches are trustworthy; a bare state fallback is not.
    if (!result || result.matchedBy === "state") {
      return NextResponse.json({ agency: null });
    }

    const { agency } = result;
    return NextResponse.json({
      agency: {
        name: agency.name,
        phone: agency.phone,
        website: agency.website,
        city: agency.city,
        whatToSay: agency.what_to_say,
      },
    });
  } catch (err) {
    console.error("[benefits-outcome/aaa] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
