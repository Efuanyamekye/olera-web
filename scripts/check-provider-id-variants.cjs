const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const mod = { exports: {} };
new Function('require', 'module', 'exports', ts.transpileModule(
  fs.readFileSync('lib/provider-id-variants.ts', 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
).outputText)(require, mod, mod.exports);
const id = '11111111-1111-4111-8111-111111111111';
function db(linked) {
  const tables = {
    'business_profiles': [{ id, slug: 'test-care', source_provider_id: linked ? 'source-1' : null }],
    'olera-providers': linked ? [{ provider_id: 'source-1', slug: 'public-care' }] : [],
  };
  return { from(table) {
    let rows = tables[table];
    const query = {
      select() { return query; },
      eq(key, value) { rows = rows.filter(row => row[key] === value); return query; },
      limit() { return Promise.resolve({ data: rows }); },
      maybeSingle() { return Promise.resolve({ data: rows[0] || null }); },
    };
    return query;
  } };
}
(async () => {
  for (const linked of [false, true]) {
    const expected = linked ? [id, 'test-care', 'source-1', 'public-care'] : [id, 'test-care'];
    for (const input of expected) {
      const result = await mod.exports.resolveProviderIdVariants(db(linked), input);
      assert.deepEqual(new Set(result.allVariants), new Set(expected), input);
      assert.equal(result.businessProfileId, id);
    }
  }
  const unknown = await mod.exports.resolveProviderIdVariants(db(false), 'unknown');
  assert.deepEqual(unknown.allVariants, ['unknown']);
  console.log('Provider identity checks passed: self-registered UUID/slug, claimed UUID/slug/source/public slug, and unknown input.');
})().catch(error => { console.error(error); process.exitCode = 1; });
