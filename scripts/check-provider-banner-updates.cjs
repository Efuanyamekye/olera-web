/* Behavioral regression checks for the dashboard update queue.
 * Run: node scripts/check-provider-banner-updates.cjs
 */
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { Window } = require('happy-dom');
const React = require('react');
const { createRoot } = require('react-dom/client');

async function main() {
  const window = new Window({ url: 'http://localhost' });
  Object.assign(globalThis, { window, document: window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const events = [];
  globalThis.fetch = async (_url, options) => { if (options?.body) events.push(JSON.parse(options.body)); return { ok: true }; };
  const bundled = await build({
    stdin: { contents: 'export { default } from "./components/provider-dashboard/v2/DashboardHero"; export { default as Skeleton } from "./components/provider-dashboard/v2/DashboardHeroSkeleton";', loader: 'ts', resolveDir: process.cwd() }, bundle: true,
    platform: 'node', format: 'cjs', write: false, packages: 'external',
    plugins: [{ name: 'dashboard-services', setup(build) {
      build.onResolve({ filter: /^(next\/link|@\/hooks\/use-managed-ads-variant|@\/lib\/analytics\/track-provider-event|@\/lib\/ad-boost\/boost-state)$/ }, args => ({ path: args.path, namespace: 'mock' }));
      build.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents:
        args.path === 'next/link' ? 'import React from "react"; export default ({children, ...props}) => React.createElement("a", props, children);' :
        'export const useManagedAdsVariant = () => "direct_reach"; export const isManagedAdsPreviewMode = () => false; export const trackProviderEvent = () => {}; export const prefetchBoostState = () => {};', loader: 'js', resolveDir: process.cwd() }));
    }}],
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', bundled.outputFiles[0].text)(require, module, module.exports);
  const Hero = module.exports.default;
  const skeletonHTML = () => require('react-dom/server').renderToStaticMarkup(React.createElement(module.exports.Skeleton, { firstName: 'Aggie', providerSlug: 'aggie' }));
  const host = document.createElement('div'); document.body.append(host);
  let root = createRoot(host);
  let reportedAction;
  const data = {
    greeting: { newLeadsThisPeriod: 2, unansweredQuestions: 7, fiveMostRecentUnanswered: [{ id: 'q1', createdAt: '2026-09-13T10:00:00Z' }], viewsThisPeriod: 2, viewsPriorPeriod: 1, deltaPct: null },
    questions: { received: 11 }, recentActivity: [{ kind: 'lead', id: 'lead1', timestamp: '2026-09-13T10:00:00Z' }], nearbyFamilies: { count: 0 }, campaign: null,
  };
  let props = { firstName: 'Aggie', providerSlug: 'aggie', data,
    completeness: { overall: 100, sections: [], boosters: { reviews: null, responseRate: null } }, category: null,
    onOpenSection() {}, onHeroAction(action) { reportedAction = action; } };
  const render = async () => React.act(async () => { root.render(React.createElement(Hero, props)); });
  const button = label => host.querySelector(`button[aria-label="${label}"]`);
  const click = async element => { assert.ok(element); await React.act(async () => element.click()); };
  const dismiss = () => click(button('Dismiss this update for today'));
  const headline = () => host.querySelector('[aria-live="polite"]')?.textContent;
  await render();
  assert.match(headline(), /2 new inquiries/);
  await click(button('Next update'));
  assert.match(headline(), /7 questions/);
  assert.equal(reportedAction.href, '/provider/qna');
  await click(button('Previous update'));
  assert.match(headline(), /2 new inquiries/);
  assert.equal(events.filter(event => event.event_type === 'provider_picker_impression' && event.metadata.banner === 'leads').length, 1);
  await dismiss();
  assert.match(headline(), /7 questions/);
  await dismiss();
  assert.doesNotMatch(headline(), /questions/);
  // Answering the newest question exposes an older question, not new activity.
  props = { ...props, data: { ...data, greeting: { ...data.greeting,
    unansweredQuestions: 6, fiveMostRecentUnanswered: [{ id: 'older', createdAt: '2026-09-12T10:00:00Z' }] } } };
  await render();
  for (let i = 0; i < 4; i++) {
    assert.doesNotMatch(headline(), /questions/);
    await click(button('Next update'));
  }
  // Same counts, new question ID: the dismissed question update qualifies again.
  props = { ...props, data: { ...data, greeting: { ...data.greeting, fiveMostRecentUnanswered: [{ id: 'q2', createdAt: '2026-09-13T11:00:00Z' }] } } };
  await render();
  for (let i = 0; i < 10 && !headline().includes('questions'); i++) await click(button('Next update'));
  assert.match(headline(), /questions/);
  await dismiss();
  let guard = 10;
  while (button('Dismiss this update for today') && guard--) await dismiss();
  assert.ok(guard > 0);
  assert.equal(reportedAction, null);
  assert.equal(JSON.parse(window.localStorage.getItem('olera_hero_updates_v2:aggie')).collapsed, true);
  assert.match(document.activeElement.textContent, /View updates/);
  assert.match(skeletonHTML(), /Checking updates/);
  assert.doesNotMatch(skeletonHTML(), /bg-warm-950/);
  // Dismissals survive remount and do not affect another provider.
  await React.act(async () => root.unmount()); root = createRoot(host); await render();
  assert.match(host.textContent, /View updates/);
  props = { ...props, providerSlug: 'other-provider' }; await render();
  assert.match(headline(), /2 new inquiries/);
  props = { ...props, providerSlug: 'aggie' }; await render();
  await click(host.querySelector('button'));
  assert.match(headline(), /2 new inquiries/);
  assert.equal(document.activeElement.getAttribute('aria-label'), 'Dismiss this update for today');
  assert.equal(JSON.parse(window.localStorage.getItem('olera_hero_updates_v2:aggie')).collapsed, false);
  assert.match(skeletonHTML(), /bg-warm-950/);
  // Expired state is ignored on remount.
  window.localStorage.setItem('olera_hero_updates_v2:aggie', JSON.stringify({ day: '2000-01-01', keys: ['managed_ads'] }));
  await React.act(async () => root.unmount()); root = createRoot(host); await render();
  assert.match(headline(), /2 new inquiries/);
  await React.act(async () => root.unmount());
  // A new inquiry resurfaces after all cards were dismissed, without changing the count.
  root = createRoot(host); await render();
  guard = 10;
  while (button('Dismiss this update for today') && guard--) await dismiss();
  assert.ok(guard > 0);
  props = { ...props, data: { ...props.data, recentActivity: [{ kind: 'lead', id: 'lead2', timestamp: '2026-09-13T12:00:00Z' }] } };
  await render();
  assert.match(headline(), /2 new inquiries/);
  assert.equal(reportedAction.href, '/provider/connections');
  await React.act(async () => root.unmount());

  // Completion buttons still open the correct editor after browsing from an urgent update.
  window.localStorage.clear(); root = createRoot(host);
  let edited;
  props = { ...props, completeness: { ...props.completeness, overall: 50, sections: [{ id: 'gallery', percent: 0, weight: 20 }] },
    onOpenSection(section) { edited = section; }, hasActiveBoostRequest: true };
  await render();
  for (let i = 0; i < 10 && reportedAction?.sectionId !== 'gallery'; i++) await click(button('Next update'));
  assert.equal(reportedAction.sectionId, 'gallery');
  await click([...host.querySelectorAll('button')].find(b => b.textContent.includes('Add photos')));
  assert.equal(edited, 'gallery');
  const clicked = events.filter(event => event.event_type === 'provider_picker_clicked').at(-1);
  assert.equal(clicked.metadata.banner, 'completion:gallery');
  assert.equal(clicked.provider_id, 'aggie');
  // An active boost must not receive a new-ad pitch anywhere in the queue.
  for (let i = 0; i < 8; i++) {
    assert.notEqual(reportedAction?.href, '/provider/boost');
    await click(button('Next update'));
  }
  await React.act(async () => root.unmount());
  await window.happyDOM.close();
  console.log('PASS: browse, dismiss, CTA sync, new activity, restore, focus, persistence, provider isolation, daily expiry, loading state, completion CTA, analytics');
}
main().catch(error => { console.error(error); process.exit(1); });
