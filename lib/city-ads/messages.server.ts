import type { SupabaseClient } from '@supabase/supabase-js';
import { sendSMS } from '@/lib/twilio';
import { sendEmail } from '@/lib/email';
import { citySendWindow } from './send-window';
export { citySendWindow } from './send-window';

/** Fail closed, including when checking provider outreach about this family. */
export async function cityLeadBlocked(db: SupabaseClient, leadId: string): Promise<boolean> {
  const { data: lead, error } = await db.from('city_leads').select('phone,email,status,archived_at,is_test').eq('id', leadId).single();
  if (error) throw error;
  if (lead.is_test || lead.archived_at || lead.status === 'stopped') return true;
  const checks = [];
  if (lead.phone) checks.push(db.from('do_not_contact').select('id').eq('phone', String(lead.phone).replace(/\D/g, '').slice(-10)).limit(1));
  if (lead.email) checks.push(db.from('do_not_contact').select('id').eq('email', String(lead.email).trim().toLowerCase()).limit(1));
  for (const result of await Promise.all(checks)) {
    if (result.error) throw result.error;
    if (result.data?.length) return true;
  }
  return false;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

/** Claim before sending. Ambiguous/crashed sends are never automatically retried. */
export async function deliverCityMessage(db: SupabaseClient, id: string) {
  const { data: row, error } = await db.from('city_lead_messages').update({status:'sending'})
    .eq('id', id).eq('status','pending').lte('send_after', new Date().toISOString()).select('*').maybeSingle();
  if (error) throw error;
  if (!row) return;
  try {
    const {data: lead, error: leadError} = await db.from('city_leads').select('id,slug,phone,email').eq('id',row.lead_id).single();
    if (leadError) throw leadError;
    if (await cityLeadBlocked(db, lead.id)) {
      const {error:e} = await db.from('city_lead_messages').update({status:'canceled',completed_at:new Date().toISOString(),last_error:'Lead archived or opted out'}).eq('id',id);
      if(e) throw e;
      return;
    }
    const window = citySendWindow(lead.slug);
    if (!window.allowed) {
      const {error:e} = await db.from('city_lead_messages').update({status:'pending',send_after:window.nextStart}).eq('id',id);
      if(e) throw e;
      return;
    }
    const metadata = {lead_id:lead.id,city_message_id:id,sent_by:row.created_by};
    const result = row.channel === 'sms'
      ? await sendSMS({to:lead.phone,body:row.body,emailType:'city_lead_family_manual',recipientType:'family',metadata})
      : await sendEmail({to:lead.email,subject:row.subject,html:`<p>${escapeHtml(row.body).replace(/\n/g,'<br>')}</p>`,replyTo:'support@olera.care',emailType:'city_lead_family_manual',recipientType:'family',metadata});
    const {error:e} = await db.from('city_lead_messages').update({status:result.skipped?'canceled':result.success?'sent':'failed',completed_at:new Date().toISOString(),last_error:result.skipped?'Contact suppressed':result.success?null:result.error}).eq('id',id);
    if(e) throw e;
  } catch (error) {
    // Keep sending on exceptions: provider acceptance may be uncertain. Retrying
    // would risk a duplicate. Surface this explicitly for manual reconciliation.
    await db.from('city_lead_messages').update({last_error:'Delivery uncertain; check message history before sending again'}).eq('id',id).eq('status','sending');
    throw error;
  }
}

export async function runCityMessages(db: SupabaseClient) {
  const {data, error} = await db.from('city_lead_messages').select('id').eq('status','pending').lte('send_after',new Date().toISOString()).order('send_after').limit(50);
  if(error) throw error;
  let errors = 0;
  for(const row of data ?? []) { try { await deliverCityMessage(db,row.id); } catch(e) { errors++; console.error('[city-message]', row.id, e); } }
  return {processed:data?.length ?? 0,errors};
}
