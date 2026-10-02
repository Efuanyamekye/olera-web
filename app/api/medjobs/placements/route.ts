/**
 * /api/medjobs/placements — Phase D (Stripe stubbed).
 *
 * The employer-student placement lifecycle:
 *   POST   provider offers to hire a student   -> status "offered"
 *   PATCH  action: "accept" (student)          -> status "confirmed"  (payment stubbed)
 *          action: "decline" (student)         -> status "declined"
 *          action: "cancel"  (provider)        -> status "cancelled"
 *   GET    list placements for the caller's profiles
 *
 * Payments are NOT collected yet — Stripe manual-capture (authorize-at-offer /
 * capture-at-confirm) is deferred. See docs/medjobs/PROVIDER_FUNNEL_BUILD_PLAN.md.
 */

import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import { generateStudentPortalUrl } from "@/lib/claim-tokens";
import { sendSlackAlert, slackMedJobsPlacement } from "@/lib/slack";
import {
  placementOfferedEmail,
  placementAcceptedEmail,
  placementAcceptedStudentEmail,
  placementDeclinedEmail,
  placementCancelledEmail,
} from "@/lib/medjobs-email-templates";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";

type Ctx =
  | { error: NextResponse }
  | { supabase: SupabaseClient; ownedIds: string[]; providerProfileId: string | null };

async function getContext(): Promise<Ctx> {
  const supabaseUser = await createServerClient();
  const {
    data: { user },
  } = await supabaseUser.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return { error: NextResponse.json({ error: "Server configuration error" }, { status: 500 }) };
  }
  const supabase = createServiceClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: account } = await supabase
    .from("accounts")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!account) return { error: NextResponse.json({ error: "No account" }, { status: 404 }) };
  const accountId = (account as { id: string }).id;

  const { data: profiles } = await supabase
    .from("business_profiles")
    .select("id, type")
    .eq("account_id", accountId);
  const rows = (profiles ?? []) as Array<{ id: string; type: string }>;
  const ownedIds = rows.map((p) => p.id);
  const providerProfileId =
    rows.find((p) => p.type === "organization" || p.type === "caregiver")?.id ?? null;
  return { supabase, ownedIds, providerProfileId };
}

export async function POST(request: Request) {
  const ctx = await getContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, providerProfileId } = ctx;

  let body: { student_profile_id?: string; interview_id?: string; notes?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    /* empty */
  }
  if (!body.student_profile_id) {
    return NextResponse.json({ error: "student_profile_id required" }, { status: 400 });
  }
  if (!providerProfileId) {
    return NextResponse.json({ error: "No provider profile" }, { status: 404 });
  }

  // Idempotent: reuse an active offer for this provider + student.
  const { data: existing } = await supabase
    .from("medjobs_placements")
    .select("*")
    .eq("provider_profile_id", providerProfileId)
    .eq("student_profile_id", body.student_profile_id)
    .in("status", ["offered", "accepted", "confirmed"])
    .limit(1)
    .maybeSingle();
  if (existing) return NextResponse.json({ ok: true, placement: existing, existing: true });

  // Fetch both profiles for email
  const [{ data: studentProfile }, { data: providerProfile }] = await Promise.all([
    supabase
      .from("business_profiles")
      .select("id, display_name, email, slug")
      .eq("id", body.student_profile_id)
      .single(),
    supabase
      .from("business_profiles")
      .select("id, display_name, email, slug")
      .eq("id", providerProfileId)
      .single(),
  ]);

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("medjobs_placements")
    .insert({
      provider_profile_id: providerProfileId,
      student_profile_id: body.student_profile_id,
      interview_id: body.interview_id ?? null,
      status: "offered",
      internship_agreement_signed_at: nowIso, // provider signs the agreement at offer
      offered_by: providerProfileId,
      notes: body.notes ?? null,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Send placement offer email to student
  if (studentProfile?.email && providerProfile?.display_name) {
    try {
      // Use generic student portal URL (authenticates and redirects to MedJobs portal)
      const studentViewUrl = generateStudentPortalUrl(studentProfile.email, "/portal/medjobs");

      await sendEmail({
        to: studentProfile.email,
        subject: `${providerProfile.display_name} wants to hire you!`,
        html: placementOfferedEmail({
          studentName: studentProfile.display_name || "there",
          providerName: providerProfile.display_name,
          notes: body.notes || null,
          viewUrl: studentViewUrl,
        }),
        emailType: "placement_offered",
        recipientType: "student",
        recipientProfileId: studentProfile.id,
      });
    } catch (err) {
      console.error("[medjobs/placements] placement offer email error:", err);
      // Non-fatal — placement still created
    }
  }

  return NextResponse.json({ ok: true, placement: data });
}

export async function PATCH(request: Request) {
  const ctx = await getContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, ownedIds } = ctx;

  let body: { placement_id?: string; action?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    /* empty */
  }
  if (!body.placement_id || !body.action) {
    return NextResponse.json({ error: "placement_id and action required" }, { status: 400 });
  }

  const { data: placement } = await supabase
    .from("medjobs_placements")
    .select("provider_profile_id, student_profile_id")
    .eq("id", body.placement_id)
    .maybeSingle();
  if (!placement) return NextResponse.json({ error: "Placement not found" }, { status: 404 });
  const p = placement as { provider_profile_id: string; student_profile_id: string };
  const isProviderSide = ownedIds.includes(p.provider_profile_id);
  const isStudentSide = ownedIds.includes(p.student_profile_id);
  if (!isProviderSide && !isStudentSide) {
    return NextResponse.json({ error: "Not your placement" }, { status: 403 });
  }

  const nowIso = new Date().toISOString();
  let update: Record<string, unknown>;
  switch (body.action) {
    case "accept":
      if (!isStudentSide) return NextResponse.json({ error: "Only the student can accept" }, { status: 403 });
      // Stripe stubbed: accepting confirms the placement (no capture yet).
      update = { status: "confirmed", updated_at: nowIso };
      break;
    case "decline":
      if (!isStudentSide) return NextResponse.json({ error: "Only the student can decline" }, { status: 403 });
      update = { status: "declined", updated_at: nowIso };
      break;
    case "cancel":
      if (!isProviderSide) return NextResponse.json({ error: "Only the provider can cancel" }, { status: 403 });
      update = { status: "cancelled", updated_at: nowIso };
      break;
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("medjobs_placements")
    .update(update)
    .eq("id", body.placement_id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch profiles for email and Slack notifications
  const [{ data: studentProfile }, { data: providerProfile }] = await Promise.all([
    supabase
      .from("business_profiles")
      .select("id, display_name, email, slug, metadata")
      .eq("id", p.student_profile_id)
      .single(),
    supabase
      .from("business_profiles")
      .select("id, display_name, email, slug")
      .eq("id", p.provider_profile_id)
      .single(),
  ]);

  // Send emails based on action
  try {
    if (body.action === "accept" && studentProfile && providerProfile) {
      // Student accepted — notify provider
      // Note: Provider URLs use direct links (no magic link for MedJobs provider portal yet)
      if (providerProfile.email) {
        const providerViewUrl = `${BASE_URL}/provider/medjobs/candidates`;

        await sendEmail({
          to: providerProfile.email,
          subject: `${studentProfile.display_name || "A student"} accepted your job offer!`,
          html: placementAcceptedEmail({
            providerName: providerProfile.display_name || "there",
            studentName: studentProfile.display_name || "The student",
            viewUrl: providerViewUrl,
          }),
          emailType: "placement_accepted",
          recipientType: "provider",
          recipientProfileId: providerProfile.id,
        });
      }

      // Send confirmation to student
      if (studentProfile.email) {
        const studentViewUrl = generateStudentPortalUrl(studentProfile.email, "/portal/medjobs");

        await sendEmail({
          to: studentProfile.email,
          subject: `You accepted the offer from ${providerProfile.display_name || "the provider"}`,
          html: placementAcceptedStudentEmail({
            studentName: studentProfile.display_name || "there",
            providerName: providerProfile.display_name || "The provider",
            viewUrl: studentViewUrl,
          }),
          emailType: "placement_accepted_confirmation",
          recipientType: "student",
          recipientProfileId: studentProfile.id,
        });
      }

      // Send Slack notification for the hire
      try {
        const university =
          (studentProfile.metadata as { university?: string } | null)?.university || "Unknown";
        const alert = slackMedJobsPlacement({
          studentName: studentProfile.display_name || "Unknown student",
          providerName: providerProfile.display_name || "Unknown provider",
          university,
          studentId: studentProfile.id,
        });
        await sendSlackAlert(alert.text, alert.blocks);
      } catch (slackErr) {
        console.error("[medjobs/placements] slack error:", slackErr);
      }
    }

    if (body.action === "decline" && studentProfile && providerProfile) {
      // Student declined — notify provider
      if (providerProfile.email) {
        const providerViewUrl = `${BASE_URL}/provider/medjobs/candidates`;

        await sendEmail({
          to: providerProfile.email,
          subject: `${studentProfile.display_name || "A student"} declined your job offer`,
          html: placementDeclinedEmail({
            providerName: providerProfile.display_name || "there",
            studentName: studentProfile.display_name || "The student",
            viewUrl: providerViewUrl,
          }),
          emailType: "placement_declined",
          recipientType: "provider",
          recipientProfileId: providerProfile.id,
        });
      }
    }

    if (body.action === "cancel" && studentProfile && providerProfile) {
      // Provider cancelled — notify student
      if (studentProfile.email) {
        const studentViewUrl = generateStudentPortalUrl(studentProfile.email, "/portal/medjobs");

        await sendEmail({
          to: studentProfile.email,
          subject: `Offer update from ${providerProfile.display_name || "a provider"}`,
          html: placementCancelledEmail({
            studentName: studentProfile.display_name || "there",
            providerName: providerProfile.display_name || "The provider",
            viewUrl: studentViewUrl,
          }),
          emailType: "placement_cancelled",
          recipientType: "student",
          recipientProfileId: studentProfile.id,
        });
      }
    }
  } catch (err) {
    console.error("[medjobs/placements] placement email error:", err);
    // Non-fatal — placement action still succeeded
  }

  return NextResponse.json({ ok: true, placement: data });
}

export async function GET() {
  const ctx = await getContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, ownedIds } = ctx;
  if (ownedIds.length === 0) return NextResponse.json({ placements: [] });
  const list = ownedIds.join(",");
  const { data } = await supabase
    .from("medjobs_placements")
    .select("*")
    .or(`provider_profile_id.in.(${list}),student_profile_id.in.(${list})`)
    .order("created_at", { ascending: false });
  return NextResponse.json({ placements: data ?? [] });
}
