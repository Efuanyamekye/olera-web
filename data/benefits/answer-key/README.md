# Benefits answer key

The scoreboard for the finder and the benefits conversation (caseworker plan, Phase 2).

- `families.json`: 40 dementia-caregiver families, four archetypes in ten states, with exact facts.
- `answers/<ST>.json`: what a skilled counselor would recommend for each family. Researched on 6 Oct 2026 from official state and federal sources **without reading Olera's program data**, so agreement means something. Every program carries a verdict (likely, possible, unlikely), the deciding rule with its number, a source URL, and whether the source was official, secondary or inferred.
- `aliases.json`: pins researched program names to our program ids; `null` means we don't hold the program.
- `last-score.json`: the latest score.

Run it before shipping any change to recommendations:

    npx -y tsx@4 scripts/benefits-answer-key-score.ts [--states TX,FL] [--verbose] [--matches]

The key is research, not ground truth. Where the engine and the key disagree, one of them is wrong; check the key's source before changing the engine. Real outcomes from families (called, applied, approved) replace these labels as they come in.
