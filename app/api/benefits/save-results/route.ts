import { NextResponse } from "next/server";
import { classifyOrganicPage } from "@/lib/analytics/content-pages";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient as createSSRServerClient } from "@supabase/ssr";
import { sendEmail, reserveEmailLogId, appendTrackingParams } from "@/lib/email";
import { sendSMS, normalizeUSPhone } from "@/lib/twilio";
import {
  BENEFITS_RESULTS_SMS_COPY_VERSION,
  BENEFITS_RESULTS_ZERO_MATCH_SMS_COPY_VERSION,
  benefitsResultsSms,
} from "@/lib/sms/templates";
import { withSmsSource } from "@/lib/sms/click-source";
import { benefitsResultsSavedEmail, benefitsResultsSavedSubject } from "@/lib/email-templates";
import { getSiteUrl } from "@/lib/site-url";
import { generateUniqueSlugFromName } from "@/lib/slug";
import { sendSlackAlert, slackBenefitsCompleted } from "@/lib/slack";
import { validateEmailStrict } from "@/lib/email-validation";
import { generateBenefitsToken } from "@/lib/benefits-token";
import { generateFamilyInboxUrl } from "@/lib/claim-tokens";
import { getStateSlug } from "@/lib/program-data";
import { resolveBenefitsProgramEntry } from "@/lib/benefits/program-entry";
import { calculateFamilyCompleteness } from "@/lib/admin/profile-completeness";
import { emailReturningUserSignInLink, resolveExistingUserId } from "@/lib/auth/returning-user";
import { readCareAge, AGE_BAND_LABELS, isAgeBand } from "@/lib/benefits/age";
import { benefitAmountLabel } from "@/lib/benefits/savings-label";
import { readCareNeedSource, isInferredCareNeed, type CareNeedSource } from "@/lib/benefits/care-need-source";
import dataVersion from "@/data/pipeline/VERSION.json";

// ─── Email + SMS body helpers ────────────────────────────────────────────
//
// Pulled out of the route handler so the welcome-message construction is
// readable. All pure string-building — no DB or network.

const CARE_NEED_LABEL_FOR_COPY: Record<string, string> = {
  stayingAtHome: "in-home care",
  payingForCare: "paying for care",
  memoryHealth: "memory & medical care",
  companionship: "caregiver & social support",
};

function relationshipFamilyPhrase(rel: string | null | undefined): string {
  switch (rel) {
    case "my-parent":
      return "your parent";
    case "my-spouse":
      return "your spouse";
    case "myself":
      return "you";
    case "other-family":
      return "your family member";
    default:
      return "your family";
  }
}

/** Convert the V3 enum to a natural-language value compatible with the
 *  existing FamilyMetadata.relationship_to_recipient field. The /portal/profile
 *  page, admin/care-seekers view, CarePostSidebar, ProfileEditWizard, etc.
 *  all read this field for the "Who needs care" display. Writing here keeps
 *  V3 family profiles visually complete on the existing UI without touching
 *  any consumer. */
function relationshipDisplayName(rel: string | null | undefined): string | null {
  switch (rel) {
    case "my-parent":
      return "Parent";
    case "my-spouse":
      return "Spouse";
    case "myself":
      return "Self";
    case "other-family":
      return "Family member";
    default:
      return null;
  }
}

/** Derive a display state name from a 2-letter abbreviation. Falls back to
 *  the abbreviation itself when the slug lookup fails (rare — covers
 *  territories or invalid input). */
function stateDisplayName(stateAbbrev: string | null): string {
  if (!stateAbbrev) return "your state";
  const slug = getStateSlug(stateAbbrev);
  if (!slug) return stateAbbrev;
  return slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, " ");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getAdminClient(): any {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

// UI care need categories → granular PrimaryNeed[] from lib/types/benefits.ts
const CARE_NEED_MAP: Record<string, string[]> = {
  stayingAtHome: ["personalCare", "householdTasks", "mobilityHelp"],
  payingForCare: ["financialHelp"],
  memoryHealth: ["memoryCare", "healthManagement"],
  companionship: ["companionship"],
};

interface SavedProgramInput {
  programId: string;
  stateId: string;
  name: string;
  shortName?: string;
  programType?: string;
  savingsRange?: string;
}

interface SaveResultsPayload {
  // Intake answers
  careNeed: "stayingAtHome" | "payingForCare" | "memoryHealth" | "companionship" | null;
  /** Whether the family picked careNeed or the surface derived it. The
   *  program-page card derives it from the page ("inferred_from_page");
   *  absent on older clients, where it is inferred from entrySource. */
  careNeedSource?: CareNeedSource;
  age: number | null;
  medicaidStatus: "alreadyHas" | "applying" | "notSure" | "doesNotHave" | "denied" | null;
  incomeRange: "under1500" | "under2500" | "under4000" | "over4000" | "preferNotToSay" | null;
  stateCode: string | null; // 2-letter (TX, MI, etc.)

  // Save payload
  firstName?: string;
  email?: string;                         // V3: optional — required only when contactChannel='email'
  phone?: string;                         // V3: required when contactChannel='sms'; optional bonus on email path
  contactChannel?: "email" | "sms";       // V3: defaults to 'email' for back-compat with V2 5-step
  providerSlug?: string;                  // V3: provider page they came from, for tie-in copy on /m/{token}
  /** V3: who care is for. Drives personalization on /m/{token} + welcome
   *  email + downstream re-engagement copy. Optional — falls back to
   *  generic copy when missing. */
  relationship?: "my-parent" | "my-spouse" | "myself" | "other-family";
  /** Path of the page where the user submitted the intake. Editorial mounts
   *  pass `/caregiver-support/{slug}`; provider-page mounts leave undefined.
   *  Persisted to accounts.signup_source so downstream conversion analysis
   *  can segment by entry page. */
  entrySource?: string;
  /** Anonymous session id from lib/analytics/session.ts. Persisted to
   *  accounts.session_id so the admin Family Intake drill-in can join an
   *  account back to its impression / started events on provider_activity. */
  sessionId?: string;
  /** Thirty-minute visit id used for same-visit conversion rates. */
  visitId?: string;
  /** UTM attribution from a managed-ads landing link
   *  (`utm_source=olera_managed&utm_campaign=<tag>`). Persisted to the
   *  benefits_completed event metadata so families delivered by a paid Ad Boost
   *  campaign can be attributed back to it (see /admin/ad-boost). */
  utmSource?: string;
  utmCampaign?: string;
  matchedPrograms: SavedProgramInput[];
  matchCount: number;
  /** Full finder (/benefits/finder) answers the card never asks. Each is
   *  optional and only written when the family gave it. */
  ageBand?: string;
  veteranStatus?: "yes" | "no" | "spouse" | "unsure";
  householdSize?: "1" | "2" | "3";
  finderNeeds?: string[];
  caregiverNeeds?: string[];
  /** The program the finder told them to call first. Kept so the plan page,
   *  letter and texts lead with the same one. Must be in matchedPrograms. */
  firstStepProgramId?: string;
  /** The finder's programs in the order the family saw them. The plan page
   *  lists exactly these instead of rebuilding a list from one care-need
   *  keyword, which dropped programs the finder had just shown. */
  finderProgramIds?: string[];
  /** Research cohort from a study link (?cohort=v1 on the Benefits Hub or
   *  finder), so study families can be pulled as a group. */
  cohort?: string;
}

export async function POST(req: Request) {
  const t0 = Date.now();
  const timings: Record<string, number> = {};
  const mark = (label: string) => {
    timings[label] = Date.now() - t0;
  };

  let payload: SaveResultsPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  mark("parse_body");

  const {
    careNeed,
    careNeedSource: rawCareNeedSource,
    age,
    medicaidStatus,
    incomeRange,
    stateCode,
    firstName,
    email,
    phone,
    contactChannel = "email",
    providerSlug,
    relationship,
    entrySource,
    sessionId,
    visitId,
    utmSource,
    utmCampaign,
    matchedPrograms,
    matchCount,
    ageBand,
    veteranStatus,
    householdSize,
    finderNeeds,
    caregiverNeeds,
    firstStepProgramId,
    finderProgramIds,
    cohort,
  } = payload;
  const finderFirst = firstStepProgramId
    ? (matchedPrograms || []).find((p) => p.programId === firstStepProgramId)
    : undefined;

  // Channel-dependent contact validation. The V3 2-step flow lets the user
  // pick email or SMS at submit; legacy V2 5-step always sent email.
  let normalizedEmail = "";
  let normalizedPhone = "";

  if (contactChannel === "sms") {
    if (!phone) {
      return NextResponse.json({ error: "Phone number is required." }, { status: 400 });
    }
    const e164 = normalizeUSPhone(phone);
    if (!e164) {
      return NextResponse.json({ error: "Please enter a valid US phone number." }, { status: 400 });
    }
    normalizedPhone = e164;
    // Email is optional on SMS path. If provided, still validate (so a stray
    // junk address doesn't pollute the profile), but don't require it.
    if (email) {
      const v = validateEmailStrict(email);
      if (v.valid) normalizedEmail = email.trim().toLowerCase();
    }
  } else {
    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }
    const v = validateEmailStrict(email);
    if (!v.valid) {
      return NextResponse.json(
        {
          error: v.error || "Please enter a valid email address.",
          suggestion: v.suggestion,
          suggestedEmail: v.suggestedEmail,
        },
        { status: 400 },
      );
    }
    normalizedEmail = email.trim().toLowerCase();
    // V3 email path also accepts an optional phone — captures bonus signal
    // and enables a follow-up SMS if the user wants both. Validate format
    // only when provided; ignore silently if it doesn't normalize (don't
    // 400 the whole submission for a bad bonus field).
    if (phone) {
      const e164 = normalizeUSPhone(phone);
      if (e164) normalizedPhone = e164;
    }
  }

  const db = getAdminClient();
  if (!db) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  // Check if already authenticated AND check provider email/phone block in parallel.
  // Provider check only matters for anonymous users; authenticated users have
  // already been validated. We check by whichever contact channel was provided.
  const serverSupabase = await createServerClient();
  const providerCheckQuery = normalizedEmail
    ? db.from("business_profiles")
        .select("id, type")
        .eq("email", normalizedEmail)
        .in("type", ["organization", "caregiver", "student"])
        .limit(1)
        .maybeSingle()
    : db.from("business_profiles")
        .select("id, type")
        .eq("phone", normalizedPhone)
        .in("type", ["organization", "caregiver", "student"])
        .limit(1)
        .maybeSingle();

  const [{ data: { user: currentUser } }, { data: existingProviderProfile }] = await Promise.all([
    serverSupabase.auth.getUser(),
    providerCheckQuery,
  ]);
  mark("parallel_auth_and_provider_check");

  // Block provider emails/phones (only matters for new user creation; logged-in
  // users with existing accounts have already been validated)
  if (!currentUser && existingProviderProfile) {
    const channelLabel = normalizedEmail ? "email" : "phone number";
    return NextResponse.json(
      {
        error: `This ${channelLabel} is linked to a provider account. Please use a different ${channelLabel}.`,
        code: normalizedEmail ? "PROVIDER_EMAIL" : "PROVIDER_PHONE",
      },
      { status: 409 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }
  const authClient = createClient(supabaseUrl, serviceKey);
  const siteUrl = getSiteUrl();

  let userId: string = "";
  let accountId: string | null = null;
  let familyProfileId: string = "";
  let accessToken: string | null = null;
  let refreshToken: string | null = null;
  let isNewUser = false;
  let existingUser = false;
  const hasRealName = !!firstName?.trim();
  const displayName = hasRealName ? firstName!.trim() : "Care Seeker";

  // ═══════════════════════════════════════════════════════════════════
  // 1. Resolve user: already logged in → use their account
  //    Else → create or look up by email, generate magic link session
  // ═══════════════════════════════════════════════════════════════════
  if (currentUser) {
    userId = currentUser.id;

    // Find their account (if it exists — may be null for fresh auth users)
    const { data: account } = await db
      .from("accounts")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (account) accountId = account.id;

    // Provider accounts stay provider-only. Without this, a provider who runs
    // the finder while signed in gets a family profile attached to their
    // account, and the navbar starts showing "Switch to family".
    if (account) {
      const { data: ownProfiles } = await db
        .from("business_profiles")
        .select("type")
        .eq("account_id", account.id);
      const types = new Set((ownProfiles || []).map((p) => p.type));
      const isProviderAccount = ["organization", "caregiver", "student"].some((t) => types.has(t));
      if (isProviderAccount && !types.has("family")) {
        return NextResponse.json(
          {
            error: "You're signed in to a provider account. To save benefits results, sign out and use a different email or phone.",
            code: "PROVIDER_ACCOUNT",
          },
          { status: 409 }
        );
      }
    }
  } else if (contactChannel === "sms") {
    // ── Anonymous SMS path ───────────────────────────────────────────────
    // Phone-based user creation. Simpler than the email path: no magic-link
    // session/cookie flow because:
    //   - The in-session overlay receives match data directly (no need to
    //     authenticate against Supabase to render it).
    //   - The user's later access via /m/{token} uses the token as auth, not
    //     a Supabase session.
    //   - SMS users can sign in fully later via standard phone OTP if they
    //     decide to engage with /portal — out of scope for v1.
    const tCreate = Date.now();
    const { data: newUser, error: createUserErr } = await authClient.auth.admin.createUser({
      phone: normalizedPhone,
      phone_confirm: false,
      user_metadata: { full_name: displayName, contact_channel: "sms" },
    });
    timings["create_user"] = Date.now() - tCreate;

    if (!createUserErr && newUser?.user) {
      userId = newUser.user.id;
      isNewUser = true;
    } else if (
      createUserErr?.message?.includes("already") ||
      createUserErr?.message?.includes("exists")
    ) {
      // Phone already has a user — for v1 we ask them to use a different
      // number or sign in. Reconciling cross-channel identities is
      // structurally complex; deferring until we see real demand.
      return NextResponse.json(
        {
          error: "This phone number is already linked to an Olera account. Please use a different number or sign in.",
          code: "PHONE_EXISTS",
        },
        { status: 409 },
      );
    } else {
      console.error("[save-results] Failed to create user (phone):", createUserErr);
      return NextResponse.json({ error: "Failed to create account." }, { status: 500 });
    }
  } else {
    // ── Anonymous email path (legacy V2 + V3 email default) ────────────
    // Try to create user
    const tCreate = Date.now();
    const { data: newUser, error: createUserErr } = await authClient.auth.admin.createUser({
      email: normalizedEmail,
      email_confirm: false,
      user_metadata: { full_name: displayName },
    });
    timings["create_user"] = Date.now() - tCreate;

    if (!createUserErr && newUser?.user) {
      userId = newUser.user.id;
      isNewUser = true;
    } else if (createUserErr?.message?.includes("already been registered") ||
               createUserErr?.message?.includes("already exists")) {
      // SECURITY: existing account. Never mint a session for a caller-supplied
      // email (account takeover), and never hand the caller anything that
      // opens this family's data (their /m/{token} plan, profile id, user id).
      // The results still attach to their account via the resolved userId; the
      // sign-in link is emailed further down, once the plan token exists, so
      // the real owner lands on their plan from their own inbox.
      userId = (await resolveExistingUserId(authClient, normalizedEmail)) || "";
      existingUser = true;
    } else {
      console.error("[save-results] Failed to create user:", createUserErr);
      return NextResponse.json({ error: "Failed to create account." }, { status: 500 });
    }

    // For new users, also generate a magic link + session so they're logged in instantly
    if (isNewUser && userId) {
      const tLink = Date.now();
      const { data: linkData } = await authClient.auth.admin.generateLink({
        type: "magiclink",
        email: normalizedEmail,
        options: { redirectTo: `${siteUrl}/portal` },
      });
      timings["generate_link_new"] = Date.now() - tLink;
      if (linkData?.properties?.hashed_token) {
        const tVerify = Date.now();
        const { data: verifyData } = await authClient.auth.verifyOtp({
          token_hash: linkData.properties.hashed_token,
          type: "magiclink",
        });
        timings["verify_otp_new"] = Date.now() - tVerify;
        if (verifyData?.session) {
          accessToken = verifyData.session.access_token;
          refreshToken = verifyData.session.refresh_token;
        }
      }
    }
  }
  mark("auth_resolved");

  if (!userId) {
    return NextResponse.json({ error: "Failed to resolve user." }, { status: 500 });
  }

  // ═══════════════════════════════════════════════════════════════════
  // 2. Ensure an `accounts` row exists for this userId.
  //    Mirror /api/connections/request: create with user_id, display_name,
  //    onboarding_completed. No email column on accounts.
  // ═══════════════════════════════════════════════════════════════════
  if (!accountId) {
    const { data: existingAccount } = await db
      .from("accounts")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (existingAccount) {
      accountId = existingAccount.id;
    } else {
      const { data: newAccount, error: accountErr } = await db
        .from("accounts")
        .insert({
          user_id: userId,
          display_name: displayName,
          onboarding_completed: false,
          signup_source: entrySource || null,
          session_id: sessionId || null,
        })
        .select("id")
        .single();
      if (accountErr || !newAccount) {
        console.error("[save-results] Failed to create account:", accountErr);
        return NextResponse.json({ error: "Failed to create account." }, { status: 500 });
      }
      accountId = newAccount.id;
    }
  }
  mark("account_resolved");

  // ═══════════════════════════════════════════════════════════════════
  // 3. Resolve or create family profile, merge intake metadata
  // ═══════════════════════════════════════════════════════════════════
  const granularCareNeeds = careNeed ? CARE_NEED_MAP[careNeed] || [] : [];
  const stateAbbrev = stateCode?.toUpperCase() || null;
  const requestedProgram = resolveBenefitsProgramEntry(entrySource);
  const careNeedSource = careNeed
    ? readCareNeedSource({ explicit: rawCareNeedSource, entrySource })
    : null;

  // Sibling P2 cleanup (partial): previously stored a duplicate
  // `benefits_results.answers` blob with age/medicaidStatus/incomeRange/
  // stateCode that all had flat-metadata equivalents — those are dropped.
  //
  // We keep a MINIMAL answers blob with just `careNeed` because:
  //   - The UI care-need bucket ('payingForCare', 'stayingAtHome', etc.) has
  //     NO flat-metadata equivalent (top-level care_needs is the granular
  //     array we map TO from careNeed).
  //   - components/welcome/WelcomeClient.tsx reads benefits_results.answers
  //     .careNeed for the careNeedLabel switch and the
  //     careNeedProviderCategory mapping. Removing it entirely broke the
  //     welcome page for V3 users who arrive via the "See full list" CTA.
  //
  // Storing it ONCE here (not at top level) keeps a single source of truth
  // and matches the V2-era schema, so existing V2 family profiles continue
  // to render correctly without backfill.
  // Mirror the V3 enum to the existing free-form display field so every
  // existing consumer of `relationship_to_recipient` (the /portal/profile
  // "Who needs care" row, admin/care-seekers view, CarePostSidebar,
  // ProfileEditWizard, completeness scorer) lights up with V3 data —
  // no consumer changes needed. We keep `relationship` (enum) too for
  // our internal personalization logic; the display field is downstream.
  const relationshipDisplay = relationshipDisplayName(relationship);

  const completedAt = new Date().toISOString();
  const intakeMetadata: Record<string, unknown> = {
    age: age || undefined,
    // A band from the finder's age question. Readers go through readCareAge,
    // which prefers a typed exact age when one exists.
    age_band: isAgeBand(ageBand) ? ageBand : undefined,
    // Only yes/no are facts the eligibility rules read. A veteran's spouse
    // is kept apart so VA programs stay in without claiming service.
    veteran_status: veteranStatus === "yes" || veteranStatus === "no" ? veteranStatus : undefined,
    veteran_spouse: veteranStatus === "spouse" ? true : undefined,
    // Only set when the family arrived through a study link; a later visit
    // without one leaves an existing tag alone.
    study_cohort:
      typeof cohort === "string" && /^[a-z0-9][a-z0-9_-]{0,23}$/i.test(cohort)
        ? { id: cohort.toLowerCase(), at: new Date().toISOString(), entry_source: entrySource || null }
        : undefined,
    household_size: householdSize === "1" || householdSize === "2" || householdSize === "3" ? Number(householdSize) : undefined,
    finder_needs: Array.isArray(finderNeeds) && finderNeeds.length ? finderNeeds.slice(0, 8).map(String) : undefined,
    caregiver_needs: Array.isArray(caregiverNeeds) && caregiverNeeds.length ? caregiverNeeds.slice(0, 8).map(String) : undefined,
    care_needs: granularCareNeeds.length > 0 ? granularCareNeeds : undefined,
    income_range: incomeRange || undefined,
    medicaid_status: medicaidStatus || undefined,
    // V3 enum — internal use (welcome email phrases, /m/{token} hero copy)
    relationship: relationship || undefined,
    // Display value — what /portal/profile and admin pages render
    relationship_to_recipient: relationshipDisplay || undefined,
    benefits_results: {
      answers: careNeed ? { careNeed, careNeedSource } : undefined,
      matchCount,
      completed_at: completedAt,
      // Which version of the program rules this family was matched against
      // (data/pipeline/VERSION.json), so a study cohort can be read back
      // against the facts it saw.
      data_version: dataVersion.version,
      finder_program_ids: Array.isArray(finderProgramIds) && finderProgramIds.length
        ? finderProgramIds.filter((id) => typeof id === "string").slice(0, 30)
        : undefined,
      finder_first_step: finderFirst
        ? { program_id: finderFirst.programId, state_id: finderFirst.stateId }
        : undefined,
      // This is the family's explicit intent, not an eligibility result. Keep
      // it separate from the ranked matches so later guidance can acknowledge
      // what they asked about without reconstructing it from account signup.
      requested_program: requestedProgram
        ? {
            state_id: requestedProgram.stateId,
            program_id: requestedProgram.programId,
            name: requestedProgram.program.name,
            short_name: requestedProgram.program.shortName,
            entry_source: entrySource,
          }
        : undefined,
    },
    // A phone submitted through the benefits intake is an explicit request
    // for the results and follow-up guidance by text. Persist that choice so
    // the later navigator/check-in messages use the same consent decision as
    // the Day 0 results text instead of silently dropping the family.
    sms_consent: normalizedPhone
      ? { at: completedAt, source: "benefits_intake" }
      : undefined,
  };

  // Look up family profile by account_id (include fields needed for completeness calculation)
  const { data: existingFamilyProfile } = await db
    .from("business_profiles")
    .select("id, metadata, display_name, image_url, city, phone, email, description, care_types")
    .eq("account_id", accountId)
    .eq("type", "family")
    .maybeSingle();

  if (existingFamilyProfile) {
    familyProfileId = existingFamilyProfile.id;
    const submittedMetadata = Object.fromEntries(
      Object.entries(intakeMetadata).filter(([, v]) => v !== undefined)
    );
    // An anonymous caller who typed an existing family's email is unverified:
    // it could be anyone. Their answers may only fill gaps, never overwrite
    // what the family already told us, and a phone they typed must never
    // attach to (or consent texts for) this family.
    if (existingUser) delete submittedMetadata.sms_consent;
    // Merge metadata. A verified caller's new fields win; an unverified
    // caller's fields only fill keys the family has not set.
    const mergedMetadata: Record<string, unknown> = existingUser
      ? { ...submittedMetadata, ...(existingFamilyProfile.metadata || {}) }
      : { ...(existingFamilyProfile.metadata || {}), ...submittedMetadata };

    // Calculate profile completeness with merged data
    const completeness = calculateFamilyCompleteness(
      {
        display_name: existingFamilyProfile.display_name,
        image_url: existingFamilyProfile.image_url,
        city: existingFamilyProfile.city,
        phone: normalizedPhone || existingFamilyProfile.phone,
        description: existingFamilyProfile.description,
        care_types: existingFamilyProfile.care_types,
        metadata: mergedMetadata,
      },
      normalizedEmail || existingFamilyProfile.email
    );
    mergedMetadata.profile_completeness = completeness.percentage;

    const profileUpdate: Record<string, unknown> = { metadata: mergedMetadata };
    if (!existingUser) {
      profileUpdate.preferred_contact_channel = contactChannel;
      if (stateAbbrev) profileUpdate.state = stateAbbrev;
    }
    // Don't overwrite an existing email/phone — only fill in if missing.
    // (Caller may have submitted a different email than what's on file from
    // a prior provider-claim or save-nudge flow; preserve original to avoid
    // surprising the user.)
    // This path is reachable by anyone who types an existing family's email
    // (existingUser flow), so overwriting would let a stranger swap the phone
    // that receives this family's texts.
    if (normalizedEmail && !existingFamilyProfile.email?.trim()) profileUpdate.email = normalizedEmail;
    // An unverified caller's phone is dropped entirely: filling an empty phone
    // would route this family's navigator texts to a stranger.
    if (normalizedPhone && !existingUser && !existingFamilyProfile.phone?.trim()) profileUpdate.phone = normalizedPhone;
    const { error: updateErr } = await db
      .from("business_profiles")
      .update(profileUpdate)
      .eq("id", familyProfileId);
    if (updateErr) console.error("[save-results] Failed to update family profile:", updateErr);
  } else {
    // Create new family profile
    const slug = await generateUniqueSlugFromName(db, displayName);
    const cleanedMetadata = Object.fromEntries(
      Object.entries(intakeMetadata).filter(([, v]) => v !== undefined)
    );
    // Existing account reached anonymously (no family profile yet): the phone
    // was typed by an unverified caller, so it must not land on this
    // account's profile or carry text consent for it.
    const profilePhone = existingUser ? "" : normalizedPhone;
    if (existingUser) delete cleanedMetadata.sms_consent;

    // Calculate profile completeness for new profile
    const completeness = calculateFamilyCompleteness(
      {
        display_name: displayName,
        image_url: null,
        city: null,
        phone: profilePhone,
        description: null,
        care_types: null,
        metadata: cleanedMetadata,
      },
      normalizedEmail
    );
    cleanedMetadata.profile_completeness = completeness.percentage;

    const profileInsert: Record<string, unknown> = {
      account_id: accountId,
      slug,
      type: "family",
      display_name: displayName,
      state: stateAbbrev,
      claim_state: "claimed",
      verification_state: "unverified",
      source: "benefits_intake",
      metadata: cleanedMetadata,
      preferred_contact_channel: contactChannel,
    };
    if (normalizedEmail) profileInsert.email = normalizedEmail;
    if (profilePhone) profileInsert.phone = profilePhone;
    const { data: newProfile, error: createErr } = await db
      .from("business_profiles")
      .insert(profileInsert)
      .select("id")
      .single();
    if (createErr || !newProfile) {
      console.error("[save-results] Failed to create family profile:", createErr);
      return NextResponse.json({ error: "Failed to create profile." }, { status: 500 });
    }
    familyProfileId = newProfile.id;
  }
  mark("profile_resolved");

  // ═══════════════════════════════════════════════════════════════════
  // 3.5. Issue a benefits-results token for /m/{token} addressable access.
  //      Token is the auth — anyone with the URL can see this profile's
  //      matches. Used by the post-submit overlay (in-session) AND by the
  //      welcome email/SMS magic link (post-session). Skipped when we
  //      don't have enough info to render the page (no careNeed or state).
  // ═══════════════════════════════════════════════════════════════════
  let benefitsToken: string | null = null;
  if (careNeed && stateAbbrev) {
    benefitsToken = generateBenefitsToken();
    const { error: tokenErr } = await db.from("benefits_results_tokens").insert({
      token: benefitsToken,
      profile_id: familyProfileId,
      care_need: careNeed,
      state_code: stateAbbrev,
      provider_slug: providerSlug || null,
      match_count: matchCount,
    });
    if (tokenErr) {
      // Token issuance is best-effort — the in-session overlay still works
      // because it has match data passed directly. We log and continue.
      console.error("[save-results] Token issuance failed:", tokenErr);
      benefitsToken = null;
    }
  }
  mark("token_issued");

  // ═══════════════════════════════════════════════════════════════════
  // 4. Parallelize: set active profile + batch-save matching programs
  //    Both depend on familyProfileId/userId but not on each other.
  // ═══════════════════════════════════════════════════════════════════
  const programsToSave: SavedProgramInput[] = [...matchedPrograms];
  if (
    requestedProgram &&
    !programsToSave.some(
      (program) =>
        program.stateId === requestedProgram.stateId &&
        program.programId === requestedProgram.programId,
    )
  ) {
    // A care-need filter can rank other programs above the page the family
    // chose. Preserve the chosen program in the living plan, but do not change
    // matchCount or describe it as an eligibility match.
    programsToSave.unshift({
      programId: requestedProgram.programId,
      stateId: requestedProgram.stateId,
      name: requestedProgram.program.name,
      shortName: requestedProgram.program.shortName,
      programType: requestedProgram.program.programType,
      savingsRange: requestedProgram.program.savingsRange,
    });
  }

  const programInserts = programsToSave.map((p) => ({
    user_id: userId,
    program_id: p.programId,
    state_id: p.stateId,
    name: p.name,
    short_name: p.shortName || null,
    program_type: p.programType || null,
    savings_range: p.savingsRange || null,
  }));

  const isNewProfile = !existingFamilyProfile;
  const [, savedProgramsResult] = await Promise.all([
    // Set active profile only if we just created one. For an existing account
    // reached anonymously, never switch the profile they already use (e.g. a
    // provider or caregiver profile): only fill an empty slot.
    isNewProfile
      ? existingUser
        ? db.from("accounts").update({ active_profile_id: familyProfileId }).eq("id", accountId).is("active_profile_id", null)
        : db.from("accounts").update({ active_profile_id: familyProfileId }).eq("id", accountId)
      : Promise.resolve(null),
    // Batch save programs (skip if empty). `.select()` returns only the rows
    // actually inserted (duplicates are ignored), so we can report the real
    // saved count instead of the client-supplied match count.
    programsToSave.length > 0
      ? db.from("saved_programs").upsert(programInserts, { onConflict: "user_id,program_id", ignoreDuplicates: true }).select("program_id")
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (savedProgramsResult && "error" in savedProgramsResult && savedProgramsResult.error) {
    console.error("[save-results] Failed to batch save programs:", savedProgramsResult.error);
  }
  const programsSavedCount = savedProgramsResult && "data" in savedProgramsResult
    ? savedProgramsResult.data?.length ?? 0
    : 0;
  mark("saved_programs_done");

  // ═══════════════════════════════════════════════════════════════════
  // 5. Log seeker activity event + fire Slack alert
  // ═══════════════════════════════════════════════════════════════════
  // AWAITED, not fire-and-forget: Vercel can terminate the function before a
  // dangling promise resolves, silently dropping the event. The admin
  // Families queue is built from these events, so a dropped insert makes the
  // family invisible there (2 of 220 completions were lost this way —
  // discovered 2026-08-01 when two composed navigator drafts had no queue
  // row to send them from).
  const { data: completionActivity, error: completionError } = await db.from("seeker_activity").insert({
    profile_id: familyProfileId,
    event_type: "benefits_completed",
    metadata: {
      match_count: matchCount,
      programs_saved: programsSavedCount,
      state: stateAbbrev,
      care_need: careNeed,
      care_need_source: careNeedSource,
      is_new_user: isNewUser,
      top_program: matchedPrograms[0]?.shortName || matchedPrograms[0]?.name || null,
      top_savings: matchedPrograms[0]?.savingsRange || null,
      requested_program: requestedProgram?.program.shortName || requestedProgram?.program.name || null,
      requested_program_id: requestedProgram?.programId || null,
      // Attribution — where the intake was submitted from. Surfaced in the
      // admin Activity Center + the Slack alert so leads are traceable to
      // the page that produced them (program page, article, provider page).
      entry_source: entrySource || null,
      provider_slug: providerSlug || null,
      session_id: sessionId || null,
      visit_id: visitId || sessionId || null,
      // Managed-ads attribution: which paid campaign (if any) drove this family.
      utm_source: utmSource || null,
      utm_campaign: utmCampaign || null,
    },
  }).select("id").single();
  if (completionError) {
    console.error("[seeker_activity] benefits_completed insert failed:", completionError);
  }

  const conversionPage = entrySource || (providerSlug ? `/provider/${providerSlug}` : null);
  const conversionCategory = conversionPage ? classifyOrganicPage(conversionPage) : null;
  if (completionActivity?.id && sessionId && conversionPage && conversionCategory) {
    const { error: growthError } = await db.from("growth_attribution_events").upsert({
      anonymous_id: sessionId,
      visit_id: visitId || sessionId,
      subject_id: familyProfileId,
      event_type: "lead_created",
      page_path: conversionPage,
      page_category: conversionCategory,
      cta_id: "benefits_intake",
      conversion_type: "benefits_intake",
      conversion_id: completionActivity.id,
      metadata: {
        entry_source: entrySource || null,
        provider_slug: providerSlug || null,
        state: stateAbbrev,
        match_count: matchCount,
      },
    }, { onConflict: "conversion_type,conversion_id", ignoreDuplicates: true });
    if (growthError) console.error("[save-results] Growth conversion mirror failed:", growthError);
  }

  // Fire Slack alert for real-time visibility
  if (matchCount > 0) {
    // Map careNeed to display label (mirrors the UI categories)
    const careNeedLabels: Record<string, string> = {
      stayingAtHome: "Staying at home",
      payingForCare: "Paying for care",
      memoryHealth: "Memory & health care",
      companionship: "Companionship & support",
    };
    // An inferred need is labelled as such: the program-page card never asks.
    const careNeedLabel = careNeed
      ? careNeedLabels[careNeed]
        ? `${careNeedLabels[careNeed]}${isInferredCareNeed(careNeedSource) ? " (inferred from the page, not asked)" : ""}`
        : null
      : null;

    // Top savings via the shared parser (a range stays a range, a maximum
    // stays "Up to"), not the last dollar figure forced to "/yr".
    const topSavings = benefitAmountLabel(matchedPrograms[0]?.savingsRange)?.text ?? null;

    // Slack alert lists the actual contact (email if email-path, phone if SMS).
    // The helper's `email` field is the contact display — we pass whichever
    // channel the user chose. Refining the helper to know about channel is
    // out of scope for this PR.
    // Situation honesty (Phase 3): every live intake surface still submits
    // age/medicaid/income as null, but a RETURNING family may have given
    // facts since (enrichment round, /m chips, email quiz) — read them off
    // the profile so the alert stops saying "unknown" about a family we know.
    const priorMeta = (existingFamilyProfile?.metadata as Record<string, unknown>) || {};
    // Through readCareAge: a legacy chip "60" is the "Under 65" band, not age 60.
    const priorCareAge = readCareAge(priorMeta);
    const priorAge =
      priorCareAge.exact ?? (priorCareAge.band ? AGE_BAND_LABELS[priorCareAge.band].toLowerCase() : null);
    const priorMedicaid = typeof priorMeta.medicaid_status === "string" ? priorMeta.medicaid_status : null;
    const priorIncome = typeof priorMeta.income_range === "string" ? priorMeta.income_range : null;

    const alert = slackBenefitsCompleted({
      familyName: displayName,
      email: normalizedEmail || normalizedPhone || "(no contact)",
      stateCode: stateAbbrev,
      careNeedLabel,
      age: age || priorAge,
      medicaidStatus: medicaidStatus || priorMedicaid,
      incomeRange: incomeRange || priorIncome,
      matchCount,
      programsSaved: programsSavedCount,
      topProgramName: matchedPrograms[0]?.shortName || matchedPrograms[0]?.name || null,
      topSavings,
      isNewUser,
      entrySource: entrySource || null,
      providerSlug: providerSlug || null,
    });
    // Awaited via Promise.allSettled — fire-and-forget gets killed by
    // Vercel's serverless runtime once the response goes out (cost a 7h
    // diagnosis on the agent-outreach route, 2026-05-03). Adds ~200-400ms
    // latency but guarantees the alert lands. allSettled so a Slack
    // failure doesn't abort the response — the canonical accounts row is
    // already in the DB at this point.
    const [slackResult] = await Promise.allSettled([
      sendSlackAlert(alert.text, alert.blocks),
    ]);
    if (slackResult.status === "rejected") {
      console.error("[save-results] Slack alert failed:", slackResult.reason);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // 6. Send welcome notifications. These are awaited together: serverless
  //    runtimes may terminate work after the response is returned, and Day 0
  //    is the family's only immediate receipt that Olera has their request.
  //
  //    Channel-aware design: new families receive the result on every
  //    contact channel they explicitly supplied. Email and SMS can each be
  //    the primary path; when both exist, both fire in parallel.
  //
  //    A specific program-page entry leads with the program the family asked
  //    about, clearly separates general requirements from an eligibility
  //    decision, and links back to that guide. Broad entries receive an honest
  //    plan receipt. The former generic "strongest matches" email is no longer
  //    a live branch.
  // ═══════════════════════════════════════════════════════════════════
  const welcomeTasks: Promise<void>[] = [];
  if (isNewUser && normalizedEmail) {
    welcomeTasks.push((async () => {
      try {
        const stateNameForEmail = stateDisplayName(stateAbbrev);
        // An inferred need is not something they asked for; leave it unsaid.
        const careLabel = isInferredCareNeed(careNeedSource)
          ? ""
          : careNeed ? CARE_NEED_LABEL_FOR_COPY[careNeed] || "care" : "care";
        const familyPhrase = relationshipFamilyPhrase(relationship);

        const relatedPrograms = matchedPrograms
          .filter(
            (program) =>
              !requestedProgram ||
              program.stateId !== requestedProgram.stateId ||
              program.programId !== requestedProgram.programId,
          )
          .slice(0, 3)
          .map((program) => ({
            name: program.shortName || program.name,
            url: `${siteUrl}/benefits/${program.stateId}/${program.programId}`,
          }));

        const matchesPath = benefitsToken ? `/m/${benefitsToken}` : "/portal";

        const subject = benefitsResultsSavedSubject({
          stateName: stateNameForEmail,
          requestedProgramName: requestedProgram?.program.shortName,
        });

        const emailType = "benefits_results_saved";
        const emailLogId = await reserveEmailLogId({
          to: normalizedEmail,
          subject,
          emailType,
          recipientType: "family",
        });
        // Signed-in arrival: route through the one-click auth link so the
        // family lands on their plan authenticated (continuity into the
        // portal), same pattern every coordinator email uses.
        const trackedMatchesUrl = generateFamilyInboxUrl(
          normalizedEmail,
          appendTrackingParams(matchesPath, emailLogId),
          siteUrl,
        );
        const trackedRequestedProgramUrl = requestedProgram
          ? appendTrackingParams(
              `${siteUrl}/benefits/${requestedProgram.stateId}/${requestedProgram.programId}`,
              emailLogId,
            )
          : undefined;

        await sendEmail({
          to: normalizedEmail,
          subject,
          html: benefitsResultsSavedEmail({
            greetingName: hasRealName ? displayName : "there",
            stateName: stateNameForEmail,
            careLabel,
            familyPhrase,
            relatedPrograms,
            matchesUrl: trackedMatchesUrl,
            matchCount,
            requestedProgram:
              requestedProgram && trackedRequestedProgramUrl
                ? {
                    name: requestedProgram.program.name,
                    shortName: requestedProgram.program.shortName,
                    url: trackedRequestedProgramUrl,
                    tagline: requestedProgram.program.tagline,
                    eligibilityFactors: (
                      requestedProgram.program.structuredEligibility?.summary ||
                      requestedProgram.program.eligibilityHighlights ||
                      []
                    ).slice(0, 3),
                    applicationSummary: requestedProgram.program.applicationGuide?.summary || null,
                  }
                : undefined,
          }),
          emailLogId: emailLogId ?? undefined,
        });
      } catch (emailErr) {
        console.error("[save-results] Failed to send welcome email:", emailErr);
      }
    })());
  }

  // Bonus SMS — fires in parallel with email when the user provided a phone
  // (V3 phone-as-optional). Either channel can fail without affecting the
  // other; both are best-effort. Body is relationship-aware where helpful
  // (160-char SMS budget caps how much personalization we can fit).
  if (isNewUser && normalizedPhone && benefitsToken) {
    welcomeTasks.push((async () => {
      const body = benefitsResultsSms({
        matchCount,
        url: withSmsSource(`${siteUrl}/m/${benefitsToken}`, "benefits_results_sms"),
      });
      const result = await sendSMS({
        to: normalizedPhone,
        body,
        // Ledger entry (channel='sms') for /admin/family-comms; transactional,
        // deliberately NOT a governed nudge type.
        emailType: "benefits_results_sms",
        recipientType: "family",
        recipientLogProfileId: familyProfileId,
        metadata: {
          copy_version:
            matchCount > 0
              ? BENEFITS_RESULTS_SMS_COPY_VERSION
              : BENEFITS_RESULTS_ZERO_MATCH_SMS_COPY_VERSION,
          entry_source: entrySource || "benefits_intake",
          match_count: matchCount,
        },
      });
      if (!result.success) {
        console.error("[save-results] SMS send failed:", result.error);
        // Twilio error 21610 = recipient texted STOP previously. Update profile.
        if (result.error?.includes("21610")) {
          await db
            .from("business_profiles")
            .update({ phone_validity: "opted_out" })
            .eq("id", familyProfileId);
        }
      }
    })());
  }

  // Existing account reached anonymously: the plan token is NOT returned to
  // the caller (see the response below). The owner gets it from their own
  // inbox instead: a sign-in link that lands on their /m/{token} plan.
  let signInEmailed = false;
  if (existingUser && normalizedEmail) {
    welcomeTasks.push((async () => {
      const { emailed } = await emailReturningUserSignInLink(authClient, {
        email: normalizedEmail,
        nextPath: benefitsToken ? `/m/${benefitsToken}` : "/portal",
        subject: "Your benefits plan is saved",
      });
      signInEmailed = emailed;
    })());
  }

  const welcomeResults = await Promise.allSettled(welcomeTasks);
  for (const result of welcomeResults) {
    if (result.status === "rejected") {
      console.error("[save-results] Welcome delivery failed:", result.reason);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // 7. Write session cookies to the response so the client is instantly
  //    authenticated without a client-side setSession() network call.
  //
  //    Client-side setSession() hits the Supabase auth endpoint to verify
  //    the token (via GET /auth/v1/user). From the user's browser this
  //    can take 5-6 seconds (Brave shields, regional latency, etc). By
  //    doing it server-side we leverage the fast Vercel↔Supabase region
  //    path and the cookies are already set when the welcome page loads.
  // ═══════════════════════════════════════════════════════════════════
  // SECURITY: when an existing account was reached anonymously, the caller has
  // only proven they know an email address. Return nothing that opens that
  // family's data: no plan token (/m/{token} shows their plan and accepts
  // enrichment writes), no profile id, no user id. The client shows a
  // "we emailed you a link" state instead. existingUser is only ever true for
  // an anonymous caller (a signed-in caller takes the currentUser branch).
  const response = NextResponse.json(
    existingUser
      ? {
          success: true,
          isNewUser: false,
          existingUser: true,
          signInEmailed,
          matchCount,
          programsSaved: matchedPrograms.length,
          token: null,
          contactChannel,
        }
      : {
          success: true,
          profileId: familyProfileId,
          userId,
          isNewUser,
          existingUser: false,
          matchCount,
          programsSaved: matchedPrograms.length,
          token: benefitsToken,
          contactChannel,
        },
  );

  if (accessToken && refreshToken) {
    const tCookies = Date.now();
    try {
      const cookieWriter = createSSRServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll: () => [],
            setAll: (cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[]) => {
              cookiesToSet.forEach((c) => {
                response.cookies.set(c.name, c.value, c.options);
              });
            },
          },
        }
      );
      await cookieWriter.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      timings["write_session_cookies"] = Date.now() - tCookies;
    } catch (err) {
      console.error("[save-results] Failed to write session cookies:", err);
      timings["write_session_cookies"] = Date.now() - tCookies;
    }
  }

  mark("response_ready");
  console.log("[save-results][timings]", JSON.stringify({
    total_ms: Date.now() - t0,
    isNewUser,
    ...timings,
  }));
  return response;
}
