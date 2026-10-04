#!/usr/bin/env node
/**
 * Settle queued phone flags against the page the flag cites.
 *
 * The fact-check judge (benefits-apply-factcheck.js) never applies a phone on
 * its own: a scrape saying "the number is X" is a claim, not evidence. This
 * script fetches the official page the flag cites and reads the numbers on
 * it, which is what a person did for DC on 3 Oct 2026. Three outcomes:
 *
 *   apply       the proposed number is on the page and the draft has no
 *               usable number at all (a short code, a blank): the page wins.
 *               Written to program.phone and the first contact card.
 *   add         the proposed number is on the page and the draft carries a
 *               different one that the page does not show. The page's number
 *               is added as a second contact card and the draft's stays
 *               primary. A page that lists only the agency switchboard must
 *               not overwrite a program helpline (Florida's and Iowa's pages
 *               do exactly that, found in the 4 Oct 2026 dry run), and a
 *               machine cannot tell a dead line from a specific one. A person
 *               can still swap them; the evidence is in appliedCorrections.
 *   dismiss     the proposed number AND one of the draft's numbers are both
 *               on the page: the page lists several lines and ours is one of
 *               them. Recorded in dismissedFlags so the judge stops
 *               re-queueing it every week.
 *   unconfirmed the page could not be read (PDF, blocked, down) or does not
 *               show the proposed number. Stays queued for a person.
 *
 *   node scripts/benefits-verify-queue.js                 # dry run, all states
 *   node scripts/benefits-verify-queue.js --states NH,NJ  # only these
 *   node scripts/benefits-verify-queue.js --apply         # write drafts.json + regenerate
 *
 * Costs nothing: plain fetches of public pages, no model calls.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'data', 'pipeline');
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ONLY = (() => { const i = args.indexOf('--states'); return i >= 0 && args[i + 1] ? new Set(args[i + 1].split(/[,\s]+/).filter(Boolean)) : null; })();
const CONCURRENCY = 6;
const TODAY = new Date().toISOString().slice(0, 10);
const SHORT_CODES = new Set(['211', '311', '511', '911', '988']);

function digits(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') d = d.slice(1);
  return d;
}
function fmt(d) { return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`; }
/** Every 10-digit US number on a page, as digit strings. */
function phonesOn(text) {
  const out = new Set();
  const re = /(?:\+?1[\s.-]?)?\(?\b(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})\b/g;
  let m;
  while ((m = re.exec(text))) out.add(m[1] + m[2] + m[3]);
  return out;
}
/** The numbers a draft currently carries: the program line, every contact card, every string. */
function draftPhones(draft) {
  const out = new Set();
  const add = (v) => { const d = digits(v); if (d.length === 10) out.add(d); };
  add(draft.phone);
  for (const c of draft.contacts || []) add(c && c.phone);
  return out;
}
/** Replace one number wherever it is written, in any common format, in any string field. */
function replaceEverywhere(o, oldD, newFmt) {
  const re = new RegExp(`(?:\\+?1[\\s.-]?)?\\(?${oldD.slice(0, 3)}\\)?[\\s.-]?${oldD.slice(3, 6)}[\\s.-]?${oldD.slice(6)}`, 'g');
  let n = 0;
  const walk = (x, k, parent) => {
    if (typeof x === 'string') { if (re.test(x)) { parent[k] = x.replace(re, newFmt); n++; } }
    else if (Array.isArray(x)) x.forEach((v, i) => walk(v, i, x));
    else if (x && typeof x === 'object') for (const key of Object.keys(x)) walk(x[key], key, x);
  };
  walk(o, null, null);
  return n;
}

const cache = new Map();
async function readPage(url) {
  if (cache.has(url)) return cache.get(url);
  let result;
  if (/\.pdf(\?|$)/i.test(url)) result = { ok: false, why: 'pdf' };
  else {
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X) OleraBenefitsVerifier/1.0', accept: 'text/html,*/*' }, redirect: 'follow', signal: AbortSignal.timeout(25000) });
      if (!r.ok) result = { ok: false, why: `http ${r.status}` };
      else {
        const html = await r.text();
        // tel: links carry the number even when the visible text is an image or a button.
        const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/href="tel:([^"]+)"/gi, ' $1 ').replace(/<[^>]+>/g, ' ');
        result = { ok: true, phones: phonesOn(text) };
      }
    } catch (e) { result = { ok: false, why: e.name === 'TimeoutError' ? 'timeout' : (e.cause && e.cause.code) || e.name }; }
  }
  cache.set(url, result);
  return result;
}

async function main() {
  const states = fs.readdirSync(ROOT).filter((d) => /^[A-Z]{2}$/.test(d) && fs.existsSync(path.join(ROOT, d, 'drafts.json')) && (!ONLY || ONLY.has(d))).sort();
  const jobs = [];
  for (const st of states) {
    const draftsPath = path.join(ROOT, st, 'drafts.json');
    const drafts = JSON.parse(fs.readFileSync(draftsPath, 'utf8'));
    for (const draft of drafts.programs) for (const item of draft.reviewQueue || []) if (item.field === 'phone') jobs.push({ st, drafts, draftsPath, draft, item });
  }
  const out = { apply: [], add: [], dismiss: [], unconfirmed: [] };
  let i = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (i < jobs.length) {
      const job = jobs[i++];
      const { st, draft, item } = job;
      const to = digits(item.to);
      const label = `${st} ${draft.id}: ${fmt(digits(draft.phone || '')) || draft.phone || '(none)'} -> ${to.length === 10 ? fmt(to) : item.to}`;
      if (to.length !== 10 || SHORT_CODES.has(to)) { out.unconfirmed.push({ job, label, why: 'proposed value is not a 10-digit number' }); continue; }
      if (!item.source) { out.unconfirmed.push({ job, label, why: 'no source' }); continue; }
      const page = await readPage(item.source);
      if (!page.ok) { out.unconfirmed.push({ job, label, why: `page unreadable (${page.why})` }); continue; }
      if (!page.phones.has(to)) { out.unconfirmed.push({ job, label, why: 'proposed number is not on the page' }); continue; }
      const ours = draftPhones(draft);
      const oursOnPage = [...ours].filter((d) => page.phones.has(d));
      if (oursOnPage.length) out.dismiss.push({ job, label, why: `page also lists ours (${oursOnPage.map(fmt).join(', ')})` });
      else if (ours.has(to)) out.dismiss.push({ job, label, why: 'draft already carries the proposed number' });
      else if (!ours.size) out.apply.push({ job, label, why: 'proposed number is on the page; the draft has no usable number' });
      else out.add.push({ job, label, why: 'proposed number is on the page; the draft\'s is not, so both are kept' });
    }
  }));

  if (APPLY) {
    const touched = new Map();
    const settle = (job, item) => { const { draft } = job; draft.reviewQueue = (draft.reviewQueue || []).filter((q) => q !== item); if (!draft.reviewQueue.length) draft.reviewQueue = null; draft.lastVerifiedDate = TODAY; touched.set(job.st, job); };
    for (const { job } of out.apply) {
      const { draft, item } = job;
      const toFmt = fmt(digits(item.to));
      const oldPrimary = digits(draft.phone || '');
      const replaced = oldPrimary.length === 10 ? replaceEverywhere(draft, oldPrimary, toFmt) : 0;
      draft.phone = toFmt;
      if (draft.contacts && draft.contacts.length) draft.contacts[0].phone = toFmt;
      (draft.appliedCorrections = draft.appliedCorrections || []).push({ field: 'phone', from: item.from, to: toFmt, source: item.source, flaggedAt: item.flaggedAt, appliedAt: TODAY, appliedBy: 'page-verifier', note: `The number appears on the cited official page; the draft had no usable number${replaced ? ` (replaced in ${replaced} field${replaced === 1 ? '' : 's'})` : ''}.` });
      settle(job, item);
    }
    for (const { job } of out.add) {
      const { draft, item } = job;
      const toFmt = fmt(digits(item.to));
      const host = item.source.replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '');
      (draft.contacts = draft.contacts || []).push({ label: 'Program web page', phone: toFmt, description: `Number listed on ${host}`, hours: null });
      (draft.appliedCorrections = draft.appliedCorrections || []).push({ field: 'phone_added', from: item.from, to: toFmt, source: item.source, flaggedAt: item.flaggedAt, appliedAt: TODAY, appliedBy: 'page-verifier', note: `The number appears on the cited official page and the draft's does not; added as a second contact, the draft's number kept as primary. A person decides whether to swap them.` });
      settle(job, item);
    }
    for (const { job, why } of out.dismiss) {
      const { draft, item } = job;
      (draft.dismissedFlags = draft.dismissedFlags || []).push({ field: 'phone', proposed: String(item.to), source: item.source, reason: why, dismissedAt: TODAY });
      settle(job, item);
    }
    for (const [st, job] of touched) {
      fs.writeFileSync(job.draftsPath, JSON.stringify(job.drafts, null, 2) + '\n');
      console.log(`  wrote ${st}/drafts.json`);
    }
    if (touched.size) {
      const { generatePipelineDrafts } = require('./benefits-pipeline.js');
      for (const st of touched.keys()) generatePipelineDrafts({ dirName: st });
      console.log(`  regenerated ${touched.size} state module${touched.size === 1 ? '' : 's'}`);
    }
  }

  const byWhy = (list) => list.reduce((m, x) => ((m[x.why.replace(/\(.*\)/, '').trim()] = (m[x.why.replace(/\(.*\)/, '').trim()] || 0) + 1), m), {});
  console.log(`\nphone flags: ${jobs.length}`);
  console.log(`${APPLY ? 'APPLIED' : 'WOULD APPLY'}: ${out.apply.length}`);
  console.log(`${APPLY ? 'ADDED AS SECOND CONTACT' : 'WOULD ADD AS SECOND CONTACT'}: ${out.add.length}`);
  console.log(`${APPLY ? 'DISMISSED' : 'WOULD DISMISS'}: ${out.dismiss.length}`);
  console.log(`UNCONFIRMED: ${out.unconfirmed.length}`, byWhy(out.unconfirmed));
  console.log('\n-- apply --'); for (const x of out.apply) console.log(`  ${x.label}  ${x.job.item.source}`);
  console.log('\n-- add --'); for (const x of out.add) console.log(`  ${x.label}  ${x.job.item.source}`);
  console.log('\n-- dismiss --'); for (const x of out.dismiss) console.log(`  ${x.label}  ${x.why}`);
  console.log('\n-- unconfirmed --'); for (const x of out.unconfirmed) console.log(`  ${x.label}  ${x.why}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
