import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient, logAuditAction } from "@/lib/admin";

/**
 * GET /api/admin/questions/export
 *
 * Export questions as CSV for manual outreach workflow.
 * By default exports "needs_email" questions with provider contact info.
 *
 * Query params:
 *   tab - "needs_email" (default), "delivery_issues", "unanswered", "answered", "archived", "all"
 *   date_from - ISO date (inclusive)
 *   date_to - ISO date (exclusive)
 *   search - filter by provider name
 */

interface QuestionRow {
  id: string;
  provider_id: string;
  asker_name: string;
  asker_email: string | null;
  question: string;
  answer: string | null;
  status: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

interface ProviderInfo {
  name: string;
  city: string;
  state: string;
  phone: string;
  email: string;
  address: string;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const adminUser = await getAdminUser(user.id);
    if (!adminUser) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const tab = searchParams.get("tab") || "needs_email";
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");
    const search = searchParams.get("search")?.trim() || "";

    const db = getServiceClient();

    // Search by provider name requires finding matching slugs first
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
      if (searchSlugs.length === 0) {
        // No matching providers, return empty CSV
        return new NextResponse("Question,Asker Name,Asker Email,Provider Name,Provider City,Provider State,Provider Phone,Provider Email,Provider Address,Status,Date\n", {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="olera-questions-${tab}-${new Date().toISOString().slice(0, 10)}.csv"`,
          },
        });
      }
    }

    // Paginated fetch — Supabase has a 1000-row default limit, so we fetch
    // in batches to ensure we get all matching questions regardless of volume.
    const PAGE_SIZE = 1000;
    let allQuestions: QuestionRow[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      let query = db
        .from("provider_questions")
        .select("id, provider_id, asker_name, asker_email, question, answer, status, created_at, metadata")
        .order("created_at", { ascending: false });

      // Apply tab filter
      if (tab === "needs_email") {
        query = query.contains("metadata", { needs_provider_email: true });
        query = query.neq("status", "archived").neq("status", "rejected");
      } else if (tab === "delivery_issues") {
        query = query.contains("metadata", { email_dead: true });
        query = query.neq("status", "archived").neq("status", "rejected").neq("status", "answered");
      } else if (tab === "not_interested") {
        query = query.contains("metadata", { provider_not_interested: true });
        query = query.neq("status", "archived").neq("status", "rejected");
      } else if (tab === "unanswered") {
        query = query.eq("status", "pending");
      } else if (tab === "answered") {
        query = query.eq("status", "answered");
      } else if (tab === "archived") {
        query = query.eq("status", "archived");
      }
      // "all" has no status filter

      if (dateFrom) query = query.gte("created_at", dateFrom);
      if (dateTo) query = query.lt("created_at", dateTo);
      if (searchSlugs) query = query.in("provider_id", searchSlugs);

      query = query.range(offset, offset + PAGE_SIZE - 1);

      const { data: pageData, error: pageError } = await query;

      if (pageError) {
        console.error("Questions export query error:", pageError);
        return NextResponse.json({ error: "Failed to export questions" }, { status: 500 });
      }

      const rows = (pageData ?? []) as QuestionRow[];
      allQuestions = allQuestions.concat(rows);
      offset += PAGE_SIZE;
      hasMore = rows.length === PAGE_SIZE;
    }

    // For unanswered tab, filter out questions that belong in other tabs
    // (same logic as the main API)
    let questionRows = allQuestions;
    if (tab === "unanswered") {
      questionRows = allQuestions.filter((q) => {
        const meta = q.metadata as Record<string, unknown> | null;
        if (meta?.email_dead === true) return false;
        if (meta?.provider_not_interested === true) return false;
        if (meta?.needs_provider_email === true) return false;
        return true;
      });
    }

    // Collect unique provider slugs
    const slugs = [...new Set(questionRows.map((q) => q.provider_id).filter(Boolean))];

    // Fetch provider info from both tables
    const providerInfo: Record<string, ProviderInfo> = {};

    if (slugs.length > 0) {
      // Try business_profiles first (include source_provider_id for email fallback)
      const { data: bpProviders } = await db
        .from("business_profiles")
        .select("slug, display_name, city, state, phone, email, address_line1, address_line2, source_provider_id")
        .in("slug", slugs);

      // Track which slugs need email fallback from olera-providers
      const slugsNeedingEmailFallback: { slug: string; sourceId: string }[] = [];

      for (const p of bpProviders ?? []) {
        if (p.slug) {
          const addressParts = [p.address_line1, p.address_line2].filter(Boolean);
          providerInfo[p.slug] = {
            name: p.display_name || "",
            city: p.city || "",
            state: p.state || "",
            phone: p.phone || "",
            email: p.email || "",
            address: addressParts.join(", "),
          };
          // If no email but has source_provider_id, mark for fallback lookup
          if (!p.email && p.source_provider_id) {
            slugsNeedingEmailFallback.push({ slug: p.slug, sourceId: p.source_provider_id });
          }
        }
      }

      // For slugs not found in business_profiles, try olera-providers
      const missingSlugs = slugs.filter((s) => !providerInfo[s]);
      const sourceIdsForFallback = slugsNeedingEmailFallback.map((x) => x.sourceId);

      // Build OR conditions (only include non-empty arrays)
      const orConditions: string[] = [];
      if (missingSlugs.length > 0) {
        orConditions.push(`slug.in.(${missingSlugs.map(s => `"${s}"`).join(',')})`);
      }
      if (sourceIdsForFallback.length > 0) {
        orConditions.push(`provider_id.in.(${sourceIdsForFallback.map(s => `"${s}"`).join(',')})`);
      }

      if (orConditions.length > 0) {
        const { data: iosProviders } = await db
          .from("olera-providers")
          .select("slug, provider_id, provider_name, city, state, phone, email, address")
          .or(orConditions.join(','))
          .not("deleted", "is", true);

        // Build lookup by provider_id for email/phone fallback
        const iosByProviderId = new Map<string, { email?: string; phone?: string }>();
        for (const p of iosProviders ?? []) {
          if (p.provider_id) {
            iosByProviderId.set(p.provider_id, { email: p.email || undefined, phone: p.phone || undefined });
          }
        }

        // Fill in email/phone for business_profiles providers via source_provider_id fallback
        for (const { slug, sourceId } of slugsNeedingEmailFallback) {
          const fallback = iosByProviderId.get(sourceId);
          if (fallback) {
            if (!providerInfo[slug].email && fallback.email) {
              providerInfo[slug].email = fallback.email;
            }
            if (!providerInfo[slug].phone && fallback.phone) {
              providerInfo[slug].phone = fallback.phone;
            }
          }
        }

        // Fill in data for providers only in olera-providers
        for (const p of iosProviders ?? []) {
          if (p.slug && !providerInfo[p.slug]) {
            providerInfo[p.slug] = {
              name: p.provider_name || "",
              city: p.city || "",
              state: p.state || "",
              phone: p.phone || "",
              email: p.email || "",
              address: p.address || "",
            };
          }
        }
      }
    }

    // Build CSV
    const headers = [
      "Question",
      "Asker Name",
      "Asker Email",
      "Provider Name",
      "Provider City",
      "Provider State",
      "Provider Phone",
      "Provider Email",
      "Provider Address",
      "Status",
      "Date",
    ];

    const lines = [headers.join(",")];

    for (const q of questionRows) {
      const provider = providerInfo[q.provider_id] || {
        name: "",
        city: "",
        state: "",
        phone: "",
        email: "",
        address: "",
      };

      lines.push([
        csvEscape(q.question || ""),
        csvEscape(q.asker_name || ""),
        csvEscape(q.asker_email || ""),
        csvEscape(provider.name),
        csvEscape(provider.city),
        csvEscape(provider.state),
        csvEscape(provider.phone),
        csvEscape(provider.email),
        csvEscape(provider.address),
        csvEscape(q.status || ""),
        q.created_at ? new Date(q.created_at).toISOString().slice(0, 10) : "",
      ].join(","));
    }

    const csv = lines.join("\n");
    const filename = `olera-questions-${tab}-${new Date().toISOString().slice(0, 10)}.csv`;

    await logAuditAction({
      adminUserId: adminUser.id,
      action: "export_questions",
      targetType: "questions",
      targetId: "bulk_export",
      details: {
        filters: { tab, dateFrom, dateTo, search },
        row_count: questionRows.length,
      },
    });

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("Questions export error:", err);
    return NextResponse.json(
      { error: `Internal server error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
