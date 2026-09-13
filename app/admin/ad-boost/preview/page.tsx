"use client";

import { useState } from "react";
import Link from "next/link";
import type { BoostRequest, CampaignReceiptData } from "@/lib/ad-boost/boost-state";
import {
  CampaignInMotion,
  PlanActive,
  WrapUpMoment,
} from "@/components/provider/boost/BoostCampaignViews";

/**
 * Wrap-up moment preview gallery — renders the EXACT provider-facing Phase 2
 * money views (components shared with /provider/boost) against sample data, so
 * the team can see what a provider sees without seeding a campaign. The
 * checkout button is stubbed: nothing here can charge anyone.
 */

type PreviewKey =
  | "live"
  | "wrapup"
  | "wrapup_one"
  | "weak"
  | "celebrate"
  | "steady";

/** Sample receipts — Miracle-Lightstar-shaped numbers for the zero-lead demand
 *  receipt, Franchil-shaped for the outcome receipt. */
const RECEIPT_ZERO: CampaignReceiptData = {
  google: { impressions: 268, clicks: 20, spendCents: 3735, ctr: 7.5, cpcCents: 187 },
  engagement: { visitors: 22, saves: 6, questionsReceived: 3, questionTopics: 3 },
  outcomes: { client: 0, talking: 0, no: 0, unanswered: 0 },
  expectedLeads: 0.7,
  week: { visitors: 9, questions: 2, leads: 0 },
};

const RECEIPT_STRONG: CampaignReceiptData = {
  google: { impressions: 64, clicks: 16, spendCents: 3650, ctr: 14.1, cpcCents: 228 },
  engagement: { visitors: 19, saves: 8, questionsReceived: 4, questionTopics: 4 },
  outcomes: { client: 1, talking: 1, no: 0, unanswered: 1 },
  expectedLeads: 0.5,
  week: { visitors: 7, questions: 1, leads: 1 },
};

/**
 * Sample dates are RELATIVE, not literal.
 *
 * They were written as fixed strings in June and by September the "Live ·
 * mid-flight" preview read "Your campaign is live" above "Flight: Ended Aug 3".
 * That contradiction is a fixture going stale, not a bug in CampaignInMotion,
 * but it looks exactly like one and it gets worse every month.
 */
function daysFromNow(n: number): string {
  return new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
}
function isoFromNow(n: number): string {
  return new Date(Date.now() + n * 86_400_000).toISOString();
}

const SAMPLE_BASE: BoostRequest = {
  id: "preview",
  status: "live",
  requested_setup_week: daysFromNow(-24),
  channel: "google",
  intended_monthly_budget: 50,
  campaign_tag: "preview-campaign",
  created_at: isoFromNow(-30),
  plan_status: null,
  plan_value: null,
  promo_complete_email_sent_at: isoFromNow(-3),
};

const PREVIEWS: {
  key: PreviewKey;
  label: string;
  blurb: string;
}[] = [
  {
    key: "live",
    label: "Live · mid-flight",
    blurb: "The in-campaign view where conviction builds: momentum line under the stat row, accruing receipt, flight clock in the facts row, and a visible plan choice so a provider can keep the campaign running without hunting for the action.",
  },
  {
    key: "wrapup",
    label: "Wrap-up · strong",
    blurb: "The payment ask, now with the outcome receipt: one lead reported as a paying client (the provider's own one-tap answer), one still talking. Sample numbers are Franchil-shaped: 19 visitors, 3 leads.",
  },
  {
    key: "wrapup_one",
    label: "Wrap-up · 1 lead",
    blurb: "Same ask with a single lead (“A family reached out.”) — the weakest state that still asks.",
  },
  {
    key: "weak",
    label: "Wrap-up · zero leads",
    blurb: "The demand receipt: ad reach, clicks, saves and questions prove demand was real, the math line explains the zero, and the plans read as a volume choice. Sample numbers are Miracle-Lightstar-shaped: 268 ad views, 20 clicks, 6 saves, 0 leads.",
  },
  {
    key: "celebrate",
    label: "Plan · just paid",
    blurb: "What they see returning from Stripe Checkout (?subscribed=true), even before the webhook lands.",
  },
  {
    key: "steady",
    label: "Plan · steady state",
    blurb: "Every later visit to /provider/boost while the plan runs.",
  },
];

export default function AdBoostPreviewPage() {
  const [view, setView] = useState<PreviewKey>("wrapup");
  // The receipt's arrival animation fires once per campaign_tag and then
  // remembers. That is right for a provider and wrong for a gallery: every
  // sample shares one tag, so without a per-view, per-load tag you would see it
  // animate once, reload, see nothing, and reasonably report it broken.
  const [previewNonce] = useState(() => Date.now().toString(36));
  const sampleFor = (v: PreviewKey, base: BoostRequest = SAMPLE_BASE): BoostRequest => ({
    ...base,
    campaign_tag: `preview-${v}-${previewNonce}`,
  });
  const [fakeSubmitting, setFakeSubmitting] = useState(false);
  const [fakeError, setFakeError] = useState<string | null>(null);

  const stubCheckout = (planValue: number) => {
    // Stubbed on purpose — show the loading beat, then explain.
    setFakeError(null);
    setFakeSubmitting(true);
    setTimeout(() => {
      setFakeSubmitting(false);
      setFakeError(
        `Preview only — a real provider would now be on Stripe Checkout for $${planValue}/mo.`,
      );
    }, 600);
  };

  const stats = (leads: number) => ({
    visitors: 19,
    leads,
    questions: { received: 4, unanswered: 1 },
    since: isoFromNow(-24),
  });

  const active: BoostRequest = {
    ...SAMPLE_BASE,
    plan_status: "active",
    plan_value: 75,
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <header className="mb-4">
        <Link
          href="/admin/ad-boost"
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 mb-3"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
          </svg>
          Back to queue
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-gray-900">What providers see</h1>
          <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-700">
            sample data · checkout stubbed
          </span>
        </div>
        <p className="text-gray-500 mt-1 text-sm max-w-2xl">
          The exact /provider/boost components, shared code against sample data.
        </p>
      </header>

      {/* State picker */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {PREVIEWS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => {
              setView(p.key);
              setFakeError(null);
            }}
            className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
              view === p.key
                ? "bg-primary-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <p className="mt-3 mb-5 max-w-2xl border-l-2 border-primary-200 pl-3 text-xs leading-relaxed text-gray-500">
        <span className="font-semibold text-gray-700">
          {PREVIEWS.find((p) => p.key === view)?.label}.
        </span>{" "}
        {PREVIEWS.find((p) => p.key === view)?.blurb}
      </p>

      {/* The provider's viewport — same warm shell as /provider/boost */}
      <div className="rounded-2xl border border-gray-200 overflow-hidden">
        <div className="border-b border-gray-100 bg-gray-50/60 px-4 py-2 text-xs text-gray-400">
          provider view · /provider/boost
        </div>
        <div className="bg-gradient-to-b from-vanilla-50 via-white to-white px-6 sm:px-10 py-10">
          {view === "live" && (
            <CampaignInMotion
              key="live"
              request={{ ...sampleFor("live"), flight_end_date: daysFromNow(6), promo_complete_email_sent_at: null }}
              campaignStats={stats(1)}
              receipt={RECEIPT_STRONG}
              onCheckout={stubCheckout}
              submitting={fakeSubmitting}
              error={fakeError}
            />
          )}
          {view === "wrapup" && (
            <WrapUpMoment
              key="wrapup"
              request={sampleFor("wrapup")}
              campaignStats={stats(3)}
              receipt={RECEIPT_STRONG}
              onCheckout={stubCheckout}
              submitting={fakeSubmitting}
              error={fakeError}
            />
          )}
          {view === "wrapup_one" && (
            <WrapUpMoment
              key="wrapup_one"
              request={sampleFor("wrapup_one")}
              campaignStats={stats(1)}
              onCheckout={stubCheckout}
              submitting={fakeSubmitting}
              error={fakeError}
            />
          )}
          {view === "weak" && (
            <WrapUpMoment
              key="weak"
              request={sampleFor("weak")}
              campaignStats={stats(0)}
              receipt={RECEIPT_ZERO}
              onCheckout={stubCheckout}
              submitting={fakeSubmitting}
              error={fakeError}
            />
          )}
          {view === "celebrate" && (
            <PlanActive request={sampleFor(view, active)} campaignStats={stats(3)} celebrate />
          )}
          {view === "steady" && (
            <PlanActive request={sampleFor(view, active)} campaignStats={stats(5)} celebrate={false} />
          )}
        </div>
      </div>
    </div>
  );
}
