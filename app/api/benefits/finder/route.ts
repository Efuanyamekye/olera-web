import { NextResponse } from "next/server";
import { countyForZip } from "@/lib/benefits/zip-county.server";
import { createClient } from "@supabase/supabase-js";
import { zipToState } from "@/lib/benefits/zip-lookup";
import { buildFinderResult } from "@/lib/benefits/finder-engine.server";
import { emptyFinderAnswers, type FinderAnswers } from "@/lib/benefits/finder-answers";

/**
 * Results for the redesigned finder (/benefits/finder). Read-only: nothing
 * is saved until the family asks for the plan (save-results).
 */

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase not configured");
  return createClient(url, key);
}

export async function POST(request: Request) {
  let body: Partial<FinderAnswers>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  // Only known fields, with safe defaults for anything missing.
  const a: FinderAnswers = { ...emptyFinderAnswers(), ...body };
  a.needs = Array.isArray(a.needs) ? a.needs : [];
  a.caregiverNeeds = Array.isArray(a.caregiverNeeds) ? a.caregiverNeeds : [];
  a.zip = typeof a.zip === "string" ? a.zip.replace(/\D/g, "").slice(0, 5) : "";

  if (!a.stateCode && a.zip.length === 5) a.stateCode = zipToState(a.zip);
  if (!a.stateCode) {
    return NextResponse.json({ error: "We couldn't tell the state from that ZIP code." }, { status: 400 });
  }
  // The full ZIP's county over the three-digit guess the browser sent.
  if (a.zip.length === 5) a.county = await countyForZip(a.zip, a.county);

  try {
    const result = await buildFinderResult(getSupabase(), a);
    if (!result) {
      return NextResponse.json({ error: "We don't have programs for that state yet." }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("[benefits/finder]", err);
    return NextResponse.json({ error: "We couldn't load programs just now. Please try again." }, { status: 500 });
  }
}
