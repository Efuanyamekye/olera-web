import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

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
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // ignore
  }
}
loadEnv();

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  const providerProfileId = "373baf5a-01c6-49e6-803e-2052f07b418f";

  // Get the provider profile
  const { data: providerProfile } = await db
    .from("business_profiles")
    .select("id, slug, display_name")
    .eq("id", providerProfileId)
    .single();

  console.log("Provider:", providerProfile);

  // Check for lead_received events for this provider by profile_id
  const { data: eventsByProfile } = await db
    .from("provider_activity")
    .select("id, provider_id, event_type, profile_id, created_at, metadata")
    .eq("event_type", "lead_received")
    .eq("profile_id", providerProfileId)
    .order("created_at", { ascending: false })
    .limit(10);

  console.log("\nLead received events by profile_id:", eventsByProfile?.length || 0);
  for (const e of eventsByProfile || []) {
    console.log("  -", e.created_at, "provider_id:", e.provider_id);
    const meta = e.metadata as Record<string, unknown>;
    console.log("    cta_variant:", meta?.cta_variant || "(not set)");
    console.log("    entry_point:", meta?.entry_point || "(not set)");
    console.log("    guest:", meta?.guest);
  }

  // Also check by provider_id slug
  if (providerProfile?.slug) {
    const { data: eventsBySlug } = await db
      .from("provider_activity")
      .select("id, provider_id, created_at, metadata")
      .eq("event_type", "lead_received")
      .eq("provider_id", providerProfile.slug)
      .order("created_at", { ascending: false })
      .limit(10);

    console.log("\nLead received events by slug:", eventsBySlug?.length || 0);
    for (const e of eventsBySlug || []) {
      console.log("  -", e.created_at);
      const meta = e.metadata as Record<string, unknown>;
      console.log("    cta_variant:", meta?.cta_variant || "(not set)");
      console.log("    entry_point:", meta?.entry_point || "(not set)");
    }
  }

  // Check ALL recent lead_received events to see what's there
  console.log("\n--- All recent lead_received events (last 20) ---");
  const { data: allRecent } = await db
    .from("provider_activity")
    .select("id, provider_id, profile_id, created_at, metadata")
    .eq("event_type", "lead_received")
    .order("created_at", { ascending: false })
    .limit(20);

  for (const e of allRecent || []) {
    const meta = e.metadata as Record<string, unknown>;
    console.log(`${e.created_at} | provider: ${e.provider_id} | cta: ${meta?.cta_variant || "-"} | entry: ${meta?.entry_point || "-"}`);
  }
}

check().then(() => process.exit(0)).catch(console.error);
