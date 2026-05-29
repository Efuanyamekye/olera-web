import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import { sendEmail } from "@/lib/email";
import { questionAnsweredEmail } from "@/lib/email-templates";
import { generateProviderSlug } from "@/lib/slugify";

/**
 * GET /api/admin/questions
 *
 * List all questions for admin moderation.
 * Query params: status, provider_id, limit, offset
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const admin = await getAdminUser(user.id);
    if (!admin) return NextResponse.json({ error: "Access denied" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const providerId = searchParams.get("provider_id");
    const needsEmail = searchParams.get("needs_email") === "true";
    const countOnly = searchParams.get("count_only") === "true";
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const dateFrom = searchParams.get("date_from"); // ISO date string (inclusive)
    const dateTo = searchParams.get("date_to"); // ISO date string (exclusive — next day)
    const search = searchParams.get("search")?.trim() || "";

    const db = getServiceClient();

    // If searching, find matching provider slugs first
    let searchSlugs: string[] | null = null;
    if (search) {
      const [{ data: bpMatches }, { data: iosMatches }] = await Promise.all([
        db.from("business_profiles").select("slug").in("type", ["organization", "caregiver"]).ilike("display_name", `%${search}%`).limit(200),
        db.from("olera-providers").select("slug").ilike("provider_name", `%${search}%`).not("deleted", "is", true).limit(200),
      ]);
      const slugs = new Set<string>();
      for (const p of bpMatches ?? []) if (p.slug) slugs.add(p.slug);
      for (const p of iosMatches ?? []) if (p.slug) slugs.add(p.slug);
      searchSlugs = Array.from(slugs);
    }

    // For needs_email filter: fetch provider slugs that actually have no email (live check)
    // This checks the actual email field, not a stale metadata flag
    // Include all provider types: provider, organization, caregiver (exclude family)
    let noEmailSlugs: string[] | null = null;
    if (needsEmail) {
      const [{ data: bpNoEmail }, { data: iosNoEmail }] = await Promise.all([
        db.from("business_profiles").select("slug").in("type", ["provider", "organization", "caregiver"]).is("email", null),
        db.from("olera-providers").select("slug").is("email", null).not("deleted", "is", true),
      ]);
      const slugSet = new Set<string>();
      for (const p of bpNoEmail ?? []) if (p.slug) slugSet.add(p.slug);
      for (const p of iosNoEmail ?? []) if (p.slug) slugSet.add(p.slug);
      noEmailSlugs = Array.from(slugSet);
      // If no providers without email, return 0 count for countOnly
      // For full response, we'll return empty questions but still fetch accurate tabCounts
      if (noEmailSlugs.length === 0 && countOnly) {
        return NextResponse.json({ count: 0 });
      }
    }

    // Fast path: return only the count (used by admin dashboard overview)
    if (countOnly) {
      let countQuery = db.from("provider_questions").select("*", { count: "exact", head: true });
      if (status) countQuery = countQuery.eq("status", status);
      if (providerId) countQuery = countQuery.eq("provider_id", providerId);
      if (noEmailSlugs) {
        countQuery = countQuery.in("provider_id", noEmailSlugs);
        countQuery = countQuery.neq("status", "archived").neq("status", "rejected");
      }
      if (searchSlugs) {
        if (searchSlugs.length === 0) return NextResponse.json({ count: 0 });
        countQuery = countQuery.in("provider_id", searchSlugs);
      }
      if (dateFrom) countQuery = countQuery.gte("created_at", dateFrom);
      if (dateTo) countQuery = countQuery.lt("created_at", dateTo);
      const { count, error } = await countQuery;
      if (error) {
        console.error("Admin questions count error:", error);
        return NextResponse.json({ error: "Failed to count questions" }, { status: 500 });
      }
      return NextResponse.json({ count: count ?? 0 });
    }

    let query = db
      .from("provider_questions")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq("status", status);
    if (providerId) query = query.eq("provider_id", providerId);

    // Handle needs_email filter with empty provider list
    const skipMainQuery = noEmailSlugs && noEmailSlugs.length === 0;

    if (noEmailSlugs && noEmailSlugs.length > 0) {
      query = query.in("provider_id", noEmailSlugs);
      query = query.neq("status", "archived").neq("status", "rejected");
    }
    if (searchSlugs) {
      if (searchSlugs.length === 0) return NextResponse.json({ questions: [], count: 0 });
      query = query.in("provider_id", searchSlugs);
    }
    if (dateFrom) query = query.gte("created_at", dateFrom);
    if (dateTo) query = query.lt("created_at", dateTo);

    // If filtering by needs_email but no providers are missing emails, skip query
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let questions: any[] = [];
    let count: number | null = 0;
    if (skipMainQuery) {
      // No query needed - we know results are empty
    } else {
      const { data, count: resultCount, error } = await query;
      questions = data ?? [];
      count = resultCount;
      if (error) {
        console.error("Admin questions fetch error:", error);
        return NextResponse.json({ error: "Failed to fetch questions" }, { status: 500 });
      }
    }

    // Enrich with provider display names
    const slugs = [...new Set((questions ?? []).map((q) => q.provider_id).filter(Boolean))];
    let providerNames: Record<string, string> = {};
    let providerEditorIds: Record<string, string> = {};
    let providerEmails: Record<string, string> = {};
    if (slugs.length > 0) {
      // Try business_profiles first
      const { data: bpProviders } = await db
        .from("business_profiles")
        .select("slug, display_name, source_provider_id, email")
        .in("slug", slugs);
      providerNames = Object.fromEntries(
        (bpProviders ?? []).map((p) => [p.slug, p.display_name])
      );
      providerEditorIds = Object.fromEntries(
        (bpProviders ?? []).filter((p) => p.source_provider_id).map((p) => [p.slug, p.source_provider_id])
      );
      for (const p of bpProviders ?? []) {
        if (p.slug && p.email) providerEmails[p.slug] = p.email;
      }

      // For slugs not found in business_profiles, try olera-providers
      const missingSlugs = slugs.filter((s) => !providerNames[s]);
      if (missingSlugs.length > 0) {
        const { data: iosProviders } = await db
          .from("olera-providers")
          .select("slug, provider_id, provider_name, email")
          .in("slug", missingSlugs)
          .not("deleted", "is", true);
        for (const p of iosProviders ?? []) {
          if (p.slug && p.provider_name) providerNames[p.slug] = p.provider_name;
          if (p.slug && p.provider_id) providerEditorIds[p.slug] = p.provider_id;
          if (p.slug && p.email && !providerEmails[p.slug]) providerEmails[p.slug] = p.email;
        }

        // Also try by provider_id for legacy slugs
        const stillMissing = missingSlugs.filter((s) => !providerNames[s]);
        if (stillMissing.length > 0) {
          const { data: legacyProviders } = await db
            .from("olera-providers")
            .select("provider_id, provider_name")
            .in("provider_id", stillMissing)
            .not("deleted", "is", true);
          for (const p of legacyProviders ?? []) {
            if (p.provider_id && p.provider_name) providerNames[p.provider_id] = p.provider_name;
          }
        }

        // Strategy 4: reverse-match auto-generated slugs for providers with slug=null
        const finalMissing = missingSlugs.filter((s) => !providerNames[s]);
        if (finalMissing.length > 0) {
          // For each missing slug, extract a name prefix and search candidates
          for (const missingSlug of finalMissing) {
            const slugParts = missingSlug.split("-");
            const namePrefix = slugParts.slice(0, 3).join("-");
            const { data: candidates } = await db
              .from("olera-providers")
              .select("provider_id, provider_name, state")
              .not("deleted", "is", true)
              .is("slug", null)
              .ilike("provider_name", `${namePrefix.replace(/-/g, "%")}%`)
              .limit(20);
            if (candidates) {
              for (const c of candidates) {
                const generatedSlug = generateProviderSlug(c.provider_name, c.state);
                if (generatedSlug === missingSlug) {
                  providerNames[missingSlug] = c.provider_name;
                  providerEditorIds[missingSlug] = c.provider_id;
                  break;
                }
              }
            }
          }
        }
      }
    }

    const enriched = (questions ?? []).map((q) => ({
      ...q,
      provider_name: providerNames[q.provider_id] || null,
      provider_editor_id: providerEditorIds[q.provider_id] || null,
      provider_email: providerEmails[q.provider_id] || null,
    }));

    // Fetch tab counts for pending, needs_email, and archived
    // For needs_email count, we need to check actual provider emails (not stale flag)
    // Fetch no-email slugs if not already done
    let noEmailSlugsForCount = noEmailSlugs;
    if (!noEmailSlugsForCount) {
      // Include all provider types: provider, organization, caregiver (exclude family)
      const [{ data: bpNoEmail }, { data: iosNoEmail }] = await Promise.all([
        db.from("business_profiles").select("slug").in("type", ["provider", "organization", "caregiver"]).is("email", null),
        db.from("olera-providers").select("slug").is("email", null).not("deleted", "is", true),
      ]);
      const slugSet = new Set<string>();
      for (const p of bpNoEmail ?? []) if (p.slug) slugSet.add(p.slug);
      for (const p of iosNoEmail ?? []) if (p.slug) slugSet.add(p.slug);
      noEmailSlugsForCount = Array.from(slugSet);
    }

    // Build needs_email count query using actual provider email check
    let needsEmailCountQuery = db.from("provider_questions").select("*", { count: "exact", head: true })
      .neq("status", "archived")
      .neq("status", "rejected");
    if (noEmailSlugsForCount.length > 0) {
      needsEmailCountQuery = needsEmailCountQuery.in("provider_id", noEmailSlugsForCount);
    }

    const [pendingCount, needsEmailCount, archivedCount] = await Promise.all([
      db.from("provider_questions").select("*", { count: "exact", head: true }).eq("status", "pending"),
      noEmailSlugsForCount.length > 0 ? needsEmailCountQuery : Promise.resolve({ count: 0 }),
      db.from("provider_questions").select("*", { count: "exact", head: true }).eq("status", "archived"),
    ]);

    return NextResponse.json({
      questions: enriched,
      count: count ?? 0,
      tabCounts: {
        pending: pendingCount.count ?? 0,
        needs_email: needsEmailCount.count ?? 0,
        archived: archivedCount.count ?? 0,
      },
    });
  } catch (err) {
    console.error("Admin questions error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/questions
 *
 * Update question status (approve, reject, flag) or add answer.
 * Body: { id, status?, answer?, is_public? }
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const admin = await getAdminUser(user.id);
    if (!admin) return NextResponse.json({ error: "Access denied" }, { status: 403 });

    const body = await request.json();
    const { id, status, answer, is_public, archive_reason } = body;

    if (!id) {
      return NextResponse.json({ error: "Question id required" }, { status: 400 });
    }

    const db = getServiceClient();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (status) updates.status = status;
    if (is_public !== undefined) updates.is_public = is_public;

    // When archiving, store the reason in metadata
    if (status === "archived" && archive_reason) {
      const { data: existing } = await db.from("provider_questions").select("metadata").eq("id", id).single();
      const meta = (existing?.metadata || {}) as Record<string, unknown>;
      meta.archive_reason = archive_reason;
      meta.archived_at = new Date().toISOString();
      updates.metadata = meta;
      updates.is_public = false;
    }
    if (answer !== undefined) {
      updates.answer = answer;
      updates.answered_at = new Date().toISOString();
      updates.status = "answered";
      updates.is_public = true;
    }

    const { data, error } = await db
      .from("provider_questions")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Admin question update error:", error);
      return NextResponse.json({ error: "Failed to update question" }, { status: 500 });
    }

    // Email the asker when their question is answered (fire-and-forget)
    if (answer && data?.asker_email) {
      try {
        const providerSlug = data.provider_id || "";
        const { data: provider } = await db
          .from("business_profiles")
          .select("display_name")
          .eq("slug", providerSlug)
          .single();

        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
        await sendEmail({
          to: data.asker_email,
          subject: `${provider?.display_name || "A provider"} answered your question on Olera`,
          html: questionAnsweredEmail({
            askerName: data.asker_name || "there",
            providerName: provider?.display_name || "The provider",
            question: data.question,
            answer,
            providerUrl: `${siteUrl}/provider/${providerSlug}`,
          }),
          emailType: "question_answered",
          recipientType: "family",
          providerId: providerSlug,
        });
      } catch (emailErr) {
        console.error("Answer notification email failed:", emailErr);
      }
    }

    // Log provider-side activity when admin answers (fire-and-forget)
    if (answer && data?.provider_id) {
      db.from("provider_activity").insert({
        provider_id: data.provider_id,
        event_type: "question_responded",
        metadata: {
          question_id: id,
          question_preview: data.question?.substring(0, 100),
          answer_preview: answer.trim().substring(0, 100),
          asker_name: data.asker_name,
          answered_by_admin: true,
        },
      }).then(({ error: actErr }: { error: { message: string } | null }) => {
        if (actErr) console.error("[provider_activity] question_responded insert failed:", actErr);
      });
    }

    return NextResponse.json({ question: data });
  } catch (err) {
    console.error("Admin questions PATCH error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
