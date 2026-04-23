# Phase 1 Implementation Plan: Questions as the Hook (MVP)

**Goal:** Preserve the question → claim funnel while introducing verification gently alongside momentum.

**Scope:** Magic link flow only (Entry Point 1). Providers clicking notification emails for questions.

---

## How to Resume This Work

If conversation context is lost, reference these files:

1. **Full Spec:** `docs/provider-verification-specs.md` - Complete feature spec with philosophy, phases, UX details
2. **This Plan:** `plans/verification-phase-1-implementation.md` - Implementation steps with progress tracking
3. **Branch:** `feature/verification` (branched from staging)

**Quick context:** We're implementing verification gating for suspicious provider claims. Low/medium trust providers (generic email) can claim and answer their first question, but must verify (via LinkedIn/website) to unlock full features. High trust providers (business domain email) have full access immediately.

---

## Progress Tracker

| Step | Description | Status | Commit |
|------|-------------|--------|--------|
| 1 | Data model migration | ✅ Done | e7d59ca4 |
| 2 | Trust scoring → verification_state | ✅ Done | e7d59ca4 |
| 3 | Update VerificationFormModal (LinkedIn/website fields) | ✅ Done | 680156da |
| 4 | Dashboard badge updates | ✅ Done | 7d757bfa |
| 5 | LLM auto-verification | ✅ Done | f368a283 |
| 6 | Verification prompt modal (post-answer) | ⬜ Not started | |
| 7 | ActionCard post-answer CTA | ⬜ Not started | |
| 8 | Email notifications | ⬜ Not started | |
| 9 | Slack integration | ⬜ Not started | |
| 10 | Reminder cron jobs | ⬜ Not started | |

**Last updated:** Steps 1-5 committed. Next: Step 6 (verification prompt modal post-answer).

---

## Overview

| Trust Level | First Question | After First Question | Badge |
|-------------|----------------|---------------------|-------|
| High | Answer freely | Full access | "Claimed" (optional verification for badge) |
| Medium/Low | Answer freely | Soft modal nudge to verify | "Pending verification" until verified |

---

## Implementation Steps

### Step 1: Data Model Updates

**Files to modify:**
- `supabase/migrations/XXX_verification_gating.sql`

**Changes:**

1. **Clarify `verification_state` semantics:**
   ```sql
   -- Existing: 'unverified' | 'pending' | 'verified'
   -- New semantics:
   -- 'not_required' = High trust, no verification needed
   -- 'required' = Low/medium trust, hasn't submitted yet
   -- 'pending' = Submitted, awaiting review (manual)
   -- 'verified' = Approved (auto or manual)
   -- 'rejected' = Rejected, can resubmit

   ALTER TABLE business_profiles
   ADD COLUMN IF NOT EXISTS verification_state_v2 TEXT
   DEFAULT 'not_required'
   CHECK (verification_state_v2 IN ('not_required', 'required', 'pending', 'verified', 'rejected'));
   ```

2. **Add verification submission fields to metadata schema:**
   ```sql
   -- Already exists: business_profiles.metadata.verification_submission
   -- Add to schema: linkedin_url, business_website_url
   -- One of these will be required for low/medium trust
   ```

3. **Track answered_before_verified in activity:**
   ```sql
   -- Add event type to activity_log
   -- 'provider_answered_question_unverified'
   ```

**Migration checklist:**
- [ ] Create migration file
- [ ] Add `verification_state_v2` column (or rename existing)
- [ ] Backfill existing claimed providers to appropriate state
- [ ] Test rollback

---

### Step 2: Update Trust Scoring Integration

**Files to modify:**
- `lib/claim-trust.ts` (read-only, already exists)
- `app/api/auth/auto-sign-in/route.ts`
- `app/api/claim/finalize/route.ts`

**Changes:**

1. **Set `verification_state_v2` based on trust level at claim time:**

   In `/api/claim/finalize` or `/api/auth/auto-sign-in`:
   ```typescript
   // After trust scoring runs:
   const verificationState = trustLevel === 'high'
     ? 'not_required'
     : 'required';

   // Update business_profiles.verification_state_v2
   await supabase
     .from('business_profiles')
     .update({ verification_state_v2: verificationState })
     .eq('id', profileId);
   ```

2. **Log trust level decision:**
   ```typescript
   // Already logging to activity, add verification_state to metadata
   ```

**Checklist:**
- [ ] Identify exact location where trust scoring runs
- [ ] Add verification_state_v2 update after trust scoring
- [ ] Test with high/medium/low trust emails

---

### Step 3: Update VerificationFormModal

**Files to modify:**
- `components/provider/VerificationFormModal.tsx`
- `app/api/provider/verification/route.ts`

**Changes:**

1. **Add LinkedIn URL field:**
   ```typescript
   // New field: linkedinUrl (required if no businessWebsiteUrl)
   // New field: businessWebsiteUrl (required if no linkedinUrl)
   // Validation: at least one must be provided
   ```

2. **Add "Can't provide either?" fallback:**
   ```typescript
   // Link or button that:
   // - Shows explanation text
   // - Submits to same review queue with flag: manual_review_requested: true
   // - Sets verification_state_v2 to 'pending'
   ```

3. **Update submission endpoint:**
   ```typescript
   // Store linkedin_url, business_website_url in metadata.verification_submission
   // Set verification_state_v2 to 'pending' (will be auto-verified or queued)
   // Trigger auto-verification flow (Step 5)
   ```

**UI mockup:**
```
┌─────────────────────────────────────────────────┐
│ Verify your connection to [Business Name]       │
├─────────────────────────────────────────────────┤
│ Full name*                                      │
│ [________________________]                      │
│                                                 │
│ Your role at [Business]*                        │
│ [Owner ▼]                                       │
│                                                 │
│ Phone (optional)                                │
│ [________________________]                      │
│                                                 │
│ LinkedIn profile URL*                           │
│ [https://linkedin.com/in/...]                   │
│                                                 │
│ — OR —                                          │
│                                                 │
│ Business website showing your name*             │
│ [https://...]                                   │
│                                                 │
│ ⓘ Can't provide either? Contact support         │
│                                                 │
│ Notes (optional)                                │
│ [________________________]                      │
│                                                 │
│              [Submit for verification]          │
└─────────────────────────────────────────────────┘
```

**Checklist:**
- [ ] Add linkedinUrl field with validation
- [ ] Add businessWebsiteUrl field with validation
- [ ] Add "at least one required" validation logic
- [ ] Add "Can't provide either?" support fallback
- [ ] Update API endpoint to store new fields
- [ ] Update API endpoint to trigger auto-verification

---

### Step 4: Dashboard Badge Update

**Files to modify:**
- `components/provider-dashboard/VerificationStatusBadge.tsx` - Add "Pending verification" state
- `components/provider-dashboard/ProfileOverviewCard.tsx` - Update badge logic

**Current state:**
- `VerificationStatusBadge.tsx` only renders if `badge_approved === true` (shows "Verified")
- `ProfileOverviewCard.tsx` shows "Claimed" if not verified, "Verified" if approved

**Changes:**

1. **Update `VerificationStatusBadge.tsx` to handle new states:**
   ```typescript
   // Accept verification_state_v2 as prop
   // Render based on state:
   // - 'not_required': Don't render (high trust, shows "Claimed" via ProfileOverviewCard)
   // - 'required': Render amber "Pending verification" with tooltip
   // - 'pending': Render amber "Pending verification" with "reviewing" tooltip
   // - 'verified': Render green "Verified" ✓ (existing)
   // - 'rejected': Render amber "Pending verification" with "resubmit" tooltip
   ```

2. **Update `ProfileOverviewCard.tsx` badge logic:**
   ```typescript
   // Current: shows "Claimed" or "Verified"
   // New: shows "Claimed" for not_required, delegates to VerificationStatusBadge for others
   ```

3. **Tooltip messages:**
   - `required`: "Complete verification to unlock all features."
   - `pending`: "We're reviewing your submission. You'll hear from us within 3 hours during business hours."
   - `rejected`: "Your submission needs updates. Check your email for details."

**Checklist:**
- [ ] Add verification_state_v2 to ProfileOverviewCard props
- [ ] Update VerificationStatusBadge to accept and render new states
- [ ] Add amber "Pending verification" badge variant
- [ ] Add tooltip with contextual messaging per state
- [ ] Test all states visually

---

### Step 5: LLM Auto-Verification

**Files to create:**
- `lib/verification-auto.ts` (core logic)
- `app/api/provider/verify-submission/route.ts` (endpoint)

**How it works:**

1. **Trigger:** Called after verification form submission

2. **Input:**
   - LinkedIn URL or business website URL
   - Provider's claimed role
   - Business name from directory record
   - Provider's name from form

3. **Process:**
   ```typescript
   // 1. Fetch LinkedIn page (or business website)
   // 2. Send to Claude with prompt:
   //    "Does this LinkedIn profile belong to someone who works at [Business]?
   //     Claimed role: [role]
   //     Claimed name: [name]
   //     Business name: [business]
   //     Return: { confidence: 'high' | 'medium' | 'low', reason: string }"
   // 3. If confidence === 'high': auto-approve
   // 4. Else: route to Slack queue
   ```

4. **Output:**
   - `verified`: Set verification_state_v2 = 'verified', send approval email
   - `needs_review`: Set verification_state_v2 = 'pending', send "looking closer" email, post to Slack

**Checklist:**
- [ ] Create lib/verification-auto.ts with LLM logic
- [ ] Create API endpoint
- [ ] Implement LinkedIn page fetching (consider rate limits, auth)
- [ ] Implement business website fetching
- [ ] Write Claude prompt for verification
- [ ] Handle timeout/errors gracefully (default to manual review)
- [ ] Test with various LinkedIn profiles

---

### Step 6: Verification Prompt Modal (Post-Answer)

**Files to create:**
- `components/provider/VerificationPromptModal.tsx`

**Files to modify:**
- `components/provider-onboarding/ActionCard.tsx` (trigger modal after answer)

**Trigger conditions:**
- Provider just submitted their FIRST answer
- Provider's verification_state_v2 === 'required'

**Modal content:**
```
┌─────────────────────────────────────────────────┐
│                                                 │
│  ✓ Your answer is live!                         │
│                                                 │
│  Verify your connection to [Business Name]      │
│  to unlock your full dashboard and remove       │
│  the pending label.                             │
│                                                 │
│  [Complete verification]     [Maybe later]      │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Behavior:**
- "Complete verification" → Opens VerificationFormModal
- "Maybe later" → Closes modal, user continues to dashboard
- No blocking, just a nudge

**Checklist:**
- [ ] Create VerificationPromptModal component
- [ ] Identify where first answer submission is handled
- [ ] Add trigger logic (check if first answer + verification required)
- [ ] Track that prompt was shown (avoid showing repeatedly)
- [ ] Test flow: answer question → see modal → complete or dismiss

---

### Step 7: ActionCard Post-Answer State

**Files to modify:**
- `components/provider-onboarding/ActionCard.tsx`

**Changes:**

After a question is answered, if verification is required, show CTA:

```typescript
// In post-answer state for low/medium trust:
{verificationRequired && (
  <div className="mt-4 p-3 bg-amber-50 rounded-lg">
    <p className="text-sm text-amber-800">
      Complete verification to unlock all dashboard features.
    </p>
    <Button
      variant="outline"
      size="sm"
      onClick={openVerificationModal}
      className="mt-2"
    >
      Verify now
    </Button>
  </div>
)}
```

**Checklist:**
- [ ] Add verification_state_v2 to ActionCard props/context
- [ ] Add conditional CTA in post-answer state
- [ ] Style consistently with existing design
- [ ] Test: answer question → see verification CTA in card

---

### Step 8: Email Notifications

**Files to create:**
- `lib/email-templates/verification-approved.tsx`
- `lib/email-templates/verification-pending-review.tsx`
- `lib/email-templates/verification-rejected.tsx`

**Files to modify:**
- `app/api/provider/verify-submission/route.ts` (send emails after verification decision)

**Emails to implement:**

1. **On auto-approval:**
   - Subject: "You're verified ✓"
   - Body: "Full access is now active. [Go to dashboard]"

2. **On manual review submission:**
   - Subject: "We're reviewing your verification"
   - Body: "We'll email you within 3 hours during business hours."

3. **On manual approval:**
   - Subject: "You're verified ✓"
   - Body: "Full access is now active. [Go to dashboard]"

4. **On rejection:**
   - Subject: "Verification needs more info"
   - Body: "We couldn't verify your claim. Here's why: [reason]. [Resubmit with updated info]"

**Checklist:**
- [ ] Create email templates (React Email or existing system)
- [ ] Integrate with existing email sending infrastructure
- [ ] Send auto-approval email in verify-submission endpoint
- [ ] Send pending-review email in verify-submission endpoint
- [ ] Create admin action to approve/reject with email trigger
- [ ] Test all email flows

---

### Step 9: Slack Integration (Manual Review Queue)

**Files to modify:**
- `lib/slack.ts` (add verification channel posting)
- `app/api/provider/verify-submission/route.ts` (post to Slack when manual review needed)

**Slack message format:**
```
🔍 Verification Request

Provider: [Business Name]
Claimer: [Name] ([Role])
Email: [email]
Trust Level: [medium/low]

LinkedIn: [URL]
Website: [URL]

[Approve] [Reject] [View in Admin]
```

**Checklist:**
- [ ] Identify or create Slack channel for verification queue
- [ ] Add Slack posting function for verification requests
- [ ] Include action buttons (Slack interactive messages) or link to admin
- [ ] Test posting to Slack

---

### Step 10: Reminder Emails (Cron Jobs)

**Files to create:**
- `app/api/cron/verification-reminders/route.ts`

**Logic:**

```typescript
// Run daily
// 1. Find providers where:
//    - verification_state_v2 = 'required'
//    - claimed_at is 7 days ago (first reminder)
//    - OR claimed_at is 21 days ago (final reminder)
//    - AND no reminder sent yet at this interval

// 2. Send appropriate email:
//    - 7 days: "Complete verification to unlock family inquiries..."
//    - 21 days: "Final reminder — your claim will be revoked in 9 days..."

// 3. Track reminder_sent_at in metadata
```

**Checklist:**
- [ ] Create cron endpoint
- [ ] Add to vercel.json cron config
- [ ] Create 7-day reminder email template
- [ ] Create 21-day reminder email template
- [ ] Add reminder tracking to prevent duplicates
- [ ] Test with backdated test accounts

---

## Implementation Order

**Recommended sequence (with dependencies):**

```
Week 1: Foundation
├─ Step 1: Data model migration
├─ Step 2: Trust scoring integration
└─ Step 3: Update VerificationFormModal (UI only, no auto-verify yet)

Week 2: Core Flow
├─ Step 4: Dashboard badge update
├─ Step 6: Verification prompt modal
└─ Step 7: ActionCard post-answer state

Week 3: Automation
├─ Step 5: LLM auto-verification
├─ Step 8: Email notifications (auto-approval + pending)
└─ Step 9: Slack integration

Week 4: Polish & Reminders
├─ Step 8: Email notifications (rejection + approval)
├─ Step 10: Reminder cron jobs
└─ Testing & QA
```

---

## Testing Checklist

### Happy Path (High Trust)
- [ ] Provider with business domain email claims via magic link
- [ ] Trust scored as "high"
- [ ] verification_state_v2 = 'not_required'
- [ ] Badge shows "Claimed"
- [ ] No verification prompt after answering
- [ ] Full access to dashboard

### Verification Path (Low/Medium Trust)
- [ ] Provider with generic email claims via magic link
- [ ] Trust scored as "medium" or "low"
- [ ] verification_state_v2 = 'required'
- [ ] Badge shows "Pending verification"
- [ ] Can answer first question
- [ ] Sees verification prompt modal after answer
- [ ] Can dismiss and continue to dashboard
- [ ] Sees verification CTA in ActionCard

### Auto-Verification (LinkedIn Match)
- [ ] Provider submits form with LinkedIn URL
- [ ] LLM verifies LinkedIn shows them at the business
- [ ] verification_state_v2 = 'verified' within 10 seconds
- [ ] Badge updates to "Claimed" (or "Verified ✓")
- [ ] Approval email sent

### Manual Review Path
- [ ] Provider submits form, LLM confidence is low
- [ ] verification_state_v2 = 'pending'
- [ ] "We're taking a closer look" email sent
- [ ] Slack notification posted
- [ ] Admin approves → verification_state_v2 = 'verified', email sent
- [ ] Admin rejects → verification_state_v2 = 'rejected', email with reason sent

### Reminder Flow
- [ ] Provider doesn't verify for 7 days → reminder email
- [ ] Provider doesn't verify for 21 days → final reminder email
- [ ] Provider doesn't verify for 30 days → claim revoked (Phase 4, not MVP)

---

## Decisions (Finalized)

### 1. LinkedIn Verification Approach
- Fetch the LinkedIn URL directly using standard fetch
- Send page content to Claude for analysis
- If fetch fails (LinkedIn blocks), automatically route to Slack manual review
- Simple approach with graceful degradation

### 2. Badge States

**Provider Dashboard (provider-facing):**
| State | Badge | Color |
|-------|-------|-------|
| High trust (not_required) | "Claimed" | Default |
| Low/medium trust (required) | "Pending verification" | Amber |
| Submitted, reviewing (pending) | "Pending verification" | Amber |
| Approved (verified) | "Verified" ✓ | Green |
| Rejected | "Pending verification" | Amber (with resubmit prompt) |

**Public Provider Page (family-facing):**
- All claimed providers show "Claimed" ✓ (no change)
- Verification status is NOT exposed publicly

### 3. Rejection Resubmit
- Start fresh (empty form)
- Previous submission was rejected for a reason
- Fresh form signals "try again with correct info"

### 4. Activity Tracking
- Log all verification state changes to activity feed
- Useful for debugging and audit trail

---

## Existing Infrastructure

**Already exists (will modify):**
- `components/provider-dashboard/VerificationStatusBadge.tsx` - Shows "Verified" badge (green)
- `components/provider-dashboard/ProfileOverviewCard.tsx` - Shows "Claimed" or "Verified" badge
- `components/providers/ClaimBadge.tsx` - Public-facing "Claimed"/"Unclaimed" badge
- `components/provider/VerificationFormModal.tsx` - Existing verification form
- `lib/claim-trust.ts` - Trust scoring logic (high/medium/low)

---

## Files Summary

**New files:**
- `supabase/migrations/XXX_verification_gating.sql`
- `lib/verification-auto.ts`
- `app/api/provider/verify-submission/route.ts`
- `components/provider/VerificationPromptModal.tsx`
- `lib/email-templates/verification-approved.tsx`
- `lib/email-templates/verification-pending-review.tsx`
- `lib/email-templates/verification-rejected.tsx`
- `app/api/cron/verification-reminders/route.ts`

**Modified files:**
- `app/api/auth/auto-sign-in/route.ts` - Set verification_state based on trust level
- `app/api/claim/finalize/route.ts` - Set verification_state based on trust level
- `components/provider/VerificationFormModal.tsx` - Add LinkedIn/website fields
- `app/api/provider/verification/route.ts` - Trigger auto-verification
- `components/provider-dashboard/VerificationStatusBadge.tsx` - Add "Pending verification" state
- `components/provider-dashboard/ProfileOverviewCard.tsx` - Update badge logic
- `components/provider-onboarding/ActionCard.tsx` - Add verification CTA + trigger prompt
- `lib/slack.ts` - Add verification queue posting
- `vercel.json` (cron config)
