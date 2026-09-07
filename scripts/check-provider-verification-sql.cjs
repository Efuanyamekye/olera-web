const {PGlite}=require('@electric-sql/pglite'),fs=require('fs'),assert=require('node:assert/strict');
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE TABLE business_profiles(id uuid PRIMARY KEY,account_id uuid,type text,slug text,source_provider_id text,email text,metadata jsonb,claimed_at timestamptz,verification_state text,display_name text);
 CREATE TABLE email_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),recipient text,subject text,email_type text,recipient_type text,provider_id text,status text,resend_id text,error_message text,created_at timestamptz DEFAULT now());
 CREATE TABLE cron_config(job_id text PRIMARY KEY,enabled boolean,paused_reason text,paused_until timestamptz);`);
 const sql=fs.readFileSync('supabase/migrations/214_provider_verification_dispatch.sql','utf8');await db.exec(sql);await db.exec(sql);
 const id='11111111-1111-4111-8111-111111111111';
 await db.query(`INSERT INTO business_profiles VALUES($1,$1,'organization','test','source','test@example.com','{"notification_prefs":{"new_leads":{"sms":false}}}',now()-interval '21 days','unverified','Test')`,[id]);
 const reserve=async(dry=false,email='test@example.com')=>(await db.query('SELECT reserve_verification_reminder($1,$2,$3) id',[id,email,dry])).rows[0].id;
 assert.equal(await reserve(true),id);assert.equal((await db.query('SELECT count(*)::int n FROM email_log')).rows[0].n,0);
 assert.equal(await reserve(false,'wrong@example.com'),null);
 for(const state of ['verified','pending','rejected']){await db.query('UPDATE business_profiles SET verification_state=$1',[state]);assert.equal(await reserve(true),null);}
 await db.exec("UPDATE business_profiles SET verification_state='unverified', claimed_at=now()-interval '20 days'");assert.equal(await reserve(true),null);
 await db.exec("UPDATE business_profiles SET claimed_at=now()-interval '90 days'");assert.equal(await reserve(true),id,'older backlog remains eligible');
 await db.exec("UPDATE business_profiles SET metadata=metadata||'{\"verification_reminder_21d_sent\":true}'");assert.equal(await reserve(true),null);
 await db.exec("UPDATE business_profiles SET metadata=metadata-'verification_reminder_21d_sent'");
 await db.exec("INSERT INTO email_log(recipient,email_type,status,resend_id) VALUES('test@example.com','weekly_analytics_digest','sent','sent1')");assert.equal(await reserve(true),null);
 await db.exec("UPDATE email_log SET status='failed'");assert.equal(await reserve(true),id);
 await db.exec("UPDATE email_log SET status='sent',error_message='Suppressed: do-not-contact'");assert.equal(await reserve(true),id);
 await db.exec("UPDATE email_log SET error_message=NULL,created_at=now()-interval '2 days'");assert.equal(await reserve(true),id);
 const attempts=await Promise.all([reserve(),reserve()]);assert.equal(attempts.filter(Boolean).length,1);
 assert.equal(await reserve(),null);
 assert.equal((await db.query('SELECT metadata FROM business_profiles')).rows[0].metadata.notification_prefs.new_leads.sms,false);
 assert.equal((await db.query('SELECT enabled FROM cron_config')).rows[0].enabled,false);
 await db.exec('SET ROLE authenticated');await assert.rejects(reserve(true));await db.exec('RESET ROLE');
 await db.close();console.log('Verification SQL passed: boundary/backlog, eligibility, digest deferral, dry run, reservation dedupe, metadata preservation, paused config and permissions.');
})().catch(e=>{console.error(e);process.exitCode=1});
