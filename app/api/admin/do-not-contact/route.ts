import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient, logAuditAction } from "@/lib/admin";

const VALID_REASONS = new Set([
  "provider_request",
  "angry_optout",
  "legal",
  "spam_complaint",
  "other",
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Digits-only, keep the last 10 (drop US country code) for a stable store/compare. */
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

/**
 * GET /api/admin/do-not-contact
 *
 * List all do-not-contact entries, newest first.
 * Optional query: ?q=<text> — substring match against email or phone.
 */
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

    const db = getServiceClient();
    const q = request.nextUrl.searchParams.get("q")?.trim();

    let query = db
      .from("do_not_contact")
      .select("*")
      .order("created_at", { ascending: false });

    if (q) {
      query = query.or(`email.ilike.%${q}%,phone.ilike.%${q}%`);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[do-not-contact GET]", error);
      return NextResponse.json({ error: "Failed to load list" }, { status: 500 });
    }

    return NextResponse.json({ entries: data ?? [] });
  } catch (err) {
    console.error("[do-not-contact GET] unexpected", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * POST /api/admin/do-not-contact
 *
 * Add an address (and optional phone) to the kill switch.
 * Body: { email?, phone?, reason, note? } — at least one of email/phone required.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const adminUser = await getAdminUser(user.id);
    if (!adminUser) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const body = await request.json();

    const email =
      typeof body.email === "string" && body.email.trim()
        ? body.email.trim().toLowerCase()
        : null;
    const phoneRaw =
      typeof body.phone === "string" && body.phone.trim() ? body.phone.trim() : null;

    if (!email && !phoneRaw) {
      return NextResponse.json(
        { error: "An email or phone number is required" },
        { status: 400 }
      );
    }
    if (email && !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    let phone: string | null = null;
    if (phoneRaw) {
      phone = normalizePhone(phoneRaw);
      if (!phone) {
        return NextResponse.json(
          { error: "Phone must have at least 10 digits" },
          { status: 400 }
        );
      }
    }

    const reason = typeof body.reason === "string" ? body.reason : "";
    if (!VALID_REASONS.has(reason)) {
      return NextResponse.json(
        { error: `reason must be one of: ${[...VALID_REASONS].join(", ")}` },
        { status: 400 }
      );
    }

    const note =
      typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;

    const db = getServiceClient();
    const { data, error } = await db
      .from("do_not_contact")
      .insert({
        email,
        phone,
        reason,
        note,
        created_by: adminUser.email,
      })
      .select()
      .single();

    if (error) {
      // 23505 = unique_violation on email or phone (already on the list)
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "This email or phone is already on the do-not-contact list" },
          { status: 409 }
        );
      }
      console.error("[do-not-contact POST]", error);
      return NextResponse.json({ error: "Failed to add entry" }, { status: 500 });
    }

    await logAuditAction({
      adminUserId: adminUser.id,
      action: "do_not_contact_add",
      targetType: "do_not_contact",
      targetId: data.id,
      details: { email, phone, reason },
    });

    return NextResponse.json({ entry: data });
  } catch (err) {
    console.error("[do-not-contact POST] unexpected", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/do-not-contact?id=<uuid>
 *
 * Remove an entry (re-enable contact). Only use when added in error — a genuine
 * removal request should stay suppressed.
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const adminUser = await getAdminUser(user.id);
    if (!adminUser) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const id = request.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const db = getServiceClient();
    const { data: existing } = await db
      .from("do_not_contact")
      .select("email, phone, reason")
      .eq("id", id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    const { error } = await db.from("do_not_contact").delete().eq("id", id);
    if (error) {
      console.error("[do-not-contact DELETE]", error);
      return NextResponse.json({ error: "Failed to delete entry" }, { status: 500 });
    }

    await logAuditAction({
      adminUserId: adminUser.id,
      action: "do_not_contact_remove",
      targetType: "do_not_contact",
      targetId: id,
      details: existing,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[do-not-contact DELETE] unexpected", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
