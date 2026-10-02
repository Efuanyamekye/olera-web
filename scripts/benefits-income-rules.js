#!/usr/bin/env node
/**
 * Turn scraped income dollars into rules.
 *
 * Most income limits in the drafts are a federal formula: a percentage of the
 * poverty guideline (SNAP 130% or 200%, QMB 100%, SLMB 120%, QI 135%, LIHEAP
 * 150%, weatherization 200%) or of the SSI benefit rate (long-term care
 * Medicaid at 300%). The dollars change every year; the percentage rarely
 * does. On 2 Oct 2026 a fresh fact-check "corrected" 105 income limits, and
 * 84 of them were two correct-looking tiers disagreeing (200% vs 100%, gross
 * vs net), which no dollar scrape can settle.
 *
 * This script reads each draft's incomeTable, finds the tier it sits on (all
 * household sizes within 2%, with or without the $20 Medicare disregard), and
 * records it as structuredEligibility.incomeRule:
 *   { basis: "FPL" | "SSI", percent, year, disregard, confidence: "derived" }
 * The dollars stay; the rule is what gets verified from now on, and
 * data/pipeline/federal-thresholds.json is what gets updated yearly.
 *
 * Usage: node scripts/benefits-income-rules.js            # report
 *        node scripts/benefits-income-rules.js --apply    # write incomeRule
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', 'data', 'pipeline');
const T = JSON.parse(fs.readFileSync(path.join(ROOT, 'federal-thresholds.json'), 'utf8'));
const APPLY = process.argv.includes('--apply');
const PCTS = [100, 120, 125, 130, 133, 135, 138, 150, 160, 165, 175, 185, 200, 250, 300, 400];
const TOL = 0.035;

function fplMonthly(year, st, size) { const [a, b] = T.fpl[year][st === 'AK' ? 'AK' : st === 'HI' ? 'HI' : '48']; return (a + b * (size - 1)) / 12; }
function near(v, m) { return Math.abs(v - m) / m <= TOL; }

function detect(table, st) {
  const rows = (table || []).filter((r) => r && r.householdSize && r.monthlyLimit > 0);
  if (!rows.length) return null;
  const hits = [];
  for (const year of Object.keys(T.fpl)) for (const pct of PCTS) for (const dis of [0, 20]) {
    if (rows.every((r) => near(r.monthlyLimit, fplMonthly(year, st, r.householdSize) * pct / 100 + dis))) hits.push({ basis: 'FPL', percent: pct, year: Number(year), disregard: dis });
  }
  for (const year of Object.keys(T.ssi)) for (const pct of [100, 300]) {
    const s = T.ssi[year]; const ok = rows.every((r) => (r.householdSize === 1 && near(r.monthlyLimit, s.individual * pct / 100)) || (r.householdSize === 2 && near(r.monthlyLimit, s.couple * pct / 100)) || r.householdSize > 2);
    if (ok && rows.some((r) => r.householdSize <= 2)) hits.push({ basis: 'SSI', percent: pct, year: Number(year), disregard: 0 });
  }
  if (!hits.length) return null;
  // Prefer the current year and no disregard when several fit.
  hits.sort((a, b) => (b.year - a.year) || (a.disregard - b.disregard));
  return hits[0];
}

const c = { programs: 0, withTable: 0, onRule: 0, fpl: 0, ssi: 0, lastYear: 0, offRule: 0 };
const off = [];
for (const st of fs.readdirSync(ROOT).filter((d) => /^[A-Z]{2}$/.test(d))) {
  const p = path.join(ROOT, st, 'drafts.json'); const d = JSON.parse(fs.readFileSync(p, 'utf8')); let changed = false;
  for (const prog of d.programs) {
    c.programs++;
    const se = prog.structuredEligibility; if (!se || !se.incomeTable || !se.incomeTable.length) continue;
    c.withTable++;
    const rule = detect(se.incomeTable, st);
    if (!rule) { c.offRule++; if (off.length < 12) off.push(`${st} ${prog.id}: ${se.incomeTable.map((r) => r.monthlyLimit).join('/')}`); continue; }
    c.onRule++; c[rule.basis.toLowerCase()]++; if (rule.year < 2026) c.lastYear++;
    if (APPLY) { se.incomeRule = { ...rule, confidence: 'derived', derivedAt: new Date().toISOString().slice(0, 10) }; changed = true; }
  }
  if (APPLY && changed) fs.writeFileSync(p, JSON.stringify(d, null, 2) + '\n');
}
console.log(JSON.stringify(c)); console.log('off any tier (sample):'); console.log(off.join('\n'));
