# Source — MedJobs Provider Outreach Workflow (draft)

> **Author:** Grazy — the source PDF is signed "Graize" · **Received:** 2026-09-04 · **Status:** verbatim source, superseded in practice by `../protocols/`
> **Original:** `MEDJOBS_Process_Workflow.pdf` (uploaded to the 2026-09-04 session; not committed — binary)
>
> This is the admin-authored protocol from the person operating the MVP daily. It is the
> **best existing description of how MedJobs is actually run today.** It is transcribed here
> verbatim (formatting normalized) so the pod can diff it against the shipped system and
> against the founder discussion. Where it conflicts with either, see
> `../07-OPEN-DECISIONS-AND-CONFLICTS.md` — **do not silently reconcile.**

---

## Step 1 — PROSPECT

**Goal:** Build the prospect list.

1. Load providers in the target city into MedJobs.
2. Confirm the provider is a valid prospect.
3. Move the prospect to Pre-Flight.

## Step 2 — PRE-FLIGHT

**Goal:** Find and confirm the best way to contact the provider.

1. Research the provider and add available: phone number, email address, other relevant contact information.
2. Make a pre-flight call to confirm the best contact person/method. Use the MedJobs Call Script.
3. If the provider answers: confirm the best contact information; proceed to the D0–30 Outreach Campaign; add decision makers as necessary.
4. If there is no answer: keep the prospect in the Pre-Flight Queue; make up to 3 pre-flight call attempts.
5. After 3 unsuccessful attempts, Archive the prospect.

**Rule:** Do not launch the D0–30 campaign until the pre-flight process is completed.

## Step 3 — LAUNCH D0–30 OUTREACH

**Goal:** Start the initial outreach campaign. Once the best contact has been confirmed:

1. Launch the D0–30 Call + Email Campaign.
2. Allow the campaign to run according to the scheduled sequence.
3. Monitor the Call Queue for scheduled calls.
4. Complete all calls using the MedJobs Call Script.
5. Check Smartlead regularly for email replies.

## Step 4 — RESPOND & ENGAGE

**Goal:** Respond to providers and identify opportunities. When a provider responds:

- **Interested:** respond promptly and continue the conversation.
- **Needs more information:** provide the requested information and schedule the appropriate follow-up.
- **Not interested:** follow the appropriate disposition and archive if no further action is needed.
- **No response:** allow the campaign to continue until completed.

**Important:** Always respond to genuine replies rather than allowing automated outreach to continue without review.

## Step 5 — CAMPAIGN COMPLETED → FOLLOW-UP

**Goal:** Decide what happens after a campaign ends. When any campaign is completed, the prospect
should automatically move to the Follow-Up Tab.

> **Important:** Prospects in the Follow-Up Tab should have no active campaign running.

For each prospect in Follow-Up:

- **A. No activity** (no opens, clicks, replies, or other engagement signals) → **Archive** the prospect.
- **B. Activity detected** (email opens, link clicks, other engagement signals) → **Launch a Custom/Re-Engagement Sequence.** Use the Re-Engage Template as a starting point and customize the message when appropriate. The prospect will automatically return to the Call/Email Queue once the new campaign begins.

## Step 6 — RE-ENGAGE & REPEAT

**Goal:** Continue outreach when there is meaningful engagement. After the custom sequence finishes:

`Campaign Complete → Follow-Up Tab → Review Activity`

- No activity → Archive
- Activity → Launch another custom sequence
- Continue only when there are meaningful activity signals

Additional sequences may be launched at the Admin's discretion when the prospect continues to show engagement.

---

## Simple decision flow

```
PROSPECT
 ↓
PRE-FLIGHT
 ↓
Research Contact Information
 ↓
Pre-Flight Call
 ↓
Did they answer?
 ├── YES → Confirm Best Contact
 │         ↓
 │      Launch D0–30 Campaign
 │         ↓
 │      Calls + Emails
 │         ↓
 │      Campaign Complete
 │         ↓
 └──────── FOLLOW-UP TAB
           ↓
      Is there activity?
       ├── NO → ARCHIVE
       └── YES
           ↓
     Custom/Re-Engage Campaign
           ↓
      Campaign Complete
           ↓
      FOLLOW-UP TAB
           ↓
      Is there activity?
       ├── NO → ARCHIVE
       └── YES → CUSTOM SEQUENCE
           ↓
      Repeat as needed
```

## The Golden Rule

Every prospect should always have one clear next action:

`Outreach → Campaign Complete → Follow-Up → Archive OR Re-Engage`

And the most important system rule:

> If a prospect is in the Follow-Up Tab, there should be NO active campaign running.

## New-hire "IF / THEN" cheat sheet

| IF… | THEN… |
|---|---|
| Provider is newly loaded | Research + verify contact information |
| Contact info is missing | Research and update record |
| Pre-flight call is answered | Confirm best contact → Launch D0–30 |
| Pre-flight call is unanswered | Keep in Pre-Flight Queue |
| 3 pre-flight calls fail | Archive |
| D0–30 campaign is running | Work Call Queue + monitor Smartlead |
| Provider replies | Respond + document next step |
| Provider is interested | Continue engagement |
| Provider is not interested | Disposition → Archive if appropriate |
| Campaign finishes | Provider goes to Follow-Up |
| Follow-Up has no activity | Archive |
| Follow-Up has activity | Launch Custom/Re-Engagement Sequence |
| Custom campaign finishes | Return to Follow-Up |
| Activity continues | Admin may launch another custom sequence |
| No further activity | Archive |

---

## What this protocol gets right (keep)

1. **One clear next action per prospect, always.** This is the correct operating invariant and it is
   now protocol rule R1 in `../protocols/README.md`.
2. **No active campaign while in Follow-up.** Matches the system's cadence-supersession design
   (`supersedePendingOutreachEmails` / `supersedePendingFollowupCalls`).
3. **Activity-gated re-engagement.** Opens/clicks land on the latest `email_sent` touchpoint and are
   derived into `EngagementSubState` (`lib/student-outreach/engagement-state.ts`), so the
   "activity detected → re-engage" branch is genuinely supported — *provided the Smartlead webhook
   secret is set.* See O-3 in `../07-OPEN-DECISIONS-AND-CONFLICTS.md`.
4. **Human review before automation continues.** "Always respond to genuine replies" is the right
   default and survives into P3.

## What this protocol does not cover (and P1–P7 add)

- The **partner/student supply side** entirely — the protocol stops at provider outreach.
- **What happens after "Interested"** — the meeting, the conversion, the agreement, the billing.
- **Ownership** — who does which step when four people share the queue.
- **Volume, SLA, and stop conditions** — how many prospects per day, how fast a reply gets answered.
