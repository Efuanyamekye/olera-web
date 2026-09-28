import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";

/**
 * GET /api/admin/students/email-health
 *
 * Returns email health metrics aggregated per student.
 *
 * Unlike provider deliverability (which focuses on lost demand), student email
 * health focuses on engagement: are students receiving and reading their emails?
 * A student with bounced emails can't be notified of interview requests or
 * profile approvals — the entire MedJobs workflow breaks.
 *
 * Query params:
 *   - days: Window in days (default 90, max 365)
 *   - filter: "all" | "bounced" | "complained" | "healthy" (default "all")
 *   - page: Page number (default 1)
 *   - per_page: Results per page (default 50, max 100)
 */
export const maxDuration = 60;

// days=0 means "all time" (no date filter)
const DEFAULT_WINDOW_DAYS = 0;
const PAGE_SIZE_MAX = 100;

/**
 * Student-relevant email types. These are the emails that matter for the
 * MedJobs student lifecycle — if they don't land, the student is stuck.
 *
 * IMPORTANT: These must match the actual emailType values used when sending
 * emails with recipientType: "student". Keep in sync with comms-timeline route.
 */
const STUDENT_EMAIL_TYPES = [
  // Account/Auth
  "student_signup_welcome",
  "student_account_created",
  "student_welcome",
  "student_returning",
  "student_magic_link",
  // Profile lifecycle
  "profile_incomplete_nudge", // cron sends this (not "student_profile_incomplete_nudge")
  "medjobs_review_nudge",
  "medjobs_review_requested", // confirmation when student requests review
  "medjobs_profile_approved",
  "medjobs_profile_rejected",
  "medjobs_profile_revoked",
  // Interviews
  "interview_proposed",
  "interview_confirmed",
  "interview_scheduled_confirmation",
  "interview_request_sent",
  "interview_cancelled",
  "interview_reminder",
  "interview_reschedule_sent",
  "interview_cancelled_admin",
  // Applications & Invitations
  "invitation_received", // provider invites student (not "student_invitation_received")
  "application_sent", // confirmation when student applies
  "application_response", // provider responds to application
  // Placements
  "placement_offered",
  "placement_accepted_confirmation",
  "placement_cancelled",
  // Job ready
  "medjobs_job_ready", // student accepts terms (not "student_job_ready")
] as const;

interface LogRow {
  id: string;
  recipient: string;
  email_type: string;
  status: string | null;
  error_message: string | null;
  created_at: string;
  delivered_at: string | null;
  first_opened_at: string | null;
  first_clicked_at: string | null;
  bounced_at: string | null;
  complained_at: string | null;
}

/**
 * Failures that don't indicate a reachability problem.
 * Copied from provider deliverability route for consistency.
 */
function isReachabilityFailure(errorMessage: string | null): boolean {
  const m = (errorMessage || "").toLowerCase();
  if (!m) return true;
  // User turned notifications off — a choice, not a failure
  if (m.startsWith("skipped:")) return false;
  // Our rate limiting — not evidence about the mailbox
  if (m.includes("too many requests")) return false;
  // Sandbox issues — our plumbing, not the address
  if (m.includes("invalid `to` field")) return false;
  return true;
}

interface StudentProfile {
  id: string;
  slug: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  image_url: string | null;
  is_active: boolean;
  metadata: {
    application_completed?: boolean;
    university?: string;
  } | null;
}

/**
 * Grace period before a missing delivered_at counts as "lost".
 * Resend webhooks are near-instant but not synchronous — a send from
 * 2 minutes ago legitimately has no delivered_at yet.
 */
const DELIVERY_GRACE_MS = 6 * 60 * 60 * 1000; // 6 hours

const PAGE = 1000;

async function readAll<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await fetchPage(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    out.push(...batch);
    if (batch.length < PAGE) return out;
    if (out.length >= 100_000) return out; // Runaway guard
  }
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const admin = await getAdminUser(user.id);
  if (!admin) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  const db = getServiceClient();
  const { searchParams } = new URL(request.url);

  // Date filtering: prefer from/to params, fall back to days param
  // days=0 or no params means "all time"
  const fromParam = searchParams.get("from"); // ISO date string
  const toParam = searchParams.get("to"); // ISO date string
  const daysParam = parseInt(searchParams.get("days") || "", 10);
  const days = isNaN(daysParam) ? DEFAULT_WINDOW_DAYS : (daysParam === 0 ? 0 : Math.min(Math.max(daysParam, 1), 365));

  const filter = searchParams.get("filter") || "all";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const perPage = Math.min(PAGE_SIZE_MAX, Math.max(1, parseInt(searchParams.get("per_page") || "50", 10)));

  try {
    // Fetch all student emails (optionally filtered by date window)
    const rows = await readAll<LogRow>((from, to) => {
      let query = db
        .from("email_log")
        .select(
          "id, recipient, email_type, status, error_message, created_at, delivered_at, first_opened_at, first_clicked_at, bounced_at, complained_at"
        )
        .eq("channel", "email")
        .eq("recipient_type", "student")
        .in("email_type", STUDENT_EMAIL_TYPES as unknown as string[]);

      // Apply date filter: from/to params take precedence over days
      if (fromParam) {
        query = query.gte("created_at", fromParam);
      } else if (days > 0) {
        const since = new Date(Date.now() - days * 86_400_000).toISOString();
        query = query.gte("created_at", since);
      }
      if (toParam) {
        query = query.lt("created_at", toParam);
      }

      return query.order("id", { ascending: true }).range(from, to);
    });

    // Aggregate by email address (lowercased for deduplication)
    interface StudentStats {
      email: string;
      sent: number;
      delivered: number;
      opened: number;
      clicked: number;
      bounced: number;
      complained: number;
      lastEmailAt: string | null;
      lastBouncedAt: string | null;
      lastComplainedAt: string | null;
    }

    const byEmail = new Map<string, StudentStats>();

    for (const row of rows) {
      const key = row.recipient.toLowerCase();
      const stats = byEmail.get(key) ?? {
        email: row.recipient,
        sent: 0,
        delivered: 0,
        opened: 0,
        clicked: 0,
        bounced: 0,
        complained: 0,
        lastEmailAt: null,
        lastBouncedAt: null,
        lastComplainedAt: null,
      };

      stats.sent += 1;

      // Check if this send is old enough that missing delivered_at means lost
      const sendAge = Date.now() - new Date(row.created_at).getTime();
      const settledEnough = sendAge > DELIVERY_GRACE_MS;

      // A "failed" status is only a reachability problem if it's not a skip/rate-limit
      const failedForReachability = row.status === "failed" && isReachabilityFailure(row.error_message);

      // Delivered = has delivered_at, OR is recent enough that webhook might still come
      if (row.delivered_at || (!failedForReachability && !row.bounced_at && !settledEnough)) {
        stats.delivered += 1;
      }

      if (row.first_opened_at) {
        stats.opened += 1;
      }
      if (row.first_clicked_at) {
        stats.clicked += 1;
      }

      // Only count bounces that are actual reachability failures
      if (row.bounced_at || (failedForReachability && settledEnough)) {
        stats.bounced += 1;
        const bounceTime = row.bounced_at || row.created_at;
        if (!stats.lastBouncedAt || bounceTime > stats.lastBouncedAt) {
          stats.lastBouncedAt = bounceTime;
        }
      }

      if (row.complained_at) {
        stats.complained += 1;
        if (!stats.lastComplainedAt || row.complained_at > stats.lastComplainedAt) {
          stats.lastComplainedAt = row.complained_at;
        }
      }

      if (!stats.lastEmailAt || row.created_at > stats.lastEmailAt) {
        stats.lastEmailAt = row.created_at;
      }

      byEmail.set(key, stats);
    }

    // Get student profile info for the emails we found
    // We look up by email address since email_log doesn't have a profile ID column
    // Use original-case emails for the query (not lowercased keys) because
    // email_log.recipient is stored as-is and business_profiles.email may also
    // have mixed casing. PostgreSQL .in() is case-sensitive.
    const originalEmails = [...byEmail.values()].map((s) => s.email);
    const profileMap = new Map<string, StudentProfile>();

    // Fetch profiles by email address in batches
    for (let i = 0; i < originalEmails.length; i += 100) {
      const slice = originalEmails.slice(i, i + 100);
      const { data } = await db
        .from("business_profiles")
        .select("id, slug, display_name, email, phone, image_url, is_active, metadata")
        .eq("type", "student")
        .in("email", slice);

      for (const p of (data ?? []) as StudentProfile[]) {
        if (p.email) {
          // Store with lowercase key for consistent lookup
          profileMap.set(p.email.toLowerCase(), p);
        }
      }
    }

    // Build the final student list with computed metrics
    interface StudentEmailHealth {
      email: string;
      profileId: string | null;
      name: string;
      slug: string | null;
      university: string | null;
      phone: string | null;
      imageUrl: string | null;
      isActive: boolean;
      isApproved: boolean;
      sent: number;
      delivered: number;
      opened: number;
      clicked: number;
      bounced: number;
      complained: number;
      openRate: number;
      clickRate: number;
      status: "healthy" | "bounced" | "complained";
      lastEmailAt: string | null;
      lastBouncedAt: string | null;
      lastComplainedAt: string | null;
    }

    let students: StudentEmailHealth[] = [...byEmail.values()]
      .map((stats) => {
        const profile = profileMap.get(stats.email.toLowerCase());
        const meta = profile?.metadata ?? {};

        // Determine health status (complaints are worse than bounces)
        let status: "healthy" | "bounced" | "complained" = "healthy";
        if (stats.complained > 0) {
          status = "complained";
        } else if (stats.bounced > 0) {
          status = "bounced";
        }

        // Calculate rates (avoid division by zero)
        const openRate = stats.delivered > 0 ? Math.round((stats.opened / stats.delivered) * 100) : 0;
        const clickRate = stats.delivered > 0 ? Math.round((stats.clicked / stats.delivered) * 100) : 0;

        return {
          email: stats.email,
          profileId: profile?.id ?? null,
          name: profile?.display_name ?? "(unknown)",
          slug: profile?.slug ?? null,
          university: meta.university ?? null,
          phone: profile?.phone ?? null,
          imageUrl: profile?.image_url ?? null,
          isActive: profile?.is_active ?? false,
          isApproved: !!meta.application_completed,
          sent: stats.sent,
          delivered: stats.delivered,
          opened: stats.opened,
          clicked: stats.clicked,
          bounced: stats.bounced,
          complained: stats.complained,
          openRate,
          clickRate,
          status,
          lastEmailAt: stats.lastEmailAt,
          lastBouncedAt: stats.lastBouncedAt,
          lastComplainedAt: stats.lastComplainedAt,
        };
      })
      // Filter out orphaned emails (deleted students) — only show students with active profiles
      .filter((s) => s.profileId !== null);

    // Calculate aggregate stats from all students (before status filter)
    const allActiveStudents = students; // Already filtered to only those with profiles
    const totalSent = allActiveStudents.reduce((sum, s) => sum + s.sent, 0);
    const totalDelivered = allActiveStudents.reduce((sum, s) => sum + s.delivered, 0);
    const totalOpened = allActiveStudents.reduce((sum, s) => sum + s.opened, 0);
    const totalClicked = allActiveStudents.reduce((sum, s) => sum + s.clicked, 0);
    const totalBounced = allActiveStudents.reduce((sum, s) => sum + s.bounced, 0);
    const totalComplaints = allActiveStudents.reduce((sum, s) => sum + s.complained, 0);

    const overallOpenRate = totalDelivered > 0 ? Math.round((totalOpened / totalDelivered) * 100) : 0;
    const overallClickRate = totalDelivered > 0 ? Math.round((totalClicked / totalDelivered) * 100) : 0;
    const bounceRate = totalSent > 0 ? Math.round((totalBounced / totalSent) * 100) : 0;
    const complaintRate = totalDelivered > 0 ? Math.round((totalComplaints / totalDelivered) * 10000) / 100 : 0;

    // Apply status filter for display
    if (filter === "bounced") {
      students = students.filter((s) => s.status === "bounced");
    } else if (filter === "complained") {
      students = students.filter((s) => s.status === "complained");
    } else if (filter === "healthy") {
      students = students.filter((s) => s.status === "healthy");
    }

    // Sort: complained first, then bounced, then by sent count descending
    const statusRank = { complained: 0, bounced: 1, healthy: 2 };
    students.sort((a, b) => {
      const statusDiff = statusRank[a.status] - statusRank[b.status];
      if (statusDiff !== 0) return statusDiff;
      return b.sent - a.sent;
    });

    // Pagination
    const totalStudentsFiltered = students.length;
    const totalPages = Math.ceil(totalStudentsFiltered / perPage);
    const from = (page - 1) * perPage;
    const paginatedStudents = students.slice(from, from + perPage);

    return NextResponse.json({
      windowDays: fromParam ? 0 : days, // 0 when using custom date range
      dateRange: fromParam ? { from: fromParam, to: toParam } : null,
      generatedAt: new Date().toISOString(),
      summary: {
        totalStudents: allActiveStudents.length,
        totalSent,
        totalDelivered,
        totalOpened,
        totalClicked,
        totalBounced,
        totalComplaints,
        openRate: overallOpenRate,
        clickRate: overallClickRate,
        bounceRate,
        complaintRate,
        bouncedStudents: allActiveStudents.filter((s) => s.status === "bounced").length,
        complainedStudents: allActiveStudents.filter((s) => s.status === "complained").length,
        healthyStudents: allActiveStudents.filter((s) => s.status === "healthy").length,
      },
      students: paginatedStudents,
      pagination: {
        page,
        perPage,
        totalStudents: totalStudentsFiltered,
        totalPages,
      },
    });
  } catch (err) {
    console.error("[admin/students/email-health] failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
