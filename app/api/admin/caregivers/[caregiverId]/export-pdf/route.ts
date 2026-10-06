import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import { renderStudentPdf, studentPdfFilename } from "@/lib/student-pdf/generate";
import type { StudentPdfData } from "@/lib/student-pdf/Template";
import type { StudentMetadata } from "@/lib/types";

/**
 * GET /api/admin/caregivers/[caregiverId]/export-pdf
 *
 * Generate and return a PDF of the student's profile.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ caregiverId: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const adminUser = await getAdminUser(user.id);
    if (!adminUser) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const { caregiverId: studentId } = await params;
    const db = getServiceClient();

    // Fetch student profile
    const { data: student, error } = await db
      .from("business_profiles")
      .select("*")
      .eq("id", studentId)
      .eq("type", "student")
      .single();

    if (error || !student) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    // Prepare student data for PDF
    const studentData: StudentPdfData = {
      id: student.id,
      display_name: student.display_name || "Unknown",
      email: student.email,
      phone: student.phone,
      city: student.city,
      state: student.state,
      image_url: student.image_url,
      is_active: student.is_active ?? false,
      created_at: student.created_at,
      metadata: (student.metadata || {}) as StudentMetadata,
    };

    // Generate PDF
    const pdfBuffer = await renderStudentPdf(studentData);
    const filename = studentPdfFilename(studentData);

    // Return PDF response (convert Buffer to Uint8Array for NextResponse)
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (err) {
    console.error("Student PDF export error:", err);
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 }
    );
  }
}
