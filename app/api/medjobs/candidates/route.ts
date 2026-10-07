import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { resolveCampusUniversity } from "@/lib/medjobs/campus-university-bridge";

// Lazy initialization to avoid build-time errors when env vars are not available
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function getAuthenticatedProvider(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const supabaseAdmin = getSupabaseAdmin();

  // Check if user has a provider profile
  const { data: account } = await supabaseAdmin
    .from("accounts")
    .select("id, active_profile_id")
    .eq("user_id", user.id)
    .single();

  if (!account) return null;

  const { data: profiles } = await supabaseAdmin
    .from("business_profiles")
    .select("id, type, display_name, metadata, verification_state")
    .eq("account_id", account.id)
    .in("type", ["organization", "caregiver"]);

  const providerProfile = profiles?.[0];
  if (!providerProfile) return null;

  return { user, account, providerProfile };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(0, parseInt(searchParams.get("page") || "0"));
    // Allow loadAll=true to bypass the 50 limit (for client-side filtering like Find Families)
    const loadAll = searchParams.get("loadAll") === "true";
    const pageSize = loadAll
      ? 1000  // Large enough for all candidates
      : Math.min(50, Math.max(1, parseInt(searchParams.get("pageSize") || "12")));
    const state = searchParams.get("state");
    const city = searchParams.get("city");
    const campus = searchParams.get("campus");
    const programTrack = searchParams.get("programTrack");
    const search = searchParams.get("search");
    const sort = searchParams.get("sort") || "newest";

    // New filters
    const certifications = searchParams.get("certifications")?.split(",").filter(Boolean) || [];
    const availability = searchParams.get("availability")?.split(",").filter(Boolean) || [];
    const hoursPerWeek = searchParams.get("hoursPerWeek");
    const languages = searchParams.get("languages")?.split(",").filter(Boolean) || [];
    const hasVideo = searchParams.get("hasVideo") === "true";

    // Check if authenticated provider
    const auth = await getAuthenticatedProvider(req);
    const isProvider = !!auth?.providerProfile;

    const supabaseAdmin = getSupabaseAdmin();

    // Build query
    // Note: We include ALL approved students regardless of is_active status.
    // Students who toggled off (is_active=false) still appear but show "Not Available" badge.
    // Only admin revocation (application_completed=false) removes them from the board.
    let query = supabaseAdmin
      .from("business_profiles")
      .select(
        "id, slug, display_name, city, state, zip, lat, lng, description, care_types, metadata, image_url, created_at, updated_at, is_active" +
        (isProvider ? ", email, phone" : ""),
        { count: "estimated" }
      )
      .eq("type", "student")
      .contains("metadata", { application_completed: true });

    // University filter. The board's University dropdown sends universityId
    // directly (the medjobs_universities id students store). The magic-link
    // landing also resolves the provider's campus → universityId. Legacy
    // ?campus=<slug> is still resolved (bridge handles registry slug-drift).
    // Also looks up university name to match students who have metadata.university
    // but not metadata.university_id.
    const universityId = searchParams.get("universityId");
    if (universityId) {
      // Look up the university name for fallback matching
      const { data: uniData } = await supabaseAdmin
        .from("medjobs_universities")
        .select("name")
        .eq("id", universityId)
        .single();
      const universityName = uniData?.name;

      if (universityName) {
        // Match by university_id OR university name (for students without university_id)
        query = query.or(`metadata->>university_id.eq.${universityId},metadata->>university.eq.${universityName}`);
      } else {
        // Fallback to just university_id if we can't find the name
        query = query.filter("metadata->>university_id", "eq", universityId);
      }
    } else if (campus) {
      const { university_id } = await resolveCampusUniversity(supabaseAdmin, campus);
      if (university_id) {
        query = query.filter("metadata->>university_id", "eq", university_id);
      }
    }

    // Filters
    if (state) {
      query = query.eq("state", state);
    }
    if (city) {
      query = query.ilike("city", `%${city}%`);
    }
    if (search) {
      query = query.ilike("display_name", `%${search}%`);
    }

    // Sort
    switch (sort) {
      case "oldest":
        query = query.order("created_at", { ascending: true });
        break;
      case "newest":
      default:
        query = query.order("created_at", { ascending: false });
        break;
    }

    // Pagination
    query = query.range(page * pageSize, (page + 1) * pageSize - 1);

    const { data, count, error } = await query;

    if (error) {
      console.error("[medjobs/candidates] query error:", error);
      return NextResponse.json({ error: "Failed to fetch candidates" }, { status: 500 });
    }

    // Client-side filter for metadata fields (JSONB — not queryable server-side)
    let candidates = data || [];

    // Filter by program track
    if (programTrack) {
      // Map legacy program_track values to intended_professional_school equivalents
      const legacyMap: Record<string, string> = {
        pre_med: "medicine", pre_nursing: "nursing", nursing: "nursing",
        pre_pa: "pa", pre_health: "public_health",
      };
      candidates = candidates.filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (c: any) => {
          const meta = c.metadata || {};
          if (meta.intended_professional_school === programTrack) return true;
          if (meta.program_track && legacyMap[meta.program_track] === programTrack) return true;
          return false;
        }
      );
    }

    // Filter by certifications (must have ALL selected certifications)
    if (certifications.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      candidates = candidates.filter((c: any) => {
        const meta = c.metadata || {};
        const candidateCerts = meta.certifications || [];
        return certifications.every((cert) => candidateCerts.includes(cert));
      });
    }

    // Filter by availability (must have ANY selected availability type)
    if (availability.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      candidates = candidates.filter((c: any) => {
        const meta = c.metadata || {};
        const candidateAvail = meta.availability_types || [];
        // Also check legacy availability_type
        const legacyAvail = meta.availability_type || "";
        return availability.some(
          (avail) => candidateAvail.includes(avail) || legacyAvail === avail
        );
      });
    }

    // Filter by hours per week
    if (hoursPerWeek) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      candidates = candidates.filter((c: any) => {
        const meta = c.metadata || {};
        // Check new hours_per_week_range field
        if (meta.hours_per_week_range === hoursPerWeek) return true;
        // Fallback: Check legacy hours_per_week numeric field
        const hours = meta.hours_per_week;
        if (typeof hours === "number") {
          if (hoursPerWeek === "5-10" && hours >= 5 && hours <= 10) return true;
          if (hoursPerWeek === "10-15" && hours > 10 && hours <= 15) return true;
          if (hoursPerWeek === "15-20" && hours > 15 && hours <= 20) return true;
          if (hoursPerWeek === "20+" && hours > 20) return true;
        }
        return false;
      });
    }

    // Filter by languages (must speak ANY selected language)
    if (languages.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      candidates = candidates.filter((c: any) => {
        const meta = c.metadata || {};
        const candidateLangs = meta.languages || [];
        return languages.some((lang) => candidateLangs.includes(lang));
      });
    }

    // Filter by has video
    if (hasVideo) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      candidates = candidates.filter((c: any) => {
        const meta = c.metadata || {};
        return !!meta.video_intro_url;
      });
    }

    // Phase A: any signed-in provider sees full profiles + contact. Only
    // anonymous viewers are limited (student-PII privacy). The old pilot/
    // verified blurring is removed; the de-platforming moat is now the
    // student's on-platform credential + platform Terms. See
    // PROVIDER_FUNNEL_BUILD_PLAN.md.
    const canViewFullProfiles = isProvider;
    const canSeeContact = isProvider;

    if (!canViewFullProfiles || !canSeeContact) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      candidates = candidates.map((c: any) => {
        const next = { ...c };
        if (!canViewFullProfiles) {
          // Preview: truncate to "First L." to prevent name-lookup bypass.
          const parts = String(c.display_name || "").trim().split(/\s+/);
          next.display_name =
            parts.length <= 1
              ? parts[0] || ""
              : `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;
        }
        if (!canSeeContact) {
          next.email = undefined;
          next.phone = undefined;
          next.metadata = {
            ...c.metadata,
            resume_url: undefined,
          };
        }
        return next;
      });
    }

    // When metadata filters are applied, the total must reflect filtered count
    // Note: This is approximate for pagination since we only filter the current page
    const hasMetadataFilters =
      programTrack ||
      certifications.length > 0 ||
      availability.length > 0 ||
      hoursPerWeek ||
      languages.length > 0 ||
      hasVideo;

    // If metadata filters are active, return filtered count (current page only)
    // Otherwise return the DB count
    const effectiveTotal = hasMetadataFilters ? candidates.length : (count || 0);

    // Enrich candidates with placement status for the authenticated provider
    // This allows the UI to show "Already Hired" instead of "Schedule Interview"
    if (auth?.providerProfile?.id && candidates.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const candidateIds = (candidates as any[]).map((c) => c.id);
      const { data: placements } = await supabaseAdmin
        .from("medjobs_placements")
        .select("student_profile_id, status")
        .eq("provider_profile_id", auth.providerProfile.id)
        .in("student_profile_id", candidateIds)
        .in("status", ["offered", "accepted", "confirmed"]);

      if (placements && placements.length > 0) {
        const placementMap = new Map(
          placements.map((p) => [p.student_profile_id, p.status])
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        candidates = (candidates as any[]).map((c) => ({
          ...c,
          placementStatus: placementMap.get(c.id) || null,
        }));
      }
    }

    return NextResponse.json({
      candidates,
      total: effectiveTotal,
      page,
      pageSize,
      isProvider,
    });
  } catch (err) {
    console.error("[medjobs/candidates] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
