// Exercise the actual route with an isolated, read-only database mock.
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'city-funnel-api-'));
  try {
    await build({ entryPoints: ['app/api/admin/city-ads/funnel/route.ts'], outfile: join(dir, 'route.cjs'), bundle: true, platform: 'node', format: 'cjs', plugins: [{ name: 'admin-test-double', setup(b) {
      b.onResolve({ filter: /^@\/lib\/admin$/ }, () => ({ path: 'admin', namespace: 'mock' }));
      b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: `export const getAuthUser = async () => globalThis.__quizMock.user; export const getAdminUser = async () => globalThis.__quizMock.admin; export const getServiceClient = () => globalThis.__quizMock.db;`, loader: 'js' }));
      b.onResolve({ filter: /^next\/server$/ }, () => ({ path: require.resolve('next/server'), external: true }));
    } }] });
    const { GET } = require(join(dir, 'route.cjs'));
    let queries = [], fail = false;
    const db = { from(table) {
      const q = { table, filters: [], orders: [], select(columns) { this.columns = columns; return this; }, eq(k,v) { this.filters.push(['eq',k,v]);return this; }, in(k,v) { this.filters.push(['in',k,v]);return this; }, gte(k,v) { this.filters.push(['gte',k,v]);return this; }, lt(k,v) { this.filters.push(['lt',k,v]);return this; }, order(k) { this.orders.push(k);return this; },
        range(from,to) { queries.push({table,from,to,filters:this.filters,orders:this.orders});
          if (fail) return Promise.resolve({data:null,error:new Error('fixture query failure')});
          const event = {anonymous_id:'same',visit_id:'same',page_path:'/care/dallas-tx',occurred_at:'2026-09-10T08:00:00Z',event_type:'page_landed',metadata:{utm_medium:'paid_search',referrer_class:'search'}};
          return Promise.resolve({ data: table === 'growth_attribution_events' && from === 0 ? Array(1000).fill(event) : [], error:null });
        },
        then(resolve) { return Promise.resolve({data:[{slug:'dallas-tx',channel:'google'}],error:null}).then(resolve); }
      };return q;
    } };
    globalThis.__quizMock = {user:null,admin:null,db};
    const request = (query='from=2026-09-10T07:22:00Z&to=2026-09-10T08:10:00Z') => ({nextUrl:new URL('https://example.com/api/admin/city-ads/funnel?'+query)});
    assert.equal((await GET(request())).status,401);
    globalThis.__quizMock.user={id:'admin'};
    assert.equal((await GET(request())).status,403);
    globalThis.__quizMock.admin={id:'admin'};
    const future = Date.now()+3600000;
    assert.equal((await GET(request(new URLSearchParams({from:new Date(future).toISOString(),to:new Date(future+3600000).toISOString()})))).status,400);
    assert.equal(queries.length,0);
    const response = await GET(request());
    assert.equal(response.status,200);
    assert.equal(response.headers.get('Cache-Control'),'no-store');
    const data = await response.json();
    assert.equal(data.rows[0].visitors,1);
    assert.deepEqual(queries.filter(q=>q.table==='growth_attribution_events').map(q=>q.from),[0,1000]);
    assert(queries.every(q=>q.filters.some(f=>f[0]==='gte') && q.filters.some(f=>f[0]==='lt')));
    assert(queries.every(q=>q.orders[1]==='id'));
    assert(queries.find(q=>q.table==='city_leads').filters.some(f=>f[1]==='is_test' && f[2]===false));
    fail=true;
    const oldError=console.error; console.error=()=>{};
    try { assert.equal((await GET(request())).status,503); } finally { console.error=oldError; }
    console.log('PASS: admin authentication, future dates, complete pagination, stable ordering, shared window, test-lead exclusion and query failures');
  } finally { rmSync(dir,{recursive:true,force:true}); delete globalThis.__quizMock; }
})().catch(e=>{console.error(e);process.exitCode=1;});
