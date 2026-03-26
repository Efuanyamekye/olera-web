#!/usr/bin/env node
/**
 * City Enrichment Pipeline
 * Runs all enrichment steps in parallel for a city's providers:
 *   - Rich descriptions
 *   - Hydrate Google Reviews Data
 *   - Review snippets
 *   - Trust signals + entity verification (non-CMS)
 *   - Fetch images
 *
 * Usage: node scripts/enrich-city.js <city> <state>
 * Example: node scripts/enrich-city.js Greenburgh NY
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ============================================================================
// Fetch all providers for city
// ============================================================================

async function getProviders(city, state) {
  const citySlug = city.toLowerCase().replace(/\s+/g, '-');
  const stateSlug = state.toLowerCase();
  const prefix = `${citySlug}-${stateSlug}-`;

  const { data, error } = await supabase
    .from('olera-providers')
    .select('*')
    .like('provider_id', `${prefix}%`)
    .or('deleted.is.null,deleted.eq.false');

  if (error) throw new Error(`Fetch error: ${error.message}`);
  return data || [];
}

// ============================================================================
// 1. Rich Descriptions
// ============================================================================

const DESCRIPTION_TEMPLATES = {
  'Assisted Living': { article: 'an', desc: 'assisted living community offering personal care support and daily living assistance' },
  'Memory Care': { article: 'a', desc: 'memory care community providing specialized support for individuals with Alzheimer\'s and dementia' },
  'Nursing Home': { article: 'a', desc: 'skilled nursing facility providing 24-hour medical care and rehabilitation services' },
  'Home Health Care': { article: 'a', desc: 'home health care agency delivering skilled nursing and therapeutic services in the comfort of home' },
  'Home Care (Non-medical)': { article: 'a', desc: 'non-medical home care provider offering companionship, personal care, and daily living support' },
  'Independent Living': { article: 'an', desc: 'independent living community designed for active seniors seeking a maintenance-free lifestyle' },
};

async function enrichDescriptions(providers) {
  console.log('[Descriptions] Starting...');
  let count = 0;
  const needDesc = providers.filter(p => !p.provider_description);

  for (const p of needDesc) {
    const tmpl = DESCRIPTION_TEMPLATES[p.provider_category];
    if (!tmpl) continue;

    let desc = `${p.provider_name} is ${tmpl.article} ${tmpl.desc} located in ${p.city}, ${p.state}.`;
    if (p.google_rating && p.google_rating >= 3.0) {
      desc += ` It has a ${p.google_rating}-star rating on Google.`;
    }

    await supabase
      .from('olera-providers')
      .update({ provider_description: desc })
      .eq('provider_id', p.provider_id);
    count++;
  }

  console.log(`[Descriptions] Done: ${count} written`);
  return count;
}

// ============================================================================
// 2. Hydrate Google Reviews Data
// ============================================================================

async function hydrateReviews(providers) {
  console.log('[Reviews Data] Starting...');
  let count = 0;
  const need = providers.filter(p => !p.google_reviews_data && p.google_rating);

  const BATCH = 50;
  for (let i = 0; i < need.length; i += BATCH) {
    const batch = need.slice(i, i + BATCH);
    const updates = batch.map(p => ({
      provider_id: p.provider_id,
      google_reviews_data: {
        rating: parseFloat(p.google_rating),
        review_count: parseInt(p.review_count || '0') || 0,
        reviews: [],
        last_synced: new Date().toISOString()
      }
    }));

    for (const u of updates) {
      await supabase
        .from('olera-providers')
        .update({ google_reviews_data: u.google_reviews_data })
        .eq('provider_id', u.provider_id);
      count++;
    }
  }

  console.log(`[Reviews Data] Done: ${count} hydrated`);
  return count;
}

// ============================================================================
// 3. Review Snippets (Google Places API)
// ============================================================================

async function enrichReviewSnippets(providers) {
  console.log('[Review Snippets] Starting...');
  let fetched = 0;
  let empty = 0;

  const need = providers.filter(p => {
    if (!p.place_id) return false;
    const rd = p.google_reviews_data;
    if (!rd) return false;
    return !rd.reviews || rd.reviews.length === 0;
  });

  for (let i = 0; i < need.length; i++) {
    const p = need[i];
    try {
      const resp = await fetch(
        `https://places.googleapis.com/v1/places/${p.place_id}?fields=reviews&key=${GOOGLE_API_KEY}`,
        { headers: { 'X-Goog-FieldMask': 'reviews' } }
      );
      const data = await resp.json();

      if (data.reviews && data.reviews.length > 0) {
        const snippets = data.reviews.slice(0, 5).map(r => ({
          text: r.text?.text || '',
          rating: r.rating || 0,
          author_name: r.authorAttribution?.displayName || '',
          time: r.publishTime || '',
          relative_time: r.relativePublishTimeDescription || ''
        }));

        // Read current google_reviews_data to avoid overwriting rating/review_count
        const { data: current } = await supabase
          .from('olera-providers')
          .select('google_reviews_data')
          .eq('provider_id', p.provider_id)
          .single();

        const existing = current?.google_reviews_data || {};
        const updated = {
          ...existing,
          reviews: snippets,
          last_synced: new Date().toISOString()
        };

        await supabase
          .from('olera-providers')
          .update({ google_reviews_data: updated })
          .eq('provider_id', p.provider_id);
        fetched++;
      } else {
        empty++;
      }
    } catch (err) {
      // Skip on error
    }

    await sleep(200);
    if (i % 20 === 0) process.stdout.write(`[Review Snippets] ${i + 1}/${need.length}\r`);
  }

  console.log(`[Review Snippets] Done: ${fetched} fetched, ${empty} empty     `);
  return fetched;
}

// ============================================================================
// 4. Trust Signals + Entity Verification (non-CMS only)
// ============================================================================

const NON_CMS_CATEGORIES = ['Assisted Living', 'Memory Care', 'Home Care (Non-medical)', 'Independent Living'];

async function enrichTrustSignals(providers) {
  console.log('[Trust Signals] Starting...');
  const need = providers.filter(p =>
    NON_CMS_CATEGORIES.includes(p.provider_category) && !p.ai_trust_signals
  );

  let confirmed = 0;
  let deleted = 0;

  for (let i = 0; i < need.length; i++) {
    const p = need[i];

    const prompt = `Search the web for this business and answer two questions.

Provider: ${p.provider_name}
Location: ${p.address}, ${p.city}, ${p.state}
Listed Category: ${p.provider_category}
Website: ${p.website || 'unknown'}

QUESTION 1 — ENTITY VERIFICATION
Based on what you find on the web (their website, reviews, directory listings, business registrations), what does this business ACTUALLY do?

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
1. state_licensed — Licensed by state?
2. accredited — Joint Commission, CHAP, CARF, or ACHC?
3. bbb_rated — BBB profile/rating?
4. years_in_operation — When founded?
5. regulatory_actions — Any violations?
6. active_website — Active website with real content?
7. google_business — Google Business Profile?
8. community_presence — Social media, directories?

Return ONLY this JSON:
{
  "is_senior_care": true/false,
  "entity_reason": "What this business actually is",
  "signals": [only if is_senior_care=true],
  "confidence": "high/medium/low"
}`;

    try {
      const resp = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'sonar',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1
        })
      });

      const data = await resp.json();
      const content = data.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*"is_senior_care"[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        if (!parsed.is_senior_care) {
          // Soft-delete false positive
          await supabase
            .from('olera-providers')
            .update({ deleted: true, deleted_at: new Date().toISOString() })
            .eq('provider_id', p.provider_id);
          deleted++;
          console.log(`  [DELETED] ${p.provider_name}: ${parsed.entity_reason}`);
        } else {
          // Save trust signals
          const signals = {
            verified_at: new Date().toISOString(),
            confidence: parsed.confidence || 'medium',
            entity_reason: parsed.entity_reason,
            signals: parsed.signals || [],
          };

          await supabase
            .from('olera-providers')
            .update({ ai_trust_signals: signals })
            .eq('provider_id', p.provider_id);
          confirmed++;
        }
      }
    } catch (err) {
      console.log(`  Trust signal error for ${p.provider_name}: ${err.message}`);
    }

    await sleep(300);
    if (i % 10 === 0) process.stdout.write(`[Trust Signals] ${i + 1}/${need.length}\r`);
  }

  console.log(`[Trust Signals] Done: ${confirmed} confirmed, ${deleted} deleted     `);
  return { confirmed, deleted };
}

// ============================================================================
// 5. Fetch Images
// ============================================================================

async function enrichImages(providers) {
  console.log('[Images] Starting...');
  const need = providers.filter(p => !p.provider_images && p.place_id);
  let fetched = 0;
  let noPhotos = 0;

  for (let i = 0; i < need.length; i++) {
    const p = need[i];

    try {
      // Get photo references
      const resp = await fetch(
        `https://places.googleapis.com/v1/places/${p.place_id}?fields=photos&key=${GOOGLE_API_KEY}`,
        { headers: { 'X-Goog-FieldMask': 'photos' } }
      );
      const data = await resp.json();

      if (data.photos && data.photos.length > 0) {
        const photoName = data.photos[0].name;

        // Resolve to permanent URL
        const mediaResp = await fetch(
          `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=800&key=${GOOGLE_API_KEY}&skipHttpRedirect=true`
        );
        const mediaData = await mediaResp.json();

        if (mediaData.photoUri) {
          await supabase
            .from('olera-providers')
            .update({ provider_images: mediaData.photoUri })
            .eq('provider_id', p.provider_id);
          fetched++;
        } else {
          noPhotos++;
        }
      } else {
        noPhotos++;
      }
    } catch (err) {
      noPhotos++;
    }

    await sleep(200);
    if (i % 20 === 0) process.stdout.write(`[Images] ${i + 1}/${need.length}\r`);
  }

  console.log(`[Images] Done: ${fetched} fetched, ${noPhotos} no photos     `);
  return fetched;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const [city, state] = process.argv.slice(2);
  if (!city || !state) {
    console.log('Usage: node scripts/enrich-city.js <city> <state>');
    process.exit(1);
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`ENRICHING: ${city}, ${state}`);
  console.log(`${'='.repeat(70)}\n`);

  const providers = await getProviders(city, state);
  console.log(`Found ${providers.length} active providers\n`);

  if (providers.length === 0) {
    console.log('No providers to enrich.');
    return;
  }

  // Run all enrichment steps in parallel
  // IMPORTANT: hydrate reviews data FIRST, then snippets (to avoid race condition)
  console.log('Phase 1: Descriptions + Reviews Data + Trust Signals + Images (parallel)...\n');

  const [descCount, reviewCount, trustResult, imageCount] = await Promise.all([
    enrichDescriptions(providers),
    hydrateReviews(providers),
    enrichTrustSignals(providers),
    enrichImages(providers),
  ]);

  // Phase 2: Review snippets AFTER hydration (avoids JSONB race condition)
  console.log('\nPhase 2: Review snippets (after hydration)...\n');

  // Re-fetch providers to get updated google_reviews_data
  const updatedProviders = await getProviders(city, state);
  const snippetCount = await enrichReviewSnippets(updatedProviders);

  // Summary
  console.log(`\n${'='.repeat(70)}`);
  console.log(`ENRICHMENT COMPLETE: ${city}, ${state}`);
  console.log(`${'='.repeat(70)}`);
  console.log(`  Descriptions: ${descCount}`);
  console.log(`  Reviews hydrated: ${reviewCount}`);
  console.log(`  Review snippets: ${snippetCount}`);
  console.log(`  Trust signals: ${trustResult.confirmed} confirmed, ${trustResult.deleted} false positives deleted`);
  console.log(`  Images: ${imageCount}`);

  // Final count
  const finalProviders = await getProviders(city, state);
  console.log(`  Final active providers: ${finalProviders.length}`);
  console.log(`${'='.repeat(70)}\n`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
