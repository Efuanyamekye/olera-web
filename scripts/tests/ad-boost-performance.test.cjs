const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Run real TS modules with only external service boundaries substituted.
function load(file, mocks = {}) {
  const filename = path.resolve(file);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  const localRequire = name => {
    if (name in mocks) return mocks[name];
    if (name.endsWith('.css')) return {};
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? path.resolve(name.slice(2)) : path.resolve(path.dirname(filename), name);
      const target = ['', '.ts', '.tsx'].map(ext => base + ext).find(p => fs.existsSync(p));
      return load(target, mocks);
    }
    return require(name);
  };
  new Function('require', 'module', 'exports', source)(localRequire, module, module.exports);
  return module.exports;
}
const { readCampaignRows } = load('lib/ad-boost/read-campaign-rows.ts');
const readers = load('lib/ad-boost/delivered.server.ts');

function database(tables, { fail, waitFor, starts = [] } = {}) {
  return { from(table) {
    let predicates = [], range = null, head = false, single = false, patch = null;
    const value = (row, key) => key.includes('->>') ? row[key.split('->>')[0]]?.[key.split('->>')[1]] : row[key];
    const query = {
      update(values) { patch = values; return this; },
      single() { single = true; return this; },
      maybeSingle() { single = true; return this; },
      select(_columns, opts) { head = opts?.head; return this; },
      eq(key, v) { predicates.push(row => value(row, key) === v); return this; },
      filter(key, _op, v) { return this.eq(key, v); },
      in(key, values) { predicates.push(row => values.includes(value(row, key))); return this; },
      is(key, v) { return this.eq(key, v); },
      not(key, _op, v) { predicates.push(row => value(row, key) !== v); return this; },
      gte(key, v) { predicates.push(row => value(row, key) >= v); return this; },
      order() { return this; },
      limit(n) { range = [0, n - 1]; return this; },
      range(a, b) { range = [a, b]; return this; },
      abortSignal() { return this; },
      async then(resolve, reject) {
        try {
          starts.push(table);
          if (waitFor) await waitFor(table);
          if (fail === table) return resolve({ data: null, error: { message: 'statement timeout' } });
          let rows = (tables[table] ?? []).filter(row => predicates.every(p => p(row)));
          if (patch) rows = rows.map(row => ({ ...row, ...patch }));
          const count = rows.length;
          if (range) rows = rows.slice(range[0], range[1] + 1);
          return resolve({ data: head ? null : single ? rows[0] ?? null : rows, count, error: null });
        } catch (e) { return reject(e); }
      },
    };
    return query;
  } };
}
const event = (event_type, campaign, session, extra = {}) => ({ event_type, metadata: { utm_source: 'olera_managed', utm_campaign: campaign, session_id: session, ...extra } });

test('complete pagination survives a server row limit lower than the requested size', async () => {
  const data = Array.from({ length: 731 }, (_, id) => ({ id }));
  const pages = [];
  const rows = await readCampaignRows(['a', 'a', ''], async (keys, from) => {
    assert.deepEqual(keys, ['a']); pages.push(from);
    return { data: data.slice(from, from + 100), error: null };
  });
  assert.equal(rows.length, 731);
  assert.equal(pages.at(-1), 731);
});

test('large key sets are chunked without dropping or duplicating keys', async () => {
  const keys = Array.from({ length: 121 }, (_, i) => `campaign-${i}`);
  const rows = await readCampaignRows(keys, async (batch, from) => {
    assert.ok(batch.length <= 50);
    return { data: from ? [] : batch, error: null };
  });
  assert.deepEqual(rows, keys);
});

test('landing counts retain session dedup and internal exclusion, scoped to campaign', async () => {
  const db = database({ provider_activity: [event('page_view', 'a', 's1'), event('page_view', 'a', 's1'), event('page_view', 'a', 's2'), event('page_view', 'a', 'staff', { referrer_class: 'olera_internal' }), event('page_view', 'other', 'x')] });
  assert.deepEqual(await readers.countAdLandingsByCampaign(db, ['a', 'empty']), { a: 2, empty: 0 });
});

test('delivered counts preserve inquiry and benefits dedup as separate funnels', async () => {
  const db = database({ provider_activity: [event('lead_received', 'a', 's1', { connection_id: 'c1' }), event('lead_received', 'a', 's2', { connection_id: 'c1' }), event('lead_received', 'other', 'x')], seeker_activity: [{ ...event('benefits_completed', 'a'), profile_id: 'p1' }, { ...event('benefits_completed', 'a'), profile_id: 'p1' }] });
  assert.deepEqual(await readers.countDeliveredByCampaign(db, ['a', 'empty']), { a: 2, empty: 0 });
});

test('database errors reject instead of returning zero activity', async () => {
  await assert.rejects(readers.countAdLandingsByCampaign(database({}, { fail: 'provider_activity' }), ['a']), /statement timeout/);
  await assert.rejects(readers.countDeliveredByCampaign(database({}, { fail: 'seeker_activity' }), ['a']), /statement timeout/);
});

function route(db, mocks = {}) {
  return load('app/api/admin/ad-boost/route.ts', {
    '@/lib/admin': { getAuthUser: async () => ({ id: 'admin' }), getAdminUser: async () => ({ id: 'admin' }), getServiceClient: () => db },
    '@/lib/ad-boost/lifecycle-notifications.server': {},
    '@/lib/ad-boost/photo-notifications.server': {},
    '@/lib/send-window': {},
    ...mocks,
  });
}
const campaign = { id: 'a', provider_id: 'provider-a', provider_slug: 'slug-a', status: 'live', deleted_at: null, campaign_tag: null, created_at: '2026-09-01T00:00:00Z' };

test('queue runs independent enrichment together and preserves question attribution', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const starts = [];
  const db = database({
    ad_campaign_requests: [campaign],
    provider_activity: [event('page_view', 'a', 's1')],
    provider_question_asks: [
      { provider_id: 'slug-a', question_id: 'q1', utm_source: 'olera_managed', utm_campaign: 'a', created_at: '2026-09-02T00:00:00Z' },
      { provider_id: 'slug-a', question_id: 'q2', created_at: '2026-09-02T00:00:00Z' },
    ],
    provider_questions: [{ id: 'q1', status: 'published' }, { id: 'q2', status: 'published' }],
  }, { starts, waitFor: table => table === 'email_log' ? gate : undefined });
  const pending = route(db).GET(new Request('https://test.local/api/admin/ad-boost'));
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(starts.includes('provider_activity'));
  assert.ok(starts.includes('provider_question_asks'));
  release();
  const response = await pending;
  assert.equal(response.status, 200);
  assert.match(response.headers.get('server-timing'), /ad_boost;dur=/);
  const json = await response.json();
  assert.equal(json.requests[0].ad_landings, 1);
  assert.equal(json.requests[0].questions_received, 1);
  assert.deepEqual(json.counts, { active: 1, archived: 0 });
});

test('queue returns unavailable rather than a misleading successful zero response', async () => {
  const response = await route(database({ ad_campaign_requests: [campaign] }, { fail: 'provider_activity' })).GET(new Request('https://test.local/api/admin/ad-boost'));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).requests, undefined);
});

module.exports = { load };

test('cached queue stays visible on failure, preserves All, and ignores a late tab response', async () => {
  const { Window } = await import('happy-dom');
  const window = new Window();
  const React = require('react');
  const { createRoot } = require('react-dom/client');
  const globals = { window: global.window, document: global.document, Event: global.Event, IS_REACT_ACT_ENVIRONMENT: global.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(global, { window, document: window.document, Event: window.Event, IS_REACT_ACT_ENVIRONMENT: true });
  const cache = { rows: new Map([['active', { requests: [{ ...campaign, display_name: 'Cached provider' }], counts: { active: 1, archived: 0 }, at: Date.now() }]]), preferences: { view: 'active', filter: { active: null, archived: undefined }, sort: 'priority', expanded: new Set() } };
  const pending = [];
  const Page = load('app/admin/ad-boost/page.tsx', {
    'next/link': ({ children, ...props }) => React.createElement('a', props, children),
    '@/components/admin/AdBoostQueueCache': { AD_BOOST_QUEUE_SETTLED: "ad-boost-queue-settled", useAdBoostQueueCache: () => cache, fetchAdBoost: (url, options) => url.includes('/case?') ? Promise.resolve(Response.json({ overdue: [] })) : new Promise(resolve => pending.push({ url, options, resolve })) },
  }).default;
  const host = document.createElement('div'); document.body.append(host);
  let root = createRoot(host);
  try {
    await React.act(async () => root.render(React.createElement(Page)));
    assert.match(host.textContent, /Cached provider/);
    assert.equal(cache.preferences.filter.active, null);
    await React.act(async () => pending.shift().resolve(Response.json({ error: 'Query unavailable' }, { status: 503 })));
    assert.match(host.textContent, /Cached provider/);
    assert.match(host.textContent, /Showing previously loaded campaigns/);
    const button = text => [...host.querySelectorAll('button')].find(b => b.textContent.startsWith(text));
    await React.act(async () => button('Retry').click());
    const old = pending.shift();
    await React.act(async () => button('Archived').click());
    assert.equal(old.options.signal.aborted, true);
    await React.act(async () => pending.shift().resolve(Response.json({ requests: [], counts: { active: 1, archived: 0 } })));
    await React.act(async () => old.resolve(Response.json({ requests: [{ ...campaign, display_name: 'Wrong view' }], counts: { active: 1, archived: 0 } })));
    assert.doesNotMatch(host.textContent, /Wrong view/);
    assert.match(host.textContent, /No archived requests/);
  } finally {
    await React.act(async () => root.unmount());
    Object.assign(global, globals);
    window.happyDOM.abort();
  }
});

test('a counted final page does not require another network round trip', async () => {
  let calls = 0;
  const rows = await readCampaignRows(['a'], async () => {
    calls++;
    return { data: ['one'], count: 1, error: null };
  });
  assert.deepEqual(rows, ['one']);
  assert.equal(calls, 1);
});

test('admin queue cache clears on a mutation and on identity change', async () => {
  const { Window } = await import('happy-dom');
  const window = new Window();
  const React = require('react');
  const { createRoot } = require('react-dom/client');
  const original = { window: global.window, document: global.document, fetch: global.fetch, Event: global.Event, IS_REACT_ACT_ENVIRONMENT: global.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(global, { window, document: window.document, Event: window.Event, fetch: async () => Response.json({ ok: true }), IS_REACT_ACT_ENVIRONMENT: true });
  let user = { id: 'admin-a' }, current;
  const { AdBoostQueueCacheProvider, useAdBoostQueueCache, fetchAdBoost } = load('components/admin/AdBoostQueueCache.tsx', { '@/components/auth/AuthProvider': { useAuth: () => ({ user }) } });
  function Consumer() { current = useAdBoostQueueCache(); return null; }
  const root = createRoot(document.createElement('div'));
  const render = () => root.render(React.createElement(AdBoostQueueCacheProvider, null, React.createElement(Consumer)));
  try {
    await React.act(async () => render());
    current.rows.set('active', { requests: [campaign] });
    await fetchAdBoost('/api/admin/ad-boost', { method: 'POST' });
    assert.equal(current.rows.size, 0);
    current.rows.set('active', { requests: [campaign] });
    user = { id: 'admin-b' };
    await React.act(async () => render());
    assert.equal(current.rows.size, 0);
    current.rows.set('active', { requests: [campaign] });
    user = null;
    await React.act(async () => render());
    assert.equal(current.rows.size, 0);
  } finally {
    await React.act(async () => root.unmount());
    Object.assign(global, original);
    window.happyDOM.abort();
  }
});


test('a failed optional traction lookup must not undo a successful save or skip launch notification', async () => {
  const sends = [];
  const db = database({ ad_campaign_requests: [{ ...campaign, status: 'scheduled', photo_readiness_status: 'ready', ad_clicks: 0, ad_spend_cents: 0 }] }, { fail: 'provider_activity' });
  const response = await route(db, {
    '@/lib/ad-boost/lifecycle-notifications.server': { sendAdBoostLifecycleEmail: async ({ kind }) => sends.push(kind) },
  }).POST(new Request('https://test.local/api/admin/ad-boost', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'a', status: 'live', ad_clicks: 0, ad_spend_cents: 0 }),
  }));
  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.request.status, 'live');
  assert.match(json.warning, /traction/i);
  assert.deepEqual(sends, ['launched']);
});

test('a remembered lifecycle filter falls back to All when its last campaign changes status', async () => {
  const { Window } = await import('happy-dom');
  const window = new Window();
  const React = require('react');
  const { createRoot } = require('react-dom/client');
  const originals = { window: global.window, document: global.document, Event: global.Event, IS_REACT_ACT_ENVIRONMENT: global.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(global, { window, document: window.document, Event: window.Event, IS_REACT_ACT_ENVIRONMENT: true });
  const cache = { rows: new Map(), preferences: { view: 'active', filter: { active: 'live' }, sort: 'priority', expanded: new Set() } };
  const Page = load('app/admin/ad-boost/page.tsx', {
    'next/link': ({ children, ...props }) => React.createElement('a', props, children),
    '@/components/admin/AdBoostQueueCache': { AD_BOOST_QUEUE_SETTLED: 'settled', useAdBoostQueueCache: () => cache,
      fetchAdBoost: async url => Response.json(url.includes('/case?') ? { overdue: [] } : { requests: [{ ...campaign, status: 'ended', display_name: 'Ended provider' }], counts: { active: 1, archived: 0 } }) },
  }).default;
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await React.act(async () => root.render(React.createElement(Page)));
    assert.match(host.textContent, /Ended provider/);
    assert.equal(cache.preferences.filter.active, null);
  } finally {
    await React.act(async () => root.unmount());
    Object.assign(global, originals);
    window.happyDOM.abort();
  }
});
