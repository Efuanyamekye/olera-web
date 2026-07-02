import { NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import { getCronJob } from "@/lib/crons/registry";
import { providerWeeklyDigestEmail, coldProviderRankEmail, providerProfileCompletionEmail, providerLeadDigestEmail, providerManagedAdsEmail } from "@/lib/email-templates";
import { resolveFromAddress } from "@/lib/email";
import { getVariant } from "@/lib/email-samples";

/** Pull the inbox preview text (preheader) out of a rendered email's hidden preheader div. */
function extractPreheader(html: string): string | null {
  const m = html.match(/<div style="display:none[^"]*">([\s\S]*?)<\/div>/);
  if (!m) return null;
  let t = m[1];
  const z = t.indexOf("&zwnj;");
  if (z >= 0) t = t.slice(0, z); // drop the trailing spacer run
  t = t
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .trim();
  return t || null;
}

// Representative sample of each weekly-digest variant, rendered from the live templates with canned
// (PII-free) data — so every variant is viewable in the admin even before its first real send.
const SAMPLE_BASE = {
  providerName: "Evergreen Home Care", providerSlug: "evergreen-home-care", tier: "low" as const,
  viewsPriorWeek: 6, deltaPct: 33, localDemand: 140, areaDemand: 210, city: "Austin", category: "home_care",
  topSource: "Google search",
};
const SAMPLE_LINK = "https://olera.care/provider/evergreen-home-care/onboard";
function digestVariantSample(variant: string): { subject: string; html: string } | null {
  switch (variant) {
    case "family_question":
      return {
        subject: "A family has a question about Evergreen Home Care",
        html: providerWeeklyDigestEmail({
          ...SAMPLE_BASE, viewsThisWeek: 9, ctaClicks: 2, leadsReceived: 0, questionsReceived: 1,
          unansweredQuestion: { id: "sample", question: "Do you accept Medicaid, and is weekend care available for my mother?", totalCount: 1 },
          answerUrl: `${SAMPLE_LINK}?action=question`, marketRank: null,
        }),
      };
    case "weekly_digest_rank":
      return {
        subject: "You're #3 of 21 home care agencies in Austin",
        html: providerWeeklyDigestEmail({
          ...SAMPLE_BASE, viewsThisWeek: 12, ctaClicks: 3, leadsReceived: 1, questionsReceived: 0,
          marketRank: { rank: 3, outOf: 21, cityLabel: "Austin", careLabel: "home care", flattering: true },
        }),
      };
    case "referral_teaser":
      return {
        subject: "3 Austin-area places families may ask about care",
        html: providerWeeklyDigestEmail({
          ...SAMPLE_BASE, viewsThisWeek: 4, ctaClicks: 1, leadsReceived: 0, questionsReceived: 0,
          marketRank: { rank: 3, outOf: 21, cityLabel: "Austin", careLabel: "home care", flattering: true },
          referralTeaser: {
            totalSources: 18,
            starterTotal: 5,
            workedCount: 0,
            respondedCount: 0,
            referringCount: 0,
            targets: [
              { name: "St. David's South Austin Medical Center", category: "hospital", distanceMiles: 2.4 },
              { name: "Austin Wellness & Rehabilitation", category: "skilled_nursing", distanceMiles: 3.1 },
              { name: "AGE of Central Texas", category: "senior_resource", distanceMiles: 4.8 },
            ],
          },
          marketUrl: `${SAMPLE_LINK}?action=market`,
        }),
      };
    case "weekly_digest_plain":
      return {
        subject: "9 families viewed your page this week",
        html: providerWeeklyDigestEmail({
          ...SAMPLE_BASE, viewsThisWeek: 9, ctaClicks: 2, leadsReceived: 0, questionsReceived: 0, marketRank: null,
        }),
      };
    case "completion":
      return {
        subject: "See what families see on Evergreen Home Care",
        html: providerProfileCompletionEmail({
          providerName: "Evergreen Home Care", providerSlug: "evergreen-home-care", ctaUrl: SAMPLE_LINK,
        }),
      };
    case "cold_rank":
      return {
        subject: "Families in Austin rank you #3 of 21",
        html: coldProviderRankEmail({
          rank: 3, outOf: 21, cityLabel: "Austin", careLabel: "home care",
          ctaUrl: SAMPLE_LINK, manageUrl: SAMPLE_LINK, removeUrl: `${SAMPLE_LINK}/remove`, unsubscribeUrl: `${SAMPLE_LINK}/unsubscribe`,
        }),
      };
    case "leads":
      return {
        subject: "2 families reached out about Evergreen Home Care this week",
        html: providerLeadDigestEmail({
          providerName: "Evergreen Home Care", providerSlug: "evergreen-home-care", leadCount: 2,
          ctaUrl: SAMPLE_LINK, manageUrl: SAMPLE_LINK, unsubscribeUrl: `${SAMPLE_LINK}/unsubscribe`,
        }),
      };
    case "managed_ads":
      return {
        subject: "140 families searched for care near Austin this week",
        html: providerManagedAdsEmail({
          providerName: "Evergreen Home Care", providerSlug: "evergreen-home-care",
          ctaUrl: `${SAMPLE_LINK}?action=ads`, city: "Austin",
          category: "home_care_agency", localDemand: 140,
        }),
      };
    default:
      return null;
  }
}

/**
 * GET /api/admin/automations/[id]/preview?type=<email_type>[&raw=1]
 *
 * Returns the most recent *actual* email this automation sent (real recipient,
 * real interpolated variables) by pulling email_log.html_body — no template
 * re-rendering. `?raw=1` returns the HTML directly (Content-Type text/html) for
 * opening in a new tab; otherwise JSON { html, recipient, subject, sentAt,
 * metadata }. 404 if no rendered email exists for that type.
 *
 * `type` defaults to the job's first email_type. Must be one this job sends.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const admin = await getAdminUser(user.id);
  if (!admin) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  const { id } = await params;
  const job = getCronJob(id);
  if (!job) return NextResponse.json({ error: "Unknown automation" }, { status: 404 });
  if (job.emailTypes.length === 0) return NextResponse.json({ error: "This automation does not send email" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("raw") === "1";

  // Variant sample mode: render a representative sample of a digest variant from the live template.
  const variant = searchParams.get("variant");
  if (variant) {
    const sample = digestVariantSample(variant);
    if (sample) {
      if (raw) return new NextResponse(sample.html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
      return NextResponse.json({
        variant,
        html: sample.html,
        subject: sample.subject,
        sample: true,
        from: resolveFromAddress(undefined, job.emailTypes[0]),
        preheader: extractPreheader(sample.html),
      });
    }

    const registered = getVariant(variant);
    if (!registered || registered.cron !== job.id) {
      return NextResponse.json({ error: `Unknown variant "${variant}"` }, { status: 404 });
    }
    const html = registered.render();
    if (raw) return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    return NextResponse.json({
      variant,
      html,
      subject: registered.subject,
      sample: true,
      from: resolveFromAddress(undefined, registered.emailType),
      preheader: extractPreheader(html),
    });
  }

  const requested = searchParams.get("type");
  const type = requested && job.emailTypes.includes(requested) ? requested : job.emailTypes[0];

  const db = getServiceClient();
  const { data } = await db
    .from("email_log")
    .select("recipient, subject, html_body, metadata, created_at")
    .eq("email_type", type)
    .not("html_body", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data || !data.html_body) {
    return NextResponse.json({ error: `No rendered email found for type "${type}"` }, { status: 404 });
  }

  if (raw) {
    return new NextResponse(data.html_body, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
  return NextResponse.json({
    type,
    html: data.html_body,
    recipient: data.recipient,
    subject: data.subject,
    sentAt: data.created_at,
    metadata: data.metadata ?? null,
    from: resolveFromAddress(undefined, type),
    preheader: extractPreheader(data.html_body),
  });
}
