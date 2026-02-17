# Scratchpad

> A living document for tracking work in progress, decisions, and context between sessions.

---

## Current Focus

_What's the main thing being worked on right now?_

- **Auth Overhaul**: ✅ COMPLETE (all 3 phases)
  - Replaced ~3,000 lines of duplicate auth code with ~1,000-line unified system
  - Google OAuth + email-first progressive disclosure
  - Premium modal UI (Luma/Linear-inspired, Olera hummingbird logo)
  - Post-auth onboarding inside modal (no separate /onboarding page)
  - All legacy auth modals deleted, all call sites migrated

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
- [x] PR #21/PR #23 merged (Logan's provider portal)
- [x] Add "Email me a code instead" to web sign-in ✅
- [x] Admin dashboard MVP (provider approvals, leads, team management)
- [x] Auth overhaul — unified modal, Google OAuth, post-auth onboarding

---

## Blocked / Needs Input

_Items waiting on decisions, external input, or dependencies._

_None currently._

---

## Next Up

_What should be tackled next, in priority order._

1. **Test Google OAuth end-to-end** (Supabase Google provider configured, needs live test)
2. **Email notifications** for provider approval/rejection
3. **Community forum flagging** infrastructure for admin moderation
4. **Update claim flow** - Wire `source_provider_id` to claim existing olera-providers listings
5. Payment/subscription integration
6. Environment strategy (dev/staging/prod)

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
| 2026-02-09 | Admin dashboard at `/admin` (not linked from public site) | Internal-only tool; no nav link needed, access via URL |
| 2026-02-09 | Provider claims go to `pending` first (not `claimed`) | Admin review before provider goes live; families skip to `claimed` |
| 2026-02-09 | `ADMIN_EMAILS` env var for bootstrapping | Can always re-seed master admin if table emptied |
| 2026-02-10 | Auth-first flow (not profile-first) | Best practice: authenticate first, then collect profile data |
| 2026-02-10 | Google OAuth primary CTA | One-click auth is fastest path; positioned above email |
| 2026-02-10 | Single UnifiedAuthModal replaces 2 modals | Eliminated ~2,000 LOC of duplication |
| 2026-02-10 | Post-auth onboarding inside modal | No separate /onboarding page; smoother UX |
| 2026-01-30 | Added Claude Code slash commands | Standardize workflow for explore → plan → build → save cycle |

---

## Notes & Observations

_Useful context, patterns noticed, things to remember._

- Project is a TypeScript/Next.js web app for senior care discovery
- Slash commands reference iOS patterns in some places - update for web as needed

---

## Session Log

### 2026-02-10 (Session 11)

**Auth Overhaul — All 3 Phases Complete:**

- **Replaced ~3,000 lines of auth code** with ~1,000-line unified system
- **Phase 1**: New `UnifiedAuthModal` with Google OAuth + email-first flow
  - Entry screen: Olera logo → "Log in or sign up" → Google button → email field
  - Email-first: checks if email exists → routes to sign-up or sign-in
  - Sign-up: name + password → OTP verification
  - Sign-in: password or "email me a code" OTP
  - New `/auth/callback` route for Google OAuth code exchange
  - New `/api/auth/check-email` route for email existence check
- **Phase 2**: Post-auth onboarding inside the modal
  - `PostAuthOnboarding` component: intent → profile info → org search → complete
  - `lib/profile-creation.ts`: extracted from AuthFlowModal (~150 lines)
  - Family flow: name, city, state, care types → create profile → /browse
  - Provider flow: org name, city, state, type, care types → /portal
  - Claim flow: pre-fills data from claimed provider
- **Phase 3**: Cleanup — deleted legacy code, migrated all call sites
  - Deleted: `AuthModal.tsx` (517 LOC), `AuthFlowModal.tsx` (1887 LOC), `GlobalAuthFlowModal.tsx` (23 LOC)
  - Deleted: `IntentStep.tsx`, `OrgClaimStep.tsx`, `ProfileInfoStep.tsx` (dead onboarding components)
  - Migrated: Navbar, ProviderGetStartedButton, InquiryButton, ConnectButton, RoleGate, ProfileSwitcher, claim page
  - Simplified `/onboarding/page.tsx` to redirect wrapper
  - Removed `/onboarding` from middleware protected paths
- **UI polish**: Premium modal design (Luma/Linear-inspired)
  - Olera hummingbird logo at top of entry screen
  - Google button first (one-click auth = primary action)
  - No input labels — clean placeholders only
  - Consistent `rounded-xl` on buttons, inputs, Google button
  - `text-xl font-semibold` headings (lighter than before)
  - Configured Google OAuth in Supabase Dashboard + Google Cloud Console

**New files (7):**
- `components/auth/UnifiedAuthModal.tsx` — main auth modal (~350 LOC)
- `components/auth/PostAuthOnboarding.tsx` — post-auth onboarding (~400 LOC)
- `components/auth/GlobalUnifiedAuthModal.tsx` — context wrapper
- `lib/profile-creation.ts` — extracted profile creation logic
- `app/auth/callback/route.ts` — Google OAuth callback
- `app/api/auth/check-email/route.ts` — email existence check
- `public/images/olera-logo.png` — Olera hummingbird logo

**Deleted files (6):**
- `components/auth/AuthModal.tsx`, `AuthFlowModal.tsx`, `GlobalAuthFlowModal.tsx`
- `components/onboarding/IntentStep.tsx`, `OrgClaimStep.tsx`, `ProfileInfoStep.tsx`

**Modified files (13):**
- `components/auth/AuthProvider.tsx` — added `openAuth()`, deprecated old methods
- `components/ui/Modal.tsx` — added `onBack` prop, rounded-2xl, always-show header
- `components/ui/Button.tsx` — `rounded-xl`
- `components/ui/Input.tsx` — `rounded-xl`, `text-base`
- `components/shared/Navbar.tsx` — migrated to `openAuth()`
- `components/shared/ConnectButton.tsx`, `RoleGate.tsx`, `ProfileSwitcher.tsx` — migrated
- `components/providers/InquiryButton.tsx`, `ProviderGetStartedButton.tsx` — migrated
- `app/for-providers/claim/[slug]/page.tsx` — migrated to `openAuth()`
- `app/onboarding/page.tsx` — simplified to redirect wrapper
- `app/layout.tsx` — swapped to `GlobalUnifiedAuthModal`
- `lib/supabase/middleware.ts` — removed `/onboarding` from protected paths

---

### 2026-02-09 (Session 10)

**Admin Dashboard MVP:**

- **Built full admin dashboard** at `/admin` with 4 sections:
  - **Overview**: Stat cards (pending providers, inquiries, admin count) + audit activity timeline
  - **Providers**: Approval queue with Pending/Approved/Rejected/All tabs, approve/reject actions
  - **Leads**: Read-only view of all connections with type filters
  - **Team**: Admin management with add/remove (master_admin only), role badges
- **Changed provider claim flow**: New claims go to `pending` (not `claimed`), families skip to `claimed`
- **Added portal banners**: "Profile under review" for pending, "Not approved" for rejected
- **Auth gating**: Middleware redirects unauthenticated, layout shows "Access denied" for non-admins
- **Auto-seed**: `ADMIN_EMAILS` env var bootstraps first master_admin

**New files (15):**
- `supabase/migrations/002_admin_dashboard.sql` - admin_users, audit_log tables
- `lib/admin.ts` - getServiceClient, getAdminUser, seedInitialAdmin, logAuditAction
- `hooks/useAdminAuth.ts` - client-side admin auth hook
- `components/admin/AdminSidebar.tsx` - sidebar + mobile bottom nav
- `app/admin/layout.tsx`, `page.tsx`, `providers/page.tsx`, `leads/page.tsx`, `team/page.tsx`
- `app/api/admin/auth/route.ts`, `providers/route.ts`, `providers/[id]/route.ts`, `leads/route.ts`, `team/route.ts`, `audit/route.ts`

**Modified files (7):**
- `lib/types.ts` - Added `rejected` to ClaimState, admin types
- `lib/supabase/middleware.ts` - Added `/admin` to protected paths
- `components/auth/AuthFlowModal.tsx` - Provider claims → `pending`
- `app/onboarding/page.tsx` - Provider claims → `pending`, families stay `claimed`
- `app/portal/page.tsx` - Pending/rejected banners
- `components/ui/Badge.tsx` - Added `rejected` variant
- `components/providers/ClaimBadge.tsx` - Added `rejected` to type union

**SQL migration run** ✅ - Tables: admin_users, audit_log with RLS + indexes
**Admin emails configured**: tfalohun@gmail.com (master_admin), tj@olera.care (master_admin)
**Build passes** ✅

---

### 2026-02-07 (Session 9)

**Merged PR #22 - Esther's Design + Our Supabase Data:**

- **Merged PR #22** (browse-page-refinement from Esther's fork)
  - Used manual merge branch to resolve conflicts
  - Conflicts resolved:
    - `SCRATCHPAD.md` - kept ours
    - `Navbar.tsx` - kept ours (auth integration)
  - Esther's changes merged: Community forum V2, navbar updates, browse filter widths

- **Fixed homepage city search regression**
  - PR #22 added `DEFAULT_LOCATION = "New York, NY"` that pre-filled search
  - Removed to restore iOS-like placeholder behavior ("City or ZIP code")

- **Integrated Esther's browse design with Supabase data**
  - Switched `/browse` to use `BrowseClient` component (carousel/grid/map views)
  - Added Supabase fetching to `BrowseClient.tsx` (replaced mock data)
  - Queries `olera-providers` table (39K+ providers)
  - Filters by care type, location (city/state/ZIP)
  - Client-side filtering for rating and payment type
  - Files modified:
    - `components/browse/BrowseClient.tsx` - Added Supabase integration
    - `app/browse/page.tsx` - Switched to BrowseClient component

- **Verified provider detail page**
  - All Esther's design elements already merged:
    - Olera Score breakdown (Community, Value, Transparency, Completeness)
    - "What families are saying" reviews section
    - "Similar providers nearby" section
  - Using real Supabase data (`community_score`, `value_score`, `info_score`)

**Commits:**
- `c0e0abf` - Merge PR #22
- `c1e3a92` - Fix homepage city search placeholder
- `e5b0e1a` - Integrate Supabase data with Esther's browse design

---

### 2026-02-07 (Session 8)

**"Email me a code instead" - OTP Sign-in Option:**

- **Added OTP sign-in option to match iOS app UX**
  - User couldn't sign in (forgot password) - wanted OTP option like iOS app
  - Added "Email me a code instead" link below password field in sign-in forms

- **Files modified:**
  - `components/auth/AuthFlowModal.tsx`:
    - Added `handleSendOtpForSignIn` handler using `signInWithOtp`
    - Updated `AuthStep` component with new `onSendOtpCode` prop
  - `components/auth/AuthModal.tsx`:
    - Added `verify-otp` view type
    - Added OTP handlers and 8-digit code input UI

- **PR #24 merged** - OTP sign-in feature live

**Provider Portal Cleanup:**

- **Closed PR #21** (Logan's original) with comment explaining it was integrated via PR #23
- Logan's code was merged with schema modifications, not his original PR

**Supabase Schema Documentation:**

Documented actual table usage for team clarity:

| Table | iOS | Web | Purpose |
|-------|-----|-----|---------|
| `olera-providers` | ✅ | ✅ | 39K provider directory (shared) |
| `profiles` | ✅ | ❌ | iOS user identity |
| `care_requests` | ✅ | ❌ | iOS connection requests |
| `care_need_profiles` | ✅ | ❌ | iOS family care needs |
| `matches` | ✅ | ❌ | iOS family-provider matching |
| `conversations` / `messages` | ✅ | ❌ | iOS chat |
| `accounts` | ❌ | ✅ | Web user identity (NEW) |
| `business_profiles` | ❌ | ✅ | Web business listings (NEW) |
| `connections` | ❌ | ✅ | Web inquiries/saves (NEW) |
| `memberships` | ❌ | ✅ | Web subscriptions (NEW) |

**Key clarification:** `profiles` → `business_profiles` rename was because iOS uses `profiles` for user identity, not business listings.
    - Updated `AuthStep` component with new `onSendOtpCode` prop
    - Added OTP link in sign-in mode (disabled if email not entered)
  - `components/auth/AuthModal.tsx`:
    - Added `verify-otp` view type
    - Added OTP state: `otpCode`, `resendCooldown`
    - Added handlers: `handleSendOtpForSignIn`, `handleVerifyOtp`, `handleResendOtp`
    - Added OTP verification UI with 8-digit code input
    - Added "Email me a code instead" link in sign-in form

- **UX Flow:**
  1. User enters email on sign-in form
  2. Clicks "Email me a code instead"
  3. OTP code sent via `signInWithOtp`
  4. User enters 8-digit code
  5. Code verified, user signed in

- **Build passes** ✅

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
- **Created PR #23**: https://github.com/olera-care/olera-web/pull/23
- **SQL Migration Run** ✅ - Tables created in Supabase:
  - `accounts` - web portal user identity
  - `business_profiles` - orgs/caregivers/families with `source_provider_id`
  - `memberships` - subscription info
  - `connections` - inquiries/saves
- **Next steps**:
  1. ~~Run SQL migration in Supabase~~ ✅ Done
  2. Add `SUPABASE_SERVICE_ROLE_KEY` to Vercel (user action)
  3. Merge PR #23 to main
  4. Test provider portal flows
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
