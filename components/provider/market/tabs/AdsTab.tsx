"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface CampaignState {
  status: "pending_profile" | "requested" | "scheduled" | "live" | "ended" | "cancelled";
  visitors?: number;
  leads?: number;
}

interface AdsTabProps {
  city?: string;
  familiesInCity?: number | null;
}

export default function AdsTab(_props: AdsTabProps) {
  const [campaign, setCampaign] = useState<CampaignState | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/provider/ad-boost/request", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.request) {
          setCampaign({
            status: data.request.status,
            visitors: data.campaignStats?.visitors,
            leads: data.campaignStats?.leads,
          });
        }
        setIsLoading(false);
      })
      .catch(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-stone-200/80 p-8">
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-[#199087] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // Campaign is live
  if (campaign?.status === "live") {
    return (
      <div className="bg-white rounded-2xl border border-stone-200/80 p-6 sm:p-8">
        <div className="flex items-center justify-center gap-2 mb-4">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-sm font-semibold text-emerald-700">Your campaign is live</span>
        </div>

        <h2 className="text-[26px] sm:text-[30px] font-bold text-stone-900 tracking-tight leading-tight mb-6">
          Families are finding you.
        </h2>

        {/* Stats */}
        {(campaign.visitors !== undefined || campaign.leads !== undefined) && (
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-stone-50 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-stone-900">{campaign.visitors?.toLocaleString() ?? 0}</p>
              <p className="text-xs text-stone-500 mt-1">Visitors</p>
            </div>
            <div className="bg-stone-50 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-stone-900">{campaign.leads?.toLocaleString() ?? 0}</p>
              <p className="text-xs text-stone-500 mt-1">Leads</p>
            </div>
          </div>
        )}

        <Link
          href="/provider/boost"
          className="w-full flex items-center justify-center gap-2 bg-stone-900 hover:bg-stone-800 text-white font-medium py-3.5 rounded-xl transition-colors"
        >
          View campaign details
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
          </svg>
        </Link>
      </div>
    );
  }

  // Campaign is being set up (requested or scheduled)
  if (campaign?.status === "requested" || campaign?.status === "scheduled") {
    return (
      <div className="bg-white rounded-2xl border border-stone-200/80 p-6 sm:p-8">
        <div className="flex items-center justify-center gap-2 mb-4">
          <span className="w-2 h-2 rounded-full bg-[#199087] animate-pulse" />
          <span className="text-sm font-semibold text-[#199087]">
            {campaign.status === "scheduled" ? "Setup scheduled" : "Launch plan received"}
          </span>
        </div>

        <h2 className="text-[26px] sm:text-[30px] font-bold text-stone-900 tracking-tight leading-tight mb-2">
          We&apos;re on it.
        </h2>

        <p className="text-sm text-stone-500 mb-6">
          We&apos;ll send over the launch plan before anything goes live, then families arrive on your dashboard as they come in.
        </p>

        <Link
          href="/provider/boost"
          className="w-full flex items-center justify-center gap-2 border border-stone-200 hover:bg-stone-50 text-stone-700 font-medium py-3.5 rounded-xl transition-colors"
        >
          View your launch plan
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
          </svg>
        </Link>
      </div>
    );
  }

  // Campaign is queued (pending profile completion)
  if (campaign?.status === "pending_profile") {
    return (
      <div className="bg-white rounded-2xl border border-stone-200/80 p-6 sm:p-8">
        <div className="flex items-center justify-center gap-2 mb-4">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          <span className="text-sm font-semibold text-amber-700">Queued</span>
        </div>

        <h2 className="text-[26px] sm:text-[30px] font-bold text-stone-900 tracking-tight leading-tight mb-2">
          Your launch plan is queued.
        </h2>

        <p className="text-sm text-stone-500 mb-6">
          Finish your profile and we&apos;ll launch your campaign — families need to see your best before we send them your way.
        </p>

        <Link
          href="/provider/boost"
          className="w-full flex items-center justify-center gap-2 bg-stone-900 hover:bg-stone-800 text-white font-medium py-3.5 rounded-xl transition-colors"
        >
          Continue setup
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
          </svg>
        </Link>
      </div>
    );
  }

  // No campaign yet (or ended/cancelled) - show the pitch
  return (
    <div className="bg-white rounded-2xl border border-stone-200/80 p-6 sm:p-8">
      {/* Headline */}
      <h2 className="text-[26px] sm:text-[30px] font-bold text-stone-900 tracking-tight leading-tight mb-2">
        Reach families already searching for care.
      </h2>

      {/* Subtitle */}
      <p className="text-sm text-stone-500 mb-6">
        We run the ads, point them at the families most likely to choose you, and send every one straight to your page.
      </p>

      {/* How it works card */}
      <div className="bg-stone-50 rounded-xl p-4 mb-6">
        <p className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-3">
          How managed ads work
        </p>
        <div className="space-y-2.5">
          <div className="flex items-start gap-3">
            <span className="w-5 h-5 rounded-full bg-[#199087]/10 flex items-center justify-center shrink-0 text-xs font-medium text-[#199087]">
              1
            </span>
            <p className="text-sm text-stone-700">
              Pick your budget and launch week
            </p>
          </div>
          <div className="flex items-start gap-3">
            <span className="w-5 h-5 rounded-full bg-[#199087]/10 flex items-center justify-center shrink-0 text-xs font-medium text-[#199087]">
              2
            </span>
            <p className="text-sm text-stone-700">
              We run Google + Meta ads, targeting families near you
            </p>
          </div>
          <div className="flex items-start gap-3">
            <span className="w-5 h-5 rounded-full bg-[#199087]/10 flex items-center justify-center shrink-0 text-xs font-medium text-[#199087]">
              3
            </span>
            <p className="text-sm text-stone-700">
              Families land on your page — you see every visitor and lead
            </p>
          </div>
        </div>
      </div>

      {/* CTA button */}
      <Link
        href="/provider/boost"
        className="w-full flex items-center justify-center gap-2 bg-stone-900 hover:bg-stone-800 text-white font-medium py-3.5 rounded-xl transition-colors"
      >
        Start my free campaign
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
        </svg>
      </Link>

      {/* Helper text */}
      <p className="flex items-center justify-center gap-2 text-sm text-stone-500 mt-4">
        <span className="text-[#199087]">✦</span>
        <span>
          First campaign on us — <span className="text-[#199087] font-medium">$50, free</span>
        </span>
      </p>
    </div>
  );
}
