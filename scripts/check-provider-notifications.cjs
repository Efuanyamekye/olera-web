const fs = require('node:fs'), path = require('node:path'), ts = require('typescript'), assert = require('node:assert/strict');
function load(file) {
 const mod = {exports:{}};
 const code = ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports',code)(id=>id.startsWith('.')?load(path.resolve(path.dirname(file),id+'.ts')):require(id),mod,mod.exports);
 return mod.exports;
}
const { notificationEligibility: eligible, notificationBusinessHours: hours }=load('lib/provider-comms/notifications.ts');
const {getActionRedirectUrl: destination,isPortalRedirectAction}=load('lib/provider-comms/destinations.ts');
const now=Date.parse('2026-09-07T15:00:00Z');
const profile={type:'organization',email:'test@example.com',phone:'(512) 555-0100',metadata:{profile_preview_nudge_sent:true,profile_preview_nudge_sent_at:'2026-09-04T15:00:00Z'}};
assert.equal(eligible(profile,now),null);
assert.equal(eligible(profile,now-1),'not_due');
for (const stamp of ['broken','2026-09-08T00:00:00Z','']) assert.notEqual(eligible({...profile,metadata:{...profile.metadata,profile_preview_nudge_sent_at:stamp}},now),null);
assert.equal(eligible({...profile,type:'caregiver'},now),'unsupported_profile');
assert.equal(eligible({...profile,phone:null},now),'no_usable_phone');
assert.equal(eligible({...profile,metadata:{...profile.metadata,notification_prefs:{new_leads:{sms:true}}}},now),'already_enabled');
assert.equal(eligible({...profile,metadata:{...profile.metadata,notification_nudge_attempt_id:'pending'}},now),'already_processed');
assert.equal(hours(new Date('2026-09-06T15:00:00Z'),'TX'),false);
assert.equal(hours(new Date('2026-09-07T13:59:59Z'),'TX'),false);
assert.equal(hours(new Date('2026-09-07T14:00:00Z'),'TX'),true);
assert.equal(hours(new Date('2026-09-07T22:00:00Z'),'TX'),false);
const url=new URL(destination('notifications',null,'provider-a','email-a'),'https://example.com');
assert.equal(url.pathname,'/account/settings');assert.equal(url.searchParams.get('tab'),'notifications');assert.equal(url.searchParams.get('eid'),'email-a');assert.equal(url.searchParams.get('provider'),'provider-a');
assert.equal(destination('settings',null),'/account/settings');assert.equal(destination('matches',null),'/provider/matches');assert.equal(destination('lead','123'),'/provider/connections?id=123');assert.equal(destination('profile',null,'a'),'/provider/a');assert.equal(destination('invalid',null),'/provider');
for(const action of ['notifications','matches','profile','manage','settings']) assert.equal(isPortalRedirectAction(action),true);
assert.equal(isPortalRedirectAction('question'),false);
console.log('Notification eligibility, exact timing/business-hour boundaries and shared auth destinations passed.');
