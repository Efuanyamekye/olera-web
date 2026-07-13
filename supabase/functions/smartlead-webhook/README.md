# smartlead-webhook (D2)

Supabase Edge Function that ingests Smartlead lifecycle events (sent / open /
click / reply / bounce / unsubscribe) into the MedJobs CRM as touchpoints and
row metadata. Counterpart to the outbound Smartlead bridge
(`lib/medjobs/smartlead-bridge.ts`). See `docs/medjobs/SMARTLEAD_BRIDGE_SPEC.md`.

## Event mapping

| Smartlead event | CRM effect |
|---|---|
| `EMAIL_SENT` | `email_sent` touchpoint (with `contact_id` for Named Contact recipients) — provides timeline narration parity with the Resend executor's per-recipient send touchpoints. |
| `EMAIL_OPEN` | `research_data.smartlead.engagement.opens` counter + `last_opened_at`. **No touchpoint** — Apple Mail Privacy Protection inflates opens; per-event timeline entries would be noise. |
| `EMAIL_CLICK` | `research_data.smartlead.engagement.clicks` counter + `last_clicked_at`. No touchpoint. |
| `EMAIL_REPLY` | `email_replied` touchpoint + `status=engaged` transition (if pre-engagement) + `reopen_at=null` (if reviving from `no_response_closed`). Resets `viewed_at` so the row surfaces in the In-Basket Replies tab — same operational state as a manually-logged reply. |
| `EMAIL_BOUNCE` | `email_bounced` touchpoint. The `bounce_fix` stage derives from it. No pending-task cancellation (Smartlead owns the email cadence; the CRM has no email tasks to cancel for Smartlead rows). |
| `EMAIL_UNSUBSCRIBE` / `COMPLAINT` | `email_complained` touchpoint + `status=do_not_contact` transition (compliance — cannot continue cadence; mirrors the Resend complained path). |

It maps each event to a CRM row via `custom_fields.outreach_id` (baked onto
every Smartlead lead by `rowToLeads`), with the per-recipient `contact_id`
custom field carrying through to the touchpoint so Named Contact events
attribute to the right CRM contact. Fallback: lead email matched against
`research_data.smartlead.lead_email`.

## Idempotency

Smartlead may retry on transient failures. Touchpoint events (sent / reply /
bounce / complained) are dedup'd by `payload->>smartlead_event_id` — if a
touchpoint of the same type already exists for the row with the same event id,
this is a no-op (no double touchpoint, no double status transition).

Open and click events store the event id in
`research_data.smartlead.engagement.seen_event_ids` (ring-buffered to 200) so
retried opens don't double-count.

## Why an Edge Function + the G4 note

Vercel Bot Protection 403s provider-origin webhook POSTs, so this can't be a
Vercel route. That same wall blocks an Edge→Vercel callback, so this writes via
the service role directly — a narrow, deliberate exception to G4 (single-writer
through `route.ts`), kept faithful by replicating exactly what `insertTouchpoint`
+ `handleLogReply` / `handleLogTouch` do. The one divergence: it skips
`transitionStage`'s `manual_followup` task queue (the row still surfaces via
derived state). Full rationale in the function header.

## Inert until activated (gated on Logan sign-off)

With no `SMARTLEAD_WEBHOOK_SECRET` set, every request is a logged no-op (200).
Nothing happens until BOTH the secret is set and Smartlead is pointed here.

⚠️ Before activating, **verify the Smartlead webhook payload shape** (event_type
names, lead/custom-field nesting) against current Smartlead docs — the parser is
defensive but written against the documented shape, not a live payload.

## Activate

1. `supabase secrets set SMARTLEAD_WEBHOOK_SECRET=<random-string>`
2. `supabase functions deploy smartlead-webhook --no-verify-jwt`

   `--no-verify-jwt` is REQUIRED — Smartlead sends webhook POSTs without a
   Supabase JWT (same as Stripe/Resend). Without it, the platform gateway
   rejects every Smartlead call before this function runs, and nothing lands.
   (Auth is still enforced: this function checks the `?secret=` / `x-smartlead-secret`
   shared secret in its own code.)
3. Set the **same** `SMARTLEAD_WEBHOOK_SECRET` value as an env var on the Vercel
   app (prod + preview). The app uses it to auto-register this webhook on every
   campaign it provisions, and the Integrations "Connect Smartlead replies"
   reconcile uses it to wire existing campaigns.
4. Registration: new campaigns are wired automatically at creation. To wire
   campaigns that already exist, run the reconcile once — admin → MedJobs →
   Integrations → "Connect Smartlead replies" (idempotent; safe to re-run). It
   registers the events sent / open / click / reply / unsubscribe. (`EMAIL_BOUNCE`
   is deliberately omitted — Smartlead rejects it as an invalid event type.)
5. Send a real reply (or a Smartlead test event); confirm a touchpoint lands on
   the matching row and the engagement counter updates for an open/click test.

Verify registration any time via the Integrations page dry-run (GET
`/api/admin/medjobs/register-smartlead-webhooks`), which reports per campaign
whether our webhook is present.

Do not activate until the warmup window clears and Logan has signed off on the
launch flow (Operational Brief D2 gate).
