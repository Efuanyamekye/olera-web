# Plan: Demand Map + Care Seekers Public Profile Tracking

Created: 2026-04-01
Status: Not Started

## Goal

Give TJ a bird's-eye view of care seeker demand by city (how many have public profiles) to drive targeted provider outreach, plus granular filtering on the existing Care Seekers page. Reshape the Overview to keep only actionable stats upfront with a "See all" escape hatch.

## Success Criteria

- [ ] New `/admin/demand` page shows city-grouped counts with sorting + search
- [ ] Clicking a city row navigates to Care Seekers page filtered to that city
- [ ] Care Seekers page has a "Public" tab filtering to active care posts
- [ ] Care Seekers page has a city dropdown filter
- [ ] Overview: demote Reviews to "See all stats" page, add Public Profiles card
- [ ] All data loads fast via indexed Supabase queries on existing columns

## Architecture Notes

**No new tables or migrations needed.** Everything lives in `business_profiles` already:
- `type = 'family'` identifies care seekers
- `metadata->care_post->status = 'active'` identifies public profiles
- `city` and `state` columns are already indexed (`profiles_city_state_idx`)

**Query pattern:** Supabase JS can't GROUP BY, so the demand endpoint fetches all active-care-post family profiles (expected low hundreds at most) and aggregates in JS. Revisit with an RPC if it exceeds ~500.

**No provider-side data in demand table for now** — too few subscribed providers to be useful. Let needs dictate when we add supply-side context.

## Tasks

### Phase 1: API

- [ ] 1. Extend `GET /api/admin/care-seekers` with new query params
      - `public_only=true` — filters to metadata containing `{ care_post: { status: 'active' } }`
      - `city` — exact city match
      - `state` — exact state match
      - Files: `app/api/admin/care-seekers/route.ts`
      - Verify: `/api/admin/care-seekers?public_only=true` returns only active care post profiles

- [ ] 2. Create `GET /api/admin/demand` endpoint
      - Fetches all family profiles with active care posts (id, city, state, created_at, metadata)
      - Aggregates and returns: `{ cities: [{ city, state, count, new_this_week, latest_published }], total_public, total_cities }`
      - Profiles with null city grouped as "Location not set"
      - Files: `app/api/admin/demand/route.ts`
      - Verify: `/api/admin/demand` returns JSON with city counts

### Phase 2: Demand Map page

- [ ] 3. Create `/admin/demand` page
      - **Stat cards**: Total Public Profiles, Cities with Demand, New This Week
      - **Search**: text input filtering by city name (client-side, instant)
      - **Sortable table columns**:
        - City (alpha A-Z / Z-A)
        - State (alpha)
        - Public Profiles (count desc — **default sort**, count asc)
        - New This Week (count desc/asc)
        - Latest Go-Live (most recent / oldest)
      - Click column header to toggle sort direction, active sort column highlighted
      - Each city row links to `/admin/care-seekers?filter=public&city=X&state=Y`
      - Null-city rows show "Location not set" in italic gray
      - Empty state: "No care seekers have published their profiles yet"
      - Files: `app/admin/demand/page.tsx`
      - Verify: Table sorts correctly on all columns, search filters instantly, row click navigates

### Phase 3: Extend Care Seekers page

- [ ] 4. Add "Public" tab, city filter, and City column to Care Seekers page
      - New tab: "Public" alongside All/Guest/Claimed — sends `public_only=true`
      - City dropdown filter (populated from distinct cities across current results)
      - Read URL search params on mount (`?filter=public&city=Houston&state=TX`) for deep-linking from Demand page
      - Add "City" column to the table (currently missing — city data exists but isn't shown)
      - Add a "Public" count in the stats row
      - Files: `app/admin/care-seekers/page.tsx`
      - Verify: Public tab works, city filter works, deep-links from Demand page arrive pre-filtered

### Phase 4: Overview + Sidebar

- [ ] 5. Reshape Overview stat cards + add sidebar nav
      - **Demote Reviews** card — move to "See all stats →" link target
      - **Add "Public Profiles"** card (count of active care posts, links to `/admin/demand`)
      - **Add "See all stats →"** link below the cards grid, linking to a section or separate route with all stats (Reviews, Provider Directory, Care Seekers total, etc.)
      - **Sidebar**: Add "Demand" under Inbox section (between Activity Center and Leads)
      - Files: `app/admin/page.tsx`, `components/admin/AdminSidebar.tsx`
      - Verify: Overview shows 5 actionable cards + See All link, sidebar shows Demand

## Risks

- **JSONB filtering**: Use `.contains('metadata', { care_post: { status: 'active' } })` for nested JSONB. PostgREST `@>` operator handles this cleanly.
- **Scale**: Client-side aggregation for demand endpoint works at current scale (dozens). Add RPC if it grows past 500.
- **City data quality**: Profiles with null city will show as "Location not set" — not hidden. This makes the gap visible so TJ can decide if Go Live should require a city.

## Notes

- `metadata->care_post->status` set by `POST /api/care-post/publish`
- Admin uses service client — no RLS concern
- No migration needed — purely API routes + frontend
- Provider count per city intentionally excluded — revisit when subscribed provider base grows
