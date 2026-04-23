# Provider Verification (Gating Suspicious Claims)

Suspicious claims (flagged by our existing trust scoring) can claim and log in — but can't touch sensitive actions until they complete verification and get approved. Clean claims: no change. The goal is to make verification feel like momentum, not a gate.

## Philosophy

Verification shouldn't feel like a wall. It should feel like a natural part of exploring and settling into the portal. Providers arrive with intent — they came to answer a question, check a lead, or manage their page. We let them do exactly that. But as they go deeper, certain features reveal themselves as unlockable, and verification is simply the key. No warnings, no friction at the door. Just a portal that keeps rewarding them the further in they go.

### Why Gate Instead of Block

Blocking at the door kills conversion and creates support load for false positives. Letting flagged accounts fully in exposes families and caregivers to bad actors. Gating lets legitimate providers self-serve the low-risk stuff immediately, and only asks for verification when they try to do something that matters.

### Why Phase Instead of Ship All at Once

Our highest-converting funnel is questions — families ask, we email providers, they click and answer. Gating everything immediately would block providers at the exact moment they came to engage. A phased rollout lets us protect families while preserving revenue-generating flows, and each phase builds the verification habit before adding more gates.

### Entry Point: "Manage This Page" Flow

The provider proactively visits their public page, clicks to manage it, and goes through onboarding. Onboarding is intentionally simple — they enter their email, and if the domain matches the business, they get instant access. If they use a generic email, we flag it and they still get in, but verification gets layered into their portal experience once they're inside. Since their intent is already management, verification can be surfaced more directly — embedded into the natural experience of exploring the dashboard rather than blocking the door.

---

## Who Gets Gated

| Trust Level | What It Means | Treatment |
|-------------|---------------|-----------|
| High | Email matches business domain — clean claim | Full access. No change. |
| Medium | Generic email — legitimacy isn't clear (also the default when scoring times out) | Can engage, then nudged. Restricted mode in later phases. |
| Low | Highly suspicious — likely mismatch or bad actor | Can engage first action, then nudged. Restricted mode in later phases. |

**Note:** Medium and low are treated the same to keep the build simple — one code path, one user experience.

---

## The "Earn as You Go" Experience

When a flagged provider lands in the portal, everything feels open. No banners, no warnings, no friction at the door. They complete the action they came for and start exploring. As they go deeper, certain features carry a subtle lock — not a hard block, just a quiet visual cue that signals something is waiting for them. It feels like a feature to unlock, not a punishment.

The moment they try to access something locked, instead of hitting a wall they get a lightweight prompt: "You're one step away. Verify your connection to [Business] to unlock this." Framed as being close, not being blocked.

On their dashboard, a subtle progress indicator shows them how far along they are — not a red warning, just a quiet nudge that says there's more available to them. Verification feels like the natural next step toward having a complete, fully active profile.

The "Pending verification" label on their first answer auto-disappears once they verify. It's never framed as a scarlet letter — just a temporary state on the way to something better.

---

## Phased Rollout

### Phase 1: Questions as the Hook (MVP)

**Goal:** Preserve the question → claim funnel while introducing verification so gently that it rides alongside the provider's momentum rather than interrupting it.

**How it works:**

1. Provider receives question notification email (unchanged)
2. Clicks magic link → lands on special onboarding page with question (unchanged)
3. Trust scoring runs when they claim
4. **If low/medium trust:**
   - They answer the one question they came for — no friction
   - Answer publishes with a subtle "Pending verification" label
   - After submitting, a light modal appears: "Your answer is live! Verify your connection to [Business] to unlock your full dashboard and remove the pending label."
5. **If high trust:** Full access immediately (unchanged)

**What's gated:**
- Nothing blocked outright
- Low/medium trust answers show "Pending verification" label until verified
- Soft nudge after first engagement, not before

**What's allowed:**
- Answer the one question they came for
- View their public profile
- Access settings
- Submit verification form

**Why this works:**
- Provider got their value first (answered the question)
- They're invested (they wrote the answer)
- The nudge comes at peak motivation, right after they've engaged
- Families see "Pending verification" as a quiet trust signal, not an alarm

---

### Phase 2: Gate Second Engagement

**Goal:** After they've tasted value, require verification for continued engagement. The lock mechanic kicks in here — features are visible but gated, framed as unlockable rather than blocked.

**What's gated:**
- Answer additional questions — the first answer was free to build momentum; subsequent answers require verification
- View family contact info in inbox (emails, phone numbers)
- Reply to family inquiries
- View lead/connection contact details (emails, phone numbers — names still visible)
- Send messages to leads
- Initiate connection requests to families (Matches page)

**What's still allowed:**
- View inbox (can see messages exist, not full details)
- Browse leads (can see names, not contact info)
- View their public profile
- Access settings
- Submit/resubmit verification form

---

### Phase 3: Gate Content & Profile Actions

**Goal:** Prevent unverified providers from publishing content as the business.

**What's gated (in addition to Phase 2):**
- Edit public-facing profile (description, photos, services, hours)
- Send review requests
- View caregiver contact info on MedJobs
- Send interview requests to caregivers

---

### Phase 4: Full Implementation

**Goal:** Complete protection for irreversible actions.

**What's gated (in addition to Phase 3):**
- Delete account
- Change primary email
- Auto-revoke claims stuck in pending verification for 30+ days (cron job reverts listing to unclaimed)

**Note:** Applying retroactively to existing low/medium trust accounts is not recommended — it would disrupt active users mid-conversation.

---

## Verification Form

We already have `VerificationFormModal.tsx`. Today it's voluntary and cosmetic (earns a trust badge). We repurpose it — same form, now also acts as the unlock mechanism for flagged accounts. High-trust providers still see it as an optional badge request, unchanged.

**What it collects:**
- Full name (existing, required)
- Role at business — Owner / Admin / etc. (existing, required)
- Phone (existing, optional)
- LinkedIn profile URL or business website showing their name (new, one required)
- "Can't provide either? Contact support" fallback → drops into the same review queue
- Notes (existing, optional)

**Skipped for MVP:**
- Document upload (placeholder stays)
- Automated verification
- Appeals flow

**What the reviewer does:**

A 30-second sanity check — does the LinkedIn profile actually claim they work at this business? Does the website list them? Approve or reject with reason in the admin panel.

---

## Email Notifications

Emails carry the nudge so the portal UI doesn't have to.

| Trigger | Email |
|---------|-------|
| On auto-approval | "You're verified ✓ Full access is now active." |
| On submission (fallback path) | "We're taking a closer look — we'll email you within 3 hours during business hours." |
| On manual approval | "You're verified ✓ Full access is now active." |
| On rejection | "We couldn't verify your claim. Here's why: [reason]. You can resubmit with updated info." |
| Reminder at 7 days, no action | "Complete verification to unlock family inquiries and caregiver contact." |
| Reminder at 21 days | "Final reminder — your claim will be revoked in 9 days if verification isn't completed." |
| On revocation (30 days) | Claim is revoked, listing reverts to unclaimed. No email sent (we may not have reliable contact). |

---

## Build Checklist

### Phase 1 (MVP)

- [ ] Add "Pending verification" label component for Q&A answers and public profile badge
- [ ] Trigger soft verification prompt after first question answer (low/medium trust)
- [ ] Update ActionCard post-answer state with verification CTA
- [ ] Track `answered_before_verified` in provider activity
- [ ] **Auto-verification:** LLM checks submitted LinkedIn URL against our directory record of the business + role claimed, auto-approves high-confidence matches
- [ ] Fallback queue: ambiguous or low-confidence submissions route to Slack for 30-second human review (SLA: 3 hours during business hours)
- [ ] Email notifications (see above)

### Phase 2

- [ ] Gate inbox reply (already built)
- [ ] Gate view contact info (already built)
- [ ] Gate second question answer
- [ ] Gate connection requests (already built)
- [ ] Gate lead messaging (already built)

### Phase 3

- [ ] Gate profile editing
- [ ] Gate review requests (already built)
- [ ] Gate MedJobs contact/interview (already built)

### Phase 4

- [ ] Gate delete account
- [ ] Gate email change
- [ ] Decide on retroactive application

---

## Delightful Experience

We're committing to automation now, not deferring it. The goal is that most suspicious providers never experience the gate as a wall.

### The Happy Path (Target: ~70% of submissions)

1. Provider claims, lands in restricted mode, sees a clear prompt to verify
2. Submits form with LinkedIn URL (required) or business website
3. LLM verification runs automatically (cross-checks LinkedIn against our directory record of the business, validates role claimed, flags obvious red flags)
4. Within 10 seconds: "You're verified ✓ Full access unlocked"
5. Email confirmation sent. Done.

### The Fallback Path (~30%)

1. LLM can't confidently verify (no LinkedIn, ambiguous match, weak website signal)
2. Provider sees: "We're taking a closer look — we'll email you within 3 hours during business hours"
3. Submission goes to Slack queue, teammate does 30-second review, approves or rejects
4. Email sent with outcome

### The Pending-Verification Experience

No banners. No warnings inside the portal. The portal feels open and normal. The only signals are quiet and contextual.

### What Makes This Delightful

- Most providers are verified before they even notice they were flagged
- The ones who do wait get a specific SLA, not a vague "we'll get back to you"
- The portal itself stays clean — no banners, no warnings, no scarlet letters
- Signals live where they belong: a quiet badge on the public page, contextual prompts at lock points, and email for follow-up
- Rejection includes a reason and a resubmit path, not a dead end
