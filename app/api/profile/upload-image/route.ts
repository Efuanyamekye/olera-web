import { NextRequest, NextResponse } from "next/server";
import { canActForProfile } from "@/lib/auth/profile-access.server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "profile-images";
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

export async function POST(req: NextRequest) {
  try {
    // Auth check
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse form data
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const profileId = formData.get("profileId") as string | null;
    const setAsProfilePhoto = formData.get("setAsProfilePhoto") === "true";

    if (!file || !profileId) {
      return NextResponse.json(
        { error: "File and profileId are required" },
        { status: 400 }
      );
    }

    // Validate file
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Please upload a JPEG, PNG, or WebP image." },
        { status: 400 }
      );
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "Image must be under 5MB." },
        { status: 400 }
      );
    }

    // Verify the profile belongs to this user
    const { data: profile } = await supabase
      .from("business_profiles")
      .select("id, account_id")
      .eq("id", profileId)
      .single();

    if (!profile) {
      return NextResponse.json(
        { error: "Profile not found" },
        { status: 404 }
      );
    }

    // Get admin client for storage operations
    const admin = getAdminClient();

    // The lookup above reads account_id but never compared it, so any
    // signed-in user could replace any profile's photo. Owners and team
    // members only (migration 272).
    if (admin && !(await canActForProfile(admin, user, profile.id))) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }
    if (!admin) {
      return NextResponse.json(
        { error: "Storage is not configured on the server." },
        { status: 500 }
      );
    }

    // Ensure bucket exists
    const { data: buckets } = await admin.storage.listBuckets();
    const bucketExists = buckets?.some((b) => b.name === BUCKET);
    if (!bucketExists) {
      await admin.storage.createBucket(BUCKET, {
        public: true,
        fileSizeLimit: MAX_SIZE,
        allowedMimeTypes: ALLOWED_TYPES,
      });
    }

    // Upload file
    const ext = file.name.split(".").pop() || "jpg";
    const fileName = `${profileId}-${Date.now()}.${ext}`;
    const filePath = `${fileName}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(filePath, buffer, {
        cacheControl: "3600",
        upsert: true,
        contentType: file.type,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload image." },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: urlData } = admin.storage
      .from(BUCKET)
      .getPublicUrl(filePath);

    // Update profile photo only when explicitly requested
    if (setAsProfilePhoto) {
      const { error: updateError } = await admin
        .from("business_profiles")
        .update({ image_url: urlData.publicUrl })
        .eq("id", profileId);

      if (updateError) {
        console.error("Profile update error:", updateError);
        return NextResponse.json(
          { error: "Image uploaded but failed to update profile." },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ imageUrl: urlData.publicUrl });
  } catch (err) {
    console.error("Upload handler error:", err);
    return NextResponse.json(
      { error: "Something went wrong." },
      { status: 500 }
    );
  }
}
