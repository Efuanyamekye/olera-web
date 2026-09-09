#!/usr/bin/env npx tsx
/**
 * Backfill Provider Growth Display Data
 *
 * Fixes two data gaps in provider growth tracking:
 * 1. Missing care_types in business_profiles (from olera-providers)
 * 2. Missing claimed_at in provider_growth_tracking (from business_profiles.created_at)
 *
 * Safe to run multiple times - only updates records with missing data.
 *
 * Usage:
 *   npx tsx scripts/backfill-growth-display-data.ts [--dry-run]
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in environment.
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_CAT_TO_PROFILE_CATEGORY } from "../lib/types/provider";
import { getCategoryServices } from "../lib/provider-utils";
import { normalizeCareLabel } from "../lib/provider-highlights";

// Load .env.local
config({ path: ".env.local" });

const BATCH_SIZE = 50;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const db = createClient(supabaseUrl, serviceKey);

/**
 * Build care_types array from olera-providers data.
 * Replicates the logic from directoryHydrationFields.
 */
function buildCareTypes(providerCategory: string | null, mainCategory: string | null): string[] {
  const category = providerCategory
    ? SUPABASE_CAT_TO_PROFILE_CATEGORY[providerCategory] ?? null
    : null;

  const base = [providerCategory, mainCategory]
    .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .map(normalizeCareLabel);

  const careTypes: string[] = [];
  const seen = new Set<string>();

  for (const s of base) {
    const key = s.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      careTypes.push(s);
    }
  }

  if (category) {
    for (const s of getCategoryServices(category)) {
      const key = s.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        careTypes.push(s);
      }
    }
  }

  return careTypes;
}

async function backfillCareTypes(dryRun: boolean): Promise<{ updated: number; skipped: number }> {
  console.log("\n📋 PART 1: Backfilling care_types in business_profiles\n");

  // Find business_profiles with empty care_types that have a source_provider_id
  const { data: profiles, error: profilesErr } = await db
    .from("business_profiles")
    .select("id, display_name, care_types, source_provider_id")
    .not("source_provider_id", "is", null)
    .eq("claim_state", "claimed");

  if (profilesErr) {
    console.error("Failed to fetch business_profiles:", profilesErr);
    return { updated: 0, skipped: 0 };
  }

  // Filter to only those with empty care_types
  const needsBackfill = (profiles ?? []).filter(
    (p) => !p.care_types || p.care_types.length === 0
  );

  console.log(`   Total claimed profiles with source_provider_id: ${profiles?.length ?? 0}`);
  console.log(`   Profiles needing care_types backfill: ${needsBackfill.length}`);

  if (needsBackfill.length === 0) {
    console.log("   ✅ All profiles already have care_types");
    return { updated: 0, skipped: profiles?.length ?? 0 };
  }

  // Get the source provider data
  const sourceIds = needsBackfill.map((p) => p.source_provider_id).filter(Boolean);
  const { data: providers, error: providersErr } = await db
    .from("olera-providers")
    .select("provider_id, provider_category, main_category")
    .in("provider_id", sourceIds);

  if (providersErr) {
    console.error("Failed to fetch olera-providers:", providersErr);
    return { updated: 0, skipped: 0 };
  }

  // Build lookup map
  const providerMap = new Map(
    (providers ?? []).map((p) => [p.provider_id, p])
  );

  console.log(`   Found ${providerMap.size} matching olera-providers records`);

  // Build updates
  const updates: Array<{ id: string; name: string; careTypes: string[] }> = [];

  for (const profile of needsBackfill) {
    const source = providerMap.get(profile.source_provider_id);
    if (!source) continue;

    const careTypes = buildCareTypes(source.provider_category, source.main_category);
    if (careTypes.length > 0) {
      updates.push({
        id: profile.id,
        name: profile.display_name || "Unknown",
        careTypes,
      });
    }
  }

  console.log(`   Updates to apply: ${updates.length}`);

  if (dryRun) {
    console.log("\n   🏃 DRY RUN - Sample updates (first 5):");
    for (const u of updates.slice(0, 5)) {
      console.log(`      - ${u.name}: ${JSON.stringify(u.careTypes)}`);
    }
    return { updated: 0, skipped: needsBackfill.length };
  }

  // Apply updates in batches
  let updatedCount = 0;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);

    for (const update of batch) {
      const { error } = await db
        .from("business_profiles")
        .update({ care_types: update.careTypes })
        .eq("id", update.id);

      if (error) {
        console.error(`   Failed to update ${update.name}:`, error.message);
      } else {
        updatedCount++;
      }
    }

    process.stdout.write(`   Updated ${updatedCount}/${updates.length}\r`);
  }

  console.log(`\n   ✅ Updated ${updatedCount} profiles with care_types`);
  return { updated: updatedCount, skipped: needsBackfill.length - updatedCount };
}

async function backfillClaimedAt(dryRun: boolean): Promise<{ updated: number; skipped: number }> {
  console.log("\n📋 PART 2: Backfilling claimed_at in provider_growth_tracking\n");

  // Find growth tracking records with null claimed_at
  const { data: tracking, error: trackingErr } = await db
    .from("provider_growth_tracking")
    .select("id, business_profile_id, claimed_at, created_at")
    .is("claimed_at", null);

  if (trackingErr) {
    console.error("Failed to fetch provider_growth_tracking:", trackingErr);
    return { updated: 0, skipped: 0 };
  }

  console.log(`   Records with null claimed_at: ${tracking?.length ?? 0}`);

  if (!tracking || tracking.length === 0) {
    console.log("   ✅ All tracking records already have claimed_at");
    return { updated: 0, skipped: 0 };
  }

  // Get the business_profiles for these records in batches (to avoid URL length limits)
  const bpIds = tracking.map((t) => t.business_profile_id);
  const dateMap = new Map<string, { date: string | null; name: string | null }>();

  // Batch fetch business_profiles (100 at a time to avoid headers overflow)
  const BP_BATCH_SIZE = 100;
  for (let i = 0; i < bpIds.length; i += BP_BATCH_SIZE) {
    const batchIds = bpIds.slice(i, i + BP_BATCH_SIZE);
    const { data: profiles, error: profilesErr } = await db
      .from("business_profiles")
      .select("id, display_name, created_at, claimed_at")
      .in("id", batchIds);

    if (profilesErr) {
      console.error("Failed to fetch business_profiles batch:", profilesErr);
      continue;
    }

    for (const p of profiles ?? []) {
      dateMap.set(p.id, { date: p.claimed_at || p.created_at, name: p.display_name });
    }
  }

  console.log(`   Found ${dateMap.size} business_profiles with dates`);

  // Build updates
  const updates: Array<{ id: string; name: string; claimedAt: string }> = [];

  for (const record of tracking) {
    const bp = dateMap.get(record.business_profile_id);
    if (bp?.date) {
      updates.push({
        id: record.id,
        name: bp.name || "Unknown",
        claimedAt: bp.date,
      });
    }
  }

  console.log(`   Updates to apply: ${updates.length}`);

  if (dryRun) {
    console.log("\n   🏃 DRY RUN - Sample updates (first 5):");
    for (const u of updates.slice(0, 5)) {
      console.log(`      - ${u.name}: ${u.claimedAt.slice(0, 10)}`);
    }
    return { updated: 0, skipped: tracking.length };
  }

  // Apply updates in batches
  let updatedCount = 0;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);

    for (const update of batch) {
      const { error } = await db
        .from("provider_growth_tracking")
        .update({ claimed_at: update.claimedAt })
        .eq("id", update.id);

      if (error) {
        console.error(`   Failed to update ${update.name}:`, error.message);
      } else {
        updatedCount++;
      }
    }

    process.stdout.write(`   Updated ${updatedCount}/${updates.length}\r`);
  }

  console.log(`\n   ✅ Updated ${updatedCount} tracking records with claimed_at`);
  return { updated: updatedCount, skipped: tracking.length - updatedCount };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log(`\n🚀 Provider Growth Display Data Backfill ${dryRun ? "(DRY RUN)" : ""}`);
  console.log("=".repeat(50));

  const careTypesResult = await backfillCareTypes(dryRun);
  const claimedAtResult = await backfillClaimedAt(dryRun);

  console.log("\n" + "=".repeat(50));
  console.log("📊 SUMMARY");
  console.log("=".repeat(50));
  console.log(`\ncare_types backfill:`);
  console.log(`   Updated: ${careTypesResult.updated}`);
  console.log(`   Skipped: ${careTypesResult.skipped}`);
  console.log(`\nclaimed_at backfill:`);
  console.log(`   Updated: ${claimedAtResult.updated}`);
  console.log(`   Skipped: ${claimedAtResult.skipped}`);

  if (dryRun) {
    console.log("\n🏃 This was a DRY RUN. Run without --dry-run to apply changes.");
  } else {
    console.log("\n✅ Backfill complete!");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
