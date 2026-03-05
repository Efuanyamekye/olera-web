import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/admin";

/**
 * GET /api/questions?provider_id=xxx
 *
 * Fetch public questions for a provider (both pending and answered).
 * No auth required — these are public Q&A.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const providerId = searchParams.get("provider_id");

  if (!providerId) {
    return NextResponse.json({ error: "provider_id required" }, { status: 400 });
  }

  try {
    const db = getServiceClient();
    // Fetch both pending and answered questions that are public
    const { data: questions, error } = await db
      .from("provider_questions")
      .select("id, question, answer, asker_name, asker_user_id, status, answered_at, created_at")
      .eq("provider_id", providerId)
      .eq("is_public", true)
      .in("status", ["pending", "approved", "answered"])
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("Failed to fetch questions:", error);
      return NextResponse.json({ error: "Failed to fetch questions" }, { status: 500 });
    }

    return NextResponse.json({ questions: questions ?? [] });
  } catch (err) {
    console.error("Questions GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/questions
 *
 * Submit a question on a provider page.
 * Requires authentication.
 * Body: { provider_id, question }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const { provider_id, question } = body;

    if (!provider_id || !question) {
      return NextResponse.json({ error: "provider_id and question are required" }, { status: 400 });
    }

    if (question.length > 1000) {
      return NextResponse.json({ error: "Question must be under 1000 characters" }, { status: 400 });
    }

    // Get user's display name from profile
    const db = getServiceClient();
    const { data: profile } = await db
      .from("business_profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .single();

    const askerName = profile?.display_name || user.email?.split("@")[0] || "Anonymous";

    const { data: newQuestion, error } = await db
      .from("provider_questions")
      .insert({
        provider_id,
        question: question.trim(),
        asker_name: askerName,
        asker_email: user.email,
        asker_user_id: user.id,
        status: "pending",
        is_public: true, // Show question publicly immediately
      })
      .select("id, question, asker_name, status, created_at")
      .single();

    if (error) {
      console.error("Failed to create question:", error);
      return NextResponse.json({ error: "Failed to submit question" }, { status: 500 });
    }

    return NextResponse.json({ question: newQuestion }, { status: 201 });
  } catch (err) {
    console.error("Questions POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/questions
 *
 * Edit a question (only by the original asker, and only if not yet answered).
 * Body: { id, question }
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const { id, question } = body;

    if (!id || !question) {
      return NextResponse.json({ error: "id and question are required" }, { status: 400 });
    }

    if (question.length > 1000) {
      return NextResponse.json({ error: "Question must be under 1000 characters" }, { status: 400 });
    }

    const db = getServiceClient();

    // Verify ownership and status
    const { data: existing, error: fetchError } = await db
      .from("provider_questions")
      .select("id, asker_user_id, status, answer")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }

    if (existing.asker_user_id !== user.id) {
      return NextResponse.json({ error: "You can only edit your own questions" }, { status: 403 });
    }

    if (existing.status === "answered" || existing.answer) {
      return NextResponse.json({ error: "Cannot edit a question that has been answered" }, { status: 400 });
    }

    // Update the question
    const { data: updated, error: updateError } = await db
      .from("provider_questions")
      .update({ question: question.trim() })
      .eq("id", id)
      .select("id, question, asker_name, asker_user_id, status, created_at")
      .single();

    if (updateError) {
      console.error("Failed to update question:", updateError);
      return NextResponse.json({ error: "Failed to update question" }, { status: 500 });
    }

    return NextResponse.json({ question: updated });
  } catch (err) {
    console.error("Questions PATCH error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
