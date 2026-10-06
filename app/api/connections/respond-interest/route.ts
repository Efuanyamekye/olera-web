import { NextResponse } from "next/server";
import { canActForProfile } from "@/lib/auth/profile-access.server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/admin";
import { sendEmail } from "@/lib/email";
import { reachOutAcceptedEmail } from "@/lib/email-templates";
import { sendLoopsEvent } from "@/lib/loops";

/**
 * POST /api/connections/respond-interest
 *
 * Handles care seeker actions on provider-initiated interest (type="request" + metadata.provider_initiated):
 * - "view"        → marks the card as viewed (removes blue dot)
 * - "accept"      → accepts the provider, creates a mutual connection
 * - "decline"     → declines the provider (can be reconsidered)
 * - "reconsider"  → moves a declined provider back to pending
 */
export async function POST(request: Request) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const { connectionId, action, message } = body as {
      connectionId: string;
      action: "view" | "accept" | "decline" | "reconsider";
      message?: string;
    };

    if (!connectionId || !action) {
      return NextResponse.json(
        { error: "Missing connectionId or action" },
        { status: 400 }
      );
    }

    // Service role client bypasses RLS — needed because the care seeker is
    // `to_profile_id` (recipient), but the RLS UPDATE policy on connections
    // only allows updates when the user owns `from_profile_id` (sender).
    const admin = getServiceClient();

    // Get user's active profile
    const { data: account } = await admin
      .from("accounts")
      .select("active_profile_id")
      .eq("user_id", user.id)
      .single();

    if (!account?.active_profile_id) {
      return NextResponse.json(
        { error: "No active profile" },
        { status: 400 }
      );
    }

    // Fetch the connection and verify ownership
    const { data: connection, error: connError } = await admin
      .from("connections")
      .select("id, type, status, from_profile_id, to_profile_id, metadata")
      .eq("id", connectionId)
      .single();

    if (connError || !connection) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 }
      );
    }

    // Verify this is a provider-initiated request directed at the current user
    const connMeta = (connection.metadata || {}) as Record<string, unknown>;
    if (connection.type !== "request" || !connMeta.provider_initiated) {
      return NextResponse.json(
        { error: "Not a provider-initiated request" },
        { status: 400 }
      );
    }

    if (
      connection.to_profile_id !== account.active_profile_id ||
      !(await canActForProfile(admin, user, account.active_profile_id))
    ) {
      return NextResponse.json(
        { error: "Not authorized" },
        { status: 403 }
      );
    }

    const currentMeta = (connection.metadata || {}) as Record<string, unknown>;

    // ── Handle each action ──

    if (action === "view") {
      const { error: updateError } = await admin
        .from("connections")
        .update({
          metadata: { ...currentMeta, viewed: true },
        })
        .eq("id", connectionId);

      if (updateError) {
        console.error("[respond-interest] view update failed:", updateError);
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    if (action === "accept") {
      // Build auto-intro from care seeker's profile
      let autoIntro: string | null = null;
      let seekerProfile: { care_types: string[] | null; metadata: Record<string, unknown> | null; display_name: string | null; email: string | null; phone: string | null; city: string | null; state: string | null } | null = null;
      let providerProfile: { care_types: string[] | null; display_name: string | null; city: string | null; state: string | null } | null = null;

      try {
        const [seekerRes, providerRes] = await Promise.all([
          admin
            .from("business_profiles")
            .select("care_types, metadata, display_name, email, phone, city, state")
            .eq("id", connection.to_profile_id)
            .single(),
          admin
            .from("business_profiles")
            .select("care_types, display_name, city, state")
            .eq("id", connection.from_profile_id)
            .single(),
        ]);
        seekerProfile = seekerRes.data;
        providerProfile = providerRes.data;

        const seekerCareTypes: string[] = seekerProfile?.care_types || [];
        const providerCareTypes: string[] = providerProfile?.care_types || [];
        const providerName = providerProfile?.display_name || "the provider";

        // Pick most relevant care type
        const matchedType = seekerCareTypes.find((ct) =>
          providerCareTypes.some(
            (pct) => pct.toLowerCase() === ct.toLowerCase()
          )
        );
        const careType = matchedType || seekerCareTypes[0] || null;

        // Build message: "[Provider Name] is interested in connecting with you about your care needs."
        autoIntro = `${providerName} is interested in connecting with you about your ${careType ? careType.toLowerCase() + " " : ""}care needs.`;
      } catch {
        // Non-blocking
      }

      // Build thread with family's reply message
      const existingThread = (currentMeta.thread as Array<Record<string, unknown>>) || [];
      const updatedThread = [...existingThread];

      // Add family's reply message to thread if provided
      if (message?.trim()) {
        updatedThread.push({
          from_profile_id: connection.to_profile_id,
          text: message.trim(),
          created_at: new Date().toISOString(),
        });
      }

      // Build summary card data for provider to see family info
      const seekerName = seekerProfile?.display_name || user.email?.split("@")[0] || "";
      const nameParts = seekerName.trim().split(/\\s+/);
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";

      // Build message payload with seeker info for summary card (similar to create-inquiry)
      const messagePayload = JSON.stringify({
        seeker_name: seekerName,
        seeker_first_name: firstName,
        seeker_last_name: lastName,
        seeker_email: seekerProfile?.email || user.email || "",
        seeker_phone: seekerProfile?.phone || null,
        looking_in_city: providerProfile?.city || seekerProfile?.city,
        looking_in_state: providerProfile?.state || seekerProfile?.state,
        message: message?.trim() || "",
        care_recipient: null,
        care_type: null,
        urgency: null,
        additional_notes: message?.trim() || "",
      });

      // Update status to accepted with thread and message data
      const { error: acceptError } = await admin
        .from("connections")
        .update({
          status: "accepted",
          message: messagePayload,
          metadata: {
            ...currentMeta,
            viewed: true,
            accepted_at: new Date().toISOString(),
            ...(autoIntro ? { auto_intro: autoIntro } : {}),
            // Mark as provider-initiated for display in Connected tab
            provider_initiated: true,
            thread: updatedThread,
          },
        })
        .eq("id", connectionId);

      if (acceptError) {
        console.error("[respond-interest] accept update failed:", acceptError);
        return NextResponse.json({ error: acceptError.message }, { status: 500 });
      }

      // Email the provider that the care seeker accepted (fire-and-forget)
      try {
        const { data: providerBp } = await admin
          .from("business_profiles")
          .select("email, display_name")
          .eq("id", connection.from_profile_id)
          .single();

        const { data: seekerBp } = await admin
          .from("business_profiles")
          .select("display_name")
          .eq("id", connection.to_profile_id)
          .single();

        if (providerBp?.email) {
          const familyName = seekerBp?.display_name || "A family";
          await sendEmail({
            to: providerBp.email,
            subject: `${familyName} accepted your reach-out — you're connected`,
            html: reachOutAcceptedEmail({
              providerName: providerBp.display_name || "Provider",
              familyName,
              viewUrl: `${process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care"}/provider/connections`,
            }),
            emailType: 'reach_out_accepted',
            recipientType: 'provider',
            providerId: connection.from_profile_id,
          });
        }
      } catch (emailErr) {
        console.error("[respond-interest] email failed:", emailErr);
      }

      // Loops: connection accepted (fire-and-forget)
      try {
        const { data: provBp } = await admin
          .from("business_profiles")
          .select("display_name")
          .eq("id", connection.from_profile_id)
          .single();

        await sendLoopsEvent({
          email: user.email || "",
          eventName: "connection_accepted",
          audience: "seeker",
          eventProperties: {
            providerName: provBp?.display_name || "",
          },
        });
      } catch {
        // Non-blocking
      }

      return NextResponse.json({ success: true, connectionId });
    }

    if (action === "decline") {
      const { error: declineError } = await admin
        .from("connections")
        .update({
          status: "declined",
          metadata: {
            ...currentMeta,
            viewed: true,
            declined_at: new Date().toISOString(),
          },
        })
        .eq("id", connectionId);

      if (declineError) {
        console.error("[respond-interest] decline update failed:", declineError);
        return NextResponse.json({ error: declineError.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    if (action === "reconsider") {
      // Move back to pending, clear declined_at
      const { declined_at, ...restMeta } = currentMeta as Record<string, unknown> & { declined_at?: unknown };
      const { error: reconsiderError } = await admin
        .from("connections")
        .update({
          status: "pending",
          metadata: { ...restMeta, viewed: true },
        })
        .eq("id", connectionId);

      if (reconsiderError) {
        console.error("[respond-interest] reconsider update failed:", reconsiderError);
        return NextResponse.json({ error: reconsiderError.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: "Invalid action" },
      { status: 400 }
    );
  } catch (err) {
    console.error("Respond interest error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
