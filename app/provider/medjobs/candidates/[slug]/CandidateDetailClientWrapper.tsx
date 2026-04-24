"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import ProviderContactSection from "./ProviderContactSection";
import VerificationMethodModal from "@/components/provider/VerificationMethodModal";
import { useVerificationModal } from "@/lib/hooks/useVerificationModal";
import type { AccessTier } from "@/lib/medjobs-access";

interface CandidateDetailClientWrapperProps {
  studentId: string;
  studentName: string;
  studentEmail: string | null;
  studentPhone: string | null;
  studentSlug: string;
  variant: "sidebar" | "sticky" | "inline";
  accessTier?: AccessTier;
  creditsUsed?: number;
}

export default function CandidateDetailClientWrapper({
  studentId,
  studentName,
  studentEmail,
  studentPhone,
  studentSlug,
  variant,
  accessTier,
  creditsUsed,
}: CandidateDetailClientWrapperProps) {
  const router = useRouter();
  const { activeProfile, user } = useAuth();
  const [hasExistingInterview, setHasExistingInterview] = useState(false);

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

  // Fetch existing interviews to check if provider already contacted this student
  useEffect(() => {
    if (!user) return;

    const checkExistingInterview = async () => {
      try {
        const res = await fetch("/api/medjobs/interviews");
        if (!res.ok) return;
        const data = await res.json();
        // Check if there's an active interview with this student
        // Exclude cancelled/no_show so provider can re-schedule
        const activeStatuses = ["proposed", "confirmed", "rescheduled", "completed"];
        const hasInterview = (data.interviews || []).some(
          (interview: { student_profile_id: string; proposed_by: string; provider_profile_id: string; status: string }) =>
            interview.student_profile_id === studentId &&
            interview.proposed_by === interview.provider_profile_id &&
            activeStatuses.includes(interview.status)
        );
        setHasExistingInterview(hasInterview);
      } catch {
        // Silently fail
      }
    };

    checkExistingInterview();
  }, [user, studentId]);

  return (
    <>
      <ProviderContactSection
        studentId={studentId}
        studentName={studentName}
        studentEmail={studentEmail}
        studentPhone={studentPhone}
        studentSlug={studentSlug}
        variant={variant}
        initialScheduled={hasExistingInterview}
        accessTier={accessTier}
        creditsUsed={creditsUsed}
        isVerified={isVerified}
        onVerifyClick={openVerificationModal}
      />
      <VerificationMethodModal
        isOpen={isVerificationModalOpen}
        onClose={closeVerificationModal}
        onSubmit={handleVerificationSubmit}
        onDismiss={handleVerificationDismiss}
        businessName={activeProfile?.display_name || "Your Business"}
        profileId={activeProfile?.id}
      />
    </>
  );
}
