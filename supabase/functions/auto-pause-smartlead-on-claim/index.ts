// Auto-pause SmartLead leads when provider claims — Supabase Edge Function (Deno).
//
// Triggered by database webhook when a provider's stage changes to 'claimed'.
// Pauses the lead in SmartLead so they stop receiving sequence emails after
// claiming their profile (via any method: organic, contact form, email link).
//
// THE BUG THIS FIXES:
//   Previously, when a provider claimed via any method:
//   - Database trigger sets stage = 'claimed' ✓
//   - SmartLead is NOT paused ✗
//   - Provider continues receiving sequence emails after claiming
//
// Environment (auto-injected by Supabase): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Environment (set via `supabase secrets set`): SMARTLEAD_API_KEY
//
// Deploy: supabase functions deploy auto-pause-smartlead-on-claim
//
// Database Webhook Config (manual step after deploy):
//   1. Go to Supabase Dashboard → Database → Webhooks
//   2. Create webhook on provider_outreach_tracking table
//   3. Trigger: UPDATE
//   4. Filter: new.stage = 'claimed' AND old.stage != 'claimed'
//   5. HTTP Request: POST to this function's URL
//   6. Add custom header: Authorization: Bearer <service_role_key>
//
// IMPORTANT: The webhook MUST include old_record in the payload.
// This is needed to detect stage transitions (not just current state).
// If using Supabase's built-in webhooks, ensure "Include old record" is enabled.

import { createClient } from "jsr:@supabase/supabase-js@2";

const smartleadApiKey = Deno.env.get("SMARTLEAD_API_KEY") ?? "";
const smartleadBaseUrl = Deno.env.get("SMARTLEAD_BASE_URL") ?? "https://server.smartlead.ai/api/v1";
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabase = createClient(supabaseUrl, serviceRoleKey);

interface SmartleadData {
  campaign_id?: number;
  lead_id?: number;
  lead_email?: string;
  enrolled_at?: string;
  campaign_name?: string;
}

interface WebhookPayload {
  type: "UPDATE";
  table: "provider_outreach_tracking";
  record: {
    id: string;
    provider_id: string;
    stage: string;
    smartlead_data: SmartleadData | null;
  };
  old_record: {
    id: string;
    provider_id: string;
    stage: string;
    smartlead_data: SmartleadData | null;
  };
}

/**
 * Pause a lead in a SmartLead campaign.
 */
async function pauseLeadInCampaign(campaignId: number, leadId: number): Promise<{ ok: boolean; error?: string }> {
  if (!smartleadApiKey) {
    return { ok: false, error: "SMARTLEAD_API_KEY not configured" };
  }

  const url = `${smartleadBaseUrl}/campaigns/${campaignId}/leads/${leadId}/pause?api_key=${encodeURIComponent(smartleadApiKey)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `HTTP ${res.status}: ${text}` };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Look up a lead's SmartLead ID by email if not stored in smartlead_data.
 */
async function getLeadIdByEmail(email: string): Promise<number | null> {
  if (!smartleadApiKey) return null;

  const url = `${smartleadBaseUrl}/leads/?email=${encodeURIComponent(email)}&api_key=${encodeURIComponent(smartleadApiKey)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();

    // SmartLead may return the lead directly, in a data array, or nested
    let leadData: { id?: number } | null = null;
    if (Array.isArray(data) && data.length > 0) {
      leadData = data[0];
    } else if (data?.data && Array.isArray(data.data) && data.data.length > 0) {
      leadData = data.data[0];
    } else if (data?.lead) {
      leadData = data.lead;
    } else if (data?.id) {
      leadData = data;
    }

    return leadData?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Log the pause action as a touchpoint.
 */
async function logTouchpoint(providerId: string, details: Record<string, unknown>) {
  await supabase.from("provider_outreach_touchpoints").insert({
    provider_id: providerId,
    touchpoint_type: "stage_changed",
    details: {
      action: "smartlead_auto_paused",
      ...details,
    },
    admin_user_id: null, // System action
  });
}

Deno.serve(async (req) => {
  // Only accept POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const payload = (await req.json()) as WebhookPayload;

    // Validate this is a stage change to 'claimed'
    const { record, old_record } = payload;
    if (!record || record.stage !== "claimed") {
      return new Response(JSON.stringify({ skipped: true, reason: "Not a claim event" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Only process if this was a stage change (not already claimed)
    if (old_record?.stage === "claimed") {
      return new Response(JSON.stringify({ skipped: true, reason: "Already claimed" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { provider_id, smartlead_data } = record;

    // Check if SmartLead data exists
    if (!smartlead_data?.campaign_id) {
      console.log(`[auto-pause] Provider ${provider_id} has no SmartLead campaign, skipping`);
      return new Response(JSON.stringify({ skipped: true, reason: "No SmartLead campaign" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { campaign_id, lead_id, lead_email } = smartlead_data;

    // Get lead ID - prefer stored, fall back to email lookup
    let resolvedLeadId = lead_id;
    if (!resolvedLeadId && lead_email) {
      console.log(`[auto-pause] Looking up lead ID for ${lead_email}`);
      resolvedLeadId = await getLeadIdByEmail(lead_email) ?? undefined;
    }

    if (!resolvedLeadId) {
      console.log(`[auto-pause] Could not resolve lead ID for provider ${provider_id}`);
      await logTouchpoint(provider_id, {
        campaign_id,
        lead_email,
        error: "Could not resolve lead ID",
      });
      return new Response(JSON.stringify({ error: "Could not resolve lead ID" }), {
        status: 200, // Don't retry
        headers: { "Content-Type": "application/json" },
      });
    }

    // Pause the lead in SmartLead
    console.log(`[auto-pause] Pausing lead ${resolvedLeadId} in campaign ${campaign_id} for provider ${provider_id}`);
    const result = await pauseLeadInCampaign(campaign_id, resolvedLeadId);

    if (result.ok) {
      console.log(`[auto-pause] Successfully paused lead for claimed provider ${provider_id}`);
      await logTouchpoint(provider_id, {
        campaign_id,
        lead_id: resolvedLeadId,
        lead_email,
        success: true,
      });
      return new Response(JSON.stringify({ success: true, provider_id, campaign_id, lead_id: resolvedLeadId }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } else {
      console.error(`[auto-pause] Failed to pause lead for provider ${provider_id}:`, result.error);
      await logTouchpoint(provider_id, {
        campaign_id,
        lead_id: resolvedLeadId,
        lead_email,
        error: result.error,
      });
      return new Response(JSON.stringify({ error: result.error }), {
        status: 200, // Don't retry on SmartLead errors
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    console.error("[auto-pause] Error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
