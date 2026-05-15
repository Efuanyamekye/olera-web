/**
 * Backfill script for Q&A conversion tracking.
 *
 * Problem: The capture-email route was not firing `lead_received` events
 * for Q&A conversions (multi_provider and multi_provider_v2 variants).
 * Slack alerts fired but admin panel showed no conversions.
 *
 * Solution: This script finds all accounts created via Q&A flow (identified
 * by signup_source = 'multi_provider' or 'multi_provider_v2') and creates
 * the missing `lead_received` events in provider_activity.
 *
 * The provider_id and other context is stored in the family profile's
 * metadata.signup_context field.
 *
 * Usage:
 *   npx ts-node scripts/backfill-qa-conversions.ts [--dry-run]
 *
 * Options:
 *   --dry-run    Show what would be created without actually inserting
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

// Load .env.local manually
function loadEnv() {
  try {
    const envPath = resolve(process.cwd(), ".env.local");
    const envContent = readFileSync(envPath, "utf-8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex);
      let value = trimmed.slice(eqIndex + 1);
      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env.local might not exist
  }
}

loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  console.error("Make sure .env.local exists with these variables.");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface SignupContext {
  provider_id?: string;
  provider_name?: string;
  question_text?: string;
  variant?: string;
  sent_provider_ids?: string[];
  sent_count?: number;
}

interface AccountRow {
  id: string;
  signup_source: string;
  session_id: string | null;
  created_at: string;
}

interface ProfileRow {
  id: string;
  account_id: string;
  email: string | null;
  metadata: {
    signup_context?: SignupContext;
  } | null;
}

async function backfillQaConversions(dryRun: boolean) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Q&A Conversion Backfill Script`);
  console.log(`Mode: ${dryRun ? "DRY RUN (no changes)" : "LIVE (will insert events)"}`);
  console.log(`${"=".repeat(60)}\n`);

  // 1. Find all accounts with multi_provider signup_source
  console.log("Fetching accounts with multi_provider signup_source...");
  const { data: accounts, error: accountsError } = await db
    .from("accounts")
    .select("id, signup_source, session_id, created_at")
    .or("signup_source.eq.multi_provider,signup_source.eq.multi_provider_v2")
    .order("created_at", { ascending: true });

  if (accountsError) {
    console.error("Failed to fetch accounts:", accountsError);
    process.exit(1);
  }

  if (!accounts || accounts.length === 0) {
    console.log("No accounts found with multi_provider signup_source.");
    return;
  }

  console.log(`Found ${accounts.length} accounts to process.\n`);

  // 2. Check which ones already have lead_received events
  // We'll check by looking for events with entry_point starting with 'qa_'
  console.log("Checking for existing lead_received events...");
  const { data: existingEvents, error: eventsError } = await db
    .from("provider_activity")
    .select("metadata")
    .eq("event_type", "lead_received")
    .like("metadata->>entry_point", "qa_%");

  if (eventsError) {
    console.error("Failed to fetch existing events:", eventsError);
    process.exit(1);
  }

  // Build a set of already-processed sessions/emails for deduplication
  const existingSessionIds = new Set<string>();
  for (const evt of existingEvents || []) {
    const sid = (evt.metadata as Record<string, unknown>)?.session_id;
    if (typeof sid === "string") {
      existingSessionIds.add(sid);
    }
  }
  console.log(`Found ${existingSessionIds.size} existing Q&A lead_received events.\n`);

  // 3. For each account, get the family profile and extract signup_context
  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const account of accounts as AccountRow[]) {
    // Skip if we already have an event for this session
    if (account.session_id && existingSessionIds.has(account.session_id)) {
      console.log(`[SKIP] Account ${account.id} - already has lead_received event`);
      skipped++;
      continue;
    }

    // Get the family profile
    const { data: profile, error: profileError } = await db
      .from("business_profiles")
      .select("id, account_id, email, metadata")
      .eq("account_id", account.id)
      .eq("type", "family")
      .single();

    if (profileError || !profile) {
      console.log(`[SKIP] Account ${account.id} - no family profile found`);
      skipped++;
      continue;
    }

    const typedProfile = profile as ProfileRow;
    const signupContext = typedProfile.metadata?.signup_context;

    if (!signupContext?.provider_id) {
      console.log(`[SKIP] Account ${account.id} - no provider_id in signup_context`);
      skipped++;
      continue;
    }

    // Determine the variant
    const variant = signupContext.variant || account.signup_source || "multi_provider";
    const entryPoint = `qa_${variant}`;

    // Build the event metadata
    const eventMetadata: Record<string, unknown> = {
      email: typedProfile.email,
      guest: true, // Q&A flow is always guest initially
      session_id: account.session_id || null,
      entry_point: entryPoint,
      qa_variant: variant,
      provider_name: signupContext.provider_name || null,
      question_text: signupContext.question_text || null,
      sent_provider_ids: signupContext.sent_provider_ids || null,
      sent_count: signupContext.sent_count || null,
      backfilled: true, // Mark as backfilled for audit
      backfilled_at: new Date().toISOString(),
    };

    console.log(`\n[${dryRun ? "DRY RUN" : "CREATE"}] Account ${account.id}`);
    console.log(`  Email: ${typedProfile.email}`);
    console.log(`  Provider: ${signupContext.provider_id} (${signupContext.provider_name || "unknown"})`);
    console.log(`  Variant: ${variant}`);
    console.log(`  Created: ${account.created_at}`);

    if (!dryRun) {
      // Insert the lead_received event
      const { error: insertError } = await db
        .from("provider_activity")
        .insert({
          provider_id: signupContext.provider_id,
          event_type: "lead_received",
          profile_id: typedProfile.id,
          metadata: eventMetadata,
          created_at: account.created_at, // Use original account creation time
        });

      if (insertError) {
        console.log(`  [ERROR] Failed to insert: ${insertError.message}`);
        errors++;
      } else {
        console.log(`  [OK] Event created`);
        created++;
      }
    } else {
      created++;
    }
  }

  // Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Summary:`);
  console.log(`  Total accounts: ${accounts.length}`);
  console.log(`  ${dryRun ? "Would create" : "Created"}: ${created} events`);
  console.log(`  Skipped: ${skipped}`);
  if (errors > 0) {
    console.log(`  Errors: ${errors}`);
  }
  console.log(`${"=".repeat(60)}\n`);

  if (dryRun && created > 0) {
    console.log("Run without --dry-run to create the events.\n");
  }
}

// Main
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

backfillQaConversions(dryRun)
  .then(() => {
    console.log("Done.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
