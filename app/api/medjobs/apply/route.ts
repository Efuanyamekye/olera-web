import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import { studentWelcomeEmail, studentReturningEmail } from "@/lib/medjobs-email-templates";
import { sendSlackAlert, slackMedJobsNewStudent } from "@/lib/slack";
import type { IntendedProfessionalSchool, StudentProgramTrack } from "@/lib/types";

// Lazy initialization to avoid build-time errors when env vars are not available
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function generateSlug(name: string, university: string): string {
  const base = `${name}-${university}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}

/** Map intended_professional_school → program_track for backward compat */
function mapToProgramTrack(school?: IntendedProfessionalSchool): StudentProgramTrack | undefined {
  if (!school) return undefined;
  const map: Record<IntendedProfessionalSchool, StudentProgramTrack> = {
    medicine: "pre_med",
    nursing: "nursing",
    pa: "pre_pa",
    pt: "pre_health",
    public_health: "pre_health",
    undecided: "other",
  };
  return map[school];
}

function computeCompleteness(data: {
  displayName?: string;
  university?: string;
  major?: string;
  intendedSchool?: string;
  city?: string;
  state?: string;
  availabilityTypes?: string[];
  certifications?: string[];
  careExperienceTypes?: string[];
  videoIntroUrl?: string;
  driversLicenseUrl?: string;
  carInsuranceUrl?: string;
  acknowledgmentsCompleted?: boolean;
}): number {
  const fields = [
    { filled: !!data.displayName, weight: 10 },
    { filled: !!data.university, weight: 10 },
    { filled: !!data.major, weight: 5 },
    { filled: !!data.intendedSchool, weight: 5 },
    { filled: !!data.city && !!data.state, weight: 10 },
    { filled: (data.availabilityTypes?.length ?? 0) > 0, weight: 10 },
    { filled: (data.certifications?.length ?? 0) > 0, weight: 5 },
    { filled: (data.careExperienceTypes?.length ?? 0) > 0, weight: 5 },
    { filled: !!data.videoIntroUrl, weight: 15 },
    { filled: !!data.driversLicenseUrl, weight: 10 },
    { filled: !!data.carInsuranceUrl, weight: 10 },
    { filled: !!data.acknowledgmentsCompleted, weight: 5 },
  ];
  return fields.reduce((sum, f) => sum + (f.filled ? f.weight : 0), 0);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      // Personal
      displayName,
      email,
      phone,
      // Education
      university,
      universityId,
      major,
      intendedSchool,
      // Location
      city,
      state,
      zip,
      // Experience
      certifications,
      yearsCaregiving,
      careExperienceTypes,
      languages,
      // Availability (new structured fields)
      availabilityTypes,
      seasonalAvailability,
      durationCommitment,
      hoursPerWeekRange,
      // Acknowledgments
      acknowledgmentsCompleted,
      // Honeypot
      website: honeypot,
    } = body;

    // Honeypot check
    if (honeypot) {
      return NextResponse.json({ profileId: "ok" }, { status: 200 });
    }

    // Validation
    if (!displayName?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (!email?.trim()) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const trimmedName = displayName.trim().slice(0, 100);
    const normalizedEmailEarly = email.trim().toLowerCase();

    // Check for existing student profile with this email
    const supabaseCheck = getSupabaseAdmin();
    const { data: existingProfile } = await supabaseCheck
      .from("business_profiles")
      .select("id, slug, metadata, account_id")
      .eq("email", normalizedEmailEarly)
      .eq("type", "student")
      .limit(1)
      .maybeSingle();

    if (existingProfile) {
      const existingMeta = (existingProfile.metadata || {}) as Record<string, unknown>;
      const applicationCompleted = existingMeta.application_completed === true;

      if (!applicationCompleted) {
        // Incomplete profile from partial creation — update with full form data
        const resolvedSlug = existingProfile.slug;

        const updateMetadata = {
          ...existingMeta,
          university: university?.trim() || existingMeta.university || undefined,
          university_id: universityId || existingMeta.university_id || undefined,
          major: major?.trim() || existingMeta.major || undefined,
          intended_professional_school: intendedSchool || existingMeta.intended_professional_school || undefined,
          program_track: mapToProgramTrack(intendedSchool as IntendedProfessionalSchool) || existingMeta.program_track || undefined,
          certifications: certifications?.filter(Boolean) || [],
          years_caregiving: yearsCaregiving ? (yearsCaregiving === "family" ? 0 : Number(yearsCaregiving)) : undefined,
          care_experience_types: careExperienceTypes?.filter(Boolean) || [],
          languages: languages?.filter(Boolean) || [],
          availability_types: availabilityTypes?.filter(Boolean) || [],
          seasonal_availability: seasonalAvailability?.filter(Boolean) || [],
          duration_commitment: durationCommitment || undefined,
          hours_per_week_range: hoursPerWeekRange || undefined,
          acknowledgments_completed: !!acknowledgmentsCompleted,
          acknowledgment_date: acknowledgmentsCompleted ? new Date().toISOString() : undefined,
          seeking_status: "actively_looking" as const,
          application_completed: true,
          profile_completeness: 0,
        };

        // Compute completeness
        updateMetadata.profile_completeness = computeCompleteness({
          displayName: trimmedName,
          university: updateMetadata.university as string | undefined,
          major: updateMetadata.major as string | undefined,
          intendedSchool: updateMetadata.intended_professional_school as string | undefined,
          city,
          state,
          availabilityTypes: updateMetadata.availability_types as string[],
          certifications: updateMetadata.certifications as string[],
          careExperienceTypes: updateMetadata.care_experience_types as string[],
          videoIntroUrl: undefined,
          acknowledgmentsCompleted: updateMetadata.acknowledgments_completed as boolean,
        });

        const { error: updateError } = await supabaseCheck
          .from("business_profiles")
          .update({
            display_name: trimmedName,
            phone: phone?.trim() || null,
            city: city?.trim() || null,
            state: state?.trim() || null,
            zip: zip?.trim() || null,
            care_types: careExperienceTypes?.filter(Boolean) || [],
            metadata: updateMetadata,
          })
          .eq("id", existingProfile.id);

        if (updateError) {
          console.error("[medjobs/apply] update error:", updateError);
          return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
        }

        // ── Ensure account exists (apply-partial may have failed silently) ──
        const supabaseAdmin = getSupabaseAdmin();
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
        let autoSignInToken: string | undefined;

        if (!existingProfile.account_id) {
          console.log("[medjobs/apply] update path: account_id is null, creating account");
          try {
            let authUserId: string;

            const { data: newUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
              email: normalizedEmailEarly,
              email_confirm: true,
              user_metadata: { display_name: trimmedName, source: "medjobs" },
            });

            if (createUserError) {
              if (
                createUserError.message?.includes("already been registered") ||
                createUserError.message?.includes("already exists")
              ) {
                const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
                  type: "magiclink",
                  email: normalizedEmailEarly,
                });
                if (!linkData?.user?.id) throw new Error("User exists but could not be resolved");
                authUserId = linkData.user.id;
                console.log("[medjobs/apply] update path: existing auth user found:", authUserId);
              } else {
                throw createUserError;
              }
            } else {
              authUserId = newUser.user.id;
              console.log("[medjobs/apply] update path: new auth user created:", authUserId);
            }

            const { data: existingAccount } = await supabaseAdmin
              .from("accounts")
              .select("id")
              .eq("user_id", authUserId)
              .maybeSingle();

            let accountId: string;
            if (existingAccount) {
              accountId = existingAccount.id;
            } else {
              const { data: newAccount, error: accountError } = await supabaseAdmin
                .from("accounts")
                .insert({ user_id: authUserId, display_name: trimmedName, onboarding_completed: true })
                .select("id")
                .single();
              if (accountError) throw accountError;
              accountId = newAccount.id;
              console.log("[medjobs/apply] update path: new account created:", accountId);
            }

            await supabaseAdmin
              .from("business_profiles")
              .update({ account_id: accountId, claim_state: "claimed" })
              .eq("id", existingProfile.id);
            console.log("[medjobs/apply] update path: profile linked to account:", accountId);
          } catch (err) {
            console.error("[medjobs/apply] update path: account creation error:", err);
          }
        }

        // Generate auto-sign-in token for client session
        try {
          const { data: signInLink } = await supabaseAdmin.auth.admin.generateLink({
            type: "magiclink",
            email: normalizedEmailEarly,
            options: { redirectTo: `${siteUrl}/portal/medjobs` },
          });
          if (signInLink?.properties?.hashed_token) {
            autoSignInToken = signInLink.properties.hashed_token;
          }
        } catch (err) {
          console.error("[medjobs/apply] update path: sign-in token error:", err);
        }

        // Fire-and-forget: welcome email (first email student receives — partial creation didn't send one)
        try {
          let magicLinkForEmail: string | undefined;
          const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
            type: "magiclink",
            email: normalizedEmailEarly,
            options: { redirectTo: `${siteUrl}/portal/medjobs` },
          });
          if (linkData?.properties?.action_link) {
            magicLinkForEmail = linkData.properties.action_link;
          }

          await sendEmail({
            to: normalizedEmailEarly,
            subject: "Welcome to Olera MedJobs!",
            html: studentWelcomeEmail({
              studentName: trimmedName,
              university: (updateMetadata.university as string) || "",
              profileSlug: resolvedSlug,
              magicLink: magicLinkForEmail,
            }),
            emailType: "student_welcome",
            recipientType: "student",
          });
        } catch (err) {
          console.error("[medjobs/apply] welcome email error (update path):", err);
        }

        // Fire-and-forget: Slack alert for full completion
        try {
          const alert = slackMedJobsNewStudent({
            studentName: trimmedName,
            university: (updateMetadata.university as string) || "Not specified",
            programTrack: (updateMetadata.intended_professional_school as string) || (updateMetadata.program_track as string) || "Not specified",
            location: [city, state].filter(Boolean).join(", ") || "Not specified",
          });
          await sendSlackAlert(alert.text, alert.blocks);
        } catch (err) {
          console.error("[medjobs/apply] slack error:", err);
        }

        return NextResponse.json({
          profileId: existingProfile.id,
          slug: resolvedSlug,
          updated: true,
          tokenHash: autoSignInToken,
        });
      }

      // Application already completed — returning user
      // Fire-and-forget: returning user email with sign-in link
      try {
        const supabaseAdmin = getSupabaseAdmin();
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
        const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
          type: "magiclink",
          email: normalizedEmailEarly,
          options: { redirectTo: `${siteUrl}/portal/medjobs` },
        });
        const magicLink = linkData?.properties?.action_link;

        await sendEmail({
          to: normalizedEmailEarly,
          subject: "Welcome back to Olera MedJobs",
          html: studentReturningEmail({
            studentName: displayName?.trim() || "there",
            profileSlug: existingProfile.slug,
            magicLink,
          }),
          emailType: "student_returning",
          recipientType: "student",
        });
      } catch (err) {
        console.error("[medjobs/apply] returning email error:", err);
      }

      return NextResponse.json({
        profileId: existingProfile.id,
        slug: existingProfile.slug,
        existing: true,
      });
    }

    const slug = generateSlug(trimmedName, university || "student");

    const metadata = {
      university: university?.trim() || undefined,
      university_id: universityId || undefined,
      major: major?.trim() || undefined,
      intended_professional_school: intendedSchool || undefined,
      program_track: mapToProgramTrack(intendedSchool as IntendedProfessionalSchool),
      certifications: certifications?.filter(Boolean) || [],
      years_caregiving: yearsCaregiving ? (yearsCaregiving === "family" ? 0 : Number(yearsCaregiving)) : undefined,
      care_experience_types: careExperienceTypes?.filter(Boolean) || [],
      languages: languages?.filter(Boolean) || [],
      // New structured availability
      availability_types: availabilityTypes?.filter(Boolean) || [],
      seasonal_availability: seasonalAvailability?.filter(Boolean) || [],
      duration_commitment: durationCommitment || undefined,
      hours_per_week_range: hoursPerWeekRange || undefined,
      // Acknowledgments
      acknowledgments_completed: !!acknowledgmentsCompleted,
      acknowledgment_date: acknowledgmentsCompleted ? new Date().toISOString() : undefined,
      // Status
      profile_completeness: 0,
      seeking_status: "actively_looking" as const,
      application_completed: true,
    };

    // Compute completeness
    metadata.profile_completeness = computeCompleteness({
      displayName: trimmedName,
      university: metadata.university,
      major: metadata.major,
      intendedSchool: metadata.intended_professional_school,
      city,
      state,
      availabilityTypes: metadata.availability_types,
      certifications: metadata.certifications,
      careExperienceTypes: metadata.care_experience_types,
      videoIntroUrl: undefined, // Not submitted yet
      acknowledgmentsCompleted: metadata.acknowledgments_completed,
    });

    const supabaseAdmin = getSupabaseAdmin();

    // Create profile — is_active: false until video submitted
    const { data: profile, error } = await supabaseAdmin
      .from("business_profiles")
      .insert({
        slug,
        type: "student",
        display_name: trimmedName,
        description: null,
        email: email.trim().toLowerCase(),
        phone: phone?.trim() || null,
        city: city?.trim() || null,
        state: state?.trim() || null,
        zip: zip?.trim() || null,
        care_types: careExperienceTypes?.filter(Boolean) || [],
        metadata,
        claim_state: "unclaimed",
        verification_state: "unverified",
        source: "user_created",
        is_active: true,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[medjobs/apply] insert error:", error);
      return NextResponse.json({ error: "Failed to create profile" }, { status: 500 });
    }

    // ── Create Supabase Auth user + accounts row + link to profile ──
    const normalizedEmail = email.trim().toLowerCase();
    let magicLink: string | undefined;
    let insertPathSignInToken: string | undefined;

    try {
      // Try to create auth user — if email already exists, look up the existing one
      let authUserId: string;

      const { data: newUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
        email: normalizedEmail,
        email_confirm: true,
        user_metadata: {
          display_name: trimmedName,
          source: "medjobs",
        },
      });

      if (createUserError) {
        // Email already registered — use generateLink to get existing user info
        if (
          createUserError.message?.includes("already been registered") ||
          createUserError.message?.includes("already exists")
        ) {
          const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
            type: "magiclink",
            email: normalizedEmail,
          });
          if (!linkData?.user?.id) {
            throw new Error("User exists but could not be resolved");
          }
          authUserId = linkData.user.id;
          console.log("[medjobs/apply] existing auth user found:", authUserId);
        } else {
          throw createUserError;
        }
      } else {
        authUserId = newUser.user.id;
      }

      // Check if accounts row exists (existing care seeker may already have one)
      const { data: existingAccount } = await supabaseAdmin
        .from("accounts")
        .select("id")
        .eq("user_id", authUserId)
        .maybeSingle();

      let accountId: string;

      if (existingAccount) {
        accountId = existingAccount.id;
      } else {
        const { data: newAccount, error: accountError } = await supabaseAdmin
          .from("accounts")
          .insert({
            user_id: authUserId,
            display_name: trimmedName,
            onboarding_completed: true,
          })
          .select("id")
          .single();
        if (accountError) throw accountError;
        accountId = newAccount.id;
      }

      // Link student profile to account
      await supabaseAdmin
        .from("business_profiles")
        .update({ account_id: accountId, claim_state: "claimed" })
        .eq("id", profile.id);

      // Generate magic link for welcome email + auto-sign-in token
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: normalizedEmail,
        options: { redirectTo: `${siteUrl}/portal/medjobs` },
      });
      if (!linkError && linkData?.properties?.action_link) {
        magicLink = linkData.properties.action_link;
      }
      if (!linkError && linkData?.properties?.hashed_token) {
        insertPathSignInToken = linkData.properties.hashed_token;
      }
    } catch (err) {
      // Non-blocking: profile was created, account linking failed
      // Student can still sign in later via ensure-account flow
      console.error("[medjobs/apply] account creation error:", err);
    }

    // Fire-and-forget: welcome email
    try {
      await sendEmail({
        to: normalizedEmail,
        subject: "Welcome to Olera MedJobs!",
        html: studentWelcomeEmail({
          studentName: trimmedName,
          university: metadata.university || "",
          profileSlug: slug,
          magicLink,
        }),
        emailType: "student_welcome",
        recipientType: "student",
      });
    } catch (err) {
      console.error("[medjobs/apply] welcome email error:", err);
    }

    // Fire-and-forget: Slack alert (structured)
    try {
      const alert = slackMedJobsNewStudent({
        studentName: trimmedName,
        university: metadata.university || "Not specified",
        programTrack: metadata.intended_professional_school || metadata.program_track || "Not specified",
        location: [city, state].filter(Boolean).join(", ") || "Not specified",
      });
      await sendSlackAlert(alert.text, alert.blocks);
    } catch (err) {
      console.error("[medjobs/apply] slack error:", err);
    }

    // NOTE: Do NOT send Loops event here — adding students to the seeker audience
    // enrolls them in the care-seeker onboarding drip (Logan's intro email).
    // MedJobs students get their own email flow via Resend (welcome + nudge).

    return NextResponse.json({ profileId: profile.id, slug, tokenHash: insertPathSignInToken });
  } catch (err) {
    console.error("[medjobs/apply] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
