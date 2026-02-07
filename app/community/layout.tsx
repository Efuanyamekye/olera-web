"use client";

import { useLayoutEffect } from "react";

export default function CommunityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Hide the global footer when this layout is active
  // useLayoutEffect runs synchronously before paint to prevent flash
  useLayoutEffect(() => {
    // Find and hide the footer
    const footer = document.querySelector("footer");
    if (footer) {
      footer.style.display = "none";
    }

    // Cleanup: restore footer when leaving the page
    return () => {
      if (footer) {
        footer.style.display = "";
      }
    };
  }, []);

  return <>{children}</>;
}
