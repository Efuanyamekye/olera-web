"use client";

import { Suspense, useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import InterviewCalendar from "@/components/medjobs/InterviewCalendar";
import UpgradeModal from "@/components/medjobs/UpgradeModal";
import VerificationMethodModal from "@/components/provider/VerificationMethodModal";
import { useVerificationModal } from "@/lib/hooks/useVerificationModal";
import { getAccessTier } from "@/lib/medjobs-access";
import type { Interview } from "@/lib/types";

type InterviewWithProfiles = Interview & {
  provider?: { id: string; display_name: string; image_url?: string };
  student?: { id: string; slug?: string; display_name: string; image_url?: string; email?: string; metadata?: Record<string, unknown> };
};

// useSearchParams requires a Suspense boundary for Next.js static prerender.
export default function ProviderCaregiversPage() {
  return (
    <Suspense fallback={null}>
      <ProviderCaregiversContent />
    </Suspense>
  );
}

function ProviderCaregiversContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Capture once on mount — we strip this param via router.replace after
  // opening the modal, but we still want the auto-open to fire even after
  // the URL has been cleaned.
  const initialNewInterviewIdRef = useRef<string | null>(searchParams.get("newInterview"));
  const newInterviewId = initialNewInterviewIdRef.current;
  const { activeProfile, isLoading: authLoading } = useAuth();
  const [interviews, setInterviews] = useState<InterviewWithProfiles[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // Compute access tier from the provider's metadata
  const providerMeta = (activeProfile?.metadata ?? {}) as Record<string, unknown>;
  const accessInfo = getAccessTier(!!activeProfile, providerMeta);

  // Verification state
  const verificationState = activeProfile?.verification_state as string | null;
  const isVerified =
    verificationState === "verified" ||
    verificationState === "not_required";

  // Verification modal
  const {
    isOpen: isVerificationModalOpen,
    open: openVerificationModal,
    close: closeVerificationModal,
    handleSubmit: handleVerificationSubmit,
    handleDismiss: handleVerificationDismiss,
  } = useVerificationModal({
    profileId: activeProfile?.id || "",
    onVerified: () => {
      closeVerificationModal();
      router.refresh();
    },
  });

  const fetchInterviews = useCallback(async (): Promise<InterviewWithProfiles[]> => {
    try {
      const res = await fetch("/api/medjobs/interviews");
      const data = await res.json();
      const list = (data.interviews ?? []) as InterviewWithProfiles[];
      setInterviews(list);
      return list;
    } catch {
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch. If the URL carries ?newInterview=<id> from the claim
  // redirect but that interview isn't visible in the first response (rare
  // replica-lag edge case), retry a few times before giving up on the
  // auto-open so the modal still lands.
  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    (async () => {
      const list = await fetchInterviews();
      if (cancelled || !newInterviewId) return;
      const found = list.some((iv) => iv.id === newInterviewId);
      if (found) return;
      for (let attempt = 0; attempt < 3; attempt++) {
        await new Promise((r) => setTimeout(r, 500));
        if (cancelled) return;
        const retry = await fetchInterviews();
        if (retry.some((iv) => iv.id === newInterviewId)) return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchInterviews, authLoading, newInterviewId]);

  // Once the auto-open has a target to work with, strip the URL param so
  // refresh/back don't re-open the modal.
  const urlCleanedRef = useRef(false);
  useEffect(() => {
    if (urlCleanedRef.current || !newInterviewId) return;
    const match = interviews.find((iv) => iv.id === newInterviewId);
    if (!match) return;
    urlCleanedRef.current = true;
    router.replace("/provider/caregivers", { scroll: false });
  }, [interviews, newInterviewId, router]);

  const updateStatus = async (interviewId: string, status: string) => {
    setActionLoading(interviewId);
    try {
      const res = await fetch("/api/medjobs/interviews", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interviewId, status }),
      });
      if (res.status === 402) {
        setShowUpgradeModal(true);
        return;
      }
      await fetchInterviews();
    } catch { /* ignore */ }
    finally { setActionLoading(null); }
  };

  return (
    <main className="min-h-screen bg-[#FAFAF8]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Interviews</h1>
          <p className="text-sm text-gray-500 mt-1">Track interview requests and scheduled meetings with candidates.</p>
        </div>

        <InterviewCalendar
          interviews={interviews}
          perspective="provider"
          loading={loading || authLoading}
          onUpdateStatus={updateStatus}
          actionLoading={actionLoading}
          accessTier={accessInfo.tier}
          initialSelectedId={newInterviewId ?? undefined}
          isVerified={isVerified}
          onVerifyClick={openVerificationModal}
        />
      </div>

      {showUpgradeModal && (
        <UpgradeModal
          creditsUsed={accessInfo.creditsUsed}
          onClose={() => setShowUpgradeModal(false)}
        />
      )}

      <VerificationMethodModal
        isOpen={isVerificationModalOpen}
        onClose={closeVerificationModal}
        onSubmit={handleVerificationSubmit}
        onDismiss={handleVerificationDismiss}
        businessName={activeProfile?.display_name || "Your Business"}
        profileId={activeProfile?.id}
      />
    </main>
  );
}
