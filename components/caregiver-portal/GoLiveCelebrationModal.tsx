"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";

interface GoLiveCelebrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  profileSlug: string;
}

export default function GoLiveCelebrationModal({
  isOpen,
  onClose,
  profileSlug,
}: GoLiveCelebrationModalProps) {
  const [showContent, setShowContent] = useState(false);

  // Trigger entrance animation when modal opens
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => setShowContent(true), 100);
      return () => clearTimeout(timer);
    } else {
      setShowContent(false);
    }
  }, [isOpen]);

  const handleViewProfile = () => {
    window.open(`/medjobs/candidates/${profileSlug}`, "_blank", "noopener,noreferrer");
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} hideHeader size="md">
      <div className="text-center py-10 px-6 relative overflow-hidden">
        {/* Decorative background circles */}
        <div className="absolute inset-0 pointer-events-none">
          <div className={`absolute top-4 left-8 w-20 h-20 rounded-full bg-emerald-100/40 transition-all duration-700 ${showContent ? "scale-100 opacity-100" : "scale-0 opacity-0"}`} style={{ transitionDelay: "200ms" }} />
          <div className={`absolute top-12 right-6 w-12 h-12 rounded-full bg-primary-100/40 transition-all duration-700 ${showContent ? "scale-100 opacity-100" : "scale-0 opacity-0"}`} style={{ transitionDelay: "300ms" }} />
          <div className={`absolute bottom-16 left-12 w-8 h-8 rounded-full bg-amber-100/50 transition-all duration-700 ${showContent ? "scale-100 opacity-100" : "scale-0 opacity-0"}`} style={{ transitionDelay: "400ms" }} />
          <div className={`absolute bottom-20 right-16 w-14 h-14 rounded-full bg-emerald-50 transition-all duration-700 ${showContent ? "scale-100 opacity-100" : "scale-0 opacity-0"}`} style={{ transitionDelay: "350ms" }} />
        </div>

        {/* Success Icon with animation */}
        <div className={`relative z-10 transition-all duration-500 ${showContent ? "scale-100 opacity-100 translate-y-0" : "scale-75 opacity-0 translate-y-4"}`}>
          <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-200">
            <svg
              className={`w-12 h-12 text-white transition-all duration-300 ${showContent ? "scale-100" : "scale-0"}`}
              style={{ transitionDelay: "300ms" }}
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
        </div>

        {/* Heading with animation */}
        <h2 className={`relative z-10 text-2xl font-bold text-gray-900 mb-3 transition-all duration-500 ${showContent ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`} style={{ transitionDelay: "150ms" }}>
          You're live!
        </h2>

        {/* Description with animation */}
        <p className={`relative z-10 text-gray-600 mb-8 max-w-sm mx-auto leading-relaxed transition-all duration-500 ${showContent ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`} style={{ transitionDelay: "250ms" }}>
          Providers can now see your profile and will reach out when they have opportunities that match.
        </p>

        {/* Actions with animation */}
        <div className={`relative z-10 space-y-3 transition-all duration-500 ${showContent ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`} style={{ transitionDelay: "350ms" }}>
          <a
            href="/portal/medjobs"
            className="block w-full px-6 py-3.5 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl transition-all hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] text-center"
          >
            View your profile
          </a>
          <button
            onClick={handleViewProfile}
            className="w-full px-6 py-2.5 text-gray-500 hover:text-gray-900 font-medium transition-colors"
          >
            See how providers see you
          </button>
        </div>
      </div>
    </Modal>
  );
}
