-- Meta (Facebook/Instagram) arm of the Olera city campaigns.
--
-- Two things: somewhere to record a Meta click, and the tracker rows the
-- /admin/city-ads page reads so Google, Nextdoor and Meta spend never blend
-- into one number (the blind spot the provider "both" rows already have).

-- The Meta equivalent of gclid. Without it a Meta lead is indistinguishable
-- from an organic one in city_leads, and the 20 Sep read is per channel.
alter table public.city_leads
  add column if not exists fbclid text;

comment on column public.city_leads.fbclid is
  'Meta click id from the ad landing URL. Proof the lead came from a Meta ad, the way gclid is for Google.';

-- One row per city x channel x flight. Meta joins Google (live) and the
-- Charlotte Nextdoor row (draft). $150 per city, concurrent with the Google
-- flight so both are read on the same 20 Sep gate.
--
-- utm_medium is 'paid_meta', not 'paid_social': Nextdoor already holds
-- paid_social, and Charlotte runs both, so sharing a medium would make every
-- Charlotte social lead unattributable.
insert into public.city_campaigns
  (slug, city, state, ring_label, care_types, channel, campaign_tag, utm_medium,
   flight_start, flight_end, budget_cents, status, admin_note)
values
  ('charlotte-nc', 'Charlotte', 'NC', 'Charlotte metro', array['home_care'],
   'meta', 'olera-charlotte-sep26', 'paid_meta',
   '2026-09-07', '2026-09-20', 15000, 'draft',
   'OLERA-OWNED CITY CAMPAIGN, Meta arm. Home care only in creative: Meta files senior LIVING under the Housing special ad category, which strips age and sub-15-mile geo targeting. Geo is pool territory (Charlotte north ring), not the DMA, because broad targeting scatters leads outside the pool. Optimise for the on-site Lead event, never Instant Forms, never link clicks.'),
  ('dallas-tx', 'Dallas', 'TX', 'Dallas metro', array['home_care'],
   'meta', 'olera-dallas-sep26', 'paid_meta',
   '2026-09-07', '2026-09-20', 15000, 'draft',
   'OLERA-OWNED CITY CAMPAIGN, Meta arm. Home care only in creative (Housing special ad category). Geo is pool territory (NORTH Dallas: Richardson, Plano, Frisco), not the DMA. The first Google lead was DeSoto, which no pooled franchise can serve, and broad Meta targeting would produce more of those. Optimise for the on-site Lead event, never Instant Forms, never link clicks.')
on conflict do nothing;
