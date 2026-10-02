#!/usr/bin/env node
/**
 * Apply fact-check corrections to the program drafts.
 *
 * The pipeline's factcheck phase (scripts/benefits-pipeline.js --phase
 * factcheck) compares each draft's facts with fresh sources and writes
 * data/pipeline/{ST}/factcheck.json. Until this script, those flags sat
 * unapplied: on 2 Oct 2026 there were 241 open flags (98 high), and a limit
 * the check had verified on a state's own page was still wrong on the site.
 *
 * This is the judge the adversary was missing. For each flag it decides:
 *
 *   apply   — the verified value comes from an OFFICIAL source (a .gov or
 *             state-agency page), the field is a numeric limit we hold in
 *             structuredEligibility, and the new value is within sanity
 *             bounds of the old one. Written into drafts.json with an entry
 *             in the program's appliedCorrections log and a fresh
 *             lastVerifiedDate.
 *   review  — everything else: phones (a wrong number sends a family to a
 *             dead end, so a person confirms them), non-official sources
 *             (aggregators have been wrong where the draft was right), age
 *             strings, and values outside the sanity bounds.
 *
 * Usage:
 *   node scripts/benefits-apply-factcheck.js            # dry run, prints the plan
 *   node scripts/benefits-apply-factcheck.js --apply    # writes drafts.json
 *   node scripts/benefits-apply-factcheck.js --review   # prints the review list with sources
 *   node scripts/benefits-apply-factcheck.js --phones   # also apply official-sourced phone flags
 *
 * After --apply, regenerate the generated modules:
 *   node scripts/benefits-pipeline.js --regen-index
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'data', 'pipeline');
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const REVIEW = args.includes('--review');
const PHONES = args.includes('--phones');
const TODAY = new Date().toISOString().slice(0, 10);

// Official: federal and state government, plus the few state agencies that
// publish outside .gov. Anything else is treated as an aggregator.
const OFFICIAL_HOSTS = /(\.gov|\.us|\.mil)$/i;
const OFFICIAL_EXTRA = /(^|\.)(myflorida\.com|benefitscal\.com|healthearizonaplus\.gov|mybenefits\.ny\.gov|accesshra\.nyc\.gov|dhs\.state\.[a-z]{2}\.us|211\.org|medicare\.gov|ssa\.gov|cms\.gov|acl\.gov)$/i;
function isOfficial(url) {
  if (!url) return false;
  try {
    const h = new URL(url).hostname.toLowerCase();
    return OFFICIAL_HOSTS.test(h) || OFFICIAL_EXTRA.test(h);
  } catch { return false; }
}
function sourceFor(verified, field) {
  const s = (verified && verified.sources) || {};
  if (field.startsWith('income')) return s.income || null;
  if (field.startsWith('assets')) return s.assets || null;
  if (field === 'age') return s.age || null;
  if (field === 'phone') return s.phone || null;
  return null;
}
function fmtPhone(v) {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === '1') return fmtPhone(d.slice(1));
  return null;
}

const plan = { apply: [], review: [], skipped: 0 };
const states = fs.readdirSync(ROOT).filter((d) => /^[A-Z]{2}$/.test(d) && fs.existsSync(path.join(ROOT, d, 'factcheck.json')));

for (const st of states) {
  const fc = JSON.parse(fs.readFileSync(path.join(ROOT, st, 'factcheck.json'), 'utf8'));
  const draftsPath = path.join(ROOT, st, 'drafts.json');
  const drafts = JSON.parse(fs.readFileSync(draftsPath, 'utf8'));
  const byId = new Map(drafts.programs.map((p) => [p.id, p]));
  let changed = false;

  for (const pr of fc.programs || []) {
    const draft = byId.get(pr.programId);
    if (!draft) { plan.skipped++; continue; }
    const already = new Set((draft.appliedCorrections || []).map((c) => `${c.field}:${c.flaggedAt}`));
    for (const f of pr.flags || []) {
      if (f.severity === 'info') continue;
      const key = `${f.field}:${fc.checkedAt}`;
      if (already.has(key)) continue;
      const src = sourceFor(pr.verified, f.field);
      const item = { state: st, programId: pr.programId, program: pr.programName, field: f.field, severity: f.severity, from: f.draftValue, to: f.verifiedValue, source: src, official: isOfficial(src) };
      let decision = 'review', why = '';

      if (!src || !item.official) { why = src ? 'aggregator source' : 'no source'; }
      else if (/^(income_1|income_2|assets_individual|assets_couple)$/.test(f.field)) {
        const to = Number(f.verifiedValue), from = Number(f.draftValue);
        if (!Number.isFinite(to) || to <= 0) why = 'verified value not a number';
        else if (Number.isFinite(from) && from > 0 && (to / from > 3 || to / from < 1 / 3)) why = 'outside sanity bounds (3x)';
        else decision = 'apply';
      } else if (f.field === 'phone') {
        const to = fmtPhone(f.verifiedValue);
        if (!to) why = 'not a 10-digit number';
        else if (PHONES) decision = 'apply';
        else why = 'phone (run with --phones to apply official ones)';
      } else { why = `field ${f.field} is applied by hand`; }

      item.why = why;
      (decision === 'apply' ? plan.apply : plan.review).push(item);

      if (decision === 'apply' && APPLY) {
        const se = (draft.structuredEligibility = draft.structuredEligibility || { summary: [] });
        const log = (draft.appliedCorrections = draft.appliedCorrections || []);
        let applied = false;
        if (f.field === 'income_1' || f.field === 'income_2') {
          const size = f.field === 'income_1' ? 1 : 2;
          se.incomeTable = se.incomeTable || [];
          const row = se.incomeTable.find((r) => r.householdSize === size);
          if (row) { row.monthlyLimit = Number(f.verifiedValue); applied = true; }
          else { se.incomeTable.push({ householdSize: size, monthlyLimit: Number(f.verifiedValue) }); se.incomeTable.sort((a, b) => a.householdSize - b.householdSize); applied = true; }
        } else if (f.field === 'assets_individual' || f.field === 'assets_couple') {
          se.assetLimits = se.assetLimits || {};
          se.assetLimits[f.field === 'assets_individual' ? 'individual' : 'couple'] = Number(f.verifiedValue);
          applied = true;
        } else if (f.field === 'phone') {
          const to = fmtPhone(f.verifiedValue);
          if (draft.contacts && draft.contacts.length && draft.contacts[0].phone) draft.contacts[0].phone = to; else draft.phone = to;
          applied = true;
        }
        if (applied) {
          log.push({ field: f.field, from: f.draftValue, to: f.verifiedValue, source: src, flaggedAt: fc.checkedAt, appliedAt: TODAY, appliedBy: 'factcheck-judge' });
          draft.lastVerifiedDate = TODAY;
          changed = true;
        }
      }
    }
  }
  if (changed && APPLY) {
    fs.writeFileSync(draftsPath, JSON.stringify(drafts, null, 2) + '\n');
    console.log(`  wrote ${st}/drafts.json`);
  }
}

const byField = (list) => list.reduce((m, i) => ((m[i.field] = (m[i.field] || 0) + 1), m), {});
const byWhy = (list) => list.reduce((m, i) => ((m[i.why] = (m[i.why] || 0) + 1), m), {});
console.log(`\n${APPLY ? 'APPLIED' : 'WOULD APPLY'}: ${plan.apply.length}`, byField(plan.apply));
console.log(`REVIEW: ${plan.review.length}`, byWhy(plan.review));
console.log(`skipped (program not in drafts): ${plan.skipped}`);
if (!APPLY || REVIEW) {
  console.log('\n-- apply list --');
  for (const i of plan.apply) console.log(`${i.state} ${i.programId} ${i.field}: ${i.from} -> ${i.to}  [${i.severity}] ${i.source}`);
}
if (REVIEW) {
  console.log('\n-- review list --');
  for (const i of plan.review) console.log(`${i.state} ${i.programId} ${i.field}: ${JSON.stringify(i.from)} -> ${JSON.stringify(i.to)}  [${i.severity}] ${i.why} ${i.source || ''}`);
}
