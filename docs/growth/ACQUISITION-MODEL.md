# Acquisition model — what the analytics can and cannot tell us

Written to answer a specific question: how do families actually enter Olera,
move through the site, and reach the surfaces that transition them into the
Care Relations workflow — and does our current CR1–CR4 model represent that
honestly.

**Status of the numbers in this document: there are none.** The analysis
below is structural, drawn from the code and the schema. Pulling the actual
GA4 figures needs credentials this environment does not have. §10 gives the
exact queries to run; everything else here is answerable without them and is
answered.

---

## 0. What we actually have

Three separate systems record traffic, and they do not agree by design:

| System | Grain | Identity | Covers |
|---|---|---|---|
| **GA4** | session | GA client id / signals | every page |
| **`growth_attribution_events`** | event | `anonymous_id` (30d) + `visit_id` (30min) | provider, benefit, editorial pages |
| **`page_events` / `provider_activity`** | page view | `olera_session` cookie (30d) | provider, benefit, editorial, plus a few others |

The operating map's CR1–CR4 currently read the **third** of these. That is
the finding this document turns on, and §9 explains why it is the wrong
choice.

`growth_attribution_events` (migration 174) already models the exact
hierarchy asked for:

```
page_landed      → landing surface + traffic_channel + page_category
cta_visible      → CTA exposure
cta_engaged      → CTA engagement
lead_started
lead_created     → conversion, joined to the real domain record
contact_intent   → phone/email click
```

keyed by `anonymous_id` + `visit_id`, with `page_category` ∈ provider /
benefit / editorial. The architecture asked for is **already built**. It is
not what the map is reading.

---

## 1. GA4 acquisition breakdown

`lib/growth/collector.server.ts` pulls `sessionDefaultChannelGroup` ×
`totalUsers` weekly and writes it to `growth_metric_snapshots.ga4`. GA's
full channel list comes back — up to 30 rows — and is then **filtered down**
to `GROWTH_CHANNELS` in `lib/growth/types.ts`:

```
Organic Search · Direct · Paid Social · Organic Social · Display ·
Referral · Paid Other
```

### Defect 1 — "Paid Search" is not in that list

GA4's default channel group for Google Ads traffic is **Paid Search**. It is
not one of the seven names we keep, so `allChannels[name] || 0` writes it as
**zero** into every stored weekly snapshot. Google Ads traffic is not
misclassified by GA — it is discarded by us, after GA correctly identified
it.

Also discarded: `Unassigned` (GA's "could not classify" bucket, and the
single best early-warning signal for broken tagging), `Cross-network`
(Performance Max / Demand Gen), `Email`, `Affiliates`, `Organic Video`,
`Paid Video`, `Organic Shopping`, `Paid Shopping`, `SMS`, `Audio`,
`Mobile Push Notifications`.

This is the literal case of "Paid disappearing from our architecture because
our tracking is incomplete." The raw GA response already has it.

**Fix:** keep every channel GA returns, rather than an allow-list. One-line
change in shape, but it changes what every historical snapshot could have
said — past weeks cannot be recovered from the snapshot, only re-pulled from
GA.

---

## 2. Paid traffic and whether attribution is configured correctly

Three independent classifiers exist, and they disagree.

### 2a. `growth_attribution_events` — correct

`trafficChannel()` in `app/api/activity/track-growth/route.ts`, in order:

1. `referrer_class = olera_internal` → `olera_internal` (our own QA traffic,
   checked **before** the paid rules so a staff click on a campaign link can
   never inflate paid)
2. `gclid` present **or** `utm_medium ∈ {cpc, ppc, paid, paid_search}` →
   `paid_search`
3. `utm_medium ∈ {paid_social, social_paid, cpm, display, paid-social}` →
   `paid_social`
4. `utm_source = olera_managed` → paid, split by whether the medium mentions
   social
5. falls through to `organic_search` / `social` / `ai_chat` / `direct` /
   `referral`

Rule 2 is what makes **Google Ads auto-tagging work**: auto-tagging appends
`gclid` and no UTMs at all, and `gclid` alone is enough here. Rule 4 is a
deliberate backstop — the code comment records two live flights that shipped
with no `utm_medium` and would otherwise have classified off their referrer.

Migration 194's comment records the same failure happening for real: the
`traffic_channel` CHECK from migration 174 never included `paid_social`, so
every Nextdoor arrival's insert violated the constraint and was **silently
swallowed** by the route's error handler. Five campaigns, Sep 1–7. That
migration fixes it — worth confirming it is actually applied in production
before trusting any paid-social figure.

### 2b. `page_events` / `provider_activity` — cannot see paid at all

`ViewTracker` and `ContentViewTracker` write only:

```
referrer, referrer_class, utm_source, utm_campaign
```

No `utm_medium`. No `gclid`. And `classifyReferrer()` has no paid class —
its output is only `ai_chat | search | social | olera_internal | direct |
other`.

### Defect 2 — the operating map's CR3 misses most paid traffic

CR3 matches `utm_source = olera_managed`. Therefore:

- **Google Ads with auto-tagging** (gclid, no UTMs) → not counted. Its
  referrer is a Google domain, so `classifyReferrer` files it as `search`
  and it lands in **CR2 Organic** instead.
- **Meta / Instagram ads** tagged `utm_source=facebook&utm_medium=paid_social`
  → not counted. Referrer is a Meta domain → `social` → in no chip at all.
- Only Ad Boost links carrying `utm_source=olera_managed` are counted.

So today CR3 undercounts paid, and CR2 **over**counts organic by absorbing
auto-tagged Google Ads. Both errors point the same way and the second is the
more damaging: it makes paid look ineffective and organic look better than
it is.

### Answer to "does GA reliably identify paid traffic?"

GA almost certainly does — auto-tagging plus `sessionDefaultChannelGroup`
handles Google Ads without any UTM work, and Meta ads land in Paid Social if
`utm_medium` is set. **We** are the unreliable layer, in two places: the
channel allow-list (§1) and the operating map's source (§2b).

---

## 3. Direct, decomposed

GA's Direct means: no referrer and no campaign parameters. It is a residual,
not a channel — everything unattributable lands there.

Our own `classifyReferrer` is blunter still: `if (!rawReferrer) return
"direct"`, and a **malformed** referrer URL also returns `"direct"` via the
catch. So our Direct is GA's Direct plus a parse-failure bucket.

What is genuinely in it, and whether we can separate it:

| Real source | Recoverable? | How |
|---|---|---|
| Typed URL / bookmark | No | Indistinguishable by construction |
| Our own email | **Yes, and this is the big one — see below** | Every tracked link carries `?ref=email&eid=<email_log_id>` |
| Third-party untagged email | No | Unless the sender tags it |
| Untagged SMS | No | Unless we tag |
| Links from apps (iOS Mail, Slack, native webviews) | No | The app strips the referrer |
| PDFs / documents | No | Same |
| QR codes | **Yes** | `/api/admin/provider-outreach/qr-scans` already exists |
| Untagged SMS from us | No | Our SMS links are not tagged |
| HTTPS → HTTP downgrade | No | Referrer suppressed by policy |
| Our own malformed referrers | **Yes, and should be** | Currently silently counted as direct |

### Defect 3a — our own email traffic is sitting in Direct, fully identified

`appendTrackingParams()` in `lib/email.ts` tags **every** link we send with
`?ref=email&eid=<email_log_id>`. That is not a UTM, so:

- GA sees no referrer and no campaign parameters, and files it as **Direct**;
- our own trackers record `utm_source` and `utm_campaign` and **not** `ref`
  or `eid`, so the parameter arrives on the page and is then discarded.

The information needed to pull email out of Direct — down to the individual
send, since `eid` is an `email_log` id — is already in the URL of every link
we mail. Nothing is missing but two fields in the tracker payload and, for
GA, a `utm_source=olera&utm_medium=email` alongside the existing params.

Given how much of Olera's outbound is email (provider notifications, question
notifications, connection requests, benefits check-ins), this is plausibly
the largest single identifiable slice of Direct, and the cheapest to recover.

**Be explicit about the rest: most Direct is not recoverable.** The honest
split is "attributed direct" (things we tagged and can name — email, QR) and
"unattributable" (typed, bookmarked, app-stripped, policy-suppressed), and we
should stop implying the whole bucket means "typed the URL".

### Defect 3 — a parse failure is indistinguishable from a real direct hit

`classifyReferrer`'s `catch { return "direct" }` merges "no referrer" with
"referrer we could not parse". Those are different facts. A separate
`unparseable` class would cost one line and make the residual measurable.

---

## 4. Social

`SOCIAL_HOSTS` in `lib/analytics/referrer.ts` covers Facebook, Instagram,
LinkedIn, Reddit, TikTok, Pinterest and others. `AI_HOSTS` is a **separate**
class — ChatGPT, Claude, Perplexity and similar — which GA has no equivalent
for and lumps into Referral. That distinction is ours and is worth keeping;
it is a real and growing acquisition path that GA cannot show us.

Organic vs paid social is separable **only** in
`growth_attribution_events`, via `utm_medium`. In `page_events` all social is
one undifferentiated `social` class, and — as noted in §2b — appears in no
CR chip at all.

Whether social deserves architectural prominence is a volume question I
cannot answer without the data. §10 has the query.

---

## 5. Referral

`sanitizeReferrer()` stores the external **domain** (never the query string —
a deliberate PII decision, since search referrers can carry the query). So
referral domains are recoverable from our own data without GA, for provider,
benefit and editorial pages.

But `classifyReferrer` collapses every non-search, non-social, non-AI,
non-internal referrer into `"other"`. The domain is retained in
`metadata.referrer`; the class does not distinguish a partner from a random
blog.

Operationally these are not the same thing and should not share a node:

- **Partner referral** — a directory or organisation we have a relationship
  with, sending traffic on purpose. This is an acquisition channel we can
  work.
- **Editorial citation** — an article that linked us. Earned, not managed.
- **Generic web referral** — everything else.

That split is a judgement over a ranked domain list, not something the code
can decide. Rank the domains first (§10), then classify the top ones by
hand; the tail will not matter.

---

## 6. Acquisition → landing → CTA → engagement

This is fully modelled in `growth_attribution_events` and is the reason the
table exists. The join is `(anonymous_id, visit_id)`, with `traffic_channel`
carried on the `page_landed` row only.

Coverage is uneven, and here is exactly where:

| Layer | Provider pages | Benefits pages | Editorial pages |
|---|---|---|---|
| `page_landed` + channel | ✅ `ViewTracker` | ✅ `ContentViewTracker` | ✅ `ContentViewTracker` |
| `cta_visible` | ✅ mirrored from `cta_variant_impression` | ✅ `track-step` | ❌ **none** |
| `cta_engaged` | ✅ mirrored from `cta_variant_clicked` | ✅ `ProgramBenefitsCard` | ❌ **none** |
| `contact_intent` | ✅ tel:/mailto: | ✅ | ✅ |
| `lead_started` / `lead_created` | ✅ | ✅ `save-results` | n/a |

### Defect 4 — editorial CTA engagement is not instrumented

`ContentViewTracker` fires `cta_engaged` only for links carrying
`data-growth-cta`. **That attribute appears nowhere in the codebase.** So on
editorial pages we record the landing and a phone/email click, and nothing in
between. The middle of the funnel the question is most interested in —
editorial → CTA → provider — is dark.

### Defect 5 — the provider CTA mirror loses two things

In `app/api/activity/track/route.ts`, provider CTA events are mirrored into
`growth_attribution_events` but:

- `traffic_channel` is not set (by design — only landings carry it), so a
  mirrored CTA is only attributable if the landing row for the same
  `visit_id` exists;
- `visit_id` falls back to `session_id` when the client did not send one.
  `session_id` is the 30-**day** id. When that fallback fires, same-visit
  scoping silently widens to a month, and `lib/ad-boost/campaign-funnel.server.ts`
  documents this exact failure mode inflating `cta_visible` "by orders of
  magnitude".

### Navigation between surfaces

Reconstructable, and worth doing: order a visit's `page_landed` and CTA
events by `occurred_at` within `(anonymous_id, visit_id)`. That gives
Organic → Editorial → Provider → Connection CTA as a real observed path
rather than an assumed one. Nothing needs building; it is a query.

GA4 cannot do this join at all — aggregate GA users cannot be tied to an
individual inquiry. Migration 174's header says exactly this, and it is the
reason the table was built.

---

## 7. Distinguishing the three concepts

The distinction asked for is already in the schema and we have been eliding
it:

| Concept | Where it lives |
|---|---|
| **Acquisition source** | `traffic_channel` on the `page_landed` row |
| **Landing surface** | `page_path` / `page_category` on that same row |
| **CTA surface** | `page_path` / `cta_surface` on the `cta_engaged` row |

They are different rows. `Organic → Editorial → Provider → Connection CTA`
is three rows in one visit, and collapsing it to "Organic → Provider" throws
away the editorial page's entire contribution — which is precisely how an
editorial programme gets wrongly judged to be underperforming.

The operating map currently represents **only** acquisition source (CR1–CR3)
and a page-view total (CR4). It has no representation of landing versus CTA
surface at all.

---

## 8. What GA can and cannot tell us, per layer

| Layer | GA4 | First-party | Verdict |
|---|---|---|---|
| Total traffic | ✅ authoritative | partial — untracked pages missing | **GA** |
| Acquisition channel | ✅ authoritative | ✅ good, plus `ai_chat` GA lacks | **GA for totals, first-party for joins** |
| Landing page type | ✅ `landingPage` | ✅ `page_category` | either |
| Navigation between surfaces | ⚠️ path exploration only, not joinable | ✅ ordered by visit | **first-party** |
| CTA exposure / engagement | ❌ not modelled | ✅ where instrumented | **first-party** |
| CTA → real domain record | ❌ impossible | ✅ `conversion_type` + `conversion_id` | **first-party** |

The division of labour that follows: **GA is the source of truth for how much
traffic arrived and through which channel. First-party is the only source
that can follow a person from a landing to a lead.** Neither replaces the
other, and no number should be built from both.

---

## 9. Instrumentation gaps, ranked by what they cost us

1. **Channel allow-list drops Paid Search and Unassigned** (§1). Paid reads
   zero in every stored snapshot. Highest cost, cheapest fix.
2. **Operating map reads the wrong table** (§2b). CR3 misses auto-tagged
   Google Ads and all Meta traffic; CR2 absorbs the former. Fix: read
   `growth_attribution_events.traffic_channel`.
3. **Editorial CTA engagement uninstrumented** (§6). `data-growth-cta` is
   used nowhere. The editorial funnel cannot be measured at all.
4. **`visit_id` fallback to the 30-day id** (§6). Silently widens same-visit
   scoping to a month wherever it fires.
5. **Homepage, `/search` and city pages have no tracker.** Accepted
   deliberately — but note several of the 88 redirects in `next.config.ts`
   land on `/`, so that traffic disappears entirely. (Next.js preserves query
   strings across redirects, so UTMs and `gclid` survive; the loss is the
   missing tracker, not the redirect.)
6. **Referral domains are stored but never classified** (§5). Partner
   acquisition is invisible inside a generic bucket.
7. **Parse failures counted as Direct** (§3). Small, but it is a measurement
   error hiding inside a residual we already cannot explain.

Promoted out of that order because it is both large and trivially fixable:
**our own email traffic is unattributed** (§3a). Every link we send is
already tagged `ref=email&eid=<id>`; no tracker records those two fields and
no UTM accompanies them, so all of it lands in Direct on both GA and our own
side.

---

## 10a. What was built

CR1 now counts every visitor and splits into ten channels, classified by one
shared function (`lib/analytics/channel.ts`) so no two surfaces can disagree
about what "paid" means. CR2 and CR3 are retired; CR4 and everything below it
is unchanged.

The trackers now record `utm_medium`, `gclid` and `ref` alongside the
`utm_source` and `utm_campaign` they already stamped — those three are what
separate paid from organic and owned from direct, and dropping them was
defect 2 above.

Two things remain open and are marked in the map's own tooltip:

- **SMS links are untagged.** The channel exists and reads zero until
  outbound SMS carries `ref=sms`.
- **Family QR collateral needs `utm_source=qr_family`.** Provider outreach
  mail already ships `utm_source=fax` / `direct_mail` and MedJobs codes send
  care workers to the application; neither is care recipient demand, so only
  the family source counts in CR1.

`CHANNEL_SIGNALS_START` marks the day the new signals began recording. A
range reaching back past it gets a correct total and an incomplete split —
paid and email fall into organic search and unattributed — and the node says
so rather than presenting the split as fact.

## 10b. Recommendation for the CR architecture

**Do not add nodes until the numbers come back.** Four of the seven defects
above change what the numbers *are*, so any architecture drawn now would be
drawn on figures we already know to be wrong.

The sequence:

### Step 1 — fix the two measurement defects, then pull the data

Fix §1 (keep all GA channels) and §2b (map reads `traffic_channel`). Then
run:

```sql
-- Acquisition mix, first-party, joinable
select traffic_channel, count(distinct anonymous_id) as visitors,
       count(*) as landings
from growth_attribution_events
where event_type = 'page_landed'
  and occurred_at >= :from and occurred_at < :to
group by 1 order by 2 desc;

-- Channel → landing surface
select traffic_channel, page_category, count(distinct anonymous_id)
from growth_attribution_events
where event_type = 'page_landed'
  and occurred_at >= :from and occurred_at < :to
group by 1, 2 order by 3 desc;

-- Referral domains, ranked
select metadata->>'referrer' as domain, count(distinct anonymous_id)
from growth_attribution_events
where event_type = 'page_landed'
  and metadata->>'referrer_class' = 'other'
  and occurred_at >= :from and occurred_at < :to
group by 1 order by 2 desc limit 50;

-- Landing surface → CTA surface, within one visit
select l.page_category as landed_on, e.page_category as engaged_on,
       count(distinct l.anonymous_id)
from growth_attribution_events l
join growth_attribution_events e
  on e.anonymous_id = l.anonymous_id and e.visit_id = l.visit_id
 and e.event_type in ('cta_engaged','lead_started','contact_intent')
where l.event_type = 'page_landed'
  and l.occurred_at >= :from and l.occurred_at < :to
group by 1, 2 order by 3 desc;
```

GA4 side, for the totals: `sessionDefaultChannelGroup` × `totalUsers` with
**no allow-list**, plus `sessionSourceMedium` for Direct and Referral, and
`sessionSource` for social platform split.

### Step 2 — then decide what the map should represent

The likely answer, stated so it can be argued with before it is built:

- **CR1–CR3 become the GA channel groups that actually carry volume**, read
  from `traffic_channel` so they are joinable downstream. Probably Organic
  Search, Paid, Direct, plus Referral and Social if §10's numbers justify
  them. `ai_chat` is ours alone and may deserve a node on its own merits.
- **CR4 splits into two ideas it currently conflates**: an entry surface
  (where they landed) and a CTA surface (where they acted). Today it is one
  page-view total that is neither.
- **The Referral node splits** into managed partner traffic and everything
  else, once the domain ranking says whether partners are material.

None of that is worth drawing until the two measurement defects are fixed
and the numbers are in hand. The current model is not wrong in shape — it is
reading a source that cannot see paid, and that is a fix rather than a
redesign.
