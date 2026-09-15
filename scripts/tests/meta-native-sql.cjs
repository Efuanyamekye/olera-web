// PGLITE_MODULE=/path/to/@electric-sql/pglite node scripts/tests/meta-native-sql.cjs
// Executes the real migration and import function against isolated Postgres.
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
 const db = new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE TABLE city_leads(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),slug text,phone text,email text,first_name text,zip text,
 campaign_tag text,utm_source text,utm_medium text,utm_campaign text,care_type text,consent_at timestamptz,consent_form_version text,
 is_test boolean DEFAULT false,created_at timestamptz DEFAULT now(),archived_at timestamptz,archive_reason text,archived_by text,
 status text DEFAULT 'new',next_offer_at timestamptz);
 CREATE TABLE city_lead_messages(id uuid DEFAULT gen_random_uuid(),lead_id uuid REFERENCES city_leads(id),channel text,body text,send_after timestamptz,created_by text);
 CREATE TABLE do_not_contact(phone text,email text);`);
 const guard = fs.readFileSync('supabase/migrations/228_city_lead_archive_messages.sql','utf8').split('CREATE FUNCTION public.city_lead_initial_optout()')[1];
 await db.exec('CREATE FUNCTION public.city_lead_initial_optout()'+guard);
 await db.exec(fs.readFileSync('supabase/migrations/231_meta_native_leads.sql','utf8'));
 const base = {slug:'dallas-tx',phone:'+12145550100',first_name:'Test Family',consent_form_version:'v1',consent_text:'Required callback consent',campaign_tag:'native-pilot',is_test:false};
 async function run(id,data=base) {
  await db.query(`INSERT INTO meta_lead_receipts(leadgen_id,page_id,form_id,submitted_at) VALUES($1,'12','34',now()) ON CONFLICT DO NOTHING`,[id]);
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
