import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/shared/Navbar";
import Footer from "@/components/shared/Footer";

// Inter is a clean, readable font that works well for healthcare/care platforms
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

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
      <body className={`${inter.className} bg-gray-50 min-h-screen flex flex-col`}>
        <Navbar />
        <main className="flex-grow">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
