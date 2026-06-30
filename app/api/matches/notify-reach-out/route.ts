import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/admin";
import { sendEmail, reserveEmailLogId, appendTrackingParams } from "@/lib/email";
import { providerReachOutEmail, providerReachOutConfirmationEmail } from "@/lib/email-templates";
import { sendSlackAlert } from "@/lib/slack";
import { sendReactiveFamilyAlert } from "@/lib/sms/reactive-alerts";

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
        .select("display_name, city, state, metadata")
        .eq("id", account.active_profile_id)
        .single(),
      db
        .from("business_profiles")
        .select("display_name, email, city, account_id, claim_token, phone, state, phone_validity")
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
    const { success: familyEmailSuccess, error: familyEmailError } = await sendEmail({
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

    // Log failure but don't block - the reach-out connection already exists in the database
    // (this endpoint is called AFTER client-side connection insert succeeds)
    // The family can still see the message when they log in, just won't get email notification
    if (!familyEmailSuccess) {
      console.error("[notify-reach-out] Family email notification failed:", familyEmailError);
    }

    // Reactive SMS alert (Tier 1) — transactional, gated by phone/opt-out/quiet
    // hours inside the helper. Uses a STABLE inbox URL (not the 1h magic link),
    // since a quiet-hours-deferred text could be delivered the next morning.
    try {
      const smsPath = conn?.id ? `/portal/inbox?id=${conn.id}` : "/portal/inbox";
      let smsUrl = `${siteUrl}${smsPath}`;
      if (!family.account_id && family.claim_token) {
        const sep = smsPath.includes("?") ? "&" : "?";
        smsUrl = `${siteUrl}${smsPath}${sep}token=${family.claim_token}`;
      }
      await sendReactiveFamilyAlert({
        familyProfileId: toProfileId,
        phone: family.phone,
        state: family.state,
        phoneValidity: family.phone_validity,
        emailType: "provider_reach_out",
        body: `Olera: ${providerDisplayName} in ${providerCity} reached out about your care needs. Read & reply: ${smsUrl}`,
      });
    } catch (smsErr) {
      console.error("[notify-reach-out] Reactive SMS failed:", smsErr);
    }

    // Slack alert (fire-and-forget)
    try {
      await sendSlackAlert(
        `📬 Provider reach-out: ${provider?.display_name || "Provider"} → ${family.display_name || "Family"} (${providerCity})`,
      );
    } catch {
      // Non-blocking
    }

    // Send confirmation email to the provider
    // Skip if provider is admin-archived (no emails sent to them)
    const providerMeta = (provider?.metadata as Record<string, unknown>) ?? {};
    const isProviderArchived = providerMeta.admin_archived === true;

    try {
      const providerEmail = user.email;
      if (providerEmail && !isProviderArchived) {
        // Count other providers who have reached out to this family (competitive urgency)
        const { count: competitorCount } = await db
          .from("connections")
          .select("id", { count: "exact", head: true })
          .eq("to_profile_id", toProfileId)
          .eq("type", "request")
          .in("status", ["pending", "accepted"])
          .neq("from_profile_id", account.active_profile_id);

        const confirmLogId = await reserveEmailLogId({
          to: providerEmail,
          subject: `Your message to ${family.display_name || "a family"} was sent`,
          emailType: "reach_out_confirmation",
          recipientType: "provider",
          providerId: account.active_profile_id,
        });

        // Build provider inbox URL with connection ID
        const providerInboxPath = conn?.id
          ? `/portal/inbox?role=provider&id=${conn.id}`
          : "/portal/inbox?role=provider";
        const trackedProviderDest = appendTrackingParams(providerInboxPath, confirmLogId);
        let providerViewUrl = `${siteUrl}${trackedProviderDest}`;

        // Generate magic link for provider auto-sign-in
        try {
          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
          const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

          if (supabaseUrl && serviceKey) {
            const authClient = createClient(supabaseUrl, serviceKey);
            const { data: providerLinkData, error: providerLinkError } = await authClient.auth.admin.generateLink({
              type: "magiclink",
              email: providerEmail,
              options: {
                redirectTo: `${siteUrl}/auth/magic-link?next=${encodeURIComponent(trackedProviderDest)}`,
              },
            });

            if (!providerLinkError && providerLinkData?.properties?.action_link) {
              providerViewUrl = providerLinkData.properties.action_link;
            }
          }
        } catch (linkErr) {
          console.error("[notify-reach-out] Failed to generate provider magic link:", linkErr);
          // Continue with fallback URL
        }

        await sendEmail({
          to: providerEmail,
          subject: `Your message to ${family.display_name || "a family"} was sent`,
          html: providerReachOutConfirmationEmail({
            providerName: providerDisplayName,
            familyName: family.display_name || "the family",
            city: providerCity,
            competitorCount: competitorCount || 0,
            viewUrl: providerViewUrl,
          }),
          emailType: "reach_out_confirmation",
          recipientType: "provider",
          providerId: account.active_profile_id,
          emailLogId: confirmLogId ?? undefined,
          recipientProfileId: account.active_profile_id,
        });

        console.log(`[notify-reach-out] Provider confirmation sent to ${providerEmail}, competitors: ${competitorCount || 0}`);
      }
    } catch (confirmErr) {
      console.error("[notify-reach-out] Provider confirmation email failed:", confirmErr);
      // Non-blocking - family email already sent successfully
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[matches/notify-reach-out] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
