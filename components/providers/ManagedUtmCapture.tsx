"use client";

import { useEffect } from "react";
import { captureManagedUtm } from "@/lib/ad-boost/managed-utm";

/**
 * Renders nothing. On mount of the public provider page, persists managed-ads
 * UTM attribution to a short-lived cookie so a later inquiry (fired deep in a
 * multi-step flow, after the URL query is gone) is still attributed to its
 * campaign. See lib/ad-boost/managed-utm.
 */
export default function ManagedUtmCapture() {
  useEffect(() => {
    captureManagedUtm();
  }, []);
  return null;
}
