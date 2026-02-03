# Authentication, Accounts, Monetization & Marketplace Design

## 1. Account + Profile Model

### Recommendation: One Account → Multiple Profiles

A single authenticated user can own multiple profiles (e.g., a family profile and a provider profile). This avoids forced duplicate accounts and supports real-world scenarios like an agency owner who also needs to find care for a parent.

### Data Model (Three Layers)

```
auth.users (Supabase Auth — managed automatically)
├── id (uuid)
├── email
├── created_at

public.accounts
├── id (uuid)
├── user_id (FK → auth.users, unique)
├── active_profile_id (FK → profiles, nullable)
├── display_name
├── avatar_url
├── onboarding_completed (boolean, default false)
├── created_at

public.profiles
├── id (uuid)
├── account_id (FK → accounts)
├── slug (unique)
├── type: "organization" | "caregiver" | "family"
├── category (nullable): specific subtype enum
├── name / display_name
├── description
├── image_url
├── phone, email, website
├── address, city, state, zip, lat, lng
├── service_area (nullable, for home-based providers)
├── care_types (text array)
├── claim_state: "unclaimed" | "pending" | "claimed"
├── verification_state: "unverified" | "pending" | "verified"
├── source: "seeded" | "user_created"
├── is_active (boolean, default true)
├── created_at / updated_at
```

### Key Decisions

- **User → Account** is 1:1. Every authenticated user gets exactly one account record. The account is the "person."
- **Account → Profiles** is 1:many. Most users will have exactly one profile in v1. The multi-profile capability exists in the schema but the UI only surfaces it when relevant (profile switcher hidden until 2+ profiles).
- **`active_profile_id`** on the account controls the current context. All browse experiences, navbar rendering, and connection logic reference this field.
- Profile type is **immutable** after creation. Category can be updated.

### Tradeoff: Why Not One-Account-One-Role?

| Factor | Multi-profile (chosen) | Single-role |
|--------|----------------------|-------------|
| Duplicate accounts | Prevented | Inevitable |
| Cross-role activity | Supported | Impossible |
| Schema complexity | Slightly higher | Simpler |
| UI complexity | Profile switcher (hidden by default) | None |
| Future migration | None needed | Painful |

The slight additional schema complexity is worth the prevention of duplicate accounts and the avoidance of a future migration.

---

## 2. Authentication Timing & Onboarding

### Auth Boundary

| Action | Auth Required? |
|--------|---------------|
| Browse provider profiles | No |
| View provider detail page | No |
| Search and filter providers | No |
| Read reviews | No |
| Visit /for-providers | No |
| Save/bookmark a profile | Yes |
| Send an inquiry | Yes |
| Respond to an inquiry | Yes |
| Claim a provider profile | Yes |
| Create a provider profile | Yes |
| Apply to an organization | Yes |
| Invite a caregiver | Yes |

**Rule: Read is free. Write requires identity.**

### Auth Trigger UX

When an unauthenticated user clicks a gated action (e.g., "Save" or "Request Consultation"), they are redirected to:

```
/auth/signup?redirect=/provider/sunrise-senior-living&action=inquiry
```

After signup + onboarding, the user lands back at the original page with the intended action ready to complete. The `redirect` and `action` query params preserve intent across the auth boundary.

### Onboarding Flow (Post-Signup)

```
Step 1: Intent Selection
  "What brings you to Olera?"
  → "I'm looking for care for someone"    → creates family profile
  → "I manage a care organization"         → creates organization profile
  → "I'm an independent caregiver"         → creates caregiver profile

Step 2: Threshold Profile Info (varies by intent)
  Family:       name, zip code, care type needed
  Organization: org name, category, location → triggers claim search
  Caregiver:    name, location, care types offered

Step 3: Redirect by Role
  Family       → /browse/providers (start finding care)
  Organization → /portal (if claimed/created) or claim flow (if match found)
  Caregiver    → /portal (profile created, start browsing)
```

### Critical Design Rules

1. **Every onboarding field maps to a profile column.** No separate `onboarding_responses` table. Onboarding IS profile creation with a minimal field set.
2. **The profile editor shows onboarding data pre-filled.** Users can expand and enrich later without re-entering anything.
3. **Organization onboarding includes claim detection.** After entering org name in step 2, search existing seeded profiles. Show matches: "Is this your organization?" → Yes → claim flow. No match → create new.
4. **Incomplete onboarding is recoverable.** If a user authenticates but hasn't completed onboarding (`onboarding_completed = false`), middleware redirects them to `/onboarding` on every authenticated page request.

---

## 3. Monetization & Paywall

### Core Principle: Visibility Free, Engagement Paid

Provider profiles are discoverable for free (SEO, AEO, organic search, Olera browse). Providers can receive inbound inquiries for free. Outbound and responsive engagement requires a paid membership.

### Cold-Start Risk (Important)

A hard paywall on day one creates a negative feedback loop at low volume:
- Families send inquiries → providers can't respond → families get silence → families leave → providers see no value → no one pays

### Recommended Phased Approach

```
Launch (months 1-3):
  All engagement is free for all users.
  Track engagement events (inquiries sent, received, responded).
  Build volume and establish value.

Growth (months 3-6):
  Introduce free tier: 5 outbound responses/month.
  Pro tier ($25/month): unlimited responses + premium features.
  Show providers their engagement data to drive conversion.

Mature (6+ months):
  Reduce free tier (2 responses/month or zero).
  Paywall is enforceable because volume justifies the price.
```

### Alternative: Day-One Paywall With Trial

If launching with paywall from day one, every new provider gets a **30-day free trial** with full engagement. After trial expiry:
- Free tier: see that inquiries exist (blurred: "A family in [ZIP] is looking for [care type]")
- Pro tier: full inquiry details, unlimited responses, outbound contact

### Pricing

```
Pro Membership:
  Monthly: $25/month
  Annual:  $249/year ($20.75/month effective, ~17% savings)
```

Annual pricing is rounded to $249 (not $255) for cleaner conversion.

### Who Pays

- **Families: Never pay.** Families are the demand side. Charging them kills the marketplace. All family actions are free, forever.
- **Providers (organizations + caregivers): Paying side.** Their payment unlocks engagement with family demand and workforce supply.

### Paywall Enforcement Matrix

```
Action                              Free          Pro
────────────────────────────────────────────────────────
Have a public profile               Yes           Yes
Receive inbound inquiries           Yes           Yes
See that inquiries exist            Yes           Yes
View full inquiry details           Limited*      Yes
Respond to inquiries                Limited*      Yes
Initiate outbound contact           No            Yes
Invite caregivers to apply          No            Yes
View family profile details         Limited*      Yes
Engagement analytics                No            Yes

* Limited = show metadata (zip, care type, timeline) but blur name/contact
```

### Membership Data Model

```
public.memberships
├── id (uuid)
├── account_id (FK → accounts, unique)
├── plan: "free" | "pro"
├── billing_cycle: "monthly" | "annual" (nullable if free)
├── status: "active" | "trialing" | "past_due" | "canceled"
├── trial_ends_at (nullable)
├── current_period_ends_at (nullable)
├── free_responses_used (integer, default 0)
├── free_responses_reset_at (timestamp)
├── stripe_customer_id (nullable)
├── stripe_subscription_id (nullable)
├── created_at / updated_at
```

Membership is at the **account** level, not profile level. One subscription covers all profiles under that account.

### Subscription Lapse Grace Period

Payment failure → 7 days of `past_due` status where engagement continues. After 7 days → downgrade to free tier. All data, profiles, and history remain intact.

---

## 4. Marketplace Browsing Modes

### Route Structure

```
/browse                         → Redirects based on active profile type
/browse/providers               → Default for families: orgs, facilities, caregivers
/browse/providers?type=agency   → Filtered by category
/browse/families                → Default for providers: family profiles seeking care
/browse/caregivers              → For orgs: hiring marketplace
/browse/organizations           → For caregivers: job opportunities
```

### What Each Role Sees

#### Family (active profile)
```
Default view: /browse/providers
Card shows:   provider name, location, care types, rating, verified badge, price range
Actions:      Save, Request Consultation, Read Reviews
Filters:      care type, location, price range, rating
```

#### Organization (active profile)
```
Default view: /browse/families
Card shows:   family zip code, care type needed, timeline, urgency
              (name/contact blurred for free tier)
Actions:      View Details*, Send Introduction*
Tab:          /browse/caregivers (hiring mode)
* Pro membership required for full details and outbound actions
```

#### Caregiver (active profile)
```
Default view: /browse/organizations
Card shows:   org name, location, care types, open positions
Actions:      View Details, Apply
Tab:          /browse/families (private work, pro membership required)
```

### Intent: Inferred vs. Explicit

- **Inferred from active profile type.** After onboarding, the system knows your role and defaults to the relevant browse mode. A family user clicking "Browse" goes to /browse/providers. A provider clicking "Browse" goes to /browse/families.
- **Explicitly switchable.** Browse pages show tabs for available modes relevant to the active role. A family never sees "Browse Families." A caregiver sees "Organizations" and "Families" tabs.
- **Unauthenticated users** always see /browse/providers (family-facing, SEO-indexed). Provider and caregiver browse modes are authenticated-only because they contain user-generated profile data.

### Navbar by Auth State

```
Unauthenticated:
  [Browse Care]  [For Providers]           [Log In]  [Get Started]

Family (authenticated):
  [Browse Care]  [Saved]                   [Profile ▾]

Organization (authenticated):
  [Browse]  [Portal]                       [Profile ▾]

Caregiver (authenticated):
  [Browse Jobs]  [Portal]                  [Profile ▾]
```

### Family Profile Privacy

Family profiles are **never publicly indexed.** No /family/[slug] public route exists. Family profiles are only visible to authenticated providers through /browse/families. This is enforced at:
- Route level: no public family pages
- API level: family profile fetches require authenticated provider context
- Database level: RLS policies on the profiles table

---

## 5. Edge Cases & Risks

### Profile Switcher Confusion
A user with both family and provider profiles could accidentally act as the wrong role. Mitigation: persistent context indicator in header ("Acting as: Sunrise Senior Living"), role confirmation before outbound actions, and type-checking that blocks nonsensical connections (e.g., org-to-org inquiry).

### Onboarding Abandonment
User authenticates but drops off during onboarding. They have an auth record but no profile. On next login, middleware checks `onboarding_completed` and redirects to /onboarding. No dead-end states.

### Claim + Create Race Condition
User A starts claiming a seeded profile. User B creates a new profile with the same name (not realizing the seeded one exists). Mitigation: the "create" flow for organizations always searches existing profiles first and suggests claiming. Only allow true creation if no reasonable match exists.

### Caregiver Dual Visibility
Private caregivers are visible to both families (for hire) and organizations (for employment). They must understand this during onboarding. A simple explanation: "Your profile will be visible to families looking for care and organizations looking to hire."

### Subscription Fairness at Scale
$25/month is the same for a solo caregiver and a large agency. Acceptable for v1 (simplicity). For v2, consider tiered pricing: solo ($25), small org ($49), enterprise ($99+). Do not build tiered pricing in v1.

### Data Sensitivity
Connection messages, family care needs, and health-related profile fields are sensitive. All API endpoints must enforce row-level security. Connection messages are only visible to the two parties involved. No admin "browse all messages" without explicit audit logging.

---

## 6. Updated Data Model Summary

```
auth.users (Supabase managed)
    │
    ▼ 1:1
public.accounts
    │
    ├──▶ active_profile_id
    │
    ├──▶ 1:1 public.memberships (free | pro)
    │
    └──▶ 1:many public.profiles
                    │
                    ├──▶ type: organization | caregiver | family
                    ├──▶ claim_state: unclaimed | pending | claimed
                    ├──▶ verification_state: unverified | pending | verified
                    │
                    ├──▶ many:many public.connections (from ↔ to)
                    └──▶ 1:many public.reviews (received)
```

### Connection Types by Role Pair

```
Family     → Organization:  inquiry ("I need care")
Family     → Caregiver:     inquiry ("I need care")
Organization → Family:      introduction ("We can help") [pro required]
Organization → Caregiver:   invitation ("Come work for us") [pro required]
Caregiver  → Organization:  application ("I want to work here") [pro required]
Caregiver  → Family:        introduction ("I can help") [pro required]
Any        → Any:           save (bookmark, always free)
```

---

## 7. V1 Implementation Priorities

```
Phase 1 — Foundation:
  ☐ Supabase auth integration (client, middleware, session handling)
  ☐ Database schema (accounts, profiles, memberships tables + RLS)
  ☐ Onboarding flow (intent → threshold info → redirect)
  ☐ Protected route middleware

Phase 2 — Provider Portal:
  ☐ /for-providers landing page
  ☐ Claim flow (search seeded profiles → claim)
  ☐ Create flow (caregiver profile creation)
  ☐ /portal dashboard + profile editor

Phase 3 — Marketplace:
  ☐ /browse/providers (family browse experience)
  ☐ /browse/families (provider browse, with paywall)
  ☐ Connection model (inquiries)
  ☐ Paywall enforcement (free tier + pro gating)

Phase 4 — Polish:
  ☐ Profile switcher (multi-profile support in UI)
  ☐ Stripe integration for pro membership
  ☐ Email notifications for new connections
  ☐ CI pipeline (lint + type-check on PR)
```
