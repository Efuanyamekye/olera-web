/**
 * Update the Texas caregiver article with full content HTML.
 *
 * Usage:
 *   npx tsx scripts/update-texas-article.ts
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

// Parse .env.local manually
const envPath = resolve(process.cwd(), ".env.local");
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
  if (!process.env[key]) process.env[key] = val;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY);

const ARTICLE_HTML = `
<div class="not-prose my-8 rounded-2xl bg-primary-25 border border-primary-100 p-6 sm:p-8">
  <h2 class="text-xl font-bold text-gray-900" style="margin-top:0;margin-bottom:12px;">Quick Summary</h2>
  <ul style="list-style:none;padding:0;margin:0;font-size:15px;line-height:1.5;color:#374151;">
    <li style="padding:3px 0;"><span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#d1fae5;color:#059669;font-size:12px;flex-shrink:0;margin-right:6px;">&#10003;</span> Family members and close friends can get paid to care for a loved one through STAR+PLUS</li>
    <li style="padding:3px 0;"><span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#d1fae5;color:#059669;font-size:12px;flex-shrink:0;margin-right:6px;">&#10003;</span> Pay ranges from <b>$10 to $17 per hour</b>, up to 56 hours per week</li>
    <li style="padding:3px 0;"><span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#d1fae5;color:#059669;font-size:12px;flex-shrink:0;margin-right:6px;">&#10003;</span> You must be 18 or older and pass a background check</li>
    <li style="padding:3px 0;"><span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#d1fae5;color:#059669;font-size:12px;flex-shrink:0;margin-right:6px;">&#10003;</span> Spouses and legal guardians generally do not qualify</li>
    <li style="padding:3px 0;"><span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#d1fae5;color:#059669;font-size:12px;flex-shrink:0;margin-right:6px;">&#10003;</span> First paycheck typically takes <b>30 to 90 days</b></li>
  </ul>
</div>

<p class="text-lg leading-relaxed">Caring for someone you love is one of the hardest and most important things you can do. You deserve support, not just emotionally, but practically and financially too.</p>

<p>Applying for caregiver benefits in Texas is more complicated than it should be. The systems are confusing, the paperwork is overwhelming, and most families never find out about the help that is available to them. That is exactly why we built Olera to make this easier.</p>

<p>Here is what most families in Texas do not know: <strong>if you are already caring for an aging parent, spouse, or loved one, you may be able to get paid for the work you are doing every day.</strong> This guide walks you through everything, step by step.</p>

<h2>Can You Get Paid as a Caregiver in Texas?</h2>

<p><strong>Yes.</strong> Through Texas Medicaid&rsquo;s <strong>STAR+PLUS</strong> program, family members and close friends can be officially hired and paid as caregivers.</p>

<!-- eligibility-checker -->

<h2>Who Qualifies to Be a Paid Caregiver in Texas</h2>

<p>The requirements are straightforward:</p>

<ul style="list-style:none;padding-left:0;" class="space-y-3">
  <li class="flex items-start gap-3"><span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-600 flex-shrink-0 mt-0.5"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span><span>You are <strong>18 or older</strong></span></li>
  <li class="flex items-start gap-3"><span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-600 flex-shrink-0 mt-0.5"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span><span>You are a <strong>family member, relative, or close friend</strong></span></li>
  <li class="flex items-start gap-3"><span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-600 flex-shrink-0 mt-0.5"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span><span>You can <strong>pass a background check</strong></span></li>
  <li class="flex items-start gap-3"><span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-600 flex-shrink-0 mt-0.5"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span><span>Your loved one is enrolled in <strong>STAR+PLUS</strong> and needs help with daily activities</span></li>
</ul>

<h3>Who Can and Cannot Be a Paid Caregiver</h3>

<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 my-6 not-prose">
  <div class="rounded-xl bg-primary-50 border border-primary-200 p-5 shadow-sm">
    <p class="text-base font-semibold text-primary-800 mb-3 flex items-center gap-2"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-primary-600"><path d="M20 6L9 17l-5-5"/></svg> Who can be paid</p>
    <ul class="space-y-2.5 text-sm text-primary-900" style="list-style:none;padding:0;margin:0;">
      <li class="flex items-center gap-2.5"><span class="w-2 h-2 rounded-full bg-primary-500 flex-shrink-0"></span>Adult children</li>
      <li class="flex items-center gap-2.5"><span class="w-2 h-2 rounded-full bg-primary-500 flex-shrink-0"></span>Siblings and relatives</li>
      <li class="flex items-center gap-2.5"><span class="w-2 h-2 rounded-full bg-primary-500 flex-shrink-0"></span>Close friends</li>
    </ul>
  </div>
  <div class="rounded-xl bg-red-50 border border-red-200 p-5 shadow-sm">
    <p class="text-base font-semibold text-red-700 mb-3 flex items-center gap-2"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-red-500"><path d="M18 6L6 18M6 6l12 12"/></svg> Who cannot</p>
    <ul class="space-y-2.5 text-sm text-red-800" style="list-style:none;padding:0;margin:0;">
      <li class="flex items-center gap-2.5"><span class="w-2 h-2 rounded-full bg-red-400 flex-shrink-0"></span>Legal guardians (in most cases)</li>
      <li class="flex items-center gap-2.5"><span class="w-2 h-2 rounded-full bg-red-400 flex-shrink-0"></span>Strangers not connected to the family</li>
      <li class="flex items-center gap-2.5"><span class="w-2 h-2 rounded-full bg-red-400 flex-shrink-0"></span>Spouses (in most cases)</li>
    </ul>
  </div>
</div>

<h2>How Much Can You Earn</h2>

<p>Most caregivers in Texas earn between <strong>$10 and $17 per hour</strong>. Hours are based on your loved one&rsquo;s care plan, typically <strong>20 to 56 hours per week</strong>.</p>

<h3>MCO Pay Rate Comparison</h3>

<div class="my-6 rounded-xl border border-primary-200 overflow-hidden not-prose">
  <table style="margin:0;border:none;" class="w-full">
    <thead>
      <tr class="bg-primary-50">
        <th class="text-left text-xs font-semibold text-primary-800 uppercase tracking-wider px-4 py-3" style="border:none;">Organization</th>
        <th class="text-left text-xs font-semibold text-primary-800 uppercase tracking-wider px-4 py-3" style="border:none;">Hourly Rate</th>
        <th class="text-left text-xs font-semibold text-primary-800 uppercase tracking-wider px-4 py-3 hidden sm:table-cell" style="border:none;">Weekly Hours</th>
        <th class="text-right text-xs font-semibold text-primary-800 uppercase tracking-wider px-4 py-3" style="border:none;">Est. Monthly</th>
      </tr>
    </thead>
    <tbody>
      <tr class="border-t border-primary-100">
        <td class="px-4 py-3 text-sm font-medium text-gray-900" style="border:none;">UnitedHealthcare</td>
        <td class="px-4 py-3 text-sm text-gray-600" style="border:none;">$10.60 &ndash; $15.75</td>
        <td class="px-4 py-3 text-sm text-gray-600 hidden sm:table-cell" style="border:none;">20 &ndash; 56</td>
        <td class="px-4 py-3 text-sm font-semibold text-primary-700 text-right" style="border:none;">$848 &ndash; $3,528</td>
      </tr>
      <tr class="border-t border-primary-100 bg-primary-25">
        <td class="px-4 py-3 text-sm font-medium text-gray-900" style="border:none;">Molina Healthcare</td>
        <td class="px-4 py-3 text-sm text-gray-600" style="border:none;">$10.25 &ndash; $14.50</td>
        <td class="px-4 py-3 text-sm text-gray-600 hidden sm:table-cell" style="border:none;">20 &ndash; 56</td>
        <td class="px-4 py-3 text-sm font-semibold text-primary-700 text-right" style="border:none;">$820 &ndash; $3,248</td>
      </tr>
      <tr class="border-t border-primary-100">
        <td class="px-4 py-3 text-sm font-medium text-gray-900" style="border:none;">Superior HealthPlan</td>
        <td class="px-4 py-3 text-sm text-gray-600" style="border:none;">$10.50 &ndash; $16.00</td>
        <td class="px-4 py-3 text-sm text-gray-600 hidden sm:table-cell" style="border:none;">20 &ndash; 56</td>
        <td class="px-4 py-3 text-sm font-semibold text-primary-700 text-right" style="border:none;">$840 &ndash; $3,584</td>
      </tr>
      <tr class="border-t border-primary-100 bg-primary-25">
        <td class="px-4 py-3 text-sm font-medium text-gray-900" style="border:none;">Community First</td>
        <td class="px-4 py-3 text-sm text-gray-600" style="border:none;">$11.00 &ndash; $17.00</td>
        <td class="px-4 py-3 text-sm text-gray-600 hidden sm:table-cell" style="border:none;">20 &ndash; 56</td>
        <td class="px-4 py-3 text-sm font-semibold text-primary-700 text-right" style="border:none;">$880 &ndash; $3,808</td>
      </tr>
    </tbody>
  </table>
</div>

<p><em>Rates vary by region and care plan. These are estimates based on 2025&ndash;2026 data.</em></p>

<h2>How to Apply, Step by Step</h2>

<p>The application process has six steps. Most families can complete it in 30 to 90 days.</p>

<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 my-6 not-prose">
  <div class="rounded-xl bg-white border border-gray-200 p-5 shadow-sm flex gap-4 items-start">
    <span class="inline-flex items-center justify-center w-9 h-9 rounded-full bg-primary-100 text-primary-700 text-sm font-bold flex-shrink-0">1</span>
    <div><p class="text-sm font-semibold text-gray-900 mb-1">Confirm STAR+PLUS enrollment</p><p class="text-sm text-gray-500">Call <strong>211</strong> or visit <a href="https://www.yourtexasbenefits.com" target="_blank" rel="noopener noreferrer" class="text-primary-600 underline">YourTexasBenefits.com</a> to start.</p></div>
  </div>
  <div class="rounded-xl bg-white border border-gray-200 p-5 shadow-sm flex gap-4 items-start">
    <span class="inline-flex items-center justify-center w-9 h-9 rounded-full bg-primary-100 text-primary-700 text-sm font-bold flex-shrink-0">2</span>
    <div><p class="text-sm font-semibold text-gray-900 mb-1">Request Consumer Directed Services</p><p class="text-sm text-gray-500">Ask their managed care organization to add CDS to the care plan.</p></div>
  </div>
  <div class="rounded-xl bg-white border border-gray-200 p-5 shadow-sm flex gap-4 items-start">
    <span class="inline-flex items-center justify-center w-9 h-9 rounded-full bg-primary-100 text-primary-700 text-sm font-bold flex-shrink-0">3</span>
    <div><p class="text-sm font-semibold text-gray-900 mb-1">Service coordinator assessment</p><p class="text-sm text-gray-500">A coordinator will assess their care needs and approve hours.</p></div>
  </div>
  <div class="rounded-xl bg-white border border-gray-200 p-5 shadow-sm flex gap-4 items-start">
    <span class="inline-flex items-center justify-center w-9 h-9 rounded-full bg-primary-100 text-primary-700 text-sm font-bold flex-shrink-0">4</span>
    <div><p class="text-sm font-semibold text-gray-900 mb-1">Choose an FMSA</p><p class="text-sm text-gray-500">Pick a Financial Management Services Agency to handle payroll and paperwork.</p></div>
  </div>
  <div class="rounded-xl bg-white border border-gray-200 p-5 shadow-sm flex gap-4 items-start">
    <span class="inline-flex items-center justify-center w-9 h-9 rounded-full bg-primary-100 text-primary-700 text-sm font-bold flex-shrink-0">5</span>
    <div><p class="text-sm font-semibold text-gray-900 mb-1">Complete your application</p><p class="text-sm text-gray-500">Submit your caregiver application, background check, and training.</p></div>
  </div>
  <div class="rounded-xl bg-white border border-gray-200 p-5 shadow-sm flex gap-4 items-start">
    <span class="inline-flex items-center justify-center w-9 h-9 rounded-full bg-primary-100 text-primary-700 text-sm font-bold flex-shrink-0">6</span>
    <div><p class="text-sm font-semibold text-gray-900 mb-1">Submit timesheets and get paid</p><p class="text-sm text-gray-500">Receive payment typically every two weeks.</p></div>
  </div>
</div>

<h3>How Long Does It Take?</h3>

<p>Here is a realistic timeline for each phase of the process.</p>

<div class="my-6 space-y-3 not-prose">
  <div class="flex items-center gap-4 rounded-lg bg-primary-25 border border-primary-100 px-4 py-3">
    <span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary-100 text-primary-600 flex-shrink-0"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></span>
    <span class="flex-1 text-sm text-gray-800">Enrollment &amp; CDS request</span>
    <span class="text-sm font-semibold text-primary-700 flex-shrink-0">1 &ndash; 2 weeks</span>
  </div>
  <div class="flex items-center gap-4 rounded-lg bg-primary-25 border border-primary-100 px-4 py-3">
    <span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary-100 text-primary-600 flex-shrink-0"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></span>
    <span class="flex-1 text-sm text-gray-800">Assessment &amp; hour approval</span>
    <span class="text-sm font-semibold text-primary-700 flex-shrink-0">2 &ndash; 4 weeks</span>
  </div>
  <div class="flex items-center gap-4 rounded-lg bg-primary-25 border border-primary-100 px-4 py-3">
    <span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary-100 text-primary-600 flex-shrink-0"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></span>
    <span class="flex-1 text-sm text-gray-800">FMSA setup &amp; application</span>
    <span class="text-sm font-semibold text-primary-700 flex-shrink-0">2 &ndash; 4 weeks</span>
  </div>
  <div class="flex items-center gap-4 rounded-lg bg-primary-100 border border-primary-300 px-4 py-3">
    <span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary-600 text-white flex-shrink-0"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span>
    <span class="flex-1 text-sm font-medium text-gray-900">First paycheck</span>
    <span class="text-sm font-bold text-primary-800 flex-shrink-0">30 &ndash; 90 days total</span>
  </div>
</div>

<h2>What Documents Do You Need</h2>

<ul style="list-style:none;padding-left:0;" class="space-y-3">
  <li class="flex items-start gap-3"><span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-600 flex-shrink-0 mt-0.5"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span>Government-issued photo ID</li>
  <li class="flex items-start gap-3"><span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-600 flex-shrink-0 mt-0.5"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span>Social Security card</li>
  <li class="flex items-start gap-3"><span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-600 flex-shrink-0 mt-0.5"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span>Proof of Texas address</li>
  <li class="flex items-start gap-3"><span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-600 flex-shrink-0 mt-0.5"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span>Consent to background check</li>
</ul>

<p><strong>Want the full checklist?</strong> Use the <a href="/texas/benefits/senior-companion/checklist">Olera Document Checklist</a> to get a personalized document list you can download or email to yourself.</p>

<!-- faq-accordion -->

<h2>Find Out What Your Family Qualifies For</h2>

<p>You do not have to figure this out alone. The <strong>Olera Benefits Finder</strong> shows you every program your loved one may qualify for in about 2 minutes. Free, no signup required.</p>

<div class="my-6 not-prose"><a href="/benefits/finder" style="color:#ffffff;" class="inline-flex items-center justify-center px-8 py-3.5 bg-primary-600 text-base font-semibold rounded-full hover:bg-primary-700 shadow-md hover:shadow-lg transition-all no-underline">Check Your Benefits &rarr;</a></div>

<hr />

<p class="text-sm text-gray-500"><em>Eligibility requirements are updated annually. Verify current program availability at <a href="https://www.hhs.texas.gov" target="_blank" rel="noopener noreferrer">hhs.texas.gov</a> or call <strong>211</strong>.</em></p>
`;

async function main() {
  const slug = "how-to-get-paid-as-a-caregiver-in-texas";

  const { data: article } = await db
    .from("content_articles")
    .select("id")
    .eq("slug", slug)
    .single();

  if (!article) {
    console.error(`Article with slug "${slug}" not found.`);
    process.exit(1);
  }

  const { error } = await db
    .from("content_articles")
    .update({
      content_html: ARTICLE_HTML.trim(),
      excerpt:
        "Caring for someone you love is one of the hardest and most important things you can do. If you are already caring for an aging parent, spouse, or loved one in Texas, you may be able to get paid for the work you are doing every day through Medicaid\u2019s STAR+PLUS program.",
      subtitle:
        "A step-by-step guide to getting paid through Texas Medicaid\u2019s STAR+PLUS Consumer Directed Services program.",
      reading_time: "8 min read",
      tags: ["texas", "medicaid", "paid-caregiving", "star-plus", "cover-alt:Family caregiver helping elderly parent at home in Texas"],
      focus_keyword: "get paid as a caregiver in texas",
      structured_data_type: "Article",
      updated_at: new Date().toISOString(),
    })
    .eq("id", article.id);

  if (error) {
    console.error("Failed to update article:", error.message);
    process.exit(1);
  }

  console.log(`Updated article ${article.id} with full content.`);
  console.log(`  URL: /texas/${slug}`);
}

main();
