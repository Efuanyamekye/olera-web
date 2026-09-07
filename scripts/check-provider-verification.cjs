const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict');
function load(file){const m={exports:{}};new Function('exports','module',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(m.exports,m);return m.exports;}
const {verificationReminderEligibility:eligible}=load('lib/provider-comms/verification.ts');
const now=Date.parse('2026-09-07T14:00:00Z'),day=86400000;
const p={type:'organization',email:'test@example.com',verification_state:'unverified',claimed_at:new Date(now-21*day).toISOString(),metadata:{}};
assert.equal(eligible(p,now),null);assert.equal(eligible({...p,claimed_at:new Date(now-21*day+1).toISOString()},now),'not_due');
assert.equal(eligible({...p,claimed_at:'invalid'},now),'not_due');
assert.equal(eligible({...p,claimed_at:new Date(now-90*day).toISOString()},now),null);
for(const state of ['verified','pending','rejected'])assert.equal(eligible({...p,verification_state:state},now),'verification_not_needed');
assert.equal(eligible({...p,metadata:{admin_archived:true}},now),'archived');
assert.equal(eligible({...p,metadata:{verification_reminder_21d_attempt_id:'reserved'}},now),'already_processed');
assert.equal(eligible({...p,email:null},now),'no_email');
const {getActionRedirectUrl,isPortalRedirectAction}=load('lib/provider-comms/destinations.ts');
const url=new URL(getActionRedirectUrl('verify',null,'my-provider','my-email'),'https://example.com');
assert.equal(url.pathname,'/account/settings');for(const [k,v] of Object.entries({tab:'account',verify:'1',provider:'my-provider',eid:'my-email'}))assert.equal(url.searchParams.get(k),v);
assert.equal(isPortalRedirectAction('verify'),true);
console.log('Verification eligibility and signed-link destination checks passed.');
