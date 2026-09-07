# Olera Web — Claude Code Instructions

## Git Workflow

This project uses a staging-based workflow:

```
feature branch → PR to staging → QA → PR to main → production
```

### Branch rules

- **Always branch from `staging`**, not `main`
- **PRs target `staging`** by default, not `main`
- Only target `main` for hotfixes or production promotions
- When creating worktrees, use `staging` as the base:
  ```bash
  git worktree add ../olera-web-feature -b feature-name origin/staging
  ```

### Deployments

| Branch | URL | Purpose |
|--------|-----|---------|
| `main` | olera2-web.vercel.app | Production |
| `staging` | staging-olera2-web.vercel.app | QA / Demo |

### Merge permissions

- **Only `tfalohun` (TJ) can merge PRs** to `main` and `staging`
- Enforced via GitHub rulesets with `merge-admins` team as the only bypass actor
- Everyone else can create branches, push, and open PRs — but cannot merge
- The `/pr-merge` command authenticates as TJ, so it works as expected

### Commit conventions

- Imperative mood: "Add X" not "Added X"
- First line under 50 chars
- Body explains WHAT and WHY, not HOW

## Tech Stack

- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript
- **Styling**: Tailwind CSS with custom design system (see tailwind.config.ts)
- **Database**: Supabase (shared iOS project, read-only + auth)
- **Auth**: Supabase Auth (Google OAuth + email OTP)
- **Payments**: Stripe (configured, not fully live)
- **Hosting**: Vercel

## Key Files

- `lib/supabase/client.ts` — Browser Supabase client
- `lib/supabase/server.ts` — Server Supabase client
- `components/auth/UnifiedAuthModal.tsx` — Main auth modal
- `middleware.ts` — Auth protection for /portal and /admin
- `SCRATCHPAD.md` — Living context doc (read this for session history)
- `CONTRIBUTING.md` — Team workflow and branch strategy

## Growth Metrics

- Run `/metrics` for the canonical weekly acquisition and SEO report.
- The command writes one immutable Supabase snapshot per completed week; `/admin/organic-growth` reads the same row.
- Live weeks also write categorized `growth_page_metrics` rows so Growth drivers can rank Provider, Benefits, and Editorial pages over any selected range.
- `docs/growth/README.md` defines every metric, the Tuesday reporting cadence, and credential setup.
- Do not depend on Olera-HQ or Airtable for this workflow. Olera Web is the source of truth.
- `/product-led-growth` remains the product-engagement workflow; `/metrics` measures acquisition, search visibility, and organic inquiries.

## MedJobs Strategic Context

MedJobs documentation has two layers. Pick by the kind of work:

**Engineering work** — **read `docs/medjobs/OPERATIONAL_BRIEF.md` first.** It is the canonical engineering reference covering the funnel architecture, conversion routing, state machine, discipline rules (G1–G10), the deferred items registry (D1–D25), the outcomes map, and the canonical vocabulary. Do not invent new backend enum values or actions in `route.ts` without checking the discipline rules first.

**Operating / commercialization work** — **read `docs/medjobs/operating/` first.** It is the source of truth for how MedJobs is run as a business: the executive operating plan, execution playbook, pod roles, protocols P1–P7, metrics, experiments, decisions, scale gates, and iteration history. Start at `docs/medjobs/operating/README.md`.

Before treating anything as settled, check `docs/medjobs/operating/07-OPEN-DECISIONS-AND-CONFLICTS.md`. Several facts differ between the founder discussion, the admin protocol, and the shipped code — notably the price, what makes a provider a "Client", and archiving rules. Those conflicts are documented deliberately, not resolved.

The companion `docs/medjobs/EXECUTIVE_SUMMARY.md` is the human-readable team brief — useful for orientation but the engineering reference is authoritative.

### The SOP documents

`docs/medjobs/matrix-src/MATRIX.md` is the **canonical source of truth for the operating model** — every stage in three layers, plus the deferred build list. The three role manuals in `docs/medjobs/roles-src/` (ADMIN, SALES, CRM) are **filtered views of it, never independent documents**: same terminology, stage numbering, ownership, handoffs and business rules. Where the master does not specify something a role needs, the manual carries a **GAP / DECISION NEEDED** block rather than inventing a procedure.

- Change the operating model in `MATRIX.md` first, then propagate to the role manuals.
- `docs/medjobs/roles-src/validate.py` checks the three against the master and exits non-zero on drift. Run it after any edit to any of the four.
- The MedJobs nav is four pages: **System, Admin, Sales, CRM**, all under `/admin/medjobs/sop`. System is the operating command centre and carries the Sites and In Basket actions; `/admin/medjobs/stats` still works by URL but is no longer linked. All four documents are served via `/api/admin/medjobs/sop?doc=…`. New or renamed PDFs need an entry in `outputFileTracingIncludes` in `next.config.ts`, or the route 404s in production.
- Jump bars address PDF **named destinations**, not page numbers, so a rebuild that repaginates a document cannot break them. Chromium only writes a destination for an id something links to, so a new section must also go in that manual's nav bar. Both READMEs say how to check.
- **30-day tracker.** `docs/medjobs/FUNNEL_MEASUREMENT_MAP.md` is the working: which events populate each stage's x and y, what is not instrumented, and the smallest change that would fix it. `lib/medjobs/funnel-30d.ts` computes it and `/api/admin/medjobs/funnel-30d` serves it. **A stage gets an x/y only when both numbers come from dated system events** — QUAL, MA4 and MA5 return a gap with the reason, and the diagram renders that rather than a plausible number. Do not add a metric without adding its row to the map first.
- **Health.** `lib/medjobs/funnel-health.ts` is the single threshold table: each stage judged on its own driver (conversion, coverage or volume), a site score that is the mean of the scored stages, and a staleness cap. An unmeasurable stage is `unscored`, never red. Colours come from the design system's `success` / `warning` / `error` scales, not a separate dashboard palette.
- **Site filter.** `?site=<slug>` on the funnel route. Five stages (PR3, ST8, MA1, MA2, MA3) have no campus link in the schema, so they stay network-wide under a filter and sit out that site's score. `/api/admin/medjobs/site-health` scores every site for the navigator.
- The System page also carries the architecture diagram (`components/admin/medjobs/SystemArchitecture.tsx`, drawn not rasterised, every stage a jump target) and links to the walkthrough video and summary, both served through the same guarded route.

## Grant Work (NIH SBIR CRP)

- CRP application work lives in `docs/crp/` — read `docs/crp/CLAUDE.md` and
  `docs/crp/README.md` before doing any grant drafting, editing, or rendering.

## Provider Highlights System

Provider highlights are generated by `lib/provider-highlights.ts` using a 5-tier data-driven waterfall. **Do not hardcode highlights per category** — the old static `CATEGORY_HIGHLIGHTS` maps were deleted for this reason.

### Waterfall priority (detail page: up to 4, browse cards: up to 3)

1. **AI Trust Signals** (confirmed): "State Licensed", "Accredited", "BBB Rated", "Clean Record"
2. **Longevity + Social Proof**: "Est. YYYY" (from trust signals), "Highly Rated" (≥4.5★/10+ reviews), "Well Reviewed" (≥4.0★/15+ reviews)
3. **CMS Medicare Quality**: "Medicare Quality: 5/5" (5-star only)
4. **Staff Screening**: "Background-Checked", "Licensed", "Insured"
5. **One capability label**: Normalized care type (detail page only — browse cards skip this via `skipCapability: true` since category is already in the card header)

### Key rules
- **Fewer honest > more generic.** If a provider has no Tier 1-4 data, they get 0-1 highlights, not 4 fake ones.
- **Browse cards skip Tier 5** — the category is already shown in the card header line, repeating it as a highlight is tautological.
- **Synonym normalization**: `normalizeCareLabel()` in the same file collapses variants ("Home Care (Non-medical)" / "In-home care" / "Non-medical home care" → canonical form).
- **New providers get trust signals automatically** via the city pipeline (`scripts/enrich-city.js`).
- **Backfill script**: `scripts/backfill-highlights-data.js` — one-time enrichment for existing providers (reviews hydration + trust signals via Perplexity, concurrent workers).
