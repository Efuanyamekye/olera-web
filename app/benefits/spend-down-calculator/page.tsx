"use client";

import { useState, useMemo, useRef, useEffect, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

// ── State Medicaid asset & income limits (2024/2025 approximations) ──────────

interface StateLimits {
  assetLimit: number;
  monthlyIncomeLimit: number;
  nursingHomeMonthlyCost: number;
  label: string;
}

const STATE_LIMITS: Record<string, StateLimits> = {
  AL: { assetLimit: 2000, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 7300, label: "Alabama" },
  AK: { assetLimit: 2000, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 16200, label: "Alaska" },
  AZ: { assetLimit: 2000, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 7900, label: "Arizona" },
  AR: { assetLimit: 2000, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 6400, label: "Arkansas" },
  CA: { assetLimit: 130000, monthlyIncomeLimit: 1732, nursingHomeMonthlyCost: 11500, label: "California" },
  CO: { assetLimit: 2000, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 9200, label: "Colorado" },
  CT: { assetLimit: 1600, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 14400, label: "Connecticut" },
  DE: { assetLimit: 2000, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 10600, label: "Delaware" },
  FL: { assetLimit: 2000, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 9100, label: "Florida" },
  GA: { assetLimit: 2000, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 7400, label: "Georgia" },
  HI: { assetLimit: 2000, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 13200, label: "Hawaii" },
  ID: { assetLimit: 2000, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 8200, label: "Idaho" },
  IL: { assetLimit: 2000, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 7300, label: "Illinois" },
  IN: { assetLimit: 2000, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 7700, label: "Indiana" },
  IA: { assetLimit: 2000, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 7000, label: "Iowa" },
  KS: { assetLimit: 2000, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 6700, label: "Kansas" },
  KY: { assetLimit: 2000, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 7500, label: "Kentucky" },
  LA: { assetLimit: 2000, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 6200, label: "Louisiana" },
  ME: { assetLimit: 10000, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 11300, label: "Maine" },
  MD: { assetLimit: 2000, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 10700, label: "Maryland" },
  MA: { assetLimit: 2000, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 13500, label: "Massachusetts" },
  MI: { assetLimit: 2000, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 8800, label: "Michigan" },
  MN: { assetLimit: 3000, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 10400, label: "Minnesota" },
  MS: { assetLimit: 2000, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 7100, label: "Mississippi" },
  MO: { assetLimit: 2000, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 5800, label: "Missouri" },
  MT: { assetLimit: 2000, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 8000, label: "Montana" },
  NE: { assetLimit: 4000, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 7800, label: "Nebraska" },
  NV: { assetLimit: 2000, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 8600, label: "Nevada" },
  NH: { assetLimit: 2500, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 12100, label: "New Hampshire" },
  NJ: { assetLimit: 2000, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 11800, label: "New Jersey" },
  NM: { assetLimit: 2000, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 8100, label: "New Mexico" },
  NY: { assetLimit: 31175, monthlyIncomeLimit: 1732, nursingHomeMonthlyCost: 13900, label: "New York" },
  NC: { assetLimit: 2000, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 8000, label: "North Carolina" },
  ND: { assetLimit: 3000, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 9500, label: "North Dakota" },
  OH: { assetLimit: 2000, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 7800, label: "Ohio" },
  OK: { assetLimit: 2000, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 6300, label: "Oklahoma" },
  OR: { assetLimit: 2000, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 10300, label: "Oregon" },
  PA: { assetLimit: 2000, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 10200, label: "Pennsylvania" },
  RI: { assetLimit: 4000, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 10600, label: "Rhode Island" },
  SC: { assetLimit: 2000, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 7400, label: "South Carolina" },
  SD: { assetLimit: 2000, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 7600, label: "South Dakota" },
  TN: { assetLimit: 2000, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 7300, label: "Tennessee" },
  TX: { assetLimit: 2000, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 6600, label: "Texas" },
  UT: { assetLimit: 2000, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 7500, label: "Utah" },
  VT: { assetLimit: 2000, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 11000, label: "Vermont" },
  VA: { assetLimit: 2000, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 8400, label: "Virginia" },
  WA: { assetLimit: 2000, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 10800, label: "Washington" },
  DC: { assetLimit: 4000, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 11500, label: "Washington D.C." },
  WV: { assetLimit: 2000, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 7900, label: "West Virginia" },
  WI: { assetLimit: 2000, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 9100, label: "Wisconsin" },
  WY: { assetLimit: 2000, monthlyIncomeLimit: 2901, nursingHomeMonthlyCost: 8300, label: "Wyoming" },
};

// ── Care cost data (national averages, 2024) ────────────────────────────────

interface CareCost {
  label: string;
  monthlyAvg: number;
  monthlyLow: number;
  monthlyHigh: number;
  description: string;
}

const CARE_COSTS: Record<string, CareCost> = {
  nursingHome: {
    label: "Nursing Home",
    monthlyAvg: 8500,
    monthlyLow: 6500,
    monthlyHigh: 12000,
    description: "Semi-private room, 24/7 skilled nursing",
  },
  assistedLiving: {
    label: "Assisted Living",
    monthlyAvg: 5350,
    monthlyLow: 3500,
    monthlyHigh: 7500,
    description: "Private apartment with personal care services",
  },
  homeCare: {
    label: "Home Care (40 hrs/wk)",
    monthlyAvg: 5720,
    monthlyLow: 3000,
    monthlyHigh: 8500,
    description: "Home health aide, 40 hours per week",
  },
};

type CareType = "nursingHome" | "assistedLiving" | "homeCare";
type ResultTab = "careCosts" | "savingsDuration" | "spendDown";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtCurrency(n: number): string {
  return `$${fmt(n)}`;
}

// ── Legal strategies data ────────────────────────────────────────────────────

const LEGAL_STRATEGIES = [
  {
    title: "Prepay Funeral & Burial Expenses",
    description: "Irrevocable funeral trusts and prepaid burial plans are exempt from Medicaid asset counts in most states.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: "Pay Off Debts & Mortgage",
    description: "Paying down mortgage, car loans, or credit card debt reduces countable assets while preserving value.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
      </svg>
    ),
  },
  {
    title: "Home Modifications",
    description: "Making the primary residence accessible (ramps, grab bars, bathroom modifications) is a legitimate expense.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17l-5.378 5.378a1.002 1.002 0 01-1.414-1.414l5.378-5.378m0 0L6.75 10.5l4.5-4.5 3.256 3.256m-2.086 2.086l2.086-2.086m0 0L18 6.75l-1.5-1.5-4.5 4.5" />
      </svg>
    ),
  },
  {
    title: "Purchase Exempt Assets",
    description: "A primary home (within equity limits), one vehicle, personal belongings, and household goods are typically exempt.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
      </svg>
    ),
  },
  {
    title: "Spousal Protections (CSRA)",
    description: "The community spouse can keep assets up to the Community Spouse Resource Allowance — typically up to $154,140.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
      </svg>
    ),
  },
  {
    title: "Medicaid-Compliant Annuity",
    description: "Convert countable assets into an income stream that names the state as remainder beneficiary.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
      </svg>
    ),
  },
  {
    title: "Caregiver Agreement",
    description: "Pay a family member for caregiving services under a formal written agreement at fair market rates.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
  },
  {
    title: "Consult an Elder Law Attorney",
    description: "Medicaid planning has a 5-year look-back period. Professional guidance ensures compliance and maximizes protections.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" />
      </svg>
    ),
  },
];

// Tab icons for the result tabs
const TAB_ICONS: Record<ResultTab, ReactNode> = {
  careCosts: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  savingsDuration: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  spendDown: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h14.25M3 9h9.75M3 13.5h5.25m5.25-.75L17.25 9m0 0L21 12.75M17.25 9v12" />
    </svg>
  ),
};

// ── Slug ↔ code helpers ──────────────────────────────────────────────────────

export function stateCodeToSlug(code: string): string {
  const limits = STATE_LIMITS[code];
  if (!limits) return code.toLowerCase();
  return limits.label.toLowerCase().replace(/\s+/g, "-").replace(/\./g, "");
}

export function stateSlugToCode(slug: string): string | null {
  const normalized = slug.toLowerCase().replace(/-/g, " ").replace(/\./g, "");
  const entry = Object.entries(STATE_LIMITS).find(
    ([, v]) => v.label.toLowerCase().replace(/\./g, "") === normalized
  );
  return entry ? entry[0] : null;
}

export { STATE_LIMITS };

// ── Main Page Component ──────────────────────────────────────────────────────

interface SpendDownCalculatorProps {
  initialStateCode?: string;
}

export default function SpendDownCalculatorPage({ initialStateCode }: SpendDownCalculatorProps = {}) {
  const searchParams = useSearchParams();
  const urlState = initialStateCode || searchParams.get("state")?.toUpperCase() || "";
  // Restore saved form data from localStorage
  const savedForm = useMemo(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem("spendDownForm");
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [state, setState] = useState(urlState && STATE_LIMITS[urlState] ? urlState : savedForm?.state || "");
  const [totalAssets, setTotalAssets] = useState(savedForm?.totalAssets || "");
  const [monthlyIncome, setMonthlyIncome] = useState(savedForm?.monthlyIncome || "");
  const [careType, setCareType] = useState<CareType>(savedForm?.careType || "nursingHome");
  const [hasSpouse, setHasSpouse] = useState(savedForm?.hasSpouse || false);
  const [calculated, setCalculated] = useState(false);
  const [resultTab, setResultTab] = useState<ResultTab>("careCosts");
  const [saved, setSaved] = useState(false);

  // Persist form data to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem("spendDownForm", JSON.stringify({ state, totalAssets, monthlyIncome, careType, hasSpouse }));
    } catch { /* ignore */ }
  }, [state, totalAssets, monthlyIncome, careType, hasSpouse]);

  const calculatorRef = useRef<HTMLDivElement>(null);
  const stateLimits = state ? STATE_LIMITS[state] : null;

  const results = useMemo(() => {
    if (!calculated || !stateLimits) return null;

    const assets = parseFloat(totalAssets.replace(/,/g, "")) || 0;
    const income = parseFloat(monthlyIncome.replace(/,/g, "")) || 0;
    const assetLimit = hasSpouse ? stateLimits.assetLimit * 1.5 : stateLimits.assetLimit;
    const incomeLimit = hasSpouse
      ? stateLimits.monthlyIncomeLimit * 1.5
      : stateLimits.monthlyIncomeLimit;

    const excessAssets = Math.max(0, assets - assetLimit);
    const excessIncome = Math.max(0, income - incomeLimit);

    const care = CARE_COSTS[careType];
    const monthlyCost = care.monthlyAvg;

    const monthsSavingsLast = income > 0
      ? Math.max(0, Math.floor(assets / Math.max(1, monthlyCost - income)))
      : assets > 0
        ? Math.floor(assets / monthlyCost)
        : 0;

    const monthlySpendDown = excessIncome;

    const netMonthlyCostAfterIncome = Math.max(0, monthlyCost - income);
    const monthsToAssetLimit = netMonthlyCostAfterIncome > 0
      ? Math.max(0, Math.ceil(excessAssets / netMonthlyCostAfterIncome))
      : excessAssets > 0 ? Infinity : 0;

    return {
      assets,
      income,
      assetLimit,
      incomeLimit,
      excessAssets,
      excessIncome,
      monthlyCost,
      monthsSavingsLast,
      monthlySpendDown,
      monthsToAssetLimit,
      qualifiesDirectly: excessAssets <= 0 && excessIncome <= 0,
      careLabel: care.label,
    };
  }, [calculated, stateLimits, totalAssets, monthlyIncome, careType, hasSpouse]);

  const resultsRef = useRef<HTMLDivElement>(null);

  function handleCalculate() {
    if (!state || !totalAssets || !monthlyIncome) return;
    setCalculated(true);
    setResultTab("careCosts");
    setSaved(false);
    // On mobile, scroll to results
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }

  // Auto-calculate if form was restored with all fields filled
  useEffect(() => {
    if (savedForm && state && totalAssets && monthlyIncome && !calculated) {
      setCalculated(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSaveToPackage() {
    setSaved(true);
  }

  function scrollToCalculator() {
    calculatorRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  const RESULT_TABS: { key: ResultTab; label: string }[] = [
    { key: "careCosts", label: "Care Costs" },
    { key: "savingsDuration", label: "Savings Duration" },
    { key: "spendDown", label: "Spend-Down" },
  ];

  // Dynamic stat for asset limit based on selected state
  const displayAssetLimit = stateLimits ? fmtCurrency(stateLimits.assetLimit) : "$2,000";

  return (
    <div className="min-h-screen bg-vanilla-100">
      {/* ── Hero Banner ──────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary-800 via-primary-700 to-primary-600">
        {/* Soft warm overlay */}
        <div className="absolute inset-0">
          <div className="absolute top-10 left-10 w-64 h-64 bg-vanilla-300/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-20 w-96 h-96 bg-primary-300/10 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-12 text-center">
          {/* Back link — only shown if user came from benefits finder */}
          {urlState && (
            <Link
              href="/benefits/finder"
              className="inline-flex items-center gap-1.5 text-sm text-white/70 hover:text-white no-underline mb-5 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Back to your benefits package
            </Link>
          )}

          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight text-white mb-2">
            Medicaid Spend-Down Calculator
          </h1>
          {stateLimits && (
            <h2 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-normal text-white/70 mb-3">
              {stateLimits.label} 2026
            </h2>
          )}
          <p className="text-text-md text-white/80 max-w-xl mx-auto leading-relaxed">
            Find out if you qualify for Medicaid in {stateLimits ? stateLimits.label : "your state"},
            how much you need to spend down, and the legal strategies to get there faster.
          </p>
        </div>
      </div>

      {/* ── Stats Bar ────────────────────────────────────────────────────── */}
      <div className="border-b border-vanilla-300 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-3 gap-5">
            <div className="bg-primary-50 border border-primary-200 rounded-xl p-5 text-center">
              <p className="text-display-xs md:text-display-sm font-bold text-gray-900">{displayAssetLimit}</p>
              <p className="text-xs text-gray-500 mt-1">{stateLimits ? `${stateLimits.label} Medicaid Asset Limit 2026` : "Medicaid Asset Limit 2026"}</p>
            </div>
            <div className="bg-primary-50 border border-primary-200 rounded-xl p-5 text-center">
              <p className="text-display-xs md:text-display-sm font-bold text-gray-900">{stateLimits ? fmtCurrency(stateLimits.nursingHomeMonthlyCost) : "$8,500"}</p>
              <p className="text-xs text-gray-500 mt-1">{stateLimits ? `${stateLimits.label} Avg. Monthly Nursing Home Cost` : "Avg. Monthly Nursing Home Cost"}</p>
            </div>
            <div className="bg-primary-50 border border-primary-200 rounded-xl p-5 text-center">
              <p className="text-display-xs md:text-display-sm font-bold text-gray-900">5 Years</p>
              <p className="text-xs text-gray-500 mt-1">Medicaid Look-Back Period</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Calculator Section ────────────────────────────────────────────── */}
      <div ref={calculatorRef} className="bg-vanilla-50 border-b border-vanilla-300">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
          {/* Section heading */}
          <div className="text-center mb-10">
            <div className="flex items-center justify-center gap-3 mb-2">
              <svg className="w-7 h-7 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V13.5zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V18zm2.498-6.75h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V13.5zm0 2.25h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V18zm2.504-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zm0 2.25h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V18zm2.498-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zM8.25 6h7.5v2.25h-7.5V6zM5.25 6.75a2.25 2.25 0 012.25-2.25h9a2.25 2.25 0 012.25 2.25v10.5a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25V6.75z" />
              </svg>
              <h2 className="font-serif text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900">
                Medicaid Eligibility Calculator
              </h2>
            </div>
            <p className="text-sm text-gray-500">
              Care Costs, Savings &amp; Spend-Down
            </p>
          </div>

          {/* Two-column layout */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
            {/* ── Left: Form ──────────────────────────────────────────── */}
            <div className="lg:col-span-2">
              <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs">
                <div className="flex items-center gap-2 mb-6">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V13.5zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V18zm2.498-6.75h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V13.5zm0 2.25h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V18zm2.504-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zM8.25 6h7.5v2.25h-7.5V6zM12 2.25c-1.892 0-3.758.11-5.593.322C5.307 2.7 4.5 3.65 4.5 4.757V19.5a2.25 2.25 0 002.25 2.25h10.5a2.25 2.25 0 002.25-2.25V4.757c0-1.108-.806-2.057-1.907-2.185A48.507 48.507 0 0012 2.25z" />
                  </svg>
                  <h3 className="font-semibold text-gray-900">Your Information</h3>
                </div>

                <div className="space-y-5">
                  {/* State */}
                  <div>
                    <label htmlFor="state" className="block text-sm font-medium text-gray-700 mb-1.5">State</label>
                    <select
                      id="state"
                      value={state}
                      onChange={(e) => { setState(e.target.value); setCalculated(false); }}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:ring-2 focus:ring-primary-200 focus:border-primary-400 outline-none transition-shadow"
                    >
                      <option value="">Select your state</option>
                      {Object.entries(STATE_LIMITS)
                        .sort((a, b) => a[1].label.localeCompare(b[1].label))
                        .map(([code, { label }]) => (
                          <option key={code} value={code}>{label}</option>
                        ))}
                    </select>
                  </div>

                  {/* Total Countable Assets */}
                  <div>
                    <label htmlFor="assets" className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
                      Total Countable Assets
                      <span className="relative group">
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 text-gray-500 text-[10px] font-bold cursor-help">?</span>
                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 pointer-events-none leading-relaxed">
                          Countable assets include bank accounts, investments, stocks, bonds, and cash. It does <span className="font-semibold">not</span> include your primary home, one car, personal belongings, or prepaid funeral plans.
                          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                        </span>
                      </span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                      <input
                        id="assets"
                        type="text"
                        inputMode="numeric"
                        placeholder="150,000"
                        value={totalAssets}
                        onChange={(e) => { setTotalAssets(e.target.value.replace(/[^0-9,]/g, "")); setCalculated(false); }}
                        className="w-full pl-7 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-primary-200 focus:border-primary-400 outline-none transition-shadow"
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Savings, investments, non-exempt property. Exclude primary home &amp; one vehicle.</p>
                  </div>

                  {/* Monthly Income */}
                  <div>
                    <label htmlFor="income" className="block text-sm font-medium text-gray-700 mb-1.5">Monthly Income</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                      <input
                        id="income"
                        type="text"
                        inputMode="numeric"
                        placeholder="2,400"
                        value={monthlyIncome}
                        onChange={(e) => { setMonthlyIncome(e.target.value.replace(/[^0-9,]/g, "")); setCalculated(false); }}
                        className="w-full pl-7 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-primary-200 focus:border-primary-400 outline-none transition-shadow"
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Social Security, pension, retirement income.</p>
                  </div>

                  {/* Type of Care */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Type of Care</label>
                    <div className="grid grid-cols-1 gap-2">
                      {(Object.entries(CARE_COSTS) as [CareType, CareCost][]).map(([key, cost]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => { setCareType(key); setCalculated(false); }}
                          className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                            careType === key
                              ? "border-primary-400 bg-primary-25 ring-1 ring-primary-200"
                              : "border-gray-200 bg-white hover:border-gray-300"
                          }`}
                        >
                          <span className={`text-sm font-medium ${careType === key ? "text-primary-700" : "text-gray-900"}`}>
                            {cost.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Spouse toggle */}
                  <div className="flex items-center gap-3 py-1">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={hasSpouse}
                      onClick={() => { setHasSpouse(!hasSpouse); setCalculated(false); }}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                        hasSpouse ? "bg-primary-500" : "bg-gray-200"
                      }`}
                    >
                      <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                        hasSpouse ? "translate-x-4" : "translate-x-0"
                      }`} />
                    </button>
                    <label className="text-sm text-gray-700">Spouse staying at home</label>
                  </div>

                  {/* Calculate */}
                  <button
                    type="button"
                    onClick={handleCalculate}
                    disabled={!state || !totalAssets || !monthlyIncome}
                    className="w-full py-3 px-4 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-700 disabled:bg-primary-400 disabled:text-white/80 disabled:cursor-default transition-colors cursor-pointer"
                  >
                    Calculate
                  </button>
                </div>
              </div>
            </div>

            {/* ── Right: Results ──────────────────────────────────────── */}
            <div ref={resultsRef} className="lg:col-span-3">
              <div className="bg-primary-25 border border-primary-100 rounded-2xl shadow-xs overflow-hidden min-h-[500px]">
                {/* Tab bar — always visible */}
                <div className="flex border-b border-primary-100 bg-primary-25 rounded-t-2xl">
                  {RESULT_TABS.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => calculated && setResultTab(tab.key)}
                      className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors cursor-pointer border-b-2 -mb-px ${
                        resultTab === tab.key && calculated
                          ? "text-primary-700 border-primary-500 bg-white"
                          : "text-gray-400 border-transparent hover:text-gray-500"
                      } ${!calculated ? "cursor-default" : ""}`}
                    >
                      {TAB_ICONS[tab.key]}
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Content area */}
                <div className="p-6">
                  {!calculated || !results ? (
                    /* Pre-calculate empty state */
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <h3 className="font-semibold text-gray-900 text-lg mb-4">How much will care cost?</h3>
                      <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                        <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <p className="text-sm text-gray-400 max-w-xs">
                        Fill in your information and click <span className="font-semibold text-gray-600">Calculate</span> to see personalized results.
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Qualification banner */}
                      {results.qualifiesDirectly && (
                        <div className="bg-success-50 border border-success-200 rounded-xl p-4 flex items-start gap-3 mb-6">
                          <svg className="w-5 h-5 text-success-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <div>
                            <p className="text-sm font-semibold text-success-800">You may already qualify!</p>
                            <p className="text-xs text-success-700 mt-0.5">Your income and assets appear to be within {stateLimits?.label}&apos;s Medicaid limits.</p>
                          </div>
                        </div>
                      )}

                      {/* ── Care Costs Tab ────────────────────────────── */}
                      {resultTab === "careCosts" && (
                        <div>
                          <h3 className="font-semibold text-gray-900 mb-1">Care Cost Comparison</h3>
                          <p className="text-xs text-gray-400 mb-6">National averages, actual costs vary by location</p>

                          <div className="space-y-3">
                            {(Object.entries(CARE_COSTS) as [CareType, CareCost][]).map(([key, cost]) => {
                              const maxCost = 12000;
                              const lowPct = Math.round((cost.monthlyLow / maxCost) * 100);
                              const highPct = Math.round((cost.monthlyHigh / maxCost) * 100);
                              const avgPct = Math.round((cost.monthlyAvg / maxCost) * 100);
                              return (
                                <div
                                  key={key}
                                  className="p-4 rounded-xl border border-primary-100 bg-white"
                                >
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-sm font-semibold text-gray-900">{cost.label}</span>
                                    <span className="text-sm font-bold text-primary-700">{fmtCurrency(cost.monthlyAvg)}/mo</span>
                                  </div>
                                  <p className="text-xs text-gray-400 mb-3">{cost.description}</p>
                                  {/* Range bar */}
                                  <div className="relative w-full h-2 bg-gray-100 rounded-full">
                                    {/* Range fill (low to high) */}
                                    <div
                                      className="absolute top-0 h-2 bg-primary-200 rounded-full"
                                      style={{ left: `${lowPct}%`, width: `${highPct - lowPct}%` }}
                                    />
                                    {/* Average marker */}
                                    <div
                                      className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-primary-600 rounded-full border-2 border-white shadow-sm"
                                      style={{ left: `${avgPct}%`, marginLeft: "-6px" }}
                                    />
                                  </div>
                                  <div className="flex items-center justify-between mt-1.5">
                                    <span className="text-[11px] text-gray-400">Low: {fmtCurrency(cost.monthlyLow)}</span>
                                    <span className="text-[11px] text-primary-600 font-medium">Avg: {fmtCurrency(cost.monthlyAvg)}</span>
                                    <span className="text-[11px] text-gray-400">High: {fmtCurrency(cost.monthlyHigh)}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          <div className="mt-6 p-4 bg-primary-50 border border-primary-200 rounded-xl">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-primary-800 font-medium">Your selection: {CARE_COSTS[careType].label}</span>
                              <span className="text-lg font-bold text-primary-900">{fmtCurrency(CARE_COSTS[careType].monthlyAvg * 12)}/yr</span>
                            </div>
                          </div>

                          {/* Care providers in your state */}
                          {stateLimits && (
                            <div className="mt-8 p-5 bg-primary-50 border border-primary-200 rounded-2xl">
                              <h4 className="text-base font-bold text-gray-900 mb-1 flex items-center gap-2">
                                <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
                                Find {stateLimits.label} Care Providers
                              </h4>
                              <p className="text-xs text-gray-500 mb-4">Compare providers near you on Olera</p>
                              <div className="grid grid-cols-2 gap-3">
                                {[
                                  { slug: "nursing-home", label: "Nursing Homes", icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3H21m-3.75 3H21" /></svg> },
                                  { slug: "assisted-living", label: "Assisted Living", icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 21v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21m0 0h4.5V3.545M12.75 21h7.5V10.75M2.25 21h1.5m18 0h-18M2.25 9l4.5-1.636M18.75 3l-1.5.545m0 6.205l3 1m1.5.5l-1.5-.5M6.75 7.364V3h-3v18m3-13.636l10.5-3.819" /></svg> },
                                  { slug: "home-care", label: "Home Care", icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg> },
                                  { slug: "memory-care", label: "Memory Care", icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" /></svg> },
                                ].map((care) => (
                                  <Link
                                    key={care.slug}
                                    href={`/${care.slug}/${stateLimits.label.toLowerCase().replace(/\s+/g, "-").replace(/\.+/g, "")}`}
                                    className="flex items-center gap-3 p-3.5 rounded-xl bg-white border border-primary-100 shadow-sm hover:shadow-md hover:border-primary-300 hover:-translate-y-0.5 transition-all no-underline group cursor-pointer"
                                  >
                                    <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary-100 text-primary-700 group-hover:bg-primary-600 group-hover:text-white transition-colors shrink-0">
                                      {care.icon}
                                    </span>
                                    <div className="flex-1">
                                      <span className="text-sm font-semibold text-gray-900 block">{care.label}</span>
                                      <span className="text-[11px] text-primary-600 font-medium">Browse in {stateLimits.label} →</span>
                                    </div>
                                  </Link>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* ── Savings Duration Tab ─────────────────────── */}
                      {resultTab === "savingsDuration" && (
                        <div>
                          <h3 className="font-semibold text-gray-900 mb-1">How Long Your Savings May Last</h3>
                          <p className="text-xs text-gray-400 mb-6">
                            Based on {results.careLabel} costs ({fmtCurrency(results.monthlyCost)}/mo) minus your income ({fmtCurrency(results.income)}/mo)
                          </p>

                          <div className="mb-6">
                            <div className="flex items-end justify-between mb-2">
                              <span className="text-sm text-gray-600">Starting assets</span>
                              <span className="text-lg font-bold text-gray-900">{fmtCurrency(results.assets)}</span>
                            </div>

                            <div className="relative">
                              <div className="w-full bg-gray-100 rounded-full h-6 overflow-hidden">
                                {results.monthsSavingsLast > 0 && results.monthsSavingsLast < Infinity ? (
                                  <div
                                    className="h-6 rounded-full bg-gradient-to-r from-success-400 via-warning-400 to-error-400 transition-all"
                                    style={{ width: `${Math.min(100, (results.monthsSavingsLast / Math.max(results.monthsSavingsLast, 60)) * 100)}%` }}
                                  />
                                ) : results.monthsSavingsLast === 0 ? (
                                  <div className="h-6 rounded-full bg-error-300" style={{ width: "3%" }} />
                                ) : (
                                  <div className="h-6 rounded-full bg-success-400" style={{ width: "100%" }} />
                                )}
                              </div>
                              <div className="flex items-center justify-between mt-2">
                                <span className="text-xs text-gray-400">Now</span>
                                <span className="text-xs font-semibold text-gray-600">
                                  {results.monthsSavingsLast === Infinity
                                    ? "Income covers costs"
                                    : results.monthsSavingsLast === 0
                                      ? "Depleted"
                                      : `~${results.monthsSavingsLast} months`}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3 mb-6">
                            <div className="p-4 bg-gray-50 rounded-xl">
                              <p className="text-xs text-gray-400 mb-1">Monthly care cost</p>
                              <p className="text-lg font-bold text-gray-900">{fmtCurrency(results.monthlyCost)}</p>
                            </div>
                            <div className="p-4 bg-gray-50 rounded-xl">
                              <p className="text-xs text-gray-400 mb-1">Your monthly income</p>
                              <p className="text-lg font-bold text-gray-900">{fmtCurrency(results.income)}</p>
                            </div>
                            <div className="p-4 bg-gray-50 rounded-xl">
                              <p className="text-xs text-gray-400 mb-1">Monthly gap</p>
                              <p className="text-lg font-bold text-error-600">
                                {results.monthlyCost > results.income
                                  ? `-${fmtCurrency(results.monthlyCost - results.income)}`
                                  : fmtCurrency(0)}
                              </p>
                            </div>
                            <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                              <p className="text-xs text-amber-700 mb-1">Savings last</p>
                              <p className="text-lg font-bold text-amber-900">
                                {results.monthsSavingsLast === Infinity
                                  ? "N/A"
                                  : results.monthsSavingsLast === 0
                                    ? "0 months"
                                    : `~${results.monthsSavingsLast} mo`}
                              </p>
                              {results.monthsSavingsLast > 0 && results.monthsSavingsLast < Infinity && (
                                <p className="text-xs text-amber-600">
                                  ~{Math.round(results.monthsSavingsLast / 12 * 10) / 10} years
                                </p>
                              )}
                            </div>
                          </div>

                          <p className="text-xs text-gray-400 leading-relaxed">
                            Simplified estimate. Actual duration depends on investment returns, inflation, and care changes.
                          </p>

                          {/* Conditional CTA */}
                          {results.monthsSavingsLast > 0 && results.monthsSavingsLast < Infinity && (() => {
                            const runOutDate = new Date();
                            runOutDate.setMonth(runOutDate.getMonth() + results.monthsSavingsLast);
                            const runOutLabel = runOutDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

                            return urlState ? (
                              <div className="mt-6 p-5 bg-primary-50 border border-primary-200 rounded-2xl">
                                <p className="text-sm text-gray-800 leading-relaxed mb-4">
                                  At this rate your savings run out by <span className="font-bold text-gray-900">{runOutLabel}</span>. Based on your profile, you may qualify for Medicaid to cover your care costs. View your matched programs.
                                </p>
                                <Link
                                  href="/benefits/finder"
                                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-700 text-white text-sm font-semibold rounded-full hover:bg-primary-800 transition-colors no-underline"
                                >
                                  View your matched programs
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                                </Link>
                              </div>
                            ) : (
                              <div className="mt-6 p-5 bg-primary-50 border border-primary-200 rounded-2xl">
                                <p className="text-sm text-gray-800 leading-relaxed mb-4">
                                  At this rate your savings run out by <span className="font-bold text-gray-900">{runOutLabel}</span>. Medicaid could cover your care costs after that. Check if you qualify now.
                                </p>
                                <Link
                                  href="/benefits/finder"
                                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-700 text-white text-sm font-semibold rounded-full hover:bg-primary-800 transition-colors no-underline"
                                >
                                  Check if you qualify
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                                </Link>
                              </div>
                            );
                          })()}
                        </div>
                      )}

                      {/* ── Spend-Down Tab ────────────────────────────── */}
                      {resultTab === "spendDown" && (
                        <div>
                          <h3 className="font-semibold text-gray-900 mb-1">Your Spend-Down Summary</h3>
                          <p className="text-xs text-gray-400 mb-6">Based on {stateLimits?.label} Medicaid limits</p>

                          <div className="space-y-4 mb-6">
                            {/* Asset comparison */}
                            <div className="p-4 rounded-xl border border-gray-200">
                              <div className="flex items-center justify-between mb-3">
                                <span className="text-sm font-medium text-gray-700">Countable Assets</span>
                                {results.excessAssets > 0 ? (
                                  <span className="text-xs font-semibold text-error-600 bg-error-50 px-2 py-0.5 rounded-full">Over limit</span>
                                ) : (
                                  <span className="text-xs font-semibold text-success-600 bg-success-50 px-2 py-0.5 rounded-full">Within limit</span>
                                )}
                              </div>
                              <div className="grid grid-cols-3 gap-3 text-center">
                                <div>
                                  <p className="text-xs text-gray-400">Yours</p>
                                  <p className="text-sm font-bold text-gray-900">{fmtCurrency(results.assets)}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-400">Limit</p>
                                  <p className="text-sm font-bold text-gray-900">{fmtCurrency(results.assetLimit)}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-400">Excess</p>
                                  <p className={`text-sm font-bold ${results.excessAssets > 0 ? "text-error-600" : "text-success-600"}`}>
                                    {results.excessAssets > 0 ? fmtCurrency(results.excessAssets) : "$0"}
                                  </p>
                                </div>
                              </div>
                            </div>

                            {/* Income comparison */}
                            <div className="p-4 rounded-xl border border-gray-200">
                              <div className="flex items-center justify-between mb-3">
                                <span className="text-sm font-medium text-gray-700">Monthly Income</span>
                                {results.excessIncome > 0 ? (
                                  <span className="text-xs font-semibold text-error-600 bg-error-50 px-2 py-0.5 rounded-full">Over limit</span>
                                ) : (
                                  <span className="text-xs font-semibold text-success-600 bg-success-50 px-2 py-0.5 rounded-full">Within limit</span>
                                )}
                              </div>
                              <div className="grid grid-cols-3 gap-3 text-center">
                                <div>
                                  <p className="text-xs text-gray-400">Yours</p>
                                  <p className="text-sm font-bold text-gray-900">{fmtCurrency(results.income)}/mo</p>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-400">Limit</p>
                                  <p className="text-sm font-bold text-gray-900">{fmtCurrency(results.incomeLimit)}/mo</p>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-400">Excess</p>
                                  <p className={`text-sm font-bold ${results.excessIncome > 0 ? "text-error-600" : "text-success-600"}`}>
                                    {results.excessIncome > 0 ? `${fmtCurrency(results.excessIncome)}/mo` : "$0"}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Spend-down path */}
                          {(results.excessAssets > 0 || results.excessIncome > 0) && (
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
                              <h4 className="text-sm font-bold text-amber-900 mb-3 flex items-center gap-2">
                                <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Your Spend-Down Path
                              </h4>
                              {results.excessAssets > 0 && (
                                <div className="mb-3">
                                  <p className="text-sm text-amber-800">
                                    <span className="font-semibold">Asset spend-down:</span> Spend{" "}
                                    <span className="font-bold">{fmtCurrency(results.excessAssets)}</span> on
                                    allowable expenses to reach the {fmtCurrency(results.assetLimit)} limit.
                                  </p>
                                  {results.monthsToAssetLimit > 0 && results.monthsToAssetLimit < Infinity && (
                                    <p className="text-xs text-amber-700 mt-1">
                                      At current care costs, ~{results.monthsToAssetLimit} months through paying for care.
                                    </p>
                                  )}
                                </div>
                              )}
                              {results.excessIncome > 0 && (
                                <p className="text-sm text-amber-800">
                                  <span className="font-semibold">Income spend-down:</span>{" "}
                                  <span className="font-bold">{fmtCurrency(results.monthlySpendDown)}/mo</span> must go
                                  toward medical/care expenses before Medicaid covers the rest.
                                </p>
                              )}
                            </div>
                          )}

                          {results.qualifiesDirectly && (
                            <div className="bg-success-50 border border-success-200 rounded-xl p-5 mb-6">
                              <p className="text-sm text-success-800">
                                You appear to meet {stateLimits?.label}&apos;s limits. You may apply for Medicaid directly without a spend-down.
                              </p>
                            </div>
                          )}

                          <div className="border border-gray-200 rounded-xl p-5">
                            <h4 className="text-sm font-semibold text-gray-900 mb-3">What Counts Toward Spend-Down?</h4>
                            <ul className="grid grid-cols-2 gap-x-4 gap-y-2">
                              {[
                                "Medical bills and co-pays",
                                "Prescription medications",
                                "Dental, vision, and hearing expenses",
                                "Home care aide costs",
                                "Assisted living or nursing facility costs",
                                "Medical equipment and supplies",
                                "Health insurance premiums",
                                "Transportation to medical appointments",
                              ].map((item) => (
                                <li key={item} className="flex items-center gap-2.5 text-sm text-gray-600">
                                  <span className="w-5 h-5 rounded-full bg-primary-50 border border-primary-200 flex items-center justify-center shrink-0">
                                    <svg className="w-3 h-3 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                  </span>
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Save to package — only after calculating */}
              {calculated && results && (
                <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs mt-6">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-gray-900 text-sm mb-0.5">
                        {saved ? "Added to your package" : "Save to your benefits package"}
                      </h3>
                      <p className="text-xs text-gray-500">
                        {saved
                          ? "Your spend-down estimate has been saved."
                          : "Keep this estimate alongside your matched benefits."}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleSaveToPackage}
                      disabled={saved}
                      className={`shrink-0 px-4 py-2 text-sm font-semibold rounded-lg transition-colors cursor-pointer border-none shadow-xs ${
                        saved
                          ? "bg-success-50 text-success-700"
                          : "bg-primary-600 text-white hover:bg-primary-700"
                      }`}
                    >
                      {saved ? (
                        <span className="flex items-center gap-1.5">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          Saved
                        </span>
                      ) : (
                        "Add to package"
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Legal Ways to Spend Down Assets ───────────────────────────────── */}
      <div className="bg-vanilla-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center mb-10">
            <h2 className="font-serif text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-3">
              Legal Ways to Spend Down Assets
            </h2>
            <p className="text-sm text-gray-500 max-w-lg mx-auto">
              These are common, legal strategies families use to reduce countable assets and qualify for Medicaid. Always consult an elder law attorney.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {LEGAL_STRATEGIES.map((strategy) => (
              <div
                key={strategy.title}
                className="bg-white border border-primary-100 rounded-xl p-5 hover:bg-primary-25 hover:border-primary-300 hover:shadow-sm transition-all"
              >
                <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center text-primary-600 mb-4">
                  {strategy.icon}
                </div>
                <h3 className="text-sm font-bold text-gray-900 mb-2">{strategy.title}</h3>
                <p className="text-xs text-gray-500 leading-relaxed mb-3">{strategy.description}</p>
                <span className="text-xs font-medium text-primary-600 hover:text-primary-700 cursor-pointer">
                  Learn more &rarr;
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Footer disclaimer ─────────────────────────────────────────────── */}
      <div className="border-t border-vanilla-300 bg-vanilla-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-xs text-gray-400 text-center leading-relaxed max-w-2xl mx-auto">
            This calculator provides estimates only and does not constitute financial or legal advice.
            Medicaid eligibility rules are complex and vary by state. Contact your local Medicaid office
            or a benefits counselor for an official determination. Medicaid has a 5-year look-back period
            for asset transfers.
          </p>
        </div>
      </div>
    </div>
  );
}
