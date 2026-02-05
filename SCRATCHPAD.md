# Scratchpad

> A living document for tracking work in progress, decisions, and context between sessions.

---

## Current Focus

_What's the main thing being worked on right now?_

- **Supabase Unification**: Connect web provider pages to iOS Supabase (P1 task)
  - Plan: `plans/supabase-unification-plan.md`
  - **Phase 1: COMPLETE** - All pages connected to iOS Supabase
  - ✅ Provider detail page shows real data + similar providers
  - ✅ Homepage fetches real providers (top + by category)
  - ✅ Browse page with search/filtering by state/category
  - ✅ All PRs merged (#16, #17, #18)
  - Phase 2/3: Waiting for iOS app approval before schema changes

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

---

## Blocked / Needs Input

_Items waiting on decisions, external input, or dependencies._

_None currently._

---

## Next Up

_What should be tackled next, in priority order._

1. User authentication (login/signup)
2. Consultation request flow
3. Phase 2: Environment strategy (dev/staging/prod)
4. Phase 3: Supabase unification (after iOS approval)

---

## Decisions Made

_Key decisions with rationale, for future reference._

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-05 | No adapter layer for iOS schema | User feedback: keep both uniform, simpler code |
| 2026-02-05 | Server-side browse page over client-side | Real Supabase data requires server components |
| 2026-01-30 | Added Claude Code slash commands | Standardize workflow for explore → plan → build → save cycle |

---

## Notes & Observations

_Useful context, patterns noticed, things to remember._

- Project is a TypeScript/Next.js web app for senior care discovery
- Slash commands reference iOS patterns in some places - update for web as needed

---

## Session Log

### 2026-02-05

**Supabase Unification - Phase 1 Implementation:**

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
