/**
 * POST /api/medjobs/student-eligibility — the student funnel front door.
 *
 * Email-only path: takes the 2-question screener result (Q1 aspiration, Q2
 * availability buckets) + an email, then — mirroring the apply route's create
 * path (app/api/medjobs/apply/route.ts) — creates the Supabase Auth user,
 * accounts row, and a `type="student"` business_profile carrying the
 * eligibility metadata, and returns a one-time `tokenHash` so the browser can
 * silently sign the new student in (no redirect).
 *
 * Returning email (auth user / student profile already exists): we do NOT
 * silently sign them in (anti-takeover). We email a magic link and return
 * `existing: true`.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sanitizeReferral } from "@/lib/medjobs/apply-link";
import { sendEmail } from "@/lib/email";
import { studentReturningEmail } from "@/lib/medjobs-email-templates";
import { calculateCompleteness } from "@/lib/medjobs-completeness";
import { sendSlackAlert, slackMedJobsNewStudent } from "@/lib/slack";
import type { IntendedProfessionalSchool, StudentProgramTrack, StudentMetadata } from "@/lib/types";
import {
  STUDENT_ELIGIBILITY_COMPLETED_KEY,
  AVAILABILITY_PROFILE_KEY,
  PLATFORM_TERMS_KEY,
  type CoverageBucket,
} from "@/lib/medjobs/student-eligibility";

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
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

const TRACK_MAP: Record<IntendedProfessionalSchool, StudentProgramTrack> = {
  medicine: "pre_med",
  nursing: "nursing",
  pa: "pre_pa",
  pt: "pre_health",
  public_health: "pre_health",
  undecided: "other",
};

/** Best-effort display name from an email local part ("sarah.kim" → "Sarah Kim"). */
function nameFromEmail(email: string): string {
  const local = email.split("@")[0] || "Student";
  return (
    local
      .replace(/[._-]+/g, " ")
      .replace(/\d+/g, "")
      .trim()
      .split(" ")
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ") || "Student"
  );
}

interface Body {
  email?: string;
  careerPath?: IntendedProfessionalSchool;
  coverageBuckets?: CoverageBucket[];
  university?: string;
  universityId?: string;
  campus?: string;
  city?: string;
  state?: string;
  referral?: unknown;
  website?: string; // honeypot
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Body;

    // Honeypot — silently accept but do nothing.
    if (body.website) {
      return NextResponse.json({ ok: true });
    }

    const email = body.email?.trim().toLowerCase();
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
    }
    if (!body.careerPath) {
      return NextResponse.json({ error: "Missing aspiration." }, { status: 400 });
    }

    const coverageBuckets = Array.isArray(body.coverageBuckets) ? body.coverageBuckets : [];
    const referral = sanitizeReferral(body.referral);
    const supabaseAdmin = getSupabaseAdmin();

    // ── Returning student? Email a sign-in link; never silently sign in. ──
    const { data: existingProfile } = await supabaseAdmin
      .from("business_profiles")
      .select("id, slug")
      .eq("email", email)
      .eq("type", "student")
      .maybeSingle();

    if (existingProfile) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
      const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo: `${siteUrl}/portal/medjobs/jobs` },
      });
      // Actually send the sign-in link (generateLink only mints it).
      try {
        await sendEmail({
          to: email,
          subject: "Sign in to Olera MedJobs",
          html: studentReturningEmail({
            studentName: nameFromEmail(email),
            profileSlug: (existingProfile as { slug: string }).slug,
            magicLink: linkData?.properties?.action_link,
          }),
          emailType: "student_returning",
          recipientType: "student",
        });
      } catch (err) {
        console.error("[medjobs/student-eligibility] returning email error:", err);
      }
      return NextResponse.json({
        slug: (existingProfile as { slug: string }).slug,
        existing: true,
        existingUser: true,
      });
    }

    const nowIso = new Date().toISOString();
    const displayName = nameFromEmail(email);
    const university = body.university?.trim() || undefined;
    const slug = generateSlug(displayName, university || "student");

    const metadata: Record<string, unknown> = {
      university,
      university_id: body.universityId || undefined,
      campus: body.campus || undefined,
      intended_professional_school: body.careerPath,
      program_track: TRACK_MAP[body.careerPath],
      [AVAILABILITY_PROFILE_KEY]: { coverage_buckets: coverageBuckets },
      [STUDENT_ELIGIBILITY_COMPLETED_KEY]: nowIso,
      [PLATFORM_TERMS_KEY]: nowIso,
      seeking_status: "actively_looking",
      application_completed: false,
      ...(referral ? { referral: { ...referral, captured_at: nowIso } } : {}),
    };
    // Honest starting completeness (the dashboard recomputes on first visit).
    metadata.profile_completeness = calculateCompleteness(
      metadata as unknown as StudentMetadata,
      false,
    );

    // Create the student profile (is_active false until they complete + verify).
    const { data: profile, error } = await supabaseAdmin
      .from("business_profiles")
      .insert({
        slug,
        type: "student",
        display_name: displayName,
        email,
        city: body.city?.trim() || null,
        state: body.state?.trim() || null,
        metadata,
        claim_state: "unclaimed",
        verification_state: "unverified",
        source: "user_created",
        is_active: false,
      })
      .select("id, slug")
      .single();

    if (error) {
      console.error("[medjobs/student-eligibility] insert error:", error);
      return NextResponse.json({ error: "Failed to create profile" }, { status: 500 });
    }

    // ── Auth user + account + link + silent sign-in token ──
    let insertPathSignInToken: string | undefined;
    try {
      let authUserId: string;
      let isNewAuthUser = false;

      const { data: newUser, error: createUserError } =
        await supabaseAdmin.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: { display_name: displayName, source: "medjobs" },
        });

      if (createUserError) {
        if (
          createUserError.message?.includes("already been registered") ||
          createUserError.message?.includes("already exists")
        ) {
          const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
            type: "magiclink",
            email,
          });
          if (!linkData?.user?.id) throw new Error("User exists but could not be resolved");
          authUserId = linkData.user.id;
        } else {
          throw createUserError;
        }
      } else {
        authUserId = newUser.user.id;
        isNewAuthUser = true;
      }

      const { data: existingAccount } = await supabaseAdmin
        .from("accounts")
        .select("id")
        .eq("user_id", authUserId)
        .maybeSingle();

      let accountId: string;
      if (existingAccount) {
        accountId = (existingAccount as { id: string }).id;
      } else {
        const { data: newAccount, error: accountError } = await supabaseAdmin
          .from("accounts")
          .insert({ user_id: authUserId, display_name: displayName, onboarding_completed: true })
          .select("id")
          .single();
        if (accountError) throw accountError;
        accountId = (newAccount as { id: string }).id;
      }

      await supabaseAdmin
        .from("business_profiles")
        .update({ account_id: accountId, claim_state: "claimed" })
        .eq("id", (profile as { id: string }).id);

      // Only a NEW auth user gets a silent sign-in token (anti-takeover).
      if (isNewAuthUser) {
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
        const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
          type: "magiclink",
          email,
          options: { redirectTo: `${siteUrl}/portal/medjobs/jobs` },
        });
        if (linkData?.properties?.hashed_token) {
          insertPathSignInToken = linkData.properties.hashed_token;
        }
      }
    } catch (err) {
      // Non-blocking: profile exists; the student can sign in later via email.
      console.error("[medjobs/student-eligibility] account creation error:", err);
    }

    // Fire-and-forget: Slack alert for new student signup
    try {
      const alert = slackMedJobsNewStudent({
        studentName: displayName,
        university: university || "Not specified",
        programTrack: body.careerPath || "Not specified",
        location: [body.city, body.state].filter(Boolean).join(", ") || "Not specified",
      });
      await sendSlackAlert(alert.text, alert.blocks);
    } catch (err) {
      console.error("[medjobs/student-eligibility] slack error:", err);
    }

    return NextResponse.json({
      profileId: (profile as { id: string }).id,
      slug: (profile as { slug: string }).slug,
      tokenHash: insertPathSignInToken,
    });
  } catch (err) {
    console.error("[medjobs/student-eligibility] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
