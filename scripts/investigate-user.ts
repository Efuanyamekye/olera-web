/**
 * Quick investigation script to check a user's tracking data
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
  console.error("Missing env vars");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const EMAIL = process.argv[2] || "glara1214@gmail.com";

async function investigate() {
  console.log(`\nInvestigating: ${EMAIL}\n${"=".repeat(60)}\n`);

  // 1. Find the user's profile
  console.log("1. Business Profile:");
  const { data: profile } = await db
    .from("business_profiles")
    .select("id, account_id, email, type, source, created_at, metadata")
    .eq("email", EMAIL)
    .single();

  if (!profile) {
    console.log("   No profile found with this email.");

    // Try checking connections by guest_email
    console.log("\n   Checking connections by guest_email...");
    const { data: guestConn } = await db
      .from("connections")
      .select("id, from_profile_id, to_profile_id, created_at, metadata, guest_email")
      .eq("guest_email", EMAIL);

    if (guestConn && guestConn.length > 0) {
      console.log(`   Found ${guestConn.length} connection(s) as guest:`);
      for (const conn of guestConn) {
        console.log(`   - Connection ${conn.id}`);
        console.log(`     Created: ${conn.created_at}`);
        console.log(`     Metadata: ${JSON.stringify(conn.metadata, null, 2)}`);
      }
    }
    return;
  }

  console.log(`   ID: ${profile.id}`);
  console.log(`   Account ID: ${profile.account_id}`);
  console.log(`   Type: ${profile.type}`);
  console.log(`   Source: ${profile.source}`);
  console.log(`   Created: ${profile.created_at}`);
  console.log(`   Metadata: ${JSON.stringify(profile.metadata, null, 2)}`);

  // 2. Find connections FROM this profile
  console.log("\n2. Connections (as sender):");
  const { data: connections } = await db
    .from("connections")
    .select("id, to_profile_id, type, status, created_at, metadata, guest_email")
    .eq("from_profile_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(5);

  if (!connections || connections.length === 0) {
    console.log("   No connections found.");
  } else {
    for (const conn of connections) {
      console.log(`\n   Connection ${conn.id}:`);
      console.log(`     To: ${conn.to_profile_id}`);
      console.log(`     Type: ${conn.type}, Status: ${conn.status}`);
      console.log(`     Created: ${conn.created_at}`);
      console.log(`     Guest Email: ${conn.guest_email}`);
      console.log(`     Metadata keys: ${Object.keys(conn.metadata || {}).join(", ")}`);
      if (conn.metadata) {
        const meta = conn.metadata as Record<string, unknown>;
        console.log(`     cta_variant: ${meta.cta_variant || "(not set)"}`);
        console.log(`     entry_point: ${meta.entry_point || "(not set)"}`);
        console.log(`     session_id: ${meta.session_id || "(not set)"}`);
      }
    }
  }

  // 3. Find lead_received events for this profile
  console.log("\n3. Lead Received Events (provider_activity):");
  const { data: events } = await db
    .from("provider_activity")
    .select("id, provider_id, event_type, created_at, metadata")
    .eq("event_type", "lead_received")
    .eq("profile_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(5);

  if (!events || events.length === 0) {
    console.log("   No lead_received events found for this profile.");

    // Also check by looking for the email in metadata
    console.log("\n   Checking by email in metadata...");
    const { data: eventsByEmail } = await db
      .from("provider_activity")
      .select("id, provider_id, event_type, created_at, metadata, profile_id")
      .eq("event_type", "lead_received")
      .like("metadata->>email", `%${EMAIL}%`)
      .limit(5);

    if (eventsByEmail && eventsByEmail.length > 0) {
      console.log(`   Found ${eventsByEmail.length} event(s) by email in metadata:`);
      for (const evt of eventsByEmail) {
        console.log(`   - Event ${evt.id}: provider=${evt.provider_id}, profile=${evt.profile_id}`);
      }
    } else {
      console.log("   No events found by email either.");
    }
  } else {
    for (const evt of events) {
      console.log(`\n   Event ${evt.id}:`);
      console.log(`     Provider: ${evt.provider_id}`);
      console.log(`     Created: ${evt.created_at}`);
      const meta = evt.metadata as Record<string, unknown>;
      console.log(`     cta_variant: ${meta?.cta_variant || "(not set)"}`);
      console.log(`     entry_point: ${meta?.entry_point || "(not set)"}`);
      console.log(`     session_id: ${meta?.session_id || "(not set)"}`);
    }
  }

  // 4. Check seeker_activity
  console.log("\n4. Seeker Activity:");
  const { data: seekerActivity } = await db
    .from("seeker_activity")
    .select("id, event_type, created_at, metadata")
    .eq("profile_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(5);

  if (!seekerActivity || seekerActivity.length === 0) {
    console.log("   No seeker_activity found.");
  } else {
    for (const act of seekerActivity) {
      console.log(`   - ${act.event_type} at ${act.created_at}`);
    }
  }

  console.log("\n" + "=".repeat(60));
}

investigate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
