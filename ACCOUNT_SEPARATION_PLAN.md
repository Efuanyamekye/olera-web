# Account Separation Plan — Remaining Work

**Branch:** `feature/user-accounts-separation-logic`
**Status:** Phase 1 complete, Phase 2 pending

---

## Context

We implemented strict account type separation:
- **Family accounts** — can browse, save, and request care from providers
- **Organization accounts** — providers (facilities, agencies)
- **Caregiver accounts** — individual caregivers (type: `caregiver`)
- **Student accounts** — MedJobs caregivers (type: `student`)

**Rule:** One email = one account type. No multi-profile accounts.

---

## Completed (Phase 1)

- [x] Backend: `ensure-account` only creates family profile with claimToken
- [x] Backend: `create-profile` doesn't auto-create family for providers
- [x] AuthProvider: Filter inactive profiles (`is_active = true`)
- [x] Navbar: Dropdown based on profile type, not URL
- [x] Navbar: "Switch to family" only shows if user has family profile
- [x] ConnectButton: "Family account required" modal (org/caregiver/student)
- [x] RoleGate: "Account required" message instead of "Create profile"
- [x] `/portal/profile`: Redirects non-family to Provider Hub or MedJobs
- [x] `/account/settings`: New universal settings page with account-type-aware notifications
- [x] Middleware: `/account` added to protected routes

---

## Remaining (Phase 2) — Family Action Audit

### HIGH Priority

| Task | File | Current Behavior | Fix Needed |
|------|------|------------------|------------|
| **InquiryButton auto-creates family** | `components/providers/InquiryButton.tsx` | Lines 78-98 create family profile for ANY user | Block non-family users, show "Family account required" message |

### MEDIUM Priority

| Task | File | Current Behavior | Fix Needed |
|------|------|------------------|------------|
| **Save/heart providers** | `hooks/use-saved-providers.tsx` | Works for any profile type | Decide: Should providers be able to save? If not, add family-only check |
| **/saved page** | `app/saved/page.tsx` | Accessible by any profile type | Add family-only guard or role-appropriate messaging |
| **Welcome/onboarding flow** | `/welcome`, `WelcomeClient.tsx` | No profile type check | Block providers/students, redirect to their dashboards |

### LOW Priority / Need Decision

| Task | File | Notes |
|------|------|-------|
| **Benefits finder** | `/benefits/*` | Verify if family-only or open to all |
| **Review/Q&A submission** | Provider detail page | Can providers submit reviews? Probably not. |

---

## UX Pattern for Blocking

**Inline contextual message (not popup):**

```
┌─────────────────────────────────────────────┐
│  🔒 Family Account Required                 │
│                                             │
│  [Action] is a family feature. Create a     │
│  family account to [do action].             │
│                                             │
│  [Create Family Account →]                  │
│                                             │
│  You'll need to use a different email.      │
└─────────────────────────────────────────────┘
```

---

## Questions to Answer

1. Should providers be able to save other providers (for referrals)?
2. Should the /saved page work for providers saving caregivers they want to hire?
3. Should students be able to save providers?

---

## How to Resume This Work

```bash
# 1. Switch to the branch
git checkout feature/user-accounts-separation-logic

# 2. Rebase onto latest staging (if needed)
git fetch upstream staging
git rebase upstream/staging

# 3. Reference this file for remaining tasks
cat ACCOUNT_SEPARATION_PLAN.md
```

---

## Related Files Modified

- `app/account/settings/page.tsx` (new)
- `app/api/auth/create-profile/route.ts`
- `app/api/auth/ensure-account/route.ts`
- `app/portal/profile/page.tsx`
- `app/portal/settings/page.tsx` (now redirect)
- `components/auth/AuthProvider.tsx`
- `components/shared/ConnectButton.tsx`
- `components/shared/Navbar.tsx`
- `components/shared/ProfileSwitcher.tsx`
- `components/shared/RoleGate.tsx`
- `lib/supabase/middleware.ts`
