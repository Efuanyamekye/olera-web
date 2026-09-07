# Olera Marketplace — System Architecture

One city, both sides. Everything below the entry layer lives in the Portal.

**Track A = Aid Establishment. Track B = Care Establishment. PG = the paid add-ons.**

---

```
                                       ┌────────────┐
                                       │  ONE CITY  │
                                       └──────┬─────┘
            ┌─────────────────────────────────┴──────────────────────────┐
            ▼                                                            ▼

FAMILY                                                PROVIDER
───────────────────────────────────────────────────   ─────────────────────────────────────
SOURCES                                               SOURCES
FS1 REFERRAL   FS2 ORGANIC   FS3 PAID ADS             P1  LISTED  PS1 ORGANIC  PS2 REFERRAL
  │              │             │                        │         │            │
  │              └───────┬──────┘                       ▼         └──────┬──────┘
  │                      ▼                            P2  OUTREACH       │
  │           F1  ENTRY SURFACE                         │                │
  │               provider page                         │                │
  │               editorial                             │                │
  │               benefits page                         │                │
  │               │                                     │                │
  │               ├─ FQ   QUESTION ─────────────────────►                │
  │               ▼                                     │                │
  │           F2  CTA                                   │                │
  │               ├─ F2a  BENEFITS CTA                  │                │
  │               ├─ F2b  CONNECTION CARD ──────────────►                │
  │               ├─ F2c  LIVE PROFILE ─────────────────►                │
  │               │                                     │                │
  └────────┬──────┘                                     │                │
           └─────────────────────────┐                  │                │
                                     ▼                  ▼                ▼
┌───────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│  PORTAL                                                                                                       │
│  ┌──────────────────────┐  ┌─────────────────────┐  ┌─────────────────────────────────┐                       │
│  │ TA AID ESTABLISHMENT │  │ F3  FAMILY PROFILE  │  │ TB CARE ESTABLISHMENT           │                       │
│  │                      │  │                     │  │                                 │                       │
│  │                      │  │    ┌────────────┐   │  │          ┌────────────┐         │                       │
│  │                      │  │    │    CR-F    │   │  │          │    CR-P    │         │                       │
│  │                      │  │    └────────────┘   │  │          └────────────┘         │                       │
│  │                      │  │                     │  │                                 │                       │
│  │ A1  MATCHED          │◄─│       enriches      │  │ P3  PROVIDER PROFILE            │                       │
│  │      │               │  │     continuously    │  │     CLAIM or CREATE             │                       │
│  │      ▼               │  │                     │  │      │                          │     PAID ADD-ONS      │
│  │ A2  APPLICATION      │  │                     │  │      ▼                          │     ────────────      │
│  │      │               │  │                     │─►│ B1  FAMILY-PROVIDER MATCHED ▲ ◄─┼──── PG1  MANAGED ADS  │
│  │      ▼               │  │                     │  │      │                          │                       │
│  │ A3  AID ESTABLISHED  │─►│                     │  │      ▼                          │                       │
│  │                      │  │                     │  │ B2  FAMILY-PROVIDER QUALIFIED   │                       │
│  │                      │  │                     │  │      │                          │                       │
│  │                      │  │                     │  │      ▼                          │                       │
│  │                      │  │                     │  │ B3  STAFFED PROVIDER        ▲ ◄─┼──── PG2  STAFFING     │
│  │                      │  │                     │  │      │                          │                       │
│  │                      │  │                     │  │      ▼                          │                       │
│  │                      │  │                     │  │ B4  CARE ESTABLISHED            │                       │
│  └──────────┬───────────┘  └─────────────────────┘  └─────┬────────────────┬──────────┘                       │
└─────────────┼─────────────────────────────────────────────┼────────────────┼─────────────────────────────────┘
              │                                             │                │
              └──────────────────────┬──────────────────────┘                │
                                     ▼                                       ▼
                              FAMILY OUTCOME                         PROVIDER OUTCOME
                            FO1 aid   FO2 care                       PO  new business
```

---

## Index

**S = source.** FS is a family source, PS a provider source.

| | |
|---|---|
| **FS1 · FS2 · FS3** | referral · organic · paid ads |
| **F1** | entry surface — provider page, editorial, benefits page |
| **FQ** | question |
| **F2** | CTA — **F2a** benefits CTA · **F2b** connection card · **F2c** live profile |
| **TA · TB** | track A, aid establishment · track B, care establishment |
| **F3** | family profile |
| **CR-F** | family consumer relations |
| **P1 · PS1 · PS2** | listed · organic · referral |
| **P2** | outreach |
| **P3** | provider profile, claim or create |
| **CR-P** | provider consumer relations |
| **A1 · A2 · A3** | matched · application · aid established |
| **B1 · B2 · B3 · B4** | family–provider matched · family–provider qualified · staffed provider · care established |
| **FO1 · FO2** | aid · care |
| **PO** | new business |
| **PG** | paid add-ons — **PG1** managed ads · **PG2** staffing |

---

## Three family signals feed outreach

**FQ, F2b and F2c** all point at P2. Each is a family naming a specific provider, which is the reason
to work that provider — whether or not the family goes on to a full profile. **F2a** does not,
because it names no provider.

That is the reciprocal loop: family demand makes provider outreach worth doing, and provider
outreach makes the next family's match land on someone who can act.

## Both sides acquire the same way

Referral and organic on both; paid ads on the family side only. The one asymmetry is **P1**, the
listed directory — there is no family equivalent, and there should not be.

---

## Paid add-ons

A fourth column in the portal, beside the tracks rather than inside one. Two tiers, sold as an
upgrade, and neither changes how a family is matched.

**PG1 managed ads** points at B1. The mechanism is longer than the arrow: paid spend buys FS3 for one
provider, families reach that provider's page at F1, and more of them come through F2 to B1 with
them. It buys distribution, not position.

**The ▲ marks the step each tier lifts.** PG1 raises the number of families reaching B1; PG2 raises
the number of matches that get staffed at B3.

**PG2 staffing** points at B3. A provider who cannot staff a case cannot establish care, so the
constraint near the bottom of Track B is often capacity rather than demand. This tier is MedJobs
pointed at a single provider.

**B3 is new.** Track B now runs matched → qualified → staffed → care established. Staffing was always
the real gate between a qualified family and a started case; it was simply invisible while nothing
acted on it. It is not a tracked state today.

**The sequence sells itself.** PG1 sends more families to B1. A provider who cannot staff them stalls
at B3, which is the moment PG2 is worth buying. One conversation, two tiers, in order.

**Where it is sold.** As an upgrade the provider sees in the portal, and in the CR-P conversation.
The free market snapshot is what earns that call.

**PG1 today.** Shipped as Ad Boost — `lib/ad-boost/*`, `/provider/boost`, `/admin/ad-boost`.
Providers choose Google, Meta or both; Nextdoor is admin-assigned and experimental. A campaign runs
pending_profile → requested → scheduled → live → ended, and will not start below 70% profile
completeness, so presence work is already a gate rather than a product. The ladder is a $50 first
campaign on us, then $75, $150 and $300 a month, with $600+ handled as a custom plan. Billing is flat
and all-in — spend, setup and management bundled, never per-lead.

**PG2 today.** Does not exist as a provider-facing tier. MedJobs runs as its own system with its own
funnel; nothing sells staffing to a provider.

---

## One thing to decide

**P3 above B1 describes where we want to be, not where we are.** Today the match comes first: a
family inquires, the connection is created against a listed provider, and the notification email —
a link with no family contact details — is what causes the claim. Shipped order is match → claim →
respond. Drawing P3 first says something better: a pool of claimed providers receiving matches. CR-P,
PS1 and PS2 are the machines that would get us there.

---

## Two mechanics the diagram compresses

**Why the tracks need different facts.** Track A filters on state, age, income band, Medicaid status
and veteran status. Track B matches on care type, location and contact. F2a deposits the first set,
F2b the second — so a family arriving through one has half a plan until the profile deepens.
Crossing both thresholds in one conversation is CR-F's clearest job.

**Why A3 returns to F3.** An aid decision is a fact about the family — what they qualify for and
what it pays — so it lands back in the profile, where it changes what Track B can match. The profile
is the record both tracks read and write.

**Why the profile is not a gate.** It enriches continuously and yields whatever it can at any depth.
A partial profile starts a track immediately; more profile deepens what is already running.

---

## Status

**Exists** — F2a, F2b, FQ · continuous enrichment · P1 · P2 · P3 · both tracks' execution.

**Partial** — F2c live profile · the plan F3 produces (the aid half exists; there is no provider
half).

**Proposed** — FS1, PS1, PS2, CR-F, CR-P.

**PG** — **PG1** exists as Ad Boost, but is not framed or sold as one of a pair of add-ons.
**PG2** is proposed: the caregiver supply exists in MedJobs, the provider-facing tier does not. **B3
staffed provider** is proposed — nothing records it.
