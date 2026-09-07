const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const {Window}=require('happy-dom');const win=new Window();
Object.assign(globalThis,{window:win,self:win,document:win.document,HTMLElement:win.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
Object.defineProperty(globalThis,'navigator',{value:win.navigator,configurable:true});
const React=require('react'),{createRoot}=require('react-dom/client');
let search=new URLSearchParams('tab=notifications&provider=provider-a&eid=email-a');
let profile={id:'profile-a',slug:'provider-a',type:'organization',phone:'5125550100',metadata:{},display_name:'Test Care'};
const profiles=[profile,{...profile,id:'profile-b',slug:'provider-b'}];
const calls=[];let pendingSave;
globalThis.fetch=(url,opts)=>{
 const body=JSON.parse(opts.body);calls.push(body);
 if(body.kind==='view') return Promise.resolve({ok:true});
 return new Promise(resolve=>{pendingSave={body,resolve};});
};
let refresh=async()=>{
 const b=pendingSave.body;
 profile={...profile,metadata:{...profile.metadata,notification_prefs:{...(profile.metadata.notification_prefs||{}),[b.key]:{[b.channel]:b.enabled}}}};
 await render();
};
const noop=()=>null;
const code=ts.transpileModule(fs.readFileSync('app/account/settings/page.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
const mod={exports:{}};
new Function('require','module','exports',code)(id=>{
 if(id==='next/navigation')return {useRouter:()=>({push:noop,back:noop,refresh:noop}),useSearchParams:()=>search};
 if(id==='next/link')return {__esModule:true,default:({children,...props})=>React.createElement('a',props,children)};
 if(id==='@/components/auth/AuthProvider')return {useAuth:()=>({user:{email:'test@example.com'},activeProfile:profile,profiles,refreshAccountData:refresh,switchProfile:noop})};
 if(id==='@/lib/supabase/client')return {isSupabaseConfigured:()=>true,createClient:()=>{throw Error('Direct metadata writes forbidden');}};
 if(id==='@/lib/hooks/useVerificationModal')return {useVerificationModal:()=>({isOpen:false,open:noop,close:noop,handleSubmit:noop,handleDismiss:noop})};
 if(id==='@/hooks/use-mobile-nav-variant')return {useMobileNavVariant:()=>null};
 if(id.startsWith('@/'))return {__esModule:true,default:noop};
 return require(id);
},mod,mod.exports);
const target=document.createElement('div');document.body.append(target);const mounted=createRoot(target);
async function render(){mounted.render(React.createElement(mod.exports.default));}
const switches=()=>[...target.querySelectorAll('[role="switch"]')];
(async()=>{
 await React.act(render);
 assert.ok(target.textContent.includes('New leads'));assert.equal(calls.length,1);assert.equal(calls[0].kind,'view');assert.equal(calls[0].emailLogId,'email-a');
 assert.equal(switches()[1].getAttribute('aria-checked'),'false');
 await React.act(()=>switches()[1].click());
 assert.equal(calls.length,2);assert.equal(pendingSave.body.channel,'sms');assert.equal(pendingSave.body.enabled,true);
 await React.act(()=>switches()[2].click());assert.equal(calls.length,2,'concurrent toggle blocked');
 await React.act(async()=>pendingSave.resolve({ok:false}));
 assert.equal(switches()[1].getAttribute('aria-checked'),'false');assert.ok(target.textContent.includes("Couldn't update"));
 await React.act(()=>switches()[1].click());await React.act(async()=>pendingSave.resolve({ok:true}));
 assert.equal(switches()[1].getAttribute('aria-checked'),'true');
 const before=calls.length;
 search=new URLSearchParams('tab=notifications&provider=provider-b&eid=email-b');
 await React.act(render);await React.act(()=>switches()[1].click());
 assert.equal(calls.length,before,'wrong active profile cannot save or log a visit');
 assert.ok(target.textContent.includes('another provider'));
 search=new URLSearchParams('tab=invalid');await React.act(render);
 assert.ok(!target.textContent.includes('New leads'),'invalid tab uses account settings');
 await React.act(()=>mounted.unmount());await win.happyDOM.close();
 console.log('Settings UI passed: linked destination, no automatic opt-in, save serialization, failure rollback, success and multi-profile isolation.');
})().catch(e=>{console.error(e);process.exitCode=1;win.happyDOM.close()});
