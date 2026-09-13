# City lead messages and archiving

Migration `228_city_lead_archive_messages.sql` must precede this code. TJ confirmed it applied on September 13, 2026; this session did not independently verify the live schema.
It adds the message queue and archival fields, closes existing city leads whose
phone/email is already on Do Not Contact, and cancels their pending messages and
open offers. Acquisition counts and communication history remain intact.

On `/admin/city-ads`, expand a lead, select Text or Email, and compose a message.
Send now is available from 8 AM until 8 PM in the campaign city's timezone.
Schedule targets the next 8 AM opening; the five-minute city lead clock delivers
it on its next run. The card shows the queued message, recipient-local time,
delivery state, and a cancellation button. Email needs a subject and an address.

Archive lead records a reason and moves the record into the Archived tab.
“Asked us to stop” also adds the phone to Do Not Contact. Other archive reasons
close this city lead without changing global consent. Existing opted-out contacts
are archived by migration; later blocklist additions archive matching leads.
Archived leads cannot be reactivated by old provider links or outcome replies.
There is deliberately no automatic restore when someone opts back in: a fresh
request needs its own review.

Messages already accepted by a delivery provider cannot be recalled. Pending
messages are canceled atomically with archival. Workers claim a message once and
recheck lead status and suppression before delivery. A crash or ambiguous delivery
stays “Delivery being checked”; no automatic retry can duplicate the message.
Check the communication log before reconciling such a record. Queue failures are
visible on the lead card. This does not add a new recurring cron.

Validation:

- `npx --no-install tsc --noEmit`
- `npm run check:crons`
- `node --import tsx scripts/check-city-send-window.ts`
- `node scripts/check-city-archive.cjs /path/to/@electric-sql/pglite`

The database test creates an isolated in-memory PostgreSQL schema. It checks
migration backfill, pending message/offer cancellation, future opt-outs, guarded
reactivation, duplicate queue rejection, and a single worker claim. It never
loads production credentials or sends a message.

Preview QA: use a test lead. Verify both channels at morning/night boundaries;
queue then cancel; queue then archive; confirm the archived lead no longer appears
in Needs you, queued messages show canceled, old offer actions cannot reopen it,
and historical texts remain visible. Confirm a real delivery only with an explicitly
authorized test recipient. Production delivery and authenticated preview UI have
not been exercised by the isolated tests.
