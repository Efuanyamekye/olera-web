"use client";

import Image from "next/image";

// ============================================================
// Types
// ============================================================

export type NotificationType = "lead" | "question" | "review";

interface FromProfile {
  display_name: string;
  city?: string | null;
  state?: string | null;
  image_url?: string | null;
}

export interface NotificationData {
  type: NotificationType;
  id: string;
  created_at: string;
  // Lead-specific
  message?: string | null;
  metadata?: {
    care_type?: string;
    auto_intro?: string;
  } | null;
  from_profile?: FromProfile | null;
  // Question-specific
  question?: string;
  asker_name?: string | null;
  // Review-specific
  rating?: number;
  comment?: string;
  reviewer_name?: string;
}

interface NotificationBannerProps {
  data: NotificationData;
  providerName: string;
}

// ============================================================
// Helpers
// ============================================================

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function avatarGradient(name: string): string {
  const gradients = [
    "linear-gradient(135deg, #5fa3a3, #7ab8b8)",
    "linear-gradient(135deg, #417272, #5fa3a3)",
    "linear-gradient(135deg, #4d8a8a, #7ab8b8)",
    "linear-gradient(135deg, #385e5e, #5fa3a3)",
    "linear-gradient(135deg, #5fa3a3, #96c8c8)",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return gradients[Math.abs(hash) % gradients.length];
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

const CARE_TYPE_LABELS: Record<string, string> = {
  home_care: "Home Care",
  home_health: "Home Health",
  assisted_living: "Assisted Living",
  memory_care: "Memory Care",
  nursing_home: "Nursing Home",
  independent_living: "Independent Living",
};

// ============================================================
// Component - Matches ActionCard styling
// ============================================================

export default function NotificationBanner({ data, providerName }: NotificationBannerProps) {
  const { type, created_at } = data;
  const timeAgo = formatTimeAgo(created_at);

  // Get the person's name and image based on notification type
  let personName = "Someone";
  let personImage: string | null = null;
  let location: string | null = null;

  if (type === "lead") {
    personName = data.from_profile?.display_name || "A family";
    personImage = data.from_profile?.image_url || null;
    location = [data.from_profile?.city, data.from_profile?.state].filter(Boolean).join(", ") || null;
  } else if (type === "question") {
    personName = data.asker_name || "Someone";
  } else if (type === "review") {
    personName = data.reviewer_name || "Someone";
  }

  const firstName = personName.split(" ")[0];

  // Config by type - colors for the icon badge
  const config = {
    lead: {
      icon: (
        <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      iconBg: "bg-gradient-to-br from-primary-100 to-primary-50",
      iconBorder: "border-primary-100/60",
      iconShadow: "shadow-primary-500/10",
      badgeBg: "bg-primary-50",
      badgeText: "text-primary-700",
      title: "New lead",
      getMessage: () => {
        const careType = data.metadata?.care_type;
        const intro = data.metadata?.auto_intro;
        if (intro) return `"${intro}"`;
        if (careType) return `Looking for ${CARE_TYPE_LABELS[careType] || careType}`;
        return `${firstName} is interested in your services`;
      },
    },
    question: {
      icon: (
        <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      iconBg: "bg-gradient-to-br from-amber-100 to-amber-50",
      iconBorder: "border-amber-200/60",
      iconShadow: "shadow-amber-500/10",
      badgeBg: "bg-amber-50",
      badgeText: "text-amber-700",
      title: "New question",
      getMessage: () => {
        if (data.question) {
          const truncated = data.question.length > 100 ? data.question.slice(0, 100) + "..." : data.question;
          return `"${truncated}"`;
        }
        return `${firstName} asked about ${providerName}`;
      },
    },
    review: {
      icon: (
        <svg className="w-6 h-6 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
        </svg>
      ),
      iconBg: "bg-gradient-to-br from-violet-100 to-violet-50",
      iconBorder: "border-violet-200/60",
      iconShadow: "shadow-violet-500/10",
      badgeBg: "bg-violet-50",
      badgeText: "text-violet-700",
      title: "New review",
      getMessage: () => {
        if (data.comment) {
          const truncated = data.comment.length > 100 ? data.comment.slice(0, 100) + "..." : data.comment;
          return `"${truncated}"`;
        }
        return `${firstName} left a ${data.rating}-star review`;
      },
    },
  };

  const { icon, iconBg, iconBorder, iconShadow, badgeBg, badgeText, title, getMessage } = config[type];

  // Card styling matches ActionCard
  const cardClass = "relative z-10 bg-white rounded-2xl border-2 border-primary-300 shadow-md shadow-primary-50 p-6 md:p-8";

  return (
    <div className={cardClass} style={{ animation: "card-enter 0.25s ease-out both" }}>
      {/* Centered content like ActionCard */}
      <div className="text-center">
        {/* Icon */}
        <div className={`w-12 h-12 rounded-xl ${iconBg} flex items-center justify-center mx-auto mb-4 shadow-sm ${iconShadow} border ${iconBorder}`}>
          {icon}
        </div>

        {/* Title with badge */}
        <div className="flex items-center justify-center gap-2 mb-2">
          <h3 className="text-xl font-display font-bold text-gray-900">{title}</h3>
          <span className="text-xs text-gray-400">{timeAgo}</span>
        </div>

        {/* Person info */}
        <div className="flex items-center justify-center gap-3 mb-4">
          {personImage ? (
            <Image
              src={personImage}
              alt={personName}
              width={40}
              height={40}
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white"
              style={{ background: avatarGradient(personName) }}
            >
              {getInitials(personName)}
            </div>
          )}
          <div className="text-left">
            <p className="text-base font-semibold text-gray-900">{personName}</p>
            {location && (
              <p className="text-sm text-gray-500">{location}</p>
            )}
          </div>
        </div>

        {/* Message preview */}
        <p className="text-[15px] text-gray-600 leading-relaxed mb-4 max-w-md mx-auto">
          {getMessage()}
        </p>

        {/* Rating stars (for reviews) */}
        {type === "review" && data.rating && (
          <div className="flex items-center justify-center gap-0.5 mb-4">
            {[1, 2, 3, 4, 5].map((star) => (
              <svg
                key={star}
                className={`w-5 h-5 ${star <= data.rating! ? "text-amber-400" : "text-gray-200"}`}
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            ))}
          </div>
        )}

        {/* Care type badge (for leads) */}
        {type === "lead" && data.metadata?.care_type && (
          <div className="flex justify-center mb-4">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${badgeBg} ${badgeText}`}>
              {CARE_TYPE_LABELS[data.metadata.care_type] || data.metadata.care_type}
            </span>
          </div>
        )}

        {/* Divider */}
        <div className="border-t border-gray-100 my-4" />

        {/* CTA message */}
        <p className="text-sm text-gray-500">
          Verify your email below to respond and manage your listing.
        </p>
      </div>
    </div>
  );
}
