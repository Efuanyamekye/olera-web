/**
 * Fix broken MedJobs provider links
 *
 * These providers have olera_provider_id set but it points to nothing.
 * Find the real directory entry by name and fix the link.
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const isDryRun = process.argv.includes("--dry-run");

async function main() {
  console.log(isDryRun ? "=== DRY RUN ===" : "=== FIX BROKEN LINKS ===");
  console.log("");

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

  let fixed = 0;
  let notFound = 0;

  for (const row of outreachRows) {
    const name = row.organization_name as string;
    const rd = (row.research_data ?? {}) as Record<string, unknown>;
    const currentId = rd.olera_provider_id as string | undefined;

    // Check if current link is valid
    if (currentId) {
      const { data: existing } = await db
        .from("olera-providers")
        .select("provider_id")
        .eq("provider_id", currentId)
        .maybeSingle();

      if (existing) {
        console.log(`"${name}" - link is valid, skipping`);
        continue;
      }
    }

    // Search for real directory entry by name
    const nameForSearch = name.trim().toLowerCase();
    const { data: matches } = await db
      .from("olera-providers")
      .select("provider_id, provider_name, slug, city, state, provider_images, provider_logo")
      .or("deleted.is.null,deleted.eq.false")
      .ilike("provider_name", `%${nameForSearch}%`)
      .limit(10);

    if (!matches || matches.length === 0) {
      console.log(`"${name}" - NO MATCH in directory`);
      notFound++;
      continue;
    }

    // Find best match
    const exactMatch = matches.find(
      (m) => m.provider_name?.toLowerCase() === nameForSearch
    );

    let best: typeof matches[0] | null = null;
    if (exactMatch) {
      best = exactMatch;
    } else {
      // Check length similarity
      for (const m of matches) {
        const dirName = m.provider_name?.toLowerCase() ?? "";
        const searchLen = nameForSearch.length;
        const dirLen = dirName.length;
        const lenRatio = Math.min(searchLen, dirLen) / Math.max(searchLen, dirLen);

        if (lenRatio >= 0.5) {
          best = m;
          break;
        }
      }
    }

    if (!best) {
      console.log(`"${name}" - matches found but not confident:`);
      for (const m of matches.slice(0, 3)) {
        console.log(`    "${m.provider_name}" (${m.city}, ${m.state})`);
      }
      notFound++;
      continue;
    }

    const hasImages = !!(best.provider_images || best.provider_logo);
    const location = [best.city, best.state].filter(Boolean).join(", ") || "no location";

    console.log(
      `"${name}" -> "${best.provider_name}" (${location}) ${hasImages ? "✓ HAS IMAGES" : "✗ NO IMAGES"}`
    );

    if (!isDryRun) {
      const updatedRd = {
        ...rd,
        olera_provider_id: best.provider_id,
        olera_provider_slug: best.slug,
      };

      const { error } = await db
        .from("student_outreach")
        .update({ research_data: updatedRd })
        .eq("id", row.id);

      if (error) {
        console.log(`  ERROR: ${error.message}`);
      } else {
        fixed++;
      }
    } else {
      fixed++;
    }
  }

  console.log("");
  console.log("=== SUMMARY ===");
  console.log(`Would fix: ${fixed}`);
  console.log(`Not found: ${notFound}`);

  if (isDryRun && fixed > 0) {
    console.log("");
    console.log("Run without --dry-run to apply changes.");
  }
}

main().catch(console.error);
