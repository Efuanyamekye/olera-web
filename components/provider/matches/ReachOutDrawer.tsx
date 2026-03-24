"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import type { Profile, FamilyMetadata } from "@/lib/types";

interface ReachOutDrawerProps {
  family: Profile | null;
  isOpen: boolean;
  onClose: () => void;
  onSend: (familyId: string, message: string, saveAsDefault: boolean) => Promise<void>;
  defaultMessage?: string;
  providerProfile?: Profile | null;
  providerCareTypes?: string[];
  providerPaymentMethods?: string[];
  sending?: boolean;
  sendError?: string | null;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function avatarGradient(name: string): string {
  // Warm/purple tones to avoid green overload on the page
  const gradients = [
    "linear-gradient(135deg, #8b7355, #a08060)", // warm brown
    "linear-gradient(135deg, #7c6a9a, #9683b5)", // soft purple
    "linear-gradient(135deg, #6b7c8a, #8a9ba8)", // slate blue
    "linear-gradient(135deg, #9a7c6a, #b59683)", // terracotta
    "linear-gradient(135deg, #7a6b8a, #968bb5)", // lavender
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return gradients[Math.abs(hash) % gradients.length];
}

const TIMELINE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; dot: string }> = {
  immediate: { label: "Immediate", color: "text-red-600", bg: "bg-red-50", border: "border-red-200", dot: "bg-red-500" },
  within_1_month: { label: "Within 1 month", color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200", dot: "bg-amber-500" },
  within_3_months: { label: "Within 3 months", color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200", dot: "bg-blue-500" },
  exploring: { label: "Exploring", color: "text-gray-500", bg: "bg-gray-50", border: "border-gray-200", dot: "bg-gray-400" },
};

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959; // miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function estimateDriveTime(miles: number): string {
  const minutes = Math.round(miles / 0.5);
  if (minutes < 1) return "1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem > 0 ? `${hours}h ${rem}m` : `${hours}h`;
}

export default function ReachOutDrawer({
  family,
  isOpen,
  onClose,
  onSend,
  defaultMessage = "",
  providerProfile,
  providerCareTypes = [],
  providerPaymentMethods = [],
  sending = false,
  sendError,
}: ReachOutDrawerProps) {
  const [message, setMessage] = useState(defaultMessage);
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [success, setSuccess] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset state when drawer opens/closes or family changes
  useEffect(() => {
    if (isOpen && family) {
      const firstName = family.display_name?.split(" ")[0] || "there";
      const template = defaultMessage || `Hi ${firstName}!\n\nI came across your care profile and I'd love to help. Our team specializes in providing compassionate, personalized care.\n\nI'd be happy to discuss your needs and answer any questions. Would you be available for a quick call?\n\nBest regards`;
      setMessage(template);
      setSaveAsDefault(false);
      setSuccess(false);
      // Focus textarea after drawer animation
      setTimeout(() => textareaRef.current?.focus(), 300);
    }
  }, [isOpen, family, defaultMessage]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const handleSend = async () => {
    if (!family || !message.trim() || sending) return;
    try {
      await onSend(family.id, message.trim(), saveAsDefault);
      setSuccess(true);
    } catch {
      // Error handled by parent
    }
  };

  if (!family) return null;

  const meta = family.metadata as FamilyMetadata;
  const displayName = family.display_name || "Family";
  const firstName = displayName.split(" ")[0];
  const initials = getInitials(displayName);
  const location = [family.city, family.state].filter(Boolean).join(", ");
  const careNeeds = meta?.care_needs || family.care_types || [];
  const paymentMethods = meta?.payment_methods || [];
  const timeline = meta?.timeline ? TIMELINE_CONFIG[meta.timeline] : null;
  const aboutSituation = meta?.about_situation || family.description;

  // Calculate match reasons for the drawer
  const matchReasons: { icon: string; text: string }[] = [];

  // Service match
  const matchingServices = careNeeds.filter((need) =>
    providerCareTypes.some((service) => service.toLowerCase() === need.toLowerCase())
  );
  if (matchingServices.length > 0) {
    matchReasons.push({
      icon: "services",
      text: matchingServices.length === 1
        ? `Looking for ${matchingServices[0]}`
        : `Looking for ${matchingServices.length} services you offer`,
    });
  }

  // Distance
  const providerLat = providerProfile?.lat;
  const providerLng = providerProfile?.lng;
  if (providerLat && providerLng && family.lat && family.lng) {
    const distance = haversineDistance(providerLat, providerLng, family.lat, family.lng);
    const driveTime = estimateDriveTime(distance);
    matchReasons.push({
      icon: "location",
      text: `${driveTime} drive from you`,
    });
  }

  // Payment match
  const matchingPayments = paymentMethods.filter((method) =>
    providerPaymentMethods.some((pm) => pm.toLowerCase() === method.toLowerCase())
  );
  if (matchingPayments.length > 0) {
    matchReasons.push({
      icon: "payment",
      text: `Pays with ${matchingPayments[0]} — you accept`,
    });
  }

  // Provider preview
  const providerName = providerProfile?.display_name || "Your profile";
  const providerInitials = providerProfile ? getInitials(providerName) : "?";
  const providerLocation = providerProfile
    ? [providerProfile.city, providerProfile.state].filter(Boolean).join(", ")
    : "";

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Drawer - bottom sheet on mobile, side drawer on desktop */}
      <div
        className={`fixed z-50 bg-white shadow-2xl flex flex-col will-change-transform transition-transform duration-300 ease-out
          inset-x-0 bottom-0 max-h-[92dvh] rounded-t-3xl pb-[env(safe-area-inset-bottom)]
          lg:inset-y-0 lg:top-16 lg:right-0 lg:left-auto lg:bottom-auto lg:w-[540px] lg:max-w-[calc(100vw-24px)] lg:h-[calc(100dvh-64px)] lg:max-h-none lg:rounded-none lg:rounded-l-2xl lg:pb-0
          ${isOpen ? "translate-y-0 lg:translate-x-0" : "translate-y-full lg:translate-y-0 lg:translate-x-full"}`}
      >
        {/* Mobile drag handle */}
        <div className="lg:hidden pt-3 pb-2 flex justify-center shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Success State */}
        {success ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-primary-50 flex items-center justify-center mb-5">
              <svg className="w-8 h-8 text-primary-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>
            <h3 className="text-xl font-display font-bold text-gray-900 mb-2">
              Message sent!
            </h3>
            <p className="text-sm text-gray-500 leading-relaxed max-w-[280px] mb-6">
              {firstName} will see your profile and message. You&apos;ll be notified when they respond.
            </p>
            <button
              onClick={onClose}
              className="px-6 py-3 bg-primary-600 text-white text-sm font-semibold rounded-xl hover:bg-primary-700 transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="shrink-0 border-b border-gray-100 px-5 lg:px-6 py-4 lg:py-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-sm font-bold text-white shadow-sm"
                    style={{ background: avatarGradient(displayName) }}
                  >
                    {initials}
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">
                      Reach out to {firstName}
                    </h2>
                    {location && (
                      <p className="text-sm text-gray-500">{location}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="w-10 h-10 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors"
                >
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto">
              {/* Family Summary */}
              <div className="px-5 lg:px-6 py-4 bg-warm-50/50 border-b border-warm-100/60">
                {/* Timeline + Care Needs badges */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {timeline && (
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${timeline.border} ${timeline.color} ${timeline.bg}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${timeline.dot} animate-pulse`} />
                      {timeline.label}
                    </span>
                  )}
                  {careNeeds.slice(0, 3).map((need) => (
                    <span
                      key={need}
                      className="text-xs font-medium px-2.5 py-1 rounded-full bg-white border border-gray-200 text-gray-600"
                    >
                      {need}
                    </span>
                  ))}
                  {careNeeds.length > 3 && (
                    <span className="text-xs text-gray-400 self-center">
                      +{careNeeds.length - 3} more
                    </span>
                  )}
                </div>

                {/* Match details */}
                {matchReasons.length > 0 && (
                  <div className="space-y-1.5 mb-3">
                    {matchReasons.slice(0, 3).map((reason, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                          {reason.icon === "services" && (
                            <svg className="w-2.5 h-2.5 text-primary-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                            </svg>
                          )}
                          {reason.icon === "location" && (
                            <svg className="w-2.5 h-2.5 text-primary-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                            </svg>
                          )}
                          {reason.icon === "payment" && (
                            <svg className="w-2.5 h-2.5 text-primary-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3" />
                            </svg>
                          )}
                        </div>
                        <p className="text-xs text-gray-600">{reason.text}</p>
                      </div>
                    ))}
                  </div>
                )}

                {aboutSituation && (
                  <p className="text-sm text-gray-600 leading-relaxed line-clamp-3">
                    &ldquo;{aboutSituation}&rdquo;
                  </p>
                )}
              </div>

              {/* Message Composer */}
              <div className="px-5 lg:px-6 py-5">
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Your message
                </label>
                <textarea
                  ref={textareaRef}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={8}
                  className="w-full px-4 py-3.5 text-[15px] bg-gray-50 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent focus:bg-white transition-colors placeholder:text-gray-400"
                  placeholder={`Hi ${firstName}! I'd love to help with your care needs...`}
                />

                {/* Save as default checkbox */}
                <label className="flex items-center gap-2.5 mt-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={saveAsDefault}
                    onChange={(e) => setSaveAsDefault(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-600">Save as my default message</span>
                </label>
              </div>

              {/* What they'll see */}
              <div className="px-5 lg:px-6 py-4 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  {firstName} will see
                </p>
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                  {providerProfile?.image_url ? (
                    <Image
                      src={providerProfile.image_url}
                      alt={providerName}
                      width={40}
                      height={40}
                      className="w-10 h-10 rounded-lg object-cover"
                    />
                  ) : (
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold text-white"
                      style={{ background: avatarGradient(providerName) }}
                    >
                      {providerInitials}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{providerName}</p>
                    {providerLocation && (
                      <p className="text-xs text-gray-500 truncate">{providerLocation}</p>
                    )}
                  </div>
                  <span className="text-xs text-primary-600 font-medium shrink-0">Your profile</span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="shrink-0 border-t border-gray-100 px-5 lg:px-6 py-4 bg-white">
              {sendError && (
                <div className="mb-3 px-3 py-2 bg-rose-50 border border-rose-100 rounded-lg">
                  <p className="text-sm text-rose-600">{sendError}</p>
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-3 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSend}
                  disabled={!message.trim() || sending}
                  className="flex-1 px-4 py-3 bg-gradient-to-b from-primary-500 to-primary-600 text-white text-sm font-semibold rounded-xl hover:from-primary-600 hover:to-primary-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
                >
                  {sending ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Sending...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                      </svg>
                      Send message
                    </>
                  )}
                </button>
              </div>
              <p className="text-xs text-center text-gray-400 mt-3">
                {firstName} can view your profile once you reach out
              </p>
            </div>
          </>
        )}
      </div>
    </>
  );
}
