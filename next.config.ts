import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable image optimization for external images
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },

  // Cache headers for static data files
  async headers() {
    return [
      {
        source: "/data/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },

  // ── 301 Redirects (v1.0 → v2.0 migration) ──
  async redirects() {
    return [
      // MedJobs board consolidation (G3): the public, ungated /medjobs/candidates
      // board is canonical (it's the only board that renders for an authed-but-
      // unclaimed provider — the cold magic-link state). The gated /provider
      // portal board redirects into it. Edge-level so it runs before the
      // /provider layout's profile gate (which would otherwise eject to /portal).
      { source: "/provider/medjobs/candidates/:path*", destination: "/medjobs/candidates/:path*", permanent: true },
      { source: "/provider/medjobs", destination: "/medjobs/candidates", permanent: true },
      // Tier 1: Provider portal renames
      { source: "/provider-portal", destination: "/portal", permanent: true },
      { source: "/provider-portal/dashboard", destination: "/portal", permanent: true },
      { source: "/provider-portal/profile", destination: "/portal/profile", permanent: true },
      { source: "/provider-portal/connections", destination: "/provider/connections", permanent: true },
      { source: "/portal/connections", destination: "/provider/connections", permanent: true },
      { source: "/provider-portal/settings", destination: "/portal/settings", permanent: true },
      { source: "/provider-portal/matches", destination: "/portal/profile", permanent: true },
      { source: "/provider-portal/benefits", destination: "/benefits", permanent: true },
      { source: "/provider-portal/availability", destination: "/portal/calendar", permanent: true },

      // Tier 1: Legal page redirects → dedicated v2 pages
      { source: "/terms-and-conditions", destination: "/terms", permanent: true },
      { source: "/pages/terms", destination: "/terms", permanent: true },
      { source: "/pages/terms-and-conditions", destination: "/terms", permanent: true },
      { source: "/pages/privacy-policy", destination: "/privacy", permanent: true },

      // Tier 1: Deprecated v1.0 pages → homepage
      { source: "/education-material", destination: "/", permanent: true },
      // /research-and-press — now a live page (removed redirect)
      { source: "/research-and-press/c/:slug", destination: "/research-and-press", permanent: true },
      { source: "/forum", destination: "/", permanent: true },
      { source: "/care-assessment", destination: "/benefits/finder", permanent: true },

      // Tier 2: Deprecated content pages with slugs → homepage
      { source: "/education-material/:slug*", destination: "/", permanent: true },
      // /research-and-press/:slug — now a live page (removed redirect)
      { source: "/resources", destination: "/caregiver-support", permanent: true },
      { source: "/resources/:slug", destination: "/caregiver-support/:slug", permanent: true },
      { source: "/caregiver-support/:slug/:rest+", destination: "/caregiver-support", permanent: true },
      { source: "/forum/:path*", destination: "/", permanent: true },

      // Tier 3: v1.0 pages with v2 equivalents
      { source: "/providers", destination: "/for-providers", permanent: true },
      { source: "/account", destination: "/portal", permanent: true },
      { source: "/inbox", destination: "/portal", permanent: true },
      { source: "/community", destination: "/", permanent: false },
      { source: "/community/:path*", destination: "/", permanent: false },
      { source: "/caregiver-forum", destination: "/", permanent: true },
      { source: "/caregiver-forum/:path*", destination: "/", permanent: true },
      { source: "/pages/privacy", destination: "/privacy", permanent: true },

      // Tier 3: v1.0 auth pages (no v2 equivalent — auth handled via modal/Supabase)
      { source: "/confirm-email", destination: "/", permanent: true },
      { source: "/reset-password", destination: "/", permanent: true },

      // Tier 3: v1.0 review submission pages → provider page
      { source: "/provider/:slug/review/:uuid", destination: "/provider/:slug", permanent: true },
      { source: "/provider/:slug/request-review/:token", destination: "/provider/:slug", permanent: true },

      // Tier 3: v1.0 company pages → v2 equivalents
      { source: "/company/about", destination: "/about", permanent: true },
      { source: "/company/leadership", destination: "/team", permanent: true },
      { source: "/company/contact-us", destination: "/contact", permanent: true },
      { source: "/company/investors", destination: "/about", permanent: true },

      // Support page redirect → contact page
      { source: "/support", destination: "/contact", permanent: true },

      // Tier 3: v1.0 pages with no v2 equivalent → homepage
      { source: "/caregiver-relief-network", destination: "/", permanent: true },
      { source: "/caregiver-relief-network/:path*", destination: "/", permanent: true },
      { source: "/company/:slug", destination: "/", permanent: true },

      // Tier 4: v1.0 provider auth URLs (from provider-portal-redirects.ts)
      { source: "/provider/sign-up", destination: "/for-providers", permanent: true },
      { source: "/provider/sign-in", destination: "/for-providers", permanent: true },
      { source: "/provider/forgot-password", destination: "/for-providers", permanent: true },
      { source: "/provider/resend-activation-link", destination: "/for-providers", permanent: true },
      { source: "/provider/claim", destination: "/provider/onboarding", permanent: true },
      { source: "/provider/new/edit-basics", destination: "/for-providers/create", permanent: true },

      // Tier 4: v1.0 provider edit/status URLs
      { source: "/provider/:slug/preview", destination: "/provider/:slug", permanent: true },
      { source: "/provider/:slug/edit-basics", destination: "/provider/:slug", permanent: true },
      { source: "/provider/:slug/edit-images", destination: "/provider/:slug", permanent: true },
      { source: "/provider/:slug/edit-prices", destination: "/provider/:slug", permanent: true },
      { source: "/provider/:slug/status", destination: "/provider/:slug", permanent: true },

      // Tier 4: v1.0 CMS pages catch-all
      { source: "/pages/:slug", destination: "/", permanent: true },

      // Tier 4: v1.0 curated articles
      { source: "/caregiver-support/curated", destination: "/caregiver-support", permanent: true },
      { source: "/caregiver-support/curated/:slug", destination: "/caregiver-support", permanent: true },

      // Tier 4: v1.0 sign-out
      { source: "/sign-out", destination: "/", permanent: true },

      // Tier 5: Portal matches → consolidated into inbox/profile
      { source: "/portal/matches", destination: "/portal/profile", permanent: true },
      { source: "/portal/matches/:id", destination: "/portal/inbox?id=:id", permanent: true },

      // Tier 7: URL migration — /senior-benefits → /benefits (v1→v2 consolidation, 2026-04-14)
      // The pipeline is now the source of truth for state + program content, served at
      // /benefits/:state/:program. State and program URLs redirect 1:1 so Google preserves
      // program-level ranking signals instead of collapsing everything to the state page.
      // The /benefits/[slug]/[program] page uses lib/program-data.ts::getEnrichedProgram which
      // handles both waiver-library IDs and pipeline-only IDs via a fuzzy match — so existing
      // /senior-benefits/:state/:benefit URLs (waiver-library IDs) resolve on the new page.
      // /checklist and /forms sub-paths collapse to the parent (no sub-routes on new /benefits page).
      // NOTE: /senior-benefits root stays alive as the Benefits Hub landing page for
      // now. A follow-up will move it under /benefits.
      { source: "/senior-benefits/forms", destination: "/benefits", permanent: true },
      { source: "/senior-benefits/forms/:state", destination: "/benefits/:state", permanent: true },
      { source: "/senior-benefits/:state", destination: "/benefits/:state", permanent: true },
      { source: "/senior-benefits/:state/current", destination: "/benefits/:state", permanent: true },
      { source: "/senior-benefits/:state/:benefit", destination: "/benefits/:state/:benefit", permanent: true },
      { source: "/senior-benefits/:state/:benefit/current", destination: "/benefits/:state/:benefit", permanent: true },
      { source: "/senior-benefits/:state/:benefit/checklist", destination: "/benefits/:state/:benefit", permanent: true },
      { source: "/senior-benefits/:state/:benefit/forms", destination: "/benefits/:state/:benefit", permanent: true },

      // Legacy /texas/benefits shadow route — fully retired. Any remaining inbound
      // traffic (indexed URLs, links in DB article content) collapses to the
      // Texas state page since the old slugs don't 1:1 map to pipeline IDs.
      { source: "/texas/benefits", destination: "/benefits/texas", permanent: true },
      { source: "/texas/benefits/:path*", destination: "/benefits/texas", permanent: true },

      // Tier 6: URL migration — /waiver-library → /benefits (SEO rename chain)
      { source: "/waiver-library", destination: "/benefits", permanent: true },
      { source: "/waiver-library/forms", destination: "/benefits", permanent: true },
      { source: "/waiver-library/forms/:state", destination: "/benefits/:state", permanent: true },
      { source: "/waiver-library/:state", destination: "/benefits/:state", permanent: true },
      { source: "/waiver-library/:state/current", destination: "/benefits/:state", permanent: true },
      { source: "/waiver-library/:state/:benefit", destination: "/benefits/:state/:benefit", permanent: true },
      { source: "/waiver-library/:state/:benefit/current", destination: "/benefits/:state/:benefit", permanent: true },
      { source: "/waiver-library/:state/:benefit/checklist", destination: "/benefits/:state/:benefit", permanent: true },
      { source: "/waiver-library/:state/:benefit/forms", destination: "/benefits/:state/:benefit", permanent: true },

      // ── v9.0 MedJobs reorg ──
      // Student Outreach lives at /admin/medjobs/in-basket as the new
      // workflow entry point. Existing bookmarks redirect through.
      { source: "/admin/student-outreach", destination: "/admin/medjobs/in-basket", permanent: true },

      // v9.0 Phase 7: completed-work → logs rename (UI only; the API
      // endpoint /api/admin/medjobs/completed-work keeps its name).
      // Earlier completed-tasks → completed-work and all-tasks legacy
      // redirects collapse onto the new /logs URL.
      { source: "/admin/medjobs/completed-work",  destination: "/admin/medjobs/logs", permanent: true },
      { source: "/admin/medjobs/completed-tasks", destination: "/admin/medjobs/logs", permanent: true },
      { source: "/admin/medjobs/all-tasks",       destination: "/admin/medjobs/logs", permanent: true },

      // v9.0 Phase 7: campuses → sites rename (UI only; DB table +
      // /api/admin/medjobs/campuses endpoint keep their existing names).
      { source: "/admin/medjobs/campuses",   destination: "/admin/medjobs/sites", permanent: true },

      // v9.0 Phase 7 Commit K: Prospects / Meetings / Replies / Calls
      // exist as dedicated entity pages. The Phase 6 redirects that
      // pointed them at /in-basket are removed — next.js now routes
      // straight to the real pages.
    ];
  },

  // Rewrites for sitemap (the [category] dynamic route shadows /sitemap.xml)
  async rewrites() {
    return [
      { source: "/sitemap.xml", destination: "/api/sitemap" },
      { source: "/sitemap-index.xml", destination: "/api/sitemap" },
    ];
  },

  // Turbopack configuration (Next.js 16+ default)
  turbopack: {
    // Turbopack automatically excludes Node.js built-ins from client bundles
    // No additional config needed for fs/path exclusion
  },

  // Webpack configuration (fallback when not using Turbopack)
  webpack: (config, { isServer }) => {
    // Don't bundle fs/path for client-side (causes build errors in pricing-config.ts)
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
      };
    }
    return config;
  },
};

export default nextConfig;
