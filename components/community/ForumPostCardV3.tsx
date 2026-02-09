"use client";

import { useState } from "react";
import Link from "next/link";
import { ForumPost, CARE_TYPE_CONFIG } from "@/types/forum";

const REPORT_REASONS = [
  { id: "offensive", label: "Offensive or inappropriate" },
  { id: "spam", label: "Spam or misleading" },
  { id: "harassment", label: "Harassment or bullying" },
  { id: "misinformation", label: "Medical misinformation" },
  { id: "other", label: "Other" },
];

interface ForumPostCardV3Props {
  post: ForumPost;
  onClick?: () => void; // For modal integration
  isSelected?: boolean; // For two-panel highlight
  compact?: boolean; // Smaller variant for V3 panel
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diffInSeconds < 60) return "just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function AuthorAvatar({ author, size = "md" }: { author: ForumPost["author"]; size?: "sm" | "md" }) {
  const sizeClasses = size === "sm" ? "w-6 h-6" : "w-9 h-9";
  const iconSize = size === "sm" ? "w-3 h-3" : "w-4 h-4";
  const textSize = size === "sm" ? "text-[10px]" : "text-xs";

  if (author.isAnonymous) {
    return (
      <div className={`${sizeClasses} rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0`}>
        <svg className={`${iconSize} text-gray-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      </div>
    );
  }
  if (author.avatar) {
    return <img src={author.avatar} alt={author.displayName} className={`${sizeClasses} rounded-full object-cover flex-shrink-0`} />;
  }
  const initials = author.displayName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  return (
    <div className={`${sizeClasses} rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0`}>
      <span className={`text-primary-600 font-medium ${textSize}`}>{initials}</span>
    </div>
  );
}

export default function ForumPostCardV3({ post, onClick, isSelected, compact }: ForumPostCardV3Props) {
  const [showMenu, setShowMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const careTypeConfig = CARE_TYPE_CONFIG[post.careType];

  const handleReport = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setShowMenu(false);
    setShowReportModal(true);
  };

  const handleSubmitReport = () => {
    // In production, this would send to an API
    setReportSubmitted(true);
    setTimeout(() => {
      setShowReportModal(false);
      setReportSubmitted(false);
      setSelectedReason(null);
    }, 2000);
  };

  // Compact variant for V3 two-panel list
  if (compact) {
    return (
      <button
        onClick={onClick}
        className={`w-full text-left p-4 border-b border-gray-100 transition-all duration-150 ${
          isSelected
            ? "bg-primary-50 border-l-2 border-l-primary-600"
            : "hover:bg-gray-50 border-l-2 border-l-transparent"
        }`}
      >
        <div className="flex items-start gap-3">
          <AuthorAvatar author={post.author} size="sm" />
          <div className="flex-1 min-w-0">
            <h3 className={`text-sm font-medium truncate ${isSelected ? "text-primary-700" : "text-gray-900"}`}>
              {post.title}
            </h3>
            <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
              <span>{post.author.displayName}</span>
              <span className="text-gray-300">·</span>
              <span>{formatTimeAgo(post.createdAt)}</span>
            </div>
            <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
              {post.likeCount > 0 && (
                <span className="flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                  {post.likeCount}
                </span>
              )}
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                {post.commentCount > 0 ? post.commentCount : "0"}
              </span>
            </div>
          </div>
        </div>
      </button>
    );
  }

  // Full card content
  const cardContent = (
    <article className={`group bg-white rounded-xl border p-6 transition-all duration-200 ${
      isSelected
        ? "border-primary-200 shadow-md ring-1 ring-primary-100"
        : "border-gray-200/60 shadow-sm hover:shadow-lg hover:-translate-y-0.5"
    }`}>
      {/* Header: Author + Care Type + Menu */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <AuthorAvatar author={post.author} />
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-900 font-medium">{post.author.displayName}</span>
            <span className="text-gray-300">·</span>
            <span className="text-gray-500">{formatTimeAgo(post.createdAt)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${careTypeConfig.bgColor} ${careTypeConfig.color}`}>
            {careTypeConfig.label}
          </span>
          {/* Menu button */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setShowMenu(!showMenu);
              }}
              className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" />
              </svg>
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                <button
                  onClick={handleReport}
                  className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
                  </svg>
                  Report
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Title */}
      <h3 className="text-lg font-semibold text-gray-900 group-hover:text-primary-600 transition-colors mb-3 line-clamp-2">
        {post.title}
      </h3>

      {/* Excerpt - LARGER TEXT */}
      <p className="text-base text-gray-600 leading-relaxed line-clamp-3 mb-4">
        {post.excerpt}
      </p>

      {/* Footer: Engagement metrics */}
      <div className="flex items-center gap-5 text-sm text-gray-400 pt-3 border-t border-gray-100">
        {post.likeCount > 0 && (
          <span className="flex items-center gap-1.5 hover:text-gray-600 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
            {post.likeCount}
          </span>
        )}
        {post.commentCount > 0 ? (
          <span className="flex items-center gap-1.5 hover:text-gray-600 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            {post.commentCount} {post.commentCount === 1 ? "reply" : "replies"}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-gray-300">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            No replies yet
          </span>
        )}
        <span className="flex items-center gap-1.5 hover:text-gray-600 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          {post.viewCount}
        </span>
      </div>
    </article>
  );

  // Report Modal
  const reportModal = showReportModal && (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={(e) => {
        e.stopPropagation();
        setShowReportModal(false);
        setSelectedReason(null);
      }}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {reportSubmitted ? (
          <div className="p-6 text-center">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Report Submitted</h3>
            <p className="text-gray-500 text-sm">Thank you for helping keep our community safe.</p>
          </div>
        ) : (
          <>
            <div className="p-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">Report Conversation</h3>
              <p className="text-sm text-gray-500 mt-1">Why are you reporting this?</p>
            </div>
            <div className="p-4 space-y-2">
              {REPORT_REASONS.map((reason) => (
                <button
                  key={reason.id}
                  onClick={() => setSelectedReason(reason.id)}
                  className={`w-full px-4 py-3 text-left text-sm rounded-lg border transition-colors ${
                    selectedReason === reason.id
                      ? "border-primary-500 bg-primary-50 text-primary-700"
                      : "border-gray-200 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {reason.label}
                </button>
              ))}
            </div>
            <div className="p-4 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => {
                  setShowReportModal(false);
                  setSelectedReason(null);
                }}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitReport}
                disabled={!selectedReason}
                className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  selectedReason
                    ? "bg-primary-600 text-white hover:bg-primary-700"
                    : "bg-gray-100 text-gray-400 cursor-not-allowed"
                }`}
              >
                Submit Report
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  // If onClick is provided (modal mode), render as button
  if (onClick) {
    return (
      <>
        <button onClick={onClick} className="w-full text-left">
          {cardContent}
        </button>
        {reportModal}
      </>
    );
  }

  // Default: render as link
  return (
    <>
      <Link href={`/community/post/${post.slug}`}>
        {cardContent}
      </Link>
      {reportModal}
    </>
  );
}
