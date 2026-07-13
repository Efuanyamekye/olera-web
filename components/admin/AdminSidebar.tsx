"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AdminUser } from "@/lib/types";
import { useMedJobsRefresh } from "@/hooks/useMedJobsRefresh";

interface AdminSidebarProps {
  adminUser: AdminUser;
}

interface NavItem {
  label: string;
  href: string;
}

interface NavSection {
  label: string;
  key: string;
  items: NavItem[];
  defaultOpen?: boolean;
}

const navSections: NavSection[] = [
  {
    label: "Inbox",
    key: "inbox",
    defaultOpen: true,
    items: [
      { label: "Activity", href: "/admin/activity" },
      // "Referrals" = the market-outreach ambassador/nudge queue; renamed
      // to say the job, not the department (2026-07 sidebar naming pass)
      { label: "Referrals", href: "/admin/market-outreach" },
      { label: "Connections", href: "/admin/connections" },
      // Outreach merged into Connections (direction=outbound toggle)
      // Leads retired — Connections page now handles all lead management
      { label: "Provider Outreach", href: "/admin/provider-outreach" },
      { label: "Questions", href: "/admin/questions" },
    ],
  },
  {
    label: "Records",
    key: "records",
    defaultOpen: true,
    items: [
      { label: "Directory", href: "/admin/directory" },
      { label: "Care Seekers", href: "/admin/care-seekers" },
      { label: "Reviews", href: "/admin/reviews" },
      { label: "Emails", href: "/admin/emails" },
      { label: "Email Verifier", href: "/admin/email-verifier" },
    ],
  },
  {
    // Renamed from "Manage" — every admin section "manages"; this one is
    // specifically moderation + protection, so name the job.
    label: "Trust & Safety",
    key: "manage",
    items: [
      { label: "Verification", href: "/admin/verification" },
      { label: "Disputes", href: "/admin/disputes" },
      { label: "Removals", href: "/admin/removal-requests" },
      { label: "Blocklist", href: "/admin/removal-blocklist" },
      { label: "Do Not Contact", href: "/admin/do-not-contact" },
    ],
  },
  {
    label: "Operations",
    key: "operations",
    defaultOpen: true,
    items: [
      { label: "Analytics", href: "/admin/analytics" },
      { label: "Ad Boost", href: "/admin/ad-boost" },
      { label: "Automations", href: "/admin/automations" },
      { label: "Family Comms", href: "/admin/family-comms" },
      { label: "Benefits", href: "/admin/benefits" },
      // "Articles" — next to Benefits (also content), "Content" was ambiguous
      { label: "Articles", href: "/admin/content" },
      // v9.0 Phase 7 Commit K: Staffing Outreach retired — its
      // operational concerns are fully covered by the MedJobs
      // section below (sites, prospects, partners, etc.). Hidden
      // here to avoid redundancy + conceptual overlap; the legacy
      // /admin/staffing-outreach route still resolves for any
      // bookmarks during transition.
      { label: "Team", href: "/admin/team" },
    ],
  },
];

// v9.0 Phase 7 Commit K: MedJobs left nav expands to ten flat
// operational surfaces, ordered as a directional priority view:
//   In Basket             — the smart priority workspace (active work)
//   Sites · Prospects     — territorial + funnel-feeder backlogs
//   Clients · Partners ·
//   Candidates            — relationship surfaces
//   Replies · Meetings ·
//   Calls                 — workflow-stage queues
//   Logs                  — historical / analytics layer
//
// Each entity page is a full operational repository — admins can
// work outside the In Basket if preferred. The In Basket emphasizes
// active work; the dedicated pages show full inventory including
// closed/completed history.
//
// All 10 items expose an unread/total fraction sourced from
// /api/admin/medjobs/sidebar-counts. Labels + fractions bold when
// unread > 0, mirroring the In Basket tab-bar pattern.
const STAKEHOLDERS_KEY = "stakeholders";

// MedJobs sidebar order mirrors the In Basket horizontal tab order:
// hot operational queues (Prospects → Calls → Replies → Meetings) lead,
// followed by warm relationships (Clients → Partners → Candidates),
// followed by the organizational anchor (Sites) and the historical
// layer (Logs). Admins learn one consistent left-to-top order across
// the sidebar and the In Basket tab bar.
//
// Sites lives near the end deliberately: it's an organizational anchor
// (territories that generate operational work), not itself an
// operational queue. The In Basket + the queue items above surface the
// actual triage work; Sites is the directory of activated territories.
// v11: the MedJobs sidebar collapses to three entries. Sites is the territory
// anchor (where a prospecting pass starts), then the In Basket daily work
// queue, then Stats — the analytic hub that links out to the full list pages
// (Prospects, Calls, Emails, Meetings, Clients, Partners, Candidates, and Logs
// — whose routes still exist, just no longer in the sidebar).
const medjobsItems: NavItem[] = [
  { label: "Sites",     href: "/admin/medjobs/sites" },
  { label: "In Basket", href: "/admin/medjobs/in-basket" },
  { label: "Stats",     href: "/admin/medjobs/stats" },
];

/** Map nav-item href → sidebar-counts response key. Only In Basket and Sites
 *  carry a count badge now; Stats is an overview surface. */
const COUNTS_KEY: Record<string, string | null> = {
  "/admin/medjobs/in-basket": "in_basket",
  "/admin/medjobs/sites":     "sites",
  "/admin/medjobs/stats":     null,
};

interface CountEntry {
  unread: number;
  total: number;
}
type SidebarCounts = Record<string, CountEntry | undefined>;

// Retained for backwards-compat with auto-expand logic; will be cleared
// in a follow-up. The current sidebar implementation uses this set
// to detect which sections contain the active route.
const stakeholdersChildren: NavItem[] = [];

// Mobile: 5 daily-use items with icons
const mobileNavItems: (NavItem & { icon: React.ReactNode })[] = [
  {
    label: "Overview",
    href: "/admin",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
      </svg>
    ),
  },
  {
    label: "Directory",
    href: "/admin/directory",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
      </svg>
    ),
  },
  {
    label: "Connections",
    href: "/admin/connections",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
  {
    label: "Articles",
    href: "/admin/content",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    label: "MedJobs",
    href: "/admin/medjobs/in-basket",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
      </svg>
    ),
  },
];

const STORAGE_KEY = "admin-sidebar-collapsed";

function getInitials(email: string): string {
  const local = email.split("@")[0];
  if (!local) return "?";
  return local.slice(0, 2).toUpperCase();
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-150 ${open ? "rotate-90" : ""}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

export default function AdminSidebar({ adminUser }: AdminSidebarProps) {
  const pathname = usePathname();

  // v9.0 Phase 7: medjobs section toggles open/close. Defaults open
  // since the section is the primary daily-use surface.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const s of navSections) {
      initial[s.key] = !s.defaultOpen;
    }
    initial.medjobs = false;
    return initial;
  });

  // v9.0 Phase 7 Commit K: per-item unread/total fractions. Fetched
  // once on mount and on every MedJobs refresh signal so the
  // sidebar stays live as admins work the queue. Failure is silent
  // — the fraction just doesn't render until the next successful
  // fetch.
  const [sidebarCounts, setSidebarCounts] = useState<SidebarCounts | null>(null);

  // E4: pulse-on-change. When a tab's unread/total count changes, the
  // count chip briefly flashes an emerald background so admin SEES the
  // queue update rather than scanning for a number difference. Tracks
  // previous counts via ref; sets a transient Set of changed keys for
  // ~800ms; CSS `transition-colors` carries the fade.
  const prevCountsRef = useRef<SidebarCounts | null>(null);
  const [pulseKeys, setPulseKeys] = useState<Set<string>>(new Set());
  useEffect(() => {
    const prev = prevCountsRef.current;
    prevCountsRef.current = sidebarCounts;
    if (!sidebarCounts || !prev) return; // first load — just remember
    const changed = new Set<string>();
    for (const [key, entry] of Object.entries(sidebarCounts)) {
      const prevEntry = prev[key];
      if (!prevEntry || !entry) continue;
      if (entry.unread !== prevEntry.unread || entry.total !== prevEntry.total) {
        changed.add(key);
      }
    }
    if (changed.size === 0) return;
    setPulseKeys(changed);
    const timer = setTimeout(() => setPulseKeys(new Set()), 800);
    return () => clearTimeout(timer);
  }, [sidebarCounts]);
  const refetchCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/medjobs/sidebar-counts");
      if (!res.ok) return;
      const data = (await res.json()) as { counts: SidebarCounts };
      setSidebarCounts(data.counts ?? null);
    } catch {
      /* non-critical */
    }
  }, []);
  useEffect(() => { void refetchCounts(); }, [refetchCounts]);
  useMedJobsRefresh(refetchCounts);

  // Hydrate from localStorage after mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setCollapsed(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  function toggle(key: string) {
    setCollapsed((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  // Collapse/expand all sections at once (incl. MedJobs). Judged from raw
  // collapsed state, not effective-open — the active section stays visually
  // open via the auto-expand override even after "Collapse all", so the
  // current page never disappears from the nav.
  const allSectionKeys = [...navSections.map((s) => s.key), "medjobs"];
  const allCollapsed = allSectionKeys.every((k) => collapsed[k]);
  function setAll(collapse: boolean) {
    setCollapsed((prev) => {
      const next = { ...prev };
      for (const k of allSectionKeys) next[k] = collapse;
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  // Auto-expand section if it contains the active item
  const activeSectionKey = navSections.find((s) =>
    s.items.some((item) => isActive(item.href))
  )?.key;

  // v9.0 Phase 7: medjobs section auto-expands when any child route
  // is active, so the current page is always visible in the nav.
  const medjobsHasActive = medjobsItems.some((item) => isActive(item.href));
  const medjobsOpen = !collapsed.medjobs || medjobsHasActive;
  void STAKEHOLDERS_KEY;
  void stakeholdersChildren;

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col md:w-52 bg-white border-r border-gray-100 sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto">
        <nav className="flex-1 px-3 pt-3 pb-3">
          {/* Overview — standalone top link, with collapse/expand-all beside it */}
          <div className="flex items-center justify-between mb-3">
            <Link
              href="/admin"
              className={[
                "flex-1 block px-2.5 py-1.5 rounded-md text-sm transition-colors duration-100",
                isActive("/admin")
                  ? "text-gray-900 font-semibold bg-gray-100"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-50",
              ].join(" ")}
            >
              Overview
            </Link>
            <button
              onClick={() => setAll(!allCollapsed)}
              title={allCollapsed ? "Expand all sections" : "Collapse all sections"}
              className="ml-1 px-1.5 py-1 rounded text-[11px] text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors duration-100 whitespace-nowrap"
            >
              {allCollapsed ? "Expand all" : "Collapse all"}
            </button>
          </div>

          {/* Collapsible sections */}
          {navSections.map((section) => {
            const isOpen = !collapsed[section.key] || activeSectionKey === section.key;

            return (
              <div key={section.key} className="mt-1">
                <button
                  onClick={() => toggle(section.key)}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm font-semibold text-gray-800 hover:bg-gray-50 transition-colors duration-100"
                >
                  {section.label}
                  <Chevron open={isOpen} />
                </button>

                {isOpen && (
                  <div className="mt-0.5 space-y-px">
                    {section.items.map((item) => {
                      const active = isActive(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={[
                            "block pl-5 pr-2.5 py-1.5 rounded-md text-[13px] transition-colors duration-100",
                            active
                              ? "text-gray-900 font-medium bg-gray-100"
                              : "text-gray-600 hover:text-gray-900 hover:bg-gray-50",
                          ].join(" ")}
                        >
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* v9.0 Phase 7 Commit K: MedJobs section — ten flat
              operational surfaces with per-item unread/total
              fractions. Labels + fractions bold when unread > 0
              (same pattern as the In Basket tab bar). */}
          <div key="medjobs" className="mt-1">
            <button
              onClick={() => toggle("medjobs")}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm font-semibold text-gray-800 hover:bg-gray-50 transition-colors duration-100"
            >
              MedJobs
              <Chevron open={medjobsOpen} />
            </button>

            {medjobsOpen && (
              <div className="mt-0.5 space-y-px">
                {medjobsItems.map((item) => {
                  const active = isActive(item.href);
                  const countsKey = COUNTS_KEY[item.href];
                  const entry = countsKey ? sidebarCounts?.[countsKey] : undefined;
                  // Sites is an organizational anchor, not a queue:
                  // render its count flat (no fraction, no unread
                  // bolding) so it doesn't read as triage work.
                  const isPlainCount = item.href === "/admin/medjobs/sites";
                  const hasUnread = !isPlainCount && !!entry && entry.unread > 0;
                  const fraction = entry
                    ? isPlainCount
                      ? entry.total > 0
                        ? String(entry.total)
                        : null
                      : hasUnread
                        ? `${entry.unread}/${entry.total}`
                        : entry.total > 0
                          ? String(entry.total)
                          : null
                    : null;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={[
                        "flex items-center justify-between pl-5 pr-2.5 py-1.5 rounded-md text-[13px] transition-colors duration-100",
                        active
                          ? hasUnread
                            ? "bg-gray-100 font-semibold text-gray-900"
                            : "bg-gray-100 font-medium text-gray-900"
                          : hasUnread
                            ? "font-semibold text-gray-900 hover:bg-gray-50"
                            : "font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50",
                      ].join(" ")}
                    >
                      <span>{item.label}</span>
                      {fraction != null && (
                        <span
                          className={[
                            "ml-2 text-[11px] tabular-nums rounded px-1 transition-colors duration-500",
                            hasUnread ? "font-semibold text-gray-900" : "text-gray-400",
                            countsKey && pulseKeys.has(countsKey)
                              ? "bg-emerald-100"
                              : "bg-transparent",
                          ].join(" ")}
                        >
                          {fraction}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Young Caregivers section */}
          <div key="young-caregivers" className="mt-1">
            <Link
              href="/admin/young-caregivers"
              className={[
                "w-full flex items-center px-2.5 py-1.5 rounded-md text-sm font-semibold transition-colors duration-100",
                isActive("/admin/young-caregivers")
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-800 hover:bg-gray-50",
              ].join(" ")}
            >
              Young Caregivers
            </Link>
          </div>
        </nav>

        <div className="border-t border-gray-100 px-3 py-3">
          <div className="flex items-center gap-2.5 px-2.5">
            <div className="w-6 h-6 rounded-full bg-gray-100 text-[10px] font-semibold text-gray-500 flex items-center justify-center shrink-0">
              {getInitials(adminUser.email)}
            </div>
            <Link
              href="/"
              className="text-[13px] text-gray-500 hover:text-gray-700 transition-colors duration-100"
            >
              Exit Admin
            </Link>
          </div>
        </div>
      </aside>

      {/* Mobile bottom nav — 5 key items only */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40">
        <div className="flex justify-around py-2">
          {mobileNavItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "flex flex-col items-center gap-1 px-3 py-2 text-xs font-medium min-w-[64px] min-h-[44px] justify-center",
                  active ? "text-gray-900" : "text-gray-400",
                ].join(" ")}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
