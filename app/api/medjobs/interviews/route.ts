import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { generateICS } from "@/lib/ics-generator";
import { generateMedJobsNotificationUrl, generateMedJobsStudentInterviewUrl } from "@/lib/claim-tokens";
import { getAccessTier } from "@/lib/medjobs-access";
import { isMedjobsEligible } from "@/lib/medjobs/eligibility";
import { stopEmailSequence } from "@/lib/staffing-outreach/resend-automation";
import { interviewProposedEmail, interviewConfirmedEmail, interviewCancelledEmail, interviewRescheduleSentEmail, interviewCancelledAdminEmail, interviewScheduledConfirmationEmail } from "@/lib/email-templates";
import { studentInterestColdEmail, interviewRequestSentEmail } from "@/lib/medjobs-email-templates";
import { getUniversityBySlug } from "@/lib/staffing-outreach/partner-universities";
import { MEDJOBS_INTERVIEW_OPEN_LOOP } from "@/lib/medjobs/flags";
import { getStudentTimezone } from "@/lib/medjobs/timezone";
import type { InterviewStatus } from "@/lib/types";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * GET /api/medjobs/interviews
 * List interviews for the authenticated user (provider or student).
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = getAdminClient();

    // Find the user's profile IDs
    const { data: account } = await admin.from("accounts").select("id").eq("user_id", user.id).single();
    if (!account) return NextResponse.json({ error: "No account" }, { status: 404 });

    const { data: profiles } = await admin.from("business_profiles").select("id, type").eq("account_id", account.id);
    const profileIds = (profiles || []).map((p) => p.id);

    if (profileIds.length === 0) return NextResponse.json({ interviews: [] });

    // Determine which profiles are providers vs students
    const providerProfileIds = (profiles || [])
      .filter((p: { type: string }) => p.type === "organization" || p.type === "caregiver")
      .map((p: { id: string }) => p.id);
    const studentProfileIds = (profiles || [])
      .filter((p: { type: string }) => p.type === "student")
      .map((p: { id: string }) => p.id);

    // If user has no provider or student profiles, they have no interviews
    if (providerProfileIds.length === 0 && studentProfileIds.length === 0) {
      return NextResponse.json({ interviews: [] });
    }

    // Build the query filter
    // IMPORTANT: Students should NOT see interviews that are pending provider verification
    // Providers should see all their interviews (including pending ones they created)
    const filterParts: string[] = [];
    if (providerProfileIds.length > 0) {
      filterParts.push(`provider_profile_id.in.(${providerProfileIds.join(",")})`);
    }
    if (studentProfileIds.length > 0) {
      filterParts.push(`and(student_profile_id.in.(${studentProfileIds.join(",")}),is_pending_verification.eq.false)`);
    }

    const { data: interviews } = await admin
      .from("interviews")
      .select(`
        *,
        provider:business_profiles!interviews_provider_profile_id_fkey(id, display_name, image_url, city, state, email, phone),
        student:business_profiles!interviews_student_profile_id_fkey(id, slug, display_name, image_url, email, metadata)
      `)
      .or(filterParts.join(","))
      .order("created_at", { ascending: false });

    return NextResponse.json({ interviews: interviews || [] });
  } catch (err) {
    console.error("[medjobs/interviews] GET error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/medjobs/interviews
 * Create a new interview proposal. Supports both directions:
 * - Provider proposes to student: send { studentProfileId, ... }
 * - Student proposes to provider: send { providerProfileId, ... }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const {
      studentProfileId,
      providerProfileId,
      type = "video",
      proposedTime,
      alternativeTime,
      location,
      notes,
      termsAcceptedAt,
      jobDetails,
    } = body;

    if (!proposedTime || (!studentProfileId && !providerProfileId)) {
      return NextResponse.json({ error: "proposedTime and either studentProfileId or providerProfileId are required" }, { status: 400 });
    }

    const admin = getAdminClient();

    // Get the caller's account and profiles
    const { data: account } = await admin.from("accounts").select("id").eq("user_id", user.id).single();
    if (!account) return NextResponse.json({ error: "No account" }, { status: 403 });

    const { data: callerProfiles } = await admin
      .from("business_profiles")
      .select("id, type, display_name, email, metadata")
      .eq("account_id", account.id);

    if (!callerProfiles?.length) {
      return NextResponse.json({ error: "No profile found" }, { status: 403 });
    }

    let resolvedProviderId: string;
    let resolvedStudentId: string;
    let proposedById: string;
    let providerProfile: { id: string; display_name: string; email: string; slug?: string };
    let studentProfile: { id: string; display_name: string; email: string; slug?: string; metadata?: Record<string, unknown> };

    // Track if interview should be held for verification
    let isPendingVerification = false;

    if (studentProfileId) {
      // Provider → Student flow
      const callerProvider = callerProfiles.find((p) => p.type === "organization" || p.type === "caregiver");
      if (!callerProvider) return NextResponse.json({ error: "Provider profile required" }, { status: 403 });

      // Pilot gate (G3): a provider must have an active pilot to invite a
      // student to interview. The UI prompts pilot activation before reaching
      // here; this is server-side enforcement.
      const { data: providerFull } = await admin
        .from("business_profiles")
        .select("metadata, verification_state")
        .eq("id", callerProvider.id)
        .single();
      const providerMeta = (providerFull?.metadata ?? {}) as Record<string, unknown>;
      // MVP open-loop bypasses the eligibility gate (screener) so the scheduling
      // loop runs without friction; otherwise eligibility is required.
      if (!MEDJOBS_INTERVIEW_OPEN_LOOP && !isMedjobsEligible(providerMeta)) {
        return NextResponse.json({ error: "eligibility_required" }, { status: 402 });
      }

      // Terms gate (the real MVP gate): a provider must have accepted the
      // placement Terms before inviting a student. The UI ladder collects this
      // first; enforcing it server-side closes the direct-API hole. 403 so the
      // client doesn't mistake it for the (removed) paywall 402.
      if (!providerMeta["interview_terms_accepted_at"]) {
        return NextResponse.json({ error: "terms_required" }, { status: 403 });
      }

      // Notify the student immediately — no pending-verification hold (MVP).
      isPendingVerification = false;

      const { data: target } = await admin
        .from("business_profiles")
        .select("id, display_name, email, slug, metadata")
        .eq("id", studentProfileId)
        .eq("type", "student")
        .single();
      if (!target) return NextResponse.json({ error: "Student not found" }, { status: 404 });

      resolvedProviderId = callerProvider.id;
      resolvedStudentId = target.id;
      proposedById = callerProvider.id;
      providerProfile = callerProvider as typeof providerProfile;
      studentProfile = target as typeof studentProfile;
    } else {
      // Student → Provider flow
      const callerStudent = callerProfiles.find((p) => p.type === "student");
      if (!callerStudent) return NextResponse.json({ error: "Student profile required" }, { status: 403 });

      const { data: target } = await admin
        .from("business_profiles")
        .select("id, display_name, email, slug")
        .eq("id", providerProfileId)
        .in("type", ["organization", "caregiver"])
        .single();
      if (!target) return NextResponse.json({ error: "Provider not found" }, { status: 404 });

      // De-dup [M6]: a student re-applying to the same provider must not spawn a
      // second interview (and a second cold email to the provider). If a live
      // request already exists, return it idempotently instead of re-creating.
      const { data: existingInterview } = await admin
        .from("interviews")
        .select("id")
        .eq("provider_profile_id", target.id)
        .eq("student_profile_id", callerStudent.id)
        .in("status", ["proposed", "confirmed", "rescheduled"])
        .limit(1)
        .maybeSingle();
      if (existingInterview) {
        return NextResponse.json({ interviewId: existingInterview.id, isPendingVerification: false, deduped: true });
      }

      resolvedProviderId = target.id;
      resolvedStudentId = callerStudent.id;
      proposedById = callerStudent.id;
      providerProfile = target;
      studentProfile = callerStudent as typeof studentProfile;
    }

    // Create the interview with job_details snapshot if provided
    const interviewMetadata = jobDetails ? { job_details: jobDetails } : undefined;
    const { data: interview, error: insertError } = await admin
      .from("interviews")
      .insert({
        provider_profile_id: resolvedProviderId,
        student_profile_id: resolvedStudentId,
        status: "proposed",
        type,
        proposed_time: proposedTime,
        alternative_time: alternativeTime || null,
        location: location || null,
        notes: notes || null,
        proposed_by: proposedById,
        is_pending_verification: isPendingVerification,
        metadata: interviewMetadata,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("[medjobs/interviews] insert error:", insertError);
      return NextResponse.json({ error: "Failed to create interview" }, { status: 500 });
    }

    if (studentProfileId) {
      // Store T&C acceptance timestamp in provider's profile metadata (if provided and not already set)
      if (termsAcceptedAt) {
        const { data: providerMeta } = await admin
          .from("business_profiles")
          .select("metadata, source_provider_id")
          .eq("id", resolvedProviderId)
          .single();

        const existingMeta = (providerMeta?.metadata ?? {}) as Record<string, unknown>;
        // Only update if not already set (first acceptance)
        if (!existingMeta.interview_terms_accepted_at) {
          await admin
            .from("business_profiles")
            .update({
              metadata: {
                ...existingMeta,
                interview_terms_accepted_at: termsAcceptedAt,
              },
              updated_at: new Date().toISOString(),
            })
            .eq("id", resolvedProviderId);
        }

        // Auto-enrollment: Check if this provider is in staffing_outreach and auto-enroll them
        // Look up by provider_id (the olera-providers table ID) via source_provider_id
        // Note: Provider may be in multiple batches (different universities), so we use limit(1)
        // and order by updated_at to get the most recently active outreach record
        const sourceProviderId = providerMeta?.source_provider_id as string | null;
        if (sourceProviderId) {
          // Exclude enrolled and all closed statuses
          const excludedStatuses = ["enrolled", "closed", "bounced", "do_not_contact", "wrong_number"];
          const { data: outreachRows } = await admin
            .from("staffing_outreach")
            .select("id, status, batch_id, sequence_email")
            .eq("provider_id", sourceProviderId)
            .not("status", "in", `(${excludedStatuses.join(",")})`)
            .order("updated_at", { ascending: false })
            .limit(1);
          const outreach = outreachRows?.[0];

          if (outreach) {
            // Update outreach status to enrolled
            await admin
              .from("staffing_outreach")
              .update({
                status: "enrolled",
                updated_at: new Date().toISOString(),
              })
              .eq("id", outreach.id);

            // Stop Resend automation if sequence was active
            if (outreach.sequence_email) {
              try {
                await stopEmailSequence(outreach.sequence_email);
                console.log(`[medjobs/interviews] Stopped Resend sequence for ${outreach.sequence_email}`);
              } catch (e) {
                console.error("[medjobs/interviews] Failed to stop Resend sequence:", e);
                // Non-fatal - enrollment still succeeded
              }
            }

            // Log touchpoint for audit trail
            await admin.from("staffing_touchpoints").insert({
              outreach_id: outreach.id,
              type: "system_enrolled",
              notes: "Auto-enrolled via interview T&C acceptance",
              payload: {
                interview_id: interview.id,
                provider_profile_id: resolvedProviderId,
                enrollment_source: "medjobs_authenticated",
              },
            });

            // Atomic increment of batch enrolled count
            await admin.rpc("increment_batch_enrolled", { p_batch_id: outreach.batch_id });
          }
        }
      }
    }

    // Send notification email to the other party (only if NOT pending verification)
    // If pending verification, email will be sent when provider verifies
    if (!isPendingVerification) {
      try {
        const typeLabel = type === "video" ? "Video" : type === "in_person" ? "In-Person" : "Phone";
        // Use student's university timezone for email formatting
        const studentTimezone = getStudentTimezone(studentProfile.metadata);
        const time = new Date(proposedTime).toLocaleString("en-US", {
          weekday: "long", month: "long", day: "numeric",
          hour: "numeric", minute: "2-digit", timeZoneName: "short",
          timeZone: studentTimezone,
        });
        const formattedAltTime = alternativeTime
          ? new Date(alternativeTime).toLocaleString("en-US", {
              weekday: "long", month: "long", day: "numeric",
              hour: "numeric", minute: "2-digit", timeZoneName: "short",
              timeZone: studentTimezone,
            })
          : null;

        // Email goes to whoever did NOT propose
        const recipientEmail = proposedById === providerProfile.id ? studentProfile.email : providerProfile.email;
        const proposerName = proposedById === providerProfile.id ? providerProfile.display_name : studentProfile.display_name;

        // When sending to provider (Student → Provider flow), use magic link with otk token
        // When sending to student (Provider → Student flow), use direct portal link
        const isProviderRecipient = proposedById !== providerProfile.id;
        let viewUrl: string;
        if (isProviderRecipient) {
          // Provider receives - use magic link if slug available, otherwise original fallback
          viewUrl = providerProfile.slug && providerProfile.email
            ? generateMedJobsNotificationUrl(providerProfile.slug, providerProfile.email, "interview", interview.id)
            : `${process.env.NEXT_PUBLIC_SITE_URL}/provider/caregivers`;
        } else {
          // Student receives - one-click magic link to their portal interviews
          // tab (auto-opens the new interview), falling back to the plain portal
          // link if the email is somehow missing.
          viewUrl = studentProfile.email
            ? generateMedJobsStudentInterviewUrl(studentProfile.email, interview.id)
            : `${process.env.NEXT_PUBLIC_SITE_URL}/portal/medjobs/interviews`;
        }

        // Determine recipient profile ID for preference checking
        const recipientIsStudent = !isProviderRecipient;

        // Student → unclaimed provider: treat the request like cold outreach.
        // An unclaimed provider (no account_id) gets the Graize-signed "a
        // student is interested" note on the isolated sending domain, with the
        // claim link as the CTA — not the transactional interview email. A
        // claimed provider (and every student recipient) gets the normal one.
        let isColdProviderApply = false;
        let campus: string | null = null;
        if (isProviderRecipient) {
          const { data: providerRow } = await admin
            .from("business_profiles")
            .select("account_id")
            .eq("id", resolvedProviderId)
            .single();
          if (!providerRow?.account_id) {
            isColdProviderApply = true;
            const { data: studentRow } = await admin
              .from("business_profiles")
              .select("metadata")
              .eq("id", resolvedStudentId)
              .single();
            // Use the university DISPLAY NAME for the email copy. metadata.campus
            // is the PartnerUniversity slug ("texas-am"), metadata.university is
            // the name ("Texas A&M University"); fall back slug→name, then null.
            const sMeta = (studentRow?.metadata as Record<string, unknown> | null) ?? {};
            const uniName = (sMeta.university as string | undefined)?.trim();
            const campusSlug = (sMeta.campus as string | undefined)?.trim();
            campus = uniName || (campusSlug ? getUniversityBySlug(campusSlug)?.name ?? null : null) || null;
          }
        }

        if (isColdProviderApply) {
          await sendEmail({
            to: recipientEmail!,
            subject: campus
              ? `A ${campus} student is interested in working with you`
              : "A student is interested in working with you",
            html: studentInterestColdEmail({
              providerName: providerProfile.display_name,
              campus,
              claimUrl: viewUrl,
            }),
            emailType: "medjobs_student_interest",
            recipientType: "provider",
            providerId: resolvedProviderId,
          });
        } else {
          await sendEmail({
            to: recipientEmail!,
            subject: `Interview request from ${proposerName}`,
            html: interviewProposedEmail({
              proposerName,
              interviewType: typeLabel,
              proposedTime: time,
              alternativeTime: formattedAltTime,
              notes: notes || null,
              viewUrl,
            }),
            emailType: "interview_proposed",
            recipientType: recipientIsStudent ? "student" : "provider",
            recipientProfileId: recipientIsStudent ? resolvedStudentId : resolvedProviderId,
          });

          // Send confirmation email to the proposer (provider → student flow)
          // The provider gets confirmation that their interview request was sent
          if (recipientIsStudent && providerProfile.email) {
            const providerViewUrl = providerProfile.slug
              ? generateMedJobsNotificationUrl(providerProfile.slug, providerProfile.email, "interview", interview.id)
              : `${process.env.NEXT_PUBLIC_SITE_URL}/provider/caregivers`;
            const studentFirstName = studentProfile.display_name?.split(" ")[0] || "the student";

            await sendEmail({
              to: providerProfile.email,
              subject: `Interview request sent to ${studentFirstName}`,
              html: interviewScheduledConfirmationEmail({
                studentFirstName,
                interviewType: typeLabel,
                proposedTime: time,
                alternativeTime: formattedAltTime,
                notes: notes || null,
                viewUrl: providerViewUrl,
              }),
              emailType: "interview_scheduled_confirmation",
              recipientType: "provider",
              recipientProfileId: resolvedProviderId,
            });
          }

          // Send confirmation email to the proposer (student → provider flow)
          // The student gets confirmation that their interview request was sent
          if (!recipientIsStudent && studentProfile.email) {
            const studentViewUrl = generateMedJobsStudentInterviewUrl(studentProfile.email, interview.id);
            const providerFirstName = providerProfile.display_name?.split(" ")[0] || "the provider";

            await sendEmail({
              to: studentProfile.email,
              subject: `Interview request sent to ${providerFirstName}`,
              html: interviewRequestSentEmail({
                studentName: studentProfile.display_name || "there",
                providerName: providerProfile.display_name || "the provider",
                interviewType: typeLabel,
                proposedTime: time,
                alternativeTime: formattedAltTime,
                viewUrl: studentViewUrl,
              }),
              emailType: "interview_request_sent",
              recipientType: "student",
              recipientProfileId: resolvedStudentId,
            });
          }
        }

        // Also send confirmation to student for cold provider flow
        // (The student should know their request was sent even if provider is unclaimed)
        if (isColdProviderApply && studentProfile.email) {
          const studentViewUrl = generateMedJobsStudentInterviewUrl(studentProfile.email, interview.id);

          await sendEmail({
            to: studentProfile.email,
            subject: `Interview request sent to ${providerProfile.display_name?.split(" ")[0] || "the provider"}`,
            html: interviewRequestSentEmail({
              studentName: studentProfile.display_name || "there",
              providerName: providerProfile.display_name || "the provider",
              interviewType: typeLabel,
              proposedTime: time,
              alternativeTime: formattedAltTime,
              viewUrl: studentViewUrl,
            }),
            emailType: "interview_request_sent",
            recipientType: "student",
            recipientProfileId: resolvedStudentId,
          });
        }
      } catch (err) {
        console.error("[medjobs/interviews] email error:", err);
      }
    } else {
      console.log(`[medjobs/interviews] Interview ${interview.id} pending verification - email will be sent after provider verifies`);
    }

    return NextResponse.json({ interviewId: interview.id, isPendingVerification });
  } catch (err) {
    console.error("[medjobs/interviews] POST error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * PATCH /api/medjobs/interviews
 * Update interview status (confirm, cancel, reschedule).
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { interviewId, status, newTime } = body as {
      interviewId: string;
      status: InterviewStatus;
      newTime?: string;
    };

    if (!interviewId || !status) {
      return NextResponse.json({ error: "interviewId and status required" }, { status: 400 });
    }

    const admin = getAdminClient();

    // Fetch the interview
    const { data: interview } = await admin
      .from("interviews")
      .select(`
        *,
        provider:business_profiles!interviews_provider_profile_id_fkey(id, display_name, email, slug),
        student:business_profiles!interviews_student_profile_id_fkey(id, display_name, email, slug, metadata)
      `)
      .eq("id", interviewId)
      .single();

    if (!interview) return NextResponse.json({ error: "Interview not found" }, { status: 404 });

    // Verify the user is a participant
    const { data: account } = await admin.from("accounts").select("id").eq("user_id", user.id).single();
    if (!account) return NextResponse.json({ error: "No account" }, { status: 403 });

    const { data: userProfiles } = await admin.from("business_profiles").select("id, type, metadata").eq("account_id", account.id);
    const userProfileIds = (userProfiles || []).map((p: { id: string }) => p.id);
    const isParticipant = userProfileIds.includes(interview.provider_profile_id) || userProfileIds.includes(interview.student_profile_id);
    if (!isParticipant) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

    // Block students from modifying interviews that are pending provider verification
    // The interview shouldn't even be visible to them, but this is a safety check
    const isStudentOnlyParticipant =
      userProfileIds.includes(interview.student_profile_id) &&
      !userProfileIds.includes(interview.provider_profile_id);
    if (interview.is_pending_verification && isStudentOnlyParticipant) {
      return NextResponse.json({ error: "Interview pending provider verification" }, { status: 403 });
    }

    // Paywall gate: if a provider is confirming an inbound interview, check their
    // tier. MVP "open the loop" (MEDJOBS_INTERVIEW_OPEN_LOOP) bypasses this so the
    // scheduling loop runs end-to-end with no payment — the gate is Terms
    // acceptance, not a paid tier. Flip the env flag to restore the paywall.
    if (status === "confirmed" && !MEDJOBS_INTERVIEW_OPEN_LOOP) {
      const isProviderConfirming =
        userProfileIds.includes(interview.provider_profile_id) &&
        interview.proposed_by !== interview.provider_profile_id;

      if (isProviderConfirming) {
        const providerProfile2 = (userProfiles || []).find(
          (p: { id: string; type: string }) =>
            p.id === interview.provider_profile_id && (p.type === "organization" || p.type === "caregiver")
        );
        if (providerProfile2) {
          const providerMeta = ((providerProfile2 as { metadata?: unknown }).metadata ?? {}) as Record<string, unknown>;
          const access = getAccessTier(true, providerMeta);
          if (!access.isPaid) {
            return NextResponse.json({ error: "pilot_required", tier: access.tier }, { status: 402 });
          }
        }
      }
    }

    // Build update
    const update: Record<string, unknown> = { status };
    if (status === "confirmed") {
      update.confirmed_time = interview.proposed_time;
      // Clear reminder tracking so a new reminder can be sent for the new time
      const currentMeta = (interview.metadata || {}) as Record<string, unknown>;
      if (currentMeta.reminder_sent_at) {
        const { reminder_sent_at, ...restMeta } = currentMeta;
        update.metadata = restMeta;
      }
    }
    if (status === "rescheduled" && newTime) {
      update.proposed_time = newTime;
      update.status = "proposed";
      // Flip ownership to the rescheduler so the OTHER party sees Confirm (not
      // Withdraw) on the counter-proposed time. Without this, proposed_by stays
      // on the original proposer and the reschedule can never be accepted.
      update.proposed_by = userProfileIds.includes(interview.provider_profile_id)
        ? interview.provider_profile_id
        : interview.student_profile_id;
    }

    await admin.from("interviews").update(update).eq("id", interviewId);

    // Send emails based on status change
    const provider = interview.provider as { display_name: string; email: string; slug: string };
    const student = interview.student as { display_name: string; email: string; slug: string; metadata?: Record<string, unknown> };
    // Use student's university timezone for email formatting
    const studentTimezone = getStudentTimezone(student.metadata);

    if (status === "confirmed") {
      const confirmedTime = new Date(interview.proposed_time);
      const typeLabel = interview.type === "video" ? "Video" : interview.type === "in_person" ? "In-Person" : "Phone";

      // Generate .ics
      const icsContent = generateICS({
        title: `MedJobs Interview: ${student.display_name} × ${provider.display_name}`,
        description: `${typeLabel} interview scheduled via Olera MedJobs.${interview.notes ? `\n\nNotes: ${interview.notes}` : ""}`,
        location: interview.location || (interview.type === "video" ? "Video call — link TBD" : undefined),
        startTime: confirmedTime,
        durationMinutes: interview.duration_minutes || 30,
        organizerEmail: provider.email,
        attendeeEmail: student.email,
      });

      const icsBase64 = Buffer.from(icsContent).toString("base64");
      const time = confirmedTime.toLocaleString("en-US", {
        weekday: "long", month: "long", day: "numeric",
        hour: "numeric", minute: "2-digit", timeZoneName: "short",
        timeZone: studentTimezone,
      });

      // Generate view URLs - both parties get a one-click magic link for auto-sign-in
      const studentViewUrl = student.email
        ? generateMedJobsStudentInterviewUrl(student.email, interviewId)
        : `${process.env.NEXT_PUBLIC_SITE_URL}/portal/medjobs/interviews`;
      const providerViewUrl = provider.slug && provider.email
        ? generateMedJobsNotificationUrl(provider.slug, provider.email, "interview", interviewId)
        : `${process.env.NEXT_PUBLIC_SITE_URL}/provider/caregivers`;

      try {
        await sendEmail({
          to: student.email,
          subject: `Interview confirmed with ${provider.display_name}`,
          html: interviewConfirmedEmail({
            otherName: provider.display_name,
            interviewType: typeLabel,
            confirmedTime: time,
            durationMinutes: interview.duration_minutes || 30,
            location: interview.location || null,
            viewUrl: studentViewUrl,
          }),
          emailType: "interview_confirmed",
          attachments: [{ filename: "interview.ics", content: icsBase64, encoding: "base64", type: "text/calendar" }],
        });
        await sendEmail({
          to: provider.email,
          subject: `Interview confirmed with ${student.display_name}`,
          html: interviewConfirmedEmail({
            otherName: student.display_name,
            interviewType: typeLabel,
            confirmedTime: time,
            durationMinutes: interview.duration_minutes || 30,
            location: interview.location || null,
            viewUrl: providerViewUrl,
          }),
          emailType: "interview_confirmed",
          attachments: [{ filename: "interview.ics", content: icsBase64, encoding: "base64", type: "text/calendar" }],
        });
      } catch (err) {
        console.error("[medjobs/interviews] confirmation email error:", err);
      }
    }

    if (status === "cancelled") {
      try {
        // Determine who cancelled
        const callerIsProvider = userProfileIds.includes(interview.provider_profile_id);
        const cancelledBy = callerIsProvider ? "provider" : "student";

        // Generate view URLs - both parties get a one-click magic link for auto-sign-in
        const studentViewUrl = student.email
          ? generateMedJobsStudentInterviewUrl(student.email, interviewId)
          : `${process.env.NEXT_PUBLIC_SITE_URL}/portal/medjobs/interviews`;
        const providerViewUrl = provider.slug && provider.email
          ? generateMedJobsNotificationUrl(provider.slug, provider.email, "interview", interviewId)
          : `${process.env.NEXT_PUBLIC_SITE_URL}/provider/caregivers`;

        // Only notify student if they were actually notified about the interview
        // (i.e., it wasn't pending provider verification)
        if (!interview.is_pending_verification) {
          await sendEmail({
            to: student.email,
            subject: `Interview with ${provider.display_name} cancelled`,
            html: interviewCancelledEmail({ otherName: provider.display_name, viewUrl: studentViewUrl }),
            emailType: "interview_cancelled",
          });
        }
        // Always notify provider
        await sendEmail({
          to: provider.email,
          subject: `Interview with ${student.display_name} cancelled`,
          html: interviewCancelledEmail({ otherName: student.display_name, viewUrl: providerViewUrl }),
          emailType: "interview_cancelled",
        });

        // Notify admin team about the cancellation
        const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
        if (adminEmail) {
          const interviewTime = new Date(interview.confirmed_time || interview.proposed_time).toLocaleString("en-US", {
            weekday: "long", month: "long", day: "numeric",
            hour: "numeric", minute: "2-digit", timeZoneName: "short",
            timeZone: studentTimezone,
          });
          const adminUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/admin/caregivers/${student.slug || interview.student_profile_id}`;
          await sendEmail({
            to: adminEmail,
            subject: `Interview cancelled: ${provider.display_name} ↔ ${student.display_name}`,
            html: interviewCancelledAdminEmail({
              providerName: provider.display_name,
              studentName: student.display_name,
              cancelledBy,
              interviewTime,
              adminUrl,
            }),
            emailType: "interview_cancelled_admin",
            recipientType: "admin",
          });
        }
      } catch (err) {
        console.error("[medjobs/interviews] cancel email error:", err);
      }
    }

    // Reschedule: a new time was proposed (status was flipped back to "proposed"
    // above). Notify the OTHER party so they can review it like a fresh request
    // [H3] — without this the rescheduled time silently never reaches them.
    if (status === "rescheduled" && newTime) {
      try {
        const callerIsProvider = userProfileIds.includes(interview.provider_profile_id);
        const caller = callerIsProvider ? provider : student;
        const recipient = callerIsProvider ? student : provider;
        const proposerName = callerIsProvider ? provider.display_name : student.display_name;
        const typeLabel = interview.type === "video" ? "Video" : interview.type === "in_person" ? "In-Person" : "Phone";
        const time = new Date(newTime).toLocaleString("en-US", {
          weekday: "long", month: "long", day: "numeric",
          hour: "numeric", minute: "2-digit", timeZoneName: "short",
          timeZone: studentTimezone,
        });

        // Recipient gets a one-click magic link to their respective surface.
        const recipientViewUrl = callerIsProvider
          ? (student.email
              ? generateMedJobsStudentInterviewUrl(student.email, interviewId)
              : `${process.env.NEXT_PUBLIC_SITE_URL}/portal/medjobs/interviews`)
          : (provider.slug && provider.email
              ? generateMedJobsNotificationUrl(provider.slug, provider.email, "interview", interviewId)
              : `${process.env.NEXT_PUBLIC_SITE_URL}/provider/caregivers`);

        // Caller (rescheduler) gets a view URL too
        const callerViewUrl = callerIsProvider
          ? (provider.slug && provider.email
              ? generateMedJobsNotificationUrl(provider.slug, provider.email, "interview", interviewId)
              : `${process.env.NEXT_PUBLIC_SITE_URL}/provider/caregivers`)
          : (student.email
              ? generateMedJobsStudentInterviewUrl(student.email, interviewId)
              : `${process.env.NEXT_PUBLIC_SITE_URL}/portal/medjobs/interviews`);

        // Notify the recipient about the new proposed time
        if (recipient.email) {
          await sendEmail({
            to: recipient.email,
            subject: `New interview time proposed by ${proposerName}`,
            html: interviewProposedEmail({
              proposerName,
              interviewType: typeLabel,
              proposedTime: time,
              alternativeTime: null,
              notes: interview.notes || null,
              viewUrl: recipientViewUrl,
            }),
            emailType: "interview_proposed",
            recipientType: callerIsProvider ? "student" : "provider",
            recipientProfileId: callerIsProvider ? interview.student_profile_id : interview.provider_profile_id,
          });
        }

        // Send confirmation to the rescheduler that their new time was sent
        if (caller.email) {
          await sendEmail({
            to: caller.email,
            subject: `Your proposed time was sent to ${recipient.display_name}`,
            html: interviewRescheduleSentEmail({
              recipientName: caller.display_name,
              otherName: recipient.display_name,
              newTime: time,
              viewUrl: callerViewUrl,
            }),
            emailType: "interview_reschedule_sent",
            recipientType: callerIsProvider ? "provider" : "student",
            recipientProfileId: callerIsProvider ? interview.provider_profile_id : interview.student_profile_id,
          });
        }
      } catch (err) {
        console.error("[medjobs/interviews] reschedule email error:", err);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[medjobs/interviews] PATCH error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
