import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import { calculateCompleteness } from "@/lib/medjobs-completeness";
import type { StudentMetadata } from "@/lib/types";

// Must match the threshold in the main route
const INCOMPLETE_THRESHOLD = 100;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = ReturnType<typeof getServiceClient>;

interface StudentProfile {
  id: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  image_url: string | null;
  city: string | null;
  state: string | null;
  is_active: boolean;
  created_at: string;
  metadata: StudentMetadata | null;
}

/**
 * Fetch all student profiles to calculate completeness counts.
 */
async function fetchAllStudents(
  db: DB,
  fromDate: string,
  toDate: string
): Promise<StudentProfile[]> {
  const PAGE_SIZE = 1000;
  const allProfiles: StudentProfile[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    let query = db
      .from("business_profiles")
      .select("id, display_name, email, phone, image_url, city, state, is_active, created_at, metadata")
      .eq("type", "student")
      .range(offset, offset + PAGE_SIZE - 1);

    // Date range filter
    if (fromDate) {
      query = query.gte("created_at", fromDate);
    }
    if (toDate) {
      query = query.lte("created_at", toDate);
    }

    const { data, error } = await query;

    if (error) {
      console.error("fetchAllStudents error:", error);
      break;
    }

    if (data && data.length > 0) {
      allProfiles.push(...(data as StudentProfile[]));
      offset += PAGE_SIZE;
      hasMore = data.length === PAGE_SIZE;
    } else {
      hasMore = false;
    }
  }

  return allProfiles;
}

/**
 * Calculate profile completeness for a student.
 */
function computeProfileCompleteness(profile: StudentProfile): number {
  const studentMeta = (profile.metadata || {}) as StudentMetadata;
  const hasPhoto = !!profile.image_url;
  const hasBasicInfo = {
    hasName: !!profile.display_name,
    hasEmail: !!profile.email,
    hasPhone: !!profile.phone,
    hasUniversity: !!studentMeta.university,
    hasLocation: !!(profile.city && profile.state),
  };
  return calculateCompleteness(studentMeta, hasPhoto, hasBasicInfo);
}

/**
 * GET /api/admin/caregivers/stats
 *
 * Returns counts for student filter tabs.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const adminUser = await getAdminUser(user.id);
    if (!adminUser) return NextResponse.json({ error: "Access denied" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const fromDate = searchParams.get("from_date")?.trim() || "";
    const toDate = searchParams.get("to_date")?.trim() || "";

    const db = getServiceClient();

    // Fetch all students for counts (need metadata for application_completed)
    const allStudents = await fetchAllStudents(db, fromDate, toDate);

    // Fetch students with confirmed interviews (mutual agreement only)
    // "confirmed" = both parties agreed, "completed" = interview happened
    // Excludes "proposed" (pending request not yet accepted by student)
    const { data: studentsWithInterviews } = await db
      .from("interviews")
      .select("student_profile_id")
      .in("status", ["confirmed", "completed"])
      .not("student_profile_id", "is", null);

    const studentIdsWithInterviews = new Set(
      (studentsWithInterviews || []).map((i) => i.student_profile_id)
    );

    // Cutoff for "this week" calculation
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Count all states by iterating through all student profiles
    let activeCount = 0;
    let pausedCount = 0;        // is_active=false AND application_completed=true
    let notLiveCount = 0;       // is_active=false AND application_completed is falsy AND no pending review
    let pendingReviewCount = 0; // review_requested_at AND !application_completed
    let approvedCount = 0;      // has approved_at set
    let rejectedCount = 0;      // has rejected_at but no approved_at
    let completeCount = 0;
    let incompleteCount = 0;

    for (const profile of allStudents) {
      const meta = (profile.metadata || {}) as StudentMetadata & {
        application_completed?: boolean;
        review_requested_at?: string;
        approved_at?: string;
        rejected_at?: string;
      };
      const completeness = computeProfileCompleteness(profile);

      // Completeness counts
      if (completeness >= INCOMPLETE_THRESHOLD) {
        completeCount++;
      } else {
        incompleteCount++;
      }

      // Lifecycle state counts - application_completed is the approval flag
      // A student is only "Live" if both approved AND active
      if (meta.application_completed && profile.is_active) {
        // Approved and active = visible to providers
        activeCount++;
      } else if (meta.application_completed && !profile.is_active) {
        // Approved but paused by student
        pausedCount++;
      } else if (meta.review_requested_at || completeness >= INCOMPLETE_THRESHOLD) {
        // Ready for admin review: either explicitly requested OR 100% complete
        pendingReviewCount++;
      } else {
        // Incomplete and no review request
        notLiveCount++;
      }

      // Approved/Rejected counts (these are independent of the above)
      // Approved = application_completed is the source of truth (approved_at is audit trail, may not exist for legacy data)
      if (meta.application_completed) {
        approvedCount++;
      }
      // Rejected = has rejected_at AND is not currently approved
      // Using application_completed (not approved_at) so that revoked-then-rejected students appear here
      if (meta.rejected_at && !meta.application_completed) {
        rejectedCount++;
      }
    }

    const total = allStudents.length;

    // Count students created this week
    const thisWeekCount = allStudents.filter((p) => p.created_at >= oneWeekAgo).length;

    // Count students with pending interviews
    const hasInterviewsCount = allStudents.filter((p) => studentIdsWithInterviews.has(p.id)).length;

    return NextResponse.json({
      total,
      live: activeCount, // Renamed for clarity (is_active = true)
      active: activeCount, // Keep for backwards compatibility
      paused: pausedCount,
      notLive: notLiveCount,
      pendingReview: pendingReviewCount,
      approved: approvedCount,
      rejected: rejectedCount,
      hasInterviews: hasInterviewsCount,
      complete: completeCount,
      incomplete: incompleteCount,
      thisWeek: thisWeekCount,
      students: total, // For backwards compatibility
    });
  } catch (err) {
    console.error("Admin students stats error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
