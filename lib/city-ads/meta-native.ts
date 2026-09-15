import { createHmac, timingSafeEqual } from "node:crypto";

export interface NativeForm {
  pageId: string;
  formId: string;
  slug: string;
  campaignTag: string;
  consentVersion: string;
  consentText: string;
  testOnly: boolean;
}
const id = (v: unknown): v is string => typeof v === "string" && /^\d{1,40}$/.test(v);

/** An explicit form allowlist prevents legacy forms entering the care queue. */
export function parseNativeForms(value: string | undefined): NativeForm[] {
  if (!value) return [];
  const rows: unknown = JSON.parse(value);
  if (!Array.isArray(rows)) throw new Error("Invalid Meta form configuration");
  const seen = new Set<string>();
  return rows.map((row: NativeForm) => {
    if (!row || !id(row.pageId) || !id(row.formId) || !row.slug || !row.campaignTag ||
        !row.consentVersion || !row.consentText ||
        ![row.slug,row.campaignTag,row.consentVersion,row.consentText].every(v => typeof v === "string" && v.trim().length > 0) || typeof row.testOnly !== "boolean" || seen.has(row.formId)) {
      throw new Error("Invalid Meta form configuration");
    }
    seen.add(row.formId);
    return row;
  });
}

export function verifyMetaSignature(raw: string, signature: string | null, secret: string): boolean {
  if (!secret || !signature || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  return timingSafeEqual(Buffer.from(signature.slice(7), "hex"), createHmac("sha256", secret).update(raw).digest());
}

export interface NativeReceipt {
  leadgen_id: string; page_id: string; form_id: string; ad_id: string | null; submitted_at: string; form_config: NativeForm;
}
export function extractNativeReceipts(body: unknown, forms: NativeForm[]): NativeReceipt[] {
  const payload = body as { object?: string; entry?: { id?: string; changes?: { field?: string; value?: Record<string, unknown> }[] }[] };
  if (!payload || payload.object !== "page" || !Array.isArray(payload.entry)) return [];
  const receipts = new Map<string, NativeReceipt>();
  for (const entry of payload.entry) {
    if (!Array.isArray(entry.changes)) continue;
    for (const change of entry.changes) {
      if (change.field !== "leadgen") continue;
      const v = change.value;
      if (!v || !forms.some(f => f.pageId === entry.id && f.pageId === v.page_id && f.formId === v.form_id)) continue;
      if (!id(v.leadgen_id) || !id(v.form_id) || !id(v.page_id) || typeof v.created_time !== "number" ||
          !Number.isFinite(v.created_time) || v.created_time < 1 || v.created_time * 1000 > Date.now() + 300000) {
        throw new Error("Malformed lead notification");
      }
      const form = forms.find(f => f.formId === v.form_id && f.pageId === v.page_id)!;
      receipts.set(v.leadgen_id, { form_config: { ...form }, leadgen_id: v.leadgen_id, form_id: v.form_id, page_id: v.page_id,
        ad_id: id(v.ad_id) ? v.ad_id : null, submitted_at: new Date(v.created_time * 1000).toISOString() });
    }
  }
  return [...receipts.values()];
}

export interface MetaLead {
  id?: string; form_id?: string; created_time?: string; campaign_id?: string; adset_id?: string; ad_id?: string;
  field_data?: { name: string; values: string[] }[];
}
export function normalizeMetaLead(lead: MetaLead, receipt: NativeReceipt, form: NativeForm) {
  if (lead.id !== receipt.leadgen_id || lead.form_id !== form.formId || !Array.isArray(lead.field_data)) {
    throw new Error("Lead identity does not match configured form");
  }
  const fields = new Map(lead.field_data.map(f => [f.name, f.values?.[0]?.trim() ?? ""]));
  const fullName = fields.get("full_name") || fields.get("first_name") || "";
  let digits = (fields.get("phone_number") || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (!fullName || !/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) throw new Error("Lead needs a valid name and US phone");
  const email = fields.get("email")?.toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Lead email is invalid");
  const zip = fields.get("zip_code") || fields.get("post_code") || "";
  if (zip && !/^\d{5}(-\d{4})?$/.test(zip)) throw new Error("Lead ZIP is invalid");
  return { slug: form.slug, campaign_tag: form.campaignTag, first_name: fullName.slice(0,60),
    phone: `+1${digits}`, email: email?.slice(0,200) ?? null, zip: zip.slice(0,5) || null,
    consent_form_version: form.consentVersion, consent_text: form.consentText,
    meta_campaign_id: id(lead.campaign_id) ? lead.campaign_id : null,
    meta_adset_id: id(lead.adset_id) ? lead.adset_id : null, is_test: form.testOnly };
}
