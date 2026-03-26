#!/usr/bin/env node
/**
 * Standalone City Enrichment
 *
 * Fills enrichment gaps for ALL providers in a city, regardless of how they
 * were imported. Queries by city+state columns (not provider_id prefix).
 *
 * Usage:
 *   node scripts/enrich-city.js <city> <state>                # dry-run (default)
 *   node scripts/enrich-city.js <city> <state> --run           # execute all streams
 *   node scripts/enrich-city.js <city> <state> --run --stream trust   # single stream
 *   node scripts/enrich-city.js <city> <state> --run --stream images  # single stream
 *
 * Streams: desc, reviews, trust, snippets, images
 */

'use strict';

// ---------------------------------------------------------------------------
// Dependencies (worktree-compatible)
// ---------------------------------------------------------------------------

const path = require('path');
const fs = require('fs');
const MAIN_REPO = path.resolve(process.env.HOME, 'Desktop/olera-web');
module.paths.unshift(path.join(MAIN_REPO, 'node_modules'));

const envPaths = [
  path.resolve(__dirname, '..', '.env.local'),
  path.resolve(MAIN_REPO, '.env.local'),
];
for (const p of envPaths) {
  if (fs.existsSync(p)) { require('dotenv').config({ path: p }); break; }
}

const { createClient } = require('@supabase/supabase-js');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;

let supabase;

const NON_CMS_CATEGORIES = ['Assisted Living', 'Memory Care', 'Home Care (Non-medical)', 'Independent Living'];

const DESC_TEMPLATES = {
  'Assisted Living': { article: 'an', desc: 'assisted living community offering personal care support and daily living assistance' },
  'Memory Care': { article: 'a', desc: 'memory care community providing specialized support for individuals with Alzheimer\'s and dementia' },
  'Nursing Home': { article: 'a', desc: 'skilled nursing facility providing 24-hour medical care and rehabilitation services' },
  'Home Health Care': { article: 'a', desc: 'home health care agency delivering skilled nursing and therapeutic services in the comfort of home' },
  'Home Care (Non-medical)': { article: 'a', desc: 'non-medical home care provider offering companionship, personal care, and daily living support' },
  'Independent Living': { article: 'an', desc: 'independent living community designed for active seniors seeking a maintenance-free lifestyle' },
};

// ---------------------------------------------------------------------------
// CLI Parsing
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { city: null, state: null, run: false, stream: null };

  const positional = [];
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--run': opts.run = true; break;
      case '--stream': opts.stream = args[++i]; break;
      case '--help': case '-h': printUsage(); process.exit(0);
      default:
        if (!args[i].startsWith('-')) positional.push(args[i]);
    }
  }

  // Support multi-word cities: all positional args except last = city, last = state
  if (positional.length >= 2) {
    opts.state = positional.pop();
    opts.city = positional.join(' ');
  }

  return opts;
}

function printUsage() {
  console.log(`
Standalone City Enrichment — Fill gaps for existing providers

Usage:
  node scripts/enrich-city.js <city> <state>                  # dry-run
  node scripts/enrich-city.js <city> <state> --run             # execute all
  node scripts/enrich-city.js <city> <state> --run --stream X  # single stream

Streams: desc, reviews, trust, snippets, images

Options:
  --run              Execute enrichment (default: dry-run only)
  --stream <name>    Run a single stream only
  -h, --help         Show this help

Examples:
  node scripts/enrich-city.js Medford MA
  node scripts/enrich-city.js "New Rochelle" NY --run
  node scripts/enrich-city.js Greenburgh NY --run --stream trust
`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchWithRetry(url, opts = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try { return await fetch(url, opts); }
    catch (err) {
      if (i === retries - 1) throw err;
      const delay = 2000 * (i + 1);
      console.log(`  [retry ${i + 1}/${retries}] fetch failed (${err.cause?.code || err.message}), waiting ${delay}ms...`);
      await sleep(delay);
    }
  }
}

class CostTracker {
  constructor() { this.google = 0; this.perplexity = 0; this.startTime = Date.now(); }
  addGoogle(n = 1) { this.google += n; }
  addPerplexity(n = 1) { this.perplexity += n; }
  get cost() { return (this.google * 32) / 1000 + this.perplexity * 0.005; }
  get elapsed() { return (Date.now() - this.startTime) / 1000; }
  summary() {
    const s = this.elapsed;
    const t = s < 60 ? `${Math.round(s)}s` : s < 3600 ? `${(s / 60).toFixed(1)}m` : `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m`;
    return `$${this.cost.toFixed(2)} (${this.google} Google, ${this.perplexity} Perplexity, ${t})`;
  }
}

const cost = new CostTracker();

// ---------------------------------------------------------------------------
// Provider Query — by city+state columns (NOT provider_id prefix)
// ---------------------------------------------------------------------------

async function getProviders(city, state) {
  const all = [];
  let offset = 0;
  const PAGE = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('olera-providers')
      .select('*')
      .ilike('city', city)
      .ilike('state', state)
      .or('deleted.is.null,deleted.eq.false')
      .range(offset, offset + PAGE - 1);

    if (error) throw new Error(`Fetch error: ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    offset += data.length;
  }

  return all;
}

// ---------------------------------------------------------------------------
// Gap Analysis
// ---------------------------------------------------------------------------

function analyzeGaps(providers) {
  const gaps = {
    desc: providers.filter(p => !p.provider_description && DESC_TEMPLATES[p.provider_category]),
    reviews: providers.filter(p => p.google_rating && !p.google_reviews_data?.rating),
    trust: providers.filter(p => NON_CMS_CATEGORIES.includes(p.provider_category) && !p.ai_trust_signals),
    snippets: providers.filter(p => p.place_id && p.google_reviews_data && (!p.google_reviews_data.reviews || p.google_reviews_data.reviews.length === 0)),
    images: providers.filter(p => p.place_id && !p.provider_images),
  };
  return gaps;
}

function estimateCost(gaps) {
  return {
    desc: { count: gaps.desc.length, cost: 0 },
    reviews: { count: gaps.reviews.length, cost: 0 },
    trust: { count: gaps.trust.length, cost: Math.ceil(gaps.trust.length) * 0.005 },
    snippets: { count: gaps.snippets.length, cost: gaps.snippets.length * 0.032 },
    images: { count: gaps.images.length, cost: gaps.images.length * 0.064 },
  };
}

function printGapReport(providers, gaps, estimates) {
  console.log(`  Total active providers: ${providers.length}`);
  console.log(`  Category breakdown:`);
  const cats = {};
  for (const p of providers) cats[p.provider_category] = (cats[p.provider_category] || 0) + 1;
  for (const [k, v] of Object.entries(cats).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k}: ${v}`);
  }

  console.log(`\n  ${'Stream'.padEnd(20)} ${'Need'.padEnd(8)} ${'Est. Cost'.padEnd(12)} Notes`);
  console.log(`  ${'-'.repeat(60)}`);

  const rows = [
    ['Descriptions', estimates.desc, 'Template-based, instant'],
    ['Reviews hydration', estimates.reviews, 'Local JSONB populate'],
    ['Trust signals', estimates.trust, `Perplexity, ${NON_CMS_CATEGORIES.length} non-CMS categories`],
    ['Review snippets', estimates.snippets, 'Google Places API'],
    ['Images', estimates.images, 'Google Places + photo URI (2 calls each)'],
  ];

  let totalCost = 0;
  for (const [name, est, note] of rows) {
    totalCost += est.cost;
    const costStr = est.cost === 0 ? 'free' : `$${est.cost.toFixed(2)}`;
    console.log(`  ${name.padEnd(20)} ${String(est.count).padEnd(8)} ${costStr.padEnd(12)} ${note}`);
  }

  console.log(`  ${'-'.repeat(60)}`);
  console.log(`  ${'TOTAL'.padEnd(20)} ${String(Object.values(estimates).reduce((s, e) => s + e.count, 0)).padEnd(8)} $${totalCost.toFixed(2)}`);

  return totalCost;
}

// ---------------------------------------------------------------------------
// Enrichment Streams
// ---------------------------------------------------------------------------

async function enrichDescriptions(providers, gaps) {
  const need = gaps.desc;
  if (need.length === 0) return 0;
  console.log(`\n  [Descriptions] ${need.length} providers...`);
  let count = 0;

  for (const p of need) {
    const tmpl = DESC_TEMPLATES[p.provider_category];
    if (!tmpl) continue;

    let desc = `${p.provider_name} is ${tmpl.article} ${tmpl.desc} located in ${p.city}, ${p.state}.`;
    if (p.google_rating && parseFloat(p.google_rating) >= 3.0) {
      desc += ` The community is rated ${p.google_rating} out of 5 stars on Google.`;
    }

    await supabase.from('olera-providers').update({ provider_description: desc }).eq('provider_id', p.provider_id);
    count++;
  }

  console.log(`  [Descriptions] Done: ${count} written`);
  return count;
}

async function hydrateReviews(providers, gaps) {
  const need = gaps.reviews;
  if (need.length === 0) return 0;
  console.log(`  [Reviews Data] ${need.length} providers...`);
  let count = 0;

  for (const p of need) {
    const reviewData = {
      rating: parseFloat(p.google_rating),
      review_count: parseInt(p.review_count || '0') || 0,
      reviews: [],
      last_synced: new Date().toISOString(),
    };
    await supabase.from('olera-providers').update({ google_reviews_data: reviewData }).eq('provider_id', p.provider_id);
    count++;
  }

  console.log(`  [Reviews Data] Done: ${count} hydrated`);
  return count;
}

async function enrichTrustSignals(providers, gaps) {
  const need = gaps.trust;
  if (need.length === 0 || !PERPLEXITY_API_KEY) return { confirmed: 0, deleted: 0 };
  console.log(`  [Trust Signals] ${need.length} non-CMS providers...`);

  let confirmed = 0, deleted = 0;

  for (let i = 0; i < need.length; i++) {
    const p = need[i];

    const prompt = `Search the web for this business and answer two questions.

Provider: ${p.provider_name}
Location: ${p.address || ''}, ${p.city}, ${p.state}
Listed Category: ${p.provider_category}
Website: ${p.website || 'unknown'}

QUESTION 1 — ENTITY VERIFICATION
Based on what you find on the web, what does this business ACTUALLY do?

Is its PRIMARY BUSINESS one of these senior care types?
- Residential senior living (assisted living, memory care, independent living for seniors)
- In-home senior care (home health, non-medical home care, hospice)
- Dedicated senior program (adult day care, geriatric care management)

Mark is_senior_care = FALSE if it is:
- A wedding venue, event space, or banquet hall
- A community recreation center, YMCA, or activity center
- A general medical clinic, therapy practice, or mental health provider
- A durable medical equipment supplier or medical supply store
- Retail, construction, IT, food service, or any non-care business
- A nonprofit or government service not specific to senior care
- A general apartment complex (not senior-specific independent living)
- A childcare/daycare center (not adult day care)

Also verify LOCATION: Is this business actually in ${p.city}, ${p.state}?

QUESTION 2 — TRUST SIGNALS (only if is_senior_care = true)
Verify these 8 signals:
1. state_licensed 2. accredited 3. bbb_rated 4. years_in_operation
5. regulatory_actions 6. active_website 7. google_business 8. community_presence

Return ONLY this JSON:
{
  "is_senior_care": true/false,
  "entity_reason": "What this business actually is",
  "signals": {"state_licensed": true, ...},
  "confidence": "high/medium/low"
}`;

    try {
      const resp = await fetchWithRetry('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${PERPLEXITY_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'sonar', messages: [{ role: 'user', content: prompt }], temperature: 0.1 }),
      });
      cost.addPerplexity();

      const data = await resp.json();
      const content = data.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*"is_senior_care"[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (!parsed.is_senior_care) {
          await supabase.from('olera-providers')
            .update({ deleted: true, deleted_at: new Date().toISOString() })
            .eq('provider_id', p.provider_id);
          deleted++;
          console.log(`    [DELETED] ${p.provider_name}: ${parsed.entity_reason}`);
        } else {
          const signals = parsed.signals || {};
          signals.verified_at = new Date().toISOString();
          signals.confidence = parsed.confidence || 'medium';
          signals.entity_reason = parsed.entity_reason;
          await supabase.from('olera-providers')
            .update({ ai_trust_signals: signals })
            .eq('provider_id', p.provider_id);
          confirmed++;
        }
      }
    } catch (err) {
      console.log(`    Error: ${p.provider_name}: ${err.message}`);
    }

    await sleep(300);
    if ((i + 1) % 10 === 0 || i === need.length - 1) {
      process.stdout.write(`  [Trust Signals] ${i + 1}/${need.length} | ${confirmed} confirmed, ${deleted} deleted | ${cost.summary()}\r`);
    }
  }

  console.log(`\n  [Trust Signals] Done: ${confirmed} confirmed, ${deleted} deleted`);
  return { confirmed, deleted };
}

async function enrichReviewSnippets(providers) {
  // Re-fetch to get updated google_reviews_data after hydration
  const fresh = await getProviders(providers[0]?.city || '', providers[0]?.state || '');
  const need = fresh.filter(p =>
    p.place_id && p.google_reviews_data &&
    (!p.google_reviews_data.reviews || p.google_reviews_data.reviews.length === 0)
  );

  if (need.length === 0 || !GOOGLE_API_KEY) return 0;
  console.log(`  [Review Snippets] ${need.length} providers...`);
  let fetched = 0, empty = 0;

  for (let i = 0; i < need.length; i++) {
    const p = need[i];
    try {
      const resp = await fetchWithRetry(
        `https://places.googleapis.com/v1/places/${p.place_id}?fields=reviews&key=${GOOGLE_API_KEY}`
      );
      cost.addGoogle();
      const data = await resp.json();

      if (data.reviews?.length > 0) {
        const snippets = data.reviews.slice(0, 5).map(r => ({
          text: r.text?.text || '',
          rating: r.rating || 0,
          author_name: r.authorAttribution?.displayName || '',
          time: r.publishTime || '',
          relative_time: r.relativePublishTimeDescription || '',
        }));

        const { data: current } = await supabase
          .from('olera-providers')
          .select('google_reviews_data')
          .eq('provider_id', p.provider_id)
          .single();

        const existing = current?.google_reviews_data || {};
        existing.reviews = snippets;
        existing.last_synced = new Date().toISOString();

        await supabase.from('olera-providers').update({ google_reviews_data: existing }).eq('provider_id', p.provider_id);
        fetched++;
      } else {
        empty++;
      }
    } catch (err) { empty++; }

    await sleep(100);
    if ((i + 1) % 20 === 0 || i === need.length - 1) {
      process.stdout.write(`  [Review Snippets] ${i + 1}/${need.length} | ${fetched} fetched | ${cost.summary()}\r`);
    }
  }

  console.log(`\n  [Review Snippets] Done: ${fetched} fetched, ${empty} empty`);
  return fetched;
}

async function enrichImages(providers, gaps) {
  const need = gaps.images;
  if (need.length === 0 || !GOOGLE_API_KEY) return 0;
  console.log(`  [Images] ${need.length} providers...`);
  let fetched = 0, noPhotos = 0;

  for (let i = 0; i < need.length; i++) {
    const p = need[i];
    try {
      const resp = await fetchWithRetry(
        `https://places.googleapis.com/v1/places/${p.place_id}?fields=photos&key=${GOOGLE_API_KEY}`
      );
      cost.addGoogle();
      const data = await resp.json();

      if (data.photos?.length > 0) {
        const photoName = data.photos[0].name;
        const mediaResp = await fetchWithRetry(
          `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=800&key=${GOOGLE_API_KEY}&skipHttpRedirect=true`
        );
        cost.addGoogle();
        const mediaData = await mediaResp.json();

        if (mediaData.photoUri) {
          await supabase.from('olera-providers').update({ provider_images: mediaData.photoUri }).eq('provider_id', p.provider_id);
          fetched++;
        } else { noPhotos++; }
      } else { noPhotos++; }
    } catch (err) { noPhotos++; }

    await sleep(100);
    if ((i + 1) % 20 === 0 || i === need.length - 1) {
      process.stdout.write(`  [Images] ${i + 1}/${need.length} | ${fetched} fetched | ${cost.summary()}\r`);
    }
  }

  console.log(`\n  [Images] Done: ${fetched} fetched, ${noPhotos} no photos`);
  return fetched;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs();

  if (!opts.city || !opts.state) {
    printUsage();
    process.exit(1);
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('ERROR: Missing SUPABASE env vars. Run: cd ~/Desktop/olera-web && npx vercel env pull .env.local');
    process.exit(1);
  }
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  console.log(`\n${'='.repeat(70)}`);
  console.log(`ENRICH CITY: ${opts.city}, ${opts.state}${opts.run ? '' : ' (DRY RUN)'}`);
  console.log(`${'='.repeat(70)}\n`);

  // Query providers
  console.log('  Querying providers by city + state columns...');
  const providers = await getProviders(opts.city, opts.state);

  if (providers.length === 0) {
    console.log(`  No active providers found for ${opts.city}, ${opts.state}`);
    console.log('  (Searched by city+state columns, case-insensitive)');
    process.exit(0);
  }

  // Gap analysis
  const gaps = analyzeGaps(providers);
  const estimates = estimateCost(gaps);

  console.log('');
  const totalCost = printGapReport(providers, gaps, estimates);

  if (!opts.run) {
    console.log(`\n  This is a dry run. To execute, add --run:`);
    console.log(`  node scripts/enrich-city.js "${opts.city}" ${opts.state} --run`);
    if (opts.stream) console.log(`  node scripts/enrich-city.js "${opts.city}" ${opts.state} --run --stream ${opts.stream}`);
    console.log('');
    process.exit(0);
  }

  // Execute enrichment
  const validStreams = ['desc', 'reviews', 'trust', 'snippets', 'images'];
  if (opts.stream && !validStreams.includes(opts.stream)) {
    console.error(`\n  Unknown stream: ${opts.stream}. Valid: ${validStreams.join(', ')}`);
    process.exit(1);
  }

  const shouldRun = (name) => !opts.stream || opts.stream === name;

  // Phase 1: Parallel (desc, reviews, trust, images)
  console.log(`\n  Phase 1: Parallel enrichment...`);
  const phase1 = [];
  if (shouldRun('desc')) phase1.push(enrichDescriptions(providers, gaps));
  if (shouldRun('reviews')) phase1.push(hydrateReviews(providers, gaps));
  if (shouldRun('trust')) phase1.push(enrichTrustSignals(providers, gaps));
  if (shouldRun('images')) phase1.push(enrichImages(providers, gaps));
  await Promise.all(phase1);

  // Phase 2: Snippets (after reviews hydration)
  if (shouldRun('snippets')) {
    console.log(`\n  Phase 2: Review snippets (after hydration)...`);
    await enrichReviewSnippets(providers);
  }

  // Final summary
  const finalProviders = await getProviders(opts.city, opts.state);
  const finalGaps = analyzeGaps(finalProviders);

  console.log(`\n${'='.repeat(70)}`);
  console.log(`ENRICHMENT COMPLETE: ${opts.city}, ${opts.state}`);
  console.log(`${'='.repeat(70)}`);
  console.log(`  Providers: ${finalProviders.length} active`);
  console.log(`  Remaining gaps: desc=${finalGaps.desc.length}, reviews=${finalGaps.reviews.length}, trust=${finalGaps.trust.length}, snippets=${finalGaps.snippets.length}, images=${finalGaps.images.length}`);
  console.log(`  Cost: ${cost.summary()}`);
  console.log(`${'='.repeat(70)}\n`);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
