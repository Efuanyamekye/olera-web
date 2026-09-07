const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript');
let rows=[],reserved=new Set(),sends=0,reservations=0,pages=0,mode='sent',enabled=true;
const profile=i=>({id:String(i).padStart(4,'0'),slug:'test-'+i,type:'organization',email:'test@example.com',claimed_at:new Date(Date.now()-30*86400000).toISOString(),verification_state:'unverified',display_name:'Test',metadata:{profile_preview_nudge_sent:true,profile_preview_nudge_sent_at:new Date(Date.now()-4*86400000).toISOString()}});
const db={from:table=>{if(table==='cron_config'){const c={select:()=>c,eq:()=>c,maybeSingle:async()=>({data:enabled===null?null:{enabled}})};return c;}let cursor='';const q={select:()=>q,eq:()=>q,not:()=>q,lte:()=>q,in:()=>q,is:()=>q,order:()=>q,limit:()=>q,gt:(_,value)=>{cursor=value;return q;},then:fn=>{pages++;return Promise.resolve(fn({data:rows.filter(p=>p.id>cursor).slice(0,100),error:null}));}};return q;},rpc:async(_,body)=>{reservations++;if(body.p_dry_run)return {data:body.p_profile_id};if(reserved.has(body.p_profile_id))return {data:null};reserved.add(body.p_profile_id);return {data:'log-'+body.p_profile_id};}};
const code=ts.transpileModule(fs.readFileSync('app/api/cron/verification-reminders/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};
new Function('require','module','exports',code)(id=>{
 if(id==='next/server')return {NextResponse:{json:(body,opts)=>({body,status:opts.status})}};
 if(id==='@/lib/admin')return {getServiceClient:()=>db};
 if(id==='@/lib/crons/run')return {withCronRun:(_,fn)=>fn()};
 if(id==='@/lib/email')return {appendTrackingParams:(url,id)=>url+'&eid='+id,sendEmail:async options=>{sends++;assert.ok(options.html.includes('eid=log-'));if(mode==='throw')throw Error('uncertain');return mode==='sent'?{success:true}:mode==='suppressed'?{success:true,skipped:true}:{success:false};}};
 if(id==='@/lib/email-templates')return {verificationReminder21DayEmail:opts=>opts.verifyUrl};
 if(id==='@/lib/claim-tokens')return {generateProviderPortalUrl:(_,email,action)=>{assert.equal(action,'verify');return 'https://example.com/?action='+action;}};
 if(id==='@/lib/provider-comms/verification')return {verificationReminderEligibility:p=>p.metadata.verification_reminder_21d_sent?'already_processed':null,VERIFICATION_REMINDER_EMAIL_TYPE:'verification_reminder_21d'};
 throw Error(id);
},mod,mod.exports);
const request=(query='',auth='Bearer test-secret')=>({url:'https://example.com/api/cron/verification-reminders'+query,headers:{get:()=>auth}});
(async()=>{
 const old=process.env.CRON_SECRET;process.env.CRON_SECRET='test-secret';
 assert.equal((await mod.exports.GET(request('','wrong'))).status,401);assert.equal(pages,0);
 delete process.env.CRON_SECRET;assert.equal((await mod.exports.GET(request('','Bearer undefined'))).status,401);process.env.CRON_SECRET='test-secret';
 enabled=null;assert.equal((await mod.exports.GET(request())).status,'held');assert.equal(reservations,0);enabled=true;
 rows=Array.from({length:205},(_,i)=>({...profile(i),metadata:{verification_reminder_21d_sent:true}}));rows.push(profile(205));
 let result=await mod.exports.GET(request('?dry_run=true'));assert.equal(result.wouldSend,1);assert.equal(result.processed,206);assert.equal(reservations,1);assert.equal(reserved.size,0);assert.equal(sends,0);assert.equal(pages,3);
 result=await mod.exports.GET(request());assert.equal(result.sent,1);assert.equal(sends,1);
 result=await mod.exports.GET(request());assert.equal(result.sent,0);assert.equal(sends,1,'repeat run cannot resend reserved provider');
 for(const outcome of ['suppressed','failed']){rows=[profile(outcome==='suppressed'?300:301)];mode=outcome;result=await mod.exports.GET(request());assert.equal(outcome==='suppressed'?result.suppressed:result.errors,1);}
 if(old===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=old;
 console.log('Cron route passed: missing/invalid secret, read-only dry run, pagination past 200 skipped providers, durable dedupe and suppression/failure accounting.');
})().catch(error=>{console.error(error);process.exitCode=1});
