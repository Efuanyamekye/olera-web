const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict');
const {Window}=require('happy-dom');const win=new Window();
Object.assign(globalThis,{window:win,document:win.document,HTMLElement:win.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
Object.defineProperty(globalThis,'navigator',{value:win.navigator,configurable:true});
const React=require('react'),{createRoot}=require('react-dom/client');
let resolveAuth, rejectAuth, redirected, scenario;
const noop=()=>{};
const provider={provider_id:'test-care',slug:'test-care',provider_name:'Test Care',google_rating:5,email:'test@example.com'};
function client(){return {from(){const q={select:()=>q,eq:()=>q,not:()=>q,in:()=>q,single:async()=>({data:provider}),maybeSingle:async()=>({data:{id:'profile'}}),then:r=>Promise.resolve({data:[]}).then(r)};return q;},auth:{setSession:async()=>({})}};}
global.fetch=async url=>{
 if(url==='/api/claim/validate-token')return {json:async()=>({valid:scenario!=='expired',email:'test@example.com',alreadyClaimed:true})};
 if(url==='/api/auth/auto-sign-in')return new Promise((resolve,reject)=>{resolveAuth=resolve;rejectAuth=reject;});
 return {ok:true,json:async()=>({})};
};
function compile(file){const mod={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText)(stub,mod,mod.exports);return mod.exports;}
function stub(id){
 if(id==='next/navigation')return {useParams:()=>({slug:'test-care'}),useSearchParams:()=>new URLSearchParams('action='+ (scenario==='lead'?'lead':'notifications') +'&otk=test&eid=email-test'),useRouter:()=>({replace:url=>{redirected=url},push:noop})};
 if(id==='@/components/auth/AuthProvider')return {useAuth:()=>({user:null,account:null,profiles:[],openAuth:noop,refreshAccountData:async()=>{},switchProfile:noop})};
 if(id==='@/lib/supabase/client')return {createClient:client,isSupabaseConfigured:()=>true};
 if(id==='@/lib/supabase/auth-client')return {createAuthClient:()=>({auth:{verifyOtp:async()=>({data:{session:{access_token:'test',refresh_token:'test'}}})}})};
 if(id==='@/lib/claim-session')return {getOrCreateClaimSession:()=>({sessionId:'test'}),markSessionVerified:noop,clearClaimSession:noop};
 if(id==='@/lib/provider-comms/destinations')return compile('lib/provider-comms/destinations.ts');
 if(id==='@/components/provider-onboarding/SmartDashboardShell')return {__esModule:true,default:()=>React.createElement('div',null,'Sign-in fallback')};
 if(id==='next/link')return {__esModule:true,default:()=>null};
 return require(id);
}
const Component=compile('app/provider/[slug]/onboard/page.tsx').default;
(async()=>{
 for(scenario of ['success','network','http','expired','lead']){
  redirected=undefined;
  const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
  await React.act(async()=>root.render(React.createElement(Component)));
  if(scenario==='expired'){
    assert.ok(!resolveAuth,'expired link must not attempt automatic sign-in');
    assert.ok(!node.textContent.includes('Opening notification settings'));
    await React.act(()=>root.unmount());node.remove();continue;
  }
  assert.ok(resolveAuth,'automatic sign-in started');
  if(scenario==='lead'){
    assert.ok(node.textContent.includes('Sign-in fallback'),'other notification cards remain visible during auth');
    await React.act(async()=>resolveAuth({ok:true,json:async()=>({tokenHash:'test'})}));
    await React.act(()=>root.unmount());node.remove();resolveAuth=undefined;continue;
  }
  assert.ok(node.textContent.includes('Opening notification settings'));
  assert.ok(!node.textContent.includes('Sign-in fallback'));
  if(scenario==='http'){
    const failed=()=>({ok:false,status:503,json:async()=>({error:'test unavailable'})});
    await React.act(async()=>resolveAuth(failed()));
    assert.ok(node.textContent.includes('Opening notification settings'),'keep loading during retry');
    await React.act(async()=>new Promise(resolve=>setTimeout(resolve,1600)));
    await React.act(async()=>resolveAuth(failed()));
  } else await React.act(async()=>scenario==='success'?resolveAuth({ok:true,json:async()=>({tokenHash:'test'})}):rejectAuth(new Error('test connection failure')));
  if(scenario==='success'){assert.equal(redirected,'/account/settings?tab=notifications&eid=email-test&provider=test-care');assert.ok(!node.textContent.includes('Sign-in fallback'));}
  else assert.ok(node.textContent.includes('Sign-in fallback'));
  await React.act(()=>root.unmount());node.remove();resolveAuth=undefined;
 }
 await win.happyDOM.close();console.log('Notification link transition passed: pending auth hides sign-in card, redirect preserves attribution, network and HTTP failure restore fallback, expired links and other notification cards remain usable.');
})().catch(e=>{console.error(e);process.exitCode=1;win.happyDOM.close();});
