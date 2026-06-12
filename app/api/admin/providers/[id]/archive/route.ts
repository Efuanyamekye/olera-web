import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";

/**
 * POST /api/admin/providers/[id]/archive
 *
 * Archives or unarchives a provider at the admin level.
 * When archived:
 * - All their connections appear in "Archived" tab
 * - No emails sent to them (followup sequences, nudges, digests)
 * - New leads automatically go to Archived tab
 * - Family still gets their emails
 * - Provider profile stays live for SEO
 *
 * Body: { action: "archive" | "unarchive", reason?: string }
 * Returns: { success, provider_id, admin_archived, connections_affected }
 */

const VALID_ARCHIVE_REASONS = [
  "provider_requested_no_emails",
  "inactive",
  "duplicate",
  "other",
] as const;

type ArchiveReason = (typeof VALID_ARCHIVE_REASONS)[number];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Admin auth check
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const admin = await getAdminUser(user.id);
    if (!admin) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const { id: providerId } = await params;

    if (!providerId) {
      return NextResponse.json(
        { error: "Provider ID is required" },
        { status: 400 }
      );
    }

    // Parse body
    let body: { action?: string; reason?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { action, reason } = body;

    if (action !== "archive" && action !== "unarchive") {
      return NextResponse.json(
        { error: "action must be 'archive' or 'unarchive'" },
        { status: 400 }
      );
    }

    const db = getServiceClient();

    // Fetch provider's business_profiles row
    const { data: provider, error: fetchError } = await db
      .from("business_profiles")
      .select("id, display_name, metadata")
      .eq("id", providerId)
      .maybeSingle();

    if (fetchError) {
      console.error("[archive-provider] Fetch error:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch provider" },
        { status: 500 }
      );
    }

    if (!provider) {
      return NextResponse.json(
        { error: "Provider not found" },
        { status: 404 }
      );
    }

    const meta = (provider.metadata as Record<string, unknown>) ?? {};
    const now = new Date().toISOString();

    if (action === "archive") {
      // Validate reason if provided
      if (reason && !VALID_ARCHIVE_REASONS.includes(reason as ArchiveReason)) {
        return NextResponse.json(
          { error: `Invalid reason. Must be one of: ${VALID_ARCHIVE_REASONS.join(", ")}` },
          { status: 400 }
        );
      }

      // Update provider metadata
      const updatedMeta = {
        ...meta,
        admin_archived: true,
        admin_archived_at: now,
        admin_archived_by: user.email,
        admin_archived_reason: reason || null,
      };

      const { error: updateError } = await db
        .from("business_profiles")
        .update({ metadata: updatedMeta, updated_at: now })
        .eq("id", providerId);

      if (updateError) {
        console.error("[archive-provider] Update error:", updateError);
        return NextResponse.json(
          { error: "Failed to archive provider" },
          { status: 500 }
        );
      }

      // Stop all active followup sequences for this provider's connections
      // Find all connections where this provider is to_profile_id
      const { data: connections, error: connectionsError } = await db
        .from("connections")
        .select("id, metadata")
        .eq("to_profile_id", providerId)
        .eq("type", "inquiry");

      if (connectionsError) {
        console.error("[archive-provider] Connections fetch error:", connectionsError);
        // Non-fatal - provider is archived, connections can be updated later
      }

      let connectionsAffected = 0;

      if (connections && connections.length > 0) {
        for (const conn of connections) {
          const connMeta = (conn.metadata as Record<string, unknown>) ?? {};

          // Only stop sequences that aren't already stopped
          if (!connMeta.followup_stopped_at) {
            const updatedConnMeta = {
              ...connMeta,
              followup_stopped_at: now,
              followup_stopped_reason: "provider_admin_archived",
            };

            const { error: connUpdateError } = await db
              .from("connections")
              .update({ metadata: updatedConnMeta })
              .eq("id", conn.id);

            if (connUpdateError) {
              console.error(
                `[archive-provider] Failed to stop sequence for connection ${conn.id}:`,
                connUpdateError
              );
            } else {
              connectionsAffected++;
            }
          }
        }
      }

      console.log(
        `[archive-provider] Archived provider ${providerId} (${provider.display_name}), stopped ${connectionsAffected} followup sequences`
      );

      return NextResponse.json({
        success: true,
        provider_id: providerId,
        provider_name: provider.display_name,
        admin_archived: true,
        connections_affected: connectionsAffected,
        archived_at: now,
        archived_by: user.email,
        reason: reason || null,
      });
    } else {
      // Unarchive
      const updatedMeta = { ...meta };
      delete updatedMeta.admin_archived;
      delete updatedMeta.admin_archived_at;
      delete updatedMeta.admin_archived_by;
      delete updatedMeta.admin_archived_reason;
      // Add unarchive tracking
      updatedMeta.admin_unarchived_at = now;
      updatedMeta.admin_unarchived_by = user.email;

      const { error: updateError } = await db
        .from("business_profiles")
        .update({ metadata: updatedMeta, updated_at: now })
        .eq("id", providerId);

      if (updateError) {
        console.error("[archive-provider] Unarchive error:", updateError);
        return NextResponse.json(
          { error: "Failed to unarchive provider" },
          { status: 500 }
        );
      }

      // Clear the followup_stopped_reason for connections that were stopped due to archiving
      // This allows sequences to potentially resume
      const { data: connections, error: connectionsError } = await db
        .from("connections")
        .select("id, metadata")
        .eq("to_profile_id", providerId)
        .eq("type", "inquiry");

      if (connectionsError) {
        console.error("[archive-provider] Connections fetch error:", connectionsError);
      }

      let connectionsAffected = 0;

      if (connections && connections.length > 0) {
        for (const conn of connections) {
          const connMeta = (conn.metadata as Record<string, unknown>) ?? {};

          // Only clear if stopped due to admin archiving
          if (connMeta.followup_stopped_reason === "provider_admin_archived") {
            const updatedConnMeta = { ...connMeta };
            delete updatedConnMeta.followup_stopped_at;
            delete updatedConnMeta.followup_stopped_reason;

            const { error: connUpdateError } = await db
              .from("connections")
              .update({ metadata: updatedConnMeta })
              .eq("id", conn.id);

            if (connUpdateError) {
              console.error(
                `[archive-provider] Failed to clear stop for connection ${conn.id}:`,
                connUpdateError
              );
            } else {
              connectionsAffected++;
            }
          }
        }
      }

      console.log(
        `[archive-provider] Unarchived provider ${providerId} (${provider.display_name}), resumed ${connectionsAffected} followup sequences`
      );

      return NextResponse.json({
        success: true,
        provider_id: providerId,
        provider_name: provider.display_name,
        admin_archived: false,
        connections_affected: connectionsAffected,
        unarchived_at: now,
        unarchived_by: user.email,
      });
    }
  } catch (err) {
    console.error("[archive-provider] Fatal error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
