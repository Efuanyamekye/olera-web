import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import { connectionResponseEmail } from "@/lib/email-templates";
import { sendLoopsEvent } from "@/lib/loops";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getAdminClient(): any {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

type Action = "accept" | "decline" | "archive" | "unarchive" | "delete" | "report";

/**
 * POST /api/connections/manage
 *
 * Manages inbox connection lifecycle: archive, unarchive, delete (soft), report.
 * Uses the admin client to bypass RLS.
 *
 * NOTE: Archive state is stored in metadata.archived = true rather than
 * changing the status column, because the DB CHECK constraint only allows
 * 'pending', 'accepted', 'declined', 'expired'. The client treats connections
 * with metadata.archived = true as archived in the UI.
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
    const { connectionId, action, reportReason, reportDetails, archiveReason, archiveMessage } = body as {
      connectionId: string;
      action: Action;
      reportReason?: string;
      reportDetails?: string;
      archiveReason?: string;
      archiveMessage?: string;
    };

    if (!connectionId || !action) {
      return NextResponse.json(
        { error: "connectionId and action are required" },
        { status: 400 }
      );
    }

    const admin = getAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // Get all user profiles for authorization
    const { data: account } = await admin
      .from("accounts")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const { data: profiles } = await admin
      .from("business_profiles")
      .select("id")
      .eq("account_id", account.id);

    const profileIds = (profiles || []).map((p: { id: string }) => p.id);

    // Fetch the connection (include type to handle inquiry vs request flows)
    const { data: connection, error: fetchError } = await admin
      .from("connections")
      .select("id, type, from_profile_id, to_profile_id, status, metadata")
      .eq("id", connectionId)
      .single();

    if (fetchError || !connection) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 }
      );
    }

    // Must be a participant
    if (
      !profileIds.includes(connection.from_profile_id) &&
      !profileIds.includes(connection.to_profile_id)
    ) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const existingMeta =
      (connection.metadata as Record<string, unknown>) || {};

    // Determine the acting profile (whichever of the user's profiles is on this connection)
    const actingProfileId = profileIds.includes(connection.from_profile_id)
      ? connection.from_profile_id
      : connection.to_profile_id;

    switch (action) {
      case "accept":
      case "decline": {
        const newStatus = action === "accept" ? "accepted" : "declined";
        const { error: statusError } = await admin
          .from("connections")
          .update({ status: newStatus })
          .eq("id", connectionId);

        if (statusError) {
          console.error(`[manage] ${action} error:`, statusError);
          return NextResponse.json({ error: `Failed to ${action}` }, { status: 500 });
        }

        // Send email to the initiator (the one who started the connection)
        // - type: "inquiry" → family initiated, provider is accepting/declining
        // - type: "request" → provider initiated, family is accepting/declining
        try {
          const isProviderRequest = connection.type === "request";

          // Determine who initiated and who is responding based on connection type
          const initiatorProfileId = connection.from_profile_id;
          const responderProfileId = connection.to_profile_id;

          const [{ data: initiatorBp }, { data: responderBp }] = await Promise.all([
            admin
              .from("business_profiles")
              .select("email, display_name, account_id, type")
              .eq("id", initiatorProfileId)
              .single(),
            admin
              .from("business_profiles")
              .select("display_name, type")
              .eq("id", responderProfileId)
              .single(),
          ]);

          // Look up initiator's auth email via accounts table
          let initiatorEmail = initiatorBp?.email;
          if (!initiatorEmail && initiatorBp?.account_id) {
            const { data: acct } = await admin
              .from("accounts")
              .select("user_id")
              .eq("id", initiatorBp.account_id)
              .single();
            if (acct?.user_id) {
              const { data: { user: authUser } } = await admin.auth.admin.getUserById(acct.user_id);
              initiatorEmail = authUser?.email;
            }
          }

          if (initiatorEmail) {
            // Customize email based on connection type
            const responderName = responderBp?.display_name || (isProviderRequest ? "The family" : "A provider");
            const initiatorName = initiatorBp?.display_name || "there";

            const subject = action === "accept"
              ? `${responderName} accepted your ${isProviderRequest ? "connection request" : "inquiry"} on Olera`
              : `Update on your ${isProviderRequest ? "connection request" : "care inquiry"} on Olera`;

            // Direct to the appropriate inbox view
            const viewUrl = isProviderRequest
              ? `${process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care"}/portal/inbox?role=provider`
              : `${process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care"}/portal/inbox`;

            await sendEmail({
              to: initiatorEmail,
              subject,
              html: connectionResponseEmail({
                familyName: isProviderRequest ? responderName : initiatorName,
                providerName: isProviderRequest ? initiatorName : responderName,
                accepted: action === "accept",
                viewUrl,
              }),
              emailType: 'connection_response',
              recipientType: isProviderRequest ? 'provider' : 'family',
            });
          }
        } catch (emailErr) {
          console.error(`[manage] ${action} email failed:`, emailErr);
        }

        // Loops event (fire-and-forget) — notify the initiator that their connection was accepted
        if (action === "accept") {
          try {
            const isProviderRequest = connection.type === "request";
            const { data: initiatorBp } = await admin
              .from("business_profiles")
              .select("account_id")
              .eq("id", connection.from_profile_id)
              .single();

            if (initiatorBp?.account_id) {
              const { data: acct } = await admin
                .from("accounts")
                .select("user_id")
                .eq("id", initiatorBp.account_id)
                .single();
              if (acct?.user_id) {
                const { data: { user: initiatorAuth } } = await admin.auth.admin.getUserById(acct.user_id);
                if (initiatorAuth?.email) {
                  await sendLoopsEvent({
                    email: initiatorAuth.email,
                    eventName: "connection_accepted",
                    audience: isProviderRequest ? "provider" : "seeker",
                  });
                }
              }
            }
          } catch {
            // Non-blocking
          }
        }

        return NextResponse.json({ status: newStatus });
      }

      case "archive": {
        // Store archive state in metadata — do NOT change status (DB CHECK constraint
        // only allows pending/accepted/declined/expired, not archived).
        const archiveMeta: Record<string, unknown> = {
          ...existingMeta,
          archived: true,
          archived_from_status: connection.status,
        };

        // Store reason if provided (e.g. from provider Leads page)
        if (archiveReason) {
          archiveMeta.archive_reason = archiveReason;
          archiveMeta.archive_message = archiveMessage || null;
          archiveMeta.archived_by = actingProfileId;
          archiveMeta.archived_at = new Date().toISOString();

          // Append a system thread message so it appears in conversation history
          const existingThread = (existingMeta.thread as Array<{
            from_profile_id: string;
            text: string;
            created_at: string;
          }>) || [];

          let systemText = `This provider has passed on this inquiry. Reason: ${archiveReason}`;
          if (archiveMessage) {
            systemText += `\n"${archiveMessage}"`;
          }

          archiveMeta.thread = [
            ...existingThread,
            {
              from_profile_id: "system",
              type: "system",
              text: systemText,
              created_at: new Date().toISOString(),
            },
          ];
        }

        const { error: updateError } = await admin
          .from("connections")
          .update({ metadata: archiveMeta })
          .eq("id", connectionId);

        if (updateError) {
          console.error("[manage] archive error:", updateError);
          return NextResponse.json({ error: "Failed to archive" }, { status: 500 });
        }
        return NextResponse.json({ status: "archived" });
      }

      case "unarchive": {
        const restoreStatus = (existingMeta.archived_from_status as string) || "accepted";
        // Remove archived flags from metadata, status never changed so nothing to restore
        const cleanMeta: Record<string, unknown> = { ...existingMeta };
        delete cleanMeta.archived;
        delete cleanMeta.archived_from_status;

        const { error: updateError } = await admin
          .from("connections")
          .update({ metadata: cleanMeta })
          .eq("id", connectionId);

        if (updateError) {
          console.error("[manage] unarchive error:", updateError);
          return NextResponse.json({ error: "Failed to unarchive" }, { status: 500 });
        }
        return NextResponse.json({ status: restoreStatus });
      }

      case "delete": {
        const { error: updateError } = await admin
          .from("connections")
          .update({
            metadata: { ...existingMeta, hidden: true },
          })
          .eq("id", connectionId);

        if (updateError) {
          console.error("[manage] delete error:", updateError);
          return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
        }
        return NextResponse.json({ status: "hidden" });
      }

      case "report": {
        // Store report + archive state in metadata only — do NOT change status
        const reportMeta = {
          ...existingMeta,
          archived: true,
          archived_from_status: connection.status,
          reported: true,
          reported_at: new Date().toISOString(),
          reported_by: actingProfileId,
          report_reason: reportReason || null,
          report_details: reportDetails || null,
        };

        const { error: updateError } = await admin
          .from("connections")
          .update({ metadata: reportMeta })
          .eq("id", connectionId);

        if (updateError) {
          console.error("[manage] report error:", updateError);
          return NextResponse.json({ error: "Failed to report" }, { status: 500 });
        }
        return NextResponse.json({ status: "reported" });
      }

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (err) {
    console.error("[manage] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
