import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/shared/Navbar";
import Footer from "@/components/shared/Footer";
import AuthProvider from "@/components/auth/AuthProvider";
import GlobalUnifiedAuthModal from "@/components/auth/GlobalUnifiedAuthModal";
import { NavbarProvider } from "@/components/shared/NavbarContext";

export const metadata: Metadata = {
  title: "Olera | Find Senior Care Near You",
  description:
    "Discover trusted senior care options in your area. Compare assisted living, home care, memory care, and more.",
  keywords: [
    "senior care",
    "assisted living",
    "home care",
    "memory care",
    "elderly care",
    "care finder",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen flex flex-col font-sans">
        <AuthProvider>
          <NavbarProvider>
            <Navbar />
            <main className="flex-grow">{children}</main>
            <Footer />
            <GlobalUnifiedAuthModal />
          </NavbarProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
