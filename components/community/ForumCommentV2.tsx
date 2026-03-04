"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { ForumComment as ForumCommentType } from "@/types/forum";
import { useClickOutside } from "@/hooks/use-click-outside";
import ActionSheet from "@/components/ui/ActionSheet";
import Modal from "@/components/ui/Modal";

const REPORT_REASONS = [
  { id: "offensive", label: "Offensive or inappropriate" },
  { id: "spam", label: "Spam or misleading" },
  { id: "harassment", label: "Harassment or bullying" },
  { id: "misinformation", label: "Medical misinformation" },
  { id: "other", label: "Other" },
];

interface ForumCommentV2Props {
  comment: ForumCommentType;
  isReply?: boolean;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function AuthorAvatar({ author }: { author: ForumCommentType["author"] }) {
  if (author.isAnonymous) {
    return (
      <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      </div>
    );
  }
  if (author.avatar) {
    return <Image src={author.avatar} alt={author.displayName} width={36} height={36} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />;
  }
  const initials = author.displayName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  const colors = [
    "bg-blue-100 text-blue-600",
    "bg-emerald-100 text-emerald-600",
    "bg-purple-100 text-purple-600",
    "bg-amber-100 text-amber-600",
    "bg-rose-100 text-rose-600",
  ];
  const colorIndex = author.displayName.length % colors.length;
  return (
    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${colors[colorIndex]}`}>
      <span className="font-semibold text-sm">{initials}</span>
    </div>
  );
}

export default function ForumCommentV2({ comment, isReply = false }: ForumCommentV2Props) {
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(comment.likeCount);
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [showReplies, setShowReplies] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Close desktop dropdown on outside click
  useClickOutside(menuRef, () => {
    if (!isMobile) setShowMenu(false);
  }, showMenu && !isMobile);

  const handleLike = () => {
    setIsLiked(!isLiked);
    setLikeCount(isLiked ? likeCount - 1 : likeCount + 1);
  };

  const handleReport = () => {
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

  const isLongContent = comment.content.length > 280;
  const displayContent = isLongContent && !isExpanded
    ? comment.content.slice(0, 280) + "..."
    : comment.content;

  const hasReplies = comment.replies && comment.replies.length > 0;

  // Action sheet options for mobile menu
  const menuOptions = [
    {
      label: "Report",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
        </svg>
      ),
      onClick: handleReport,
      destructive: true,
    },
  ];

  return (
    <div className={`py-5 ${isReply ? "pl-12" : ""}`}>
      <div className="flex gap-3">
        <AuthorAvatar author={comment.author} />

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-gray-900 text-sm">{comment.author.displayName}</span>
              <span className="text-xs text-gray-400">{formatDate(comment.createdAt)}</span>
            </div>

            {/* Menu button + dropdown */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="w-11 h-11 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                aria-label="More options"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" />
                </svg>
              </button>

              {/* Desktop: Dropdown menu */}
              {showMenu && !isMobile && (
                <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                  <button
                    onClick={handleReport}
                    className="w-full px-3 py-2 min-h-[44px] text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
                    </svg>
                    Report
                  </button>
                </div>
              )}

              {/* Mobile: Action sheet */}
              <ActionSheet
                isOpen={showMenu && isMobile}
                onClose={() => setShowMenu(false)}
                options={menuOptions}
              />
            </div>
          </div>

          {/* Content */}
          <div className="text-[15px] text-gray-700 leading-relaxed whitespace-pre-wrap mb-3">
            {displayContent}
            {isLongContent && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="text-primary-600 hover:text-primary-700 font-medium ml-1"
              >
                {isExpanded ? "less" : "more"}
              </button>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-4 text-sm">
            {/* Likes */}
            <button
              onClick={handleLike}
              className={`flex items-center gap-1.5 px-2.5 py-1 min-h-[44px] rounded-lg transition-all ${
                isLiked
                  ? "bg-red-50 text-red-600"
                  : "bg-gray-50 text-gray-600 hover:bg-gray-100"
              }`}
            >
              <svg className={`w-4 h-4 ${isLiked ? "scale-110" : ""} transition-transform`} fill={isLiked ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
              {likeCount > 0 && <span className="font-medium">{likeCount}</span>}
            </button>

            {/* Toggle replies */}
            {hasReplies && (
              <button
                onClick={() => setShowReplies(!showReplies)}
                className="min-h-[44px] px-2 -mx-2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                {showReplies ? "Hide replies" : `Show ${comment.replies!.length} replies`}
              </button>
            )}

            {/* Reply */}
            {!isReply && (
              <button
                onClick={() => setShowReplyForm(!showReplyForm)}
                className="min-h-[44px] px-2 -mx-2 text-gray-400 hover:text-gray-600 transition-colors font-medium"
              >
                Reply
              </button>
            )}
          </div>

          {/* Reply Form */}
          {showReplyForm && (
            <div className="mt-4 flex gap-3">
              <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                <span className="text-primary-600 font-medium text-xs">Y</span>
              </div>
              <div className="flex-1">
                <textarea
                  placeholder="Write a reply..."
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-base resize-none focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
                  rows={2}
                />
                <div className="flex justify-end gap-2 mt-2">
                  <button
                    onClick={() => setShowReplyForm(false)}
                    className="px-3 py-1.5 min-h-[44px] text-sm text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button className="px-4 py-1.5 min-h-[44px] text-sm bg-primary-600 text-white rounded-full hover:bg-primary-700 transition-colors">
                    Reply
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Nested Replies */}
          {hasReplies && showReplies && (
            <div className="mt-4 space-y-0 divide-y divide-gray-100 border-l-2 border-gray-100 -ml-6 pl-6">
              {comment.replies!.map((reply) => (
                <ForumCommentV2 key={reply.id} comment={reply} isReply />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Report Modal - Modal component handles both desktop (centered) and mobile (bottom sheet) */}
      <Modal
        isOpen={showReportModal}
        onClose={() => {
          setShowReportModal(false);
          setSelectedReason(null);
        }}
        title={reportSubmitted ? undefined : "Report Comment"}
        size="sm"
        footer={
          !reportSubmitted ? (
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowReportModal(false);
                  setSelectedReason(null);
                }}
                className="flex-1 px-4 py-3 min-h-[48px] text-text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitReport}
                disabled={!selectedReason}
                className={`flex-1 px-4 py-3 min-h-[48px] text-text-sm font-medium rounded-xl transition-colors ${
                  selectedReason
                    ? "bg-primary-600 text-white hover:bg-primary-700"
                    : "bg-gray-100 text-gray-400 cursor-not-allowed"
                }`}
              >
                Submit Report
              </button>
            </div>
          ) : undefined
        }
      >
        {reportSubmitted ? (
          <div className="py-8 text-center">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="font-display text-display-xs font-medium text-gray-900 mb-2">Report Submitted</h3>
            <p className="text-text-sm text-gray-500">Thank you for helping keep our community safe.</p>
          </div>
        ) : (
          <>
            <p className="text-text-sm text-gray-500 mb-4">Why are you reporting this comment?</p>
            <div className="space-y-2">
              {REPORT_REASONS.map((reason) => (
                <button
                  key={reason.id}
                  onClick={() => setSelectedReason(reason.id)}
                  className={`w-full px-4 py-3.5 min-h-[48px] text-left text-text-sm rounded-xl border-2 transition-colors ${
                    selectedReason === reason.id
                      ? "border-primary-500 bg-primary-50 text-primary-700 font-medium"
                      : "border-gray-200 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {reason.label}
                </button>
              ))}
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
