/**
 * Diagnostic script: Check what MedJobs provider links point to
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
  // Get providers with job_board_visible = true
  const { data: outreachRows } = await db
    .from("student_outreach")
    .select("id, organization_name, research_data")
    .eq("kind", "provider")
    .eq("job_board_visible", true);

  if (!outreachRows || outreachRows.length === 0) {
    console.log("No visible providers found.");
    return;
  }

  console.log(`Found ${outreachRows.length} visible providers.\n`);

  for (const row of outreachRows) {
    const name = row.organization_name;
    const rd = (row.research_data ?? {}) as Record<string, unknown>;
    const oleraId = rd.olera_provider_id as string | undefined;

    if (!oleraId) {
      console.log(`"${name}" - NO LINK`);
      continue;
    }

    // Look up what this ID points to
    const { data: dirEntry, error: lookupError } = await db
      .from("olera-providers")
      .select("provider_id, provider_name, provider_images, provider_logo, city, state")
      .eq("provider_id", oleraId)
      .maybeSingle();

    if (lookupError) {
      console.log(`"${name}" -> ERROR: ${lookupError.message}`);
      continue;
    }

    if (!dirEntry) {
      console.log(`"${name}" -> BROKEN LINK (ID: ${oleraId})`);
      continue;
    }

    const hasImages = !!(dirEntry.provider_images || dirEntry.provider_logo);
    const location = [dirEntry.city, dirEntry.state].filter(Boolean).join(", ") || "no location";

    console.log(
      `"${name}" -> "${dirEntry.provider_name}" (${location}) - ${hasImages ? "HAS IMAGES ✓" : "NO IMAGES ✗"}`
    );
  }
}

main().catch(console.error);
