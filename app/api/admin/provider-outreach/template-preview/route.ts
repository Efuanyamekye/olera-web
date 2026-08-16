import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser } from "@/lib/admin";
import {
  type ProviderOutreachTemplateKey,
  renderEmail,
  type TemplateContext,
} from "@/lib/provider-outreach";
import { renderTemplateAsSmartleadHtml } from "@/lib/provider-outreach/smartlead-bridge";
import { isSmartleadConfigured } from "@/lib/smartlead";

/**
 * GET /api/admin/provider-outreach/template-preview
 *
 * Returns a rendered HTML preview of a provider outreach email template.
 *
 * Query params:
 *   - template: string (required) - Template key: intro, followup, demand_loss, final, nudge
 *   - engine: "smartlead" | "resend" (optional) - Which rendering engine to use
 *     Defaults to "smartlead" when SmartLead is configured, otherwise "resend"
 *   - email_source: "organization" | "decision_maker" (optional) - Preview personalization
 *     "decision_maker" shows personalized greeting (e.g., "Hi John,")
 *     "organization" (default) shows org name greeting (e.g., "Hi Sunrise Senior Care,")
 *
 * Returns:
 *   - html: string - Fully rendered HTML email
 *   - subject: string - Email subject line
 *   - template_key: string - The template key
 *   - engine: string - Which engine was used for rendering
 *   - smartlead_configured: boolean - Whether SmartLead is configured
 *   - email_source: string - Which greeting style was used
 */

const VALID_TEMPLATES: ProviderOutreachTemplateKey[] = [
  "intro",
  "followup",
  "demand_loss",
  "final",
  "nudge",
];

// Sample context for preview rendering - organization version (no decision_maker)
// NOTE: city_views set to 5 (below threshold of 10) to match SmartLead behavior.
// SmartLead uses generic "Families are searching..." headline since it can't
// conditionally change email body per-lead. Preview should reflect this.
const SAMPLE_CONTEXT_ORG: TemplateContext = {
  provider_name: "Sunrise Senior Care",
  city: "Austin",
  state: "TX",
  category: "home care",
  profile_url: "https://olera.care/provider/sunrise-senior-care-austin",
  claim_url: "https://olera.care/claim/sample-token",
  manage_url: "https://olera.care/manage/sample-token",
  remove_url: "https://olera.care/remove/sample-token",
  unsubscribe_url: "https://olera.care/unsubscribe/sample-token",
  mailing_address: "340 S Lemon Ave #1439, Walnut, CA 91789",
  gap_list: "no pricing, no photos, and no description",
  city_views: 5, // Below threshold to show generic headline (matches SmartLead)
};

// Sample context for preview rendering - decision_maker version (personalized greeting)
const SAMPLE_CONTEXT_DM: TemplateContext = {
  ...SAMPLE_CONTEXT_ORG,
  decision_maker: {
    first_name: "John",
    last_name: "Smith",
    title: "Executive Director",
  },
};

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
    const template = searchParams.get("template") as ProviderOutreachTemplateKey | null;
    const engineParam = searchParams.get("engine") as "smartlead" | "resend" | null;
    const emailSource = searchParams.get("email_source") as "organization" | "decision_maker" | null;

    if (!template || !VALID_TEMPLATES.includes(template)) {
      return NextResponse.json(
        { error: `Invalid template. Must be one of: ${VALID_TEMPLATES.join(", ")}` },
        { status: 400 }
      );
    }

    const smartleadConfigured = isSmartleadConfigured();
    // Default to SmartLead when configured, otherwise Resend
    const engine = engineParam || (smartleadConfigured ? "smartlead" : "resend");

    // Use decision_maker context for personalized greeting preview
    const context = emailSource === "decision_maker" ? SAMPLE_CONTEXT_DM : SAMPLE_CONTEXT_ORG;

    // Use SmartLead rendering for ALL templates when requested
    // This includes nudge (which isn't in the cadence but should preview correctly)
    if (engine === "smartlead") {
      const rendered = renderTemplateAsSmartleadHtml(template, context);

      return NextResponse.json({
        html: rendered.html,
        subject: rendered.subject,
        template_key: template,
        engine: "smartlead",
        smartlead_configured: smartleadConfigured,
        email_source: emailSource || "organization",
      });
    }

    // Resend rendering
    const rendered = renderEmail(template, context);

    return NextResponse.json({
      html: rendered.html,
      subject: rendered.subject,
      template_key: template,
      engine: "resend",
      smartlead_configured: smartleadConfigured,
      email_source: emailSource || "organization",
    });
  } catch (error) {
    console.error("Error in template-preview:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
