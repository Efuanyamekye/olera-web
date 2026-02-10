import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/auth/check-email
 *
 * Checks whether an email address already exists in auth.users.
 * Used by the unified auth modal to detect new vs returning users
 * after the email-first entry screen.
 *
 * Request body: { email: string }
 * Response:     { exists: boolean }
 */
export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) {
      // Without admin access, we can't check — default to sign-up flow
      return NextResponse.json({ exists: false });
    }

    const admin = createClient(url, serviceKey);

    // Use listUsers with a filter — Supabase admin API supports
    // filtering by passing the page/perPage and checking manually.
    // We list users and filter by email match.
    const { data, error } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (error || !data?.users) {
      return NextResponse.json({ exists: false });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const exists = data.users.some(
      (u) => u.email?.toLowerCase() === normalizedEmail
    );

    return NextResponse.json({ exists });
  } catch {
    return NextResponse.json({ exists: false });
  }
}
