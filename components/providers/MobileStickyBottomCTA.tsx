"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Modal from "@/components/ui/Modal";
import { useConnectionCard } from "@/components/providers/connection-card/use-connection-card";
import CardTopSection from "@/components/providers/connection-card/CardTopSection";
import PhoneButton from "@/components/providers/connection-card/PhoneButton";
import Pill from "@/components/providers/connection-card/Pill";
import StepIndicator from "@/components/providers/connection-card/StepIndicator";
import {
  RECIPIENT_OPTIONS,
  URGENCY_OPTIONS,
  CARE_TYPE_LABELS,
  RECIPIENT_LABELS,
  URGENCY_LABELS,
} from "@/components/providers/connection-card/constants";

interface MobileStickyBottomCTAProps {
  providerName: string;
  priceRange: string | null;
  // ConnectionCard props
  providerId: string;
  providerSlug: string;
  oleraScore: number | null;
  reviewCount: number | undefined;
  phone: string | null;
  acceptedPayments: string[];
  careTypes: string[];
  // Redirect props
  providerCategory?: string | null;
  providerCity?: string | null;
  providerState?: string | null;
}

export default function MobileStickyBottomCTA({
  providerName,
  priceRange,
  providerId,
  providerSlug,
  oleraScore,
  reviewCount,
  phone,
  acceptedPayments,
  careTypes,
  providerCategory,
  providerCity,
  providerState,
}: MobileStickyBottomCTAProps) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  // ── Redirect after connection ──
  const handleConnectionCreated = useCallback(
    (connectionId: string) => {
      setSheetOpen(false);
      const params = new URLSearchParams({
        name: providerName,
        slug: providerSlug,
      });
      if (providerCategory) params.set("category", providerCategory);
      if (providerCity) params.set("city", providerCity);
      if (providerState) params.set("state", providerState);
      router.push(`/connected/${connectionId}?${params.toString()}`);
    },
    [providerName, providerSlug, providerCategory, providerCity, providerState, router]
  );

  // ── Connection state machine (pre-loads on mount, persists across sheet open/close) ──
  const hook = useConnectionCard({
    providerId,
    providerName,
    providerSlug,
    priceRange,
    oleraScore,
    reviewCount,
    phone,
    acceptedPayments,
    careTypes,
    responseTime: null,
    onConnectionCreated: handleConnectionCreated,
  });

  // ── Scroll visibility for sticky bar ──
  const handleScroll = useCallback(() => {
    setVisible(window.scrollY > 100);
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  // Allow other components (e.g. ScrollToConnectionCard) to open the sheet
  useEffect(() => {
    const openSheet = () => setSheetOpen(true);
    window.addEventListener("open-connection-sheet", openSheet);
    return () => window.removeEventListener("open-connection-sheet", openSheet);
  }, []);

  // ── Dynamic Modal title ──
  const sheetTitle = (() => {
    switch (hook.cardState) {
      case "loading":
        return "Connect";
      case "default":
        return priceRange || "Connect";
      case "intent":
        return hook.intentStep === 0
          ? "Who needs care?"
          : hook.intentStep === 1
          ? "What type of care?"
          : "When do you need care?";
      case "connected":
        return undefined;
      case "returning":
        return priceRange || "Reconnect";
    }
  })();

  // ── Dynamic back button ──
  const sheetOnBack = (() => {
    if (hook.cardState === "intent") {
      if (hook.intentStep === 0) return () => hook.resetFlow();
      if (hook.intentStep === 1) return () => hook.setIntentStep(0);
      if (hook.intentStep === 2) return () => hook.setIntentStep(1);
    }
    return undefined;
  })();

  // ── Dynamic footer (sticky actions) ──
  const canConnect = hook.intentData.urgency !== null && !hook.submitting;

  const sheetFooter = (() => {
    switch (hook.cardState) {
      case "loading":
        return undefined;

      case "default":
        return (
          <div className="space-y-2.5">
            <button
              onClick={hook.startFlow}
              className="w-full py-3.5 bg-primary-600 hover:bg-primary-500 active:bg-primary-700 text-white rounded-[10px] text-base font-semibold transition-colors"
            >
              Connect
            </button>
            <PhoneButton
              phone={phone}
              revealed={hook.phoneRevealed}
              onReveal={hook.revealPhone}
            />
            {!hook.phoneRevealed && phone && (
              <p className="text-xs text-gray-400 text-center">
                Connect to see full number
              </p>
            )}
          </div>
        );

      case "intent":
        return (
          <div className="space-y-2">
            {hook.error && (
              <p className="text-sm text-red-600 text-center" role="alert">
                {hook.error}
              </p>
            )}
            <button
              onClick={hook.connect}
              disabled={!canConnect}
              className={`w-full py-3.5 rounded-[10px] text-[15px] font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
                canConnect
                  ? "bg-primary-600 text-white hover:bg-primary-500 active:bg-primary-700"
                  : "bg-gray-100 text-gray-400 cursor-default"
              }`}
            >
              {hook.submitting && (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              {hook.submitting ? "Connecting..." : "Connect"}
            </button>
          </div>
        );

      case "connected": {
        const inboxHref = hook.connectionId
          ? `/portal/inbox?id=${hook.connectionId}`
          : "/portal/inbox";
        return (
          <div className="space-y-2.5">
            <PhoneButton phone={phone} revealed onReveal={() => {}} />
            <Link
              href={inboxHref}
              className="block w-full py-3 bg-primary-600 hover:bg-primary-500 rounded-[10px] text-sm font-semibold text-white text-center transition-colors"
            >
              Message
            </Link>
          </div>
        );
      }

      case "returning":
        return (
          <div className="space-y-2.5">
            {hook.error && (
              <p className="text-sm text-red-600 text-center" role="alert">
                {hook.error}
              </p>
            )}
            <button
              onClick={hook.connect}
              disabled={hook.submitting}
              className="w-full py-3.5 bg-primary-600 hover:bg-primary-500 active:bg-primary-700 text-white rounded-[10px] text-[15px] font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {hook.submitting && (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              {hook.submitting ? "Connecting..." : "Connect"}
            </button>
            <PhoneButton phone={phone} revealed onReveal={() => {}} />
          </div>
        );
    }
  })();

  // ── Derived labels for returning state ──
  const careTypeLabel = hook.intentData.careType
    ? CARE_TYPE_LABELS[hook.intentData.careType] || hook.intentData.careType
    : "";
  const recipientLabel = hook.intentData.careRecipient
    ? RECIPIENT_LABELS[hook.intentData.careRecipient] ||
      hook.intentData.careRecipient
    : "";
  const urgencyLabel = hook.intentData.urgency
    ? URGENCY_LABELS[hook.intentData.urgency] || hook.intentData.urgency
    : "";

  // ── Connected state date ──
  const dateStr = hook.pendingRequestDate
    ? new Date(hook.pendingRequestDate).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : "recently";

  return (
    <>
      {/* ── Sticky bottom bar ── */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 md:hidden transition-transform duration-300 ${
          visible ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div
          className="bg-white border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.08)]"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          <div className="flex items-center gap-4 px-4 py-3.5">
            <div className="flex-1 min-w-0">
              {priceRange ? (
                <p className="text-base font-bold text-gray-900 truncate">
                  {priceRange}
                </p>
              ) : (
                <p className="text-sm font-medium text-gray-500 truncate">
                  Contact for pricing
                </p>
              )}
            </div>

            <button
              onClick={() => setSheetOpen(true)}
              className="flex-shrink-0 px-7 py-3 bg-primary-600 hover:bg-primary-500 active:bg-primary-700 text-white rounded-xl text-base font-semibold transition-colors"
            >
              Connect
            </button>
          </div>
        </div>
      </div>

      {/* ── Connection bottom sheet ── */}
      <Modal
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={sheetTitle}
        onBack={sheetOnBack}
        footer={sheetFooter}
        size="lg"
      >
        {/* ── Loading ── */}
        {hook.cardState === "loading" && (
          <div className="py-4 animate-step-in">
            <div className="animate-pulse space-y-3">
              <div className="h-11 bg-gray-100 rounded-[10px]" />
              <div className="h-10 bg-gray-100 rounded-[10px]" />
            </div>
          </div>
        )}

        {/* ── Default: score + payments ── */}
        {hook.cardState === "default" && (
          <div className="animate-step-in">
            {oleraScore != null && oleraScore > 0 && (
              <div className="pt-2 pb-3 -mx-5 sm:-mx-7">
                <CardTopSection
                  priceRange={null}
                  oleraScore={oleraScore}
                  reviewCount={reviewCount}
                  responseTime={null}
                  hideResponseTime
                />
              </div>
            )}
            {acceptedPayments.length > 0 && (
              <div className="pt-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400 mb-2">
                  Accepted payments
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {acceptedPayments.map((payment) => (
                    <span
                      key={payment}
                      className="text-xs text-gray-600 bg-gray-100 px-2.5 py-1 rounded"
                    >
                      {payment}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Intent step 0: Who needs care? ── */}
        {hook.cardState === "intent" && hook.intentStep === 0 && (
          <div className="py-2 animate-step-in">
            <StepIndicator current={0} total={3} />
            <div className="flex flex-col gap-1.5">
              {RECIPIENT_OPTIONS.map((opt) => (
                <Pill
                  key={opt.value}
                  label={opt.label}
                  selected={hook.intentData.careRecipient === opt.value}
                  onClick={() => hook.selectRecipient(opt.value)}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Intent step 1: What type of care? ── */}
        {hook.cardState === "intent" && hook.intentStep === 1 && (
          <div className="py-2 animate-step-in">
            <StepIndicator current={1} total={3} />
            <div className="flex flex-col gap-1.5">
              {hook.availableCareTypes.map((ct) => (
                <Pill
                  key={ct}
                  label={CARE_TYPE_LABELS[ct] || ct}
                  selected={hook.intentData.careType === ct}
                  onClick={() => hook.selectCareType(ct)}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Intent step 2: When do you need care? ── */}
        {hook.cardState === "intent" && hook.intentStep === 2 && (
          <div className="py-2 animate-step-in">
            <StepIndicator current={2} total={3} />
            <div className="grid grid-cols-2 gap-1.5">
              {URGENCY_OPTIONS.map((opt) => (
                <Pill
                  key={opt.value}
                  label={opt.label}
                  selected={hook.intentData.urgency === opt.value}
                  onClick={() => hook.selectUrgency(opt.value)}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Connected: success banner ── */}
        {hook.cardState === "connected" && (
          <div className="py-4 animate-step-in">
            <div className="flex items-center gap-3 px-4 py-4 bg-emerald-50 rounded-[10px] border border-emerald-100">
              <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center shrink-0">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-emerald-600"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  Connected &middot; {dateStr}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Returning: intent summary ── */}
        {hook.cardState === "returning" && (
          <div className="py-2 animate-step-in">
            <div className="px-3.5 py-3.5 bg-gray-50 rounded-[10px] border border-gray-100">
              <p className="text-sm font-semibold text-gray-800">
                {careTypeLabel}
              </p>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                {recipientLabel} &middot; {urgencyLabel}
              </p>
              <button
                onClick={hook.editFromReturning}
                className="text-xs text-primary-600 font-medium mt-2 underline decoration-primary-600/25 underline-offset-2 hover:decoration-primary-600/50 transition-colors bg-transparent border-none cursor-pointer p-0"
              >
                Edit details
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
