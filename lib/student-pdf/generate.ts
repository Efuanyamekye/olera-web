/**
 * Server-side: render a Student Profile PDF buffer.
 *
 * Assets (logo + student photo) are loaded and encoded as base64 data URIs
 * so @react-pdf/renderer can embed them inline without network fetches.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import React, { type ReactElement } from "react";
import {
  StudentPdfTemplate,
  type StudentPdfData,
  type StudentPdfAssets,
} from "./Template";

/**
 * Read a file from /public as a base64 data URI.
 * Returns undefined if the file is missing.
 */
async function publicAssetDataUri(
  relativePath: string,
  mimeType: string
): Promise<string | undefined> {
  try {
    const absPath = path.join(process.cwd(), "public", relativePath);
    const buf = await fs.readFile(absPath);
    return `data:${mimeType};base64,${buf.toString("base64")}`;
  } catch {
    return undefined;
  }
}

/**
 * Fetch an external image URL and convert to base64 data URI.
 * Returns undefined if fetch fails.
 */
async function fetchImageAsDataUri(
  url: string
): Promise<string | undefined> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return undefined;

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    return `data:${contentType};base64,${base64}`;
  } catch {
    return undefined;
  }
}

/**
 * Load assets for the student PDF.
 */
async function loadAssets(
  studentImageUrl: string | null
): Promise<StudentPdfAssets> {
  const [logoDataUri, photoDataUri] = await Promise.all([
    publicAssetDataUri("images/olera-logo.png", "image/png"),
    studentImageUrl ? fetchImageAsDataUri(studentImageUrl) : undefined,
  ]);

  return {
    logoDataUri,
    photoDataUri,
  };
}

/**
 * Render the Student Profile PDF. Returns the PDF as a Buffer.
 */
export async function renderStudentPdf(student: StudentPdfData): Promise<Buffer> {
  const assets = await loadAssets(student.image_url);

  const element = React.createElement(StudentPdfTemplate, {
    student,
    assets,
  }) as unknown as ReactElement<DocumentProps>;

  const buffer = await renderToBuffer(element);
  return buffer;
}

/**
 * Generate a filename for the student PDF.
 */
export function studentPdfFilename(student: StudentPdfData): string {
  // Sanitize name for filename
  const safeName = student.display_name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const date = new Date().toISOString().split("T")[0];
  return `${safeName}-profile-${date}.pdf`;
}
