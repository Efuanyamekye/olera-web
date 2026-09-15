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

const { createHmac } = require('node:crypto');
const native = load('lib/city-ads/meta-native.ts');
const form = {pageId:'112405630552923',formId:'12345',slug:'dallas-tx',campaignTag:'native-pilot',consentVersion:'v1',consentText:'Required callback consent',testOnly:true};
const event = {object:'page',entry:[{id:form.pageId,changes:[{field:'leadgen',value:{page_id:form.pageId,form_id:form.formId,leadgen_id:'999',created_time:1789466400,ad_id:'888'}}]}]};
const receipt = native.extractNativeReceipts(event,[form])[0];
const lead = {id:'999',form_id:form.formId,field_data:[{name:'full_name',values:['Test Family']},{name:'phone_number',values:['+1 (214) 555-0100']},{name:'zip_code',values:['75024']}]};

test('signature accepts exact bytes only, fails closed on missing/malformed secret and signature',()=>{
  const raw=JSON.stringify(event), secret='test-secret';
  const sig='sha256='+createHmac('sha256',secret).update(raw).digest('hex');
  assert.equal(native.verifyMetaSignature(raw,sig,secret),true);
  assert.equal(native.verifyMetaSignature(raw+' ',sig,secret),false);
  for(const value of [null,'sha256=abc','sha256='+'f'.repeat(64)]) assert.equal(native.verifyMetaSignature(raw,value,secret),false);
  assert.equal(native.verifyMetaSignature(raw,sig,''),false);
});
test('forms require explicit test mode and unique numeric IDs',()=>{
  assert.deepEqual(native.parseNativeForms(undefined),[]);
  assert.deepEqual(native.parseNativeForms(JSON.stringify([form])),[form]);
  assert.throws(()=>native.parseNativeForms(JSON.stringify([{...form,testOnly:undefined}])));
  assert.throws(()=>native.parseNativeForms(JSON.stringify([form,form])));
});
test('only subscribed page and allowlisted form accepted; duplicate batch deduped',()=>{
  assert.equal(native.extractNativeReceipts(event,[form]).length,1);
  assert.equal(native.extractNativeReceipts(event,[{...form,pageId:'42'}]).length,0);
  assert.equal(native.extractNativeReceipts(event,[{...form,formId:'42'}]).length,0);
  assert.equal(native.extractNativeReceipts({...event,entry:[...event.entry,...event.entry]},[form]).length,1);
  assert.equal(native.extractNativeReceipts(null,[form]).length,0);
});
test('native normalization preserves unknown care needs, consent and optional email',()=>{
  const normalized = native.normalizeMetaLead(lead,receipt,form);
  assert.equal(normalized.phone,'+12145550100');
  assert.equal(normalized.email,null);
  assert.equal(normalized.zip,'75024');
  assert.equal(normalized.consent_text,form.consentText);
  assert.equal(normalized.is_test,true);
  assert.equal(normalized.care_type,undefined);
});
test('identity mismatch and invalid phone/email cannot enter queue',()=>{
  assert.throws(()=>native.normalizeMetaLead({...lead,id:'123'},receipt,form));
  assert.throws(()=>native.normalizeMetaLead({...lead,form_id:'123'},receipt,form));
  assert.throws(()=>native.normalizeMetaLead({...lead,field_data:[{name:'full_name',values:['Test']}]},receipt,form));
  assert.throws(()=>native.normalizeMetaLead({...lead,field_data:[...lead.field_data,{name:'email',values:['bad']}]},receipt,form));
});
test('native leads do not inflate website Meta campaign CPL',()=>{
  const {buildChannelRollup} = load('lib/city-ads/channel-rollup.ts');
  const base={slug:'dallas-tx',utm_source:'meta',utm_medium:'paid_meta',is_test:false,created_at:'2026-09-15'};
  const rows=buildChannelRollup([{slug:'dallas-tx',channel:'meta',ad_spend_cents:1000,ad_clicks:10,status:'live',budget_cents:10000}],
    [base,{...base,capture_method:'meta_instant_form'},{...base,capture_method:'meta_instant_form',is_test:true}]);
  assert.equal(rows.find(r=>r.channel==='meta').leads,1);
  assert.equal(rows.find(r=>r.channel==='meta').costPerLeadCents,1000);
  assert.equal(rows.find(r=>r.channel==='meta_instant_form').leads,1);
  assert.equal(rows.find(r=>r.channel==='meta_instant_form').costPerLeadCents,null);
});
test('test and suppressed city leads are blocked before communication',async()=>{
  const {cityLeadBlocked}=load('lib/city-ads/messages.server.ts',{'@/lib/twilio':{},'@/lib/email':{}});
  for(const lead of [{is_test:true},{archived_at:'2026-09-15'},{status:'stopped'}]) {
    const db={from:()=>({select:()=>({eq:()=>({single:async()=>({data:lead,error:null})})})})};
    assert.equal(await cityLeadBlocked(db,'id'),true);
  }
});
