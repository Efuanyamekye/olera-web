# Log a touch

Input: `$ARGUMENTS` — a one-line touch, or nothing if TJ attached a screenshot of an email, iMessage thread, or call log.

## Which log

Two tables, same shape, picked by who the touch is with:

- **A provider** → `provider_touches`, read at `/admin/relationships`.
- **A care seeker / family** → `family_touches` (migration 230), read at `/admin/relationships/families`.

Resolve the name against `business_profiles` and let `type` decide: `type='family'` writes the family table, anything else writes the provider one. Say which one you wrote. If a fragment matches both a provider and a family, show both and stop — never guess across the two.

The family table has one extra column and it is the important one: **`reached`**. TRUE = you spoke to them. FALSE = you tried and did not (no answer, full mailbox, dead number). NULL = not applicable. Only TRUE clears an owed call, because trying is not reaching, and treating them the same quietly drops the families who are hardest to get hold of. Set it from the words: "spoke to", "talked", "she said" → TRUE; "no answer", "voicemail", "mailbox full", "didn't pick up", "left a message" → FALSE. If the line is ambiguous, ask.

## What this is

The five-second capture for the provider touch log (`provider_touches`, migration 205; read it at `/admin/relationships`). A touch is one human-level contact with a provider on any channel, plus the one next action it implies. Every hand-sent email, text, and call goes here or it is lost, which is how a 90-day promise to Sherry Pace went unbuilt for three weeks in August 2026.

This command writes rows. It does not draft messages (that is the comms work itself) and it does not run the audit.

## Parse

Accept either shape:

**One line.** `who channel direction "what happened" [--next "..."] [--due date] [--owner name] [--at time] [--handle address] [--reached yes|no]`

- `who`: any unambiguous fragment of the display name or contact name (`pacesetter`, `sherry`, `zardy`, `cheryal`, `jillanna`). Resolve against `business_profiles` (`display_name`, `metadata->>claimer_name`). A family often has no name — match the email stem too (`valdezlorene0`). If two match, show both and stop.
- `channel`: `email | text | call | meeting | in_app`, plus `note` on the family table for something that happened without a conversation.
- `direction`: `out` (we reached them) or `in` (they reached us). Also accept `to`/`from`.
- The quoted string is `summary`, one line, ≤240 chars. Anything longer goes in `detail`.
- `--at`: when it happened; default now. Accept "yesterday 9am", "28 aug 6:27", ISO. Store UTC. TJ is in Thailand (UTC+7); providers are US.
- `--next`, `--due`, `--owner`: the next action. `--due` accepts "mon", "12 sep", ISO date. Owner defaults to TJ.
- `--handle`: the address or number actually used, when it is not the profile's.
- `--reached`: family only. Overrides what the words imply.

**A screenshot.** Read every message in the thread. Emit one touch per message that carries information (skip "Ok" unless it closes a promise). Set `occurred_at` from the timestamps in the image; when a bubble has no timestamp, use the nearest one above it. `direction` from which side of the thread it sits on. `contact_handle` from the header (a phone number or address). Quote the message text in `detail`.

**Promise detection, both shapes.** If a message from us contains a commitment ("I'll send", "I'll give you an update", "this week", "I will set it up", "let me look into"), propose a `next_action` with a due date and ask TJ to confirm before writing it. A promise nobody wrote down is the failure mode this table exists to close.

## Write

The terminal has no admin session and the WAF blocks curl to admin routes, so write directly, the same way the audit writes the case log:

For a family, the table is `family_touches`, the key column is `seeker_id`, and `reached` comes with it:

```bash
set -a; source ~/Desktop/olera-web/.env.local; set +a
curl -s -X POST "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/family_touches" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d '{"seeker_id":"<uuid>","channel":"call","direction":"out","occurred_at":"2026-09-14T23:52:00Z",
       "reached":false,"summary":"Called, mailbox full so no voicemail. Texted instead.",
       "source":"manual","author":"claude (for TJ)"}'
```

For a provider:

```bash
set -a; source ~/Desktop/olera-web/.env.local; set +a
curl -s -X POST "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/provider_touches" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d '{"provider_id":"<uuid>","channel":"text","direction":"in","occurred_at":"2026-09-05T11:20:00Z",
       "summary":"...","detail":"...","contact_name":"...","contact_handle":"...",
       "source":"manual","next_action":"...","next_action_due":"2026-09-12","next_action_owner":"TJ",
       "author":"claude (for TJ)"}'
```

Before inserting a row with a `next_action`, close that subject's open ones, exactly as the API does — swapping `family_touches?seeker_id=eq.` for the family table. **On the family table, do the same when `reached` is true even if there is no new action:** the open action existed because we had not got hold of them, and getting hold of them is what it was for.

```bash
curl -s -X PATCH "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/provider_touches?provider_id=eq.<uuid>&next_action=not.is.null&next_action_done_at=is.null" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" -d '{"next_action_done_at":"<now ISO>"}'
```

`author` is `claude (for TJ)` when TJ dictated it, `claude (backfill from <source>, <date>)` when read from a screenshot after the fact. Python's `urllib` fails SSL on this machine; use curl.

## Echo

Print what was written, compactly, so TJ can catch a wrong provider or date:

```
Logged  Miracle-Lightstar · Zardy Dweh · text · in · 5 Sep 11:20 UTC
        "Ok"
        next: 7-day read by text · due 12 Sep · TJ
```

A family row echoes whether you got hold of them, because it is what decides the colour of the row:

```
Logged  Cheryal · family · call · out · 14 Sep 23:52 UTC · did not reach
        "Called, mailbox full so no voicemail. Texted instead."
        still owed a call
```

For a screenshot, one line per row plus any promise you proposed. Then stop. Do not summarize the relationship, do not suggest replies; the log is the deliverable.

## Rules

- Never invent a timestamp. If the image has none, say so and use `--at` from TJ.
- Never log a message that was drafted but not confirmed sent. "Good to send?" is not a send.
- Never log an email that went through support@olera.care (Bcc'd, or a reply to a system email), or a text to the Olera number. The timeline reads `support_email_messages` and `sms_inbound` directly; a touch row would duplicate it. `/touch` is for what has no paper trail we own: texts on TJ's phone, calls, meetings, email from an inbox that was not Bcc'd.
- No PHI about families in a **provider** `summary`. A family is "a family" there. On a family's own row their situation is the point, so write it plainly — that table is admin-only with RLS on and no policies.
- If there is no `business_profiles` row, stop and say so; both tables are keyed to profiles on purpose.
- Never log a family touch that the app already made. A text sent from `/admin/city-ads` is in `city_lead_messages` and a benefits SMS is in `email_log`; both are merged into the timeline. `/touch` is only for what has no trail we own: calls, meetings, a text from TJ's own phone.
