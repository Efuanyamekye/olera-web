/**
 * Update the Texas senior care article with full content HTML.
 *
 * Usage:
 *   npx tsx scripts/update-senior-care-article.ts
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
    <li style="padding:3px 0;"><span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#d1fae5;color:#059669;font-size:12px;flex-shrink:0;margin-right:6px;">&#10003;</span> Texas has significant help available &mdash; most families never find it</li>
    <li style="padding:3px 0;"><span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#d1fae5;color:#059669;font-size:12px;flex-shrink:0;margin-right:6px;">&#10003;</span> STAR+PLUS covers home care and personal assistance, income limit <b>$2,982/month</b></li>
    <li style="padding:3px 0;"><span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#d1fae5;color:#059669;font-size:12px;flex-shrink:0;margin-right:6px;">&#10003;</span> Medicare stops covering nursing home care after <b>100 days</b></li>
    <li style="padding:3px 0;"><span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#d1fae5;color:#059669;font-size:12px;flex-shrink:0;margin-right:6px;">&#10003;</span> Over the limit? Spend-down and Miller Trusts are options</li>
    <li style="padding:3px 0;"><span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#d1fae5;color:#059669;font-size:12px;flex-shrink:0;margin-right:6px;">&#10003;</span> Average nursing home cost in Texas: <b>$6,600/month</b></li>
  </ul>
</div>

<p>Most families assume they have to pay for senior care entirely out of pocket. The bills pile up, the savings shrink, and the stress of figuring out how to make it work can feel overwhelming.</p>

<p>What most families do not know is that more than $30 billion in benefits goes unclaimed every year. The help exists. Most families just do not know where to find it.</p>

<p>Texas has significant financial assistance available, including Medicaid waivers, Medicare benefits, free state programs, and legal spend-down strategies that can dramatically reduce what your family pays for care. This guide walks through every option available to Texas families in 2026.</p>

<h2>Medicaid Waivers: the Biggest Source of Free Care in Texas</h2>

<p>For most Texas families, Medicaid is the largest and most valuable source of help with senior care costs. It is also the most misunderstood.</p>

<p>Texas Medicaid is not just for people with limited income. It is a program designed to help seniors who need long-term care, whether at home, in assisted living, or in a nursing facility, and it covers far more than most families realize.</p>

<p>The primary program for seniors who want to stay at home is called <strong>STAR+PLUS</strong>. Through STAR+PLUS, Texas Medicaid covers personal care assistants, home modifications, adult day care, meals, therapy, nursing services, and more. For families paying thousands of dollars a month out of pocket, qualifying for STAR+PLUS can be life-changing.</p>

<p>To qualify for STAR+PLUS in 2026, your loved one must meet all of the following:</p>

<ul style="list-style:none;padding-left:0;" class="space-y-3">
  <li class="flex items-start gap-3"><span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-600 flex-shrink-0 mt-0.5"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span><span>Be <strong>21 or older</strong></span></li>
  <li class="flex items-start gap-3"><span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-600 flex-shrink-0 mt-0.5"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span><span>Have a monthly income below <strong>$2,982</strong></span></li>
  <li class="flex items-start gap-3"><span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-600 flex-shrink-0 mt-0.5"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span><span>Have countable assets below <strong>$2,000</strong></span></li>
  <li class="flex items-start gap-3"><span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-600 flex-shrink-0 mt-0.5"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span><span>Require <strong>nursing facility level of care</strong></span></li>
  <li class="flex items-start gap-3"><span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-600 flex-shrink-0 mt-0.5"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span><span>Your home <strong>does not count</strong> as an asset</span></li>
</ul>

<p>If your income or assets are above the limit, you may still qualify through a spend-down strategy. We cover that in detail below.</p>

<p class="my-6"><a href="/texas/benefits/star-plus" class="inline-flex items-center gap-2 text-primary-600 font-semibold hover:text-primary-700 transition-colors">Read the full STAR+PLUS guide, including how to apply <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg></a></p>

<h2>What Medicare Covers (and What It Does Not)</h2>

<p>Medicare is the federal health insurance program most people receive at age 65. It is an important part of paying for senior care, but it has significant gaps that families often do not discover until it is too late.</p>

<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 my-6 not-prose">
  <div class="rounded-xl bg-primary-50 border border-primary-200 p-5 shadow-sm">
    <p class="text-base font-semibold text-primary-800 mb-3 flex items-center gap-2"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-primary-600"><path d="M20 6L9 17l-5-5"/></svg> What Medicare covers</p>
    <ul class="space-y-2.5 text-sm text-primary-900" style="list-style:none;padding:0;margin:0;">
      <li class="flex items-center gap-2.5"><span class="w-2 h-2 rounded-full bg-primary-500 flex-shrink-0"></span>Doctor visits and hospital stays</li>
      <li class="flex items-center gap-2.5"><span class="w-2 h-2 rounded-full bg-primary-500 flex-shrink-0"></span>Short-term skilled nursing (up to 100 days)</li>
      <li class="flex items-center gap-2.5"><span class="w-2 h-2 rounded-full bg-primary-500 flex-shrink-0"></span>Medically necessary home health care</li>
      <li class="flex items-center gap-2.5"><span class="w-2 h-2 rounded-full bg-primary-500 flex-shrink-0"></span>Hospice care for terminal diagnosis</li>
    </ul>
  </div>
  <div class="rounded-xl bg-red-50 border border-red-200 p-5 shadow-sm">
    <p class="text-base font-semibold text-red-700 mb-3 flex items-center gap-2"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-red-500"><path d="M18 6L6 18M6 6l12 12"/></svg> What Medicare does not cover</p>
    <ul class="space-y-2.5 text-sm text-red-800" style="list-style:none;padding:0;margin:0;">
      <li class="flex items-center gap-2.5"><span class="w-2 h-2 rounded-full bg-red-400 flex-shrink-0"></span>Long-term nursing home care beyond 100 days</li>
      <li class="flex items-center gap-2.5"><span class="w-2 h-2 rounded-full bg-red-400 flex-shrink-0"></span>Ongoing personal care at home</li>
      <li class="flex items-center gap-2.5"><span class="w-2 h-2 rounded-full bg-red-400 flex-shrink-0"></span>Assisted living costs</li>
      <li class="flex items-center gap-2.5"><span class="w-2 h-2 rounded-full bg-red-400 flex-shrink-0"></span>Most memory care</li>
    </ul>
  </div>
</div>

<p>This is the gap that catches most families off guard. Your loved one leaves the hospital, Medicare covers the first 20 days of rehab in a skilled nursing facility, and then the bills start. After 100 days, Medicare stops paying entirely.</p>

<p>This is exactly where Medicaid, spend-down strategies, and other programs become critical.</p>

<h2>Paying Out of Pocket: How Long Will Your Money Last</h2>

<p>Many families start by paying for care out of pocket while they figure out their other options. Understanding how long your savings will realistically last is one of the most important things you can do early in the process.</p>

<p>Care costs in Texas vary significantly by city and type of care. Here is what families are paying in 2026:</p>

<div class="my-6 not-prose overflow-hidden rounded-xl border border-gray-200 shadow-sm">
  <table class="w-full text-sm" style="border-collapse:collapse;">
    <thead>
      <tr class="bg-primary-50">
        <th class="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">Type of Care</th>
        <th class="text-right px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">Monthly Cost</th>
        <th class="text-right px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">Annual Cost</th>
      </tr>
    </thead>
    <tbody>
      <tr class="border-b border-gray-100">
        <td class="px-4 py-3 text-gray-800 font-medium">Nursing Home (semi-private)</td>
        <td class="px-4 py-3 text-right text-gray-900 font-semibold">$6,600</td>
        <td class="px-4 py-3 text-right text-gray-900 font-semibold">$79,200</td>
      </tr>
      <tr class="border-b border-gray-100 bg-gray-50/50">
        <td class="px-4 py-3 text-gray-800 font-medium">Assisted Living</td>
        <td class="px-4 py-3 text-right text-gray-900 font-semibold">$4,500</td>
        <td class="px-4 py-3 text-right text-gray-900 font-semibold">$54,000</td>
      </tr>
      <tr class="border-b border-gray-100">
        <td class="px-4 py-3 text-gray-800 font-medium">Home Care (40 hrs/wk)</td>
        <td class="px-4 py-3 text-right text-gray-900 font-semibold">$5,720</td>
        <td class="px-4 py-3 text-right text-gray-900 font-semibold">$68,640</td>
      </tr>
      <tr>
        <td class="px-4 py-3 text-gray-800 font-medium">Adult Day Care</td>
        <td class="px-4 py-3 text-right text-gray-900 font-semibold">$1,690</td>
        <td class="px-4 py-3 text-right text-gray-900 font-semibold">$20,280</td>
      </tr>
    </tbody>
  </table>
  <div class="px-4 py-2.5 bg-gray-50 border-t border-gray-200">
    <p class="text-xs text-gray-400 italic">Source: Genworth Cost of Care Survey, 2024. Texas state averages.</p>
  </div>
</div>

<p>Most families are shocked when they see these numbers laid out clearly. At average nursing home rates, $100,000 in savings lasts just over a year.</p>

<p>The earlier you start exploring Medicaid and other options, the better positioned your family will be. STAR+PLUS has a waitlist that can be <strong>6 to 12 months</strong>, which means applying now, even if your loved one does not need care immediately, is one of the most important things you can do.</p>

<h2>Spend-Down Strategies: How to Qualify for Medicaid Even If You Are Over the Limit</h2>

<p>Being over the Medicaid income or asset limit does not mean you cannot qualify. Many Texas families in this situation successfully qualify for Medicaid through legal spend-down strategies, and doing it right can protect significant assets while still getting your loved one the care they need.</p>

<p>A spend-down works by reducing your countable assets or income to the Medicaid limit through allowable expenses. In Texas, allowable spend-down expenses include:</p>

<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 my-6 not-prose">
  <div class="flex items-center gap-3 rounded-xl bg-primary-25 border border-primary-100/60 px-4 py-3">
    <span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-600 flex-shrink-0"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span>
    <span class="text-sm text-gray-800">Medical bills and prescriptions</span>
  </div>
  <div class="flex items-center gap-3 rounded-xl bg-primary-25 border border-primary-100/60 px-4 py-3">
    <span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-600 flex-shrink-0"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span>
    <span class="text-sm text-gray-800">Home care costs</span>
  </div>
  <div class="flex items-center gap-3 rounded-xl bg-primary-25 border border-primary-100/60 px-4 py-3">
    <span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-600 flex-shrink-0"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span>
    <span class="text-sm text-gray-800">Dental, vision, and hearing expenses</span>
  </div>
  <div class="flex items-center gap-3 rounded-xl bg-primary-25 border border-primary-100/60 px-4 py-3">
    <span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-600 flex-shrink-0"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span>
    <span class="text-sm text-gray-800">Home modifications for safety</span>
  </div>
  <div class="flex items-center gap-3 rounded-xl bg-primary-25 border border-primary-100/60 px-4 py-3">
    <span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-600 flex-shrink-0"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span>
    <span class="text-sm text-gray-800">Health insurance premiums</span>
  </div>
  <div class="flex items-center gap-3 rounded-xl bg-primary-25 border border-primary-100/60 px-4 py-3">
    <span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-600 flex-shrink-0"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span>
    <span class="text-sm text-gray-800">Medical equipment and supplies</span>
  </div>
</div>

<p>A <strong>Qualified Income Trust</strong>, also called a Miller Trust, is another option for people whose monthly income exceeds the $2,982 limit. Excess income goes into the trust each month and is used for specific approved expenses, bringing the countable income below the threshold.</p>

<!-- spend-down-calculator -->

<h2>Programs Available to Texas Seniors</h2>

<p>Beyond Medicaid, Texas has assistance programs that can help your family cover care costs and daily needs. Most families never hear about them. Here are a few to start.</p>

<div class="space-y-2 my-6 not-prose">
  <a href="/texas/benefits/meals-on-wheels" class="block rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 hover:bg-gray-100 hover:border-gray-300 transition-all no-underline group">
    <p class="text-base font-semibold text-gray-900 mb-1 group-hover:text-primary-700 transition-colors">Meals on Wheels Texas</p>
    <p class="text-base text-gray-600 mb-2">Free or low-cost home-delivered meals for seniors 60 and older regardless of income. Available across Houston, Dallas, Austin, San Antonio, and most Texas counties.</p>
    <span class="text-sm font-medium text-primary-600 inline-flex items-center gap-1">Learn more <svg class="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg></span>
  </a>
  <a href="/texas/benefits/medicare-savings" class="block rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 hover:bg-gray-100 hover:border-gray-300 transition-all no-underline group">
    <p class="text-base font-semibold text-gray-900 mb-1 group-hover:text-primary-700 transition-colors">Texas Medicare Savings Programs</p>
    <p class="text-base text-gray-600 mb-2">State-administered programs that pay Medicare Part A and Part B premiums, deductibles, and copays for low-income seniors. Eligible seniors save between <strong>$2,000 and $8,000 per year</strong>. Income must be below $1,781 per month to qualify.</p>
    <span class="text-sm font-medium text-primary-600 inline-flex items-center gap-1">Learn more <svg class="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg></span>
  </a>
  <a href="/texas/benefits/legal-services" class="block rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 hover:bg-gray-100 hover:border-gray-300 transition-all no-underline group">
    <p class="text-base font-semibold text-gray-900 mb-1 group-hover:text-primary-700 transition-colors">Texas Legal Services for Seniors</p>
    <p class="text-base text-gray-600 mb-2">Free legal help for seniors 60 and older on issues including benefits denials, housing disputes, and elder abuse. No income requirement.</p>
    <span class="text-sm font-medium text-primary-600 inline-flex items-center gap-1">Learn more <svg class="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg></span>
  </a>
</div>

<p>These are just a few of the programs available to Texas seniors. Texas has more than 15 free and low-cost assistance programs that most families never know exist. You can browse all of them on our <a href="/texas/benefits" class="text-primary-600 font-semibold hover:text-primary-700 underline underline-offset-2">Texas senior resources page</a>.</p>

<!-- faq-accordion -->

<h2>Find Out What Your Family Qualifies For</h2>

<p>Figuring out how to pay for senior care is one of the hardest things a family can face. There is real help available, most families just do not know where to look.</p>

<p>The Olera Benefits Finder takes about 2 minutes and shows you every program your loved one may qualify for in Texas, your estimated savings, and exactly what to do next. There is nothing to sign up for and it is completely free.</p>

<p>You do not have to figure this out alone.</p>

<div class="my-6 not-prose">
  <a href="/benefits/finder" class="group inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-primary-600 hover:bg-primary-700 transition-all duration-200 shadow-sm hover:shadow-md no-underline">
    <span class="text-sm font-semibold" style="color:#ffffff;">Find my savings</span>
    <svg class="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color:#ffffff;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
  </a>
</div>

<p class="text-sm text-gray-400 italic">Eligibility requirements are updated annually. Verify current program availability at <a href="https://www.hhs.texas.gov" target="_blank" rel="noopener noreferrer">hhs.texas.gov</a> or call 211.</p>

<h3>Explore Other Related Articles</h3>

<div class="my-4 not-prose" style="max-width:240px;">
  <a href="/caregiver-support/how-to-get-paid-as-a-caregiver-in-texas" class="block no-underline group">
    <div class="rounded-xl overflow-hidden mb-2">
      <img src="https://ocaabzfiiikjcgqwhbwr.supabase.co/storage/v1/object/public/content-images/covers/how-to-get-paid-as-a-caregiver-in-texas-1774448475527.png" alt="Caregiver helping a senior" class="w-full aspect-[3/2] object-cover group-hover:opacity-90 transition-opacity" />
    </div>
    <p class="text-sm font-bold text-gray-900 mb-0.5">How to Get Paid as a Caregiver in Texas in 2026</p>
    <p class="text-xs text-gray-400">8 min read</p>
  </a>
</div>
`;

async function main() {
  const slug = "how-to-pay-for-senior-care-in-texas";

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
        "Most families assume they have to pay for senior care entirely out of pocket. This guide covers every option available to Texas families in 2026: Medicaid waivers, Medicare, spend-down strategies, and free programs most families miss.",
      subtitle:
        "Medicaid waivers, Medicare, spend-down strategies, and free programs most families miss.",
      reading_time: "10 min read",
      tags: ["texas", "medicaid", "senior-care", "star-plus"],
      focus_keyword: "how to pay for senior care in texas",
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
