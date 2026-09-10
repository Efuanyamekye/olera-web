import { NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import { calculateCompleteness } from "@/lib/medjobs-completeness";
import type { StudentMetadata } from "@/lib/types";

// Must match the threshold in the main route
const INCOMPLETE_THRESHOLD = 80;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = ReturnType<typeof getServiceClient>;

interface StudentProfile {
  id: string;
  display_name: string;
  image_url: string | null;
  city: string | null;
  state: string | null;
  is_active: boolean;
  metadata: StudentMetadata | null;
}

/**
 * Fetch all student profiles to calculate completeness counts.
 */
async function fetchAllStudents(db: DB): Promise<StudentProfile[]> {
  const PAGE_SIZE = 1000;
  const allProfiles: StudentProfile[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await db
      .from("business_profiles")
      .select("id, display_name, image_url, city, state, is_active, metadata")
      .eq("type", "student")
      .range(offset, offset + PAGE_SIZE - 1);

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
export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const adminUser = await getAdminUser(user.id);
    if (!adminUser) return NextResponse.json({ error: "Access denied" }, { status: 403 });

    const db = getServiceClient();

    // Run count query for thisWeek and fetch all students for other counts
    const [thisWeekRes, allStudents] = await Promise.all([
      // New this week
      db
        .from("business_profiles")
        .select("id", { count: "exact", head: true })
        .eq("type", "student")
        .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),

      // Fetch all for all counts (need metadata for application_completed)
      fetchAllStudents(db),
    ]);

    if (thisWeekRes.error) console.error("Stats thisWeek query error:", thisWeekRes.error);

    // Count all states by iterating through profiles
    let activeCount = 0;
    let pausedCount = 0;     // is_active=false AND application_completed=true
    let notLiveCount = 0;    // is_active=false AND application_completed is falsy
    let completeCount = 0;
    let incompleteCount = 0;

    for (const profile of allStudents) {
      const meta = (profile.metadata || {}) as StudentMetadata & { application_completed?: boolean };
      const completeness = computeProfileCompleteness(profile);

      // Completeness counts
      if (completeness >= INCOMPLETE_THRESHOLD) {
        completeCount++;
      } else {
        incompleteCount++;
      }

      // Lifecycle state counts
      if (profile.is_active) {
        activeCount++;
      } else if (meta.application_completed) {
        // Was live, now paused
        pausedCount++;
      } else {
        // Never went live
        notLiveCount++;
      }
    }

    const total = allStudents.length;

    return NextResponse.json({
      total,
      active: activeCount,
      paused: pausedCount,
      notLive: notLiveCount,
      complete: completeCount,
      incomplete: incompleteCount,
      thisWeek: thisWeekRes.count ?? 0,
      students: total, // For backwards compatibility
    });
  } catch (err) {
    console.error("Admin students stats error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
