# Scratchpad

> A living document for tracking work in progress, decisions, and context between sessions.

---

## Current Focus

_What's the main thing being worked on right now?_

- **Provider Portal Integration**: Merge Logan's PR #21 into main
  - Plan: `plans/provider-portal-integration.md`
  - **iOS APPROVED** (2026-02-05) - Can proceed with schema changes
  - ✅ Phase 1: Schema analysis complete, migration file created
  - ✅ Phase 2: Code merge complete (build passes)
  - ⏳ Phase 3: Integration testing ← CURRENT
  - Phase 4: Deploy & verify
  - **BLOCKER**: Need to run SQL migration in Supabase + add `SUPABASE_SERVICE_ROLE_KEY` to Vercel

- **Supabase Unification**: ✅ COMPLETE
  - All pages connected to iOS Supabase
  - Browse page with server-side filtering
  - PRs merged: #16, #17, #18, #20

---

## In Progress

_Active work items and their current state._

- [x] Initial project setup
- [x] Provider cards on homepage
- [x] Provider detail page
- [x] Hero section redesign
- [x] Provider card spacing standardization
- [x] Browse page with filtering
- [x] iOS Supabase integration (Phase 1)
- [x] PR #20 merged (Esther's provider details + community forum)
- [ ] PR #21 integration (Logan's provider portal) ← IN PROGRESS

---

## Blocked / Needs Input

_Items waiting on decisions, external input, or dependencies._

- **PR #21 Integration - Awaiting user actions:**
  1. Run SQL migration in Supabase: `supabase/migrations/001_provider_portal_tables.sql`
  2. Add `SUPABASE_SERVICE_ROLE_KEY` to Vercel environment variables
  3. Then: merge `feature/provider-portal` branch to main

---

## Next Up

_What should be tackled next, in priority order._

1. **Complete PR #21 Integration** - Run migration, add env var, merge branch, test
2. **Update claim flow** - Wire `source_provider_id` to claim existing olera-providers listings
3. Family onboarding flow
4. Payment/subscription integration
5. Environment strategy (dev/staging/prod)

---

## Decisions Made

_Key decisions with rationale, for future reference._

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-05 | Use shared tables for PR #21 (not separate web tables) | iOS approved, avoid duplication |
| 2026-02-05 | Keep our browse/provider pages when merging PR #21 | Working filtering, Esther's design already merged |
| 2026-02-05 | No adapter layer for iOS schema | User feedback: keep both uniform, simpler code |
| 2026-02-05 | Server-side browse page over client-side | Real Supabase data requires server components |
| 2026-02-06 | Add `source_provider_id` to link claims | Enables claiming existing 39K olera-providers without modifying iOS schema |
| 2026-01-30 | Added Claude Code slash commands | Standardize workflow for explore → plan → build → save cycle |

---

## Notes & Observations

_Useful context, patterns noticed, things to remember._

- Project is a TypeScript/Next.js web app for senior care discovery
- Slash commands reference iOS patterns in some places - update for web as needed

---

## Session Log

### 2026-02-06

**Provider Portal Integration - Phase 2 Code Merge:**

*Session 7:*
- **Analyzed iOS Supabase schema** to reconcile with Logan's expected schema
  - iOS `profiles` = user identity (like accounts)
  - iOS `olera-providers` = provider listings (39K+)
  - iOS `provider_claims` = sophisticated claim workflow
  - iOS `conversations` = chat threads
- **Key Decision**: Rename Logan's `profiles` → `business_profiles` to avoid iOS conflict
- **Created SQL migration**: `supabase/migrations/001_provider_portal_tables.sql`
  - `accounts` - web portal user identity
  - `business_profiles` - orgs/caregivers/families
  - `memberships` - subscription info
  - `connections` - inquiries/saves
  - Includes RLS policies and triggers
- **Merged PR #21 code** on `feature/provider-portal` branch
  - Auth components: AuthFlowModal, OtpInput, AuthProvider, GlobalAuthFlowModal
  - Portal pages: dashboard, profile, calendar, connections
  - For-providers pages: landing, claim flow, create
  - API routes: ensure-account
  - Utility files: membership.ts, profile-card.ts, Modal.tsx
  - Onboarding components: OrgClaimStep, ProfileInfoStep
  - Shared components: ProfileCard, ProfileSwitcher, RoleGate
- **Updated all table references**: `profiles` → `business_profiles` in merged files
- **Updated types**: Added `BusinessProfile` interface with `Profile` alias
- **Build passes** ✅
- **Resolved data architecture question**:
  - Problem: How to link `business_profiles` (user-owned) to `olera-providers` (39K listings)?
  - Solution: Add `source_provider_id` column to `business_profiles`
  - When claiming: Create `business_profiles` row with `source_provider_id` → original listing
  - Browse page → reads `olera-providers` (unchanged)
  - Portal → reads/writes `business_profiles` (user's copy)
  - See: `plans/provider-data-architecture.md`
- **Committed**: `c3967ea` on `feature/provider-portal` branch
- **Next steps**:
  1. Run SQL migration in Supabase (user action)
  2. Add `SUPABASE_SERVICE_ROLE_KEY` to Vercel (user action)
  3. Merge `feature/provider-portal` to main
  4. Complete integration testing (Phase 3)
  5. Deploy to production

### 2026-02-05

**Provider Portal Integration Planning:**

*Session 6:*
- **Merged PR #20** (Esther's provider details consolidation)
  - Community forum feature (`/community` pages)
  - Improved provider detail page with sticky sidebar
  - New components: ProviderMap, CompactProviderCard, QASection, etc.
  - Resolved conflict: Kept our `BrowsePageClient` with filtering
  - Resolved conflict: Kept our Navbar with auth integration
- **Analyzed PR #21** (Logan's provider portal)
  - Unified auth flow (AuthFlowModal, OTP verification)
  - Provider onboarding, portal dashboard, profile editing
  - Requires: accounts, profiles, memberships, connections tables
  - Different schema from `olera-providers` - can coexist
- **Created integration plan**: `plans/provider-portal-integration.md`
  - File triage: MERGE vs SKIP vs KEEP OURS
  - Database schema requirements
  - Implementation phases with checkboxes
  - Test plan, rollback plan, decision log
- **iOS APPROVED!** - Can now proceed with portal integration
- Files: `plans/provider-portal-integration.md`

**Supabase Unification - Phase 1 Implementation:**

*Session 5:*
- **Fixed browse page showing mock data instead of real Supabase data**
  - Root cause: Deployment propagation delay / caching issue
  - Added temporary debug badge to diagnose (`[REAL] Success: 50 providers`)
  - Confirmed real data working, removed debug badge
- **Added server-side filtering to browse page**
  - Location search: "City, ST" format, state codes, or city/provider name search
  - Care type filter: Maps dropdown values to `provider_category` with ilike
  - State filter: Direct state code matching
  - Files: `app/browse/BrowsePageClient.tsx`
- Browse page now fully functional with real data + working filters

*Session 2:*
- Connected web app to iOS Supabase (`ocaabzfiiikjcgqwhbwr`)
- Created `lib/types/provider.ts` - iOS Provider schema + helpers
- Key decision: **No adapter layer** - adjusted web to match iOS schema directly
  - User feedback: "why adapter layer, what if we made both uniform"
  - Result: Simpler code, direct schema match
- Updated `app/provider/[slug]/page.tsx`:
  - Queries `olera-providers` table (39,355+ providers)
  - Uses `provider_id` as URL slug
  - Falls back to mock data for dev/demo
- Updated `app/page.tsx`:
  - "Top providers" fetches from Supabase (rating >= 4.0)
  - "Browse by care type" fetches by `provider_category`
  - Added loading skeletons and mock fallback
- Created helper functions:
  - `toCardFormat()` - iOS Provider → ProviderCard data
  - `mockToCardFormat()` - Mock data → ProviderCard data
  - `parseProviderImages()` - Pipe-separated string → array
  - `formatPriceRange()`, `formatLocation()`, `getCategoryDisplayName()`

*Session 3:*
- Updated browse page (`/browse`) to use iOS Supabase
  - Search by name, city, or zipcode
  - Filter by care type (maps to `provider_category`)
  - Filter by state
  - Shows 50 providers, ordered by rating
- Added similar providers to detail page (`/provider/[slug]`)
  - Queries providers with same category
  - Shows up to 4 similar providers with thumbnails
  - Links to browse page for full category view
- **Phase 1 Complete** - All web pages connected to iOS Supabase

**Phase 1 Summary:**
- Provider detail, homepage, browse page all fetch from iOS Supabase
- 39,355+ real providers accessible
- Graceful mock fallback for development
- No schema changes made (iOS app safe during review)

*Session 4:*
- Resolved merge conflicts in PR #16 (browse-page-refinement)
  - Conflicts: `app/browse/page.tsx`, `app/provider/[slug]/page.tsx`
  - Resolution: Keep iOS Supabase integration + SEO metadata from PR
  - Created `components/browse/BrowseFilters.tsx` for server-side filtering
- Created PR #17 with resolved conflicts (PR #16 was from fork)
- Merged all PRs:
  - PR #16: Browse page refinement (auto-closed)
  - PR #17: Browse page refinement with iOS Supabase integration
  - PR #18: Landing page search and browse layout refinements
- All pages now deployed with real Supabase data

*Session 1:*
- Ran `/explore` workflow - identified TJ's P1 task from Notion
- Explored codebase structure
- Created implementation plan: `plans/supabase-unification-plan.md`
- Constraint: iOS app in Apple review, cannot be broken

**Key Finding:**
- `DATABASE_STRATEGY.md` recommends Neon + Clerk, but Notion task specifies Supabase unification
- Decision: Follow Notion task, keep DATABASE_STRATEGY.md as future reference

### 2026-02-03

**Hero Section Redesign:**
- Added HousingAnywhere-inspired pill-style search bar (location + care type inputs)
- Added social proof pill above headline ("48,000+ verified providers listed")
- Added background image with overlay for readability
- Changed headline to sentence case ("Find the right care for your loved one")

**Provider Card Spacing Fixes:**
- Set image section to 256px (`h-64`)
- Set content section to 256px (`h-64`) - total card height now 512px
- Standardized vertical stacks:
  - Stack 1: Category (caps) → Provider Name → Location
  - Stack 2: Pricing + Reviews
  - Stack 3: Highlights (anchored to bottom with `mt-auto`)
  - Stack 4 (hover): Accepted Payments (animates in using CSS grid `grid-rows-[0fr]` to `grid-rows-[1fr]`)
- Fixed tooltip z-index issues (badge tooltip now `z-30`, payment tooltip `z-50`)
- Fixed overflow clipping on payment tooltip with `overflow-hidden group-hover:overflow-visible`

**Files Changed:**
- `app/page.tsx` - Hero section, card wrapper height
- `components/providers/ProviderCard.tsx` - Card structure and spacing
- Set up Notion MCP integration for Claude Code (user-scoped)
- Updated `/explore` command to fetch tasks from "Web App Action Items/Roadmap" Notion database
- Added Step 0: Identify team member (TJ, Logan, Esther) and auto-fetch their highest priority "To Do" task
- Correct data_source_id: `2f75903a-0ffe-8166-9d6f-000b1b51cb11`
- Files modified: `.claude/commands/explore.md`

### 2026-02-02

- Added "Top providers near you" section to homepage with 4 provider cards
- Created `ProviderCard` component (`components/providers/ProviderCard.tsx`)
- Created provider detail page (`app/provider/[slug]/page.tsx`) with hero, about, amenities, and contact card
- Using dummy data for providers (will connect to Supabase later)

### 2026-01-30

- Set up Claude GitHub App for olera-care organization
- Created slash commands: `/resume`, `/explore`, `/plan`, `/commit`, `/save`, `/quicksave`, `/troubleshoot`, `/postmortem`, `/ui-critique`, `/compact`
- Created SCRATCHPAD.md

---

_Older sessions archived to `archive/SCRATCHPAD-[YYYY-MM].md`_
