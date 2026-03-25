"use client";

import { usePathname } from "next/navigation";
import Navbar from "@/components/shared/Navbar";
import ConditionalFooter from "@/components/shared/ConditionalFooter";
import GlobalUnifiedAuthModal from "@/components/auth/GlobalUnifiedAuthModal";
import { NavbarProvider } from "@/components/shared/NavbarContext";

/**
 * Client-side layout shell that conditionally renders navbar/footer
 * based on the current route. Standalone pages like /welcome opt out.
 */
const STANDALONE_ROUTES: string[] = ["/review"];

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isStandalone = STANDALONE_ROUTES.some(route => pathname === route || pathname.startsWith(`${route}/`));

  if (isStandalone) {
    return (
      <>
        {children}
        <GlobalUnifiedAuthModal />
      </>
    );
  }

  return (
    <NavbarProvider>
      <Navbar />
      <main className="flex-grow">{children}</main>
      <ConditionalFooter />
      <GlobalUnifiedAuthModal />
    </NavbarProvider>
  );
}
