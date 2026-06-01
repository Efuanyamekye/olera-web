import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/admin";
import { sendEmail, reserveEmailLogId, appendTrackingParams } from "@/lib/email";
import { providerReachOutEmail } from "@/lib/email-templates";
import { sendSlackAlert } from "@/lib/slack";

/**
 * POST /api/matches/notify-reach-out
 *
 * Fires email notification to family when a provider sends a reach-out.
 * Called after the client-side connection insert succeeds.
 *
 * Generates a magic link for authenticated families or includes claim token
 * for guest families so they can access their inbox without signing in.
 *
 * Body: { toProfileId: string }
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

    const { toProfileId } = (await request.json()) as { toProfileId: string };
    if (!toProfileId) {
      return NextResponse.json({ error: "Missing toProfileId" }, { status: 400 });
    }

    const db = getServiceClient();

    // Get provider's active profile
    const { data: account } = await db
      .from("accounts")
      .select("active_profile_id")
      .eq("user_id", user.id)
      .single();

    if (!account?.active_profile_id) {
      return NextResponse.json({ error: "No active profile" }, { status: 400 });
    }

    // Fetch provider and family profiles in parallel
    // Include account_id and claim_token for family to determine auth method
    const [{ data: provider }, { data: family }] = await Promise.all([
      db
        .from("business_profiles")
        .select("display_name, city, state")
        .eq("id", account.active_profile_id)
        .single(),
      db
        .from("business_profiles")
        .select("display_name, email, city, account_id, claim_token")
        .eq("id", toProfileId)
        .single(),
    ]);

    if (!family?.email) {
      return NextResponse.json({ success: true, skipped: "no_email" });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
    const providerCity = provider?.city || family?.city || "your area";

    // Get the reach-out connection (we need the ID for deep-linking)
    const { data: conn } = await db
      .from("connections")
      .select("id, message")
      .eq("from_profile_id", account.active_profile_id)
      .eq("to_profile_id", toProfileId)
      .eq("type", "request")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const reachOutEmailLogId = await reserveEmailLogId({
      to: family.email,
      subject: `A provider in ${providerCity} is interested in your care needs`,
      emailType: "provider_reach_out",
      recipientType: "family",
      providerId: account.active_profile_id,
    });

    // Build the inbox URL with connection ID for auto-selection
    const inboxPath = conn?.id ? `/portal/inbox?id=${conn.id}` : "/portal/inbox";
    const trackedDest = appendTrackingParams(inboxPath, reachOutEmailLogId);
    let inboxUrl = `${siteUrl}${trackedDest}`;

    // Generate appropriate auth link based on family profile type
    if (family.account_id) {
      // Authenticated family: look up their email and generate magic link
      const { data: familyAccount } = await db
        .from("accounts")
        .select("user_id")
        .eq("id", family.account_id)
        .single();

      if (familyAccount?.user_id) {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (supabaseUrl && serviceKey) {
          const authClient = createClient(supabaseUrl, serviceKey);
          const { data: linkData, error: linkError } = await authClient.auth.admin.generateLink({
            type: "magiclink",
            email: family.email,
            options: {
              redirectTo: `${siteUrl}/auth/magic-link?next=${encodeURIComponent(trackedDest)}`,
            },
          });

          if (!linkError && linkData?.properties?.action_link) {
            inboxUrl = linkData.properties.action_link;
          } else if (linkError) {
            console.warn("[notify-reach-out] Failed to generate magic link:", linkError);
          }
        }
      }
    } else if (family.claim_token) {
      // Guest family: include claim token in URL for guest access
      const separator = trackedDest.includes("?") ? "&" : "?";
      inboxUrl = `${siteUrl}${trackedDest}${separator}token=${family.claim_token}`;
    }
    // If neither (edge case), fallback to plain URL - user will need to sign in

    const providerDisplayName = provider?.display_name || "A care provider";
    await sendEmail({
      to: family.email,
      subject: `${providerDisplayName} wants to connect with you`,
      html: providerReachOutEmail({
        familyName: family.display_name || "there",
        providerName: providerDisplayName,
        city: providerCity,
        message: conn?.message || null,
        matchesUrl: inboxUrl,
      }),
      emailType: "provider_reach_out",
      recipientType: "family",
      providerId: account.active_profile_id,
      emailLogId: reachOutEmailLogId ?? undefined,
      recipientProfileId: toProfileId,
    });

    // Slack alert (fire-and-forget)
    try {
      await sendSlackAlert(
        `📬 Provider reach-out: ${provider?.display_name || "Provider"} → ${family.display_name || "Family"} (${providerCity})`,
      );
    } catch {
      // Non-blocking
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[matches/notify-reach-out] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
