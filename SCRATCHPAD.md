# Scratchpad

> A living document for tracking work in progress, decisions, and context between sessions.

---

## Current Focus

_What's the main thing being worked on right now?_

- Landing page redesign (hero section, provider cards spacing)

---

## In Progress

_Active work items and their current state._

- [x] Initial project setup
- [x] Provider cards on homepage
- [x] Provider detail page
- [x] Hero section redesign
- [x] Provider card spacing standardization
- [ ] Browse page with filtering

---

## Blocked / Needs Input

_Items waiting on decisions, external input, or dependencies._

_None currently._

---

## Next Up

_What should be tackled next, in priority order._

1. Browse page with provider cards and filters
2. User authentication (login/signup)
3. Consultation request flow

---

## Decisions Made

_Key decisions with rationale, for future reference._

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-01-30 | Added Claude Code slash commands | Standardize workflow for explore → plan → build → save cycle |

---

## Notes & Observations

_Useful context, patterns noticed, things to remember._

- Project is a TypeScript/Next.js web app for senior care discovery
- Slash commands reference iOS patterns in some places - update for web as needed

---

## Session Log

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
