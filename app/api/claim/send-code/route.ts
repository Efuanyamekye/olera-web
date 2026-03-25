import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import { verificationCodeEmail } from "@/lib/email-templates";
import { sendSMS, normalizeUSPhone, maskPhone } from "@/lib/twilio";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***@***.com";
  const maskedLocal =
    local.length <= 2 ? "*".repeat(local.length) : local[0] + "***" + local[local.length - 1];
  return `${maskedLocal}@${domain}`;
}

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * POST /api/claim/send-code
 *
 * Sends a 6-digit verification code via email or SMS.
 * No authentication required — verification is tracked by claim_session UUID.
 *
 * Request body: { providerId: string, claimSession: string, method?: "email" | "sms" }
 * Returns: { emailHint: string } or { phoneHint: string } or error
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { providerId, claimSession, method = "email" } = body;

    if (!providerId) {
      return NextResponse.json({ error: "Provider ID is required." }, { status: 400 });
    }

    if (!claimSession || !UUID_RE.test(claimSession)) {
      return NextResponse.json({ error: "Valid claim session is required." }, { status: 400 });
    }

    const db = getAdminClient();
    if (!db) {
      return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
    }

    // Look up provider contact info
    // Strategy 1: Check olera-providers by provider_id
    let provider: { email: string | null; phone: string | null; provider_name: string | null } | null = null;

    const { data: oleraProvider } = await db
      .from("olera-providers")
      .select("email, phone, provider_name")
      .eq("provider_id", providerId)
      .single();

    if (oleraProvider) {
      provider = oleraProvider;
    }

    // Strategy 2: Check business_profiles by id (for native/claimed providers)
    if (!provider) {
      const { data: bp } = await db
        .from("business_profiles")
        .select("email, phone, display_name")
        .eq("id", providerId)
        .single();

      if (bp) {
        provider = {
          email: bp.email,
          phone: bp.phone,
          provider_name: bp.display_name,
        };
      }
    }

    // Strategy 3: Check business_profiles by source_provider_id (linked providers)
    if (!provider) {
      const { data: bp } = await db
        .from("business_profiles")
        .select("email, phone, display_name")
        .eq("source_provider_id", providerId)
        .single();

      if (bp) {
        provider = {
          email: bp.email,
          phone: bp.phone,
          provider_name: bp.display_name,
        };
      }
    }

    if (!provider) {
      return NextResponse.json({ error: "Provider not found." }, { status: 404 });
    }

    // Validate delivery method has a target
    if (method === "sms") {
      const normalized = provider.phone ? normalizeUSPhone(provider.phone) : null;
      if (!normalized) {
        return NextResponse.json(
          { error: "No phone number on file for this provider. Please use email verification." },
          { status: 422 }
        );
      }
    } else {
      if (!provider.email) {
        return NextResponse.json(
          { error: "No email on file for this provider. Please use the 'No access to email' option." },
          { status: 422 }
        );
      }
    }

    // Rate limit: progressive — 5 per 10 min, 10 per hour
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const [{ count: recentCount }, { count: hourlyCount }] = await Promise.all([
      db.from("claim_verification_codes").select("id", { count: "exact", head: true })
        .eq("provider_id", providerId).gte("created_at", tenMinAgo),
      db.from("claim_verification_codes").select("id", { count: "exact", head: true })
        .eq("provider_id", providerId).gte("created_at", oneHourAgo),
    ]);

    if ((recentCount ?? 0) >= 5) {
      return NextResponse.json(
        { error: "Too many attempts. Please wait a few minutes before trying again." },
        { status: 429 }
      );
    }
    if ((hourlyCount ?? 0) >= 10) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again in an hour." },
        { status: 429 }
      );
    }

    // Generate code and store with claim_session
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

    const { error: insertErr } = await db.from("claim_verification_codes").insert({
      provider_id: providerId,
      claim_session: claimSession,
      code,
      expires_at: expiresAt,
    });

    if (insertErr) {
      console.error("Insert verification code error:", insertErr);
      return NextResponse.json({ error: "Failed to generate code." }, { status: 500 });
    }

    // Send via chosen method
    if (method === "sms") {
      const phone = normalizeUSPhone(provider.phone!)!;
      const { success, error: smsErr } = await sendSMS({
        to: phone,
        body: `Your Olera verification code is: ${code}. It expires in 10 minutes.`,
      });

      if (!success) {
        console.error("SMS send error:", smsErr);
        return NextResponse.json({ error: "Failed to send SMS." }, { status: 500 });
      }

      return NextResponse.json({ phoneHint: maskPhone(phone) });
    }

    // Default: email
    const { success: emailSent, error: emailErrMsg } = await sendEmail({
      to: provider.email!,
      subject: "Your Olera verification code",
      html: verificationCodeEmail(provider.provider_name, code),
      emailType: "verification_code",
      recipientType: "provider",
      providerId,
    });

    if (!emailSent) {
      console.error("Email send error:", emailErrMsg);
      return NextResponse.json({ error: "Failed to send email." }, { status: 500 });
    }

    return NextResponse.json({ emailHint: maskEmail(provider.email!) });
  } catch (err) {
    console.error("Send code error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
