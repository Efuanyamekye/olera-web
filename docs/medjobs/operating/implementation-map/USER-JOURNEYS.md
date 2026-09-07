# MedJobs 2.0 — End-to-End User Journeys

> **Framework:** the stages in [`../00-OPERATING-SYSTEM.md`](../00-OPERATING-SYSTEM.md).
> **Companion:** [`MATRIX.md`](MATRIX.md) holds the same ground stage by stage; this file holds it
> person by person.
>
> **Status:** the *intended* journeys, written from the operating system and what the repository shows.
> Every row is a claim to verify by walking it. Validation status lives in `MATRIX.md`.

**Roles.** **Admin Team** — prospecting and outbound on both sides. **Sales Lead** (Logan) — the provider
meeting and the advisor meeting. **User Success Manager** (Chantel) — one function covering everything
after those meetings, on both the provider and student sides. **Portal** — the product acting on its own.

> **One User Success Manager, not three.** Client success, university success and student success are
> functions of a single role, not separate roles. The journeys below are written that way throughout.

Two questions to hold at every step, because they surface most real failures:

- Does this person know what to do next?
- Does the **next owner** know it is their turn?

---

## 1. Provider

From first contact to ongoing support.

| # | Step | What the provider sees / does | Surface | Comms | Event | Next owner |
|---|---|---|---|---|---|---|
| P1 | First contact | Receives a cold email naming their local university program | Email | Cold sequence | `email_sent` | Admin Team |
| P2 | Engages | Opens, clicks, or replies; or answers a call | Email · phone | Reply or call | `email_opened` · `email_clicked` · `email_replied` · call outcome | Admin Team |
| P3 | Books a meeting | Picks a time from a calendar link | Scheduling | Confirmation + reminder | `meeting_scheduled` | Sales Lead |
| P4 | Meets | 15 minutes with a physician founder; hears the program and the terms | Video call | — | `meeting_held` | Sales Lead → USM |
| P5 | Receives the follow-up | Details email, agreement, and the standard hiring questions | Email | Post-meeting email | `email_sent` | USM |
| P6 | Accepts terms | Reads and accepts; agreement on file | Portal or document | Confirmation | terms accepted | USM |
| P7 | Signs in | Authenticates and lands in the provider portal | Magic link → portal | Welcome | first authentication | Portal |
| P8 | Completes the profile | Answers what a good caregiver looks like, shifts needed, headcount | Portal form | Reminder if stalled | profile completed | USM |
| P9 | States a staffing need | Records roles, headcount, shift shape | Portal form | — | staffing need recorded | USM → Portal |
| P10 | Sees candidates | Browses qualified students who fit the need | Candidate board | Notification on new match | candidates viewed | Provider |
| P11 | Invites to interview | Picks a candidate and proposes times | Invite flow | Invitation to student | interview invited | Portal → Student |
| P12 | Interviews | Holds the interview; confirms it happened | Calendar · portal | Reminder · post-interview prompt | interview held | USM |
| P13 | Hires | Makes an offer, signs the agreement, student accepts | Offer flow | Offer + acceptance | hire confirmed | USM |
| P14 | Works the student | Student works shifts | Outside the platform | — | **shifts worked — no mechanism today** | USM |
| P15 | Confirms six shifts | Attests, or confirms when asked, that six shifts are done | **Undefined** | Confirmation request | six shifts confirmed | USM |
| P16 | Receives the bill | Sees what is owed and why | **Undefined** | Invoice | bill issued | USM |
| P17 | Pays | Settles the invoice | **Undefined** | Receipt | payment collected | USM |
| P18 | Ongoing support | Check-ins; raises the next staffing need | Portal · email · call | Scheduled check-ins | check-in logged | USM |

**What the provider must be able to see at any moment:** where they are in the process, what they are
waiting on, who to contact, and what they owe or will owe. **P14–P17 have no defined surface** — that is
the largest single hole in the provider journey.

---

## 2. Student

From first exposure to ongoing support.

| # | Step | What the student sees / does | Surface | Comms | Event | Next owner |
|---|---|---|---|---|---|---|
| S1 | First exposure | Sees the opportunity through one of the five university channels | Job board · org channel · event · listserv · class | Channel-dependent | **source not captured today** | Portal |
| S2 | Lands | Opens the MedJobs page and understands the offer | Public page | — | page view | Portal |
| S3 | Screens in | Answers the short eligibility questions | Screener | — | student eligibility completed | Portal |
| S4 | Starts the application | Begins; may leave and return | Application form | Resume prompt if stalled | application started | Portal · USM |
| S5 | Completes the application | Availability, documents, video, agreement read | Application · uploads | Confirmation | application submitted | Portal |
| S6 | Is qualified | Application assessed against defined criteria | Portal logic | Outcome message | **qualification decision — criteria undefined** | Portal |
| S7 | Goes live | Profile becomes visible to providers | Portal | You're live | went live | Portal |
| S8 | Waits | Sees status and what happens next | Student portal | Periodic update | — | USM |
| S9 | Is introduced | A provider sees and invites them | — | Invitation | interview invited | Student |
| S10 | Accepts the interview | Picks or confirms a time | Interview flow | Confirmation · reminder | interview accepted | Portal |
| S11 | Interviews | Attends | Video call | Reminder | interview held | USM |
| S12 | Receives an offer | Sees the offer and the agreement | Offer flow | Offer notification | offer made | Student |
| S13 | Accepts | Accepts and is hired | Offer flow | Confirmation both sides | hire confirmed | USM |
| S14 | Works | Works shifts at the provider | Outside the platform | — | **no mechanism today** | USM |
| S15 | Six shifts | Confirms, or is confirmed, at six shifts | **Undefined** | — | six shifts confirmed | USM |
| S16 | Ongoing support | Hours accrue toward the experience and the recommendation | **Undefined** | Check-ins | check-in logged | USM |

**The three things the student was promised** — pay, experience, and a path to a recommendation — **all
land after S13, where the journey currently has the least defined technology.** A student who is hired and
then hears nothing is the failure that costs us the referral and the recommendation story.

---

## 3. Admin Team

Target lists, outbound, communications, CRM, and the handoff to the Sales Lead. Both sides of the funnel.

| # | Step | What they see / do | Surface | Event | Handoff |
|---|---|---|---|---|---|
| A1 | Receive the site | Provider list and university stakeholder list for the site | Sites · catchment | site created | — |
| A2 | Verify targets | Confirm real, operating agencies; confirm named advisors, org leaders, department heads | Prospect lists · audit tools | prospect verified | — |
| A3 | Enrich | Add phone, email, address, decision-maker names | Prospect drawer · enrichment | contact added | — |
| A4 | Launch outbound | Start the sequence for a cleared row | Launch action | sequence launched · `email_sent` | — |
| A5 | Work the call queue | Call what is due; log every outcome | Calls queue · log modal | call outcome | — |
| A6 | Triage replies | Classify every inbound and answer it | Emails queue · reply modal | `email_replied` · classification | — |
| A7 | Book the meeting | Get a time on the Sales Lead's calendar | Scheduling link | `meeting_scheduled` | **→ Sales Lead** |
| A8 | Pass context | Leave what the prospect said and asked for | Drawer notes | note added | **→ Sales Lead** |
| A9 | Triage the unengaged | Re-engage on activity, retire on silence | Follow-up queue | re-engaged · retired | — |

**What they must be able to see:** what to work on next without being told, which rows are due, and
whether every queue is empty. **What they must never have to do:** keep a private list of who they called.

---

## 4. Sales Lead — Logan

Receiving the handoff, preparing, holding the meeting, recording it, handing on.

| # | Step | What he sees / does | Surface | Event | Handoff |
|---|---|---|---|---|---|
| L1 | Receives the handoff | Sees a booked meeting appear with the prospect attached | Meetings queue · calendar | — | Admin Team → **Logan** |
| L2 | Prepares | Reads who they are, what they said, what they asked, what was promised | Entity drawer · timeline | — | — |
| L3 | Holds the meeting | Provider: the program and terms. Advisor: the ask to reach students | Video call | `meeting_held` | — |
| L4 | Records the outcome | Converted · not a fit · needs follow-up · no-show — in under a minute | Log meeting modal | outcome recorded | — |
| L5 | Captures commitments | Anything promised in the room, in writing | Drawer notes | note added | — |
| L6 | Hands off | Relationship moves to User Success with everything attached | Status change | handoff recorded | **→ User Success Manager** |

**The failure mode to design against:** a meeting that converts, and a User Success Manager who does not
know it happened or what was promised. L4, L5 and L6 exist to prevent exactly that.

---

## 5. User Success Manager — Chantel

One role, both sides, everything after the Sales Lead's meetings.

### 5a. Provider side

| # | Step | What she sees / does | Surface | Event | Handoff |
|---|---|---|---|---|---|
| U1 | Receives the handoff | A converted provider appears in her queue with the meeting context | Clients queue | handoff received | Logan → **USM** |
| U2 | Sends the follow-up | Details email, agreement, standard hiring questions | Email · templates | `email_sent` | — |
| U3 | Chases the answers | Follows up until the questions are answered and terms accepted | Task · queue | reply · terms accepted | — |
| U4 | Drives profile completion | Gets the provider signed in and the profile finished | Task · reminder | profile completed | — |
| U5 | Captures the staffing need | Roles, headcount, shift shape recorded against the client | Client record | staffing need recorded | **→ Portal** |
| U6 | Watches the match | Confirms candidates are visible and being viewed | Client view | candidates viewed | — |
| U7 | Drives the interview | Chases invite, acceptance, and the hold on both sides | Interview view | interview invited · held | — |
| U8 | Drives the hire | Offer, agreement, acceptance | Offer view | hire confirmed | — |
| U9 | Tracks to six shifts | Knows which placements are approaching the threshold and confirms them | **Undefined** | six shifts confirmed | — |
| U10 | Bills and collects | Issues the invoice and chases payment | **Undefined** | bill issued · payment collected | — |
| U11 | Supports and re-sells | Regular check-ins; captures the next staffing need | Client view | check-in logged | → U5 |

### 5b. University and student side

| # | Step | What she sees / does | Surface | Event | Handoff |
|---|---|---|---|---|---|
| U12 | Receives the handoff | An activated university appears with what the advisor agreed to | Partners queue | handoff received | Logan → **USM** |
| U13 | Activates the channels | Job board post, org relationships, campus events, listservs, professor outreach | Partner records · portal | channel activated · distribution recorded | — |
| U14 | Keeps partners warm | Reports back what the channel produced; asks for the next share | Partner view | touchpoint logged | — |
| U15 | Shepherds applications | Nudges stalled applications to completion | Candidates queue | application completed | — |
| U16 | Confirms qualification | Reviews qualification outcomes and handles exceptions | Candidates view | qualification decision | — |
| U17 | Supports live candidates | Keeps unmatched students warm; supports them after a hire | Candidates view | check-in logged | — |

**What she must be able to see in one place:** every active client and every active university, what is
stuck and for how long, which placements are approaching six shifts, which of the five channels a student
came from, and what she owes someone today. **If any of that lives in her head or a private spreadsheet,
it does not survive a second site.**

---

## How to use these

For each row, in the real system: walk it, and record what actually happens against what is written here.
Where they differ, the difference is the finding. Put it against the stage in
[`MATRIX.md`](MATRIX.md) rather than in a separate log, so everything about a stage stays in one place.
