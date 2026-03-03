import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import Navbar from "@/components/shared/Navbar";
import ConditionalFooter from "@/components/shared/ConditionalFooter";
import AuthProvider from "@/components/auth/AuthProvider";
import GlobalUnifiedAuthModal from "@/components/auth/GlobalUnifiedAuthModal";
import { SavedProvidersProvider } from "@/hooks/use-saved-providers";
import { NavbarProvider } from "@/components/shared/NavbarContext";

const GA_MEASUREMENT_ID = "G-F2F7FG745B";

export const metadata: Metadata = {
  title: {
    default: "Olera | Find Senior Care Near You",
    template: "%s",
  },
  description:
    "Discover trusted senior care options in your area. Compare assisted living, home care, memory care, and more. 39,000+ providers nationwide.",
  keywords: [
    "senior care",
    "assisted living",
    "home care",
    "memory care",
    "elderly care",
    "care finder",
    "nursing home",
    "home health care",
    "independent living",
    "senior living",
  ],
  metadataBase: new URL("https://olera.care"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Olera | Find Senior Care Near You",
    description:
      "Discover trusted senior care options in your area. Compare assisted living, home care, memory care, and more. 39,000+ providers nationwide.",
    url: "https://olera.care",
    siteName: "Olera",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Olera | Find Senior Care Near You",
    description:
      "Discover trusted senior care options in your area. Compare 39,000+ senior care providers nationwide.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
};

// Organization JSON-LD for the entire site
const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Olera",
  url: "https://olera.care",
  description:
    "Olera helps families find trusted senior care options. Compare assisted living, home care, memory care, and more across 39,000+ providers nationwide.",
  logo: "https://olera.care/logo.png",
  sameAs: [],
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer service",
    url: "https://olera.care/contact",
  },
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: "https://olera.care/browse?q={search_term_string}",
    },
    "query-input": "required name=search_term_string",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* ── Resource hints for faster external connections ── */}
        <link rel="preconnect" href="https://www.googletagmanager.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://cdn.lordicon.com" crossOrigin="anonymous" />
        {process.env.NEXT_PUBLIC_SUPABASE_URL && (
          <link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL} crossOrigin="anonymous" />
        )}

        {/* DNS-prefetch for domains used on specific pages (browse, map) */}
        <link rel="dns-prefetch" href="https://a.basemaps.cartocdn.com" />
        <link rel="dns-prefetch" href="https://nominatim.openstreetmap.org" />
        <link rel="dns-prefetch" href="https://api.maptiler.com" />

        {/* GA4 — same property as v1.0 */}
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
          strategy="afterInteractive"
        />
        <Script id="ga4-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_MEASUREMENT_ID}');
          `}
        </Script>

        {/* Organization structured data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
      </head>
      <body className="bg-white min-h-screen flex flex-col font-sans">
        <Script src="https://cdn.lordicon.com/lordicon.js" strategy="afterInteractive" />
        <AuthProvider>
          <SavedProvidersProvider>
          <NavbarProvider>
            <Navbar />
            <main className="flex-grow">{children}</main>
            <ConditionalFooter />
            <GlobalUnifiedAuthModal />
          </NavbarProvider>
          </SavedProvidersProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
