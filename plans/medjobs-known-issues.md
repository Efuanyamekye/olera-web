# MedJobs Known Issues / Mid-Build Findings

Created: 2026-06-04
Status: Drain log — bugs and optimizations surfaced during phase builds.

## How to use

- Items found mid-build that don't block phase completion land here
- Each item has an owner + a target resolution (next phase / patch staging / explicit defer)
- Cleared between phases (either fixed before next phase starts, or rolled into next phase's first commit)
- This file is NOT a backlog — items are real bugs/optimizations with a clear owner and resolution path

## Format

```
### YYYY-MM-DD — short title
- Found in: <phase> / <file> / <component>
- Severity: blocker / major / minor / polish
- Owner: Claude / Logan / TJ
- Target resolution: next phase / patch staging / explicit defer (link)
- Notes: ...
```

---

## Open

### 2026-06-04 — Smartlead deep-link URL convention needs live verification
- Found in: Phase 1 Bullet 3 strategy depth pass
- Severity: minor (works under assumption; worst case fallback URL)
- Owner: Logan to verify via Vercel preview QA
- Target resolution: spot-check on Vercel preview before Phase 1 merges to staging
- Notes: Plan assumes `https://app.smartlead.ai/app/master-inbox?lead_id=<lead_id>&campaign_id=<campaign_id>` deep-links to the right thread. Bullet 9 ships with this URL. The link builder gracefully falls back to root master inbox when lead_id is missing. If Smartlead's UI URL convention has changed, update the URL in `smartleadInboxUrl()` in `components/admin/medjobs/cards/StakeholderCard.tsx`.

### 2026-06-04 — Phase 4+5: pilot agreement PDF needs to be uploaded
- Found in: Phase 4+5 Bullet 5 ship
- Severity: minor (modal still works without it; "Read full agreement / Download PDF" links would 404)
- Owner: TJ
- Target resolution: drop the PDF at `public/medjobs/pilot-agreement.pdf` post-staging-merge
- Notes: The PilotTermsModal references `/medjobs/pilot-agreement.pdf` for both the "Read the full pilot agreement →" link and the "Download as PDF →" link. TJ should drop a copy of the pilot agreement template (HomeSpark-style, org-agnostic) at that path. Org-personalization (replacing `{org_name}` in the PDF) is a future enhancement — for MVP the static template is sufficient since the provider's identity is in the modal context, not the PDF text.

### 2026-06-04 — Phase 2+3 Bullet 8 follow-up: explicit preview-mode card UI deferred
- Found in: Phase 2+3 Chunk D build
- Severity: deferred (existing API redaction handles preview semantics)
- Owner: revisit during Phase 4+5 detail pass
- Target resolution: re-evaluate once Phase 4+5 wires the Invite/Save/See-contact actions
- Notes: The v3 plan's Bullet 8 called for explicit "preview cards with disabled action buttons" UX for authenticated-but-not-pilot-active accounts. The existing `/api/medjobs/candidates` API already redacts contact info for non-paid viewers, which IS the preview semantic. The disabled-action-buttons UI is moot until Phase 4+5 wires the actual Invite/Save/See-contact actions — there's nothing to disable today. When Phase 4+5 builds those actions, decide whether to render them disabled-with-tooltip or to render the welcome banner's "Activate the pilot" CTA more prominently as the path forward.

### 2026-06-04 — Phase 2+3 Bullet 9 follow-up: catchment-based filter defaults deferred
- Found in: Phase 2+3 Chunk D build
- Severity: minor (cold providers see all students; can filter manually)
- Owner: Phase 2+3b cleanup
- Target resolution: Phase 2+3b — small follow-up
- Notes: The magic-link landing route writes `?campus=<slug>` into the welcome URL, but the `CandidateFilterValues` shape uses `city + state` not `campus_slug`. Setting catchment defaults from the URL requires a campus→state/city mapping (Texas A&M → {state: "TX", city: "College Station"}, etc.). Either add a `campusSlug` field to the filter values + the API, or thread a server-side mapping through. Defer until provider feedback indicates this matters.

### 2026-06-04 — Phase 2+3: MEDJOBS_MAGIC_LINK_SECRET activation needed
- Found in: Phase 2+3 Chunks A+B+C ship
- Severity: blocker for live cold-provider testing on staging
- Owner: TJ
- Target resolution: post-Phase 2+3 merge
- Notes: New env var `MEDJOBS_MAGIC_LINK_SECRET` must be set on Vercel prod + preview before any cold-provider email goes out. Suggested: `openssl rand -base64 48`. Without the secret, `buildWelcomeUrl` falls back to `PROGRAM_URL` (the email still has a working link, just not the magic-link experience). The landing route returns `/medjobs/m/expired?reason=config` when the secret is missing.

### 2026-06-04 — Phase 1 Bullet 10 follow-up: unmatched Calendly bookings tray deferred
- Found in: Phase 1 Bullet 10 build
- Severity: deferred (low-risk; admin sees the booking natively in Calendly's UI when unmatched)
- Owner: Claude (resume in Phase 1b if needed)
- Target resolution: Phase 1b after Logan QA. Decide whether the in-CRM tray is worth a migration.
- Notes: The v3 plan called for an "Unmatched Calendly bookings" tray on the Meetings tab. This would require a new `calendly_unmatched_bookings` table to persist bookings whose invitee email didn't resolve to an outreach row. That's against G3 (no new migrations during feature work). MVP behavior is "log and continue" — the calendly-webhook returns 200 with a "unmatched" log entry; admin sees the booking natively in Calendly and can manually create the CRM entry if needed.

### 2026-06-04 — Calendly webhook needs activation (deploy + admin setup)
- Found in: Phase 1 Bullet 12 ship
- Severity: blocker for Phase 2+3 Calendly integration; not blocking Phase 1 merge
- Owner: TJ (admin access to Calendly + Supabase secrets)
- Target resolution: post-Phase-1-merge, before Phase 2+3 starts
- Notes: New edge function `supabase/functions/calendly-webhook/` is INERT until `CALENDLY_WEBHOOK_SECRET` is set in Supabase + the webhook URL is registered in Dr. DuBose's Calendly admin. Steps documented at the end of the Phase 1 build log + in the calendly-webhook README. Test by self-booking a slot with a matching email and confirming the meeting appears in the CRM Meetings tab.

### 2026-06-04 — Phase 1 Bullet 8 follow-up: full event-stream UI deferred
- Found in: Phase 1 Bullet 8 build
- Severity: deferred enhancement (current state is fully functional)
- Owner: Claude (resume in Phase 1b if needed)
- Target resolution: Phase 1b after Logan QA on current Phase 1
- Notes: The v3 plan's Bullet 8 spec called for a full single-stream event API with per-event row types (sent / opened / clicked / replied / bounced), pinned Needs Reply + Bounced sections, filter chips, and a 50-per-page activity log with URL-persisted filters. The current Phase 1 ship covers: (1) tab rename to "Emails" via Bullet 4, (2) Smartlead inbox deep-link via Bullet 9, (3) engagement chips in the drawer timeline via Bullet 5, (4) existing repliesGroupedList smart-sort prioritizes high-touch states. **Deferred for now:** dedicated Bounced pinned section + activity log filter chips + per-event card component. These would require a new EmailEventCard component and a new email-event-stream lib (~3 days). Logan to evaluate whether the current Phase 1 is sufficient or whether the full event-stream UI is needed.

## Resolved

### 2026-07-13 — Smartlead replies never appeared in the UI (webhook never registered)
- Found in: MedJobs In Basket reply-visibility investigation
- Severity: blocker (admin couldn't trust the UI for whether an email came in)
- Owner: Claude
- Root cause: campaign provisioning (`smartlead-bridge.ts:provisionCampaign`) created
  campaigns but NEVER registered the reply webhook. The only registration path was
  the manual "Connect Smartlead replies" admin button, which was never run against
  the live campaigns — so every campaign was born "No Webhooks Yet", Smartlead POSTed
  nothing, the edge function saw 0 invocations, and no touchpoints were ever written.
  (Receiver was healthy the whole time: JWT off, `SMARTLEAD_WEBHOOK_SECRET` set.)
- Fix:
  - Auto-register the webhook at campaign creation inside `provisionCampaign`
    (best-effort — isolated from `errors`/`ok` so a webhook hiccup can't fail an
    enrollment). Reads `SMARTLEAD_WEBHOOK_SECRET` from the Vercel env.
  - Idempotent reconcile (`register-smartlead-webhooks`): lists existing webhooks and
    only creates/updates ours (no duplicates); now covers `smartlead_welcome` too;
    GET is a read-only status dry-run.
  - Edge function hardening: reply resolution falls back to `from_email` → enrolled
    `lead_emails` when `sl_lead_email` is absent; added the `smartlead_welcome`
    lead_email resolve path.
  - Optional backfill (`backfill-smartlead-replies`, dry-run-first) to import replies
    that predate registration — deterministic via `custom_fields.outreach_id`,
    idempotent, and intentionally NOT replaying live side effects (no viewed_at reset,
    no task supersession) so it can't cancel currently-queued calls.
  - Fixed the smartlead-webhook README (`--no-verify-jwt` was missing) + `.env.example`.
- Manual steps to activate (code alone does not fix live state):
  1. Set `SMARTLEAD_WEBHOOK_SECRET` on Vercel (prod + preview), identical to the value
     on the Supabase edge function.
  2. Redeploy the edge function: `supabase functions deploy smartlead-webhook --no-verify-jwt`
     (the resolve-path + fallback changes).
  3. Run the reconcile once (Integrations → "Connect Smartlead replies") to wire the
     existing campaigns.
  4. Verify: a campaign's Webhooks pane in Smartlead shows our URL; send a real reply
     and confirm it lands in the Emails tab.
