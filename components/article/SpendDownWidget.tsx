"use client";

import { useState, useMemo, useRef } from "react";

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

function fmt(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtCurrency(n: number): string {
  return `$${fmt(n)}`;
}

// ── Widget Component ────────────────────────────────────────────────────────

interface SpendDownWidgetProps {
  initialStateCode?: string;
}

export default function SpendDownWidget({ initialStateCode = "TX" }: SpendDownWidgetProps) {
  const [state, setState] = useState(initialStateCode && STATE_LIMITS[initialStateCode] ? initialStateCode : "");
  const [totalAssets, setTotalAssets] = useState("");
  const [monthlyIncome, setMonthlyIncome] = useState("");
  const [careType, setCareType] = useState<CareType>("nursingHome");
  const [hasSpouse, setHasSpouse] = useState(false);
  const [calculated, setCalculated] = useState(false);

  const stateLimits = state ? STATE_LIMITS[state] : null;
  const resultsRef = useRef<HTMLDivElement>(null);

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

    const netMonthlyCostAfterIncome = Math.max(0, monthlyCost - income);
    const monthsToAssetLimit = netMonthlyCostAfterIncome > 0
      ? Math.max(0, Math.ceil(excessAssets / netMonthlyCostAfterIncome))
      : excessAssets > 0 ? Infinity : 0;

    const monthlySpendDown = excessIncome;

    return {
      assets,
      income,
      assetLimit,
      incomeLimit,
      excessAssets,
      excessIncome,
      monthlyCost,
      monthlySpendDown,
      monthsToAssetLimit,
      qualifiesDirectly: excessAssets <= 0 && excessIncome <= 0,
      careLabel: care.label,
    };
  }, [calculated, stateLimits, totalAssets, monthlyIncome, careType, hasSpouse]);

  function handleCalculate() {
    if (!state || !totalAssets || !monthlyIncome) return;
    setCalculated(true);
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }

  return (
    <div className="my-6 rounded-2xl border border-primary-100 bg-vanilla-50 overflow-hidden">
      {/* Two-column layout */}
      <div className="px-4 sm:px-6 py-5">
        <div className="flex flex-col gap-4">
          {/* ── Spend-Down Summary (top) ────────────────────────── */}
          <div ref={resultsRef}>
            <div className="bg-primary-25 border border-primary-100 rounded-xl shadow-xs overflow-hidden h-full">
              <div className="p-4">
                {!calculated || !results ? (
                  <div className="flex items-center justify-center gap-3 py-6 text-center">
                    <svg className="w-6 h-6 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h14.25M3 9h9.75M3 13.5h5.25m5.25-.75L17.25 9m0 0L21 12.75M17.25 9v12" />
                    </svg>
                    <p className="text-sm text-gray-400">
                      Fill in your information below and click <span className="font-semibold text-gray-600">Calculate</span> to see your spend-down summary.
                    </p>
                  </div>
                ) : (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-1">Your Spend-Down Summary</h3>
                    <p className="text-xs text-gray-400 mb-3">Based on {stateLimits?.label} Medicaid limits</p>

                    {/* Qualification banner */}
                    {results.qualifiesDirectly && (
                      <div className="bg-success-50 border border-success-200 rounded-xl p-3 flex items-start gap-3 mb-3">
                        <svg className="w-5 h-5 text-success-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div>
                          <p className="text-sm font-semibold text-success-800">You may already qualify!</p>
                          <p className="text-xs text-success-700 mt-0.5">Your income and assets appear to be within {stateLimits?.label}&apos;s Medicaid limits. You may apply directly without a spend-down.</p>
                        </div>
                      </div>
                    )}

                    <div className="space-y-2 mb-3">
                      {/* Asset comparison */}
                      <div className="p-3 rounded-xl border border-gray-200">
                        <div className="flex items-center justify-between mb-2">
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
                      <div className="p-3 rounded-xl border border-gray-200">
                        <div className="flex items-center justify-between mb-2">
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
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3">
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

                    {/* What Counts Toward Spend-Down */}
                    <div className="border border-gray-200 rounded-xl p-3">
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
              </div>
            </div>
          </div>

          {/* ── Form (bottom, compact) ──────────────────────────── */}
          <div>
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs">
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V13.5zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V18zm2.498-6.75h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V13.5zM8.25 6h7.5v2.25h-7.5V6zM12 2.25c-1.892 0-3.758.11-5.593.322C5.307 2.7 4.5 3.65 4.5 4.757V19.5a2.25 2.25 0 002.25 2.25h10.5a2.25 2.25 0 002.25-2.25V4.757c0-1.108-.806-2.057-1.907-2.185A48.507 48.507 0 0012 2.25z" />
                </svg>
                <h3 className="text-sm font-semibold text-gray-900">Your Information</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                {/* State */}
                <div>
                  <label htmlFor="widget-state" className="block text-xs font-medium text-gray-700 mb-1">State</label>
                  <select
                    id="widget-state"
                    value={state}
                    onChange={(e) => { setState(e.target.value); setCalculated(false); }}
                    className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:ring-2 focus:ring-primary-200 focus:border-primary-400 outline-none transition-shadow"
                  >
                    <option value="">Select state</option>
                    {Object.entries(STATE_LIMITS)
                      .sort((a, b) => a[1].label.localeCompare(b[1].label))
                      .map(([code, { label }]) => (
                        <option key={code} value={code}>{label}</option>
                      ))}
                  </select>
                </div>

                {/* Total Countable Assets */}
                <div>
                  <label htmlFor="widget-assets" className="flex items-center gap-1 text-xs font-medium text-gray-700 mb-1">
                    Countable Assets
                    <span className="relative group">
                      <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-gray-200 text-gray-500 text-[9px] font-bold cursor-help">?</span>
                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-2.5 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 pointer-events-none leading-relaxed">
                        Bank accounts, investments, stocks, bonds, cash. Excludes primary home, one car, personal belongings.
                        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                      </span>
                    </span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <input
                      id="widget-assets"
                      type="text"
                      inputMode="numeric"
                      placeholder="150,000"
                      value={totalAssets}
                      onChange={(e) => { setTotalAssets(e.target.value.replace(/[^0-9,]/g, "")); setCalculated(false); }}
                      className="w-full pl-6 pr-2.5 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-primary-200 focus:border-primary-400 outline-none transition-shadow"
                    />
                  </div>
                </div>

                {/* Monthly Income */}
                <div>
                  <label htmlFor="widget-income" className="block text-xs font-medium text-gray-700 mb-1">Monthly Income</label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <input
                      id="widget-income"
                      type="text"
                      inputMode="numeric"
                      placeholder="2,400"
                      value={monthlyIncome}
                      onChange={(e) => { setMonthlyIncome(e.target.value.replace(/[^0-9,]/g, "")); setCalculated(false); }}
                      className="w-full pl-6 pr-2.5 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-primary-200 focus:border-primary-400 outline-none transition-shadow"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Care type buttons inline */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-gray-700">Care:</span>
                  {(Object.entries(CARE_COSTS) as [CareType, CareCost][]).map(([key, cost]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => { setCareType(key); setCalculated(false); }}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                        careType === key
                          ? "border-primary-400 bg-primary-25 text-primary-700 ring-1 ring-primary-200"
                          : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      {cost.label}
                    </button>
                  ))}
                </div>

                {/* Spouse toggle */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={hasSpouse}
                    onClick={() => { setHasSpouse(!hasSpouse); setCalculated(false); }}
                    className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                      hasSpouse ? "bg-primary-500" : "bg-gray-200"
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${
                      hasSpouse ? "translate-x-3" : "translate-x-0"
                    }`} />
                  </button>
                  <span className="text-xs text-gray-600">Spouse at home</span>
                </div>

                {/* Calculate */}
                <button
                  type="button"
                  onClick={handleCalculate}
                  disabled={!state || !totalAssets || !monthlyIncome}
                  className="ml-auto px-5 py-2 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-700 disabled:bg-primary-400 disabled:text-white/80 disabled:cursor-default transition-colors cursor-pointer"
                >
                  Calculate
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="px-4 sm:px-6 pb-4">
        <p className="text-xs text-gray-400 text-center leading-relaxed max-w-2xl mx-auto">
          Estimates only, not financial or legal advice. Contact your local Medicaid office for an official determination.
        </p>
      </div>
    </div>
  );
}
