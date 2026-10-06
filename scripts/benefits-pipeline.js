#!/usr/bin/env node

/**
 * Senior Benefits Pipeline — Content Production System
 *
 * Full lifecycle: discovers programs, researches them deeply, classifies
 * their type and complexity, generates page content drafts, and produces
 * human-readable reports. The taxonomy emerges from exploration.
 *
 * Usage:
 *   node scripts/benefits-pipeline.js --state TX                  # dry-run
 *   node scripts/benefits-pipeline.js --state MI --run             # full pipeline
 *   node scripts/benefits-pipeline.js --state MI --phase explore   # explore only
 *   node scripts/benefits-pipeline.js --state MI --phase draft --run # draft only
 *
 * Phases:
 *   explore   — Survey the landscape: what programs exist?
 *   dive      — Deep dive each program: what data matters?
 *   compare   — Cross-reference with our existing data, surface diffs
 *   classify  — Determine program type, geographic scope, complexity
 *   draft     — Generate structured page content (requires ANTHROPIC_API_KEY)
 *   report    — Generate human-readable markdown report
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

/** Make high-severity lint findings fatal. Off by default because
 *  benefits-batch.js reads a non-zero exit as a FAILED state. */
const LINT_STRICT = process.argv.includes("--lint-strict");

// ─── Worktree-compatible env loading ────────────────────────────────────────

const MAIN_REPO = path.resolve(process.env.HOME, "Desktop/olera-web");
module.paths.unshift(path.join(MAIN_REPO, "node_modules"));

const envPaths = [
  path.resolve(__dirname, "..", ".env.local"),
  path.resolve(MAIN_REPO, ".env.local"),
];
for (const p of envPaths) {
  if (fs.existsSync(p)) {
    require("dotenv").config({ path: p });
    break;
  }
}

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;

// ─── CLI Parsing ────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { state: null, region: null, parentState: null, phase: "all", run: false, regenAll: false };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--state": opts.state = args[++i]?.toUpperCase(); break;
      case "--region": opts.region = args[++i]; break;
      case "--parent-state": opts.parentState = args[++i]?.toUpperCase(); break;
      case "--phase": opts.phase = args[++i]; break;
      case "--run":   opts.run = true; break;
      case "--regen-index":
      case "--regen-all": opts.regenAll = true; break;
      case "--help": case "-h": printUsage(); process.exit(0);
      default:
        if (!args[i].startsWith("-")) opts.state = opts.state || args[i].toUpperCase();
    }
  }
  return opts;
}

/**
 * Slugify a region name for directory/URL use.
 * "Miami-Dade County, FL" → "miami-dade-county-fl"
 * "Greater Houston" → "greater-houston"
 */
function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Resolve --state or --region into a unified entity object.
 * Everything downstream uses entity.name, entity.slug, entity.parentState.
 */
function resolveEntity(opts) {
  if (opts.region) {
    // Freeform region
    const slug = slugify(opts.region);
    const parentState = opts.parentState || null;
    const parentStateName = parentState ? STATE_NAMES[parentState] : null;
    return {
      name: opts.region,
      slug,
      dirName: slug,
      isState: false,
      stateCode: parentState,
      parentStateName,
      parentState,
    };
  }
  if (opts.state && STATE_NAMES[opts.state]) {
    // State shorthand: --state MI → entity for "Michigan"
    return {
      name: STATE_NAMES[opts.state],
      slug: STATE_NAMES[opts.state].toLowerCase().replace(/\s+/g, "-"),
      dirName: opts.state, // keep 2-letter code for backwards compat
      isState: true,
      stateCode: opts.state,
      parentStateName: null,
      parentState: null,
    };
  }
  return null;
}

function printUsage() {
  console.log(`
  Senior Benefits Pipeline — Content Production System

  Usage:
    node scripts/benefits-pipeline.js --state MI              # dry-run (state)
    node scripts/benefits-pipeline.js --state MI --run        # full pipeline (state)
    node scripts/benefits-pipeline.js --state MI --phase dive --run

    node scripts/benefits-pipeline.js --region "Miami-Dade County, FL" --parent-state FL --run
    node scripts/benefits-pipeline.js --region "Greater Houston" --parent-state TX --run
    node scripts/benefits-pipeline.js --region "DMV" --run

    node scripts/benefits-pipeline.js --regen-index     # Rebuild all per-state drafts.ts + barrel from drafts.json
    node scripts/benefits-pipeline.js --state CO --run --lint-strict   # Fail the run on high-severity data defects

  Phases:
    explore   Survey the landscape: what programs exist?
    dive      Deep dive: what data matters for each program?
    compare   Cross-reference with our existing data
    classify  Determine program type, geographic scope, complexity
    draft     Generate structured page content (needs ANTHROPIC_API_KEY)
    report    Generate human-readable markdown report
    factcheck Adversarially verify drafted facts against fresh sources

  Options:
    --state XX           US state code (shorthand for --region "State Name")
    --region "Name"      Any geographic entity (county, metro, region, city)
    --parent-state XX    Parent state for comparison data (optional)
    --phase <name>       Run a single phase
    --run                Execute (without this, dry-run only)

  Environment:
    PERPLEXITY_API_KEY   Required for explore + dive phases
    ANTHROPIC_API_KEY    Required for draft phase (content generation)
  `);
}

// ─── State Data ─────────────────────────────────────────────────────────────

const STATE_NAMES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
  ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
  TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
};

// ─── Infrastructure ─────────────────────────────────────────────────────────

class CostTracker {
  constructor() {
    this.perplexity = 0;
    this.startTime = Date.now();
  }
  addPerplexity(n = 1) { this.perplexity += n; }
  get cost() { return this.perplexity * 0.005; }
  get elapsed() { return (Date.now() - this.startTime) / 1000; }
  summary() {
    const s = this.elapsed;
    const t = s < 60 ? `${Math.round(s)}s` : `${(s / 60).toFixed(1)}m`;
    return `$${this.cost.toFixed(3)} (${this.perplexity} calls, ${t})`;
  }
}

const cost = new CostTracker();

class RateLimiter {
  constructor(ms = 300) { this.min = ms; this.last = 0; }
  async wait() {
    const gap = Date.now() - this.last;
    if (gap < this.min) await new Promise((r) => setTimeout(r, this.min - gap));
    this.last = Date.now();
  }
}

// Separate rate limiters for each API to allow concurrent calls across APIs
const perplexityLimiter = new RateLimiter(200);  // 200ms between Perplexity calls
const claudeLimiter = new RateLimiter(8000);      // 8s between Claude calls (8K output tokens/min limit = ~1 call per 30s, but with retries we can be more aggressive)
// Legacy single limiter for backwards compat
const rateLimiter = perplexityLimiter;

/**
 * Run async tasks in batches with concurrency limit.
 * Returns results in original order.
 */
async function runConcurrent(items, fn, concurrency = 5) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function fetchWithRetry(url, opts = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fetch(url, opts);
    } catch (err) {
      if (i === retries - 1) throw err;
      console.log(`  [retry ${i + 1}] ${err.message}`);
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
}

async function perplexityChat(prompt, temperature = 0.1) {
  await perplexityLimiter.wait();
  cost.addPerplexity();

  const resp = await fetchWithRetry("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar",
      messages: [{ role: "user", content: prompt }],
      temperature,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Perplexity ${resp.status}: ${text.slice(0, 200)}`);
  }

  const json = await resp.json();
  return json.choices?.[0]?.message?.content || "";
}

function extractJson(text) {
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) { try { return JSON.parse(arrayMatch[0]); } catch { /* fall through */ } }
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) { try { return JSON.parse(objMatch[0]); } catch { return null; } }
  return null;
}

// ─── Name Normalization & Dedup ──────────────────────────────────────────────

/**
 * Normalize a program name for comparison.
 * Strips state name, common prefixes/suffixes, parentheticals, and whitespace
 * so "MI Choice Medicaid Waiver", "Michigan's Choice Waiver Program", and
 * "MI Choice Program" all become something like "choice waiver".
 */
function normalizeForMatch(name, stateName = "") {
  let n = (name || "").toLowerCase();

  // Remove state name, possessive forms, and abbreviation
  const stateAbbr = Object.entries(STATE_NAMES).find(([, v]) => v === stateName)?.[0]?.toLowerCase() || "";
  const stateLower = (stateName || "").toLowerCase();
  if (stateLower) {
    n = n.replace(new RegExp(`${stateLower}'?s?`, "g"), "");
  }
  if (stateAbbr) n = n.replace(new RegExp(`\\b${stateAbbr}\\b`, "g"), "");

  // Expand common acronyms before stripping
  const acronyms = {
    pace: "all inclusive care elderly",
    snap: "food nutrition",
    liheap: "energy heating",
    scsep: "senior employment",
    ship: "health insurance counseling",
    hcbs: "home community based",
    mmap: "medicare counseling",
  };
  for (const [acr, expansion] of Object.entries(acronyms)) {
    if (n.match(new RegExp(`\\b${acr}\\b`))) {
      n += ` ${expansion}`;
    }
  }

  // Remove common filler words
  const fillers = ["program", "programs", "the", "for", "of", "and", "in", "a", "an", "state", "federal", "services", "service", "assistance"];
  for (const f of fillers) {
    n = n.replace(new RegExp(`\\b${f}\\b`, "g"), "");
  }

  // Remove parenthetical content
  n = n.replace(/\([^)]*\)/g, "");

  // Remove special chars and collapse whitespace
  n = n.replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();

  return n;
}

function deduplicatePrograms(programs, stateName) {
  const result = [];
  const seenNormalized = new Map(); // normalized → index in result

  for (const p of programs) {
    const norm = normalizeForMatch(p.name, stateName);
    if (!norm) continue;

    // Check if any existing normalized name is a subset or superset
    let isDupe = false;
    for (const [existingNorm, existingIdx] of seenNormalized.entries()) {
      if (
        existingNorm === norm ||
        existingNorm.includes(norm) ||
        norm.includes(existingNorm)
      ) {
        // Keep the one with the longer original name (likely more specific)
        if ((p.name || "").length > (result[existingIdx].name || "").length) {
          result[existingIdx] = p;
        }
        isDupe = true;
        break;
      }
    }

    if (!isDupe) {
      seenNormalized.set(norm, result.length);
      result.push(p);
    }
  }

  return result;
}

// ─── File I/O ───────────────────────────────────────────────────────────────

function pipelineDir(dirName) {
  const dir = path.resolve(__dirname, "..", "data", "pipeline", dirName);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeFile(dirName, filename, content) {
  const filepath = path.join(pipelineDir(dirName), filename);
  fs.writeFileSync(filepath, typeof content === "string" ? content : JSON.stringify(content, null, 2));
  console.log(`  → ${filepath}`);
}

function readJson(dirName, filename) {
  const filepath = path.join(pipelineDir(dirName), filename);
  if (!fs.existsSync(filepath)) return null;
  return JSON.parse(fs.readFileSync(filepath, "utf-8"));
}

// ─── Load Existing Programs ─────────────────────────────────────────────────

function loadExistingPrograms(stateCode) {
  try {
    const waiverPath = path.resolve(__dirname, "..", "data", "waiver-library.ts");
    const content = fs.readFileSync(waiverPath, "utf-8");
    const stateName = STATE_NAMES[stateCode];
    if (!stateName) return [];

    const stateSection = getStateSection(content, stateCode);
    if (!stateSection) return [];

    const programs = [];
    const blockRegex = /\{\s*\n\s{4}id:\s*"([^"]+)",\s*\n\s{4}name:\s*"([^"]+)",/g;
    let match;
    while ((match = blockRegex.exec(stateSection)) !== null) {
      const blockStart = match.index;
      const blockEnd = stateSection.indexOf("\n  },", blockStart);
      const block = stateSection.slice(blockStart, blockEnd > 0 ? blockEnd : blockStart + 3000);

      const get = (field) => {
        const m = block.match(new RegExp(`${field}:\\s*"([^"]*)"`));
        return m?.[1] || null;
      };

      const getArray = (field) => {
        const m = block.match(new RegExp(`${field}:\\s*\\[([^\\]]*)\\]`, "s"));
        if (!m) return [];
        return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
      };

      programs.push({
        id: match[1],
        name: match[2],
        shortName: get("shortName"),
        savingsRange: get("savingsRange"),
        description: get("description"),
        sourceUrl: get("sourceUrl"),
        lastVerifiedDate: get("lastVerifiedDate"),
        verifiedBy: get("verifiedBy"),
        savingsSource: get("savingsSource"),
        phone: get("phone"),
        eligibilityHighlights: getArray("eligibilityHighlights"),
      });
    }
    return programs;
  } catch (err) {
    console.log(`  Error loading existing programs: ${err.message}`);
    return [];
  }
}

function getStateSection(content, stateCode) {
  const stateName = STATE_NAMES[stateCode];
  if (!stateName) return null;
  const headerRegex = new RegExp(`// ─── ${stateName} ─+\\n\\n`, "i");
  const headerMatch = content.match(headerRegex);
  if (!headerMatch) return null;
  const startIdx = headerMatch.index;
  const nextHeaderRegex = /\n\/\/ ─── [A-Z][a-z]+ ─+/g;
  nextHeaderRegex.lastIndex = startIdx + headerMatch[0].length;
  const nextMatch = nextHeaderRegex.exec(content);
  return content.slice(startIdx, nextMatch ? nextMatch.index : content.length);
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 1: EXPLORE — Survey the landscape
// ═══════════════════════════════════════════════════════════════════════════

async function phaseExplore(entity) {
  console.log(`\n  ━━━ EXPLORE: What programs exist in ${entity.name}? ━━━\n`);

  let federalPrompt, localPrompt;

  if (entity.isState) {
    // State-level: original two-query approach
    federalPrompt = `What are the major federal senior benefit programs as they are administered in ${entity.name} (${entity.stateCode})? I need the ${entity.name}-specific name for each.

Cover these categories:
- Medicaid for seniors/disabled
- Home and community-based services waiver
- PACE
- Medicare Savings (QMB, SLMB, QI)
- SNAP/food assistance
- LIHEAP/energy assistance
- Weatherization
- Medicare counseling (SHIP)
- Meals on Wheels
- Caregiver/respite support
- Senior employment (SCSEP)
- Legal aid for seniors
- Long-term care ombudsman

For each, give: name (as used in ${entity.name}), what_it_does (2 sentences), who_its_for, official_url, benefit_value.

Return as a JSON array: [{"name":"...","what_it_does":"...","who_its_for":"...","official_url":"...","benefit_value":"..."}]`;

    localPrompt = `What senior benefit programs are unique to ${entity.name} (${entity.stateCode}) — programs that only exist in this state, or state-funded programs beyond the standard federal ones?

Think about: property tax relief, state pharmaceutical assistance, state-funded home care, state energy credits, veteran supplements, senior housing programs, transportation programs, companion programs, anything ${entity.name} offers that not every state has.

For each, give: name, what_it_does (2 sentences), who_its_for, whats_unique, official_url, benefit_value.

Return as a JSON array: [{"name":"...","what_it_does":"...","who_its_for":"...","whats_unique":"...","official_url":"...","benefit_value":"..."}]`;
  } else {
    // Region-level: adapted queries for any geographic entity
    const parentContext = entity.parentStateName
      ? ` (in ${entity.parentStateName})`
      : "";

    federalPrompt = `What senior benefit programs serve people in ${entity.name}${parentContext}? Include:
- Federal programs available in this area (Medicaid, Medicare Savings, SNAP, LIHEAP, PACE, etc.) — use the local name if the program has one
- State-level programs that serve this area
- Any programs with specific offices, providers, or service areas in ${entity.name}

For each, give: name (as used locally), what_it_does (2 sentences), who_its_for, official_url, benefit_value, geographic_notes (any specifics about how this program operates in ${entity.name}).

Return as a JSON array: [{"name":"...","what_it_does":"...","who_its_for":"...","official_url":"...","benefit_value":"...","geographic_notes":"..."}]`;

    localPrompt = `What senior benefit programs are specific to ${entity.name}${parentContext}? I'm looking for:
- County-specific programs or services
- Local Area Agency on Aging programs
- City or municipal senior services
- Regional nonprofits serving seniors
- Local transportation programs for seniors
- Community-based programs unique to ${entity.name}

NOT state-wide programs unless they have a ${entity.name}-specific version or office.

For each, give: name, what_it_does (2 sentences), who_its_for, whats_unique, official_url, benefit_value.

Return as a JSON array: [{"name":"...","what_it_does":"...","who_its_for":"...","whats_unique":"...","official_url":"...","benefit_value":"..."}]`;
  }

  console.log(`  Running 2 explore queries in parallel...`);
  const [fedResponse, localResponse] = await Promise.all([
    perplexityChat(federalPrompt, 0.2),
    perplexityChat(localPrompt, 0.2),
  ]);
  const fedPrograms = extractJson(fedResponse) || [];
  const localPrograms = extractJson(localResponse) || [];
  console.log(`  Found ${fedPrograms.length} general + ${localPrograms.length} local programs`);

  // Merge and deduplicate with semantic normalization
  const allDiscovered = [...fedPrograms, ...localPrograms];
  const programs = deduplicatePrograms(allDiscovered, entity.name);

  if (!programs.length) {
    console.log(`  ERROR: No programs found. Raw response: ${fedResponse.slice(0, 300)}`);
    return { programs: [], raw: fedResponse };
  }

  console.log(`\n  Total unique programs: ${programs.length}\n`);
  for (const p of programs) {
    console.log(`  • ${(p.name || "?").slice(0, 60)}`);
    console.log(`    ${(p.what_it_does || "").slice(0, 100)}`);
    console.log();
  }

  return {
    entity: entity.name,
    entitySlug: entity.slug,
    state: entity.stateCode,
    stateName: entity.isState ? entity.name : entity.parentStateName,
    isRegion: !entity.isState,
    exploredAt: new Date().toISOString(),
    programCount: programs.length,
    programs,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 2: DEEP DIVE — What data matters for each program?
// ═══════════════════════════════════════════════════════════════════════════

async function phaseDive(entity, exploreData) {
  const stateName = entity.name; // used throughout prompts
  console.log(`\n  ━━━ DEEP DIVE: What matters for each program? ━━━\n`);

  const programs = exploreData?.programs || [];
  if (!programs.length) {
    console.log(`  No programs to dive into. Run explore first.`);
    return null;
  }

  const DIVE_CONCURRENCY = 5;
  console.log(`  Diving into ${programs.length} programs (concurrency: ${DIVE_CONCURRENCY})...\n`);
  let completed = 0;

  const results = await runConcurrent(programs, async (prog, i) => {
    const name = prog.name || `Program ${i + 1}`;

    const prompt = `I'm building a comprehensive guide to "${name}" in ${stateName} for families trying to determine if their elderly loved one qualifies and how to apply.

Tell me everything a family needs to know. Don't use a generic template — tell me what's SPECIFIC to this program:

1. ELIGIBILITY: What are the exact requirements? If there are income limits, give the actual dollar amounts. If they vary by household size, give the full table. If there are asset limits, explain what counts and what's exempt. If there's an age requirement, state it.

2. WHAT YOU GET: What does this program actually provide? Be specific — not "healthcare services" but the actual services. If there's a dollar amount or hours per week, state it. If it varies by tier or priority level, explain how.

3. HOW TO APPLY: Step by step. Include the actual phone number to call, the actual website URL to visit, the actual form name/number if there is one. Include multiple application routes if they exist (online, phone, mail, in-person).

4. HOW LONG IT TAKES: Processing time, waitlist, any regional variation in wait times.

5. DOCUMENTS NEEDED: What should someone bring or prepare?

6. REGIONAL VARIATIONS: Does this program work differently in different parts of ${stateName}? Different providers, different offices, different wait times by region?

7. WHAT MAKES THIS DIFFERENT: If someone is comparing this to similar programs, what would they need to know? What's the gotcha or the thing people miss?

Return as JSON:
{
  "name": "${name}",
  "eligibility": {
    "age": <number or null>,
    "income_limits": <describe the full picture — single, couple, household table if applicable>,
    "asset_limits": <describe if applicable, including what counts and what's exempt>,
    "other_requirements": [<list any other requirements>]
  },
  "benefits": {
    "type": "<financial|service|in_kind|advocacy|employment>",
    "value": "<specific dollar amounts, hours, or services>",
    "varies_by": "<household_size|priority_tier|region|fixed|not_applicable>"
  },
  "application": {
    "methods": [<list: online URL, phone number, mail address, in-person office>],
    "processing_time": "<specific timeline>",
    "waitlist": "<description or null>",
    "forms": [<specific form names/numbers>],
    "documents": [<what to bring>]
  },
  "geography": {
    "statewide": <true|false>,
    "restrictions": "<county/region restrictions if any>",
    "regional_variations": "<how it differs by region, or null>",
    "offices_or_providers": [<specific locations if limited>]
  },
  "official_source": "<primary .gov URL>",
  "gotchas": [<things people miss, common mistakes, important caveats>],
  "data_shape_notes": "<what makes this program's data structure unique — e.g., 'benefits scale by household size', 'only available at 3 centers', 'no income test', 'county-restricted'>"
}`;

    try {
      const response = await perplexityChat(prompt);
      const parsed = extractJson(response);
      completed++;
      process.stdout.write(`  [${completed}/${programs.length}] ${name.slice(0, 50).padEnd(50)} ${cost.summary()}\r`);

      if (parsed) {
        parsed._raw = response;
        return parsed;
      } else {
        console.log(`\n  WARN: Could not parse response for "${name}"`);
        return { name, _parseError: true, _raw: response };
      }
    } catch (err) {
      completed++;
      console.log(`\n  ERROR: "${name}": ${err.message}`);
      return { name, _error: err.message };
    }
  }, DIVE_CONCURRENCY);

  console.log(`\n\n  Completed deep dive on ${results.length} programs`);
  console.log(`  Parsed: ${results.filter((r) => !r._parseError && !r._error).length}`);
  console.log(`  Parse errors: ${results.filter((r) => r._parseError).length}`);
  console.log(`  Errors: ${results.filter((r) => r._error).length}`);

  return {
    state: entity.stateCode,
    stateName,
    diveAt: new Date().toISOString(),
    total: results.length,
    parsed: results.filter((r) => !r._parseError && !r._error).length,
    programs: results,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 3: COMPARE — Cross-reference with existing data
// ═══════════════════════════════════════════════════════════════════════════

function phaseCompare(entity, diveData, existingPrograms) {
  const stateCode = entity.stateCode;
  const stateName = entity.name;
  console.log(`\n  ━━━ COMPARE: What's different from our data? ━━━\n`);

  const divePrograms = diveData?.programs?.filter((p) => !p._error && !p._parseError) || [];
  if (!divePrograms.length) {
    console.log(`  No dive data to compare.`);
    return null;
  }

  console.log(`  Comparing ${divePrograms.length} explored programs against ${existingPrograms.length} existing...\n`);

  const comparisons = [];

  for (const explored of divePrograms) {
    const name = explored.name || "Unknown";
    const nameLower = name.toLowerCase();

    // Find matching existing program using normalized names
    const normExplored = normalizeForMatch(name, stateName);
    const existing = existingPrograms.find((e) => {
      const normExisting = normalizeForMatch(e.name, stateName);
      return normExisting === normExplored ||
        normExisting.includes(normExplored) ||
        normExplored.includes(normExisting) ||
        // Also check direct substring on original names
        e.name.toLowerCase().includes(nameLower.slice(0, 20)) ||
        nameLower.includes(e.name.toLowerCase().slice(0, 20));
    });

    const diffs = [];
    const novelFields = [];

    if (existing) {
      // Compare eligibility
      const exploredAge = explored.eligibility?.age;
      const existingAge = existing.eligibilityHighlights
        ?.find((h) => /\d{2}/.test(h))
        ?.match(/(\d{2,3})/)?.[1];

      if (exploredAge && existingAge && String(exploredAge) !== existingAge) {
        diffs.push({
          field: "min_age",
          ours: existingAge,
          found: String(exploredAge),
          source: explored.official_source,
        });
      }

      // Compare income limits
      const exploredIncome = explored.eligibility?.income_limits;
      if (exploredIncome && typeof exploredIncome === "string" && exploredIncome.includes("$")) {
        const existingIncome = existing.eligibilityHighlights
          ?.find((h) => h.includes("$"))
          ?.match(/\$([\d,]+)/)?.[1];
        const foundIncome = exploredIncome.match(/\$([\d,]+)/)?.[1];

        if (existingIncome && foundIncome && existingIncome !== foundIncome) {
          diffs.push({
            field: "income_limit",
            ours: `$${existingIncome}`,
            found: `$${foundIncome}`,
            source: explored.official_source,
          });
        }
      }

      // Compare savings/benefit value
      if (explored.benefits?.value && existing.savingsRange) {
        if (explored.benefits.value !== existing.savingsRange) {
          diffs.push({
            field: "benefit_value",
            ours: existing.savingsRange,
            found: explored.benefits.value,
            source: explored.official_source,
          });
        }
      }

      // Note source URL status
      if (!existing.sourceUrl && explored.official_source) {
        diffs.push({
          field: "source_url",
          ours: "MISSING",
          found: explored.official_source,
        });
      }

      // Check for data our model doesn't capture
      if (explored.eligibility?.asset_limits) {
        novelFields.push({
          field: "asset_limits",
          value: explored.eligibility.asset_limits,
          note: "Our model has no asset limit fields",
        });
      }

      if (explored.benefits?.varies_by === "household_size") {
        novelFields.push({
          field: "household_size_table",
          value: explored.eligibility?.income_limits,
          note: "Benefits/eligibility vary by household size — we store a single number",
        });
      }

      if (explored.geography?.regional_variations) {
        novelFields.push({
          field: "regional_variations",
          value: explored.geography.regional_variations,
          note: "Program varies by region — our model doesn't capture this",
        });
      }

      if (explored.application?.waitlist) {
        novelFields.push({
          field: "waitlist",
          value: explored.application.waitlist,
          note: "Has waitlist info — our model has no wait time field",
        });
      }

      if (explored.application?.documents?.length > 0) {
        novelFields.push({
          field: "documents_required",
          value: explored.application.documents,
          note: "Has document checklist — our model doesn't store per-program documents",
        });
      }
    }

    comparisons.push({
      name,
      isNew: !existing,
      existingId: existing?.id || null,
      existingVerified: existing?.lastVerifiedDate || null,
      diffsFound: diffs.length,
      diffs,
      novelFields,
      dataShapeNotes: explored.data_shape_notes || null,
      gotchas: explored.gotchas || [],
      benefitType: explored.benefits?.type || "unknown",
      benefitVariesBy: explored.benefits?.varies_by || null,
      officialSource: explored.official_source || null,
    });
  }

  // Summary
  const newPrograms = comparisons.filter((c) => c.isNew);
  const withDiffs = comparisons.filter((c) => c.diffsFound > 0);
  const withNovelFields = comparisons.filter((c) => c.novelFields.length > 0);

  console.log(`  New programs not in our data: ${newPrograms.length}`);
  console.log(`  Programs with data discrepancies: ${withDiffs.length}`);
  console.log(`  Programs with data our model can't capture: ${withNovelFields.length}`);

  if (withDiffs.length > 0) {
    console.log(`\n  Data discrepancies:`);
    for (const c of withDiffs) {
      for (const d of c.diffs) {
        console.log(`    ${c.name}: ${d.field} — ours: ${d.ours} → found: ${d.found}`);
      }
    }
  }

  // Collect all novel field types across programs
  const novelFieldSummary = {};
  for (const c of comparisons) {
    for (const nf of c.novelFields) {
      if (!novelFieldSummary[nf.field]) {
        novelFieldSummary[nf.field] = { count: 0, programs: [], note: nf.note };
      }
      novelFieldSummary[nf.field].count++;
      novelFieldSummary[nf.field].programs.push(c.name);
    }
  }

  if (Object.keys(novelFieldSummary).length > 0) {
    console.log(`\n  Data fields our model doesn't capture:`);
    for (const [field, info] of Object.entries(novelFieldSummary)) {
      console.log(`    ${field} (${info.count} programs): ${info.note}`);
    }
  }

  // Collect benefit types and variation patterns
  const benefitTypes = {};
  const variationPatterns = {};
  for (const c of comparisons) {
    benefitTypes[c.benefitType] = (benefitTypes[c.benefitType] || 0) + 1;
    if (c.benefitVariesBy) {
      variationPatterns[c.benefitVariesBy] = (variationPatterns[c.benefitVariesBy] || 0) + 1;
    }
  }

  console.log(`\n  Benefit types found: ${JSON.stringify(benefitTypes)}`);
  console.log(`  Variation patterns: ${JSON.stringify(variationPatterns)}`);

  return {
    state: stateCode,
    stateName,
    comparedAt: new Date().toISOString(),
    total: comparisons.length,
    newPrograms: newPrograms.length,
    withDiffs: withDiffs.length,
    withNovelFields: withNovelFields.length,
    benefitTypes,
    variationPatterns,
    novelFieldSummary,
    comparisons,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 4: CLASSIFY — Determine program type, geographic scope, complexity
// ═══════════════════════════════════════════════════════════════════════════

function phaseClassify(entity, diveData, compareData) {
  const stateCode = entity.stateCode;
  const stateName = entity.name;
  console.log(`\n  ━━━ CLASSIFY: What kind of program is each one? ━━━\n`);

  const divePrograms = diveData?.programs?.filter((p) => !p._error && !p._parseError) || [];
  if (!divePrograms.length) {
    console.log(`  No dive data to classify.`);
    return null;
  }

  const comparisons = compareData?.comparisons || [];
  const results = [];

  for (const prog of divePrograms) {
    const name = (prog.name || "Unknown").toLowerCase();
    const compare = comparisons.find((c) => c.name === prog.name);
    const benefitType = prog.benefits?.type || compare?.benefitType || "unknown";
    const geo = prog.geography || {};
    const app = prog.application || {};
    const elig = prog.eligibility || {};

    // ── Program Type ──
    let programType = "benefit";

    // Resources: advocacy/information services with no financial qualification
    // Exclude known benefit keywords to avoid misclassifying programs with missing elig data
    const hasBenefitKeywords = /medicaid|waiver|snap|liheap|energy|weatherization|pace|medicare|home help|home care|respite|meals/i.test(prog.name || "");
    const isResource =
      benefitType === "advocacy" ||
      (!elig.income_limits && !elig.asset_limits && !elig.age && !hasBenefitKeywords) ||
      /ombudsman|legal|hotline|counseling|information|advocacy/i.test(prog.name || "") ||
      (prog.benefits?.value && /free|no cost|confidential|advocacy/i.test(prog.benefits.value) && !hasBenefitKeywords);

    // Navigators: help access OTHER programs
    const isNavigator =
      /micafe|211|area agency|aging.*disability.*resource|adrc/i.test(name) ||
      (prog.data_shape_notes && /assist.*apply|help.*access|connect.*program/i.test(prog.data_shape_notes));

    // Employment
    const isEmployment = benefitType === "employment" || /scsep|employment|job training/i.test(name);

    if (isNavigator) programType = "navigator";
    else if (isEmployment) programType = "employment";
    else if (isResource) programType = "resource";
    else programType = "benefit";

    // ── Geographic Scope ──
    const localEntities = [];
    const offices = geo.offices_or_providers || [];

    if (Array.isArray(offices)) {
      for (const o of offices) {
        if (typeof o === "string") {
          localEntities.push({ name: o, type: "service-area" });
        } else if (o && typeof o === "object") {
          localEntities.push({
            name: o.name || o.location || String(o),
            type: o.type || "service-area",
            phone: o.phone,
            address: o.address,
            url: o.url,
          });
        }
      }
    }

    let geoType = "state";
    const isFederal = /snap|medicare|liheap|weatherization|scsep|ombudsman|meals on wheels|ship/i.test(name);
    const isLocal = !geo.statewide && (
      geo.restrictions ||
      localEntities.length > 0 ||
      /county|region|service area|only available in/i.test(geo.regional_variations || "") ||
      /county|region|limited/i.test(geo.restrictions || "")
    );

    if (isFederal) geoType = "federal";
    else if (isLocal) geoType = "local";

    const geographicScope = {
      type: geoType,
      stateVariation: geoType === "federal",
      localEntities: localEntities.length > 0 ? localEntities : undefined,
    };

    // ── Complexity ──
    let complexity = "medium";

    const hasIncomeTiers = elig.income_limits && (
      typeof elig.income_limits === "object" ||
      /household|tier|level|qmb|slmb/i.test(String(elig.income_limits))
    );
    const hasAssetLimits = !!elig.asset_limits;
    const hasRegionalVariation = !!geo.regional_variations;
    const hasFunctionalReq = elig.other_requirements?.some((r) =>
      /nursing facility|level of care|functional|assessment|locd/i.test(r)
    );
    const hasMultipleTiers = prog.benefits?.varies_by === "priority_tier" ||
      /qmb.*slmb|tier|level/i.test(String(prog.benefits?.value || ""));

    const complexitySignals = [hasIncomeTiers, hasAssetLimits, hasRegionalVariation, hasFunctionalReq, hasMultipleTiers].filter(Boolean).length;

    if (programType === "resource" || programType === "navigator") {
      complexity = "simple";
    } else if (complexitySignals >= 3) {
      complexity = "deep";
    } else if (complexitySignals >= 1) {
      complexity = "medium";
    } else {
      complexity = "simple";
    }

    // ── Recommended Content Sections ──
    const contentSectionTypes = [];

    if (programType === "benefit") {
      contentSectionTypes.push("prose"); // intro/overview
      if (hasIncomeTiers) contentSectionTypes.push("income-table");
      if (hasAssetLimits) contentSectionTypes.push("what-counts");
      if (hasMultipleTiers) contentSectionTypes.push("tier-comparison");
      if (app.documents?.length > 0) contentSectionTypes.push("documents");
      if (localEntities.length > 0 || offices.length > 0) contentSectionTypes.push("county-directory");
      if (app.waitlist) contentSectionTypes.push("callout");
    } else if (programType === "resource") {
      contentSectionTypes.push("prose");
      if (localEntities.length > 0) contentSectionTypes.push("county-directory");
    } else if (programType === "navigator") {
      contentSectionTypes.push("prose");
      contentSectionTypes.push("provider-list");
    } else if (programType === "employment") {
      contentSectionTypes.push("prose");
      if (hasIncomeTiers) contentSectionTypes.push("income-table");
      if (app.documents?.length > 0) contentSectionTypes.push("documents");
    }

    results.push({
      name: prog.name,
      programType,
      geographicScope,
      complexity,
      recommendedSections: contentSectionTypes,
      signals: {
        benefitType,
        hasIncomeTiers,
        hasAssetLimits,
        hasRegionalVariation,
        hasFunctionalReq,
        hasMultipleTiers,
        isStatewide: geo.statewide,
      },
    });

    console.log(`  ${prog.name.slice(0, 45).padEnd(45)} → ${programType.padEnd(10)} ${geoType.padEnd(8)} ${complexity}`);
  }

  // Summary
  const types = {};
  const scopes = {};
  const complexities = {};
  for (const r of results) {
    types[r.programType] = (types[r.programType] || 0) + 1;
    scopes[r.geographicScope.type] = (scopes[r.geographicScope.type] || 0) + 1;
    complexities[r.complexity] = (complexities[r.complexity] || 0) + 1;
  }

  console.log(`\n  Types: ${JSON.stringify(types)}`);
  console.log(`  Scopes: ${JSON.stringify(scopes)}`);
  console.log(`  Complexity: ${JSON.stringify(complexities)}`);

  return {
    state: stateCode,
    stateName,
    classifiedAt: new Date().toISOString(),
    total: results.length,
    typeSummary: types,
    scopeSummary: scopes,
    complexitySummary: complexities,
    programs: results,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 5: DRAFT — Generate page content for each program
// ═══════════════════════════════════════════════════════════════════════════

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

async function claudeChat(prompt, maxTokens = 4096) {
  const MAX_RETRIES = 5;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    await claudeLimiter.wait();

    const resp = await fetchWithRetry("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (resp.ok) {
      const json = await resp.json();
      return json.content?.[0]?.text || "";
    }

    const text = await resp.text();

    // Rate limit: wait and retry
    if (resp.status === 429) {
      // Parse retry-after header or use exponential backoff
      const retryAfter = resp.headers.get("retry-after");
      const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : Math.min(15000 * (attempt + 1), 60000);
      console.log(`\n  [rate-limit] Waiting ${(waitMs / 1000).toFixed(0)}s (attempt ${attempt + 1}/${MAX_RETRIES})...`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    // Overloaded / transient server errors: exponential backoff with jitter
    if (resp.status === 529 || resp.status === 503 || resp.status === 500) {
      const base = Math.min(10000 * Math.pow(2, attempt), 120000); // 10s, 20s, 40s, 80s, 120s
      const jitter = Math.floor(Math.random() * 3000);
      const waitMs = base + jitter;
      console.log(`\n  [claude ${resp.status}] Overloaded. Waiting ${(waitMs / 1000).toFixed(0)}s (attempt ${attempt + 1}/${MAX_RETRIES})...`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    throw new Error(`Claude ${resp.status}: ${text.slice(0, 200)}`);
  }

  throw new Error(`Claude rate limit: exhausted ${MAX_RETRIES} retries`);
}

const CONTENT_VOICE_PROMPT = `You are writing benefit program page content for Olera, a senior care platform. Your audience is family caregivers, the adult children helping aging parents navigate government programs.

VOICE PRINCIPLES (non-negotiable):
1. Lead with the caregiver's need, not the program definition. Not "SNAP is a federal nutrition program." Instead: "If your parent is 60+ and on a fixed income, they may qualify for $100 to $300/month toward groceries."
2. Use causal chains. "Because PACE covers all medical care under one program, your parent won't need to coordinate between separate providers; one team manages everything."
3. Specific evidence immediately after claims. Don't say "income limits apply." Say "Income limit: $2,152/month for a single person (2026)."
4. Clarify jargon inline in parentheses. "Must meet Nursing Facility Level of Care (a clinical assessment of whether your parent needs daily help with bathing, dressing, or medication management)."
5. End sections with the next step. "Call 800-252-2412. No application needed."
6. No hedging, no filler, no bureaucratic language. "You cannot use SNAP for alcohol or tobacco" not "Please note that certain items may not be eligible for purchase."
7. Honest about unknowns. If savings can't be verified, say so. Fewer honest facts beat more generic claims.
8. Write for someone who is stressed, time-pressed, and may be reading on their phone. Short paragraphs. Clear hierarchy.
9. Never use em dashes (—) in prose. Em dashes read as AI-generated writing and erode trust. Use periods, commas, colons, semicolons, or parentheses instead. This applies to every string field you generate (intro, faqs, applicationNotes, descriptions, callouts, everything).

SOURCE CONSTRAINT (non-negotiable):
- NEVER cite Olera or olera.care as a source. This creates a circular reference (AI reads Olera, writes content, Olera publishes, AI reads again). Only cite .gov sites, official program pages, and authoritative third-party sources.`;

// ─── Draft prompt builder (shared between serial and batch modes) ───────────

function buildProgramDraftPrompt(entity, prog, classification, draftedAt) {
  const stateName = entity.name;
  const name = prog.name || "Unknown Program";
  const programType = classification.programType || "benefit";
  const complexity = classification.complexity || "medium";
  const sections = classification.recommendedSections || ["prose"];

  const draftPrompt = `${CONTENT_VOICE_PROMPT}

You are drafting the page content for "${name}" in ${stateName}. This is a ${programType} program with ${complexity} complexity.

Here is everything we know from research:
${JSON.stringify({ ...prog, _raw: undefined }, null, 2)}

Classification: ${JSON.stringify(classification, null, 2)}

The page will render in a 4-tab structure: About / Eligibility / How to Apply / Resources.
(Resources/navigators get a simpler 1-page layout; still generate all fields below. The renderer adapts.)

You must also decide which VISUAL COMPONENTS best serve this specific program. The available components are:
- "income-table": For programs with household-size-based income thresholds
- "asset-limits": For programs with countable/exempt asset rules
- "document-checklist": Interactive checklist of specific documents needed to apply
- "step-journey": Visual numbered step flow for application process
- "contact-cards": Structured phone/office cards with hours and descriptions
- "location-finder": Map-based regional office/provider finder (needs lat/lng data)
- "stat-callout": Dark banner highlighting key numbers (savings, service areas, waitlist time)

Choose components that match THIS program's data; don't force components where data is thin.

You must also choose an ICON that represents this program's primary purpose. Pick ONE from this menu:
- "House" — home care, aging in place, home modifications
- "HouseLine" — housing assistance, rent help, shelter
- "CurrencyDollar" — financial benefits, savings programs, cash assistance
- "Coins" — supplemental income, stipends, small financial aid
- "HandCoins" — financial counseling, money management, spend-down
- "Money" — cost coverage, payment programs, reimbursement
- "Wallet" — budgeting, financial planning, asset management
- "Bank" — banking, institutional financial services
- "HandHeart" — caregiver support, respite, emotional support
- "Heart" — general wellness, emotional health, companionship
- "Stethoscope" — medical care, health services, clinical programs
- "Pill" — prescription assistance, medication programs, pharmacy
- "FirstAid" — emergency care, urgent health needs, crisis
- "Hospital" — facility-based care, inpatient, institutional
- "Wheelchair" — disability services, mobility assistance, ADA
- "Bed" — nursing home, long-term facility care, residential
- "BowlFood" — food assistance, meals, nutrition programs (SNAP, MOW)
- "Bread" — food banks, pantries, commodity food programs
- "Lightning" — energy assistance, utilities, weatherization (LIHEAP)
- "Thermometer" — heating/cooling assistance, seasonal energy
- "Drop" — water assistance, utility programs
- "ShieldCheck" — insurance, coverage verification, protection programs
- "Scales" — legal aid, advocacy, rights protection
- "Gavel" — legal services, elder law, guardianship
- "GraduationCap" — education, training, employment programs
- "Briefcase" — employment, job placement, vocational rehab
- "Bus" — transportation assistance, transit, ride programs
- "Truck" — delivery services, supply programs
- "Phone" — hotlines, information lines, phone-based services
- "Compass" — navigation, counseling, options exploration (SHIP, SHINE)
- "Signpost" — wayfinding, referral services, care coordination
- "Lightbulb" — information, education, awareness programs
- "Users" — group programs, support groups, community services
- "UsersThree" — family services, multi-person programs
- "MapPin" — location-specific, regional offices, area agencies
- "Buildings" — assisted living, facility-based community programs
- "Lifebuoy" — safety net programs, emergency assistance
- "Star" — quality programs, excellence, top-rated services
- "Certificate" — certification, accreditation, standards programs
- "Calendar" — enrollment periods, seasonal programs, scheduling
- "Clock" — time-limited programs, temporary assistance, waitlists
- "FileText" — application-heavy programs, paperwork, documentation
- "ListChecks" — multi-requirement programs, compliance, checklists
- "Leaf" — environmental, green energy, sustainability programs
- "Gift" — benefit programs with one-time grants or awards
- "Megaphone" — outreach, awareness campaigns, public programs
- "CheckCircle" — verification, eligibility confirmation, approval
Pick the one icon that BEST represents what this program does for families. When in doubt, match the program type: benefits→CurrencyDollar, resources→Compass, navigators→Signpost, employment→Briefcase.

Generate the complete page content as a JSON object matching this exact structure:

{
  "id": "<kebab-case slug, e.g., '${entity.stateCode.toLowerCase()}-snap-food-benefits'>",
  "name": "${name}",
  "shortName": "<2-4 word abbreviated name>",
  "tagline": "<one compelling sentence for browse cards: what this means for the caregiver, not a definition>",
  "programType": "${programType}",
  "complexity": "${complexity}",
  "geographicScope": ${JSON.stringify(classification.geographicScope || { type: "state" })},
  "intro": "<2-3 paragraph introduction. Lead with what this means for the caregiver's parent. Be specific about what the program provides and who it's for. Include key numbers. Separate paragraphs with \\n\\n.>",
  "savingsRange": "<What the program actually pays, worded to match the evidence. Use a range ONLY when research gives both ends: '$160 – $640/year in 2026'. When research gives only a ceiling, say so: 'Up to $3,576/year for one person (FY2026 maximum)'. NEVER invent a low end to make a range. Empty string '' for free services.>",
  "savingsSource": "<The official basis for savingsRange: who publishes it and what kind of figure it is (maximum, standard benefit, average award, premium offset). Must name a number that appears in savingsRange. 'Free service' for resources.>",
  "savingsVerified": <true if we have specific dollar amounts from official sources, false otherwise>,

  "structuredEligibility": {
    "summary": [<3-5 short bullet strings for browse cards, e.g., "Age 60+", "Income below $2,152/month">],
    "ageRequirement": "<e.g., '55+' or '60+' or null>",
    "incomeTable": [<{"householdSize": N, "monthlyLimit": N} for each row if household-size-based, or null>],
    "assetLimits": <{"individual": N, "couple": N, "countedAssets": [...], "exemptAssets": [...], "homeEquityCap": N} or null>,
    "functionalRequirement": "<plain-English explanation if there's a functional/clinical assessment requirement, or null>",
    "otherRequirements": [<any other requirements as clear strings>],
    "povertyLevelReference": "<e.g., '200% FPL' if relevant, or null>"
  },

  "applicationGuide": {
    "method": "<online|phone|mail|in-person|multiple>",
    "summary": "<one sentence: the simplest way to apply and how long it takes>",
    "steps": [<{"step": N, "title": "...", "description": "..."}. SPECIFIC to this program. Include actual phone numbers, website names, form numbers. Not 'Contact your local office' but 'Call 2-1-1 and choose Option 2, Monday–Friday 8am–6pm CT.'>],
    "processingTime": "<specific timeline from research, e.g., '45 days, or up to 90 days if disability determination needed'>",
    "waitlist": "<specific waitlist info, e.g., 'Several months to multiple years depending on region and priority level' or null>",
    "tip": "<one practical tip for the caregiver, or null>",
    "urls": [<{"label": "...", "url": "..."}, actual application URLs from research>]
  },

  "documentsNeeded": [
    <6-15 SPECIFIC items the applicant needs. Not "proof of income". Instead, "Social Security award letter", "Most recent electric bill showing the account name", "Pre-need burial contracts or irrevocable burial trusts". Be concrete.
    NEVER INVENT A DOCUMENTATION PERIOD. "Bank statements (last 3 months)" was a fabricated exemplar that propagated into 242 records before anyone checked it. Alabama LIHEAP says in writing "bank statements are not an acceptable form of verification"; Maryland's energy application says "Bank Statements are not valid"; Kentucky asks only for "resource information"; Oklahoma Medicaid asks for SIXTY months, not three, because of the five-year transfer lookback. Write only the period the operator actually publishes. If it publishes none, say what the applicant will be asked (for example "the current balance of any checking or savings account, which you can state yourself") rather than inventing a number of months.
    NO ASSET DOCUMENTS ON A PROGRAM WITH NO ASSET TEST. Most states have Broad-Based Categorical Eligibility, which removes the SNAP resource test entirely, and Older Americans Act services (meals, caregiver support, legal aid, ombudsman, SHIP) may not be means-tested at all. Asking those applicants for financial records is a pure barrier.
    ORDER MATTERS MORE THAN LENGTH: only the FIRST THREE items are shown to a family before their first call. Lead with what the operator actually asks for on that call. Deep financial records (investments, burial contracts, vehicle titles) belong later in the list, not in the first three.>
    EXEMPLAR (MEPD, deep program, 15 items — note the first three are what you need to make the call, not the full financial file):
    ["Most recent Social Security award letter", "Proof of Texas residency (utility bill, lease, or state-issued document)", "Medicare card (Part A is what qualifies you)", "Social Security cards for all household members", "Proof of age (birth certificate or passport)", "Pension or retirement income statements", "Current balances for any checking, savings, or CD accounts (Texas asks for statements covering the five-year transfer lookback later in the process, not for this call)", "Investment documents (stocks, bonds, annuities, trust agreements)", "Property documents (deeds, tax statements, royalty statements)", "Life insurance policies with face values", "Vehicle titles and registration", "Pre-need burial contracts or irrevocable burial trusts", "Legal documents if you have a representative", "Documentation of medical expenses paid out-of-pocket (last 3 months)", "Proof of health insurance premiums paid"]
    EXEMPLAR (CEAP, simple program, 6 items):
    ["Valid government-issued photo ID", "Proof of citizenship or legal residency for all household members", "Proof of income from the last 30 days (pay stubs, SSI letter, or tax return)", "Most recent electric bill", "Most recent gas or propane bill", "Names and dates of birth for everyone in the household"]
    If the program has no application (e.g., a hotline), use null.
  ],

  "contacts": [
    <Program-specific phone numbers with descriptions and hours. Not just one generic number; differentiate by purpose.
    THE FIRST CONTACT IS THE ONE A FAMILY CALLS. It must have a real phone number and must be the program's own application door — the operator that can actually start or screen an application. A general referral line (2-1-1, an information helpline) goes LAST, never first, and its description must say plainly that it transfers you rather than handling the program itself. Never put a named individual's desk line first; use the organization's main line, which survives staff changes.>
    EXEMPLAR: [{"label": "HHSC Benefits Line", "phone": "(877) 541-7905", "description": "Apply and ask about eligibility", "hours": "Mon-Fri 8am-6pm CT"}, {"label": "Texas 2-1-1", "phone": "2-1-1", "description": "General helpline that can transfer you to the right office if the line above is busy", "hours": "24 hours, 7 days a week"}]
    If you cannot find the program's own number, put the best real number you DID find first and describe honestly what it reaches. Never leave the first contact's phone null. null for the whole array only if no contacts exist at all.
  ],

  "applicationNotes": [
    <Conditional guidance strings: things that depend on the person's situation.>
    EXEMPLAR: ["Crisis cases with active disconnection notices may get expedited processing within 48 hours", "Some MCOs have immediate openings while others maintain 6-month waitlists; ask about availability when choosing", "You can apply while still in the hospital. Discharge planners often initiate the process.", "A common reason applications are held up is missing documentation. Submit everything at once."]
    2-4 notes for deep programs, 1-2 for medium, null for simple/resources.
  ],

  "relatedPrograms": [
    <Names of sibling programs in the same state that the caregiver should know about. E.g., if this is SNAP, mention LIHEAP, Weatherization.>
    2-4 names, or null if no clear related programs.
  ],

  "contentSections": [<additional content blocks: tier comparisons, callouts, prose sections. Only include if you have real data to populate them.>],

  "faqs": [
    <${complexity === "deep" ? "6-8" : complexity === "medium" ? "4-6" : "2-4"} FAQs. These must be DECISION-MAKING questions, not definitions.>
    BAD: "What is ${name}?" (definitional; the intro already explains this)
    GOOD: "Can my parent keep their house if it's worth more than $2,000?" (real asset-limit confusion)
    GOOD: "What if my landlord won't sign the permission form?" (real blocker)
    GOOD: "How long is the waitlist really?" (honest answer with specifics)
    GOOD: "Can a family member apply on behalf of an elderly parent?" (common use case)
    GOOD: "Can I apply for [this program] and [related program] at the same time?" (cross-program)
    GOOD: "What happens after I'm enrolled and my needs change?" (reassessment process)
    Each answer should be 2-4 sentences with specific numbers, phone numbers, and form names where relevant.
  ],

  "layoutIntent": {
    "aboutHighlight": <"savings" if significant dollar savings, "coverage" if comprehensive service package, "waitlist" if long wait is the defining feature, or null>,
    "eligibilityDisplay": <"income-table" if household-size-based thresholds, "asset-focused" if assets are the main gate, "simple-list" if eligibility is straightforward>,
    "applyDisplay": <"step-journey" if multi-step process, "single-action" if just one phone call or URL, "phone-cta" for hotlines/resources>,
    "hasLocationFinder": <true if there are regional offices/providers the user needs to find>,
    "hasDocumentChecklist": <true if documentsNeeded has 4+ items>,
    "visualTone": <"editorial" for deep programs (full design energy), "warm" for medium programs (some visual elements), "minimal" for simple resources>
  },

  "icon": "<Phosphor icon name from the menu above, e.g., 'House', 'CurrencyDollar', 'BowlFood'. Pick the one that best represents this program's purpose.>",

  "phone": "<primary contact phone from research or null>",
  "sourceUrl": "<primary official .gov URL>",
  "contentStatus": "pipeline-draft",
  "draftedAt": "${draftedAt}"
}

CRITICAL RULES:
- Every number must come from the research data. Do not invent figures.
- If the research doesn't have a specific data point, use null; don't fabricate.
- NEVER cite Olera or olera.care as a source for any information.
- Savings range must be empty string "" for free services (resources, navigators).
- Application steps must be specific to THIS program; include actual phone numbers, URLs, form names.
- documentsNeeded must list CONCRETE items ("Social Security award letter") not categories ("proof of income").
- Only documentsNeeded[0..2] reach a family before their first call. Put the first-call essentials there.
- NEVER state Medicare as a requirement for a program that is not Medicare-based. Medicaid waivers, PACE, and state HCBS programs do NOT require Medicare: CMS is explicit that a person can join PACE with Medicaid only, or by paying privately. If a Medicare card is worth mentioning at all for such a program, write it as optional ("Medicare card if they have one"), never as "Medicare card (both parts A and B)".
- Do not invent a low end for savingsRange. A ceiling stated as a range reads to a family as a typical amount, and the letters we generate turn savingsRange into "families that qualify often save X". If the research supports only a maximum, say maximum.
- contacts[0] must have a real phone number and must be the program's application door, not a referral line.
- FAQs must answer DECISION-MAKING questions, not definitions. Minimum ${complexity === "deep" ? 6 : complexity === "medium" ? 4 : 2}.
- Content sections array should only include sections where you have real data to populate them.
- Return ONLY the JSON object, no markdown wrapping.`;

  // v3 outputs are richer — documents, contacts, application notes, more FAQs, layout intent
  const tokenLimit = complexity === "deep" ? 8192 : complexity === "medium" ? 6144 : 4096;

  return { prompt: draftPrompt, tokenLimit, name, programType, complexity };
}

function finalizeProgramDraft(rawText, prog, classification, draftedAt) {
  const name = prog.name || "Unknown Program";
  const programType = classification.programType || "benefit";
  const complexity = classification.complexity || "medium";

  const parsed = extractJson(rawText || "");
  if (!parsed) {
    return { name, _parseError: true, _raw: (rawText || "").slice(0, 500) };
  }

  parsed.programType = parsed.programType || programType;
  parsed.complexity = parsed.complexity || complexity;
  parsed.geographicScope = parsed.geographicScope || classification.geographicScope;
  parsed.contentStatus = "pipeline-draft";
  parsed.draftedAt = draftedAt;

  // Normalize FAQ shape: the model occasionally returns {q, a} instead of
  // {question, answer}. Renderers expect {question, answer}, so coerce at ingest.
  if (Array.isArray(parsed.faqs)) {
    parsed.faqs = parsed.faqs.map((f) => {
      if (!f || typeof f !== "object") return f;
      if (f.question && f.answer) return f;
      if (f.q !== undefined || f.a !== undefined) {
        return { question: f.q || f.question || "", answer: f.a || f.answer || "" };
      }
      return f;
    });
  }

  return parsed;
}

function buildStateOverviewPrompt(entity, successful) {
  const stateName = entity.name;

  const programSummaries = successful.map((p) =>
    `- ${p.name} (${p.programType}): ${p.tagline}`
  ).join("\n");

  const typeCounts = {};
  for (const p of successful) {
    typeCounts[p.programType || "benefit"] = (typeCounts[p.programType || "benefit"] || 0) + 1;
  }

  return `${CONTENT_VOICE_PROMPT}

You are writing the state overview page for ${stateName}'s senior benefit programs. This is the landing page a caregiver sees before diving into individual programs.

Here are the ${successful.length} programs we've researched:
${programSummaries}

Program type breakdown: ${JSON.stringify(typeCounts)}

Generate the state overview as a JSON object:

{
  "intro": "<2-3 paragraphs. Lead with what a caregiver in ${stateName} needs to know. How many programs are available? What's the range of help, from financial benefits to free resources? Be specific about ${stateName}, not generic. End with a clear 'here's how to start' direction.>",
  "startHere": [
    <3-4 objects: the most impactful programs a caregiver should look at first. Each: {"name": "...", "programId": "<matching id from the drafts>", "why": "<one sentence: why start here>"}>
  ],
  "byNeed": [
    <4-6 objects grouping programs by caregiver need, not bureaucratic category. Each: {"need": "<plain language need, e.g., 'Help paying for home care', 'Food assistance', 'Free advice and advocacy'>", "programs": ["program name 1", "program name 2"], "description": "<one sentence explaining this group>"}>
  ],
  "quickFacts": [
    <3-4 strings: state-specific facts that orient the caregiver. E.g., "Michigan uses MI Bridges (newmibridges.michigan.gov) for most benefit applications" or "Most programs require income below $2,901/month for a single person">
  ],
  "resourcesVsBenefits": "<one paragraph explaining the difference between qualification-based benefits and free resources available to everyone, using specific ${stateName} examples>"
}

CRITICAL: Use only information from the researched programs. Do not invent programs or facts. Return ONLY the JSON object.`;
}

function finalizeStateOverview(rawText) {
  return extractJson(rawText || "");
}

async function phaseDraft(entity, diveData, classifyData) {
  const stateCode = entity.stateCode;
  const stateName = entity.name;
  console.log(`\n  ━━━ DRAFT: Generating page content ━━━\n`);

  if (!ANTHROPIC_API_KEY) {
    console.log(`  WARN: ANTHROPIC_API_KEY not set. Skipping draft phase.`);
    console.log(`  Set it in .env.local to enable content generation.`);
    return null;
  }

  const divePrograms = diveData?.programs?.filter((p) => !p._error && !p._parseError) || [];
  const classifications = classifyData?.programs || [];

  if (!divePrograms.length) {
    console.log(`  No dive data to draft from.`);
    return null;
  }

  const DRAFT_CONCURRENCY = 1; // Sequential — Claude API has 8K output tokens/min limit, concurrency just triggers 429s
  console.log(`  Drafting ${divePrograms.length} programs (sequential, rate-limited)...\n`);
  let draftCompleted = 0;
  const draftedAt = new Date().toISOString().split("T")[0];

  const results = await runConcurrent(divePrograms, async (prog, i) => {
    const classification = classifications.find((c) => c.name === prog.name) || {};
    const built = buildProgramDraftPrompt(entity, prog, classification, draftedAt);

    try {
      const response = await claudeChat(built.prompt, built.tokenLimit);
      draftCompleted++;
      process.stdout.write(`  [${draftCompleted}/${divePrograms.length}] ${built.name.slice(0, 50).padEnd(50)}\r`);
      const result = finalizeProgramDraft(response, prog, classification, draftedAt);
      if (result._parseError) console.log(`\n  WARN: Could not parse draft for "${built.name}"`);
      return result;
    } catch (err) {
      draftCompleted++;
      console.log(`\n  ERROR drafting "${built.name}": ${err.message}`);
      return { name: built.name, _error: err.message };
    }
  }, DRAFT_CONCURRENCY);

  const successful = results.filter((r) => !r._parseError && !r._error);
  console.log(`\n\n  Drafted ${successful.length}/${divePrograms.length} programs`);
  console.log(`  Parse errors: ${results.filter((r) => r._parseError).length}`);
  console.log(`  Errors: ${results.filter((r) => r._error).length}`);

  // Generate state-level overview content
  let stateOverview = null;
  if (successful.length > 0) {
    console.log(`\n  Generating state overview for ${stateName}...`);
    const statePrompt = buildStateOverviewPrompt(entity, successful);

    try {
      const response = await claudeChat(statePrompt, 4096);
      stateOverview = finalizeStateOverview(response);
      if (stateOverview) {
        console.log(`  State overview generated: ${stateOverview.startHere?.length || 0} start-here picks, ${stateOverview.byNeed?.length || 0} need groups`);
      } else {
        console.log(`  WARN: Could not parse state overview`);
      }
    } catch (err) {
      console.log(`  ERROR generating state overview: ${err.message}`);
    }
  }

  return {
    state: stateCode,
    stateName,
    draftedAt: new Date().toISOString(),
    total: results.length,
    successful: successful.length,
    programs: results,
    stateOverview,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 6: REPORT — Human-readable markdown
// ═══════════════════════════════════════════════════════════════════════════

function phaseReport(entity, exploreData, diveData, compareData, classifyData, draftData) {
  const dirName = entity.dirName;
  const stateName = entity.name;
  console.log(`\n  ━━━ REPORT: Generating markdown report ━━━\n`);

  const lines = [];
  const ln = (s = "") => lines.push(s);

  ln(`# ${stateName} Benefits Exploration Report`);
  ln();
  ln(`> Generated ${new Date().toISOString().split("T")[0]} by benefits-pipeline.js`);
  ln(`> Cost: ${cost.summary()}`);
  ln();
  ln(`---`);
  ln();

  // Summary
  ln(`## Summary`);
  ln();
  ln(`| Metric | Value |`);
  ln(`|--------|-------|`);
  ln(`| Programs discovered | ${exploreData?.programCount || "?"} |`);
  ln(`| Programs deep-dived | ${diveData?.parsed || "?"} |`);
  if (compareData) {
    ln(`| New (not in our data) | ${compareData.newPrograms} |`);
    ln(`| Data discrepancies | ${compareData.withDiffs} |`);
    ln(`| Fields our model can't capture | ${compareData.withNovelFields} |`);
  }
  ln();

  // Data model gaps
  if (compareData?.novelFieldSummary && Object.keys(compareData.novelFieldSummary).length > 0) {
    ln(`## Data Model Gaps`);
    ln();
    ln(`These data fields appeared across programs but don't exist in our current model:`);
    ln();
    ln(`| Field | Programs | Note |`);
    ln(`|-------|----------|------|`);
    for (const [field, info] of Object.entries(compareData.novelFieldSummary)) {
      ln(`| \`${field}\` | ${info.count} | ${info.note} |`);
    }
    ln();
  }

  // Benefit type distribution
  if (compareData?.benefitTypes) {
    ln(`## Program Types`);
    ln();
    for (const [type, count] of Object.entries(compareData.benefitTypes)) {
      ln(`- **${type}**: ${count} programs`);
    }
    ln();
  }

  // Data discrepancies
  if (compareData?.comparisons?.filter((c) => c.diffsFound > 0).length > 0) {
    ln(`## Data Discrepancies`);
    ln();
    ln(`Our data differs from what official sources say:`);
    ln();
    for (const c of compareData.comparisons.filter((c) => c.diffsFound > 0)) {
      ln(`### ${c.name}`);
      ln();
      for (const d of c.diffs) {
        ln(`- **${d.field}**: Ours says \`${d.ours}\` → Source says \`${d.found}\`${d.source ? ` ([source](${d.source}))` : ""}`);
      }
      ln();
    }
  }

  // New programs
  const newProgs = compareData?.comparisons?.filter((c) => c.isNew) || [];
  if (newProgs.length > 0) {
    ln(`## New Programs (Not in Our Data)`);
    ln();
    for (const c of newProgs) {
      ln(`- **${c.name}** — ${c.benefitType}${c.officialSource ? ` ([source](${c.officialSource}))` : ""}`);
      if (c.dataShapeNotes) ln(`  - Shape notes: ${c.dataShapeNotes}`);
    }
    ln();
  }

  // Per-program details
  ln(`## Program Details`);
  ln();

  const divePrograms = diveData?.programs?.filter((p) => !p._error && !p._parseError) || [];
  for (const prog of divePrograms) {
    const compare = compareData?.comparisons?.find(
      (c) => c.name === prog.name
    );

    ln(`### ${prog.name || "Unknown"}`);
    ln();

    if (compare?.isNew) ln(`> **NEW** — not currently in our data`);
    if (compare?.existingVerified) ln(`> Last verified: ${compare.existingVerified}`);
    ln();

    // Eligibility
    if (prog.eligibility) {
      ln(`**Eligibility:**`);
      if (prog.eligibility.age) ln(`- Age: ${prog.eligibility.age}+`);
      if (prog.eligibility.income_limits) {
        const inc = prog.eligibility.income_limits;
        ln(`- Income: ${typeof inc === "string" ? inc : JSON.stringify(inc)}`);
      }
      if (prog.eligibility.asset_limits) {
        const ast = prog.eligibility.asset_limits;
        ln(`- Assets: ${typeof ast === "string" ? ast : JSON.stringify(ast)}`);
      }
      if (prog.eligibility.other_requirements?.length > 0) {
        for (const r of prog.eligibility.other_requirements) {
          ln(`- ${r}`);
        }
      }
      ln();
    }

    // Benefits
    if (prog.benefits) {
      ln(`**Benefits:** ${prog.benefits.value || "N/A"}`);
      if (prog.benefits.varies_by && prog.benefits.varies_by !== "not_applicable") {
        ln(`- Varies by: ${prog.benefits.varies_by}`);
      }
      ln();
    }

    // Application
    if (prog.application) {
      if (prog.application.methods?.length > 0) {
        ln(`**How to apply:**`);
        for (const m of prog.application.methods) {
          ln(`- ${m}`);
        }
        ln();
      }
      if (prog.application.processing_time) {
        ln(`**Timeline:** ${prog.application.processing_time}`);
      }
      if (prog.application.waitlist) {
        ln(`**Waitlist:** ${prog.application.waitlist}`);
      }
      ln();
    }

    // Gotchas
    if (prog.gotchas?.length > 0) {
      ln(`**Watch out for:**`);
      for (const g of prog.gotchas) ln(`- ${g}`);
      ln();
    }

    // Data shape
    if (prog.data_shape_notes) {
      ln(`**Data shape:** ${prog.data_shape_notes}`);
      ln();
    }

    // Novel fields
    if (compare?.novelFields?.length > 0) {
      ln(`**Our model can't capture:**`);
      for (const nf of compare.novelFields) ln(`- \`${nf.field}\`: ${nf.note}`);
      ln();
    }

    if (prog.official_source) {
      ln(`**Source:** ${prog.official_source}`);
      ln();
    }

    ln(`---`);
    ln();
  }

  // Classification summary
  if (classifyData?.programs?.length > 0) {
    ln(`## Program Classification`);
    ln();
    ln(`| Program | Type | Scope | Complexity |`);
    ln(`|---------|------|-------|------------|`);
    for (const c of classifyData.programs) {
      ln(`| ${c.name.slice(0, 40)} | ${c.programType} | ${c.geographicScope?.type || "?"} | ${c.complexity} |`);
    }
    ln();
    ln(`**Types:** ${JSON.stringify(classifyData.typeSummary)}`);
    ln(`**Scopes:** ${JSON.stringify(classifyData.scopeSummary)}`);
    ln(`**Complexity:** ${JSON.stringify(classifyData.complexitySummary)}`);
    ln();
  }

  // Draft summary
  if (draftData?.programs?.length > 0) {
    const successful = draftData.programs.filter((p) => !p._parseError && !p._error);
    ln(`## Content Drafts`);
    ln();
    ln(`Generated ${successful.length} page drafts. Review in admin dashboard or \`data/pipeline/${dirName}/drafts.json\`.`);
    ln();
    for (const p of successful) {
      ln(`- **${p.name}** (${p.programType}) — ${p.contentSections?.length || 0} content sections, ${p.faqs?.length || 0} FAQs`);
    }
    ln();
  }

  // Learning section
  ln(`## What We Learned`);
  ln();
  ln(`### Patterns Observed`);
  ln();
  if (compareData?.variationPatterns) {
    ln(`How benefits vary across these programs:`);
    for (const [pattern, count] of Object.entries(compareData.variationPatterns)) {
      ln(`- **${pattern}**: ${count} programs`);
    }
    ln();
  }

  ln(`### Data Shape Notes`);
  ln();
  ln(`Unique structural observations from each program:`);
  ln();
  for (const prog of divePrograms) {
    if (prog.data_shape_notes) {
      ln(`- **${prog.name}**: ${prog.data_shape_notes}`);
    }
  }
  ln();

  ln(`### Questions for Chantel's Review`);
  ln();
  ln(`1. Are the data discrepancies above correct? (Our data may be outdated)`);
  ln(`2. For new programs found — are these real programs we should add?`);
  ln(`3. What data fields are we missing that matter most for families?`);
  ln(`4. Are there programs NOT found that should exist in ${stateName}?`);
  ln();

  const report = lines.join("\n");
  writeFile(dirName, "exploration_report.md", report);

  console.log(`  Report: ${lines.length} lines`);
  return report;
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 7: FACT CHECK — Adversarially verify drafted facts against fresh sources
// ═══════════════════════════════════════════════════════════════════════════

function normalizePhoneDigits(p) {
  if (p === null || p === undefined) return null;
  const digits = String(p).replace(/\D/g, "");
  if (!digits) return null;
  return digits;
}

function parseAgeFromText(text) {
  if (text === null || text === undefined) return null;
  if (typeof text === "number") return text;
  const s = String(text);
  const m = s.match(/(\d{2,3})\s*\+/) || s.match(/age\s*(\d{2,3})/i) || s.match(/^(\d{2,3})\b/);
  return m ? parseInt(m[1], 10) : null;
}

function extractFactsFromDraft(prog) {
  const facts = {
    age: null,
    income_1: null,
    income_2: null,
    assets_individual: null,
    assets_couple: null,
    phones: [],
    hasVerifiableFacts: false,
  };

  const se = prog.structuredEligibility || {};
  facts.age = parseAgeFromText(se.ageRequirement);

  if (Array.isArray(se.incomeTable)) {
    const h1 = se.incomeTable.find((r) => r && r.householdSize === 1);
    const h2 = se.incomeTable.find((r) => r && r.householdSize === 2);
    if (h1 && typeof h1.monthlyLimit === "number") facts.income_1 = h1.monthlyLimit;
    if (h2 && typeof h2.monthlyLimit === "number") facts.income_2 = h2.monthlyLimit;
  }

  if (se.assetLimits) {
    if (typeof se.assetLimits.individual === "number") facts.assets_individual = se.assetLimits.individual;
    if (typeof se.assetLimits.couple === "number") facts.assets_couple = se.assetLimits.couple;
  }

  if (prog.phone) {
    const d = normalizePhoneDigits(prog.phone);
    if (d) facts.phones.push(d);
  }
  if (Array.isArray(prog.contacts)) {
    for (const c of prog.contacts) {
      if (c && c.phone) {
        const d = normalizePhoneDigits(c.phone);
        if (d && !facts.phones.includes(d)) facts.phones.push(d);
      }
    }
  }

  facts.hasVerifiableFacts =
    facts.age !== null ||
    facts.income_1 !== null ||
    facts.income_2 !== null ||
    facts.assets_individual !== null ||
    facts.assets_couple !== null ||
    facts.phones.length > 0;

  return facts;
}

function buildFactcheckPrompt(programName, stateName, facts) {
  const year = new Date().getFullYear();
  const asks = [];
  if (facts.age !== null) {
    asks.push(`- Minimum age for SENIORS (adults age 55+) to qualify for this program. If the program serves multiple populations (e.g. disabled adults AND seniors, or children AND elderly), return the senior-specific threshold — typically 55, 60, or 65. Do NOT return the lowest age across all populations. If the program has no age test for seniors, return null.`);
  }
  if (facts.income_1 !== null || facts.income_2 !== null) {
    asks.push(`- Current MONTHLY income limit for a household of 1 (integer USD). If the official source publishes an ANNUAL figure (common for LIHEAP, Weatherization, and energy-assistance programs), divide by 12 and round to integer. Return a monthly value, not annual. If no income test, null.`);
    asks.push(`- Current MONTHLY income limit for a household of 2 (integer USD). Same annual-to-monthly conversion rule. Return monthly, not annual.`);
  }
  if (facts.assets_individual !== null) {
    asks.push(`- Maximum COUNTABLE FINANCIAL ASSETS for an individual applicant to qualify (integer USD). Countable means: bank accounts, stocks, bonds, cash, CDs. Do NOT return: home equity cap, vehicle exemption, burial plan exemption, or 5-year look-back transfer amount. Those are different limits. If no asset test, null.`);
  }
  if (facts.assets_couple !== null) {
    asks.push(`- Maximum COUNTABLE FINANCIAL ASSETS for a couple to qualify (integer USD). Same "countable financial assets only" definition. Do not return home equity, vehicle, or look-back amounts.`);
  }
  if (facts.phones.length > 0) asks.push(`- The official main phone number to apply or get help (digits only, e.g. "8005551234")`);

  return `I am fact-checking program details for "${programName}" in ${stateName} as of ${year}. Prefer official .gov, state agency, or federal agency sources. Non-government sources (nonprofit clearinghouses, advocacy org guides) are acceptable if they cite an official source and are clearly current. Always return a URL for each value you provide.

CRITICAL CONTEXT: This program content targets families caring for aging parents. Interpret eligibility questions from the senior-caregiver perspective. For programs that serve multiple populations, return values that apply to the SENIOR pathway.

Tell me the CURRENT values for each of the following:
${asks.join("\n")}

Respond with STRICT JSON ONLY (no markdown fences, no prose before or after):
{
  "age": <int or null>,
  "income_1": <int or null>,
  "income_2": <int or null>,
  "assets_individual": <int or null>,
  "assets_couple": <int or null>,
  "phone": "<digits only or null>",
  "sources": {
    "age": "<url or null>",
    "income": "<url or null>",
    "assets": "<url or null>",
    "phone": "<url or null>"
  },
  "notes": "<short string — flag if program has been renamed, discontinued, or if you cannot find authoritative data>"
}

Rules:
- Use null for any value that does not apply to this program (e.g. program has no income test).
- Return a value when you have a source URL for it, even if the source is not .gov (but prefer .gov).
- If you truly cannot find the value from any retrievable source, use null and say so in notes.
- Do not estimate or interpolate. Do not guess.`;
}

function compareFacts(drafted, verified) {
  const flags = [];

  // Age comparison: handles compound programs that serve both seniors and younger
  // disabled adults. If drafted is in senior range [55, 75] and verified is
  // under 22, this is almost certainly a compound program — not a real error.
  // Downgrade to "info" severity instead of raising a high flag.
  const cmpAge = (d, v) => {
    if (d === null || d === undefined) return;
    if (v === null || v === undefined) return;
    if (d === v) return;
    const isCompoundProgram = d >= 55 && d <= 75 && v < 22;
    if (isCompoundProgram) {
      flags.push({
        field: "age",
        severity: "info",
        draftValue: d,
        verifiedValue: v,
        note: "likely compound program — drafted senior threshold, verified returned floor age for other population",
      });
      return;
    }
    flags.push({ field: "age", severity: "high", draftValue: d, verifiedValue: v });
  };

  // Numeric comparison with unit-mismatch detection. If verified is almost
  // exactly 12x drafted (or 12x-ish), the verified value is annual and our
  // draft is monthly — not a real drift, just a unit confusion from the source.
  const cmpNumericTolerant = (field, d, v) => {
    if (d === null || d === undefined) return;
    if (v === null || v === undefined) return;
    if (typeof d !== "number" || typeof v !== "number") return;

    // Unit mismatch detection (monthly vs annual): if the larger value is
    // between 11x and 13x the smaller, it's almost certainly the same figure
    // in a different unit. Downgrade.
    const bigger = Math.max(d, v);
    const smaller = Math.min(d, v);
    if (smaller > 0) {
      const ratio = bigger / smaller;
      if (ratio >= 11 && ratio <= 13) {
        flags.push({
          field,
          severity: "info",
          draftValue: d,
          verifiedValue: v,
          note: "likely unit mismatch (monthly vs annual) — ratio ~12x",
        });
        return;
      }
    }

    const diff = Math.abs(d - v);
    const denom = Math.max(Math.abs(d), Math.abs(v)) || 1;
    const pct = diff / denom;
    if (pct > 0.05) {
      flags.push({
        field,
        severity: pct > 0.15 ? "high" : "medium",
        draftValue: d,
        verifiedValue: v,
        pctDiff: +(pct * 100).toFixed(1),
      });
    }
  };

  cmpAge(drafted.age, verified.age);
  cmpNumericTolerant("income_1", drafted.income_1, verified.income_1);
  cmpNumericTolerant("income_2", drafted.income_2, verified.income_2);
  cmpNumericTolerant("assets_individual", drafted.assets_individual, verified.assets_individual);
  cmpNumericTolerant("assets_couple", drafted.assets_couple, verified.assets_couple);

  if (verified.phone && drafted.phones.length > 0) {
    const v = normalizePhoneDigits(verified.phone);
    if (v) {
      const match = drafted.phones.some((p) => p === v || p.endsWith(v) || v.endsWith(p));
      if (!match) {
        flags.push({ field: "phone", severity: "medium", draftValue: drafted.phones, verifiedValue: v });
      }
    }
  }

  return flags;
}

async function phaseFactcheck(entity, draftData) {
  const stateName = entity.name;
  console.log(`\n  ━━━ FACT CHECK: Verify drafted facts against fresh sources ━━━\n`);

  const programs = (draftData && Array.isArray(draftData.programs)) ? draftData.programs : [];
  if (!programs.length) {
    console.log(`  No drafted programs to fact-check. Run draft first.`);
    return null;
  }

  // State-level draft health check (added post CA/FL incident, 2026-04-13).
  // A state with mostly _error/_parseError drafts must not be silently "clean"
  // in factcheck output — the skips would mask a broken draft phase.
  const brokenCount = programs.filter((p) => p._error || p._parseError).length;
  if (brokenCount > 0) {
    const pct = ((brokenCount / programs.length) * 100).toFixed(0);
    console.log(`  ⚠ DRAFT HEALTH: ${brokenCount}/${programs.length} (${pct}%) drafts are broken (_error or _parseError).`);
    console.log(`  These drafts need to be regenerated — fact-checking skipped for them.`);
    if (brokenCount === programs.length) {
      console.log(`  All drafts broken. Aborting factcheck for ${stateName}.`);
      return {
        state: entity.stateCode,
        stateName,
        checkedAt: new Date().toISOString(),
        total: 0,
        stateHealth: "broken",
        brokenDrafts: brokenCount,
        programs: [],
        flags: [],
      };
    }
  }

  const FACTCHECK_CONCURRENCY = 3;
  console.log(`  Fact-checking ${programs.length} programs (concurrency: ${FACTCHECK_CONCURRENCY})...\n`);
  let completed = 0;

  const results = await runConcurrent(programs, async (prog, i) => {
    const name = prog.name || `Program ${i + 1}`;
    const facts = extractFactsFromDraft(prog);

    if (!facts.hasVerifiableFacts) {
      completed++;
      process.stdout.write(`  [${completed}/${programs.length}] ${name.slice(0, 50).padEnd(50)} (skipped: no verifiable facts)\n`);
      return {
        programId: prog.id,
        programName: name,
        skipped: true,
        reason: "no verifiable facts",
        flags: [],
      };
    }

    const prompt = buildFactcheckPrompt(name, stateName, facts);

    try {
      const response = await perplexityChat(prompt);
      const verified = extractJson(response);
      completed++;
      process.stdout.write(`  [${completed}/${programs.length}] ${name.slice(0, 50).padEnd(50)} ${cost.summary()}\r`);

      if (!verified) {
        return {
          programId: prog.id,
          programName: name,
          parseError: true,
          facts,
          raw: response.slice(0, 500),
          flags: [],
        };
      }

      const flags = compareFacts(facts, verified);
      return {
        programId: prog.id,
        programName: name,
        facts,
        verified,
        flags,
        notes: verified.notes || null,
      };
    } catch (err) {
      completed++;
      console.log(`\n  ERROR: "${name}": ${err.message}`);
      return { programId: prog.id, programName: name, error: err.message, flags: [] };
    }
  }, FACTCHECK_CONCURRENCY);

  const withFlags = results.filter((r) => r.flags && r.flags.some((f) => f.severity !== "info"));
  const totalFlags = results.reduce(
    (n, r) => n + (r.flags || []).filter((f) => f.severity !== "info").length,
    0,
  );
  const highSeverity = results.reduce(
    (n, r) => n + (r.flags || []).filter((f) => f.severity === "high").length,
    0,
  );
  const infoFlags = results.reduce(
    (n, r) => n + (r.flags || []).filter((f) => f.severity === "info").length,
    0,
  );
  const skipped = results.filter((r) => r.skipped).length;
  const parseErrors = results.filter((r) => r.parseError).length;
  const errors = results.filter((r) => r.error).length;

  console.log(`\n\n  Fact-check complete`);
  console.log(`  Programs checked: ${results.length - skipped - errors}`);
  console.log(`  Skipped (no verifiable facts): ${skipped}`);
  console.log(`  Parse errors: ${parseErrors}`);
  console.log(`  API errors: ${errors}`);
  console.log(`  Programs with actionable flags: ${withFlags.length}`);
  console.log(`  Total actionable flags: ${totalFlags} (${highSeverity} high severity)`);
  if (infoFlags > 0) {
    console.log(`  Info-only flags (auto-filtered false positives): ${infoFlags}`);
  }

  // If most programs are skipped, that's suspicious — could be legitimate (many
  // resource-type programs with no income test) or symptomatic of thin/broken drafts.
  if (programs.length >= 5 && skipped / programs.length > 0.6) {
    console.log(`\n  ⚠ HEALTH WARNING: ${skipped}/${programs.length} programs skipped for "no verifiable facts".`);
    console.log(`  Possible causes:`);
    console.log(`    1. Most programs are resources/navigators with no income test (legit)`);
    console.log(`    2. Draft phase produced thin content — structuredEligibility missing`);
    console.log(`  Verify by inspecting data/pipeline/${entity.stateCode || entity.slug || "?"}/drafts.json`);
  }

  if (withFlags.length > 0) {
    console.log(`\n  Flagged programs:`);
    for (const r of withFlags) {
      const actionable = (r.flags || []).filter((f) => f.severity !== "info");
      console.log(`    - ${r.programName}: ${actionable.length} flag${actionable.length > 1 ? "s" : ""}`);
      for (const f of actionable) {
        const d = typeof f.draftValue === "object" ? JSON.stringify(f.draftValue) : f.draftValue;
        const v = typeof f.verifiedValue === "object" ? JSON.stringify(f.verifiedValue) : f.verifiedValue;
        console.log(`        [${f.severity}] ${f.field}: drafted=${d} verified=${v}${f.pctDiff ? ` (${f.pctDiff}% diff)` : ""}`);
      }
    }
  }

  return {
    state: entity.stateCode,
    stateName,
    checkedAt: new Date().toISOString(),
    total: results.length,
    skipped,
    parseErrors,
    errors,
    programsWithFlags: withFlags.length,
    totalFlags,
    highSeverityFlags: highSeverity,
    programs: results,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  const opts = parseArgs();

  if (opts.regenAll) {
    generatePipelineDrafts({ regenAll: true });
    console.log(`\n  Done (regen-index only).\n`);
    return;
  }

  const entity = resolveEntity(opts);

  if (!entity) {
    console.error(`  Error: --state or --region required`);
    console.error(`  Examples: --state MI, --region "Miami-Dade County, FL" --parent-state FL`);
    printUsage();
    process.exit(1);
  }

  if (!PERPLEXITY_API_KEY) {
    console.error(`  Error: PERPLEXITY_API_KEY not found in .env.local`);
    process.exit(1);
  }

  const dirName = entity.dirName;
  const shouldRun = (phase) => opts.phase === "all" || opts.phase === phase;

  console.log(`\n  Senior Benefits Pipeline — Content Production System`);
  console.log(`  Entity: ${entity.name}${entity.isState ? ` (${entity.stateCode})` : ""}`);
  console.log(`  Type:   ${entity.isState ? "State" : "Region"}${entity.parentState ? ` (parent: ${entity.parentStateName})` : ""}`);
  console.log(`  Slug:   ${entity.slug}`);
  console.log(`  Phase:  ${opts.phase}`);
  console.log(`  Mode:   ${opts.run ? "EXECUTE" : "DRY RUN"}`);

  // Load existing data for comparison (from parent state if region)
  const compareState = entity.stateCode || entity.parentState;
  const existing = compareState ? loadExistingPrograms(compareState) : [];
  if (existing.length > 0) {
    console.log(`  Existing in waiver-library.ts (${compareState}): ${existing.length} programs`);
  }

  if (!opts.run) {
    console.log(`\n  This is a dry run. To execute, add --run:`);
    if (entity.isState) {
      console.log(`  node scripts/benefits-pipeline.js --state ${entity.stateCode} --run\n`);
    } else {
      console.log(`  node scripts/benefits-pipeline.js --region "${entity.name}"${entity.parentState ? ` --parent-state ${entity.parentState}` : ""} --run\n`);
    }

    if (existing.length > 0) {
      console.log(`  Current programs (${compareState}):`);
      for (const p of existing) {
        const v = p.lastVerifiedDate ? `✓ ${p.lastVerifiedDate}` : "✗ unverified";
        console.log(`    ${p.name.padEnd(55)} ${v}`);
      }
    }

    const progCount = existing.length || 10;
    const estPerplexity = 2 + progCount + progCount; // explore + dive + factcheck
    const estClaude = progCount;
    console.log(`\n  Would make ~${estPerplexity} Perplexity calls (~$${(estPerplexity * 0.005).toFixed(3)})`);
    console.log(`  Would make ~${estClaude} Claude calls for drafts`);
    console.log(`  Output: data/pipeline/${dirName}/`);
    console.log(`    explore.json, dive.json, compare.json, classify.json, drafts.json`);
    console.log(`    factcheck.json, exploration_report.md`);
    process.exit(0);
  }

  // ─── Execute ─────────────────────────────────────────────────────────

  let exploreData = readJson(dirName, "explore.json");
  let diveData = readJson(dirName, "dive.json");
  let compareData = readJson(dirName, "compare.json");
  let classifyData = readJson(dirName, "classify.json");
  let draftData = readJson(dirName, "drafts.json");

  if (shouldRun("explore")) {
    exploreData = await phaseExplore(entity);
    writeFile(dirName, "explore.json", exploreData);
  }

  if (shouldRun("dive")) {
    if (!exploreData) exploreData = readJson(dirName, "explore.json");
    if (!exploreData?.programs?.length) {
      console.log(`\n  No explore data. Run: --phase explore --run`);
    } else {
      diveData = await phaseDive(entity, exploreData);
      writeFile(dirName, "dive.json", diveData);
    }
  }

  if (shouldRun("compare")) {
    if (!diveData) diveData = readJson(dirName, "dive.json");
    if (!diveData?.programs?.length) {
      console.log(`\n  No dive data. Run: --phase dive --run`);
    } else {
      compareData = phaseCompare(entity, diveData, existing);
      writeFile(dirName, "compare.json", compareData);
    }
  }

  if (shouldRun("classify")) {
    if (!diveData) diveData = readJson(dirName, "dive.json");
    if (!diveData?.programs?.length) {
      console.log(`\n  No dive data. Run: --phase dive --run`);
    } else {
      if (!compareData) compareData = readJson(dirName, "compare.json");
      classifyData = phaseClassify(entity, diveData, compareData);
      writeFile(dirName, "classify.json", classifyData);
    }
  }

  if (shouldRun("draft")) {
    if (!diveData) diveData = readJson(dirName, "dive.json");
    if (!classifyData) classifyData = readJson(dirName, "classify.json");
    if (!diveData?.programs?.length) {
      console.log(`\n  No dive data. Run: --phase dive --run`);
    } else if (!classifyData?.programs?.length) {
      console.log(`\n  No classify data. Run: --phase classify --run`);
    } else {
      draftData = await phaseDraft(entity, diveData, classifyData);
      // Safety guard: don't overwrite a good drafts.json with a failed/partial run.
      // Rationale: 2026-04-13 CA/FL incident where Claude 529s caused 0/14 success
      // on FL, overwriting scaffold content. Partial/empty runs now route to a
      // side file so the previous good state survives.
      const successRate = draftData && draftData.total > 0
        ? draftData.successful / draftData.total
        : 0;
      if (draftData === null || draftData === undefined) {
        // phaseDraft already logged why (missing API key, no dive data, etc.)
      } else if (draftData.successful === 0) {
        console.log(`\n  ⚠ SAFETY: 0/${draftData.total} drafts succeeded. NOT overwriting drafts.json.`);
        console.log(`  Writing failed run to drafts.failed.json for inspection.`);
        writeFile(dirName, "drafts.failed.json", draftData);
      } else if (successRate < 0.5) {
        console.log(`\n  ⚠ SAFETY: only ${draftData.successful}/${draftData.total} drafts succeeded (${(successRate * 100).toFixed(0)}%). NOT overwriting drafts.json.`);
        console.log(`  Writing partial run to drafts.partial.json for inspection.`);
        writeFile(dirName, "drafts.partial.json", draftData);
      } else {
        writeFile(dirName, "drafts.json", draftData);
      }
    }
  }

  if (shouldRun("report")) {
    if (!exploreData) exploreData = readJson(dirName, "explore.json");
    if (!diveData) diveData = readJson(dirName, "dive.json");
    if (!compareData) compareData = readJson(dirName, "compare.json");
    if (!classifyData) classifyData = readJson(dirName, "classify.json");
    if (!draftData) draftData = readJson(dirName, "drafts.json");
    phaseReport(entity, exploreData, diveData, compareData, classifyData, draftData);
  }

  if (shouldRun("factcheck")) {
    if (!draftData) draftData = readJson(dirName, "drafts.json");
    if (!draftData || !draftData.programs || !draftData.programs.length) {
      console.log(`\n  No drafts to fact-check. Run: --phase draft --run`);
    } else {
      const factcheckData = await phaseFactcheck(entity, draftData);
      if (factcheckData) writeFile(dirName, "factcheck.json", factcheckData);
    }
  }

  // Auto-generate pipeline-summary.ts for the admin dashboard
  generatePipelineSummary(dirName);

  runLintGate(entity, dirName);

  console.log(`\n  Done. ${cost.summary()}\n`);
}

/**
 * Data-quality gate. The generator prompt is the origin of the defect classes
 * benefits-lint checks for — a bad exemplar or a loosened rule reintroduces
 * them silently across every program it drafts, and the damage only surfaces
 * weeks later in a fact-check round. Running the lint here puts the signal
 * where the cause is.
 *
 * Reports by default rather than failing: benefits-batch.js treats a non-zero
 * exit as a FAILED state, so hard-failing would mark healthy runs as broken and
 * disrupt multi-state batches. Pass --lint-strict to make high findings fatal
 * (use it in CI or a deliberate single-state run).
 */
function runLintGate(entity, dirName) {
  const abbrev = (entity.stateCode || dirName || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(abbrev)) return;
  const lintScript = path.resolve(__dirname, "benefits-lint.js");
  if (!fs.existsSync(lintScript)) return;

  let parsed;
  try {
    const out = execFileSync(
      "node",
      [lintScript, `--state=${abbrev}`, "--high", "--json"],
      { encoding: "utf-8", maxBuffer: 20 * 1024 * 1024 },
    );
    parsed = JSON.parse(out);
  } catch (err) {
    console.log(`\n  ⚠ Lint gate could not run: ${err.message.split("\n")[0]}`);
    return;
  }

  const findings = parsed.findings || [];
  if (!findings.length) {
    console.log(`\n  ✓ Lint: no high-severity data defects in ${abbrev}.`);
    return;
  }

  const byCheck = findings.reduce((acc, f) => ((acc[f.check] = (acc[f.check] || 0) + 1), acc), {});
  console.log(`\n  ${"─".repeat(66)}`);
  console.log(`  ⚠ LINT: ${findings.length} high-severity data defect${findings.length === 1 ? "" : "s"} in ${abbrev}`);
  console.log(`  ${"─".repeat(66)}`);
  for (const [check, n] of Object.entries(byCheck).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${check.padEnd(24)} ${n}`);
  }
  for (const f of findings.slice(0, 8)) {
    console.log(`\n    ${f.programId}`);
    console.log(`      ${f.detail}`);
  }
  if (findings.length > 8) console.log(`\n    ...and ${findings.length - 8} more.`);
  console.log(`\n    Full detail: node scripts/benefits-lint.js --state=${abbrev} --high`);
  console.log(`    These reach families through letters. Fix before promoting.`);

  if (LINT_STRICT) {
    console.log(`\n  ✗ --lint-strict set: failing the run.\n`);
    process.exit(1);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Auto-generate data/pipeline-summary.ts from all pipeline compare.json files
// ═══════════════════════════════════════════════════════════════════════════

function generatePipelineSummary(activeDirName = null) {
  const pipelineRoot = path.resolve(__dirname, "..", "data", "pipeline");
  if (!fs.existsSync(pipelineRoot)) return;

  const states = fs.readdirSync(pipelineRoot).filter((d) => {
    return /^[A-Z]{2}$/.test(d) && (
      fs.existsSync(path.join(pipelineRoot, d, "compare.json")) ||
      fs.existsSync(path.join(pipelineRoot, d, "classify.json")) ||
      fs.existsSync(path.join(pipelineRoot, d, "drafts.json"))
    );
  });

  if (!states.length) return;

  const entries = {};
  for (const stateCode of states) {
    const comparePath = path.join(pipelineRoot, stateCode, "compare.json");
    const classifyPath = path.join(pipelineRoot, stateCode, "classify.json");
    const draftsPath = path.join(pipelineRoot, stateCode, "drafts.json");

    const compare = fs.existsSync(comparePath)
      ? JSON.parse(fs.readFileSync(comparePath, "utf-8")) : null;
    const classify = fs.existsSync(classifyPath)
      ? JSON.parse(fs.readFileSync(classifyPath, "utf-8")) : null;
    const drafts = fs.existsSync(draftsPath)
      ? JSON.parse(fs.readFileSync(draftsPath, "utf-8")) : null;

    // Build summary with comparisons that have diffs or novel fields
    const comparisons = (compare?.comparisons || [])
      .filter((c) => c.diffsFound > 0 || (c.novelFields && c.novelFields.length > 0))
      .map((c) => ({
        name: c.name,
        isNew: c.isNew,
        existingId: c.existingId || null,
        diffsFound: c.diffsFound || 0,
        diffs: (c.diffs || []).map((d) => ({
          field: d.field,
          ours: d.ours,
          found: typeof d.found === "string" ? (d.found.length > 100 ? d.found.slice(0, 100) + "..." : d.found) : JSON.stringify(d.found).slice(0, 100),
          source: d.source || undefined,
        })),
        novelFields: (c.novelFields || []).map((nf) => ({
          field: nf.field,
          note: nf.note,
        })),
      }));

    entries[stateCode] = {
      exploredAt: (compare?.comparedAt || "").split("T")[0],
      programsFound: compare?.total || 0,
      newPrograms: compare?.newPrograms || 0,
      diffsFound: compare?.withDiffs || 0,
      novelFieldCount: Object.keys(compare?.novelFieldSummary || {}).length,
      comparisons,
      // Pipeline v2 additions
      classifiedAt: classify?.classifiedAt ? classify.classifiedAt.split("T")[0] : undefined,
      classification: classify ? {
        types: classify.typeSummary || {},
        scopes: classify.scopeSummary || {},
        complexity: classify.complexitySummary || {},
      } : undefined,
      draftedAt: drafts?.draftedAt ? drafts.draftedAt.split("T")[0] : undefined,
      draftsGenerated: drafts?.successful || 0,
      draftsTotal: drafts?.total || 0,
    };
  }

  // Write TypeScript file
  const tsContent = `/**
 * Pipeline exploration summary — AUTO-GENERATED by benefits-pipeline.js
 * Do not edit manually. Regenerated after each pipeline run.
 *
 * Last updated: ${new Date().toISOString()}
 */

export interface PipelineDiff {
  field: string;
  ours: string;
  found: string;
  source?: string;
}

export interface PipelineComparison {
  name: string;
  isNew: boolean;
  existingId: string | null;
  diffsFound: number;
  diffs: PipelineDiff[];
  novelFields: { field: string; note: string }[];
}

export interface PipelineClassification {
  types: Record<string, number>;
  scopes: Record<string, number>;
  complexity: Record<string, number>;
}

export interface PipelineStateSummary {
  exploredAt: string;
  programsFound: number;
  newPrograms: number;
  diffsFound: number;
  novelFieldCount: number;
  comparisons: PipelineComparison[];
  classifiedAt?: string;
  classification?: PipelineClassification;
  draftedAt?: string;
  draftsGenerated?: number;
  draftsTotal?: number;
}

export const pipelineData: Record<string, PipelineStateSummary> = ${JSON.stringify(entries, null, 2)};
`;

  const outPath = path.resolve(__dirname, "..", "data", "pipeline-summary.ts");
  fs.writeFileSync(outPath, tsContent);
  console.log(`\n  → Updated ${outPath} (${states.length} state${states.length > 1 ? "s" : ""})`);

  // Also generate pipeline-drafts.ts barrel + the current state's per-state file
  generatePipelineDrafts({ dirName: activeDirName });
}

// ═══════════════════════════════════════════════════════════════════════════
// Pipeline drafts generator — partitioned per state
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Read a per-state drafts.json and produce a cleaned entry suitable for the
 * runtime map. Returns null when the state has no valid drafts.
 *
 * Cleaning:
 *   - drop programs with `_error` / `_parseError`
 *   - strip the `_raw` field
 *   - repair incomeTable: require numeric householdSize + monthlyLimit; drop
 *     empty tables
 *
 * Preserves: `/^[A-Z]{2}$/` state vs. region keying (regions use entitySlug).
 */
function cleanStateEntry(dirName, pipelineRoot) {
  const draftsPath = path.join(pipelineRoot, dirName, "drafts.json");
  if (!fs.existsSync(draftsPath)) return null;

  const drafts = JSON.parse(fs.readFileSync(draftsPath, "utf-8"));
  const programs = (drafts.programs || [])
    .filter((p) => !p._error && !p._parseError)
    .map((p) => {
      const { _raw, ...clean } = p;
      if (clean.structuredEligibility?.incomeTable) {
        clean.structuredEligibility.incomeTable = clean.structuredEligibility.incomeTable
          .filter((row) => typeof row.householdSize === "number" && typeof row.monthlyLimit === "number")
          .map((row) => ({
            householdSize: row.householdSize,
            monthlyLimit: row.monthlyLimit,
            ...(row.annualLimit && typeof row.annualLimit === "number" ? { annualLimit: row.annualLimit } : {}),
          }));
        if (clean.structuredEligibility.incomeTable.length === 0) {
          clean.structuredEligibility.incomeTable = null;
        }
      }
      return clean;
    });

  if (!programs.length) return null;

  const isState = /^[A-Z]{2}$/.test(dirName);
  const key = isState ? dirName : (drafts.entitySlug || dirName);

  const entry = {
    draftedAt: (drafts.draftedAt || "").split("T")[0],
    programs,
    stateOverview: drafts.stateOverview || null,
    ...(isState ? {} : {
      regionName: drafts.entity || dirName,
      parentState: drafts.state || null,
      slug: drafts.entitySlug || dirName,
      isRegion: true,
    }),
  };

  return { dirName, key, entry };
}

/**
 * Convert a directory name into a safe JS identifier for import aliases.
 * Always prefixed with `_` so leading digits ("90210-zip") and reserved
 * words ("class", "import") can't produce a syntactically invalid binding.
 *   "AK" → "_AK"
 *   "miami-dade-county-fl" → "_miami_dade_county_fl"
 *   "90210-zip" → "_90210_zip"
 */
function identSafe(dirName) {
  return "_" + dirName.replace(/[^A-Za-z0-9_]/g, "_");
}

/**
 * Write a single per-state file at data/pipeline/{dirName}/drafts.ts.
 * Atomic: writes to a .tmp file then renames, so partial writes can't corrupt
 * a previously-good file.
 */
function writePerStateDraftFile(record) {
  const body = `/**
 * Pipeline drafts for ${record.dirName} — AUTO-GENERATED by scripts/benefits-pipeline.js.
 * Do not edit manually. Regenerated from data/pipeline/${record.dirName}/drafts.json
 * after each pipeline run for this state, or via --regen-index.
 *
 * Last updated: ${new Date().toISOString()}
 */
import type { PipelineStateDrafts } from "../../pipeline-drafts-types";

export const drafts: PipelineStateDrafts = ${JSON.stringify(record.entry, null, 2)};
`;

  const outDir = path.resolve(__dirname, "..", "data", "pipeline", record.dirName);
  const outPath = path.join(outDir, "drafts.ts");
  const tmpPath = outPath + ".tmp";
  fs.writeFileSync(tmpPath, body);
  fs.renameSync(tmpPath, outPath);
}

/**
 * Write the data/pipeline-drafts.ts barrel. Always rewrites from the full
 * current set of records (cheap, order-stable, picks up added/removed dirs
 * automatically).
 */
function writeDraftsBarrel(records) {
  const sorted = [...records].sort((a, b) => a.dirName.localeCompare(b.dirName));

  // Assert no import-identifier collisions
  const seenIdent = new Map();
  for (const r of sorted) {
    const ident = identSafe(r.dirName);
    if (seenIdent.has(ident)) {
      throw new Error(
        `Barrel generation aborted: dir names '${seenIdent.get(ident)}' and '${r.dirName}' both sanitize to '${ident}'. Rename one.`
      );
    }
    seenIdent.set(ident, r.dirName);
  }

  const imports = sorted
    .map((r) => `import { drafts as ${identSafe(r.dirName)} } from "./pipeline/${r.dirName}/drafts";`)
    .join("\n");
  const mapEntries = sorted
    .map((r) => `  ${JSON.stringify(r.key)}: ${identSafe(r.dirName)},`)
    .join("\n");

  const body = `/**
 * Pipeline draft content — barrel over per-state draft modules.
 *
 * The type re-export block below is hand-maintained. The import block and
 * \`pipelineDrafts\` const are AUTO-GENERATED by scripts/benefits-pipeline.js
 * from the directory listing of data/pipeline/*\\/drafts.ts. To re-render:
 *   node scripts/benefits-pipeline.js --regen-index
 *
 * Last updated: ${new Date().toISOString()}
 */
export type {
  PipelineDraft,
  PipelineStateOverview,
  PipelineStateDrafts,
} from "./pipeline-drafts-types";

import type { PipelineStateDrafts } from "./pipeline-drafts-types";

// AUTO-GENERATED IMPORTS — BEGIN
${imports}
// AUTO-GENERATED IMPORTS — END

// AUTO-GENERATED MAP — BEGIN
export const pipelineDrafts: Record<string, PipelineStateDrafts> = {
${mapEntries}
};
// AUTO-GENERATED MAP — END
`;

  const outPath = path.resolve(__dirname, "..", "data", "pipeline-drafts.ts");
  const tmpPath = outPath + ".tmp";
  fs.writeFileSync(tmpPath, body);
  fs.renameSync(tmpPath, outPath);
}

/**
 * Main entry point for drafts generation.
 *
 *   generatePipelineDrafts({ dirName: "AL" })   → writes only AL/drafts.ts + barrel
 *   generatePipelineDrafts({ regenAll: true })  → writes every state's drafts.ts + barrel
 *   generatePipelineDrafts()                    → writes only the barrel
 *
 * The barrel is always rewritten: it's cheap, order-stable, and picks up
 * directory additions/removals automatically.
 */
function generatePipelineDrafts({ dirName = null, regenAll = false } = {}) {
  const pipelineRoot = path.resolve(__dirname, "..", "data", "pipeline");
  if (!fs.existsSync(pipelineRoot)) return;

  const allDirs = fs.readdirSync(pipelineRoot)
    .filter((d) => {
      const full = path.join(pipelineRoot, d);
      return fs.statSync(full).isDirectory() && fs.existsSync(path.join(full, "drafts.json"));
    })
    .sort();

  const allRecords = allDirs
    .map((d) => cleanStateEntry(d, pipelineRoot))
    .filter(Boolean);

  if (!allRecords.length) return;

  if (regenAll) {
    for (const r of allRecords) writePerStateDraftFile(r);
    writeDraftsBarrel(allRecords);
    console.log(`  → Regenerated ${allRecords.length} per-state drafts.ts + barrel`);
    return;
  }

  if (dirName) {
    const record = allRecords.find((r) => r.dirName === dirName);
    if (record) {
      writePerStateDraftFile(record);
      console.log(`  → Updated data/pipeline/${dirName}/drafts.ts`);
    }
  }

  writeDraftsBarrel(allRecords);
  console.log(`  → Updated data/pipeline-drafts.ts (${allRecords.length} entries)`);
}

module.exports = {
  STATE_NAMES,
  resolveEntity,
  phaseDive,
  phaseCompare,
  phaseClassify,
  runConcurrent,
  cost,
  readJson,
  writeFile,
  extractJson,
  loadExistingPrograms,
  buildProgramDraftPrompt,
  finalizeProgramDraft,
  buildStateOverviewPrompt,
  finalizeStateOverview,
  generatePipelineSummary,
  generatePipelineDrafts,
  phaseFactcheck,
  claudeChat,
  CONTENT_VOICE_PROMPT,
};

if (require.main === module) {
  main().catch((err) => {
    console.error(`\n  Fatal: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  });
}
