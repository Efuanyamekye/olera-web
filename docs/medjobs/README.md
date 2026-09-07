# MedJobs Documentation

Two layers: an **operating layer** (how the business is run) and an **engineering layer** (how the system
is built). They are peers and must stay consistent — same vocabulary, same states, same funnel.

## Start here

| You are… | Read |
|---|---|
| Running MedJobs day to day | **[`operating/`](operating/)** — the operating workspace |
| Changing MedJobs code | **[`OPERATIONAL_BRIEF.md`](OPERATIONAL_BRIEF.md)** — the engineering reference |
| New to MedJobs entirely | [`operating/00-OPERATING-SYSTEM.md`](operating/00-OPERATING-SYSTEM.md), then [`EXECUTIVE_SUMMARY.md`](EXECUTIVE_SUMMARY.md) |

## Operating layer

### [`operating/`](operating/)
**Audience:** the execution pod (Chantel, Esther, Grazy, Sess) + founders.

The single source of truth for commercializing MedJobs: the executive operating plan, the execution
playbook, roles and ownership, protocols P1–P7, metrics, experiments, decisions, scale gates, and iteration
history. Start at [`operating/README.md`](operating/README.md).

Open conflicts between the meeting, the admin protocol, and the shipped system are named explicitly in
[`operating/07-OPEN-DECISIONS-AND-CONFLICTS.md`](operating/07-OPEN-DECISIONS-AND-CONFLICTS.md) — read that
before assuming any of the three is authoritative on price, on what a "Client" is, or on archiving rules.

## Engineering layer

### `EXECUTIVE_SUMMARY.md`
**Audience:** Engineering + outreach/admin team, on first read.
**Voice:** Strategic, philosophical, scannable, motivational.
**Reading time:** ~15 minutes.

Use this for team orientation, Slack distribution, and onboarding new contributors. Covers what the system is, why it exists, how the funnel works, the operational lifecycle, current state, and priorities.

### `OPERATIONAL_BRIEF.md`
**Audience:** Engineers, future Claude sessions, anyone iterating on the code.
**Voice:** Implementation-aware, reference-grade, exhaustive.
**Reading mode:** Reference document — sections read as needed.

Use this as the canonical engineering reference. Future MedJobs Claude sessions should begin: *"Read `docs/medjobs/OPERATIONAL_BRIEF.md` before we start."*

Includes:
- Full vocabulary with code references
- Complete outcomes map (every Log modal, every outcome, every dispatch)
- State machine reference (status transitions, sub-state transitions, stage derivation)
- Discipline rules (G1–G10) and deferred items registry (D1–D25)
- Critical files reference
- Open architectural decisions / unverified assumptions

### `MedJobs_Operating_System_Walkthrough_Summary.pdf` / `.docx`
**Audience:** The team and anyone reading the operating-system diagram.
**Voice:** Plain, structural, two pages.

Companion to the MedJobs operating-system diagram. Covers the operating unit, the
provider and university pipelines, the seven portal milestones, why the six-shift
threshold is the commercial bar, what still needs building, and the scaling
principle. House-style build in `walkthrough-src/`.

### `MedJobs_2.0_Master_Implementation_Matrix.pdf`
**Audience:** Anyone building or operating a stage.
**Voice:** Reference-grade, stage by stage, 38 pages.

Every stage from PR1 to MA5 in three layers: what the user does and what the
technology does, the human procedure behind it, and what the system records and
hands on. 30 screenshot exhibits, the flow diagram, and a deferred build list of
everything the document describes that does not work that way yet. House-style
build in `matrix-src/`; run `matrix-src/build.sh` to rebuild.

## Source of truth

The markdown files in this directory are the **source of truth**. When the system evolves, update these
documents. Operating changes land in [`operating/`](operating/); engineering changes land here. An operating
decision that needs a code change goes to TJ with a note in `operating/08-ITERATION-LOG.md`; an engineering
change that alters the funnel is reflected in `operating/` the same week.

## Converting to Word (for Slack / email distribution)

The executive summary is designed to read well in markdown and to convert cleanly to Word when needed. Three options:

1. **Copy-paste into Google Docs** — paste the markdown content into a Google Doc; tables and formatting render correctly. Export as `.docx` from there.
2. **Use pandoc** locally:
   ```
   pandoc EXECUTIVE_SUMMARY.md -o EXECUTIVE_SUMMARY.docx
   ```
3. **Any markdown-to-docx converter** (Typora, Pandoc Online, etc.).

The `.docx` is **not** version-controlled — the markdown is. Regenerate the Word file whenever you need to share an updated copy.

## Maintenance

Both documents share vocabulary, philosophy, and the canonical tables. They differ in abstraction level. When the system materially evolves, update both — usually the engineering doc first (source of truth for technical detail), then propagate the conceptual change to the executive summary.

A pointer to `OPERATIONAL_BRIEF.md` lives in the repo's top-level `CLAUDE.md` so future Claude sessions automatically discover it.
