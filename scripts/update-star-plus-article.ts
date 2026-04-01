/**
 * Update the STAR+PLUS waiver guide article with full content HTML.
 *
 * Usage:
 *   npx tsx scripts/update-star-plus-article.ts
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
    <li style="padding:3px 0;"><span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#d1fae5;color:#059669;font-size:12px;flex-shrink:0;margin-right:6px;">&#10003;</span> Covers home care and personal assistance so seniors can stay home</li>
    <li style="padding:3px 0;"><span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#d1fae5;color:#059669;font-size:12px;flex-shrink:0;margin-right:6px;">&#10003;</span> Income limit: <b>$2,982/month</b></li>
    <li style="padding:3px 0;"><span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#d1fae5;color:#059669;font-size:12px;flex-shrink:0;margin-right:6px;">&#10003;</span> Waitlist: <b>6 to 18 months</b> &mdash; apply as early as possible</li>
    <li style="padding:3px 0;"><span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#d1fae5;color:#059669;font-size:12px;flex-shrink:0;margin-right:6px;">&#10003;</span> Family members can be paid caregivers</li>
  </ul>
</div>

<p>There is a Texas Medicaid program that helps seniors stay home instead of moving to a nursing facility. It covers personal care, home modifications, meals, therapy, and more. It can save families tens of thousands of dollars a year.</p>

<p>Most families have never heard of it.</p>

<p>The STAR+PLUS Waiver is one of the most valuable and least-known benefits available to Texas seniors. If your loved one needs help with daily activities and you are trying to figure out how to make care work without draining your savings, this guide is for you. We are going to walk through everything clearly so you can decide if STAR+PLUS is the right fit for your family.</p>

<h2>What Is the STAR+PLUS Waiver in Texas</h2>

<p>STAR+PLUS is Texas's primary Medicaid managed care program for seniors 65 and older and adults with disabilities. Its full name is the STAR+PLUS Home and Community Based Services program, but most people just call it the STAR+PLUS Waiver.</p>

<p>The program was designed around one simple idea: most people would rather receive care at home than in a nursing facility. STAR+PLUS makes that possible by covering the same level of care a nursing home would provide, but delivered where your loved one actually wants to be -- at home, in assisted living, or in adult foster care.</p>

<p>What makes STAR+PLUS different from regular Medicaid is that it covers both medical care and non-medical long-term supports. That means not just doctor visits and prescriptions, but also the personal care, home modifications, and daily assistance that allow someone to live safely and independently.</p>

<h2>What Does STAR+PLUS Cover</h2>

<p>STAR+PLUS covers a wide range of services. An individualized service plan is created for each participant based on their specific needs, so not every person receives every service. Here is what the program makes available:</p>

<h3>Home-Based Services</h3>

<p><strong>Personal care assistants</strong> help with bathing, dressing, grooming, eating, and mobility. This is often the most important service for families -- it means your loved one has consistent, reliable help with the activities that have become difficult.</p>

<p><strong>Home-delivered meals</strong> are provided to participants who cannot prepare food independently.</p>

<p><strong>Home modifications</strong> cover additions like grab bars, wheelchair ramps, and other changes that make it safer to stay at home. There is a lifetime limit of $7,500 for modifications.</p>

<p><strong>Adaptive aids and medical equipment</strong> including wheelchairs, walkers, and other devices are covered based on assessed need.</p>

<p><strong>Emergency response systems</strong> give your loved one a way to call for help at the press of a button.</p>

<p><strong>Transportation</strong> to medical appointments is available for participants who cannot drive.</p>

<h3>Medical and Therapy Services</h3>

<p><strong>Nursing services</strong> provide skilled medical care at home including wound care, medication management, and health monitoring.</p>

<p><strong>Physical, occupational, and speech therapy</strong> help participants maintain or improve their functional abilities.</p>

<p><strong>Adult day care</strong> provides structured activities and supervision during daytime hours, which also gives family caregivers important time to rest and recharge.</p>

<p><strong>Respite care</strong> gives family caregivers a temporary break while a substitute caregiver steps in.</p>

<p><strong>Dental, vision, and hearing</strong> services are included as part of the STAR+PLUS benefits package.</p>

<p><strong>Medical supplies and prescriptions</strong> are covered through your managed care organization.</p>

<h3>Consumer Directed Services</h3>

<p>One important option within STAR+PLUS is <strong>Consumer Directed Services</strong>. This allows your loved one to choose their own caregiver, including family members and close friends, instead of being assigned someone from an agency.</p>

<p class="my-6"><a href="/texas/how-to-get-paid-as-a-caregiver-in-texas" class="inline-flex items-center gap-2 text-primary-600 font-semibold hover:text-primary-700 transition-colors">Learn more about getting paid as a caregiver through STAR+PLUS <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg></a></p>

<h2>STAR+PLUS Eligibility Requirements 2026</h2>

<p>To qualify for the STAR+PLUS Waiver in Texas in 2026 your loved one must meet both financial and medical criteria.</p>

<h3>Financial Requirements</h3>

<div class="my-6 not-prose overflow-hidden rounded-xl border border-gray-200 shadow-sm">
  <table class="w-full text-sm" style="border-collapse:collapse;">
    <thead>
      <tr class="bg-primary-50">
        <th class="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">Requirement</th>
        <th class="text-right px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">2026 Limit</th>
      </tr>
    </thead>
    <tbody>
      <tr class="border-b border-gray-100">
        <td class="px-4 py-3 text-gray-800 font-medium">Monthly income (individual)</td>
        <td class="px-4 py-3 text-right text-gray-900 font-semibold">$2,982</td>
      </tr>
      <tr class="border-b border-gray-100 bg-gray-50/50">
        <td class="px-4 py-3 text-gray-800 font-medium">Countable assets (individual)</td>
        <td class="px-4 py-3 text-right text-gray-900 font-semibold">$2,000</td>
      </tr>
      <tr class="border-b border-gray-100">
        <td class="px-4 py-3 text-gray-800 font-medium">Home</td>
        <td class="px-4 py-3 text-right text-primary-700 font-semibold">Does not count</td>
      </tr>
      <tr>
        <td class="px-4 py-3 text-gray-800 font-medium">One vehicle</td>
        <td class="px-4 py-3 text-right text-primary-700 font-semibold">Excluded regardless of value</td>
      </tr>
    </tbody>
  </table>
</div>

<h3>Medical Requirements</h3>

<ul style="list-style:none;padding-left:0;" class="space-y-3">
  <li class="flex items-start gap-3"><span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-600 flex-shrink-0 mt-0.5"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span><span>Age <strong>21 or older</strong></span></li>
  <li class="flex items-start gap-3"><span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-600 flex-shrink-0 mt-0.5"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span><span><strong>Texas resident</strong> and US citizen or eligible non-citizen</span></li>
  <li class="flex items-start gap-3"><span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-600 flex-shrink-0 mt-0.5"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span><span>Requires <strong>nursing facility level of care</strong>, meaning significant help is needed with daily activities like bathing, dressing, eating, or mobility</span></li>
</ul>

<p>If your loved one's income is above $2,982 per month, they may still qualify through a <strong>Qualified Income Trust</strong>, also called a Miller Trust. If their assets are above $2,000, a legal spend-down strategy may help them reach eligibility.</p>

<!-- spend-down-calculator -->

<p>Not sure if your loved one qualifies? The Olera Benefits Finder can give you a clearer picture in about 2 minutes.</p>

<div class="my-6 not-prose">
  <a href="/benefits/finder" class="group inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-primary-600 hover:bg-primary-700 transition-all duration-200 shadow-sm hover:shadow-md no-underline">
    <span class="text-sm font-semibold" style="color:#ffffff;">Check STAR+PLUS eligibility</span>
    <svg class="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color:#ffffff;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
  </a>
</div>

<h2>How to Apply for STAR+PLUS in Texas</h2>

<p>Applying for STAR+PLUS involves several steps across different agencies. It can feel complicated, but taking it one step at a time makes it manageable. Here is exactly what to expect:</p>

<div class="space-y-4 my-6 not-prose">
  <div class="flex gap-4 items-start">
    <span class="flex items-center justify-center w-8 h-8 rounded-full bg-primary-600 text-white text-sm font-bold flex-shrink-0">1</span>
    <div>
      <p class="font-semibold text-gray-900 mb-1">Get on the interest list</p>
      <p class="text-sm text-gray-600">Call <strong>2-1-1</strong> and ask to be added to the STAR+PLUS interest list. This is the most important first step. The program has limited enrollment slots and a waitlist. The sooner you call, the sooner your place is secured.</p>
    </div>
  </div>
  <div class="flex gap-4 items-start">
    <span class="flex items-center justify-center w-8 h-8 rounded-full bg-primary-600 text-white text-sm font-bold flex-shrink-0">2</span>
    <div>
      <p class="font-semibold text-gray-900 mb-1">Apply for Medicaid</p>
      <p class="text-sm text-gray-600">If your loved one is not already enrolled in Texas Medicaid, apply at <a href="https://www.yourtexasbenefits.com" target="_blank" rel="noopener noreferrer" class="text-primary-600 font-semibold underline">YourTexasBenefits.com</a> or in person at your local Texas Health and Human Services office. You will need proof of income, identity, and Texas residency.</p>
    </div>
  </div>
  <div class="flex gap-4 items-start">
    <span class="flex items-center justify-center w-8 h-8 rounded-full bg-primary-600 text-white text-sm font-bold flex-shrink-0">3</span>
    <div>
      <p class="font-semibold text-gray-900 mb-1">Complete a needs assessment</p>
      <p class="text-sm text-gray-600">A service coordinator from your managed care organization will visit your loved one to assess their care needs. This assessment determines which services they qualify for and how many hours per week.</p>
    </div>
  </div>
  <div class="flex gap-4 items-start">
    <span class="flex items-center justify-center w-8 h-8 rounded-full bg-primary-600 text-white text-sm font-bold flex-shrink-0">4</span>
    <div>
      <p class="font-semibold text-gray-900 mb-1">Choose a managed care organization</p>
      <p class="text-sm text-gray-600">Texas has several MCOs that deliver STAR+PLUS services including UnitedHealthcare, Molina, Superior HealthPlan, and Community First Health Plans. You will choose one and be assigned a service coordinator who will manage your loved one's care plan.</p>
    </div>
  </div>
  <div class="flex gap-4 items-start">
    <span class="flex items-center justify-center w-8 h-8 rounded-full bg-primary-600 text-white text-sm font-bold flex-shrink-0">5</span>
    <div>
      <p class="font-semibold text-gray-900 mb-1">Receive your individualized service plan</p>
      <p class="text-sm text-gray-600">Your service coordinator creates a personalized care plan based on the needs assessment. This plan outlines exactly which services your loved one will receive and how often.</p>
    </div>
  </div>
  <div class="flex gap-4 items-start">
    <span class="flex items-center justify-center w-8 h-8 rounded-full bg-primary-600 text-white text-sm font-bold flex-shrink-0">6</span>
    <div>
      <p class="font-semibold text-gray-900 mb-1">Care begins</p>
      <p class="text-sm text-gray-600">Once the plan is approved, services begin. Your service coordinator remains your main point of contact for questions, changes, and ongoing support.</p>
    </div>
  </div>
</div>

<h2>STAR+PLUS Waitlist: What to Expect</h2>

<p>STAR+PLUS is not an entitlement program, which means the number of enrollment slots is limited. When those slots are full, a waitlist forms.</p>

<p>Current wait times in Texas range from several months to over a year depending on the region. People already receiving nursing home Medicaid are given priority over at-home applicants when slots open up.</p>

<p>The most important thing you can do right now is <strong>call 2-1-1 and get on the interest list</strong>, even if your loved one does not need services yet. Your place on the list is determined by when you call, not when you are ready to start. Waiting until the need is urgent means waiting even longer for help to arrive.</p>

<p>While you wait, there are other programs that can provide support immediately. The <a href="/benefits/finder" class="text-primary-600 font-semibold underline">Olera Benefits Finder</a> can show you what is available to your family right now.</p>

<h2>STAR+PLUS Service Areas in Texas</h2>

<p>STAR+PLUS is available statewide across Texas. Services are delivered through managed care organizations in each region.</p>

<h3>Houston</h3>
<p>STAR+PLUS is available throughout Harris, Galveston, Montgomery, and Liberty counties. MCOs serving the Houston area include UnitedHealthcare, Molina, and Superior HealthPlan.</p>

<h3>Dallas and Fort Worth</h3>
<p>Available in Dallas, Tarrant, Collin, and Denton counties. The DFW metro has some of the shortest waitlist times in Texas due to higher provider availability.</p>

<h3>San Antonio</h3>
<p>Available in Bexar County through Community First Health Plans and other MCOs.</p>

<h3>Austin</h3>
<p>Available in Travis and Williamson counties.</p>

<p>Not sure which MCO serves your area? Call 2-1-1 and they can connect you with the right organization for your county.</p>

<!-- faq-accordion -->

<h2>Ready to Find Out If Your Family Qualifies</h2>

<p>STAR+PLUS can change what is possible for your family. The difference between paying $8,500 a month for a nursing home and having care covered at home is significant, financially and emotionally.</p>

<p>The first step is finding out if your loved one qualifies. The Olera Benefits Finder walks you through the key questions in about 2 minutes and shows you every Texas program they may be eligible for, including STAR+PLUS.</p>

<p>You do not have to figure this out alone.</p>

<div class="my-6 not-prose">
  <a href="/benefits/finder" class="group inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-primary-600 hover:bg-primary-700 transition-all duration-200 shadow-sm hover:shadow-md no-underline">
    <span class="text-sm font-semibold" style="color:#ffffff;">See if your loved one qualifies for STAR+PLUS</span>
    <svg class="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color:#ffffff;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
  </a>
</div>

<p>You can also go directly to the <a href="/texas/benefits/star-plus" class="text-primary-600 font-semibold underline">STAR+PLUS program page</a> for eligibility details, the document checklist, and application forms.</p>

<p class="text-sm text-gray-400 italic">Eligibility requirements are updated annually. Verify current program availability at <a href="https://www.hhs.texas.gov" target="_blank" rel="noopener noreferrer">hhs.texas.gov</a> or call 2-1-1.</p>

<h3>Explore Other Related Articles</h3>

<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 my-4 not-prose" style="max-width:500px;">
  <a href="/texas/how-to-pay-for-senior-care-in-texas" class="block no-underline group">
    <div class="rounded-xl overflow-hidden mb-2">
      <img src="https://ocaabzfiiikjcgqwhbwr.supabase.co/storage/v1/object/public/content-images/covers/how-to-pay-for-senior-care-in-texas-1774519457693.png" alt="How to pay for senior care in Texas" class="w-full aspect-[3/2] object-cover group-hover:opacity-90 transition-opacity" />
    </div>
    <p class="text-sm font-bold text-gray-900 mb-0.5">How to Pay for Senior Care in Texas in 2026</p>
    <p class="text-xs text-gray-400">10 min read</p>
  </a>
  <a href="/texas/how-to-get-paid-as-a-caregiver-in-texas" class="block no-underline group">
    <div class="rounded-xl overflow-hidden mb-2">
      <img src="https://ocaabzfiiikjcgqwhbwr.supabase.co/storage/v1/object/public/content-images/covers/how-to-get-paid-as-a-caregiver-in-texas-1774448475527.png" alt="How to get paid as a caregiver in Texas" class="w-full aspect-[3/2] object-cover group-hover:opacity-90 transition-opacity" />
    </div>
    <p class="text-sm font-bold text-gray-900 mb-0.5">How to Get Paid as a Caregiver in Texas in 2026</p>
    <p class="text-xs text-gray-400">8 min read</p>
  </a>
</div>
`;

async function main() {
  const slug = "star-plus-waiver-texas-complete-guide";

  const { data: article } = await db
    .from("content_articles")
    .select("id")
    .eq("slug", slug)
    .single();

  if (!article) {
    console.error(`Article with slug "${slug}" not found. Run seed-star-plus-article.ts first.`);
    process.exit(1);
  }

  const { error } = await db
    .from("content_articles")
    .update({
      content_html: ARTICLE_HTML.trim(),
      excerpt:
        "STAR+PLUS is the largest Medicaid waiver program in Texas, covering home care, personal assistance, and more for adults who need long-term support. This guide covers eligibility, services, how to apply, and wait times across Texas.",
      subtitle:
        "Income limits, covered services, how to apply, and where to find STAR+PLUS in Houston, Dallas, and San Antonio.",
      reading_time: "12 min read",
      tags: ["texas", "medicaid", "star-plus", "waiver", "eligibility"],
      focus_keyword: "star plus waiver texas",
      structured_data_type: "Article",
    })
    .eq("id", article.id);

  if (error) {
    console.error("Failed to update article:", error.message);
    process.exit(1);
  }

  console.log(`Updated article ${article.id} with full content HTML.`);
}

main();
