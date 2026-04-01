import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

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
    .select("id, type, display_name")
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
    const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get("pageSize") || "12")));
    const state = searchParams.get("state");
    const city = searchParams.get("city");
    const programTrack = searchParams.get("programTrack");
    const search = searchParams.get("search");
    const sort = searchParams.get("sort") || "newest";

    // Check if authenticated provider
    const auth = await getAuthenticatedProvider(req);
    const isProvider = !!auth?.providerProfile;

    const supabaseAdmin = getSupabaseAdmin();

    // Build query
    let query = supabaseAdmin
      .from("business_profiles")
      .select(
        "id, slug, display_name, city, state, zip, lat, lng, description, care_types, metadata, image_url, created_at" +
        (isProvider ? ", email, phone" : ""),
        { count: "estimated" }
      )
      .eq("type", "student")
      .eq("is_active", true)
      .contains("metadata", { application_completed: true });

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

    // Redact contact info for non-providers
    if (!isProvider) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      candidates = candidates.map((c: any) => ({
        ...c,
        email: undefined,
        phone: undefined,
        metadata: {
          ...c.metadata,
          resume_url: undefined,
          video_intro_url: undefined,
          linkedin_url: undefined,
        },
      }));
    }

    return NextResponse.json({
      candidates,
      total: count || 0,
      page,
      pageSize,
      isProvider,
    });
  } catch (err) {
    console.error("[medjobs/candidates] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
