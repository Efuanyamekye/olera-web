import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import { calculateCompleteness } from "@/lib/medjobs-completeness";
import type { StudentMetadata } from "@/lib/types";

// Completeness threshold - profiles at or above this are considered complete
const COMPLETENESS_THRESHOLD = 80;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = ReturnType<typeof getServiceClient>;

interface StudentQueryResult {
  id: string;
  slug: string;
  type: "student";
  display_name: string;
  email: string | null;
  phone: string | null;
  image_url: string | null;
  city: string | null;
  state: string | null;
  metadata: StudentMetadata | null;
  account_id: string | null;
  claim_state: string;
  verification_state: string;
  source: string;
  is_active: boolean;
  created_at: string;
}

/**
 * Calculate profile completeness for a student.
 * Uses comprehensive section-based calculation from medjobs-completeness.
 */
function computeProfileCompleteness(row: StudentQueryResult): number {
  const studentMeta = (row.metadata || {}) as StudentMetadata;
  const hasPhoto = !!row.image_url;
  const hasBasicInfo = {
    hasName: !!row.display_name,
    hasUniversity: !!studentMeta.university,
    hasLocation: !!(row.city && row.state),
  };
  return calculateCompleteness(studentMeta, hasPhoto, hasBasicInfo);
}

/**
 * Fetch all student profiles in batches (handles >1000 rows).
 * Used when client-side filtering requires full dataset.
 */
async function fetchAllStudents(
  db: DB,
  activeOnly: boolean,
  pausedOnly: boolean,
  cityFilter: string
): Promise<StudentQueryResult[]> {
  const PAGE_SIZE = 1000;
  const allStudents: StudentQueryResult[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    let query = db
      .from("business_profiles")
      .select(
        "id, slug, type, display_name, email, phone, image_url, city, state, metadata, account_id, claim_state, verification_state, source, is_active, created_at"
      )
      .eq("type", "student")
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (activeOnly) {
      query = query.eq("is_active", true);
    } else if (pausedOnly) {
      query = query.eq("is_active", false);
    }

    if (cityFilter === "__null__") {
      query = query.is("city", null);
    } else if (cityFilter) {
      query = query.eq("city", cityFilter);
    }

    const { data, error } = await query;

    if (error) {
      console.error("fetchAllStudents error:", error);
      break;
    }

    if (data && data.length > 0) {
      allStudents.push(...(data as StudentQueryResult[]));
      offset += PAGE_SIZE;
      hasMore = data.length === PAGE_SIZE;
    } else {
      hasMore = false;
    }
  }

  return allStudents;
}

/**
 * Check if a student matches the search term.
 * Searches name, email, phone, and university.
 */
function matchesSearch(student: StudentQueryResult, search: string): boolean {
  const term = search.toLowerCase();
  const meta = (student.metadata || {}) as StudentMetadata;

  return (
    (student.display_name?.toLowerCase().includes(term) ?? false) ||
    (student.email?.toLowerCase().includes(term) ?? false) ||
    (student.phone?.toLowerCase().includes(term) ?? false) ||
    (meta.university?.toLowerCase().includes(term) ?? false)
  );
}

/**
 * GET /api/admin/caregivers
 *
 * List student profiles with search, filters, and pagination.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const adminUser = await getAdminUser(user.id);
    if (!adminUser) return NextResponse.json({ error: "Access denied" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim() || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const perPage = Math.min(100, Math.max(1, parseInt(searchParams.get("per_page") || "50", 10)));
    const activeOnly = searchParams.get("active_only") === "true";
    const pausedOnly = searchParams.get("paused_only") === "true";
    const notLiveOnly = searchParams.get("not_live_only") === "true";
    const completeOnly = searchParams.get("complete_only") === "true";
    const incompleteOnly = searchParams.get("incomplete_only") === "true";
    const cityFilter = searchParams.get("city")?.trim() || "";

    const db = getServiceClient();

    // Client-side filtering needed when:
    // - Filtering by completeness (requires calculation from metadata)
    // - Filtering by paused/not_live (requires checking application_completed in metadata)
    // - Searching (to include university from JSONB metadata)
    const needsClientSideFilter = completeOnly || incompleteOnly || pausedOnly || notLiveOnly || !!search;

    let data: StudentQueryResult[] | null;
    let count: number | null;
    let error: Error | null = null;

    if (!needsClientSideFilter) {
      // Standard DB pagination - no search or completeness filters
      let query = db
        .from("business_profiles")
        .select(
          "id, slug, type, display_name, email, phone, image_url, city, state, metadata, account_id, claim_state, verification_state, source, is_active, created_at",
          { count: "exact" }
        )
        .eq("type", "student")
        .order("created_at", { ascending: false });

      if (activeOnly) {
        query = query.eq("is_active", true);
      } else if (pausedOnly) {
        query = query.eq("is_active", false);
      }

      if (cityFilter === "__null__") {
        query = query.is("city", null);
      } else if (cityFilter) {
        query = query.eq("city", cityFilter);
      }

      const from = (page - 1) * perPage;
      const to = from + perPage - 1;
      query = query.range(from, to);

      const result = await query;
      data = result.data as StudentQueryResult[] | null;
      count = result.count;
      error = result.error;
    } else {
      // Fetch ALL data for client-side filtering
      // When filtering by paused/notLive, we need inactive profiles, so don't pass pausedOnly to DB
      const dbActiveOnly = activeOnly;
      const dbInactiveOnly = pausedOnly || notLiveOnly;
      data = await fetchAllStudents(db, dbActiveOnly, dbInactiveOnly, cityFilter);
      count = data.length;
    }

    if (error) {
      console.error("Admin students list error:", error);
      return NextResponse.json({ error: `Failed to fetch students: ${error.message}` }, { status: 500 });
    }

    // Transform data with computed fields - calculate completeness on-the-fly
    let students = (data ?? []).map((row: StudentQueryResult) => {
      const meta = (row.metadata || {}) as StudentMetadata & { application_completed?: boolean };
      const university = meta.university ?? null;
      const completeness = computeProfileCompleteness(row);
      const applicationCompleted = !!meta.application_completed;

      return {
        ...row,
        profile_completeness: completeness,
        university,
        application_completed: applicationCompleted,
      };
    });

    // Apply client-side filters
    if (search) {
      students = students.filter((s) => matchesSearch(s, search));
    }

    if (completeOnly) {
      students = students.filter((s) => s.profile_completeness >= COMPLETENESS_THRESHOLD);
    } else if (incompleteOnly) {
      students = students.filter((s) => s.profile_completeness < COMPLETENESS_THRESHOLD);
    }

    // Filter by lifecycle status (paused vs not live)
    // Paused = was live, then deactivated (is_active=false AND application_completed=true)
    // Not Live = never went live (is_active=false AND application_completed is falsy)
    if (pausedOnly) {
      students = students.filter((s) => !s.is_active && s.application_completed);
    } else if (notLiveOnly) {
      students = students.filter((s) => !s.is_active && !s.application_completed);
    }

    // Calculate totals and pagination
    let total: number;
    let paginatedStudents: typeof students;

    if (needsClientSideFilter) {
      // For client-side filtered data, paginate the filtered results
      total = students.length;
      const from = (page - 1) * perPage;
      paginatedStudents = students.slice(from, from + perPage);
    } else {
      // For DB-paginated data, use the DB count
      total = count ?? 0;
      paginatedStudents = students;
    }

    const totalPages = Math.ceil(total / perPage);

    return NextResponse.json({
      students: paginatedStudents,
      total,
      page,
      per_page: perPage,
      total_pages: totalPages,
    });
  } catch (err) {
    console.error("Admin students list error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
