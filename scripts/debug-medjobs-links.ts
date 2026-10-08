/**
 * Debug script: Check why diagnose and fix scripts give different results
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data: outreachRows } = await db
    .from("student_outreach")
    .select("organization_name, research_data")
    .eq("kind", "provider")
    .eq("job_board_visible", true);

  if (!outreachRows) return;

  for (const row of outreachRows) {
    const rd = (row.research_data ?? {}) as Record<string, unknown>;
    const oleraId = rd.olera_provider_id as string | undefined;
    const name = row.organization_name as string;

    if (!oleraId) {
      console.log(`"${name}" - no olera_provider_id\n`);
      continue;
    }

    // Query by exact ID
    const { data: byId, error: idErr } = await db
      .from("olera-providers")
      .select("provider_id, provider_name, deleted, city, state")
      .eq("provider_id", oleraId)
      .maybeSingle();

    // Query by name search
    const nameForSearch = name.trim().toLowerCase();
    const { data: byName } = await db
      .from("olera-providers")
      .select("provider_id, provider_name, city, state")
      .or("deleted.is.null,deleted.eq.false")
      .ilike("provider_name", `%${nameForSearch}%`)
      .limit(3);

    console.log(`"${name}"`);
    console.log(`  stored olera_provider_id: ${oleraId}`);

    if (byId) {
      console.log(`  Query by ID: FOUND "${byId.provider_name}" (${byId.city}, ${byId.state}) deleted=${byId.deleted}`);
    } else {
      console.log(`  Query by ID: NOT FOUND ${idErr ? `(error: ${idErr.message})` : ""}`);
    }

    console.log(`  Query by name: ${byName?.length || 0} matches`);
    if (byName?.length) {
      for (const m of byName) {
        console.log(`    - "${m.provider_name}" (${m.city}, ${m.state}) ID: ${m.provider_id}`);
      }
    }
    console.log("");
  }
}

main().catch(console.error);
