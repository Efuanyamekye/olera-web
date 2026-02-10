"use client";

import { useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CareTypeId, CARE_TYPE_CONFIG, ALL_CARE_TYPES } from "@/types/forum";

// Benefits data for each care type
interface Benefit {
  id: string;
  name: string;
  description: string;
  eligibility: string;
  coverage: string;
  icon: "medicare" | "medicaid" | "va" | "ltci" | "private" | "hsa";
  learnMoreUrl?: string;
}

const BENEFITS_BY_TYPE: Record<CareTypeId | "all", Benefit[]> = {
  "all": [
    {
      id: "medicare",
      name: "Medicare",
      description: "Federal health insurance for seniors 65+ or those with certain disabilities",
      eligibility: "Age 65+ or qualifying disability",
      coverage: "Covers skilled nursing, home health after hospital stay, hospice",
      icon: "medicare",
    },
    {
      id: "medicaid",
      name: "Medicaid",
      description: "State and federal program for low-income individuals",
      eligibility: "Income and asset limits vary by state",
      coverage: "Covers nursing home care, some home care, and assisted living in many states",
      icon: "medicaid",
    },
    {
      id: "va",
      name: "VA Benefits",
      description: "Benefits for veterans and surviving spouses",
      eligibility: "Veterans with qualifying service, surviving spouses",
      coverage: "Aid and Attendance, Housebound benefits, VA nursing homes",
      icon: "va",
    },
    {
      id: "ltci",
      name: "Long-Term Care Insurance",
      description: "Private insurance for long-term care costs",
      eligibility: "Policy holders",
      coverage: "Varies by policy - typically nursing home, assisted living, home care",
      icon: "ltci",
    },
  ],
  "home-health": [
    {
      id: "medicare-hh",
      name: "Medicare Home Health",
      description: "Medicare covers skilled nursing and therapy services at home",
      eligibility: "Homebound status, doctor's order, need for skilled care",
      coverage: "100% of approved skilled services - no copay or deductible",
      icon: "medicare",
    },
    {
      id: "medicaid-hh",
      name: "Medicaid Home Health",
      description: "State Medicaid programs cover home health services",
      eligibility: "Meet state income/asset limits",
      coverage: "Skilled nursing, therapy, personal care (varies by state)",
      icon: "medicaid",
    },
    {
      id: "va-hh",
      name: "VA Home Health Care",
      description: "VA provides home-based primary care for eligible veterans",
      eligibility: "Enrolled veterans with complex health needs",
      coverage: "Skilled nursing, therapy, homemaker services",
      icon: "va",
    },
    {
      id: "private-hh",
      name: "Private Pay",
      description: "Out-of-pocket payment for home health services",
      eligibility: "Anyone needing services",
      coverage: "Full flexibility in services and providers",
      icon: "private",
    },
  ],
  "home-care": [
    {
      id: "medicaid-hc",
      name: "Medicaid Waiver Programs",
      description: "State programs that cover personal care at home",
      eligibility: "Meet state income/asset limits, need nursing home level of care",
      coverage: "Personal care, homemaker services, respite care",
      icon: "medicaid",
    },
    {
      id: "va-hc",
      name: "VA Aid & Attendance",
      description: "Monthly pension increase for veterans needing help with daily activities",
      eligibility: "Wartime veterans or surviving spouses needing assistance",
      coverage: "Monthly payment up to $2,431 for veterans, $1,318 for survivors (2024)",
      icon: "va",
    },
    {
      id: "ltci-hc",
      name: "Long-Term Care Insurance",
      description: "Private insurance often covers home care services",
      eligibility: "Policy holders meeting elimination period",
      coverage: "Daily or monthly benefit for qualified services",
      icon: "ltci",
    },
    {
      id: "private-hc",
      name: "Private Pay",
      description: "Self-pay for home care services",
      eligibility: "Anyone needing services",
      coverage: "Avg $27-30/hour depending on location",
      icon: "private",
    },
  ],
  "assisted-living": [
    {
      id: "medicaid-al",
      name: "Medicaid Waiver Programs",
      description: "Many states cover assisted living through Medicaid waivers",
      eligibility: "Meet state income/asset limits, need assistance with ADLs",
      coverage: "Room, board, and personal care services (varies by state)",
      icon: "medicaid",
    },
    {
      id: "va-al",
      name: "VA Aid & Attendance",
      description: "Can help cover assisted living costs for veterans",
      eligibility: "Wartime veterans or surviving spouses",
      coverage: "Monthly benefit to help pay for care",
      icon: "va",
    },
    {
      id: "ltci-al",
      name: "Long-Term Care Insurance",
      description: "Most policies cover assisted living",
      eligibility: "Policy holders meeting benefit triggers",
      coverage: "Daily benefit typically $150-300/day",
      icon: "ltci",
    },
    {
      id: "private-al",
      name: "Private Pay",
      description: "Self-pay is most common for assisted living",
      eligibility: "Anyone needing services",
      coverage: "National avg $4,500/month (varies widely by location)",
      icon: "private",
    },
  ],
  "memory-care": [
    {
      id: "medicaid-mc",
      name: "Medicaid",
      description: "Covers memory care in some states through waivers",
      eligibility: "Meet state income/asset limits, qualifying diagnosis",
      coverage: "Specialized dementia care services",
      icon: "medicaid",
    },
    {
      id: "va-mc",
      name: "VA Benefits",
      description: "Aid & Attendance can help cover memory care costs",
      eligibility: "Veterans or surviving spouses with dementia diagnosis",
      coverage: "Monthly pension benefit for care needs",
      icon: "va",
    },
    {
      id: "ltci-mc",
      name: "Long-Term Care Insurance",
      description: "Most policies cover memory care as a form of assisted living",
      eligibility: "Policy holders with cognitive impairment",
      coverage: "Daily or monthly benefit amount",
      icon: "ltci",
    },
    {
      id: "private-mc",
      name: "Private Pay",
      description: "Most memory care is paid privately",
      eligibility: "Anyone needing services",
      coverage: "National avg $5,500-7,000/month",
      icon: "private",
    },
  ],
  "nursing-homes": [
    {
      id: "medicare-nh",
      name: "Medicare",
      description: "Covers short-term skilled nursing after hospital stay",
      eligibility: "3-night hospital stay, need for skilled care",
      coverage: "Days 1-20: 100% covered. Days 21-100: $200/day copay (2024)",
      icon: "medicare",
    },
    {
      id: "medicaid-nh",
      name: "Medicaid",
      description: "Primary payer for long-term nursing home care",
      eligibility: "Meet state income/asset limits (often requires spend-down)",
      coverage: "Full nursing home costs after qualifying",
      icon: "medicaid",
    },
    {
      id: "va-nh",
      name: "VA Nursing Homes",
      description: "VA operates nursing homes for eligible veterans",
      eligibility: "Veterans with service-connected disabilities or financial need",
      coverage: "Full care at VA Community Living Centers",
      icon: "va",
    },
    {
      id: "ltci-nh",
      name: "Long-Term Care Insurance",
      description: "Covers nursing home care up to policy limits",
      eligibility: "Policy holders meeting benefit triggers",
      coverage: "Daily benefit amount (typically $150-400/day)",
      icon: "ltci",
    },
  ],
  "independent-living": [
    {
      id: "private-il",
      name: "Private Pay",
      description: "Independent living is almost always private pay",
      eligibility: "Anyone meeting community requirements",
      coverage: "Monthly rent plus optional services",
      icon: "private",
    },
    {
      id: "hsa-il",
      name: "HSA/FSA Funds",
      description: "Some care-related expenses may be HSA-eligible",
      eligibility: "HSA/FSA account holders",
      coverage: "Qualifying medical expenses only",
      icon: "hsa",
    },
    {
      id: "va-il",
      name: "VA Pension",
      description: "Veterans pension can supplement living costs",
      eligibility: "Wartime veterans with limited income",
      coverage: "Monthly pension amount varies",
      icon: "va",
    },
    {
      id: "ltci-il",
      name: "Long-Term Care Insurance",
      description: "Generally does not cover independent living",
      eligibility: "Policy holders",
      coverage: "Only if care services are being provided",
      icon: "ltci",
    },
  ],
};

function BenefitIcon({ icon }: { icon: Benefit["icon"] }) {
  switch (icon) {
    case "medicare":
      return (
        <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
          <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
      );
    case "medicaid":
      return (
        <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
          <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>
      );
    case "va":
      return (
        <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center">
          <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
          </svg>
        </div>
      );
    case "ltci":
      return (
        <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
          <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
      );
    case "private":
      return (
        <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
          <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      );
    case "hsa":
      return (
        <div className="w-12 h-12 rounded-xl bg-teal-100 flex items-center justify-center">
          <svg className="w-6 h-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </div>
      );
    default:
      return null;
  }
}

// Category styling
const CATEGORY_STYLES: Record<CareTypeId | "all", { emoji: string; gradient: string }> = {
  all: { emoji: "💰", gradient: "from-gray-50 to-gray-100" },
  "home-health": { emoji: "🏥", gradient: "from-rose-50 to-rose-100" },
  "home-care": { emoji: "🏠", gradient: "from-amber-50 to-amber-100" },
  "assisted-living": { emoji: "🤝", gradient: "from-blue-50 to-blue-100" },
  "memory-care": { emoji: "🧠", gradient: "from-purple-50 to-purple-100" },
  "nursing-homes": { emoji: "🏢", gradient: "from-emerald-50 to-emerald-100" },
  "independent-living": { emoji: "☀️", gradient: "from-orange-50 to-orange-100" },
};

function BenefitsPageContent() {
  const searchParams = useSearchParams();
  const typeParam = searchParams.get("type");
  const [activeCareType, setActiveCareType] = useState<CareTypeId | "all">(
    (typeParam as CareTypeId) || "all"
  );

  const benefits = useMemo(() => {
    return BENEFITS_BY_TYPE[activeCareType] || BENEFITS_BY_TYPE["all"];
  }, [activeCareType]);

  const handleCategoryChange = (category: CareTypeId | "all") => {
    setActiveCareType(category);
  };

  const categoryStyle = CATEGORY_STYLES[activeCareType];
  const categoryLabel = activeCareType === "all" ? "Senior Care" : CARE_TYPE_CONFIG[activeCareType].label;

  return (
    <main className="min-h-screen bg-white">
      {/* Hero Header */}
      <div className={`bg-gradient-to-b ${categoryStyle.gradient} border-b border-gray-200/60`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-16">
          <header className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white shadow-sm mb-5">
              <span className="text-3xl">{categoryStyle.emoji}</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-3 tracking-tight">
              {activeCareType === "all" ? "Benefits Center" : `Paying for ${categoryLabel}`}
            </h1>
            <p className="text-lg text-gray-600 max-w-xl mx-auto">
              {activeCareType === "all"
                ? "Understand your payment options for senior care services."
                : `Explore payment options and coverage for ${categoryLabel.toLowerCase()} services.`
              }
            </p>
          </header>

          {/* Category Pills */}
          <div className="flex justify-center">
            <div className="inline-flex flex-wrap justify-center gap-2 p-1.5 bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-gray-200/60">
              <button
                onClick={() => handleCategoryChange("all")}
                className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  activeCareType === "all"
                    ? "bg-gray-900 text-white shadow-sm"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                Overview
              </button>
              {ALL_CARE_TYPES.map((careType) => (
                <button
                  key={careType}
                  onClick={() => handleCategoryChange(careType)}
                  className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    activeCareType === careType
                      ? "bg-gray-900 text-white shadow-sm"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {CARE_TYPE_CONFIG[careType].label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Benefits Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Benefits Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {benefits.map((benefit, index) => (
            <div
              key={benefit.id}
              className="group bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-xl hover:border-gray-300 transition-all duration-300 hover:-translate-y-0.5"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="flex items-start gap-4">
                <div className="transition-transform duration-300 group-hover:scale-110">
                  <BenefitIcon icon={benefit.icon} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold text-gray-900 mb-1.5 group-hover:text-primary-600 transition-colors">
                    {benefit.name}
                  </h3>
                  <p className="text-gray-600 text-sm leading-relaxed mb-4">
                    {benefit.description}
                  </p>
                  <div className="space-y-3 pt-4 border-t border-gray-100">
                    <div className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <svg className="w-3 h-3 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-0.5">
                          Eligibility
                        </span>
                        <span className="text-sm text-gray-700">
                          {benefit.eligibility}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <svg className="w-3 h-3 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-0.5">
                          Coverage
                        </span>
                        <span className="text-sm text-gray-700">
                          {benefit.coverage}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Contextual CTA Section */}
        <div className="mt-16">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-600 via-primary-600 to-primary-700 p-8 md:p-12">
            {/* Background pattern */}
            <div className="absolute inset-0 opacity-10">
              <svg className="absolute right-0 top-0 w-96 h-96 -mr-20 -mt-20" viewBox="0 0 200 200" fill="none">
                <circle cx="100" cy="100" r="80" stroke="white" strokeWidth="40"/>
              </svg>
              <svg className="absolute left-0 bottom-0 w-64 h-64 -ml-20 -mb-20" viewBox="0 0 200 200" fill="none">
                <circle cx="100" cy="100" r="60" stroke="white" strokeWidth="30"/>
              </svg>
            </div>

            <div className="relative flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="text-center md:text-left">
                <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">
                  {activeCareType === "all"
                    ? "Ready to explore your care options?"
                    : `Find ${categoryLabel} providers near you`
                  }
                </h2>
                <p className="text-primary-100 text-lg max-w-xl">
                  {activeCareType === "all"
                    ? "Browse verified providers and compare options that accept your coverage."
                    : `Connect with quality ${categoryLabel.toLowerCase()} providers that work with your payment method.`
                  }
                </p>
              </div>
              <Link
                href={activeCareType === "all" ? "/browse" : `/browse?type=${activeCareType}`}
                className="inline-flex items-center gap-2 px-8 py-4 bg-white text-primary-600 font-semibold rounded-full hover:bg-primary-50 transition-colors shadow-lg shadow-primary-900/20 flex-shrink-0"
              >
                Find Providers
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
            </div>
          </div>
        </div>

        {/* Quick Links */}
        <div className="mt-12 pt-12 border-t border-gray-200">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 text-center">
            Related Resources
          </h3>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/resources"
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-full hover:bg-gray-200 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              Care Guides
            </Link>
            <Link
              href="/community"
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-full hover:bg-gray-200 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
              </svg>
              Community Forum
            </Link>
            <Link
              href="/browse"
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-full hover:bg-gray-200 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Browse Providers
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

function LoadingSkeleton() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-12">
          <div className="h-12 w-72 bg-gray-200 rounded-lg mx-auto mb-4 animate-pulse" />
          <div className="h-5 w-96 bg-gray-200 rounded mx-auto animate-pulse" />
        </div>
        <div className="flex gap-2 justify-center mb-12">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-10 w-24 bg-gray-200 rounded-full animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-2xl p-6 animate-pulse">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-gray-200 rounded-xl" />
                <div className="flex-1">
                  <div className="h-5 w-32 bg-gray-200 rounded mb-2" />
                  <div className="h-4 w-full bg-gray-200 rounded mb-4" />
                  <div className="h-3 w-48 bg-gray-200 rounded mb-2" />
                  <div className="h-3 w-56 bg-gray-200 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

export default function BenefitsPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <BenefitsPageContent />
    </Suspense>
  );
}
