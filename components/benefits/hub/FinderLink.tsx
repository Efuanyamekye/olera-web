"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { finderHref, trackHubClick } from "./hub-links";

/**
 * A link into the finder that keeps a study link's ?cohort= and records which
 * hub button sent the family. The href is rebuilt after mount because the
 * cohort only exists in the browser's URL (the hub page is static).
 */
export function FinderLink({ id, className, children }: { id: string; className?: string; children: ReactNode }) {
  const [href, setHref] = useState("/benefits/finder");
  useEffect(() => setHref(finderHref()), []);
  return (
    <Link href={href} className={className} onClick={() => trackHubClick(`hub_plan:${id}`)}>
      {children}
    </Link>
  );
}
