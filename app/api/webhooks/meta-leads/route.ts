import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/admin";
import { extractNativeReceipts, parseNativeForms, verifyMetaSignature } from "@/lib/city-ads/meta-native";

export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const token = process.env.META_LEADS_VERIFY_TOKEN;
  if (!token) return new NextResponse("Not configured", { status: 503 });
  if (q.get("hub.mode") !== "subscribe" || q.get("hub.verify_token") !== token || !q.get("hub.challenge")) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  return new NextResponse(q.get("hub.challenge"), { headers: { "Content-Type": "text/plain" } });
}
export async function POST(req: NextRequest) {
  const secret = process.env.META_LEADS_APP_SECRET;
  if (!secret || !process.env.META_LEADS_FORMS_JSON) return new NextResponse("Not configured", { status: 503 });
  const raw = await req.text();
  if (raw.length > 1000000) return new NextResponse("Payload too large", { status: 413 });
  if (!verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"), secret)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  try {
    const receipts = extractNativeReceipts(JSON.parse(raw), parseNativeForms(process.env.META_LEADS_FORMS_JSON));
    if (receipts.length) {
      const { error } = await getServiceClient().from("meta_lead_receipts")
        .upsert(receipts, { onConflict: "leadgen_id", ignoreDuplicates: true });
      if (error) throw new Error("Receipt storage failed");
    }
    // Acknowledge only after durable storage. The existing five-minute clock
    // retrieves contact details; no third-party calls delay webhook acceptance.
    return NextResponse.json({ ok: true });
  } catch {
    console.error("[meta-leads] Could not store notification");
    return new NextResponse("Retry later", { status: 503 });
  }
}
