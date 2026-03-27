"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
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

// ── Helpers ──

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function avatarGradient(name: string): string {
  const gradients = [
    "linear-gradient(135deg, #7fbfb5, #5a9e94)", // teal/mint
    "linear-gradient(135deg, #9683b5, #7c6a9a)", // purple/violet
    "linear-gradient(135deg, #7a8fa8, #5d7490)", // slate/blue
    "linear-gradient(135deg, #b59683, #9a7c6a)", // terracotta
    "linear-gradient(135deg, #a89683, #8a7a68)", // warm brown
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return gradients[Math.abs(hash) % gradients.length];
}

// Timeline badge configuration
const TIMELINE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; dot: string }> = {
  as_soon_as_possible: { label: "Immediate", color: "text-red-600", bg: "bg-red-50", border: "border-red-200", dot: "bg-red-500" },
  within_a_month: { label: "Within a month", color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200", dot: "bg-amber-500" },
  in_a_few_months: { label: "In a few months", color: "text-teal-600", bg: "bg-teal-50", border: "border-teal-200", dot: "bg-teal-500" },
  just_researching: { label: "Just researching", color: "text-gray-600", bg: "bg-gray-100", border: "border-gray-300", dot: "bg-gray-500" },
  // Legacy values
  immediate: { label: "Immediate", color: "text-red-600", bg: "bg-red-50", border: "border-red-200", dot: "bg-red-500" },
  within_1_month: { label: "Within a month", color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200", dot: "bg-amber-500" },
  within_3_months: { label: "In a few months", color: "text-teal-600", bg: "bg-teal-50", border: "border-teal-200", dot: "bg-teal-500" },
  exploring: { label: "Just researching", color: "text-gray-600", bg: "bg-gray-100", border: "border-gray-300", dot: "bg-gray-500" },
};

// Tone chip options
type ToneType = "introduce" | "ask_needs" | "invite_visit";

const TONE_CHIPS_FULL: { id: ToneType; label: string }[] = [
  { id: "introduce", label: "Introduce ourselves" },
  { id: "ask_needs", label: "Ask about their needs" },
  { id: "invite_visit", label: "Invite to visit" },
];

const TONE_CHIPS_MINIMAL: { id: ToneType; label: string }[] = [
  { id: "introduce", label: "Warm intro" },
  { id: "ask_needs", label: "Ask about their needs" },
];

// Calculate profile completeness
function calculateCompleteness(family: Profile, meta: FamilyMetadata | null): number {
  if (meta?.profile_completeness !== undefined) {
    return meta.profile_completeness;
  }

  let score = 0;
  if (family.display_name?.trim()) score += 15;
  if (family.city?.trim()) score += 10;
  if (meta?.care_needs && meta.care_needs.length > 0) score += 20;
  if (meta?.timeline) score += 15;
  if (meta?.payment_methods && meta.payment_methods.length > 0) score += 15;
  if (meta?.who_needs_care || meta?.relationship_to_recipient) score += 10;
  if (meta?.about_situation?.trim()) score += 15;

  return Math.min(100, score);
}

// Generate default message based on profile state and tone
function getDefaultMessage(
  firstName: string,
  careTypes: string[],
  profileState: "full" | "partial" | "minimal",
  providerName: string,
  tone: ToneType = "introduce"
): string {
  const careList = careTypes.length > 0 ? careTypes.slice(0, 2).join(" and ") : "";

  // INTRODUCE tone
  if (tone === "introduce") {
    if (profileState === "full" && careList) {
      return `Hi ${firstName},

I came across your care profile and noticed you're looking for ${careList}. Our team specializes in exactly this and I'd love to help.

Would you be available for a quick call to discuss your needs?

Best regards,
${providerName}`;
    }
    if (profileState === "partial") {
      return `Hi ${firstName},

I came across your profile and wanted to introduce myself. We're a local care provider and I'd love to learn more about what you're looking for.

Feel free to reach out whenever you're ready — no pressure at all.

Best regards,
${providerName}`;
    }
    // Minimal
    return `Hi ${firstName},

I wanted to reach out and introduce myself. We're here to help whenever you're ready — no pressure at all.

Feel free to reach out with any questions.

Best regards,
${providerName}`;
  }

  // ASK NEEDS tone
  if (tone === "ask_needs") {
    if (profileState === "full" && careList) {
      return `Hi ${firstName},

I saw you're exploring ${careList} options. I'd love to understand more about your situation — every family's needs are unique.

What matters most to you in a care provider? I'm happy to answer any questions you might have.

Best regards,
${providerName}`;
    }
    if (profileState === "partial") {
      return `Hi ${firstName},

I'd love to learn more about what you're looking for. Every family's situation is different, and understanding your specific needs helps us figure out if we're the right fit.

What's most important to you right now?

Best regards,
${providerName}`;
    }
    // Minimal
    return `Hi ${firstName},

I'd love to learn more about your situation when you're ready to share. Every family's needs are different, and I'm here to listen.

What questions can I help answer?

Best regards,
${providerName}`;
  }

  // INVITE VISIT tone
  if (profileState === "full" && careList) {
    return `Hi ${firstName},

I'd love to invite you to visit us and see our ${careList} services firsthand. There's no substitute for experiencing the environment in person.

Would you be interested in scheduling a tour? We can work around your schedule.

Best regards,
${providerName}`;
  }
  if (profileState === "partial") {
    return `Hi ${firstName},

If you're exploring care options, I'd love to invite you to visit us. Seeing the space and meeting our team in person can really help with such an important decision.

No pressure — just let me know if you'd like to schedule a tour.

Best regards,
${providerName}`;
  }
  // Minimal
  return `Hi ${firstName},

When you're ready, I'd love to invite you to visit us. Sometimes seeing a place in person makes all the difference.

No pressure at all — just reach out if you'd like to schedule a tour.

Best regards,
${providerName}`;
}

export default function ReachOutDrawer({
  family,
  isOpen,
  onClose,
  onSend,
  defaultMessage = "",
  providerProfile,
  sending = false,
  sendError,
}: ReachOutDrawerProps) {
  const [message, setMessage] = useState("");
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [activeTone, setActiveTone] = useState<ToneType>("introduce");
  const [isGenerating, setIsGenerating] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Extract family data
  const meta = family ? (family.metadata as FamilyMetadata) : null;
  const displayName = family?.display_name || "Family";
  const firstName = displayName.split(" ")[0];
  const initials = getInitials(displayName);
  const location = family ? [family.city, family.state].filter(Boolean).join(", ") : "";
  const careNeeds = meta?.care_needs || family?.care_types || [];
  const timeline = meta?.timeline ? TIMELINE_CONFIG[meta.timeline] : null;
  const familyQuote = meta?.about_situation;

  // Calculate profile state
  const completeness = family ? calculateCompleteness(family, meta) : 0;
  const profileState: "full" | "partial" | "minimal" =
    completeness >= 70 ? "full" :
    completeness >= 30 ? "partial" : "minimal";

  // Provider data
  const providerName = providerProfile?.display_name || "Your Business";
  const providerInitials = providerProfile ? getInitials(providerName) : "?";
  const providerLocation = providerProfile
    ? [providerProfile.city, providerProfile.state].filter(Boolean).join(", ")
    : "";

  // Tone chips based on profile state
  const toneChips = profileState === "minimal" ? TONE_CHIPS_MINIMAL : TONE_CHIPS_FULL;

  // Generate AI message
  const generateMessage = useCallback(async (tone: ToneType) => {
    if (!family || !providerProfile) return;

    setIsGenerating(true);

    try {
      const response = await fetch("/api/matches/generate-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyFirstName: firstName,
          careTypes: careNeeds,
          timeline: meta?.timeline,
          whoNeedsCare: meta?.who_needs_care,
          tone,
          providerName,
          providerLocation,
          profileState,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.message) {
          setMessage(data.message);
        }
      } else {
        // Fallback to default template if API fails
        setMessage(getDefaultMessage(firstName, careNeeds, profileState, providerName, tone));
      }
    } catch {
      // Fallback to default template
      setMessage(getDefaultMessage(firstName, careNeeds, profileState, providerName, tone));
    } finally {
      setIsGenerating(false);
    }
  }, [family, providerProfile, firstName, careNeeds, meta?.timeline, meta?.who_needs_care, providerName, providerLocation, profileState]);

  // Initialize message when drawer opens
  useEffect(() => {
    if (isOpen && family) {
      setSaveAsDefault(false);
      setActiveTone("introduce");

      // If there's a saved default message, use it
      if (defaultMessage) {
        setMessage(defaultMessage);
        setIsGenerating(false);
      } else {
        // Generate AI message
        setMessage(""); // Show skeleton while loading
        generateMessage("introduce");
      }

      // Focus textarea after animation
      setTimeout(() => textareaRef.current?.focus(), 350);
    }
  }, [isOpen, family, defaultMessage, generateMessage]);

  // Handle tone chip click
  const handleToneClick = (tone: ToneType) => {
    setActiveTone(tone);
    generateMessage(tone);
  };

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
    await onSend(family.id, message.trim(), saveAsDefault);
  };

  if (!family) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        className={`fixed z-50 bg-white shadow-2xl flex flex-col will-change-transform transition-transform duration-300 ease-out
          inset-x-0 bottom-0 max-h-[92dvh] rounded-t-3xl pb-[env(safe-area-inset-bottom)]
          lg:inset-y-0 lg:top-16 lg:right-0 lg:left-auto lg:bottom-auto lg:w-[640px] lg:max-w-[calc(100vw-24px)] lg:h-[calc(100dvh-64px)] lg:max-h-none lg:rounded-none lg:rounded-l-2xl lg:pb-0
          ${isOpen ? "translate-y-0 lg:translate-x-0" : "translate-y-full lg:translate-y-0 lg:translate-x-full"}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
      >
        {/* Mobile drag handle */}
        <div className="lg:hidden pt-3 pb-1 flex justify-center shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="shrink-0 px-5 lg:px-6 pt-2 lg:pt-5 pb-4 border-b border-gray-100 relative">
          {/* Close button - positioned relative to header */}
          <button
            onClick={onClose}
            className="absolute top-2 right-4 lg:top-5 lg:right-5 w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors z-10"
            aria-label="Close drawer"
          >
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Avatar + Title */}
          <div className="flex items-start gap-3 pr-10 pt-1 lg:pt-0">
            {family.image_url ? (
              <Image
                src={family.image_url}
                alt={displayName}
                width={44}
                height={44}
                className="w-11 h-11 rounded-[11px] object-cover shrink-0"
              />
            ) : (
              <div
                className="w-11 h-11 rounded-[11px] flex items-center justify-center text-sm font-semibold text-white shrink-0"
                style={{ background: avatarGradient(displayName) }}
              >
                {initials}
              </div>
            )}
            <div className="min-w-0">
              <h2 id="drawer-title" className="text-[15px] font-medium text-gray-900">
                Reach out to {firstName}
              </h2>
              {location && (
                <p className="text-xs text-gray-500 mt-0.5">{location}</p>
              )}
            </div>
          </div>

          {/* Timeline badge + Care type tags */}
          {(timeline || (profileState !== "minimal" && careNeeds.length > 0)) && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {timeline && (
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${timeline.border} ${timeline.color} ${timeline.bg}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${timeline.dot}`} />
                  {timeline.label}
                </span>
              )}
              {profileState !== "minimal" && careNeeds.slice(0, 3).map((need) => (
                <span
                  key={need}
                  className="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 border border-gray-200/60 text-gray-600"
                >
                  {need}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Family Quote Block (Full/Partial with note) OR Guidance Note (Minimal) */}
          {profileState === "minimal" ? (
            <div className="mx-5 lg:mx-6 mt-5 px-4 py-3 bg-amber-50/60 border-l-2 border-amber-300 rounded-r-lg">
              <p className="text-sm text-amber-800/90 leading-relaxed">
                This family is just getting started. A warm, no-pressure introduction works best here.
              </p>
            </div>
          ) : familyQuote ? (
            <div className="mx-5 lg:mx-6 mt-5 px-4 py-3 bg-gray-50 border-l-2 border-gray-300 rounded-r-lg">
              <p className="text-sm text-gray-600 italic leading-relaxed">
                &ldquo;{familyQuote}&rdquo;
              </p>
            </div>
          ) : null}

          {/* Tone Chips */}
          <div className="mt-5">
            <p className="text-xs font-medium text-gray-500 mb-2.5 px-5 lg:px-6">Start with a tone:</p>
            <div className="flex gap-2 overflow-x-auto px-5 lg:px-6 pb-1 scrollbar-hide">
              {toneChips.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => handleToneClick(chip.id)}
                  disabled={isGenerating}
                  className={`px-3.5 py-2 text-sm font-medium rounded-full border transition-all whitespace-nowrap shrink-0 ${
                    activeTone === chip.id
                      ? "bg-teal-50 border-[#2a7a6e] text-[#2a7a6e]"
                      : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                  } disabled:opacity-50`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          {/* Message Textarea */}
          <div className="px-5 lg:px-6 mt-5">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Your message
            </label>
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={isGenerating}
                rows={6}
                className={`w-full px-4 py-3.5 text-[15px] leading-relaxed bg-white border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-[#2a7a6e]/40 focus:border-[#2a7a6e] transition-all placeholder:text-gray-400 ${
                  isGenerating ? "opacity-50 animate-pulse" : ""
                }`}
                placeholder={`Hi ${firstName}! I'd love to help with your care needs...`}
              />
              {isGenerating && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-white/90 rounded-lg shadow-sm">
                    <svg className="w-4 h-4 animate-spin text-[#2a7a6e]" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span className="text-xs text-gray-500">Generating...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Save as default checkbox */}
            <label className="inline-flex items-center gap-2.5 mt-4 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={saveAsDefault}
                onChange={(e) => setSaveAsDefault(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-[#2a7a6e] focus:ring-[#2a7a6e]/30 focus:ring-offset-0"
              />
              <span className="text-[13px] text-gray-500">Save as my default message</span>
            </label>
          </div>

          {/* Divider */}
          <div className="mx-5 lg:mx-6 my-5 border-t border-gray-100" />

          {/* "[Name] will see" Section */}
          <div className="px-5 lg:px-6 pb-5">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">
              {firstName} will see
            </p>
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
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
              <Link
                href="/provider/profile"
                className="text-xs font-medium text-[#2a7a6e] hover:text-[#1f5c54] transition-colors shrink-0"
              >
                Your profile
              </Link>
            </div>
          </div>
        </div>

        {/* Footer (sticky) */}
        <div className="shrink-0 border-t border-gray-100 px-5 lg:px-6 pt-4 pb-4 lg:pb-4 bg-white">
          {sendError && (
            <div className="mb-3 px-3 py-2 bg-rose-50 border border-rose-100 rounded-lg">
              <p className="text-sm text-rose-600">{sendError}</p>
            </div>
          )}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={!message.trim() || sending || isGenerating}
              className="flex-[2] px-4 py-3.5 bg-[#2a7a6e] text-white text-sm font-semibold rounded-xl hover:bg-[#236860] active:bg-[#1f5c54] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
          <p className="text-[11px] text-center text-gray-400 mt-3">
            {firstName} can view your profile once you reach out
          </p>
        </div>
      </div>
    </>
  );
}
