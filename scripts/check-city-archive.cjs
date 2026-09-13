// Run with node scripts/check-city-archive.cjs [path-to-@electric-sql/pglite].
// Uses an isolated in-memory PostgreSQL database; never production credentials.
const { PGlite } = require(process.argv[2] || '@electric-sql/pglite');
const { readFileSync } = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE city_leads(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), phone text, email text, status text DEFAULT 'new', next_offer_at timestamptz, updated_at timestamptz);
    CREATE TABLE city_lead_offers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lead_id uuid, accepted_at timestamptz, declined_at timestamptz, expired_at timestamptz, expires_at timestamptz);
    CREATE TABLE do_not_contact(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), phone text, email text);
    CREATE TABLE sms_queue(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),to_phone text,status text,last_error text);
    INSERT INTO city_leads(phone,email) VALUES ('+12142932795','ann@example.test');
    INSERT INTO do_not_contact(phone) VALUES ('2142932795');
  `);
  await db.exec(readFileSync('supabase/migrations/228_city_lead_archive_messages.sql','utf8'));
  const one = async (sql, args=[]) => (await db.query(sql,args)).rows[0];
  assert.equal((await one("SELECT status FROM city_leads WHERE phone='+12142932795'")).status,'stopped');
  const lead = await one("INSERT INTO city_leads(phone) VALUES ('+15552223333') RETURNING id");
  await db.query("INSERT INTO city_lead_messages(lead_id,channel,body,send_after,created_by) VALUES ($1,'sms','Hello',now(),'test')",[lead.id]);
  await db.query("INSERT INTO city_lead_offers(lead_id,expires_at) VALUES ($1,now()+interval '30 minutes')",[lead.id]);
  await db.exec("INSERT INTO sms_queue(to_phone,status) VALUES ('+15552223333','pending')");
  await db.query("UPDATE city_leads SET archived_at=now(),archive_reason='no_longer_needed' WHERE id=$1",[lead.id]);
  assert.equal((await one('SELECT status FROM city_lead_messages WHERE lead_id=$1',[lead.id])).status,'canceled');
  assert.equal((await one("SELECT status FROM sms_queue WHERE to_phone='+15552223333'")).status,'canceled');
  assert.ok((await one('SELECT expired_at FROM city_lead_offers WHERE lead_id=$1',[lead.id])).expired_at);
  await assert.rejects(db.query("UPDATE city_leads SET status='accepted' WHERE id=$1",[lead.id]),/archived/);
  await assert.rejects(db.query("INSERT INTO city_lead_messages(lead_id,channel,body,send_after,created_by) VALUES ($1,'sms','Hello',now(),'test')",[lead.id]),/archived/);
  await assert.rejects(db.query("INSERT INTO city_lead_offers(lead_id) VALUES ($1)",[lead.id]),/archived/);
  const other = await one("INSERT INTO city_leads(phone) VALUES ('+15552224444') RETURNING id");
  await db.exec("INSERT INTO do_not_contact(phone) VALUES ('5552224444')");
  assert.equal((await one('SELECT archive_reason FROM city_leads WHERE id=$1',[other.id])).archive_reason,'opted_out');
  const repeat = await one("INSERT INTO city_leads(phone) VALUES ('+15552224444') RETURNING status");
  assert.equal(repeat.status,'stopped');
  const active = await one("INSERT INTO city_leads(phone) VALUES ('+15552225555') RETURNING id");
  const queued = await one("INSERT INTO city_lead_messages(lead_id,channel,body,send_after,created_by) VALUES ($1,'sms','Hello',now(),'test') RETURNING id",[active.id]);
  await assert.rejects(db.query("INSERT INTO city_lead_messages(lead_id,channel,body,send_after,created_by) VALUES ($1,'sms','Duplicate',now(),'test')",[active.id]),/unique/);
  const claim = () => db.query("UPDATE city_lead_messages SET status='sending' WHERE id=$1 AND status='pending' RETURNING id",[queued.id]);
  const claims = await Promise.all([claim(),claim()]);
  assert.equal(claims.reduce((n,r)=>n+r.rows.length,0),1);
  await db.close();
  console.log('City archive: migration, backfill, opt-outs, cancellation, reactivation guards, and single-claim checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
