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
    const deliveryIssues = searchParams.get("delivery_issues") === "true";
    const notInterested = searchParams.get("not_interested") === "true";
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

    // Fast path: return only the count (used by admin dashboard overview)
    if (countOnly) {
      // For needs_email, we must verify provider status (exists, not archived, no email)
      if (needsEmail) {
        let countQuery = db
          .from("provider_questions")
          .select("provider_id, metadata")
          .contains("metadata", { needs_provider_email: true })
          .neq("status", "archived")
          .neq("status", "rejected");
        if (searchSlugs) {
          if (searchSlugs.length === 0) return NextResponse.json({ count: 0 });
          countQuery = (countQuery as any).in("provider_id", searchSlugs);
        }
        if (dateFrom) countQuery = (countQuery as any).gte("created_at", dateFrom);
        if (dateTo) countQuery = (countQuery as any).lt("created_at", dateTo);

        const { data: questionsForCount, error: countFetchError } = await countQuery;
        if (countFetchError) {
          console.error("Admin questions count error:", countFetchError);
          return NextResponse.json({ error: "Failed to count questions" }, { status: 500 });
        }

        // Get unique provider IDs and check their status
        const providerIds = [...new Set((questionsForCount ?? []).map((q) => q.provider_id).filter(Boolean))];

        // Look up providers in business_profiles
        const { data: bpProviders } = await db
          .from("business_profiles")
          .select("slug, email, is_active")
          .in("slug", providerIds);

        // Look up providers in olera-providers (legacy)
        const { data: oleraProviders } = await db
          .from("olera-providers")
          .select("slug, email")
          .in("slug", providerIds)
          .not("deleted", "is", true);

        // Build provider status map
        const providerStatus = new Map<string, { exists: boolean; hasEmail: boolean; isArchived: boolean }>();
        for (const id of providerIds) {
          providerStatus.set(id, { exists: false, hasEmail: false, isArchived: false });
        }
        for (const p of bpProviders ?? []) {
          if (p.slug) {
            providerStatus.set(p.slug, { exists: true, hasEmail: !!p.email, isArchived: p.is_active === false });
          }
        }
        for (const p of oleraProviders ?? []) {
          if (p.slug && !providerStatus.get(p.slug)?.exists) {
            providerStatus.set(p.slug, { exists: true, hasEmail: !!p.email, isArchived: false });
          }
        }

        // Count only questions where provider exists, not archived, and has no email on file
        const validCount = (questionsForCount ?? []).filter((q) => {
          const status = providerStatus.get(q.provider_id);
          return status?.exists && !status.isArchived && !status.hasEmail;
        }).length;

        return NextResponse.json({ count: validCount });
      }

      // Standard count query for non-needs_email filters
      let countQuery = db.from("provider_questions").select("*", { count: "exact", head: true });
      if (status) countQuery = (countQuery as any).eq("status", status);
      if (providerId) countQuery = (countQuery as any).eq("provider_id", providerId);
      if (searchSlugs) {
        if (searchSlugs.length === 0) return NextResponse.json({ count: 0 });
        countQuery = (countQuery as any).in("provider_id", searchSlugs);
      }
      if (dateFrom) countQuery = (countQuery as any).gte("created_at", dateFrom);
      if (dateTo) countQuery = (countQuery as any).lt("created_at", dateTo);
      const { count, error } = await countQuery;
      if (error) {
        console.error("Admin questions count error:", error);
        return NextResponse.json({ error: "Failed to count questions" }, { status: 500 });
      }
      return NextResponse.json({ count: count ?? 0 });
    }

    // For needs_email, we need to verify provider status before pagination
    // to ensure count and results match
    if (needsEmail) {
      let needsEmailQuery = db
        .from("provider_questions")
        .select("*")
        .contains("metadata", { needs_provider_email: true })
        .neq("status", "archived")
        .neq("status", "rejected")
        .order("created_at", { ascending: false })
        .limit(10000); // Match reasonable admin limit

      if (searchSlugs) {
        if (searchSlugs.length === 0) return NextResponse.json({ questions: [], count: 0 });
        needsEmailQuery = (needsEmailQuery as any).in("provider_id", searchSlugs);
      }
      if (dateFrom) needsEmailQuery = (needsEmailQuery as any).gte("created_at", dateFrom);
      if (dateTo) needsEmailQuery = (needsEmailQuery as any).lt("created_at", dateTo);

      const { data: allNeedsEmailQuestions, error: needsEmailError } = await needsEmailQuery;
      if (needsEmailError) {
        console.error("Admin questions fetch error:", needsEmailError);
        return NextResponse.json({ error: "Failed to fetch questions" }, { status: 500 });
      }

      // Get unique provider IDs and check their status
      const providerIds = [...new Set((allNeedsEmailQuestions ?? []).map((q) => q.provider_id).filter(Boolean))];

      // Look up providers in business_profiles
      const { data: bpProvidersForFilter } = await db
        .from("business_profiles")
        .select("slug, email, is_active")
        .in("slug", providerIds);

      // Look up providers in olera-providers (legacy)
      const { data: oleraProvidersForFilter } = await db
        .from("olera-providers")
        .select("slug, email")
        .in("slug", providerIds)
        .not("deleted", "is", true);

      // Build provider status map
      const providerStatusMap = new Map<string, { exists: boolean; hasEmail: boolean; isArchived: boolean }>();
      for (const id of providerIds) {
        providerStatusMap.set(id, { exists: false, hasEmail: false, isArchived: false });
      }
      for (const p of bpProvidersForFilter ?? []) {
        if (p.slug) {
          providerStatusMap.set(p.slug, { exists: true, hasEmail: !!p.email, isArchived: p.is_active === false });
        }
      }
      for (const p of oleraProvidersForFilter ?? []) {
        if (p.slug && !providerStatusMap.get(p.slug)?.exists) {
          providerStatusMap.set(p.slug, { exists: true, hasEmail: !!p.email, isArchived: false });
        }
      }

      // Filter to valid questions only: provider exists, not archived, and has no email on file
      const validQuestions = (allNeedsEmailQuestions ?? []).filter((q) => {
        const pStatus = providerStatusMap.get(q.provider_id);
        return pStatus?.exists && !pStatus.isArchived && !pStatus.hasEmail;
      });

      // Apply pagination manually
      const questions = validQuestions.slice(offset, offset + limit);
      const count = validQuestions.length;

      // Continue to enrichment below with these filtered questions
      // (fall through to the enrichment code)
      const slugs = [...new Set(questions.map((q) => q.provider_id).filter(Boolean))];
      let providerNames: Record<string, string> = {};
      let providerEditorIds: Record<string, string> = {};
      let providerEmails: Record<string, string> = {};
      let providerPhones: Record<string, string> = {};
      let providerClaimStatus: Record<string, boolean> = {};
      let providerVerificationState: Record<string, string> = {};
      if (slugs.length > 0) {
        // Try business_profiles first
        const { data: bpProviders } = await db
          .from("business_profiles")
          .select("slug, display_name, source_provider_id, email, phone, account_id, metadata")
          .in("slug", slugs);
        providerNames = Object.fromEntries(
          (bpProviders ?? []).map((p) => [p.slug, p.display_name])
        );
        providerEditorIds = Object.fromEntries(
          (bpProviders ?? []).filter((p) => p.source_provider_id).map((p) => [p.slug, p.source_provider_id])
        );
        for (const p of bpProviders ?? []) {
          if (p.slug && p.email) providerEmails[p.slug] = p.email;
          if (p.slug && p.phone) providerPhones[p.slug] = p.phone;
        }

        // Build claim/verification status maps
        for (const p of bpProviders ?? []) {
          if (p.slug) {
            providerClaimStatus[p.slug] = !!p.account_id;
            const meta = p.metadata as Record<string, unknown> | null;
            providerVerificationState[p.slug] = (meta?.verification_state as string) || "unverified";
          }
        }

        // For slugs not found in business_profiles, try olera-providers
        const missingSlugs = slugs.filter((s) => !providerNames[s]);
        if (missingSlugs.length > 0) {
          const { data: iosProviders } = await db
            .from("olera-providers")
            .select("slug, provider_id, provider_name, email, phone")
            .in("slug", missingSlugs)
            .not("deleted", "is", true);
          for (const p of iosProviders ?? []) {
            if (p.slug && p.provider_name) providerNames[p.slug] = p.provider_name;
            if (p.slug && p.provider_id) providerEditorIds[p.slug] = p.provider_id;
            if (p.slug && p.email && !providerEmails[p.slug]) providerEmails[p.slug] = p.email;
            if (p.slug && p.phone && !providerPhones[p.slug]) providerPhones[p.slug] = p.phone;
          }
        }
      }

      const enriched = questions.map((q) => ({
        ...q,
        provider_name: providerNames[q.provider_id] || null,
        provider_editor_id: providerEditorIds[q.provider_id] || null,
        provider_email: providerEmails[q.provider_id] || null,
        provider_phone: providerPhones[q.provider_id] || null,
        is_account_claimed: providerClaimStatus[q.provider_id] ?? false,
        verification_state: providerVerificationState[q.provider_id] || null,
      }));

      return NextResponse.json({ questions: enriched, count });
    }

    // For delivery_issues, show questions where email was on file but delivery failed
    if (deliveryIssues) {
      let deliveryIssuesQuery = db
        .from("provider_questions")
        .select("*")
        .contains("metadata", { email_dead: true })
        .neq("status", "archived")
        .neq("status", "rejected")
        .order("created_at", { ascending: false })
        .limit(10000);

      if (searchSlugs) {
        if (searchSlugs.length === 0) return NextResponse.json({ questions: [], count: 0 });
        deliveryIssuesQuery = (deliveryIssuesQuery as any).in("provider_id", searchSlugs);
      }
      if (dateFrom) deliveryIssuesQuery = (deliveryIssuesQuery as any).gte("created_at", dateFrom);
      if (dateTo) deliveryIssuesQuery = (deliveryIssuesQuery as any).lt("created_at", dateTo);

      const { data: allDeliveryIssuesQuestions, error: deliveryIssuesError } = await deliveryIssuesQuery;
      if (deliveryIssuesError) {
        console.error("Admin questions fetch error:", deliveryIssuesError);
        return NextResponse.json({ error: "Failed to fetch questions" }, { status: 500 });
      }

      // Apply pagination
      const questions = (allDeliveryIssuesQuestions ?? []).slice(offset, offset + limit);
      const count = (allDeliveryIssuesQuestions ?? []).length;

      // Enrich with provider data
      const slugs = [...new Set(questions.map((q) => q.provider_id).filter(Boolean))];
      let providerNames: Record<string, string> = {};
      let providerEditorIds: Record<string, string> = {};
      let providerEmails: Record<string, string> = {};
      let providerPhones: Record<string, string> = {};
      let providerClaimStatus: Record<string, boolean> = {};
      let providerVerificationState: Record<string, string> = {};
      if (slugs.length > 0) {
        const { data: bpProviders } = await db
          .from("business_profiles")
          .select("slug, display_name, source_provider_id, email, phone, account_id, metadata")
          .in("slug", slugs);
        providerNames = Object.fromEntries(
          (bpProviders ?? []).map((p) => [p.slug, p.display_name])
        );
        providerEditorIds = Object.fromEntries(
          (bpProviders ?? []).filter((p) => p.source_provider_id).map((p) => [p.slug, p.source_provider_id])
        );
        for (const p of bpProviders ?? []) {
          if (p.slug && p.email) providerEmails[p.slug] = p.email;
          if (p.slug && p.phone) providerPhones[p.slug] = p.phone;
        }
        for (const p of bpProviders ?? []) {
          if (p.slug) {
            providerClaimStatus[p.slug] = !!p.account_id;
            const meta = p.metadata as Record<string, unknown> | null;
            providerVerificationState[p.slug] = (meta?.verification_state as string) || "unverified";
          }
        }

        const missingSlugs = slugs.filter((s) => !providerNames[s]);
        if (missingSlugs.length > 0) {
          const { data: iosProviders } = await db
            .from("olera-providers")
            .select("slug, provider_id, provider_name, email, phone")
            .in("slug", missingSlugs)
            .not("deleted", "is", true);
          for (const p of iosProviders ?? []) {
            if (p.slug && p.provider_name) providerNames[p.slug] = p.provider_name;
            if (p.slug && p.provider_id) providerEditorIds[p.slug] = p.provider_id;
            if (p.slug && p.email && !providerEmails[p.slug]) providerEmails[p.slug] = p.email;
            if (p.slug && p.phone && !providerPhones[p.slug]) providerPhones[p.slug] = p.phone;
          }
        }
      }

      const enriched = questions.map((q) => ({
        ...q,
        provider_name: providerNames[q.provider_id] || null,
        provider_editor_id: providerEditorIds[q.provider_id] || null,
        provider_email: providerEmails[q.provider_id] || null,
        provider_phone: providerPhones[q.provider_id] || null,
        is_account_claimed: providerClaimStatus[q.provider_id] ?? false,
        verification_state: providerVerificationState[q.provider_id] || null,
      }));

      return NextResponse.json({ questions: enriched, count });
    }

    // For not_interested, show questions where provider is marked as not interested
    if (notInterested) {
      let notInterestedQuery = db
        .from("provider_questions")
        .select("*")
        .contains("metadata", { provider_not_interested: true })
        .neq("status", "archived")
        .neq("status", "rejected")
        .order("created_at", { ascending: false })
        .limit(10000);

      if (searchSlugs) {
        if (searchSlugs.length === 0) return NextResponse.json({ questions: [], count: 0 });
        notInterestedQuery = (notInterestedQuery as any).in("provider_id", searchSlugs);
      }
      if (dateFrom) notInterestedQuery = (notInterestedQuery as any).gte("created_at", dateFrom);
      if (dateTo) notInterestedQuery = (notInterestedQuery as any).lt("created_at", dateTo);

      const { data: allNotInterestedQuestions, error: notInterestedError } = await notInterestedQuery;
      if (notInterestedError) {
        console.error("Admin questions fetch error:", notInterestedError);
        return NextResponse.json({ error: "Failed to fetch questions" }, { status: 500 });
      }

      // Apply pagination
      const questions = (allNotInterestedQuestions ?? []).slice(offset, offset + limit);
      const count = (allNotInterestedQuestions ?? []).length;

      // Enrich with provider data
      const slugs = [...new Set(questions.map((q) => q.provider_id).filter(Boolean))];
      let providerNames: Record<string, string> = {};
      let providerEditorIds: Record<string, string> = {};
      let providerEmails: Record<string, string> = {};
      let providerPhones: Record<string, string> = {};
      let providerClaimStatus: Record<string, boolean> = {};
      let providerVerificationState: Record<string, string> = {};
      if (slugs.length > 0) {
        const { data: bpProviders } = await db
          .from("business_profiles")
          .select("slug, display_name, source_provider_id, email, phone, account_id, metadata")
          .in("slug", slugs);
        providerNames = Object.fromEntries(
          (bpProviders ?? []).map((p) => [p.slug, p.display_name])
        );
        providerEditorIds = Object.fromEntries(
          (bpProviders ?? []).filter((p) => p.source_provider_id).map((p) => [p.slug, p.source_provider_id])
        );
        for (const p of bpProviders ?? []) {
          if (p.slug && p.email) providerEmails[p.slug] = p.email;
          if (p.slug && p.phone) providerPhones[p.slug] = p.phone;
        }
        for (const p of bpProviders ?? []) {
          if (p.slug) {
            providerClaimStatus[p.slug] = !!p.account_id;
            const meta = p.metadata as Record<string, unknown> | null;
            providerVerificationState[p.slug] = (meta?.verification_state as string) || "unverified";
          }
        }

        const missingSlugs = slugs.filter((s) => !providerNames[s]);
        if (missingSlugs.length > 0) {
          const { data: iosProviders } = await db
            .from("olera-providers")
            .select("slug, provider_id, provider_name, email, phone")
            .in("slug", missingSlugs)
            .not("deleted", "is", true);
          for (const p of iosProviders ?? []) {
            if (p.slug && p.provider_name) providerNames[p.slug] = p.provider_name;
            if (p.slug && p.provider_id) providerEditorIds[p.slug] = p.provider_id;
            if (p.slug && p.email && !providerEmails[p.slug]) providerEmails[p.slug] = p.email;
            if (p.slug && p.phone && !providerPhones[p.slug]) providerPhones[p.slug] = p.phone;
          }
        }
      }

      const enriched = questions.map((q) => ({
        ...q,
        provider_name: providerNames[q.provider_id] || null,
        provider_editor_id: providerEditorIds[q.provider_id] || null,
        provider_email: providerEmails[q.provider_id] || null,
        provider_phone: providerPhones[q.provider_id] || null,
        is_account_claimed: providerClaimStatus[q.provider_id] ?? false,
        verification_state: providerVerificationState[q.provider_id] || null,
      }));

      return NextResponse.json({ questions: enriched, count });
    }

    // Standard query path (non-needs_email, non-delivery_issues, non-not_interested)
    let query = db
      .from("provider_questions")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq("status", status);
    if (providerId) query = query.eq("provider_id", providerId);
    if (searchSlugs) {
      if (searchSlugs.length === 0) return NextResponse.json({ questions: [], count: 0 });
      query = query.in("provider_id", searchSlugs);
    }
    if (dateFrom) query = query.gte("created_at", dateFrom);
    if (dateTo) query = query.lt("created_at", dateTo);

    const { data: questions, count, error } = await query;

    if (error) {
      console.error("Admin questions fetch error:", error);
      return NextResponse.json({ error: "Failed to fetch questions" }, { status: 500 });
    }

    // Enrich with provider display names
    const slugs = [...new Set((questions ?? []).map((q) => q.provider_id).filter(Boolean))];
    let providerNames: Record<string, string> = {};
    let providerEditorIds: Record<string, string> = {};
    let providerEmails: Record<string, string> = {};
    let providerPhones: Record<string, string> = {};
    let providerClaimStatus: Record<string, boolean> = {};
    let providerVerificationState: Record<string, string> = {};
    if (slugs.length > 0) {
      // Try business_profiles first
      const { data: bpProviders } = await db
        .from("business_profiles")
        .select("slug, display_name, source_provider_id, email, phone, account_id, metadata")
        .in("slug", slugs);
      providerNames = Object.fromEntries(
        (bpProviders ?? []).map((p) => [p.slug, p.display_name])
      );
      providerEditorIds = Object.fromEntries(
        (bpProviders ?? []).filter((p) => p.source_provider_id).map((p) => [p.slug, p.source_provider_id])
      );
      for (const p of bpProviders ?? []) {
        if (p.slug && p.email) providerEmails[p.slug] = p.email;
        if (p.slug && p.phone) providerPhones[p.slug] = p.phone;
      }

      // Build claim/verification status maps
      for (const p of bpProviders ?? []) {
        if (p.slug) {
          providerClaimStatus[p.slug] = !!p.account_id;
          const meta = p.metadata as Record<string, unknown> | null;
          providerVerificationState[p.slug] = (meta?.verification_state as string) || "unverified";
        }
      }

      // For slugs not found in business_profiles, try olera-providers
      const missingSlugs = slugs.filter((s) => !providerNames[s]);
      if (missingSlugs.length > 0) {
        const { data: iosProviders } = await db
          .from("olera-providers")
          .select("slug, provider_id, provider_name, email, phone")
          .in("slug", missingSlugs)
          .not("deleted", "is", true);
        for (const p of iosProviders ?? []) {
          if (p.slug && p.provider_name) providerNames[p.slug] = p.provider_name;
          if (p.slug && p.provider_id) providerEditorIds[p.slug] = p.provider_id;
          if (p.slug && p.email && !providerEmails[p.slug]) providerEmails[p.slug] = p.email;
          if (p.slug && p.phone && !providerPhones[p.slug]) providerPhones[p.slug] = p.phone;
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
      provider_phone: providerPhones[q.provider_id] || null,
      is_account_claimed: providerClaimStatus[q.provider_id] ?? false,
      verification_state: providerVerificationState[q.provider_id] || null,
    }));

    // Fetch tab counts for pending, needs_email, delivery_issues, not_interested, and archived
    const [pendingCount, needsEmailCount, deliveryIssuesCount, notInterestedCount, archivedCount] = await Promise.all([
      db.from("provider_questions").select("*", { count: "exact", head: true }).eq("status", "pending"),
      db.from("provider_questions").select("*", { count: "exact", head: true }).contains("metadata", { needs_provider_email: true }).neq("status", "archived").neq("status", "rejected"),
      db.from("provider_questions").select("*", { count: "exact", head: true }).contains("metadata", { email_dead: true }).neq("status", "archived").neq("status", "rejected"),
      db.from("provider_questions").select("*", { count: "exact", head: true }).contains("metadata", { provider_not_interested: true }).neq("status", "archived").neq("status", "rejected"),
      db.from("provider_questions").select("*", { count: "exact", head: true }).eq("status", "archived"),
    ]);

    return NextResponse.json({
      questions: enriched,
      count: count ?? 0,
      tabCounts: {
        pending: pendingCount.count ?? 0,
        needs_email: needsEmailCount.count ?? 0,
        delivery_issues: deliveryIssuesCount.count ?? 0,
        not_interested: notInterestedCount.count ?? 0,
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
