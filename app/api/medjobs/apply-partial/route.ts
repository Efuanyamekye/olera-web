import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import { studentAccountCreatedEmail } from "@/lib/medjobs-email-templates";
import { sendSlackAlert, slackMedJobsNewStudent } from "@/lib/slack";

// Lazy initialization to avoid build-time errors when env vars are not available
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function generateSlug(name: string): string {
  const base = `${name}-student`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { displayName, email, phone, city, state, website: honeypot } = body;

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
    const normalizedEmail = email.trim().toLowerCase();

    const supabaseAdmin = getSupabaseAdmin();

    // Check for existing student profile with this email
    const { data: existingProfile } = await supabaseAdmin
      .from("business_profiles")
      .select("id, slug")
      .eq("email", normalizedEmail)
      .eq("type", "student")
      .limit(1)
      .maybeSingle();

    if (existingProfile) {
      return NextResponse.json({
        profileId: existingProfile.id,
        slug: existingProfile.slug,
        existing: true,
      });
    }

    // Create minimal student profile
    const slug = generateSlug(trimmedName);

    const metadata = {
      application_completed: false,
      seeking_status: "actively_looking" as const,
      profile_completeness: 0,
    };

    const { data: profile, error } = await supabaseAdmin
      .from("business_profiles")
      .insert({
        slug,
        type: "student",
        display_name: trimmedName,
        description: null,
        email: normalizedEmail,
        phone: phone?.trim() || null,
        city: city?.trim() || null,
        state: state?.trim() || null,
        care_types: [],
        metadata,
        claim_state: "unclaimed",
        verification_state: "unverified",
        source: "user_created",
        is_active: true,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[medjobs/apply-partial] insert error:", error);
      return NextResponse.json({ error: "Failed to create profile" }, { status: 500 });
    }

    // ── Create Supabase Auth user + accounts row + link to profile ──
    let autoSignInToken: string | undefined;

    try {
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
          console.log("[medjobs/apply-partial] existing auth user found:", authUserId);
        } else {
          throw createUserError;
        }
      } else {
        authUserId = newUser.user.id;
      }

      // Check if accounts row exists
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

      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";

      // Generate token for auto-sign-in (client-side session)
      const { data: signInLink } = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: normalizedEmail,
        options: { redirectTo: `${siteUrl}/medjobs/apply` },
      });
      if (signInLink?.properties?.hashed_token) {
        autoSignInToken = signInLink.properties.hashed_token;
      }
    } catch (err) {
      console.error("[medjobs/apply-partial] account creation error:", err);
    }

    // Fire-and-forget: account created email
    try {
      await sendEmail({
        to: normalizedEmail,
        subject: "Welcome to MedJobs — complete your profile to connect with providers",
        html: studentAccountCreatedEmail({
          studentName: displayName.trim(),
          city: city?.trim() || undefined,
        }),
        emailType: "student_account_created",
      });
    } catch (err) {
      console.error("[medjobs/apply-partial] account email error:", err);
    }

    // Fire-and-forget: Slack alert
    try {
      const alert = slackMedJobsNewStudent({
        studentName: trimmedName,
        university: "Not specified",
        programTrack: "Not specified",
        location: [city, state].filter(Boolean).join(", ") || "Not specified",
      });
      await sendSlackAlert(alert.text, alert.blocks);
    } catch (err) {
      console.error("[medjobs/apply-partial] slack error:", err);
    }

    return NextResponse.json({ profileId: profile.id, slug, tokenHash: autoSignInToken });
  } catch (err) {
    console.error("[medjobs/apply-partial] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
