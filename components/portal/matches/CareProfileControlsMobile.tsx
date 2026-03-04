"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { BusinessProfile, FamilyMetadata } from "@/lib/types";

const DELETE_REASONS = [
  "Found care",
  "Not ready yet",
  "Too many contacts",
  "Other",
];

interface CareProfileControlsMobileProps {
  activeProfile: BusinessProfile;
  userEmail?: string;
  onPublish: () => Promise<void>;
  onDeactivate: () => Promise<void>;
  onDelete?: (reasons: string[]) => Promise<void>;
  onEditProfile?: () => void;
}

export default function CareProfileControlsMobile({
  activeProfile,
  onPublish,
  onDeactivate,
  onDelete,
  onEditProfile,
}: CareProfileControlsMobileProps) {
  const meta = (activeProfile.metadata || {}) as FamilyMetadata;
  const carePost = meta.care_post;
  const isActive = carePost?.status === "active";

  const [publishing, setPublishing] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [acceptingMatches, setAcceptingMatches] = useState(isActive);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedDeleteReasons, setSelectedDeleteReasons] = useState<string[]>(
    []
  );
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Sync acceptingMatches with external isActive changes
  useEffect(() => {
    setAcceptingMatches(isActive);
  }, [isActive]);

  // Close menu on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [menuOpen]);

  const handlePublishAction = useCallback(async () => {
    setPublishing(true);
    try {
      await onPublish();
    } finally {
      setPublishing(false);
    }
  }, [onPublish]);

  const handleDeactivateAction = useCallback(async () => {
    setDeactivating(true);
    try {
      await onDeactivate();
    } finally {
      setDeactivating(false);
    }
  }, [onDeactivate]);

  const handleToggleAccepting = useCallback(async () => {
    if (acceptingMatches) {
      setAcceptingMatches(false);
      await handleDeactivateAction();
    } else {
      setAcceptingMatches(true);
      await handlePublishAction();
    }
  }, [acceptingMatches, handleDeactivateAction, handlePublishAction]);

  const toggleDeleteReason = (reason: string) => {
    setSelectedDeleteReasons((prev) =>
      prev.includes(reason)
        ? prev.filter((r) => r !== reason)
        : [...prev, reason]
    );
  };

  const handleDeletePost = async () => {
    setDeleting(true);
    try {
      if (onDelete) {
        await onDelete(selectedDeleteReasons);
      } else {
        await onDeactivate();
      }
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
      setSelectedDeleteReasons([]);
    }
  };

  return (
    <>
      {/* Compact control bar */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-warm-100/60 px-4 py-2.5">
        <div className="flex items-center justify-between">
          {/* Left: Status badge + label */}
          <div className="flex items-center gap-2.5">
            {acceptingMatches ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary-50 border border-primary-100/60 text-[10px] font-semibold text-primary-600 uppercase tracking-wide">
                <span className="w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse" />
                Live
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-100/60 text-[10px] font-semibold text-amber-600 uppercase tracking-wide">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                Paused
              </span>
            )}
            <span className="text-[13px] font-medium text-gray-600">Your profile</span>
          </div>

          {/* Right: Toggle + Menu */}
          <div className="flex items-center gap-1.5">
            {/* Toggle */}
            <button
              type="button"
              role="switch"
              aria-checked={acceptingMatches}
              aria-label="Accepting new matches"
              onClick={handleToggleAccepting}
              disabled={deactivating || publishing}
              className={[
                "relative inline-flex h-[26px] w-[46px] shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out disabled:opacity-50",
                acceptingMatches ? "bg-primary-500" : "bg-gray-200",
              ].join(" ")}
            >
              <span
                className={[
                  "pointer-events-none inline-block h-[22px] w-[22px] transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out",
                  acceptingMatches ? "translate-x-5" : "translate-x-0",
                ].join(" ")}
              />
            </button>

            {/* Overflow menu */}
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen(!menuOpen)}
                className="inline-flex items-center justify-center w-9 h-9 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-warm-50/60 active:bg-warm-100/40 transition-colors"
                aria-label="More options"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z"
                  />
                </svg>
              </button>

              {/* Dropdown menu */}
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-48 bg-white rounded-xl border border-gray-200/80 shadow-lg shadow-gray-900/[0.08] py-1.5 z-30">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onEditProfile?.();
                    }}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[14px] font-medium text-gray-700 hover:bg-warm-50/50 transition-colors"
                  >
                    <svg
                      className="w-4 h-4 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      viewBox="0 0 24 24"
                    >
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                    Edit profile
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setShowDeleteConfirm(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[14px] font-medium text-red-600 hover:bg-red-50/50 transition-colors"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                      />
                    </svg>
                    Delete profile
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-[2px]">
          <div
            className="w-full max-w-lg bg-white rounded-t-2xl px-5 pt-6 pb-8 shadow-xl"
            style={{
              animation: "slideUp 0.25s cubic-bezier(0.33,1,0.68,1)",
            }}
          >
            <style jsx>{`
              @keyframes slideUp {
                from {
                  transform: translateY(100%);
                  opacity: 0.8;
                }
                to {
                  transform: translateY(0);
                  opacity: 1;
                }
              }
            `}</style>

            {/* Handle bar */}
            <div className="w-10 h-1 rounded-full bg-gray-200 mx-auto mb-5" />

            <h3 className="text-[17px] font-display font-bold text-gray-900 mb-2">
              Remove your care profile?
            </h3>
            <p className="text-[14px] text-gray-500 leading-relaxed mb-5">
              Providers will no longer be able to find or reach out to you.
              Existing conversations are not affected.
            </p>

            <p className="text-[13px] font-semibold text-gray-600 mb-3">
              Why are you removing it?
            </p>
            <div className="flex flex-wrap gap-2 mb-6">
              {DELETE_REASONS.map((reason) => {
                const isSelected = selectedDeleteReasons.includes(reason);
                return (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => toggleDeleteReason(reason)}
                    className={[
                      "text-[14px] font-medium px-4 py-2.5 min-h-[44px] rounded-full border transition-all duration-150",
                      isSelected
                        ? "border-gray-300 bg-gray-100 text-gray-800"
                        : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50",
                    ].join(" ")}
                  >
                    {reason}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setSelectedDeleteReasons([]);
                }}
                className="flex-1 min-h-[48px] py-3 rounded-xl border border-gray-200 bg-white text-[15px] font-medium text-gray-600 hover:bg-gray-50 active:scale-[0.97] transition-all duration-200"
              >
                Keep profile
              </button>
              <button
                type="button"
                onClick={handleDeletePost}
                disabled={deleting}
                className="flex-1 min-h-[48px] py-3 rounded-xl bg-red-600 text-white text-[15px] font-semibold hover:bg-red-700 active:scale-[0.97] transition-all duration-200 disabled:opacity-50"
              >
                {deleting ? "Removing..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
