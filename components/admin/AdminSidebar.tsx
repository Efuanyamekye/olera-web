"use client";

import { AD_BOOST_QUEUE_SETTLED } from "@/components/admin/AdBoostQueueCache";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AdminUser } from "@/lib/types";
import { useMedJobsRefresh } from "@/hooks/useMedJobsRefresh";
import { useToast } from "@/components/admin/Toast";
import AdminToolSearch from "@/components/admin/AdminToolSearch";
import type { AdminTool } from "@/lib/admin-tool-search";
import SidebarDrawerToggle from "@/components/admin/SidebarDrawerToggle";
import { OwnerNames, OwnersMenu } from "@/components/admin/PageOwners";
import type { Owner, PageOwners as PageOwnerMap } from "@/lib/admin-page-owners";

interface AdminSidebarProps {
  adminUser: AdminUser;
  desktopHidden?: boolean;
  onRequestClose?: () => void;
  onRequestOpen?: () => void;
}

interface NavItem {
  label: string;
  href: string;
  description?: string;
  keywords?: string;
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
      { label: "Activity", href: "/admin/activity", description: "See recent admin activity", keywords: "notifications updates" },
      // Inbound SMS. Carries an unhandled badge because the volume is low —
      // without it this reads as a dead page and stops getting checked.
      { label: "Messages", href: "/admin/inbox", description: "Handle inbound texts and replies", keywords: "sms inbox conversations" },
      { label: "Support Email", href: "/admin/support-email", description: "Work through support conversations", keywords: "gmail customer help inbox" },
      // "Referrals" = the market-outreach ambassador/nudge queue; renamed
      // to say the job, not the department (2026-07 sidebar naming pass)
      { label: "Referrals", href: "/admin/market-outreach", description: "Manage ambassador referral outreach", keywords: "market ambassadors nudges" },
      { label: "Connections", href: "/admin/connections", description: "Manage family and provider inquiries", keywords: "leads matches outbound" },
      // Outreach merged into Connections (direction=outbound toggle)
      // Leads retired — Connections page now handles all lead management
      { label: "Provider Outreach", href: "/admin/provider-outreach", description: "Reach out to care providers", keywords: "sales prospecting email campaigns" },
      { label: "City Broadcasts", href: "/admin/city-broadcasts", description: "Send updates to local providers", keywords: "city announcements campaigns" },
      { label: "Provider Growth", href: "/admin/provider-growth", description: "Track claims through conversion", keywords: "claims claimed follow up meetings paying" },
      { label: "Questions", href: "/admin/questions", description: "Review care questions and answers", keywords: "qna answers moderation" },
    ],
  },
  {
    label: "Records",
    key: "records",
    defaultOpen: true,
    items: [
      { label: "Directory", href: "/admin/directory", description: "Find and manage provider listings", keywords: "organizations facilities care homes" },
      { label: "Care Seekers", href: "/admin/care-seekers", description: "Find families looking for care", keywords: "families users records" },
      { label: "Students", href: "/admin/caregivers", description: "Manage student caregiver records", keywords: "candidates medjobs applicants" },
      { label: "Reviews", href: "/admin/reviews", description: "Review provider ratings and feedback", keywords: "testimonials moderation" },
      { label: "Emails", href: "/admin/emails", description: "Review emails sent by the platform", keywords: "sent mail history templates logs" },
      { label: "Email Verifier", href: "/admin/email-verifier", description: "Check email address validity", keywords: "validate verification bounce" },
    ],
  },
  {
    // Renamed from "Manage" — every admin section "manages"; this one is
    // specifically moderation + protection, so name the job.
    label: "Trust & Safety",
    key: "manage",
    items: [
      { label: "Verification", href: "/admin/verification", description: "Review provider verification", keywords: "ownership identity approve claims" },
      { label: "Disputes", href: "/admin/disputes", description: "Resolve disputed provider claims", keywords: "ownership moderation" },
      { label: "Removals", href: "/admin/removal-requests", description: "Review listing removal requests", keywords: "delete listings takedown" },
      { label: "Blocklist", href: "/admin/removal-blocklist", description: "Manage blocked provider listings", keywords: "removed listings protection" },
      { label: "Do Not Contact", href: "/admin/do-not-contact", description: "Manage outreach exclusions", keywords: "dnc unsubscribe opt out suppression" },
    ],
  },
  {
    label: "Operations",
    key: "operations",
    defaultOpen: true,
    items: [
      { label: "Organic Growth", href: "/admin/organic-growth", description: "Track search visibility and acquisition", keywords: "seo google traffic metrics" },
      { label: "Analytics", href: "/admin/analytics", description: "Explore site usage and performance", keywords: "traffic metrics visitors conversion" },
      { label: "Ad Boost", href: "/admin/ad-boost", description: "Manage provider advertising campaigns", keywords: "ads google nextdoor paid promotion" },
      { label: "Provider Relationships", href: "/admin/relationships", description: "Track provider contacts and follow-ups", keywords: "crm touches calls meetings quiet relationships" },
      // The family half of the same idea. Separate entry rather than a tab
      // because the two are opened for different reasons: providers on a Tuesday
      // to keep accounts warm, families when someone is waiting on an answer.
      { label: "Care Seeker Relationships", href: "/admin/relationships/families", description: "Work the families who need something from us", keywords: "crm care seekers families reach consent episode unreachable cases case desk queue" },
      { label: "Automations", href: "/admin/automations", description: "Review scheduled workflows", keywords: "cron jobs schedules email sequences" },
      // Sits next to Automations on purpose: that page carries account-level
      // send risk, this one carries who stopped hearing from us. Two halves.
      { label: "Deliverability", href: "/admin/deliverability", description: "Check who stopped receiving emails", keywords: "bounces suppression delivery mail" },
      { label: "Family Comms", href: "/admin/family-comms", description: "Review family communication journeys", keywords: "messages email sms sequences" },
      { label: "Provider Comms", href: "/admin/provider-comms", description: "Review provider communication journeys", keywords: "messages email sms sequences" },
      { label: "Benefits", href: "/admin/benefits", description: "Manage benefits guidance and requests", keywords: "financial aid navigator applications" },
      // "Articles" — next to Benefits (also content), "Content" was ambiguous
      { label: "Articles", href: "/admin/content", description: "Write and manage care articles", keywords: "content blog editorial guides" },
      // v9.0 Phase 7 Commit K: Staffing Outreach retired — its
      // operational concerns are fully covered by the MedJobs
      // section below (sites, prospects, partners, etc.). Hidden
      // here to avoid redundancy + conceptual overlap; the legacy
      // /admin/staffing-outreach route still resolves for any
      // bookmarks during transition.
      { label: "Team", href: "/admin/team", description: "Manage admin team access", keywords: "staff permissions members" },
      { label: "War Room", href: "/admin/war-room", description: "Investigate marketplace issues", keywords: "diagnostics discovery operations" },
      // Last on purpose. Not a queue to work — the whole marketplace as one
      // figure, read when you want to see where a number comes from or
      // which steps nobody measures yet.
      { label: "Operating Map", href: "/admin/operating-map", description: "See how the marketplace works", keywords: "architecture funnel flows metrics" },
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
// — whose routes still exist, just no longer in the sidebar). SOP closes the
// list: the implementation matrix, which describes how every one of the other
// three is meant to be worked.
// Four pages, one workspace. System is the operating command centre and holds
// the Sites and In Basket actions; the other three are the role manuals.
// Stats is retired: the performance instrumentation lives on the architecture.
const SOP_HREF = "/admin/medjobs/sop";

/**
 * Three entries, because three is what somebody working the board needs.
 *
 * Universities is the daily work. SOP is the words we say, which is the only
 * one of the five SOP pages anybody opens mid-task. Archive is where records
 * go when they close.
 *
 * System, Admin, Sales and CRM used to sit here too, five links deep, and
 * were opened about as often as a filing cabinet. They are buttons at the
 * bottom of the Archive page now. The routes are unchanged and they stay
 * searchable and pinnable — see SOP_PAGES.
 */
const medjobsItems: NavItem[] = [
  { label: "Universities", href: "/admin/medjobs/in-basket", description: "Work through every university, one task at a time", keywords: "staffing in basket queue campuses tasks providers students" },
  { label: "Email Health", href: "/admin/medjobs/email-health", description: "Student email deliverability and engagement", keywords: "bounce complaint open click rate delivery student emails" },
  { label: "Standard Operating Procedures (SOP)", href: `${SOP_HREF}/scripts`, description: "Instructions, scripts and email copy for every step", keywords: "staffing scripts email copy calls sop playbook instructions" },
  { label: "Archive", href: "/admin/medjobs/archive", description: "Records closed by hand or out of rounds", keywords: "staffing closed archived revive" },
];

/**
 * The four role manuals, off the sidebar but not gone.
 *
 * They stay in the command palette and in the pinnable list. Dropping them
 * from both would have quietly deleted anybody's pinned favourite: a pinned
 * href whose label no longer resolves is filtered out without a word.
 */
export const SOP_PAGES: NavItem[] = [
  { label: "System", href: SOP_HREF, description: "The operating model, the architecture and the funnel", keywords: "staffing sites territories sop matrix health" },
  { label: "Admin", href: `${SOP_HREF}/admin`, description: "Open the MedJobs admin manual", keywords: "staffing operations sop" },
  { label: "Sales", href: `${SOP_HREF}/sales`, description: "Open the MedJobs sales manual", keywords: "staffing prospecting sop" },
  { label: "CRM", href: `${SOP_HREF}/crm`, description: "Open the MedJobs relationship manual", keywords: "staffing clients partners sop" },
];

/** Map nav-item href → sidebar-counts response key. Only In Basket and Sites
 *  carry a count badge now; Stats is an overview surface. */
// Only the In Basket carries a fraction; the four workspace pages are
// documents and dashboards, not queues.
const COUNTS_KEY: Record<string, string | null> = {
  "/admin/medjobs/in-basket": "in_basket",
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

/**
 * How wide the rail is, in pixels, and where it may go.
 *
 * MIN is md:w-52 to the pixel, so dragging all the way left lands on exactly
 * the layout everybody had before the handle existed rather than near it.
 * MAX is where widening stops paying: the longest row is "Care Seeker
 * Relationships" with three or four names under it, and past this the rail is
 * only taking width off the page you are reading.
 *
 * Per device rather than per person. Pins are in the database deliberately so
 * they follow somebody between machines; the right width is a property of the
 * monitor in front of you, so it stays with the browser, next to the
 * section-collapse state that already lives there.
 */
const WIDTH_KEY = "admin-sidebar-width";
const MIN_WIDTH = 208;
const MAX_WIDTH = 360;
const clampWidth = (px: number) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(px)));

// Every page a hover-star can pin. Pinned hrefs are stored per admin
// (admin_users.favorites) and resolve their labels here — a retired route
// simply stops rendering, no cleanup needed.
const pinnableItems: NavItem[] = [
  ...navSections.flatMap((s) => s.items),
  ...[...medjobsItems, ...SOP_PAGES].map((i) => ({ ...i, label: `MedJobs · ${i.label}` })),
  { label: "Young Caregivers", href: "/admin/young-caregivers" },
];

// Search derives destinations from the same registry as the visible navigation.
const searchableTools: AdminTool[] = [
  { label: "Overview", href: "/admin", section: "Overview", description: "See the admin dashboard", keywords: "home summary" },
  ...[...navSections, { label: "MedJobs", items: [...medjobsItems, ...SOP_PAGES] }].flatMap((section) =>
    section.items.map((item) => ({ ...item, section: section.label, description: item.description ?? item.label })),
  ),
  { label: "Young Caregivers", href: "/admin/young-caregivers", section: "Community", description: "Manage the young caregiver community", keywords: "discord support" },
];

function getInitials(email: string): string {
  const local = email.split("@")[0];
  if (!local) return "?";
  return local.slice(0, 2).toUpperCase();
}

function Star({ filled }: { filled: boolean }) {
  return (
    <svg
      className="w-3.5 h-3.5"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
      />
    </svg>
  );
}

/** The six-dot grip, matching ReorderableSections so one gesture looks alike. */
function Grip() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="9" cy="5" r="1.7" />
      <circle cx="15" cy="5" r="1.7" />
      <circle cx="9" cy="12" r="1.7" />
      <circle cx="15" cy="12" r="1.7" />
      <circle cx="9" cy="19" r="1.7" />
      <circle cx="15" cy="19" r="1.7" />
    </svg>
  );
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

export default function AdminSidebar({
  adminUser,
  desktopHidden = false,
  onRequestClose,
  onRequestOpen,
}: AdminSidebarProps) {
  const pathname = usePathname();
  const toast = useToast();

  // Pinned pages — per admin, DB-backed (admin_users.favorites) so pins
  // follow the person across devices. Optimistic toggle, revert on failure.
  const [favorites, setFavorites] = useState<string[]>(() => adminUser.favorites ?? []);

  // The array is the order. The route replaces it whole and its dedupe is a
  // Set, which keeps insertion order, so reordering the pins is the same
  // write as adding one — no second endpoint, and the order follows the
  // person between machines for free.
  const saveFavorites = useCallback(
    async (next: string[], prev: string[], failure: string) => {
      try {
        const res = await fetch("/api/admin/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ favorites: next }),
        });
        if (!res.ok) throw new Error(String(res.status));
      } catch {
        setFavorites(prev);
        toast(failure, { variant: "error" });
      }
    },
    [toast],
  );

  const toggleFavorite = useCallback(
    async (href: string) => {
      const prev = favorites;
      const next = prev.includes(href) ? prev.filter((f) => f !== href) : [...prev, href];
      setFavorites(next);
      await saveFavorites(next, prev, "Couldn't save that pin. Try again.");
    },
    [favorites, saveFavorites],
  );

  // Dragging a pin. `armed` is the one whose grip is held: a row is only
  // draggable while that is true, so an ordinary click on a pin still
  // navigates and a drag from the label does nothing.
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const orderBeforeDrag = useRef<string[] | null>(null);

  // Live reorder under the cursor. The midpoint rule is what stops a row
  // oscillating: moving down only passes a target once the pointer is below
  // its middle, moving up only above it.
  const onPinDragOver = (e: React.DragEvent<HTMLDivElement>, overHref: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!dragKey || dragKey === overHref) return;
    const from = favorites.indexOf(dragKey);
    const to = favorites.indexOf(overHref);
    if (from < 0 || to < 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pastMidpoint = e.clientY > rect.top + rect.height / 2;
    if ((from < to && !pastMidpoint) || (from > to && pastMidpoint)) return;
    const next = [...favorites];
    next.splice(from, 1);
    next.splice(to, 0, dragKey);
    setFavorites(next);
  };

  const endPinDrag = () => {
    const before = orderBeforeDrag.current;
    orderBeforeDrag.current = null;
    setDragKey(null);
    setArmed(null);
    // Grabbed and dropped in place is not a change, and writing it anyway
    // would spend a request to store what is already stored.
    if (before && before.join("\u0000") !== favorites.join("\u0000")) {
      void saveFavorites(favorites, before, "Couldn't save that order. Try again.");
    }
  };
  const pinnedItems = favorites
    .map((href) => pinnableItems.find((i) => i.href === href))
    .filter((i): i is NavItem => !!i);

  // Who leads which page. Shared by the whole team, unlike pins, which are
  // this admin's own — so it is fetched rather than handed down on the user.
  // Failure is silent: no names render and the sidebar is what it was before.
  const [people, setPeople] = useState<Owner[]>([]);
  const [pageOwners, setPageOwners] = useState<PageOwnerMap>({});
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const res = await fetch("/api/admin/page-assignments");
        if (!res.ok) return;
        const data = (await res.json()) as { people?: Owner[]; owners?: PageOwnerMap };
        if (!live) return;
        setPeople(data.people ?? []);
        setPageOwners(data.owners ?? {});
      } catch {
        /* non-critical */
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const toggleOwner = useCallback(
    async (pageKey: string, personId: string, next: boolean) => {
      const person = people.find((p) => p.id === personId);
      if (!person) return;
      const prev = pageOwners;
      const held = prev[pageKey] ?? [];
      const after = next
        ? [...held, person].sort((a, b) => a.name.localeCompare(b.name))
        : held.filter((p) => p.id !== personId);
      setPageOwners({ ...prev, [pageKey]: after });
      try {
        const res = await fetch("/api/admin/page-assignments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pageKey, adminUserId: personId, action: next ? "add" : "remove" }),
        });
        if (!res.ok) throw new Error(String(res.status));
      } catch {
        setPageOwners(prev);
        toast("Couldn't save that assignment. Try again.", { variant: "error" });
      }
    },
    [pageOwners, people, toast],
  );

  // How wide the rail is. Read from storage after mount, never during render,
  // so the server and the first client pass agree on MIN_WIDTH and the markup
  // does not mismatch.
  // Applied to the rail as an inline style rather than a class, because the
  // width is a number now and a Tailwind class cannot be built from one at
  // runtime. Below md the rail is display:none, so it is inert there.
  const [width, setWidth] = useState(MIN_WIDTH);
  const [dragging, setDragging] = useState(false);
  const widthRef = useRef(MIN_WIDTH);
  const dragFrom = useRef<{ x: number; width: number } | null>(null);

  const applyWidth = useCallback((px: number) => {
    const next = clampWidth(px);
    widthRef.current = next;
    setWidth(next);
  }, []);

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(WIDTH_KEY));
      if (Number.isFinite(saved) && saved > 0) applyWidth(saved);
    } catch {
      /* a browser with storage blocked gets the default width */
    }
  }, [applyWidth]);

  const rememberWidth = useCallback(() => {
    try {
      localStorage.setItem(WIDTH_KEY, String(widthRef.current));
    } catch {
      /* ignore */
    }
  }, []);

  // The pointer leaves the 5px handle almost immediately, and pointer capture
  // keeps the events coming — but the cursor and text selection belong to
  // whatever is underneath, so they are held still for the length of a drag.
  useEffect(() => {
    if (!dragging) return;
    const { body } = document;
    const cursor = body.style.cursor;
    const select = body.style.userSelect;
    body.style.cursor = "col-resize";
    body.style.userSelect = "none";
    return () => {
      body.style.cursor = cursor;
      body.style.userSelect = select;
    };
  }, [dragging]);

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
  useEffect(() => {
    // On a cold queue visit, let its essential queries finish before the
    // unrelated MedJobs summary competes for database resources.
    if (window.location.pathname !== "/admin/ad-boost") {
      void refetchCounts();
      return;
    }
    let started = false;
    const run = () => {
      if (started) return;
      started = true;
      window.clearTimeout(fallback);
      void refetchCounts();
    };
    const fallback = window.setTimeout(run, 5_000);
    window.addEventListener(AD_BOOST_QUEUE_SETTLED, run, { once: true });
    return () => {
      window.clearTimeout(fallback);
      window.removeEventListener(AD_BOOST_QUEUE_SETTLED, run);
    };
  }, [refetchCounts]);
  useMedJobsRefresh(refetchCounts);

  // Inbound texts still awaiting a human. Fetched with count_only so the badge
  // costs one cheap COUNT, and re-checked when the tab regains focus — SMS
  // arrives while the admin is elsewhere, and a stale zero is the whole reason
  // a low-volume inbox stops getting opened.
  const [smsUnhandled, setSmsUnhandled] = useState(0);
  const [emailUnhandled, setEmailUnhandled] = useState(0);
  const refetchSmsUnhandled = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/sms-inbox?count_only=true");
      if (!res.ok) return;
      const data = (await res.json()) as { unhandled?: number };
      setSmsUnhandled(data.unhandled ?? 0);
    } catch {
      /* non-critical */
    }
  }, []);
  useEffect(() => {
    void refetchSmsUnhandled();
    const onFocus = () => void refetchSmsUnhandled();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refetchSmsUnhandled]);

  const refetchEmailUnhandled = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/support-email?count_only=true");
      if (!res.ok) return;
      const data = (await res.json()) as { unhandled?: number };
      setEmailUnhandled(data.unhandled ?? 0);
    } catch {
      /* Inbox is inert until migration 171 + Gmail connection are configured. */
    }
  }, []);
  useEffect(() => {
    void refetchEmailUnhandled();
    const onFocus = () => void refetchEmailUnhandled();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refetchEmailUnhandled]);

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
      <aside
        aria-hidden={desktopHidden}
        inert={desktopHidden}
        className={[
          "hidden md:sticky md:top-0 md:flex md:h-dvh md:shrink-0 md:flex-col border-r bg-white",
          // A transition on width is right for the drawer opening and wrong
          // for a drag: 200ms of easing behind the pointer reads as lag.
          dragging ? "" : "transition-[width,opacity,border-color] duration-200 ease-out",
          desktopHidden
            ? "opacity-0 border-transparent pointer-events-none overflow-hidden"
            : "opacity-100 border-gray-100 overflow-y-auto",
        ].join(" ")}
        style={{ width: desktopHidden ? 0 : width }}
      >
        <nav className="flex-1 min-w-52 px-3 pt-3 pb-3">
          {/* The drawer control sits above navigation-level actions so hiding
              the whole rail never competes with Overview or section controls. */}
          {onRequestClose && (
            <div className="mb-1 flex justify-end">
              <SidebarDrawerToggle direction="close" onClick={onRequestClose} />
            </div>
          )}

          <AdminToolSearch tools={searchableTools} hidden={desktopHidden} onRequestOpen={onRequestOpen}>
          {/* Overview — standalone top link, with collapse/expand-all beside it */}
          <div className="flex items-center justify-between mb-3">
            <Link
              href="/admin"
              prefetch={false}
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

          {/* Pinned — this admin's personal shortcut layer. Hidden until
              they star something, so unpinning everything removes it. */}
          {pinnedItems.length > 0 && (
            <div className="mb-3">
              <p className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                Pinned
              </p>
              <div className="space-y-px">
                {pinnedItems.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <div
                      key={item.href}
                      className={[
                        "relative group/item transition-opacity",
                        dragKey === item.href ? "opacity-50" : "",
                      ].join(" ")}
                      draggable={armed === item.href}
                      onDragStart={(e) => {
                        orderBeforeDrag.current = favorites;
                        setDragKey(item.href);
                        e.dataTransfer.effectAllowed = "move";
                        try {
                          e.dataTransfer.setData("text/plain", item.href);
                        } catch {
                          // some browsers throw on setData — cosmetic, the drag still works
                        }
                      }}
                      onDragEnd={endPinDrag}
                      onDragOver={(e) => onPinDragOver(e, item.href)}
                      onDrop={(e) => e.preventDefault()}
                    >
                      <div
                        role="button"
                        aria-label={`Drag to reorder ${item.label}`}
                        title="Drag to reorder"
                        onMouseDown={() => setArmed(item.href)}
                        onMouseUp={() => setArmed(null)}
                        className={[
                          "absolute left-0 top-2 z-10 cursor-grab active:cursor-grabbing rounded p-0.5",
                          "text-gray-300 hover:text-gray-500 transition-opacity duration-100",
                          dragKey === item.href ? "opacity-100" : "opacity-0 group-hover/item:opacity-100",
                        ].join(" ")}
                      >
                        <Grip />
                      </div>
                      {/* draggable={false}: an anchor drags itself by
                          default, which would start a link drag from the
                          label and never reorder anything. Dragging is the
                          grip's job alone. */}
                      <Link
                        href={item.href}
                        prefetch={false}
                        draggable={false}
                        className={[
                          "block pl-5 pr-12 py-1.5 rounded-md text-[13px] transition-colors duration-100",
                          active
                            ? "text-gray-900 font-medium bg-gray-100"
                            : "text-gray-600 hover:text-gray-900 hover:bg-gray-50",
                        ].join(" ")}
                      >
                        <span className="block truncate">{item.label}</span>
                        <OwnerNames people={pageOwners[item.href] ?? []} />
                      </Link>
                      <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5">
                        <OwnersMenu
                          people={people}
                          owners={pageOwners[item.href] ?? []}
                          onToggle={(id, next) => void toggleOwner(item.href, id, next)}
                          label={item.label}
                        />
                        <button
                          onClick={() => toggleFavorite(item.href)}
                          title="Unpin"
                          aria-label={`Unpin ${item.label}`}
                          className="p-0.5 rounded text-amber-400 opacity-0 group-hover/item:opacity-100 hover:text-amber-500 transition-opacity duration-100"
                        >
                          <Star filled />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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
                      const pinned = favorites.includes(item.href);
                      const unread = item.href === "/admin/inbox"
                        ? smsUnhandled
                        : item.href === "/admin/support-email"
                          ? emailUnhandled
                          : 0;
                      return (
                        <div key={item.href} className="relative group/item">
                          <Link
                            href={item.href}
                            prefetch={false}
                            className={[
                              "flex items-start justify-between pl-5 pr-12 py-1.5 rounded-md text-[13px] transition-colors duration-100",
                              active
                                ? "text-gray-900 font-medium bg-gray-100"
                                : unread > 0
                                  ? "text-gray-900 font-semibold hover:bg-gray-50"
                                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-50",
                            ].join(" ")}
                          >
                            <span className="min-w-0">
                              <span className="block truncate">{item.label}</span>
                              <OwnerNames people={pageOwners[item.href] ?? []} />
                            </span>
                            {unread > 0 && (
                              <span className="ml-2 text-[11px] tabular-nums font-semibold text-gray-900 rounded px-1 bg-emerald-100">
                                {unread}
                              </span>
                            )}
                          </Link>
                          <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5">
                            <OwnersMenu
                              people={people}
                              owners={pageOwners[item.href] ?? []}
                              onToggle={(id, next) => void toggleOwner(item.href, id, next)}
                              label={item.label}
                            />
                            <button
                              onClick={() => toggleFavorite(item.href)}
                              title={pinned ? "Unpin" : "Pin to top"}
                              aria-label={`${pinned ? "Unpin" : "Pin"} ${item.label}`}
                              className={[
                                "p-0.5 rounded opacity-0 group-hover/item:opacity-100 transition-opacity duration-100",
                                pinned ? "text-amber-400 hover:text-amber-500" : "text-gray-300 hover:text-amber-400",
                              ].join(" ")}
                            >
                              <Star filled={pinned} />
                            </button>
                          </div>
                        </div>
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
                  const pinned = favorites.includes(item.href);
                  return (
                    <div key={item.href} className="relative group/item">
                      <Link
                        href={item.href}
                        prefetch={false}
                        className={[
                          "flex items-start justify-between pl-5 pr-12 py-1.5 rounded-md text-[13px] transition-colors duration-100",
                          active
                            ? hasUnread
                              ? "bg-gray-100 font-semibold text-gray-900"
                              : "bg-gray-100 font-medium text-gray-900"
                            : hasUnread
                              ? "font-semibold text-gray-900 hover:bg-gray-50"
                              : "font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50",
                        ].join(" ")}
                      >
                        <span className="min-w-0">
                          <span className="block truncate">{item.label}</span>
                          <OwnerNames people={pageOwners[item.href] ?? []} />
                        </span>
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
                      <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5">
                        <OwnersMenu
                          people={people}
                          owners={pageOwners[item.href] ?? []}
                          onToggle={(id, next) => void toggleOwner(item.href, id, next)}
                          label={item.label}
                        />
                        <button
                          onClick={() => toggleFavorite(item.href)}
                          title={pinned ? "Unpin" : "Pin to top"}
                          aria-label={`${pinned ? "Unpin" : "Pin"} ${item.label}`}
                          className={[
                            "p-0.5 rounded opacity-0 group-hover/item:opacity-100 transition-opacity duration-100",
                            pinned ? "text-amber-400 hover:text-amber-500" : "text-gray-300 hover:text-amber-400",
                          ].join(" ")}
                        >
                          <Star filled={pinned} />
                        </button>
                      </div>
                    </div>
                  );
                })}

              </div>
            )}
          </div>

          {/* Young Caregivers section */}
          <div key="young-caregivers" className="mt-1 relative group/item">
            <Link
              href="/admin/young-caregivers"
              prefetch={false}
              className={[
                "w-full flex items-center px-2.5 pr-8 py-1.5 rounded-md text-sm font-semibold transition-colors duration-100",
                isActive("/admin/young-caregivers")
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-800 hover:bg-gray-50",
              ].join(" ")}
            >
              Young Caregivers
            </Link>
            <button
              onClick={() => toggleFavorite("/admin/young-caregivers")}
              title={favorites.includes("/admin/young-caregivers") ? "Unpin" : "Pin to top"}
              aria-label={`${favorites.includes("/admin/young-caregivers") ? "Unpin" : "Pin"} Young Caregivers`}
              className={[
                "absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded opacity-0 group-hover/item:opacity-100 transition-opacity duration-100",
                favorites.includes("/admin/young-caregivers")
                  ? "text-amber-400 hover:text-amber-500"
                  : "text-gray-300 hover:text-amber-400",
              ].join(" ")}
            >
              <Star filled={favorites.includes("/admin/young-caregivers")} />
            </button>
          </div>
          </AdminToolSearch>
        </nav>

        <div className="min-w-52 border-t border-gray-100 px-3 py-3">
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

      {/*
        The resize handle.

        A sibling of the rail rather than a child of it: the rail is the
        scroll container, so anything positioned inside would scroll away
        from the edge it is supposed to sit on. As a flex item in the admin
        layout's row it stays put with no positioning at all.

        Invisible until hovered. It is a 5px strip beside a border that
        already looks like a divider, so drawing it all the time adds a line
        nobody asked for.
      */}
      {!desktopHidden && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the sidebar"
          title="Drag to resize · double-click to reset"
          onPointerDown={(e) => {
            e.preventDefault();
            dragFrom.current = { x: e.clientX, width: widthRef.current };
            e.currentTarget.setPointerCapture(e.pointerId);
            setDragging(true);
          }}
          onPointerMove={(e) => {
            const from = dragFrom.current;
            if (!from) return;
            applyWidth(from.width + (e.clientX - from.x));
          }}
          onPointerUp={(e) => {
            if (!dragFrom.current) return;
            dragFrom.current = null;
            e.currentTarget.releasePointerCapture(e.pointerId);
            setDragging(false);
            rememberWidth();
          }}
          // Lost capture without a pointerup — a dropped pointer, a window
          // switch mid-drag. Ending the drag here keeps the body cursor from
          // staying col-resize over the whole app.
          onLostPointerCapture={() => {
            if (!dragFrom.current) return;
            dragFrom.current = null;
            setDragging(false);
            rememberWidth();
          }}
          onDoubleClick={() => {
            applyWidth(MIN_WIDTH);
            rememberWidth();
          }}
          className={[
            "hidden md:block w-[5px] shrink-0 cursor-col-resize touch-none",
            "transition-colors duration-100",
            dragging ? "bg-primary-300" : "bg-transparent hover:bg-primary-200",
          ].join(" ")}
        />
      )}

      {/* Mobile bottom nav — 5 key items only. Not on a family's case page:
          it floats its own back and Message buttons, and a second fixed bar
          under the conversation ate a third of the screen. */}
      {!/^\/admin\/relationships\/families\/[^/]+$/.test(pathname ?? "") && (
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40">
        <div className="flex justify-around py-2">
          {mobileNavItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
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
      )}
    </>
  );
}
