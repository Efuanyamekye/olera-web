import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/admin";
import { activeProviderProfile } from "@/lib/providers/active-profile.server";

/**
 * POST /api/provider/questions/mark-read
 *
 * Mark a question as read by the current provider's profile.
 * Stores read timestamp in metadata.read_by[profileId].
 *
 * Body: { questionId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { questionId } = body;

    if (!questionId) {
      return NextResponse.json(
        { error: "questionId is required" },
        { status: 400 }
      );
    }

    const db = getServiceClient();

    // Get user's account
    const { data: account } = await db
      .from("accounts")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Get user's provider profile
    const { data: profile } = await activeProviderProfile(db, account.id, "id, slug, source_provider_id");

    if (!profile) {
      return NextResponse.json(
        { error: "No provider profile found" },
        { status: 404 }
      );
    }

    // Fetch the question
    const { data: question, error: fetchError } = await db
      .from("provider_questions")
      .select("id, provider_id, metadata, canonical_question_id")
      .eq("id", questionId)
      .single();

    if (fetchError || !question) {
      return NextResponse.json(
        { error: "Question not found" },
        { status: 404 }
      );
    }

    let targetQuestion = question;
    if (question.canonical_question_id) {
      const { data: canonicalQuestion, error: canonicalError } = await db
        .from("provider_questions")
        .select("id, provider_id, metadata, canonical_question_id")
        .eq("id", question.canonical_question_id)
        .single();

      if (canonicalError || !canonicalQuestion) {
        return NextResponse.json({ error: "Question not found" }, { status: 404 });
      }
      targetQuestion = canonicalQuestion;
    }

    // Verify provider owns this question
    const providerIdVariants = [profile.slug, profile.id];
    if (profile.source_provider_id) {
      providerIdVariants.push(profile.source_provider_id);
    }

    if (
      !providerIdVariants.includes(question.provider_id) ||
      !providerIdVariants.includes(targetQuestion.provider_id)
    ) {
      return NextResponse.json(
        { error: "Not authorized to mark this question as read" },
        { status: 403 }
      );
    }

    // Update metadata.read_by
    const existingMeta =
      (targetQuestion.metadata as Record<string, unknown>) || {};
    const existingReadBy =
      (existingMeta.read_by as Record<string, string>) || {};

    const updatedReadBy = {
      ...existingReadBy,
      [profile.id]: new Date().toISOString(),
    };

    const { error: updateError } = await db
      .from("provider_questions")
      .update({
        metadata: { ...existingMeta, read_by: updatedReadBy },
      })
      .eq("id", targetQuestion.id);

    if (updateError) {
      console.error("[questions/mark-read] Update error:", updateError);
      return NextResponse.json(
        { error: "Failed to mark as read" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, profileId: profile.id });
  } catch (err) {
    console.error("[questions/mark-read] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
