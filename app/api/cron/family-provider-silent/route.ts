import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/admin";
import { sendEmail, reserveEmailLogId, appendTrackingParams } from "@/lib/email";
import { providerSilentEmail } from "@/lib/email-templates";
import { withCronRun } from "@/lib/crons/run";
import { getSiteUrl } from "@/lib/site-url";
import { generateFamilyInboxUrl } from "@/lib/claim-tokens";

/**
 * GET /api/cron/family-provider-silent
 *
 * Runs daily. Sends Email #4 to families when provider has been silent for ~4 days.
 * Recommends alternative responsive providers in the same area.
 *
 * Trigger conditions:
 * - Connection is 4-5 days old (96-120 hours)
 * - Provider has NOT responded (no messages from provider in thread)
 * - Family HAS engaged (sent at least one message to primary connection)
 * - Family has NOT connected with other providers yet
 * - Email not already sent (family_alternatives_sent_at not set)
 * - Send ONCE per connection
 * - Stop if family connects with anyone else
 *
 * Responsive providers filter:
 * - Active providers in same city/state
 * - Same care type as original provider
 * - Have actually responded to leads before (message activity exists)
 */

export const maxDuration = 120;

const FOUR_DAYS_MS = 4 * 24 * 60 * 60 * 1000;
const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

interface ThreadMessage {
  from_profile_id: string;
  text?: string;
  created_at: string;
  is_auto_reply?: boolean;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const { searchParams } = new URL(request.url);
  const querySecret = searchParams.get("secret");
  const dryRun = searchParams.get("dry_run") === "true";
  const limit = Math.min(500, parseInt(searchParams.get("limit") || "500", 10));
  const isAuthed =
    authHeader === `Bearer ${process.env.CRON_SECRET}` ||
    querySecret === process.env.CRON_SECRET;

  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return withCronRun("family-provider-silent", async () => {
    const db = getServiceClient();
    const siteUrl = getSiteUrl();
    const now = Date.now();
    const fourDaysAgo = new Date(now - FOUR_DAYS_MS).toISOString();
    const fiveDaysAgo = new Date(now - FIVE_DAYS_MS).toISOString();

    const counts = {
      processed: 0,
      sent: 0,
      skipped: 0,
      skipReasons: {
        provider_responded: 0,
        family_connected_elsewhere: 0,
        family_never_engaged: 0,
        already_sent: 0,
        no_email: 0,
        no_responsive_providers: 0,
        send_failed: 0,
      },
      dry_run: dryRun,
    };

    // Fetch connections that are 4-5 days old (inquiry type only)
    const { data: connections, error: fetchError } = await db
      .from("connections")
      .select(
        `
        id,
        from_profile_id,
        to_profile_id,
        metadata,
        created_at,
        from_profile:business_profiles!connections_from_profile_id_fkey(
          id,
          display_name,
          email,
          account_id,
          city,
          state,
          care_types,
          metadata
        ),
        to_profile:business_profiles!connections_to_profile_id_fkey(
          display_name,
          city,
          state,
          care_types,
          metadata
        )
      `
      )
      .eq("type", "inquiry")
      .gte("created_at", fiveDaysAgo)
      .lte("created_at", fourDaysAgo)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (fetchError) {
      console.error("[cron/family-provider-silent] Fetch error:", fetchError);
      throw new Error(`Database error: ${fetchError.message}`);
    }

    if (!connections?.length) {
      return {
        ok: true,
        message: "No connections to process",
        ...counts,
      };
    }

    // FAMILY-LEVEL INTELLIGENCE: Group connections by family to prevent duplicate emails
    // Key: from_profile_id, Value: connection[]
    const connectionsByFamily = new Map<string, typeof connections>();
    for (const conn of connections) {
      const familyId = conn.from_profile_id;
      if (!connectionsByFamily.has(familyId)) {
        connectionsByFamily.set(familyId, []);
      }
      connectionsByFamily.get(familyId)!.push(conn);
    }

    // Process each FAMILY (not each connection)
    for (const [familyId, familyConnections] of connectionsByFamily) {
      counts.processed++;

      // Check ALL connections for this family (not just the 4-5 day batch)
      const { data: allFamilyConnections, error: familyConnError } = await db
        .from("connections")
        .select("id, from_profile_id, to_profile_id, metadata")
        .eq("from_profile_id", familyId);

      if (familyConnError) {
        console.error(
          "[cron/family-provider-silent] Error checking family connections:",
          familyConnError
        );
        counts.skipped++;
        continue;
      }

      // Check if Email #4 was already sent to this family (check ALL connections)
      let alreadySent = false;
      if (allFamilyConnections) {
        alreadySent = allFamilyConnections.some((conn) => {
          const meta = (conn.metadata || {}) as Record<string, unknown>;
          return meta.family_alternatives_sent_at;
        });
      }

      if (alreadySent) {
        counts.skipped++;
        counts.skipReasons.already_sent++;
        continue;
      }

      // Check if ANY provider responded in ANY connection for this family
      let anyProviderResponded = false;
      if (allFamilyConnections) {
        for (const conn of allFamilyConnections) {
          const meta = (conn.metadata || {}) as Record<string, unknown>;
          const thread = (meta.thread as ThreadMessage[]) || [];
          const providerResponded = thread.some(
            (m) =>
              m.from_profile_id === conn.to_profile_id &&
              !m.is_auto_reply &&
              m.text?.trim()
          );
          if (providerResponded) {
            anyProviderResponded = true;
            break;
          }
        }
      }

      if (anyProviderResponded) {
        counts.skipped++;
        counts.skipReasons.provider_responded++;
        continue;
      }

      // BUG FIX: Removed broken "connected elsewhere" check
      // The anyProviderResponded check above is sufficient - if family has active
      // conversations anywhere, we skip. No need to also check connection count.
      // Previous logic caused false positives: families with connections on different
      // days would never get Email #4 because there were always "other connections"
      // outside the 24-hour window.

      // Email #4 is ONLY for families who ENGAGED (sent a message)
      // This makes it mutually exclusive with Email #5 (never engaged)
      // IMPORTANT: Filter to engaged connections FIRST, then pick primary
      // Otherwise we might pick a connection the family never messaged
      const engagedConnections = familyConnections.filter((conn) => {
        const connMeta = (conn.metadata || {}) as Record<string, unknown>;
        const thread = (connMeta.thread as ThreadMessage[]) || [];
        return thread.some(
          (m) =>
            m.from_profile_id === conn.from_profile_id &&
            !m.is_auto_reply &&
            m.text?.trim()
        );
      });

      if (engagedConnections.length === 0) {
        counts.skipped++;
        counts.skipReasons.family_never_engaged = (counts.skipReasons.family_never_engaged || 0) + 1;
        continue;
      }

      // Pick the FIRST engaged connection (oldest) as primary for email context
      const primaryConn = engagedConnections[0];

      // Normalize joined relations
      const fromProfile = Array.isArray(primaryConn.from_profile)
        ? primaryConn.from_profile[0]
        : primaryConn.from_profile;
      const toProfile = Array.isArray(primaryConn.to_profile)
        ? primaryConn.to_profile[0]
        : primaryConn.to_profile;

      const meta = (primaryConn.metadata || {}) as Record<string, unknown>;

      // Get family email (need to resolve auth email for magic link)
      let familyEmail = fromProfile?.email;
      let authEmail = familyEmail;

      if (fromProfile?.account_id) {
        const { data: acct } = await db
          .from("accounts")
          .select("user_id")
          .eq("id", fromProfile.account_id)
          .single();
        if (acct?.user_id) {
          const { data: { user: authUser } } = await db.auth.admin.getUserById(acct.user_id);
          if (authUser?.email) {
            authEmail = authUser.email;
            if (!familyEmail) familyEmail = authEmail;
          }
        }
      }

      if (!familyEmail) {
        counts.skipped++;
        counts.skipReasons.no_email++;
        continue;
      }

      // Determine if provider actively passed (specific archive reasons only)
      // Only "not_accepting_clients" and "not_a_fit" indicate active pass
      // Other reasons (unable_to_reach, other) don't count
      const providerPassed = ["not_accepting_clients", "not_a_fit"].includes(
        meta.archive_reason as string
      );

      // Get provider info
      const providerName = toProfile?.display_name || "the provider";
      const providerCity = toProfile?.city as string | undefined;
      const providerState = toProfile?.state as string | undefined;
      const providerCareTypes = (toProfile?.care_types as string[]) || [];

      // Find responsive providers in same area with same care type
      // "Responsive" = active providers who have sent messages in last 60 days

      // Skip if no city/state (can't recommend "near you" without location)
      if (!providerCity || !providerState) {
        counts.skipped++;
        counts.skipReasons.no_responsive_providers++;
        continue;
      }

      // Skip if original provider has no care types (can't match)
      if (!providerCareTypes || providerCareTypes.length === 0) {
        counts.skipped++;
        counts.skipReasons.no_responsive_providers++;
        continue;
      }

      // Get candidate providers (same city, state, active)
      const { data: candidateProviders } = await db
        .from("business_profiles")
        .select("id, display_name, slug, city, state, care_types, metadata")
        .eq("type", "organization")
        .eq("is_active", true)
        .eq("city", providerCity)
        .eq("state", providerState)
        .neq("id", primaryConn.to_profile_id)
        .limit(50);

      if (!candidateProviders || candidateProviders.length === 0) {
        counts.skipped++;
        counts.skipReasons.no_responsive_providers++;
        continue;
      }

      // Filter to providers with matching care types (in memory)
      const matchingProviders = candidateProviders.filter((provider) => {
        const provCareTypes = (provider.care_types as string[]) || [];
        // Must have at least one matching care type
        return provCareTypes.some((ct) => providerCareTypes.includes(ct));
      });

      if (matchingProviders.length === 0) {
        counts.skipped++;
        counts.skipReasons.no_responsive_providers++;
        continue;
      }

      // Fetch ALL connections for ALL matching providers in ONE query (performance optimization)
      const providerIds = matchingProviders.map((p) => p.id);
      const sixtyDaysAgo = new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString();

      const { data: allConnections } = await db
        .from("connections")
        .select("to_profile_id, metadata, created_at")
        .in("to_profile_id", providerIds)
        .gte("created_at", sixtyDaysAgo);

      // Build map of provider_id -> has_responded (in memory filtering)
      const responsiveProviderIds = new Set<string>();

      if (allConnections) {
        for (const conn of allConnections) {
          if (responsiveProviderIds.has(conn.to_profile_id)) continue; // Already marked responsive

          const cMeta = (conn.metadata || {}) as Record<string, unknown>;
          const cThread = (cMeta.thread as ThreadMessage[]) || [];
          const hasResponded = cThread.some(
            (m) =>
              m.from_profile_id === conn.to_profile_id &&
              !m.is_auto_reply &&
              m.text?.trim()
          );

          if (hasResponded) {
            responsiveProviderIds.add(conn.to_profile_id);
          }
        }
      }

      // Filter to responsive providers and limit to 3
      const recommendedProviders: {
        name: string;
        slug: string;
        priceRange: string | null;
        viewUrl: string; // Will be filled with magic link
      }[] = matchingProviders
        .filter((p) => responsiveProviderIds.has(p.id))
        .slice(0, 3)
        .map((p) => ({
          name: p.display_name,
          slug: p.slug,
          priceRange: (p.metadata as Record<string, unknown> | null)?.price_range as string | null || null,
          viewUrl: "", // Placeholder, will be filled with magic link
        }));

      // Skip if no responsive providers found
      if (recommendedProviders.length === 0) {
        counts.skipped++;
        counts.skipReasons.no_responsive_providers++;
        continue;
      }

      // Check dry run BEFORE mutating database
      if (dryRun) {
        console.log(
          `[cron/family-provider-silent] [DRY RUN] Would send to ${familyEmail} for family ${familyId} with ${familyConnections.length} connections`
        );
        counts.sent++;
        continue;
      }

      // Build browse URL with query params (guaranteed to work, no slug issues)
      const familyCareTypes = (fromProfile?.care_types as string[]) || providerCareTypes;
      const primaryCareType = familyCareTypes[0] || "senior-care";

      const browseParams = new URLSearchParams({
        care_type: primaryCareType,
        city: providerCity,
        state: providerState,
      });
      const browseDestination = `/browse?${browseParams.toString()}`;

      // Subject line changes based on variant
      const subject = providerPassed
        ? "A few other providers near you"
        : `A few other providers near you, while you wait`;

      // Reserve email log ID
      const emailLogId = await reserveEmailLogId({
        to: familyEmail,
        subject,
        emailType: "family_provider_silent",
        recipientType: "family",
        metadata: {
          connection_id: primaryConn.id,
          provider_id: primaryConn.to_profile_id,
          provider_passed: providerPassed,
          recommended_count: recommendedProviders.length,
          family_connection_count: familyConnections.length,
        },
      });

      const browseUrlTracked = appendTrackingParams(browseDestination, emailLogId);

      // Generate HMAC-signed link with 72-hour expiry (same as providers)
      const browseMagicLink = generateFamilyInboxUrl(authEmail, browseUrlTracked, siteUrl);

      // Generate HMAC-signed links for each recommended provider (72-hour expiry)
      recommendedProviders.forEach((provider) => {
        // Add provider slug to tracking for click attribution
        const providerDest = appendTrackingParams(`/provider/${provider.slug}?rp=${provider.slug}`, emailLogId);
        provider.viewUrl = generateFamilyInboxUrl(authEmail, providerDest, siteUrl);
      });

      // Generate email HTML
      const emailHtml = providerSilentEmail({
        familyName: fromProfile?.display_name || "",
        providerName,
        providerPassed,
        recommendedProviders, // Now includes viewUrl with magic links
        browseUrl: browseMagicLink, // Magic link, not just tracked URL
        city: providerCity,
      });

      // Send email
      const { success, error: sendError } = await sendEmail({
        to: familyEmail,
        subject,
        html: emailHtml,
        emailType: "family_provider_silent",
        recipientType: "family",
        metadata: {
          connection_id: primaryConn.id,
          provider_id: primaryConn.to_profile_id,
          provider_passed: providerPassed,
          recommended_count: recommendedProviders.length,
          family_connection_count: familyConnections.length,
        },
        emailLogId: emailLogId ?? undefined,
      });

      if (!success) {
        console.error(
          `[cron/family-provider-silent] Send failed for family ${familyId}:`,
          sendError
        );
        counts.skipped++;
        counts.skipReasons.send_failed++;
        continue;
      }

      // Mark ALL connections for this family AFTER successful send (prevents lockout on failure)
      const sentAt = new Date().toISOString();
      for (const conn of familyConnections) {
        const connMeta = (conn.metadata || {}) as Record<string, unknown>;
        await db
          .from("connections")
          .update({
            metadata: {
              ...connMeta,
              family_alternatives_sent_at: sentAt,
              family_alternatives_sent_by: "cron:family-provider-silent",
              family_alternatives_count: recommendedProviders.length,
            },
          })
          .eq("id", conn.id);
      }

      counts.sent++;
    }

    return {
      ok: true,
      ...counts,
    };
  });
}
