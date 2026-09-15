// PGLITE_MODULE=/path/to/@electric-sql/pglite node scripts/tests/meta-native-sql.cjs
// Executes the real migration and import function against isolated Postgres.
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
 const db = new PGlite();
 await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
 // Use actual lead/message definitions so NOT NULL, CHECK, FK and uniqueness
 // constraints are exercised, not a permissive stand-in for the production schema.
 const citySchema=fs.readFileSync('supabase/migrations/207_city_campaigns.sql','utf8');
 const leadSchema=citySchema.slice(citySchema.indexOf('CREATE TABLE IF NOT EXISTS city_leads ('),citySchema.indexOf('CREATE TABLE IF NOT EXISTS city_lead_offers ('));
 await db.exec(leadSchema);
 await db.exec(`ALTER TABLE city_leads ADD COLUMN is_test boolean NOT NULL DEFAULT false;
 ALTER TABLE city_leads ADD COLUMN archived_at timestamptz;
 ALTER TABLE city_leads ADD COLUMN archive_reason text;
 ALTER TABLE city_leads ADD COLUMN archived_by text;
 CREATE TABLE do_not_contact(phone text,email text);`);
 const archiveSchema=fs.readFileSync('supabase/migrations/228_city_lead_archive_messages.sql','utf8');
 await db.exec(archiveSchema.slice(archiveSchema.indexOf('CREATE TABLE public.city_lead_messages'),archiveSchema.indexOf('-- An archived lead')));
 await db.exec(archiveSchema.slice(archiveSchema.indexOf('CREATE FUNCTION public.city_message_open_lead()'),archiveSchema.indexOf('CREATE TRIGGER city_offer_open_lead')));
 const guard = fs.readFileSync('supabase/migrations/228_city_lead_archive_messages.sql','utf8').split('CREATE FUNCTION public.city_lead_initial_optout()')[1];
 await db.exec('CREATE FUNCTION public.city_lead_initial_optout()'+guard);
 await db.exec(fs.readFileSync('supabase/migrations/231_meta_native_leads.sql','utf8'));
 const base = {slug:'dallas-tx',phone:'+12145550100',first_name:'Test Family',consent_form_version:'v1',consent_text:'Required callback consent',campaign_tag:'native-pilot',is_test:false};
 async function run(id,data=base) {
  await db.query(`INSERT INTO meta_lead_receipts(leadgen_id,page_id,form_id,submitted_at,form_config) VALUES($1,'12','34',now(),$2::jsonb) ON CONFLICT DO NOTHING`,[id,JSON.stringify({testOnly:data.is_test,slug:data.slug,campaignTag:data.campaign_tag,consentVersion:data.consent_form_version,consentText:data.consent_text})]);
  const {rows}=await db.query('SELECT import_meta_city_lead($1,$2::jsonb,$3) AS id',[id,JSON.stringify(data),'Olera confirmation']);
  return rows[0].id;
 }
 const first=await run('100'); assert.equal(await run('100'),first);
 assert.equal(await run('101'),first);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM city_leads')).rows[0].n,1);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM city_lead_messages')).rows[0].n,1);
 console.log('PASS replay and duplicate submission: one lead, one message');
 await run('102',{...base,is_test:true});
 assert.equal((await db.query('SELECT count(*)::int AS n FROM city_leads')).rows[0].n,2);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM city_lead_messages')).rows[0].n,1);
 console.log('PASS test mode isolated from real leads and sends no message');
 await db.query(`INSERT INTO meta_lead_receipts(leadgen_id,page_id,form_id,submitted_at,form_config)
 VALUES('104','12','34',now(),$1::jsonb)`,[JSON.stringify({testOnly:true,slug:'dallas-tx',campaignTag:'original',consentVersion:'original-v1',consentText:'Original consent'})]);
 await db.query("SELECT import_meta_city_lead('104',$1::jsonb,'must not send')",[JSON.stringify({...base,phone:'+12145550102',is_test:false})]);
 const frozen=(await db.query("SELECT * FROM city_leads WHERE meta_lead_id='104'")).rows[0];
 assert.equal(frozen.is_test,true); assert.equal(frozen.consent_text,'Original consent');
 assert.equal(frozen.campaign_tag,'original');
 assert.equal((await db.query('SELECT count(*)::int AS n FROM city_lead_messages')).rows[0].n,1);
 console.log('PASS queued test receipt cannot become live or change consent on retry');
 await db.query("INSERT INTO do_not_contact(phone) VALUES('2145550101')");
 await run('103',{...base,phone:'+12145550101'});
 const blocked=(await db.query("SELECT status,lead_id FROM meta_lead_receipts WHERE leadgen_id='103'")).rows[0];
 assert.equal(blocked.status,'blocked');
 assert.equal((await db.query('SELECT count(*)::int AS n FROM city_lead_messages')).rows[0].n,1);
 console.log('PASS opt-out archived with no confirmation');
 const saved=(await db.query('SELECT * FROM city_leads WHERE id=$1',[first])).rows[0];
 assert.equal(saved.care_type,'unsure'); assert.equal(saved.capture_method,'meta_instant_form');
 assert.equal(saved.consent_text,base.consent_text); assert.equal(saved.meta_lead_id,'100');
 assert.equal(saved.utm_medium,'paid_meta');
 console.log('PASS consent, source, and unknown care type preserved');
 await db.exec('SET ROLE anon');
 await assert.rejects(()=>db.query("SELECT import_meta_city_lead('100','{}','test')"),/permission denied/);
 await db.exec('RESET ROLE');
 console.log('PASS anonymous import RPC forbidden');
 await db.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
