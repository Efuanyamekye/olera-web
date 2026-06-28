# Stock / fallback image pipeline

How we add licensed stock photos to the provider directory's category
fallback library. This implements **Strategy #2 of the Provider Image
Strategy** ("Own our stock & fallback licenses"): every stock image we serve
must have a clean, recorded license, and we host an optimized copy ourselves.

## The rule

1. **Only provably-licensed sources.** Pexels and Unsplash (free, commercial,
   modifiable, no attribution) are the defaults. Paid sources (e.g.
   Shutterstock) are fine **only** with proof of purchase on file.
2. **Every served image is documented.** `public/images/fallback/CREDITS.json`
   must have an entry for every image in that folder.
   `scripts/check-fallback-licenses.js` fails the build if any image is
   undocumented. **No license on file → it does not ship.**
3. **Never serve full-resolution originals.** Stock originals are 3–6 MB /
   ~6000px. They MUST be resized + recompressed before they go in `public/`
   (see step 2 below) so they don't wreck load times.

## Where things live

| Path | Purpose |
|------|---------|
| `stock-intake/` | Drop zone for raw originals. **Staging only** — removed before merge; never served. |
| `public/images/fallback/` | The served, optimized library (`{category}-NN.jpg`). |
| `public/images/fallback/CREDITS.json` | License manifest — the legal record of record. |
| `scripts/check-fallback-licenses.js` | Enforces "every served image is documented." |
| `lib/types/provider.ts` | `CATEGORY_FALLBACK_POOLS` — wires images to categories. |

## Adding new images

### 1. Get the raw files onto the branch
Drop them in `stock-intake/` and push over **git** (not GitHub's web uploader,
which caps payload size). Keep the original source filenames — for Pexels,
`pexels-<photographer>-<id>.jpg` encodes the credit and photo ID used in the
manifest.

### 2. Optimize
Resize to max **1920px wide**, **mozjpeg quality 80**, strip metadata
(honor EXIF rotation first). This takes ~3–6 MB originals down to ~150–350 KB.
`next/image` still re-optimizes per device at request time; this just keeps the
committed source sane. (Reference: `sharp().rotate().resize({width:1920,
withoutEnlargement:true}).jpeg({quality:80, mozjpeg:true})`.)

### 3. Classify + curate
Sort each into a category: `home-care`, `assisted-living`,
`independent-living`, `memory-care`, `nursing-home`, or `general` (warm
senior-care scenes that fit anywhere / backfill thin categories). Reject
anything off-topic, low-quality, clinical-logistics, or undignified — a
trustworthy directory shows **fewer honest images, not more generic ones**.

### 4. Place + name
Copy optimized files into `public/images/fallback/` as `{category}-NN.jpg`
(zero-padded, sequential).

### 5. Record the license
Add an entry to `CREDITS.json` for each file: `file`, `category`, `source`,
`photographer`, `photo_id`, `source_url`, `photographer_url`, `license`,
`added`. For paid sources, also record the license/order ID — but keep order
numbers in a **non-served** internal file, not in this public manifest.

### 6. Wire + verify
Add the paths to the relevant pool in `lib/types/provider.ts`, then:
```
node scripts/check-fallback-licenses.js   # license coverage
npx tsc --noEmit                          # types
```

### 7. Clean up
Remove the raw originals from `stock-intake/` (keep the folder scaffold).
When the PR merges to `staging`, **squash** so the raw originals never enter
`staging` history.

## How fallbacks are chosen at runtime

`getCategoryFallbackImage(category, providerId)` picks one image from the
category's pool using a deterministic hash of `providerId` — the same provider
always gets the same photo (no flicker / hydration mismatch), but different
providers spread across the pool. Bigger pools = more visual variety, so
pools hold distinct scenes (near-identical photographer series are deduped to
one). Independent Living is the thinnest category (the current library skews
care-heavy) and leans on social assisted-living backfill — a candidate for
targeted re-sourcing if we want active-lifestyle imagery.
