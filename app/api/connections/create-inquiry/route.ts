import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { recordProviderEvent } from "@/lib/analytics/provider-events";
import { readManagedUtmFromRequest, managedUtmMetadata } from "@/lib/ad-boost/managed-utm";
import { sendAdBoostLeadDeliveredEmail } from "@/lib/ad-boost/lead-notifications.server";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

/**
 * POST /api/connections/create-inquiry
 *
 * Creates an inquiry connection from the current user to a provider.
 * Used when messaging a provider from the Matches page recommendations.
 *
 * Request body:
 * - providerId: string (olera-providers provider_id)
 * - message: string
 */
export async function POST(request: Request) {
  try {
    // Managed-ads attribution from the provider-page-load cookie (rides along on
    // this same-origin fetch). See lib/ad-boost/managed-utm.
    const managedUtm = readManagedUtmFromRequest(request);
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const { providerId, message, session_id: sessionId } = body as {
      providerId: string;
      message: string;
      session_id?: string;
    };

    if (!providerId || !message?.trim()) {
      return NextResponse.json(
        { error: "Provider ID and message are required" },
        { status: 400 }
      );
    }

    const admin = getAdminClient();
    const db = admin || supabase;

    // Get the user's account and active profile
    const { data: account, error: accountErr } = await db
      .from("accounts")
      .select("id, active_profile_id")
      .eq("user_id", user.id)
      .single();

    if (accountErr || !account?.active_profile_id) {
      return NextResponse.json(
        { error: "No active profile found" },
        { status: 400 }
      );
    }

    const fromProfileId = account.active_profile_id;

    // Get the family profile info for the summary card
    const { data: familyProfile } = await db
      .from("business_profiles")
      .select("display_name, email, phone, city, state")
      .eq("id", fromProfileId)
      .single();

    // Get provider info from olera-providers
    const { data: provider, error: providerErr } = await db
      .from("olera-providers")
      .select("provider_id, slug, provider_name, provider_category, city, state, email")
      .eq("provider_id", providerId)
      .single();

    if (providerErr || !provider) {
      return NextResponse.json(
        { error: "Provider not found" },
        { status: 404 }
      );
    }

    // Check if there's an existing business_profile for this provider
    let toProfileId: string | null = null;
    const { data: existingProfile } = await db
      .from("business_profiles")
      .select("id")
      .eq("source_provider_id", providerId)
      .maybeSingle();

    if (existingProfile) {
      toProfileId = existingProfile.id;
    } else {
      // Create a placeholder business_profile for the provider
      // This allows the connection to work even if the provider hasn't claimed their profile
      const { data: newProfile, error: createErr } = await db
        .from("business_profiles")
        .insert({
          source_provider_id: providerId,
          slug: `provider-${providerId}`,
          type: "organization",
          display_name: provider.provider_name,
          category: provider.provider_category,
          city: provider.city,
          state: provider.state,
          claim_state: "unclaimed",
          verification_state: "unverified",
          source: "claimed_from_directory",
          is_active: true,
          metadata: {},
        })
        .select("id")
        .single();

      if (createErr) {
        console.error("[create-inquiry] Failed to create provider profile:", createErr);
        return NextResponse.json(
          { error: "Failed to create connection" },
          { status: 500 }
        );
      }

      toProfileId = newProfile.id;
    }

    const { data: providerProfileForEmail } = await db
      .from("business_profiles")
      .select("email, display_name, metadata")
      .eq("id", toProfileId)
      .maybeSingle();
    const providerEmail = providerProfileForEmail?.email || provider.email || null;
    const providerDisplayName = providerProfileForEmail?.display_name || provider.provider_name;
    const providerMeta = (providerProfileForEmail?.metadata || {}) as Record<string, unknown>;
    const providerLeadsUnsubscribed = !!providerMeta.leads_unsubscribed;

    // Check for existing connection
    const { data: existingConnection } = await db
      .from("connections")
      .select("id, status")
      .eq("from_profile_id", fromProfileId)
      .eq("to_profile_id", toProfileId)
      .eq("type", "inquiry")
      .maybeSingle();

    if (existingConnection) {
      // Connection already exists - just return the existing one
      return NextResponse.json({
        success: true,
        connectionId: existingConnection.id,
        existing: true,
      });
    }

    // Build message payload with seeker info for summary card
    const seekerName = familyProfile?.display_name || user.email?.split("@")[0] || "";
    const nameParts = seekerName.trim().split(/\s+/);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";

    const messagePayload = JSON.stringify({
      // Seeker identity
      seeker_name: seekerName,
      seeker_first_name: firstName,
      seeker_last_name: lastName,
      seeker_email: familyProfile?.email || user.email || "",
      seeker_phone: familyProfile?.phone || null,
      // Location context (from provider)
      looking_in_city: provider.city,
      looking_in_state: provider.state,
      // Custom message
      message: message.trim(),
      // Care details (may be added from profile later)
      care_recipient: null,
      care_type: null,
      urgency: null,
      additional_notes: message.trim(),
    });

    // Build auto_intro
    const locationStr = [provider.city, provider.state].filter(Boolean).join(", ");
    const autoIntro = message.trim() || (locationStr
      ? `${firstName} is interested in care services in ${locationStr}.`
      : `${firstName} is interested in learning more about your services.`);

    // Create the connection
    const { data: connection, error: connectionErr } = await db
      .from("connections")
      .insert({
        from_profile_id: fromProfileId,
        to_profile_id: toProfileId,
        type: "inquiry",
        status: "pending",
        message: messagePayload,
        metadata: {
          source: "matches_recommendation",
          provider_id: providerId,
          auto_intro: autoIntro,
          thread: [
            {
              from_profile_id: toProfileId,
              text: `Hello ${firstName || "there"}, thank you for reaching out. We're reviewing your request and will get back to you shortly.`,
              created_at: new Date().toISOString(),
              is_auto_reply: true,
            },
          ],
        },
      })
      .select("id")
      .single();

    if (connectionErr) {
      console.error("[create-inquiry] Failed to create connection:", connectionErr);
      return NextResponse.json(
        { error: "Failed to create connection" },
        { status: 500 }
      );
    }

    // Use slug (URL-canonical) so this row aggregates with page_view rows
    // for the same provider. Fall back to provider_id only if slug is null.
    void recordProviderEvent({
      provider_id: provider.slug || providerId,
      event_type: "lead_received",
      profile_id: toProfileId,
      metadata: {
        connection_id: connection.id,
        source: "matches_recommendation",
        olera_provider_id: providerId,
        // session_id makes leads joinable back to arm impressions in
        // seeker_activity / provider_activity for cannibalization analysis.
        session_id: sessionId || null,
        ...managedUtmMetadata(managedUtm),
      },
    });

    if (managedUtm.utmCampaign && providerEmail && !providerLeadsUnsubscribed) {
      void sendAdBoostLeadDeliveredEmail({
        managedUtm,
        connectionId: connection.id,
        providerEmail,
        providerName: providerDisplayName,
        providerSlug: provider.slug || null,
        providerProfileId: toProfileId as string,
        familyName: firstName || "A family",
        careType: null,
        city: provider.city,
        careRecipient: null,
      });
    }

    return NextResponse.json({
      success: true,
      connectionId: connection.id,
      existing: false,
    });
  } catch (err) {
    console.error("[create-inquiry] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
