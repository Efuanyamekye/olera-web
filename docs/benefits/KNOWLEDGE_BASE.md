# The benefits knowledge base

Phase 1 of the Benefits Caseworker. One store of program rules that the finder,
the plan, the letters, the state pages and the sitemaps all read, where every
fact has a source and a date, corrections are applied, and a study cohort can be
pinned to a version.

Status: in progress, started 2 October 2026. The founding document with all six
phases is the artifact "The Benefits Caseworker".

## Where program facts live today (measured 2 Oct 2026)

Three stores describe the same programs, joined by heuristics:

| Store | What it is | Who reads it |
|---|---|---|
| `data/pipeline/<ST>/drafts.json` (+ generated `drafts.ts`, barrel `data/pipeline-drafts.ts`) | Per-state program drafts from the pipeline: content, `structuredEligibility` (income table, assets, age, functional need), contacts, documents. Fact-checked per state by `--phase factcheck`. 655 programs, 466 of type `benefit`. | State pages, program pages, sitemaps, the finder (`finder-engine.server.ts`), letters (`benefits-cascade.server.ts`), the `/m` plan (`benefits-token.ts`) |
| `data/waiver-library.ts` | The legacy static library (11,895 lines). Name and abbreviation metadata for states; older program entries, mostly without a `programType`. | `lib/program-data.ts` merges it under the drafts; 285 legacy-only programs are still in the canonical id list, hidden from the finder (no type) but reachable through `/api/benefits/programs` and the provider page |
| `sbf_state_programs`, `sbf_federal_programs` (database) | A simpler rules table seeded 22 March 2026 and not changed since: `min_age`, `max_income_single`, `requires_medicaid`, `requires_veteran`, `priority_score`. 528 state rows, 75 federal. No phones, no scripts. | `eligibility.server.ts` (joined to drafts by archetype and name tokens), `benefits-guidance.server.ts` (priority), `/m` plan, family brief, the old match route |

How they disagree:

- Of 466 benefit programs, 316 join to an sbf row; 150 don't.
- Where both stores hold a one-person income limit (136 programs), **91 differ by more than 10%**.
- For **111 programs** the drafts hold no income table, so until 2 Oct the March row alone decided "income is likely above its limit". Fixed: that column now boosts only (same rule as `min_age` and `requires_medicaid`, which an earlier fix had already limited because the seed was noisy).
- The sbf `requires_medicaid` is wrong in both directions (Alaska Medicare Savings carries `true`; Texas STAR+PLUS carried `false`).

Verification state:

- `factcheck.json` exists for all 51 states, but every run dates from **April 2026**. The file dates of 29 September were a regeneration touch. 634 of the program ids it flagged no longer exist after the August and September re-drafts. No check has been run on the current drafts.
- 264 of 469 benefit drafts carry a `lastVerifiedDate`; 205 carry none.
- There was no script to apply a flag. `scripts/benefits-apply-factcheck.js` (2 Oct) is that judge.
- Nothing re-verifies on a schedule. The five benefits crons all send letters.
- Nothing is versioned. A family's record does not say which rules it was matched against.

## The target

**The drafts are the one store.** They are fact-checked per state, reviewed as
files in pull requests, linted (`scripts/benefits-lint.js`), attacked
(`scripts/attack-draft.js`), and git gives versions for free. The database holds a
*derived* copy for runtime readers; nothing writes rules into the database by
hand.

### The program record (schema v2, additive)

Everything below is added to `PipelineDraft`; nothing existing is removed, so no
page breaks.

```
ruleSources: {                 // per-rule provenance; the draft-level sourceUrl stays as the page source
  incomeTable?:   { url, checkedAt, confidence: "official" | "aggregator" | "model", checkedBy }
  assetLimits?:   { ... }
  ageRequirement?: { ... }
  functionalRequirement?: { ... }
  phone?:         { ... }
}
appliedCorrections: [          // written by the judge, never by hand
  { field, from, to, source, flaggedAt, appliedAt, appliedBy }
]
reviewQueue: [                 // flags the judge would not apply, for a person
  { field, from, to, source, why, flaggedAt }
]
```

State-level: `data/pipeline/<ST>/drafts.json` gains `factcheckedAt` (copied
from the last run) so staleness is visible without opening `factcheck.json`.

Repo-level: `data/pipeline/VERSION.json` `{ "version": "2026.10-v1", "frozenAt", "note" }`,
plus a git tag `benefits-data-<version>`. `save-results` stamps
`metadata.benefits_results.data_version` on every family, and the study tag
carries it.

### One id for life

`lib/benefits/program-duplicates.ts` maps copies to the kept program (50 pairs
plus 11 old caregiver shells, 2 Oct). New rule: a program never gets a second id.
A renamed program keeps its id; a merged program's old id goes in the duplicates
map and 308-redirects. Legacy ids are never reused for new drafts, because
`getEnrichedProgram` lets the legacy base win name and phone.

### Retiring the two other stores

1. **sbf tables.** Generate them from the drafts (a script that writes
   `max_income_single` from `incomeTable[1]`, `min_age` from `ageRequirement`,
   `requires_medicaid` from `medicaidGatedName`, phones and short names), so the
   `/m` plan, the family brief and guidance keep working unchanged while reading
   derived data. Then switch those readers to the drafts directly and drop the
   tables. Until then: the columns boost only, never exclude (done).
2. **Legacy library.** For each of the 285 legacy-only canonical programs:
   if a draft covers the same program, map it in `program-duplicates.ts`; if it
   is a real program the drafts lack and a family would want, draft it through
   the pipeline; otherwise drop it from the canonical list. The library's state
   metadata (names, abbreviations) stays until DC gets an entry (today every DC
   program page 404s because DC has no library state).

## The loop

1. **Check.** `node scripts/benefits-pipeline.js --state XX --phase factcheck --run`
   writes `factcheck.json`. One Perplexity call per program with verifiable
   facts (about $8 to $10 per 1,000 calls, so a full run is under $10).
2. **Judge.** `node scripts/benefits-apply-factcheck.js --apply` applies numeric
   limits from official sources within sanity bounds, logs each in
   `appliedCorrections`, and queues the rest (`--review` prints them with their
   sources). Phones are applied only with `--phones` and only from official
   pages, after a person has skimmed the list.
3. **Regenerate.** `node scripts/benefits-pipeline.js --regen-index`.
4. **Score.** The 255-family consistency grid (`matrix.js`) must stay clean;
   once Phase 2 exists, the labelled cases must not get worse.
5. **Schedule.** A GitHub Actions workflow runs steps 1 to 4 on a rotation
   (ten states a week, so every state is re-checked every five weeks) and opens
   a pull request with the diff and the review queue. Not a Vercel cron: the
   pipeline needs the Perplexity and Anthropic keys and writes files.

## Action items

- [x] Stop the stale table from excluding anyone (`eligibility.server.ts`, 2 Oct).
- [x] The judge: `scripts/benefits-apply-factcheck.js`.
- [ ] Re-run the fact-check on the current drafts, all 51 states.
- [ ] Apply official numeric corrections; review phones; regenerate; grid clean.
- [ ] Schema v2 fields in `data/pipeline-drafts-types.ts` and the pipeline writer.
- [ ] `VERSION.json`, git tag, `data_version` stamped at `save-results`.
- [ ] Freeze version 1 before cohort 1 (week of 5 October 2026).
- [ ] Derive the sbf tables from the drafts; then switch readers; then drop.
- [ ] Resolve the 285 legacy-only programs (map, draft, or drop).
- [ ] Raise structured income tables for the programs study families hit most.
- [ ] GitHub Actions rotation for re-verification.
- [ ] DC: a library state entry so program pages render.
- [ ] Programs with no phone (e.g. Indiana Caregiver Respite Services); Michigan caregiver program.

## Done when

One store; every rule sourced and dated; no unapplied high flags; re-check
scheduled; snapshot v1 tagged and stamped on family records; the consistency
grid clean.
