# Provider Call Prep

Input: `$ARGUMENTS`: the provider's name (any unambiguous fragment), and optionally the call time. With nothing, ask which provider.

## What this is

A one-page sheet TJ reads on his phone during a call with a home care provider: who they are, where their families stand, how to open, what to ask, how Olera differs from A Place for Mom, and what to close with. The output is a published artifact, not chat text.

The shape comes from two calls that worked: Robbie McCullough at Assisting Hands (30 Sep 2026, Notion meeting note "Olera × Assisting Hands: North Texas partnership") and Jacob McKay at Colorado CareAssist (5 Oct 2026). Earlier sheets that follow it: Liz at Hoop Cares (https://claude.ai/artifact/Ke3McBDJLV2RnnnWhmU2iN) and Jacob (https://claude.ai/artifact/6p7y3wRLkUXM4yoEc53W33). Reuse their layout so every sheet reads the same way.

## 1. Gather before writing anything

A provider's history is spread across several places, and each one shows only part of it. The app tables record what the system sent. People's work lives elsewhere. On 2 Oct and 5 Oct 2026 a status built from app tables alone told TJ nobody had called a family that Ces had already called. Read every source below before you state anything.

- **The provider.** `business_profiles` by `display_name`: founded, services, `care_types`, `metadata.price_range`, `metadata.accepted_payments`, Medicaid/Medicare flags, staff bio, `metadata.alert_emails`, `metadata.images` (flag AI-generated or watermarked photos).
- **Their campaign.** `ad_campaign_requests` by `provider_id`: status, `flight_start_date` / `flight_end_date`, and the full `admin_note` (the dated audit lines are the campaign's history). Renewal date if they pay (see the provider's memory file).
- **Their families.** `city_leads` where `handed_request_id` = the campaign id, archived and not. For each one, read `family_touches` by `care_seeker_id` (Ces's calls: wrong numbers, disconnected, voicemail, reached), `city_lead_thread` (the provider's own messages), `city_lead_messages` (our texts and emails), and `sms_inbound` by phone for replies.
- **Every touch with the provider.** `provider_touches` by `provider_id` (calls, emails, booked meetings, next actions).
- **Email.** `support_email_messages` where `from_email` or `body_text` matches their domain. The thread with the owner often names who owns intake.
- **Slack.** Search the provider's name across `#careseeker-support` (C05TN1C48BE), `#provider-support` and `#notifications`, newest first.
- **Past calls.** `notion-query-meeting-notes` for the provider's or contact's name; fetch with the transcript.
- **Memory.** The provider's memory file, if one exists.
- **The call.** Time and attendees from `provider_touches.next_action`, the email thread, or the calendar. Always give it in the provider's local time and in TJ's (he's in Thailand, UTC+7).

## 2. The sheet, section by section

Keep this order. Every section is short. Leave a section out rather than pad it.

1. **Header.** Call time in both time zones and the medium (Zoom, phone). Contact's number as selectable text (not just a `tel:` link). Who is on the call and who owns it. One line about the agency: founded, offices, services, rate, how clients pay. The date that matters (flight end, renewal).
2. **Goal.** One sentence: what TJ should know and what the provider should feel when the call ends.
3. **Open the call.** Always in this order, before any question about clients:
   1. Small talk and a thank-you. Where they're based; TJ is calling from Thailand. Confirm how long they have and say what the call is for.
   2. **Who we are.** Logan and TJ met at Texas A&M. TJ did his PhD in biomedical engineering and worked at Pfizer; Logan is an MD/MBA who practices primary care with seniors. Olera exists because finding care, and paying for it, overwhelms families in a crisis. The NIH funds Olera through an SBIR Fast Track grant from the National Institute on Aging; a second grant followed, and the final one in January asks Olera to show real provider partners. If Logan is on the call, he introduces himself.
   3. **Ask them to do the same.** Their background, and how a new family moves through their intake, from first call to first shift.
   4. **Agree the agenda** and ask what they want to add.
4. **Where they stand.** Three facts at most: families delivered, job seekers screened out, families reached. Counts only.
5. **The families.** One row each with a status chip, using `family_touches` for what really happened.
6. **What we did for them.** Concrete actions, named specifically. No self-blame ("that's on us") and no apology.
7. **Questions, in order.** How did the families go on your side. What a great client looks like (minimum hours, how they pay, which towns or offices). Where they want families from. How fast they reach a new family, and by call or text. **What rules a family out** (payer, service area, minimum hours). This was the most useful question on the Jacob call: Medicaid and the service-area edges became screener rules. **Volume or strict quality?** Most want volume with each family flagged as a strong fit or uncertain. **Who should have the login and get alerts.** Olera has one login per agency; extra people get alert emails via `metadata.alert_emails`. What would make the next month worth it (write the answer down; it's the bar for renewal). Add one line under each saying why it matters for this provider.
8. **How we're different from A Place for Mom.** Most providers ask; let them raise it if they will. Always include:
   - **One family, one agency.** Olera never sends the same family to several agencies at once.
   - **We pre-qualify.** Screener questions filter out job seekers and people not looking for care before the provider sees them.
   - **We help families who can't pay.** The benefits finder walks families through programs like Medicaid waivers and VA benefits. Connect it to the payments this provider accepts.
   - **We stay on the family.** Ces follows up by phone, text and email until the family answers, and keeps the provider posted.
   - **A tech company, not a placement agency.** Olera tests ads across channels (Google, Meta instant forms, others) and uses the data to find what works best for each provider. Point to this provider's own result where there is one (which channel brought their families).
   - **No per-lead fees.** Families from their own ads are theirs; no per-lead charge, no resale.
   - Robbie's framing, if useful: Olera sits between a registry like A Place for Mom and a full care manager, a credentialed network with a human touch.
9. **Things to close out.** Open loops specific to them (a language need, missing real photos, a gallery item that isn't theirs).
10. **Hold back on.** Always: spend, clicks and cost per family (TJ keeps dollar figures off provider surfaces), and promising a number of families. Add anything specific to this provider.
11. **Close with.** Two or three concrete next steps, each with an owner. A follow-up check-in about two weeks out is the default (it worked with Robbie).

## 3. Rules

- **No dollar amounts from the benefits finder.** Say "programs like Medicaid waivers and VA benefits", never what a family could receive. The eligibility data isn't versioned or verified.
- **Don't offer staffing** outside MedJobs markets (check `docs/medjobs/` for the current list). If the provider raises hiring, note it as interest.
- **Don't raise Nextdoor.** TJ dropped it (5 Oct 2026); Meta forms convert better.
- **Copy:** plain and direct, no em dashes, no hedging, no apology openers.
- **Price.** Don't name plan prices on the sheet. If the provider wants to continue, TJ follows up by email with what the next month looks like.

## 4. Publish

Load the `artifact-design` skill, copy the layout of the most recent sheet (one narrow column, fact tiles, family rows with chips, a red "Hold back on" box), and publish. Title: `<Contact first name> Call Prep`. Then give TJ the link and a few lines on what matters most for this call. After the call, read the Notion meeting note (transcript included), log it as a `provider_touches` meeting row, turn disqualifiers into screener or targeting changes, and draft the recap email for TJ's approval.
