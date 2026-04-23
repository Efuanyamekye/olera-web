import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/admin";
import { sendSlackAlert, slackQuestionAnswered } from "@/lib/slack";
import { sendEmail } from "@/lib/email";
import { questionAnsweredEmail } from "@/lib/email-templates";

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

    // Use service client to bypass RLS for question lookups
    const db = getServiceClient();

    // Build list of possible provider_id values (questions may be stored with slug, source_provider_id, or UUID)
    // Also check the olera-providers slug — the detail page may use the iOS slug when storing questions
    const providerIdVariants = [profile.slug, profile.id];
    if (profile.source_provider_id) {
      providerIdVariants.push(profile.source_provider_id);
      const { data: iosProvider } = await db
        .from("olera-providers")
        .select("slug")
        .eq("provider_id", profile.source_provider_id)
        .single();
      if (iosProvider?.slug && !providerIdVariants.includes(iosProvider.slug)) {
        providerIdVariants.push(iosProvider.slug);
      }
    }

    // Build query - match any of the possible provider_id formats
    // Include metadata for read tracking, answer_status for verification gating
    let query = db
      .from("provider_questions")
      .select("id, question, answer, asker_name, asker_email, status, is_public, answer_status, answered_at, created_at, updated_at, metadata")
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
      .select("id, slug, display_name, source_provider_id, verification_state")
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
      .select("id, provider_id, question, answer, asker_name, asker_email")
      .eq("id", id)
      .single();

    if (questionError || !question) {
      console.error("Question lookup error:", questionError);
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }

    // Check if question's provider_id matches any of our possible identifiers (slug, UUID, source_provider_id, or iOS slug)
    const providerIdVariants = [profile.slug, profile.id];
    if (profile.source_provider_id) {
      providerIdVariants.push(profile.source_provider_id);
      const { data: iosProvider } = await db
        .from("olera-providers")
        .select("slug")
        .eq("provider_id", profile.source_provider_id)
        .single();
      if (iosProvider?.slug && !providerIdVariants.includes(iosProvider.slug)) {
        providerIdVariants.push(iosProvider.slug);
      }
    }

    if (!providerIdVariants.includes(question.provider_id)) {
      console.error("Provider mismatch:", { questionProviderId: question.provider_id, providerIdVariants });
      return NextResponse.json({ error: "Not authorized to answer this question" }, { status: 403 });
    }

    // Check provider's verification state
    // Verified or not_required = instant publish
    // Otherwise = pending (saved but not visible until verified)
    const verificationState = profile.verification_state as string | null;
    const isVerified = verificationState === "verified" || verificationState === "not_required";
    const answerStatus = isVerified ? "published" : "pending";

    // Update the question with the answer
    const { data: updated, error: updateError } = await db
      .from("provider_questions")
      .update({
        answer: answer.trim(),
        answered_at: new Date().toISOString(),
        answered_by: profile.id,
        status: "answered",
        is_public: isVerified, // Only visible if verified
        answer_status: answerStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id, question, answer, asker_name, status, is_public, answer_status, answered_at, created_at")
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

    // Only notify on first answer that's published — not for pending or edits
    const isFirstAnswer = !question.answer;
    const shouldNotify = isFirstAnswer && isVerified;

    if (shouldNotify) {
      const providerName = profile.display_name || "A provider";

      // Slack notification (fire-and-forget)
      const slack = slackQuestionAnswered({
        providerName,
        providerSlug: profile.slug,
        askerName: question.asker_name || "Someone",
        question: question.question || "",
        answer: answer.trim(),
      });
      sendSlackAlert(slack.text, slack.blocks).catch(() => {});

      // Email the asker that their question was answered (fire-and-forget)
      if (question.asker_email) {
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
        sendEmail({
          to: question.asker_email,
          subject: `${providerName} answered your question on Olera`,
          html: questionAnsweredEmail({
            askerName: question.asker_name || "there",
            providerName,
            question: question.question || "",
            answer: answer.trim(),
            providerUrl: `${siteUrl}/provider/${profile.slug}`,
          }),
          emailType: "question_answered",
          recipientType: "family",
          providerId: profile.slug,
        }).catch((err: unknown) => {
          console.error("Answer notification email failed:", err);
        });
      }
    }

    return NextResponse.json({
      question: updated,
      // Include flags for UI to show appropriate messaging
      isVerified,
      answerStatus,
    });
  } catch (err) {
    console.error("Provider questions PATCH error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
