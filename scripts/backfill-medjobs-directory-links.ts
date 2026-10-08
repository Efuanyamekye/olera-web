/**
 * Backfill script: Link MedJobs providers to their directory entries
 *
 * Problem: Some student_outreach provider records were created without
 * linking to their existing olera-providers directory entry. This means
 * the job board shows fallback images instead of real provider images.
 *
 * Solution: For each unlinked provider, search the directory by name and
 * update research_data.olera_provider_id to create the link.
 *
 * Usage:
 *   npx tsx scripts/backfill-medjobs-directory-links.ts [--dry-run]
 *
 * Options:
 *   --dry-run  Show what would be updated without making changes
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const isDryRun = process.argv.includes("--dry-run");

async function main() {
  console.log(isDryRun ? "=== DRY RUN ===" : "=== BACKFILL ===");
  console.log("");

  // Get all provider records that are missing olera_provider_id
  const { data: outreachRows, error: fetchError } = await db
    .from("student_outreach")
    .select("id, organization_name, research_data")
    .eq("kind", "provider");

  if (fetchError) {
    console.error("Failed to fetch student_outreach:", fetchError.message);
    process.exit(1);
  }

  if (!outreachRows || outreachRows.length === 0) {
    console.log("No provider records found.");
    return;
  }

  console.log(`Found ${outreachRows.length} provider records total.`);

  // Filter to those missing olera_provider_id
  const unlinked = outreachRows.filter((row) => {
    const rd = (row.research_data ?? {}) as Record<string, unknown>;
    return !rd.olera_provider_id;
  });

  console.log(`${unlinked.length} are missing directory link.`);
  console.log("");

  let updated = 0;
  let notFound = 0;

  for (const row of unlinked) {
    const name = row.organization_name as string;
    if (!name) {
      console.log(`  [SKIP] ID ${row.id}: No organization_name`);
      continue;
    }

    // Search for matching directory entry
    const nameForSearch = name.trim().toLowerCase();
    const { data: matches } = await db
      .from("olera-providers")
      .select("provider_id, provider_name, slug, city, state")
      .or("deleted.is.null,deleted.eq.false")
      .ilike("provider_name", `%${nameForSearch}%`)
      .limit(10);

    if (!matches || matches.length === 0) {
      console.log(`  [NOT FOUND] "${name}" - no directory match`);
      notFound++;
      continue;
    }

    // Find best match
    let best = matches[0];
    const exactMatch = matches.find(
      (m) => m.provider_name?.toLowerCase() === nameForSearch
    );
    if (exactMatch) best = exactMatch;

    console.log(
      `  [MATCH] "${name}" -> "${best.provider_name}" (${best.city}, ${best.state})`
    );

    if (!isDryRun) {
      const rd = (row.research_data ?? {}) as Record<string, unknown>;
      const updatedRd = {
        ...rd,
        olera_provider_id: best.provider_id,
        olera_provider_slug: best.slug,
      };

      const { error: updateError } = await db
        .from("student_outreach")
        .update({ research_data: updatedRd })
        .eq("id", row.id);

      if (updateError) {
        console.log(`    [ERROR] Failed to update: ${updateError.message}`);
      } else {
        updated++;
      }
    } else {
      updated++;
    }
  }

  console.log("");
  console.log("=== SUMMARY ===");
  console.log(`Total unlinked: ${unlinked.length}`);
  console.log(`Would update: ${updated}`);
  console.log(`Not found in directory: ${notFound}`);

  if (isDryRun) {
    console.log("");
    console.log("Run without --dry-run to apply changes.");
  }
}

main().catch(console.error);
