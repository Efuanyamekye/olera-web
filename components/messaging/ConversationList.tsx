"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useClickOutside } from "@/hooks/use-click-outside";
import Image from "next/image";
import Link from "next/link";
import type { Connection, Profile } from "@/lib/types";

export interface ConnectionWithProfile extends Connection {
  fromProfile: Profile | null;
  toProfile: Profile | null;
}

type RoleFilter = "all" | "family" | "provider";

export type FamilyTab = "messages" | "requests";

interface ConversationListProps {
  connections: ConnectionWithProfile[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  loading: boolean;
  activeProfileId: string;
  onReportConnection?: (id: string) => void;
  onArchiveConnection?: (id: string) => void;
  onUnarchiveConnection?: (id: string) => void;
  onDeleteConnection?: (id: string) => void;
  onLoadArchived?: () => void;
  archivedCount?: number;
  className?: string;
  /** "family" (default) or "provider" — controls empty state copy */
  variant?: "family" | "provider";
  /** Role filter for dual-account users: "all", "family", or "provider" */
  roleFilter?: RoleFilter;
  /** Callback when role filter changes */
  onRoleFilterChange?: (filter: RoleFilter) => void;
  /** Set of provider profile IDs (used for filtering) */
  providerProfileIds?: Set<string>;
  /** Whether to show role filter pills (only for dual-account users) */
  showRoleFilters?: boolean;
  /** Whether user's care profile is live (for Requests empty state) */
  isProfileLive?: boolean;
  /** Family profile ID (used to determine message direction) */
  familyProfileId?: string;
  /** Current family tab (messages or requests) - controlled by parent */
  familyTab?: FamilyTab;
  /** Callback when family tab changes */
  onFamilyTabChange?: (tab: FamilyTab) => void;
  /** Callback for manual refresh */
  onRefresh?: () => void;
  /** Whether a refresh is currently in progress */
  refreshing?: boolean;
}

/** Deterministic gradient for fallback avatars */
function avatarGradient(name: string): string {
  const gradients = [
    "linear-gradient(135deg, #0ea5e9, #6366f1)",
    "linear-gradient(135deg, #14b8a6, #0ea5e9)",
    "linear-gradient(135deg, #8b5cf6, #ec4899)",
    "linear-gradient(135deg, #f59e0b, #ef4444)",
    "linear-gradient(135deg, #10b981, #14b8a6)",
    "linear-gradient(135deg, #6366f1, #a855f7)",
    "linear-gradient(135deg, #ec4899, #f43f5e)",
    "linear-gradient(135deg, #0891b2, #2dd4bf)",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return gradients[Math.abs(hash) % gradients.length];
}

interface ThreadMessage {
  from_profile_id: string;
  text: string;
  created_at: string;
  type?: string;
}

function getCareType(connection: ConnectionWithProfile): string | null {
  if (!connection.message) return null;
  try {
    const parsed = JSON.parse(connection.message);
    if (parsed.care_type) {
      return String(parsed.care_type)
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c: string) => c.toUpperCase());
    }
  } catch {
    // ignore
  }
  return null;
}

function getLastMessage(connection: ConnectionWithProfile): { text: string; timestamp: string } | null {
  const meta = connection.metadata as Record<string, unknown> | undefined;
  const thread = (meta?.thread as ThreadMessage[]) || [];

  if (thread.length > 0) {
    const last = thread[thread.length - 1];
    return {
      text: last.type === "system" ? last.text : last.text,
      timestamp: last.created_at,
    };
  }

  // Fall back to auto-intro message
  const autoIntro = meta?.auto_intro as string | undefined;
  if (autoIntro) {
    return { text: autoIntro, timestamp: connection.created_at };
  }

  // Fall back to initial message notes
  if (connection.message) {
    try {
      const parsed = JSON.parse(connection.message);
      if (parsed.additional_notes) {
        return { text: parsed.additional_notes, timestamp: connection.created_at };
      }
      if (parsed.care_type) {
        const ct = String(parsed.care_type).replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
        return { text: `Looking for ${ct}`, timestamp: connection.created_at };
      }
    } catch {
      // ignore
    }
  }

  return { text: "New connection", timestamp: connection.created_at };
}

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHr < 24) return `${diffHr}h`;
  if (diffDay < 7) return `${diffDay}d`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const PAST_STATUSES = ["archived"];

function getActiveConnections(connections: ConnectionWithProfile[]): ConnectionWithProfile[] {
  return connections.filter((c) => !PAST_STATUSES.includes(c.status));
}

function getPastConnections(connections: ConnectionWithProfile[]): ConnectionWithProfile[] {
  return connections.filter((c) => PAST_STATUSES.includes(c.status));
}

function searchConnections(connections: ConnectionWithProfile[], query: string, activeProfileId: string): ConnectionWithProfile[] {
  const q = query.toLowerCase().trim();
  if (!q) return connections;
  return connections.filter((conn) => {
    const isInbound = conn.to_profile_id === activeProfileId;
    const otherProfile = isInbound ? conn.fromProfile : conn.toProfile;
    const name = otherProfile?.display_name || "";
    return name.toLowerCase().includes(q);
  });
}

/** Read-tracking key for localStorage - scoped by profile ID */
function getInboxReadKey(profileId: string): string {
  return `olera_inbox_read_${profileId}`;
}

/** Migrate old unscoped key to new profile-scoped key (one-time) */
function migrateInboxReadData(profileId: string): void {
  const OLD_KEY = "olera_inbox_read";
  const newKey = getInboxReadKey(profileId);
  const migrationFlag = `olera_inbox_migrated_${profileId}`;

  try {
    if (localStorage.getItem(migrationFlag)) return;

    const oldData = localStorage.getItem(OLD_KEY);
    if (oldData) {
      const existingNew = localStorage.getItem(newKey);
      if (!existingNew) {
        localStorage.setItem(newKey, oldData);
      } else {
        const oldIds: string[] = JSON.parse(oldData);
        const newIds: string[] = JSON.parse(existingNew);
        const merged = [...new Set([...oldIds, ...newIds])];
        localStorage.setItem(newKey, JSON.stringify(merged));
      }
    }
    localStorage.setItem(migrationFlag, "1");
  } catch {
    // localStorage unavailable
  }
}

function getReadSet(profileId: string): Set<string> {
  try {
    // Ensure migration runs before reading
    migrateInboxReadData(profileId);
    const raw = localStorage.getItem(getInboxReadKey(profileId));
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function markAsRead(connectionId: string, profileId: string) {
  // Update localStorage for backwards compatibility and immediate local state
  const readSet = getReadSet(profileId);
  readSet.add(connectionId);
  localStorage.setItem(getInboxReadKey(profileId), JSON.stringify([...readSet]));

  // Persist to database (fire-and-forget, non-blocking)
  fetch("/api/connections/mark-read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId, profileId }),
  }).catch((err) => {
    console.error("[markAsRead] Failed to persist to database:", err);
  });

  // Notify navbar badge hook to re-count
  window.dispatchEvent(new CustomEvent("olera:inbox-read"));
}

// ── Role Filter Dropdown (Airbnb-style) ──

const ROLE_OPTIONS: { value: RoleFilter; label: string; icon: string }[] = [
  { value: "family", label: "Family", icon: "M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" },
  { value: "provider", label: "Provider", icon: "M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z" },
];

function RoleFilterDropdown({
  value,
  onChange,
}: {
  value: RoleFilter;
  onChange: (value: RoleFilter) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useClickOutside(dropdownRef, () => setIsOpen(false));

  const selectedOption = ROLE_OPTIONS.find((o) => o.value === value) || ROLE_OPTIONS[0];

  return (
    <div ref={dropdownRef} className="relative shrink-0">
      {/* Dropdown trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="min-w-[110px] flex items-center justify-between gap-2 px-4 py-2 rounded-full text-[13px] font-semibold bg-gray-900 text-white transition-all hover:bg-gray-800"
      >
        <span>{selectedOption.label}</span>
        <svg
          className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {/* Dropdown menu — Airbnb-style polish */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-3 w-52 bg-white rounded-2xl shadow-xl shadow-black/10 ring-1 ring-black/[0.04] py-2 z-50">
          {ROLE_OPTIONS.map((option, index) => (
            <button
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`w-full flex items-center gap-4 px-5 py-3.5 text-left text-[15px] transition-colors ${
                value === option.value
                  ? "text-gray-900 font-semibold"
                  : "text-gray-700 hover:bg-gray-50"
              } ${index === 0 ? "rounded-t-xl" : ""} ${index === ROLE_OPTIONS.length - 1 ? "rounded-b-xl" : ""}`}
            >
              <svg
                className={`w-6 h-6 shrink-0 ${value === option.value ? "text-gray-900" : "text-gray-500"}`}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d={option.icon} />
              </svg>
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ConversationList({
  connections,
  selectedId,
  onSelect,
  loading,
  activeProfileId,
  onReportConnection,
  onArchiveConnection,
  onUnarchiveConnection,
  onDeleteConnection,
  onLoadArchived,
  archivedCount = 0,
  className = "",
  variant = "family",
  roleFilter = "all",
  onRoleFilterChange,
  providerProfileIds,
  showRoleFilters = false,
  isProfileLive = false,
  familyProfileId,
  familyTab: familyTabProp,
  onFamilyTabChange,
  onRefresh,
  refreshing = false,
}: ConversationListProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [archiveOpen, setPastOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [familyTabInternal, setFamilyTabInternal] = useState<FamilyTab>("messages");
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Controlled/uncontrolled pattern for familyTab
  const familyTab = familyTabProp ?? familyTabInternal;
  const setFamilyTab = onFamilyTabChange ?? setFamilyTabInternal;

  // Determine if we're in "family mode" (show Messages/Requests tabs)
  // True when: variant is family AND (role filter is family/all, OR single-account family user)
  const isInFamilyMode = variant === "family" && (roleFilter !== "provider" || (!showRoleFilters && !providerProfileIds?.size));

  // Filter connections by family tab (messages vs requests)
  // Messages: all active conversations (family-initiated + accepted provider requests)
  // Requests: only pending provider requests awaiting family's decision
  const filterByFamilyTab = (list: ConnectionWithProfile[]) => {
    if (!isInFamilyMode || !familyProfileId) return list;

    return list.filter((c) => {
      const familyInitiated = c.from_profile_id === familyProfileId;
      const providerInitiated = !familyInitiated && c.to_profile_id === familyProfileId;

      if (familyTab === "messages") {
        // Messages: family-initiated conversations + accepted provider requests
        return familyInitiated || (providerInitiated && c.status === "accepted");
      } else {
        // Requests: only pending provider requests (awaiting accept/decline)
        return providerInitiated && c.status === "pending";
      }
    });
  };

  // Count pending requests for badge (only pending, not accepted)
  const requestsCount = familyProfileId
    ? getActiveConnections(connections).filter((c) =>
        c.to_profile_id === familyProfileId &&
        c.from_profile_id !== familyProfileId &&
        c.status === "pending"
      ).length
    : 0;

  // Load read tracking from localStorage (scoped by profile)
  useEffect(() => {
    if (activeProfileId) {
      setReadIds(getReadSet(activeProfileId));
    }
  }, [activeProfileId]);

  // Mark selected conversation as read
  useEffect(() => {
    if (selectedId && activeProfileId) {
      markAsRead(selectedId, activeProfileId);
      setReadIds((prev) => new Set([...prev, selectedId]));
    }
  }, [selectedId, activeProfileId]);

  // Track scroll for divider
  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      setIsScrolled(scrollRef.current.scrollTop > 0);
    }
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll, loading]);

  // Focus search input when opened
  useEffect(() => {
    if (searchOpen) {
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [searchOpen]);

  // Close menu on outside click
  useClickOutside(menuRef, () => setMenuOpenId(null), !!menuOpenId);

  // Helper to filter by role (family vs provider)
  const filterByRole = (list: ConnectionWithProfile[]) => {
    if (roleFilter === "all" || !providerProfileIds) return list;
    return list.filter((c) => {
      // Check if this connection involves a provider profile
      const involvesProvider =
        providerProfileIds.has(c.from_profile_id) || providerProfileIds.has(c.to_profile_id);
      return roleFilter === "provider" ? involvesProvider : !involvesProvider;
    });
  };

  // Apply filters
  const filtered = (() => {
    if (searchOpen) {
      let list = filterByRole(searchConnections(getActiveConnections(connections), searchQuery, activeProfileId));
      list = filterByFamilyTab(list);
      return list;
    }
    let list = getActiveConnections(connections);
    list = filterByRole(list);
    list = filterByFamilyTab(list);
    if (unreadOnly) list = list.filter((c) => !readIds.has(c.id));
    return list;
  })();

  // Past connections shown separately in accordion (not during search)
  const pastConnections = (() => {
    const base = searchOpen
      ? searchConnections(getPastConnections(connections), searchQuery, activeProfileId)
      : getPastConnections(connections);
    let list = filterByRole(base);
    list = filterByFamilyTab(list);
    return list;
  })();

  // Clear selection when switching modes if the selected conversation isn't in the filtered list
  useEffect(() => {
    if (!selectedId || loading) return;
    const isSelectedInFiltered = filtered.some((c) => c.id === selectedId);
    if (!isSelectedInFiltered) {
      onSelect(null);
    }
  }, [roleFilter, familyTab, filtered, selectedId, loading, onSelect]);

  // Shared conversation item renderer
  const renderConversationItem = (conn: ConnectionWithProfile, isPast = false) => {
    const isInbound = conn.to_profile_id === activeProfileId;
    const otherProfile = isInbound ? conn.fromProfile : conn.toProfile;
    const name = otherProfile?.display_name || "Unknown";
    const initials = name.split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 2);
    const lastMsg = getLastMessage(conn);
    const careType = getCareType(conn);
    const isSelected = conn.id === selectedId;
    const isMenuOpen = menuOpenId === conn.id;
    const isUnread = !readIds.has(conn.id);
    const isReported = !!(conn.metadata as Record<string, unknown> | undefined)?.reported;

    return (
      <div key={conn.id} className="pl-0 sm:pl-[28px] pr-0 sm:pr-3 py-0.5">
        <div
          className={`group relative rounded-xl transition-colors ${
            isMenuOpen ? "z-20" : ""
          } ${
            isSelected
              ? "bg-primary-50/80"
              : "hover:bg-gray-50"
          } ${isPast ? "opacity-60" : ""}`}
        >
          <button
            onClick={() => onSelect(conn.id)}
            className="w-full text-left flex items-start gap-3.5 px-4 py-4"
          >
            {/* Avatar with unread indicator */}
            <div className="relative shrink-0 mt-0.5">
              {otherProfile?.image_url ? (
                <Image
                  src={otherProfile.image_url}
                  alt={name}
                  width={48}
                  height={48}
                  sizes="48px"
                  className="w-12 h-12 rounded-full object-cover border border-gray-200"
                />
              ) : (
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-white text-sm font-bold"
                  style={{ background: avatarGradient(name) }}
                >
                  {initials}
                </div>
              )}
              {isUnread && !isPast && (
                <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-primary-600 border-2 border-white" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className={`block text-base truncate ${isUnread && !isPast ? "font-semibold text-gray-900" : "font-normal text-gray-900"}`}>
                    {name}
                  </span>
                </div>
                {lastMsg && (
                  <span className={`text-[13px] shrink-0 ${isUnread && !isPast ? "text-primary-600 font-medium" : "text-gray-400"}`}>
                    {formatRelativeTime(lastMsg.timestamp)}
                  </span>
                )}
              </div>
              {(careType || isReported) && (
                <div className="flex items-center gap-2 mt-0.5">
                  {careType && (
                    <p className="text-sm text-primary-600 font-medium truncate">
                      {careType}
                    </p>
                  )}
                  {isReported && (
                    <span className="text-[11px] font-semibold text-red-500 bg-red-50 px-1.5 py-0.5 rounded-md shrink-0">
                      Reported
                    </span>
                  )}
                </div>
              )}
              {lastMsg && (
                <p className="text-[15px] text-gray-500 truncate mt-0.5">
                  {lastMsg.text}
                </p>
              )}
            </div>
          </button>

          {/* Action menu — always visible on mobile, hover-reveal on desktop */}
          <div className={`absolute right-2 top-2 ${isMenuOpen ? "opacity-100" : "sm:opacity-0 sm:group-hover:opacity-100"} transition-opacity`}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpenId(isMenuOpen ? null : conn.id);
                }}
                className="w-11 h-11 flex items-center justify-center rounded-full bg-white border border-gray-200 shadow-sm hover:bg-gray-50 transition-colors"
                aria-label="More actions"
              >
                <svg className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                </svg>
              </button>

              {/* Dropdown - opens downward */}
              {isMenuOpen && (
                <div
                  ref={menuRef}
                  className="absolute right-0 top-full mt-1 w-40 bg-white rounded-xl shadow-xl border border-gray-200 py-1 z-50"
                >
                  {/* Active items: Archive + Report */}
                  {!isPast && onArchiveConnection && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onArchiveConnection(conn.id);
                        setMenuOpenId(null);
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2.5"
                    >
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                      </svg>
                      Archive
                    </button>
                  )}
                  {!isPast && onReportConnection && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onReportConnection(conn.id);
                        setMenuOpenId(null);
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2.5"
                    >
                      <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 21V4a1 1 0 011-1h4l2 3h8a1 1 0 011 1v8a1 1 0 01-1 1h-6l-2-3H4a1 1 0 00-1 1v7" />
                      </svg>
                      Report
                    </button>
                  )}
                  {/* Past items: Unarchive */}
                  {isPast && onUnarchiveConnection && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onUnarchiveConnection(conn.id);
                        setMenuOpenId(null);
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2.5"
                    >
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 9l6-6m0 0l6 6m-6-6v12a6 6 0 01-12 0v-3" />
                      </svg>
                      Unarchive
                    </button>
                  )}
                  {isPast && onDeleteConnection && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteConnection(conn.id);
                        setMenuOpenId(null);
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2.5"
                    >
                      <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
        </div>
      </div>
    );
  };

  // Loading state
  if (loading) {
    return (
      <div className={`flex flex-col border-r border-gray-200 bg-white ${className}`}>
        <div className="pl-4 sm:pl-[44px] pr-4 sm:pr-5 py-5">
          <h2 className="text-2xl font-display font-bold text-gray-900">Inbox</h2>
        </div>
        <div className="flex-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="pl-0 sm:pl-[28px] pr-0 sm:pr-3 py-0.5">
              <div className="flex items-start gap-3.5 px-4 py-4 animate-pulse">
                <div className="w-12 h-12 rounded-full bg-gray-100 shrink-0" />
                <div className="flex-1 space-y-2.5 pt-1">
                  <div className="h-4 bg-gray-100 rounded w-2/3" />
                  <div className="h-3 bg-gray-50 rounded w-1/3" />
                  <div className="h-3 bg-gray-50 rounded w-full" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Empty state (no connections at all)
  if (connections.length === 0) {
    return (
      <div className={`flex flex-col border-r border-gray-200 bg-white ${className}`}>
        <div className="pl-4 sm:pl-[44px] pr-4 sm:pr-5 py-5">
          <h2 className="text-2xl font-display font-bold text-gray-900">Inbox</h2>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center">
            <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="2" y="4" width="20" height="16" rx="2" strokeWidth={1.5} />
                <path d="M22 7l-8.97 5.7a1.94 1.94 0 01-2.06 0L2 7" strokeWidth={1.5} />
              </svg>
            </div>
            <p className="text-[15px] font-display font-medium text-gray-900 mb-1">No conversations yet</p>
            {variant === "provider" ? (
              <p className="text-sm text-gray-500">When families connect with you, their messages will appear here</p>
            ) : (
              <>
                <p className="text-sm text-gray-500 mb-4">Connect with a provider to start messaging</p>
                <Link
                  href="/browse"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
                >
                  Browse providers
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col border-r border-gray-200 bg-white ${className}`}>
      {/* Header */}
      <div className={`shrink-0 relative z-20 bg-white transition-shadow duration-150 ${isScrolled ? "shadow-[0_1px_0_0_#e5e7eb]" : ""}`}>
        {/* Header — crossfade between default and search modes */}
        <div className="relative">
          {/* Default mode — title + search icon */}
          <div
            className={`pl-4 sm:pl-[44px] pr-4 sm:pr-5 py-5 flex items-center justify-between transition-all duration-200 ease-out ${
              searchOpen
                ? "opacity-0 -translate-y-1 pointer-events-none absolute inset-x-0 top-0"
                : "opacity-100 translate-y-0"
            }`}
          >
            <h2 className="text-2xl font-display font-bold text-gray-900">Inbox</h2>
            <div className="flex items-center gap-2">
              {/* Refresh button */}
              {onRefresh && (
                <button
                  onClick={onRefresh}
                  disabled={refreshing}
                  className="w-11 h-11 flex items-center justify-center rounded-full border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
                  aria-label="Refresh inbox"
                >
                  <svg
                    className={`w-5 h-5 text-gray-600 ${refreshing ? "animate-spin" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              )}
              {/* Search button */}
              <button
                onClick={() => setSearchOpen(true)}
                className="w-11 h-11 flex items-center justify-center rounded-full border border-gray-200 hover:bg-gray-50 transition-colors"
                aria-label="Search messages"
              >
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Search mode */}
          <div
            className={`pl-4 sm:pl-[44px] pr-4 sm:pr-5 py-4 flex items-center gap-3 transition-all duration-200 ease-out ${
              searchOpen
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-1 pointer-events-none absolute inset-x-0 top-0"
            }`}
          >
            <div className="flex-1 flex items-center gap-2 bg-gray-100 rounded-full px-4 py-2.5">
              <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search conversations"
                className="flex-1 bg-transparent text-[15px] text-gray-900 placeholder:text-gray-400 outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-200 transition-colors"
                >
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            <button
              onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
              className="min-h-[44px] px-3 text-sm font-medium text-gray-900 shrink-0"
            >
              Cancel
            </button>
          </div>
        </div>

        {/* Filter pills — smooth collapse during search */}
        <div
          className={`transition-all duration-200 ease-out ${
            searchOpen ? "max-h-0 opacity-0 overflow-hidden" : "max-h-12 opacity-100"
          }`}
        >
          <div className="pl-4 sm:pl-[44px] pr-4 sm:pr-5 pb-3 flex items-center gap-2">
            {/* Role filter dropdown — Airbnb-style, only shown for dual-account users */}
            {showRoleFilters && onRoleFilterChange && (
              <RoleFilterDropdown
                value={roleFilter || "all"}
                onChange={onRoleFilterChange}
              />
            )}
          </div>
        </div>

        {/* Messages / Requests tabs — only shown in family mode */}
        {isInFamilyMode && (
          <div className="pl-4 sm:pl-[44px] pr-4 sm:pr-5 border-b border-gray-100">
            <div className="flex gap-6">
              <button
                onClick={() => setFamilyTab("messages")}
                className={`relative pb-3 text-[15px] font-medium transition-colors ${
                  familyTab === "messages"
                    ? "text-gray-900"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Messages
                {familyTab === "messages" && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 rounded-full" />
                )}
              </button>
              <button
                onClick={() => setFamilyTab("requests")}
                className={`relative pb-3 text-[15px] font-medium transition-colors flex items-center gap-2 ${
                  familyTab === "requests"
                    ? "text-gray-900"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Requests
                {requestsCount > 0 && (
                  <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                    {requestsCount}
                  </span>
                )}
                {familyTab === "requests" && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 rounded-full" />
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Conversation list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto flex flex-col">
        {/* Active conversations — flex-1 pushes archive accordion to bottom */}
        <div className="flex-1">
          {filtered.length > 0 ? (
            filtered.map((conn) => renderConversationItem(conn))
          ) : (
            <div className="flex flex-col items-center justify-center py-16 px-6">
              {searchOpen ? (
                <p className="text-[15px] text-gray-500">No results found</p>
              ) : unreadOnly ? (
                <div className="text-center">
                  <p className="text-[15px] font-display font-medium text-gray-900 mb-1">No unread messages</p>
                  <p className="text-sm text-gray-500">You&apos;re all caught up</p>
                </div>
              ) : isInFamilyMode && familyTab === "messages" ? (
                /* Messages tab empty state */
                <div className="text-center">
                  <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                    </svg>
                  </div>
                  <p className="text-[15px] font-display font-medium text-gray-900 mb-1">No messages yet</p>
                  <p className="text-sm text-gray-500 mb-4">Find and connect with care providers</p>
                  <Link
                    href="/browse"
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
                  >
                    Browse providers
                  </Link>
                </div>
              ) : isInFamilyMode && familyTab === "requests" ? (
                /* Requests tab empty state */
                <div className="text-center">
                  <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                    </svg>
                  </div>
                  <p className="text-[15px] font-display font-medium text-gray-900 mb-1">No requests yet</p>
                  {isProfileLive ? (
                    <p className="text-sm text-gray-500">When providers reach out about your care needs, they&apos;ll appear here</p>
                  ) : (
                    <>
                      <p className="text-sm text-gray-500 mb-4">Go live with your care profile so providers can find you</p>
                      <Link
                        href="/portal/profile"
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
                      >
                        Go live
                      </Link>
                    </>
                  )}
                </div>
              ) : roleFilter !== "all" ? (
                <div className="text-center">
                  <p className="text-[15px] font-display font-medium text-gray-900 mb-1">
                    No {roleFilter} messages
                  </p>
                  <p className="text-sm text-gray-500">
                    {roleFilter === "provider"
                      ? "When families connect with your provider profile, they'll appear here"
                      : "When you connect with providers as a family, they'll appear here"
                    }
                  </p>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-[15px] font-display font-medium text-gray-900 mb-1">You have no messages yet</p>
                  {variant === "provider" ? (
                    <p className="text-sm text-gray-500">When families connect with you, their messages will appear here</p>
                  ) : (
                    <>
                      <p className="text-sm text-gray-500 mb-4">Browse providers to start a conversation</p>
                      <Link
                        href="/browse"
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
                      >
                        Browse providers
                      </Link>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Archived conversations accordion — always at bottom */}
        {(pastConnections.length > 0 || archivedCount > 0) && (
          <>
            <button
              onClick={() => {
                setPastOpen((p) => {
                  if (!p && onLoadArchived) onLoadArchived();
                  return !p;
                });
              }}
              className="w-full flex items-center justify-between pl-4 sm:pl-[44px] pr-4 sm:pr-5 py-3.5 mt-2 bg-gray-50/80 hover:bg-gray-100/80 transition-colors"
            >
              <span className="text-sm font-semibold text-gray-500">
                Archived ({pastConnections.length || archivedCount})
              </span>
              <svg
                className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${archiveOpen ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {archiveOpen && pastConnections.map((conn) => renderConversationItem(conn, true))}
          </>
        )}
      </div>
    </div>
  );
}
