"use client";

import { useConnectionCard } from "./use-connection-card";
import CardBottomSection from "./CardBottomSection";
import InquiryForm from "./InquiryForm";
import EnrichmentState from "./EnrichmentState";
import ConnectedState from "./ConnectedState";
import type { ConnectionCardProps } from "./types";

export type { ConnectionCardProps } from "./types";

export default function ConnectionCard(props: ConnectionCardProps) {
  const {
    providerName,
    phone,
    acceptedPayments,
  } = props;

  const hook = useConnectionCard(props);

  // Block non-family profiles from sending care inquiries
  if (hook.isNonFamilyProfile) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-[0_2px_16px_rgba(0,0,0,0.08)] overflow-hidden">
        <div className="px-5 py-6 text-center">
          <div className="w-14 h-14 bg-primary-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Family account required
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            Care consultation requests can only be sent from a family account. Create one to connect with {providerName}.
          </p>
          <button
            onClick={() => hook.openAuth({ defaultMode: "sign-up", intent: "family" })}
            className="w-full py-3 px-4 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl transition-colors"
          >
            Create Family Account
          </button>
          <p className="text-xs text-gray-400 mt-3">
            Use a different email than your current account.
          </p>
        </div>
        <CardBottomSection acceptedPayments={acceptedPayments} />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-[0_2px_16px_rgba(0,0,0,0.08)] overflow-hidden max-h-[calc(100vh-120px)] overflow-y-auto">
      {/* Main content */}
      <div className="px-5 py-5">
        {hook.cardState === "loading" && (
          <div className="animate-pulse space-y-3">
            <div className="h-11 bg-gray-100 rounded-[10px]" />
            <div className="h-10 bg-gray-100 rounded-[10px]" />
          </div>
        )}

        {hook.cardState === "default" && (
          <InquiryForm
            key={hook.userEmail || "guest"}
            providerName={providerName}
            onSubmit={hook.submitInquiryForm}
            submitting={hook.submitting}
            error={hook.error}
            initialEmail={hook.userEmail}
            initialName={hook.userName}
            initialPhone={hook.userPhone}
          />
        )}

        {hook.cardState === "enrichment" && (
          <EnrichmentState
            providerName={providerName}
            onSave={hook.saveEnrichment}
            onSkip={hook.skipEnrichment}
            saving={hook.submitting}
            initialRecipient={hook.initialRecipient}
            initialUrgency={hook.initialUrgency}
          />
        )}

        {hook.cardState === "connected" && (
          <ConnectedState
            phone={phone}
            requestDate={hook.pendingRequestDate}
            connectionId={hook.connectionId}
          />
        )}
      </div>

      {/* Bottom section — persistent */}
      <CardBottomSection acceptedPayments={acceptedPayments} />
    </div>
  );
}
