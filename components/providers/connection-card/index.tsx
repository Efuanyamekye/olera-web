"use client";

import { useConnectionCard } from "./use-connection-card";
import CardTopSection from "./CardTopSection";
import CardBottomSection from "./CardBottomSection";
import DefaultActions from "./DefaultActions";
import IntentCapture from "./IntentCapture";
import EmailCapture from "./EmailCapture";
import ConnectedState from "./ConnectedState";
import ReturningUserState from "./ReturningUserState";
import type { ConnectionCardProps } from "./types";

export type { ConnectionCardProps } from "./types";

export default function ConnectionCard(props: ConnectionCardProps) {
  const {
    providerName,
    priceRange,
    oleraScore,
    reviewCount,
    phone,
    acceptedPayments,
    responseTime,
  } = props;

  const hook = useConnectionCard(props);

  return (
    <div className="bg-vanilla-100 rounded-xl border border-gray-200 shadow-sm overflow-hidden max-h-[calc(100vh-120px)] overflow-y-auto">
      {/* Top section — persistent across all states */}
      <CardTopSection
        priceRange={priceRange}
        oleraScore={oleraScore}
        reviewCount={reviewCount}
        responseTime={responseTime}
        hideResponseTime={false}
      />

      {/* Divider */}
      <div className="h-px bg-gray-200" />

      {/* Middle section — state-dependent */}
      <div className="px-5 py-5">
        {hook.cardState === "loading" && (
          <div className="animate-pulse space-y-3">
            <div className="h-11 bg-gray-100 rounded-[10px]" />
            <div className="h-10 bg-gray-100 rounded-[10px]" />
          </div>
        )}

        {hook.cardState === "default" && (
          <DefaultActions
            phone={phone}
            phoneRevealed={hook.phoneRevealed}
            onConnect={hook.startFlow}
            onRevealPhone={hook.revealPhone}
          />
        )}

        {hook.cardState === "intent" && (
          <IntentCapture
            intentStep={hook.intentStep}
            intentData={hook.intentData}
            onSelectRecipient={hook.selectRecipient}
            onSelectUrgency={hook.selectUrgency}
            onConnect={hook.connect}
            submitting={hook.submitting}
            totalSteps={hook.totalSteps}
          />
        )}

        {hook.cardState === "email_capture" && (
          <EmailCapture
            intentData={hook.intentData}
            providerName={providerName}
            onSubmit={hook.submitGuestRequest}
            onBack={hook.editFromEmailCapture}
            submitting={hook.submitting}
            error={hook.error}
          />
        )}

        {hook.cardState === "connected" && (
          <ConnectedState
            phone={phone}
            requestDate={hook.pendingRequestDate}
            connectionId={hook.connectionId}
          />
        )}

        {hook.cardState === "returning" && (
          <ReturningUserState
            phone={phone}
            intentData={hook.intentData}
            onConnect={hook.connect}
            onEdit={hook.editFromReturning}
            submitting={hook.submitting}
          />
        )}
      </div>

      {/* Bottom section — persistent */}
      <CardBottomSection acceptedPayments={acceptedPayments} />
    </div>
  );
}
