# Stock image intake

Dump **provably-licensed** stock photos here (one flat folder — no need to
sort). They get classified by category, optimized, placed into the served
fallback library (`public/images/fallback/`), and recorded in the license
manifest (`public/images/fallback/CREDITS.json`).

This folder is a **staging area only** — originals are processed and then
removed before the work merges to `staging`. Nothing here is served to users.

> Full process (optimize → classify → place → record license → wire):
> see [`docs/stock-image-pipeline.md`](../docs/stock-image-pipeline.md).

## How to add images

1. Drop every photo into this one folder. No sorting needed — categories are
   assigned during processing by looking at each image.
2. **Keep the original Pexels filename.** The filename
   (e.g. `pexels-jsme-mila-523821574-18429308.jpg`) encodes the photographer
   slug and the photo ID, which is used to auto-derive the credit
   (`https://www.pexels.com/photo/<id>/`) for the manifest. Do not rename.

## License rule (do not skip)

Only add images with a clean, free-for-commercial-use license. Pexels and
Unsplash both qualify (free, commercial, modifiable, no attribution
required). If you can't point to the source URL + license, it doesn't go in.
