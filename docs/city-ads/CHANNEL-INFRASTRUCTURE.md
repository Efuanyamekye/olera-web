# City ads: adding a paid channel

Written 2026-09-09, while the Meta arm was being built in one session and the
Nextdoor arm in another. It exists so the two land compatibly, and so a third
channel later does not have to re-derive any of it.

Read this before touching `lib/city-ads/`, `/api/city-leads`, `/admin/city-ads`,
or the channel tracks in `.claude/commands/ad-boost-setup.md`.

---

## 1. What the city arms are for

They are **a platform experiment before they are a lead source.** We do not yet
know which of Google, Nextdoor or Meta is worth keeping. So the infrastructure
has to make channels *comparable*, and the comparison has to survive a channel
being paused, restarted, or run at a budget too small to conclude anything.

Consequences that shape every decision below:

- **Every channel must be attributable end to end.** A lead whose channel cannot
  be determined is worse than no lead, because it corrupts the comparison the
  arms exist to produce.
- **A low result is not a verdict.** These budgets are small and each platform's
  optimiser needs volume we will not give it. Build the instrument so a future
  re-run is cheap; do not build anything that assumes this flight is the last.
- **Never print a confident number that is not real.** A channel showing
  "$0.00 per lead" because spend was not typed reads as a result and will be
  acted on. Show nothing instead.

## 2. The four collision points

Anything adding a channel touches these. They are shared:

| File | What a new channel adds |
|---|---|
| `lib/city-ads/config.ts` | its `CITY_MEDIUM_*` constant + a branch in `classifyCityTraffic` |
| `app/api/city-leads/route.ts` | stores its click id; fires its conversion at the tail |
| `app/care/[city]/page.tsx` | mounts its pixel; captures its click id from the URL |
| `app/care/[city]/CityLandingClient.tsx` | its `Utm` field; fires its browser-side conversion |

Plus `supabase/migrations/` (take the next free number, check `git log` first —
two sessions grabbing the same number is the likeliest merge conflict) and
`.claude/commands/ad-boost-setup.md`.

## 3. Decisions already locked — do not re-litigate

**Each channel gets its own `utm_medium`.** Google `paid_search`, Nextdoor
`paid_social`, Meta `paid_meta`. Nextdoor's `paid_social` is the pre-existing
value and is **load-bearing** — it is in live ad URLs and in `city_campaigns`
rows. Do not change it. Meta took a third value rather than sharing
`paid_social`, because Charlotte runs Nextdoor and Meta at once and a shared
medium would make every Charlotte social lead unattributable.

**`classifyCityTraffic` in `lib/city-ads/config.ts` is the single attribution
point.** It returns a display name (`"Meta"`); `city_campaigns.channel` holds
the lower-case key (`"meta"`); `leadChannelKey` in `channel-rollup.ts` is the
only place that maps between them. A new channel adds one branch. **A click id
outranks a `utm_medium`**, because the medium is typed into an ad URL by hand
and the click id is not.

**Channel keys** must match `city_campaigns.channel`, whose CHECK constraint
already allows `google | nextdoor | meta` (migration 207). A fourth channel
needs a constraint migration first — the insert fails otherwise.

**Test rows never count.** `city_leads.is_test = true` is excluded from every
rollup. Counting them credits a channel with leads it never produced.

## 4. The conversion pattern, and why it is shaped this way

Meta is built; Nextdoor should follow the same shape rather than inventing a
parallel one. Nextdoor **has** a conversion pixel, and the existing command note
"zero in Nextdoor's Conversions column is expected without its pixel" describes
a gap worth closing — without it Nextdoor optimises for clicks, which is how the
Nextdoor pilot produced 135 landings and zero contactable leads.

The pattern, in four parts:

1. **`lib/city-ads/<channel>.ts`** — public id + an `is<Channel>Configured()`
   guard. Everything no-ops when env vars are absent, so code ships before the
   ad account exists.
2. **`components/analytics/<Channel>Pixel.tsx`** — browser pixel, plus a
   `track<Channel>Lead(eventId)` export. Mounted **only** on `/care/[city]`.
3. **`lib/city-ads/<channel>-capi.server.ts`** — the server-side conversion,
   fired from the lead route. Never throws, always awaited (a serverless
   function can freeze the moment it returns its response).
4. **A client-minted event id** passed to the route in the POST body, so both
   halves describe one conversion. **Without this a single submission counts
   twice**, and cost per lead reads at half its true value.

**Both halves fire on the same gate: routable leads only.** Medical requests and
duplicates return early in the route, before either conversion call. The client
guard must match exactly (`if (!data.redirected && !data.duplicate)`) or the
browser half counts leads the server half does not.

### Two scope limits that are deliberate

**The pixel loads on `/care/{city}` and nowhere else.** The Ad Boost invariant
"never install a third-party pixel during setup" was written for *provider*
pages, which we run on someone else's behalf, and it still holds there.
`/care/{city}` is an Olera-owned noindex landing page for an Olera-owned
campaign, so it gets a carve-out and the rest of the site does not. **Do not
mount a city pixel in the root layout.**

**Send contact identifiers, never care details.** Hashed email, phone, first
name, ZIP, city, state — and never `care_type`, `urgency`, or who the care is
for. Those are health-adjacent facts about a named person, the ad platforms'
own terms forbid sending health data, and the optimiser does not need them.

## 5. The read

`lib/city-ads/channel-rollup.ts` joins `city_campaigns` (spend, hand-typed from
the ad manager) to `city_leads` (channel, computed) and produces cost per lead
per channel. It renders in the Setup block of `/admin/city-ads`.

A new channel needs no rollup code — it appears automatically once it has a
`city_campaigns` row and its `classifyCityTraffic` branch. **If a channel shows
up as "no campaign row", its attribution is wrong**; that row is the designed
symptom, not a display bug.

Spend is hand-typed and leads are computed, so the halves fill in at different
times. That is why every derived number is nullable.

## 6. What `/ad-boost-setup` actually needs

The command has **no concept of a city campaign at all.** Both live city arms
were built by hand. It assumes throughout: a provider from
`ad_campaign_requests`, a `/provider/{slug}` final URL, provider comms, a
wrap-up email, a photo-readiness gate. None of that applies to a city campaign.

So it needs **two dimensions, not one**. Subject is asked first, because it
changes what every later question means:

- **Subject** — provider campaign (`ad_campaign_requests`, `/provider/{slug}`,
  provider comms, wrap-up) **vs** Olera city campaign (`city_campaigns` +
  `city_pool`, `/care/{slug}`, no provider comms, concierge routing, no
  wrap-up). Budget framing differs too: the provider default is the $50 free
  intro; city arms are Olera-funded per-city flights.
- **Channel** — Google / Nextdoor / Meta, each with its own `Phase 2*` build
  track, `Phase 3*` post-publish, and invariants block.

**Write each channel's phase from a hand-built campaign, not from research.**
That is how the Google track (Miracle-Lightstar + Impact) and the Nextdoor track
(Graceful pilot) were written, and it is why every line in them is something
that actually bit us — the re-auth opening in a second tab, the review summary
lying about ad count, Quick Create preselecting the wrong objective. A phase
written before running one is a phase full of guesses.

Structure that keeps merges cheap: **one section per channel, no shared
prose.** The channel tracks are already independent (`Phase 2G` / `Phase 2N`);
keep it that way and two sessions can add sections without touching each
other's text. Only Phase 0 (the gate) and the shared invariants block are
common ground — edit those in small, surgical diffs.

## 7. Constraints a channel cannot fix

Worth stating because more than one review has proposed a channel or page change
to solve them:

- **The callback window is 8am–noon in the city's timezone** (`STAFFED_HOURS`),
  because one person makes every concierge call and they are on UTC+7. The
  first real lead arrived 17:44 local and waited ~14.5 hours. More traffic does
  not improve this and makes it worse.
- **City pools follow franchise territory, not radius.** That first lead was in
  DeSoto, which no pooled Dallas franchise can serve. **Scope paid geo to pool
  territory, not the metro**, or a new channel just produces more unservable
  leads faster.
