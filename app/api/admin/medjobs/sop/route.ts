import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { getAuthUser, getAdminUser } from "@/lib/admin";

/**
 * Serves the MedJobs SOP library to signed-in admins.
 *
 * `system` is the master implementation matrix; `admin`, `sales` and `crm` are
 * role views of it, built from the same source by
 * docs/medjobs/roles-src/build_roles.py. `walkthrough` and `video` are the
 * orientation pair linked from the System page.
 *
 * None of it is in `public/` on purpose: the matrix's thirty exhibits are
 * screenshots of this admin panel and the recording is an internal walkthrough,
 * so everything goes out behind the same guard as the rest of /api/admin rather
 * than to anyone holding the URL. The files ship with the repo and are traced
 * into the function by `outputFileTracingIncludes` in next.config.ts; without
 * those entries they exist in git and not in the bundle.
 */

export const runtime = "nodejs";

interface Doc {
  file: string;
  download: string;
  type: string;
  /** Video needs byte ranges so the scrubber works; a PDF is sent whole. */
  seekable?: boolean;
}

/** The whitelist is the security boundary: `doc` never reaches a path join. */
const DOCS: Record<string, Doc> = {
  system: {
    file: "docs/medjobs/MedJobs_2.0_Master_Implementation_Matrix.pdf",
    download: "MedJobs-2.0-Implementation-Matrix.pdf",
    type: "application/pdf",
  },
  admin: {
    file: "docs/medjobs/MedJobs_Admin_Team_Operations.pdf",
    download: "MedJobs-Admin-Team-Operations.pdf",
    type: "application/pdf",
  },
  sales: {
    file: "docs/medjobs/MedJobs_Sales_Lead_Operations.pdf",
    download: "MedJobs-Sales-Lead-Operations.pdf",
    type: "application/pdf",
  },
  crm: {
    file: "docs/medjobs/MedJobs_Consumer_Relations_Manager_Operations.pdf",
    download: "MedJobs-Consumer-Relations-Manager-Operations.pdf",
    type: "application/pdf",
  },
  activation: {
    file: "docs/medjobs/MedJobs_University_Activation_Guide.pdf",
    download: "MedJobs-University-Activation-Guide.pdf",
    type: "application/pdf",
  },
  walkthrough: {
    file: "docs/medjobs/MedJobs_Operating_System_Walkthrough_Summary.pdf",
    download: "MedJobs-Operating-System-Walkthrough-Summary.pdf",
    type: "application/pdf",
  },
  video: {
    file: "docs/medjobs/MedJobs_Operating_System_Walkthrough.mp4",
    download: "MedJobs-Operating-System-Walkthrough.mp4",
    type: "video/mp4",
    seekable: true,
  },
};

/** Parse a single `bytes=a-b` range against a known size. */
function parseRange(header: string | null, size: number) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const [, rawStart, rawEnd] = m;
  let start: number;
  let end: number;
  if (rawStart === "") {
    // suffix range: the last N bytes
    const n = Number(rawEnd);
    if (!rawEnd || !Number.isFinite(n) || n <= 0) return null;
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === "" ? size - 1 : Number(rawEnd);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start > end || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = await getAdminUser(user.id);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // No doc named means the master, which is what the route served before.
  const doc = DOCS[request.nextUrl.searchParams.get("doc") ?? "system"];
  if (!doc) return NextResponse.json({ error: "Unknown document" }, { status: 400 });

  const full = path.join(process.cwd(), doc.file);
  const headers: Record<string, string> = {
    "Content-Type": doc.type,
    "Content-Disposition": `inline; filename="${doc.download}"`,
    // private: it is per-admin content, so no shared cache should hold it
    "Cache-Control": "private, max-age=300",
  };

  try {
    if (doc.seekable) {
      const size = (await stat(full)).size;
      headers["Accept-Ranges"] = "bytes";
      const range = parseRange(request.headers.get("range"), size);
      if (range) {
        // A seek asks for one slice, so only that slice is read off disk.
        const handle = await readFile(full);
        const slice = handle.subarray(range.start, range.end + 1);
        return new NextResponse(new Uint8Array(slice), {
          status: 206,
          headers: {
            ...headers,
            "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
            "Content-Length": String(slice.byteLength),
          },
        });
      }
    }
    const file = await readFile(full);
    return new NextResponse(new Uint8Array(file), { headers });
  } catch {
    return NextResponse.json(
      { error: "Document not found in this deployment" },
      { status: 404 },
    );
  }
}
