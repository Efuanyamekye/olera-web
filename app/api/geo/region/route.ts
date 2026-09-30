import { NextResponse } from "next/server";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

/**
 * The visitor's US state from Vercel's IP geolocation, for the Benefits Hub's
 * "Use my location" button. The hub itself stays static; only this call reads
 * request headers. Returns null outside the US or when the header is absent
 * (local dev, previews behind some proxies).
 */
export async function GET() {
  const h = await headers();
  const country = h.get("x-vercel-ip-country");
  const region = h.get("x-vercel-ip-country-region");
  const ok = country === "US" && region && /^[A-Z]{2}$/.test(region);
  return NextResponse.json({ region: ok ? region : null }, { headers: { "Cache-Control": "no-store" } });
}
