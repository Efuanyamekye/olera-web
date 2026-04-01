/**
 * Seed the Texas Medicaid Eligibility article into content_articles.
 *
 * Usage:
 *   npx tsx scripts/seed-medicaid-eligibility.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

// Parse .env.local manually (no dotenv dependency)
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

const SLUG = "texas-medicaid-eligibility-seniors-2026";

const ARTICLE_HTML = `
<div class="not-prose my-8 rounded-2xl bg-primary-25 border border-primary-100 p-6 sm:p-8">
  <h2 class="text-xl font-bold text-gray-900" style="margin-top:0;margin-bottom:12px;">Quick Summary</h2>
  <ul style="list-style:none;padding:0;margin:0;font-size:15px;line-height:1.5;color:#374151;">
    <li style="padding:3px 0;"><span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#d1fae5;color:#059669;font-size:12px;flex-shrink:0;margin-right:6px;">&#10003;</span> Income limit for most programs: <b>$2,829/month</b> for a single applicant</li>
    <li style="padding:3px 0;"><span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#d1fae5;color:#059669;font-size:12px;flex-shrink:0;margin-right:6px;">&#10003;</span> Asset limit: <b>$2,000</b> &mdash; your home, car, and personal belongings are protected</li>
    <li style="padding:3px 0;"><span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#d1fae5;color:#059669;font-size:12px;flex-shrink:0;margin-right:6px;">&#10003;</span> Over the limit? Spend-down and Miller Trusts are options</li>
    <li style="padding:3px 0;"><span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#d1fae5;color:#059669;font-size:12px;flex-shrink:0;margin-right:6px;">&#10003;</span> Applications take <b>45 to 90 days</b></li>
    <li style="padding:3px 0;"><span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#d1fae5;color:#059669;font-size:12px;flex-shrink:0;margin-right:6px;">&#10003;</span> Apply at <a href="https://www.yourtexasbenefits.com" target="_blank" rel="noopener noreferrer" style="color:#4f7a6d;text-decoration:underline;">YourTexasBenefits.com</a> or call <b>211</b></li>
  </ul>
</div>

<p class="text-lg leading-relaxed">Medicaid is the largest payer of senior care in Texas. It covers home care, assisted living, and nursing facilities for hundreds of thousands of Texans every year.</p>

<p>Most families don&rsquo;t realize they qualify until they&rsquo;re already in crisis. This guide shows you exactly what the income and asset limits are, what to do if you&rsquo;re over the limit, and how to apply.</p>

<h2>Texas Medicaid Income Limits 2026</h2>

<p>Your income limit depends on which program you&rsquo;re applying for. The three main programs for seniors are <strong>STAR+PLUS</strong>, <strong>MEPD</strong> (Medicaid for the Elderly and People with Disabilities), and <strong>Nursing Home Medicaid</strong>.</p>

<div class="my-6 overflow-x-auto not-prose">
  <table class="w-full text-left border-collapse rounded-xl overflow-hidden" style="border-spacing:0;">
    <thead>
      <tr class="bg-primary-600 text-white">
        <th class="px-5 py-3.5 text-sm font-semibold" style="border:none;">Program</th>
        <th class="px-5 py-3.5 text-sm font-semibold" style="border:none;">Single Applicant</th>
        <th class="px-5 py-3.5 text-sm font-semibold" style="border:none;">Married Couple</th>
        <th class="px-5 py-3.5 text-sm font-semibold" style="border:none;">What It Covers</th>
      </tr>
    </thead>
    <tbody class="bg-white">
      <tr class="border-t border-primary-100">
        <td class="px-5 py-3.5 text-sm font-medium text-gray-900" style="border:none;">STAR+PLUS</td>
        <td class="px-5 py-3.5 text-sm text-gray-700" style="border:none;"><strong>$2,829/month</strong></td>
        <td class="px-5 py-3.5 text-sm text-gray-600" style="border:none;">Varies by spouse</td>
        <td class="px-5 py-3.5 text-sm text-gray-600" style="border:none;">Home care, personal assistance, adult day care</td>
      </tr>
      <tr class="border-t border-primary-100 bg-primary-25">
        <td class="px-5 py-3.5 text-sm font-medium text-gray-900" style="border:none;">MEPD</td>
        <td class="px-5 py-3.5 text-sm text-gray-700" style="border:none;"><strong>$2,829/month</strong></td>
        <td class="px-5 py-3.5 text-sm text-gray-600" style="border:none;">Varies by spouse</td>
        <td class="px-5 py-3.5 text-sm text-gray-600" style="border:none;">Medical costs, prescriptions, doctor visits</td>
      </tr>
      <tr class="border-t border-primary-100">
        <td class="px-5 py-3.5 text-sm font-medium text-gray-900" style="border:none;">Nursing Home Medicaid</td>
        <td class="px-5 py-3.5 text-sm text-gray-700" style="border:none;"><strong>$2,829/month</strong></td>
        <td class="px-5 py-3.5 text-sm text-gray-600" style="border:none;">Varies by spouse</td>
        <td class="px-5 py-3.5 text-sm text-gray-600" style="border:none;">Full nursing facility care</td>
      </tr>
    </tbody>
  </table>
</div>

<p>Social Security, pensions, and most retirement income all count toward these limits. If you are not sure what counts, call <strong>211</strong> and ask for a Medicaid eligibility screening.</p>

<h2>Texas Medicaid Asset Limits 2026</h2>

<p>Income is only part of the picture. Medicaid also looks at what you own.</p>

<div class="my-6 overflow-x-auto not-prose">
  <table class="w-full text-left border-collapse rounded-xl overflow-hidden" style="border-spacing:0;">
    <thead>
      <tr class="bg-primary-600 text-white">
        <th class="px-5 py-3.5 text-sm font-semibold" style="border:none;">Program</th>
        <th class="px-5 py-3.5 text-sm font-semibold" style="border:none;">Single Applicant</th>
        <th class="px-5 py-3.5 text-sm font-semibold" style="border:none;">Married Couple</th>
      </tr>
    </thead>
    <tbody class="bg-white">
      <tr class="border-t border-primary-100">
        <td class="px-5 py-3.5 text-sm font-medium text-gray-900" style="border:none;">STAR+PLUS</td>
        <td class="px-5 py-3.5 text-sm text-gray-700" style="border:none;"><strong>$2,000</strong></td>
        <td class="px-5 py-3.5 text-sm text-gray-600" style="border:none;">$3,000</td>
      </tr>
      <tr class="border-t border-primary-100 bg-primary-25">
        <td class="px-5 py-3.5 text-sm font-medium text-gray-900" style="border:none;">MEPD</td>
        <td class="px-5 py-3.5 text-sm text-gray-700" style="border:none;"><strong>$2,000</strong></td>
        <td class="px-5 py-3.5 text-sm text-gray-600" style="border:none;">$3,000</td>
      </tr>
      <tr class="border-t border-primary-100">
        <td class="px-5 py-3.5 text-sm font-medium text-gray-900" style="border:none;">Nursing Home Medicaid</td>
        <td class="px-5 py-3.5 text-sm text-gray-700" style="border:none;"><strong>$2,000</strong></td>
        <td class="px-5 py-3.5 text-sm text-gray-600" style="border:none;">$3,000 (community spouse may keep more)</td>
      </tr>
    </tbody>
  </table>
</div>

<div class="my-6 not-prose rounded-xl bg-green-50 border border-green-200 p-5 sm:p-6">
  <p class="text-base font-semibold text-green-900 mb-4 flex items-center gap-2">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-green-600"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
    These assets are protected
  </p>
  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
    <div class="flex items-center gap-3 bg-white rounded-lg px-4 py-3 border border-green-100">
      <span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-green-100 flex-shrink-0"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-green-600"><path d="M20 6L9 17l-5-5"/></svg></span>
      <span class="text-sm font-medium text-gray-900">Your primary home</span>
    </div>
    <div class="flex items-center gap-3 bg-white rounded-lg px-4 py-3 border border-green-100">
      <span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-green-100 flex-shrink-0"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-green-600"><path d="M20 6L9 17l-5-5"/></svg></span>
      <span class="text-sm font-medium text-gray-900">One vehicle</span>
    </div>
    <div class="flex items-center gap-3 bg-white rounded-lg px-4 py-3 border border-green-100">
      <span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-green-100 flex-shrink-0"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-green-600"><path d="M20 6L9 17l-5-5"/></svg></span>
      <span class="text-sm font-medium text-gray-900">Personal belongings</span>
    </div>
    <div class="flex items-center gap-3 bg-white rounded-lg px-4 py-3 border border-green-100">
      <span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-green-100 flex-shrink-0"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-green-600"><path d="M20 6L9 17l-5-5"/></svg></span>
      <span class="text-sm font-medium text-gray-900">Prepaid funeral plans</span>
    </div>
    <div class="flex items-center gap-3 bg-white rounded-lg px-4 py-3 border border-green-100 sm:col-span-2">
      <span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-green-100 flex-shrink-0"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-green-600"><path d="M20 6L9 17l-5-5"/></svg></span>
      <span class="text-sm font-medium text-gray-900">Life insurance under $1,500 face value</span>
    </div>
  </div>
  <p class="text-sm text-green-800 mt-4"><strong>Your home is protected.</strong> Owning a house does not automatically disqualify you.</p>
</div>

<!-- eligibility-checker -->

<h2>What If You Are Over the Limit</h2>

<p>Being over the income or asset limit does not mean you are out of options. Texas has two legal pathways for people who earn or own too much.</p>

<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 my-6 not-prose">
  <div class="rounded-xl bg-white border border-gray-200 p-5 shadow-sm">
    <div class="flex items-center gap-3 mb-3">
      <span class="inline-flex items-center justify-center w-10 h-10 rounded-full bg-amber-100 flex-shrink-0">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-amber-600"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
      </span>
      <h3 class="text-lg font-semibold text-gray-900" style="margin:0;">Spend-Down</h3>
    </div>
    <p class="text-base text-gray-600 leading-relaxed mb-3">If your income is too high, you can spend down medical expenses each month until your remaining income falls below the limit. Think of it like a deductible &mdash; once you hit it, Medicaid kicks in for the rest of the month.</p>
    <a href="/benefits/spend-down-calculator?state=TX" class="inline-flex items-center gap-1.5 text-base font-medium text-primary-600 hover:text-primary-700 underline">Try the Spend-Down Calculator &rarr;</a>
  </div>
  <div class="rounded-xl bg-white border border-gray-200 p-5 shadow-sm">
    <div class="flex items-center gap-3 mb-3">
      <span class="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary-100 flex-shrink-0">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-primary-600"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
      </span>
      <h3 class="text-lg font-semibold text-gray-900" style="margin:0;">Miller Trust</h3>
    </div>
    <p class="text-base text-gray-600 leading-relaxed">If your income is over the limit but you still need coverage, a Miller Trust (Qualified Income Trust) lets you legally redirect excess income into a trust. Medicaid then ignores that income when calculating eligibility. You will need an attorney to set one up.</p>
  </div>
</div>

<p>For more details, see our <a href="/texas/star-plus-waiver-texas-complete-guide" class="text-primary-600 underline">STAR+PLUS complete guide</a> which covers both pathways in depth.</p>

<h2>How to Apply for Medicaid in Texas</h2>

<p>There are three ways to apply.</p>

<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 my-6 not-prose">
  <div class="rounded-xl bg-white border border-gray-200 p-5 shadow-sm text-center">
    <span class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary-100 mx-auto mb-3">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-primary-600"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
    </span>
    <h3 class="text-base font-semibold text-gray-900 mb-1.5" style="margin-top:0;">Online</h3>
    <p class="text-sm text-gray-600">Go to <a href="https://www.yourtexasbenefits.com" target="_blank" rel="noopener noreferrer" class="text-primary-600 underline">YourTexasBenefits.com</a> and create an account.</p>
  </div>
  <div class="rounded-xl bg-white border border-gray-200 p-5 shadow-sm text-center">
    <span class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary-100 mx-auto mb-3">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-primary-600"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
    </span>
    <h3 class="text-base font-semibold text-gray-900 mb-1.5" style="margin-top:0;">By Phone</h3>
    <p class="text-sm text-gray-600">Call <strong>211</strong> and ask to be connected to your local benefits office.</p>
  </div>
  <div class="rounded-xl bg-white border border-gray-200 p-5 shadow-sm text-center">
    <span class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary-100 mx-auto mb-3">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-primary-600"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
    </span>
    <h3 class="text-base font-semibold text-gray-900 mb-1.5" style="margin-top:0;">In Person</h3>
    <p class="text-sm text-gray-600 mb-3">Visit your local Health and Human Services office with your documents.</p>
    <a href="/texas/benefits/texas-medicaid-for-the-elderly-and-people-with-disabilities#locations" class="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700 underline">Find your closest office &rarr;</a>
  </div>
</div>

<p><strong>Before you apply, gather these documents:</strong></p>

<ul style="list-style:none;padding-left:0;" class="space-y-2.5">
  <li class="flex items-start gap-3"><span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-600 flex-shrink-0 mt-0.5"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span>Government-issued photo ID</li>
  <li class="flex items-start gap-3"><span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-600 flex-shrink-0 mt-0.5"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span>Social Security card</li>
  <li class="flex items-start gap-3"><span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-600 flex-shrink-0 mt-0.5"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span>Proof of income (pay stubs, Social Security letter, pension statements)</li>
  <li class="flex items-start gap-3"><span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-600 flex-shrink-0 mt-0.5"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span>Proof of Texas residency</li>
  <li class="flex items-start gap-3"><span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-600 flex-shrink-0 mt-0.5"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span>Bank statements for the past three months</li>
  <li class="flex items-start gap-3"><span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-600 flex-shrink-0 mt-0.5"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span>Medicare card if you have one</li>
</ul>

<h2>How Long Does Texas Medicaid Take to Approve</h2>

<p>For most programs, expect <strong>45 to 90 days</strong> from the date you submit a complete application.</p>

<div class="my-6 overflow-x-auto not-prose">
  <table class="w-full text-left border-collapse rounded-xl overflow-hidden" style="border-spacing:0;">
    <thead>
      <tr class="bg-primary-600 text-white">
        <th class="px-5 py-3.5 text-sm font-semibold" style="border:none;">Stage</th>
        <th class="px-5 py-3.5 text-sm font-semibold" style="border:none;">Typical Timeline</th>
      </tr>
    </thead>
    <tbody class="bg-white">
      <tr class="border-t border-primary-100">
        <td class="px-5 py-3.5 text-sm font-medium text-gray-900" style="border:none;">Application submitted</td>
        <td class="px-5 py-3.5 text-sm text-gray-600" style="border:none;">Day 1</td>
      </tr>
      <tr class="border-t border-primary-100 bg-primary-25">
        <td class="px-5 py-3.5 text-sm font-medium text-gray-900" style="border:none;">Eligibility determination</td>
        <td class="px-5 py-3.5 text-sm text-gray-600" style="border:none;">45 days</td>
      </tr>
      <tr class="border-t border-primary-100">
        <td class="px-5 py-3.5 text-sm font-medium text-gray-900" style="border:none;">Functional assessment (for home care)</td>
        <td class="px-5 py-3.5 text-sm text-gray-600" style="border:none;">Up to 90 days</td>
      </tr>
      <tr class="border-t border-primary-100 bg-primary-25">
        <td class="px-5 py-3.5 text-sm font-medium text-gray-900" style="border:none;">First benefits start</td>
        <td class="px-5 py-3.5 text-sm text-gray-600" style="border:none;">30 to 90 days total</td>
      </tr>
    </tbody>
  </table>
</div>

<p>A few things can slow it down &mdash; missing documents, income verification issues, or a backlog at your local office. Following up every two weeks after you apply helps keep your case moving.</p>

<p>If you are approved, benefits can be backdated up to three months from your application date in some cases. Ask your caseworker about this when you apply.</p>

<!-- faq-accordion -->

<h2>Find Out What You Qualify For</h2>

<p>You do not have to figure this out alone. The <strong>Olera Benefits Finder</strong> shows you every program your loved one may qualify for in about 2 minutes. Free, no signup required.</p>

<div class="my-6 not-prose"><a href="/benefits/finder" style="color:#ffffff;" class="inline-flex items-center justify-center px-8 py-3.5 bg-primary-600 text-base font-semibold rounded-full hover:bg-primary-700 shadow-md hover:shadow-lg transition-all no-underline">Check Your Benefits &rarr;</a></div>

<p>For more on Texas programs, see our guides on <a href="/texas/star-plus-waiver-texas-complete-guide" class="text-primary-600 underline">STAR+PLUS</a>, <a href="/texas/benefits/medicare-savings" class="text-primary-600 underline">Medicare Savings Programs</a>, and the full <a href="/texas/benefits" class="text-primary-600 underline">Texas Benefits Hub</a>.</p>

<hr />

<p class="text-sm text-gray-500"><em>Eligibility requirements are updated annually. Verify current income and asset limits at <a href="https://www.hhs.texas.gov" target="_blank" rel="noopener noreferrer">hhs.texas.gov</a> or call <strong>211</strong>.</em></p>
`;

async function main() {
  // Check if article already exists
  const { data: existing } = await db
    .from("content_articles")
    .select("id")
    .eq("slug", SLUG)
    .maybeSingle();

  if (existing) {
    const { error } = await db
      .from("content_articles")
      .update({
        title: "Texas Medicaid Eligibility for Seniors 2026",
        meta_title: "Texas Medicaid Eligibility for Seniors 2026 — Income Limits & How to Apply",
        meta_description:
          "Find out if you qualify for Medicaid in Texas in 2026. Income limits, asset limits, and how to apply for STAR+PLUS and other senior care programs.",
        canonical_url: `https://olera.care/texas/${SLUG}`,
        content_html: ARTICLE_HTML.trim(),
        excerpt:
          "Medicaid is the largest payer of senior care in Texas. Most families don't realize they qualify until they're already in crisis. This guide shows you exactly what the income and asset limits are.",
        subtitle:
          "Income limits, asset limits, and how to apply for STAR+PLUS and other senior care programs.",
        reading_time: "8 min read",
        care_types: ["home-health"],
        tags: ["texas", "medicaid", "eligibility", "income-limits", "seniors", "2026"],
        focus_keyword: "texas medicaid eligibility seniors",
        structured_data_type: "Article",
        author_name: "Olera Team",
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (error) {
      console.error("Failed to update article:", error.message);
      process.exit(1);
    }
    console.log(`Updated article (id: ${existing.id})`);
    console.log(`  URL: /texas/${SLUG}?preview=true`);
    return;
  }

  // Insert new article as draft
  const { data, error } = await db
    .from("content_articles")
    .insert({
      slug: SLUG,
      title: "Texas Medicaid Eligibility for Seniors 2026",
      status: "draft",
      section: "caregiver-support",
      category: "guide",
      meta_title: "Texas Medicaid Eligibility for Seniors 2026 — Income Limits & How to Apply",
      meta_description:
        "Find out if you qualify for Medicaid in Texas in 2026. Income limits, asset limits, and how to apply for STAR+PLUS and other senior care programs.",
      canonical_url: `https://olera.care/texas/${SLUG}`,
      content_html: ARTICLE_HTML.trim(),
      excerpt:
        "Medicaid is the largest payer of senior care in Texas. Most families don't realize they qualify until they're already in crisis. This guide shows you exactly what the income and asset limits are.",
      subtitle:
        "Income limits, asset limits, and how to apply for STAR+PLUS and other senior care programs.",
      reading_time: "8 min read",
      care_types: ["home-health"],
      tags: ["texas", "medicaid", "eligibility", "income-limits", "seniors", "2026"],
      focus_keyword: "texas medicaid eligibility seniors",
      structured_data_type: "Article",
      author_name: "Olera Team",
    })
    .select("id, slug")
    .single();

  if (error) {
    console.error("Failed to insert article:", error.message);
    process.exit(1);
  }

  console.log(`Created article (draft):`);
  console.log(`  ID:   ${data.id}`);
  console.log(`  Slug: ${data.slug}`);
  console.log(`  URL:  /texas/${data.slug}?preview=true`);
}

main();
