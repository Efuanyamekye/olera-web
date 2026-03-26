import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/admin";

/**
 * GET /api/provider/questions
 *
 * Fetch questions for the authenticated provider's profile.
 * Query params: ?status=pending|answered|all (default: all)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    // Get the user's provider profile
    const { data: account } = await supabase
      .from("accounts")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!account) {
      return NextResponse.json({ error: "No account found" }, { status: 400 });
    }

    const { data: profile } = await supabase
      .from("business_profiles")
      .select("id, slug, source_provider_id")
      .eq("account_id", account.id)
      .in("type", ["organization", "caregiver"])
      .single();

    if (!profile?.slug) {
      return NextResponse.json({ error: "No provider profile found" }, { status: 400 });
    }

    // Parse status filter
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "all";

    // Build list of possible provider_id values (questions may be stored with slug, source_provider_id, or UUID)
    const providerIdVariants = [profile.slug, profile.id];
    if (profile.source_provider_id) {
      providerIdVariants.push(profile.source_provider_id);
    }

    // Use service client to bypass RLS for question lookups
    const db = getServiceClient();

    // Build query - match any of the possible provider_id formats
    // Include metadata for read tracking
    let query = db
      .from("provider_questions")
      .select("id, question, answer, asker_name, asker_email, status, is_public, answered_at, created_at, updated_at, metadata")
      .in("provider_id", providerIdVariants)
      .order("created_at", { ascending: false });

    // Apply status filter
    if (status === "pending") {
      query = query.eq("status", "pending");
    } else if (status === "answered") {
      query = query.eq("status", "answered");
    }
    // "all" returns everything

    const { data: questions, error } = await query;

    if (error) {
      console.error("Failed to fetch provider questions:", error);
      return NextResponse.json({ error: "Failed to fetch questions" }, { status: 500 });
    }

    return NextResponse.json({
      questions: questions ?? [],
      providerSlug: profile.slug,
      profileId: profile.id,
    });
  } catch (err) {
    console.error("Provider questions GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/provider/questions
 *
 * Answer a question. Only the provider can answer questions about their profile.
 * Body: { id: string, answer: string }
 *
 * Sets: answer, answered_at, answered_by, status='answered', is_public=true
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const { id, answer } = body as { id?: string; answer?: string };

    if (!id || !answer?.trim()) {
      return NextResponse.json({ error: "id and answer are required" }, { status: 400 });
    }

    if (answer.length > 2000) {
      return NextResponse.json({ error: "Answer must be under 2000 characters" }, { status: 400 });
    }

    // Get the user's provider profile
    const { data: account } = await supabase
      .from("accounts")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!account) {
      return NextResponse.json({ error: "No account found" }, { status: 400 });
    }

    const { data: profile } = await supabase
      .from("business_profiles")
      .select("id, slug, source_provider_id")
      .eq("account_id", account.id)
      .in("type", ["organization", "caregiver"])
      .single();

    if (!profile?.slug) {
      return NextResponse.json({ error: "No provider profile found" }, { status: 400 });
    }

    // Use service client for database operations (bypasses RLS)
    const db = getServiceClient();

    // Verify the question belongs to this provider
    const { data: question, error: questionError } = await db
      .from("provider_questions")
      .select("id, provider_id, question, answer, asker_name")
      .eq("id", id)
      .single();

    if (questionError || !question) {
      console.error("Question lookup error:", questionError);
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }

    // Check if question's provider_id matches any of our possible identifiers (slug, UUID, or source_provider_id)
    const providerIdVariants = [profile.slug, profile.id];
    if (profile.source_provider_id) {
      providerIdVariants.push(profile.source_provider_id);
    }

    if (!providerIdVariants.includes(question.provider_id)) {
      console.error("Provider mismatch:", { questionProviderId: question.provider_id, providerIdVariants });
      return NextResponse.json({ error: "Not authorized to answer this question" }, { status: 403 });
    }

    // Update the question with the answer
    const { data: updated, error: updateError } = await db
      .from("provider_questions")
      .update({
        answer: answer.trim(),
        answered_at: new Date().toISOString(),
        answered_by: profile.id,
        status: "answered",
        is_public: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id, question, answer, asker_name, status, is_public, answered_at, created_at")
      .single();

    if (updateError) {
      console.error("Failed to answer question:", updateError);
      return NextResponse.json({ error: `Failed to publish: ${updateError.message}` }, { status: 500 });
    }

    // Log provider-side activity (fire-and-forget)
    db.from("provider_activity").insert({
      provider_id: question.provider_id,
      profile_id: profile.id,
      event_type: "question_responded",
      metadata: {
        question_id: id,
        question_preview: question.question?.substring(0, 100),
        answer_preview: answer.trim().substring(0, 100),
        asker_name: question.asker_name,
      },
    }).then(({ error: actErr }: { error: { message: string } | null }) => {
      if (actErr) console.error("[provider_activity] question_responded insert failed:", actErr);
    });

    return NextResponse.json({ question: updated });
  } catch (err) {
    console.error("Provider questions PATCH error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
