# Meta Instant Forms → Olera city concierge

Status: implementation prepared on `codex/meta-native-leads`; not deployed or connected to Meta. No ads launched. No real lead submitted.

## Existing Meta draft (15 September 2026)

- Account: `739297033485646`; Page Olera: `112405630552923`.
- Campaign: `120251489434010487`, Olera City - Dallas - Sep 2026 - Meta Instant Form Pilot.
- Ad set: `120251489434000487`; ad: `120251489434020487`.
- Saved form: Olera Dallas - Home Care Callback - Native Pilot - Sep 2026 v1. **Retrieve its numeric form ID before configuration.**
- Higher intent; required name, phone, ZIP; optional email. Required callback consent. No medical questions.
- Existing outdoor daughter/mother image. Geography: Frisco, Garland, Plano, Richardson.
- Proposed $100 lifetime budget in unpublished draft, **not approved spend**. Meta changed the draft schedule to 15 Sep–15 Oct; reset the proposed flight before approval. This is a separate pilot, not a randomized A/B test.

## Architecture

`Meta signed webhook → meta_lead_receipts → existing five-minute city clock → city_leads → city_lead_messages + care seeker → admin conversation → named provider introduction → existing outcomes`

- GET `/api/webhooks/meta-leads` verifies Meta's challenge.
- POST verifies the raw-body SHA-256 HMAC before accepting an allowlisted Page/form. Receipt metadata and the form configuration snapshot (test mode, consent and attribution) are stored at this stage. Retries never reinterpret a queued test receipt as live. A DB failure returns 503 so Meta can retry.
- The clock retrieves contacts from Meta's Graph API using the Page access token. Contact answers and tokens are never logged. A compare-and-swap lease prevents concurrent import; stale claims become failed after ten minutes, including the final allowed attempt. Twelve attempts maximum; failed receipts can be retried in admin.
- The import SQL function serializes a receipt and phone/city, deduplicates within 24 hours, inserts the lead and confirmation message in one transaction. Tests and real leads are separate. Existing attribution is retained when a submission matches an existing lead.
- Consent time comes from the signed Meta submission timestamp. Form ID/version and the exact configured mandatory consent text are stored. No fabricated browser IP or user agent. Only allowlist a published form after verifying that its required checkbox matches the configured text.
- Care type starts `unsure`; the ad's theme is not treated as the family's answer. Native leads require an explicit named provider introduction. Existing opt-out and send-window checks apply.
- Care seeker linking retries independently after import. Pending confirmations use the existing clock and message history. A durable Slack outbox announces each new real lead once and repeated import failures once per receipt. Alerts contain a receipt ID and admin link, not family contact details. System failures are limited to one alert per UTC hour. Failed or uncertain Slack sends remain visible for manual review rather than being resent automatically.
- Native submissions have no website landing arm and are excluded from the quiz funnel and website Meta campaign CPL. Admin displays native lead, provider-offer, provider-acceptance, reached and client counts separately, plus lead-to-client conversion. It refreshes every minute and on window focus. Delivery health includes pending/failed receipts, the oldest waiting receipt, the last clock run, Slack configuration and alert failures. These are all-time metrics, not cohort analysis. Native campaign spend, qualification, and downstream Meta conversion feedback remain follow-up work; cost per client is not displayed until spend is connected.

## Deployment and connection

1. Review PR against staging and apply `231_meta_native_leads.sql` and `232_meta_lead_alerts.sql` through the Supabase dashboard. It depends on existing migrations through 228. Deploy code after the migration. This change does not merge or promote itself.
2. In the existing Olera Meta developer app, configure the Page `leadgen` webhook and Page lead access. Verify required access in the actual app; Page lead retrieval permissions are separate from the existing pixel/CAPI token. Use an authorized Page token, not a user password. Meta may require additional app review/access depending on the app setup.
3. Set server-only Vercel variables (never paste tokens in chat):
   - Existing `SLACK_WEBHOOK_URL` for the Olera operations channel
   - `META_LEADS_APP_SECRET`
   - `META_LEADS_VERIFY_TOKEN` (random secret shared with Meta's webhook configuration)
   - `META_LEADS_PAGE_ACCESS_TOKEN`
   - `META_LEADS_GRAPH_VERSION` (supported version selected in the actual Meta app)
   - `META_LEADS_FORMS_JSON` (example below)
4. Subscribe the Olera Page to the app. Callback: `https://olera.care/api/webhooks/meta-leads`. Confirm Meta's verification succeeds and the app can retrieve leads for the configured Page.
5. Start with `testOnly: true` and ads unpublished. Use Meta's Lead Ads Testing Tool on the exact form, confirm a receipt reaches the admin panel and becomes a test city lead, and verify no message or provider offer. Preview deployments may need protection adjusted for Meta callbacks; do not weaken protection without approval.
6. Switch the allowlist to `testOnly: false` only after the test. New submissions then queue confirmations. Existing test receipts remain test records. Approve the budget and final flight separately before publishing the ad.

Example form mapping (replace the placeholder; it deliberately fails validation):

```json
[{
  "pageId": "112405630552923",
  "formId": "RETRIEVE_FROM_META",
  "slug": "dallas-tx",
  "campaignTag": "olera-dallas-native-sep26",
  "consentVersion": "meta-dallas-callback-sep26-v1",
  "consentText": "I agree that Olera may call or text me at this number about my request, including with automated technology. Consent is not a condition of service. Msg and data rates may apply. Reply STOP to opt out.",
  "testOnly": true
}]
```

The form also has the required checkbox: “I agree to calls and texts from Olera about my request as described above.” The form says provider introductions happen after an Olera conversation.

## Validation

- `npx --no-install tsc --noEmit`
- `npm run check:crons`
- `node --test scripts/tests/meta-native.test.cjs`
- `PGLITE_MODULE=/path/to/@electric-sql/pglite node scripts/tests/meta-native-sql.cjs`

SQL test executes the actual migration/function on isolated PostgreSQL, covering replay, contact deduplication, test isolation, opt-outs, attribution/consent, and service-role-only execution. It uses the actual city lead/message table definitions and relevant triggers in an isolated fixture, not production. Live Meta delivery, deployment and authenticated UI QA are still required.

References: [Meta retrieving leads](https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving/), [Meta webhook setup](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/), [Meta's reference implementation](https://github.com/fbsamples/lead-ads-webhook-sample) (archived; current access and API version must be verified in the app).

## Operations QA

- Test submissions must produce no Slack lead alert, SMS or offer; their receipts remain visible.
- For a controlled live submission, verify one Slack alert with an admin link, one lead, and one scheduled confirmation. Replaying the receipt must produce no extra alert.
- Simulate repeated retrieval failure locally: expect one failure alert after three attempts. Confirm final-attempt crashes become retryable.
- A missing/invalid Slack connection must leave its configuration or delivery failure visible; uncertain sends are not automatically retried.
- Confirm the panel refreshes after the clock and status changes. Provider offers, acceptances, reached timestamps and client outcomes supply the displayed stages.
- Confirm a stopped clock warns after 15 minutes, and Meta setup failure marks the shared clock unhealthy after existing relay work completes.
