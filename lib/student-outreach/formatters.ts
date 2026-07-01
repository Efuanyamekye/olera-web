/**
 * Formatters used across the MedJobs admin surface (cards, drawer,
 * specialty list views). Pure functions, no React.
 *
 * Extracted from app/admin/student-outreach/page.tsx as part of the
 * v9.0 MedJobs reorg (Phase 0).
 */

export function formatDueDate(iso: string): string {
  // The day-count MUST be measured in calendar days (local midnight
  // boundaries), not raw elapsed hours. Otherwise two timestamps on the SAME
  // day could read "in 5d" and "in 6d" purely because their clock-times differ
  // (e.g. an 11 AM vs an 8 PM slot on the same date). Counting whole calendar
  // days keeps the countdown aligned with how a human reads the date.
  // (Used by the drawer's NextStepCard; the Calls tab itself now shows the
  // explicit date in each day-section header instead of a relative countdown.)
  const due = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dueDayStart = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const dayDiff = Math.round((dueDayStart - startOfToday) / 86_400_000);
  if (dayDiff < 0) return `${-dayDiff}d overdue`;
  if (dayDiff === 0) {
    // Due today — intraday precision still helps the Today queue.
    const diffMin = Math.round((due.getTime() - now.getTime()) / 60_000);
    if (diffMin < 0) return "due now";
    if (diffMin < 60) return `in ${diffMin}m`;
    return `in ${Math.round(diffMin / 60)}h`;
  }
  return `in ${dayDiff}d`;
}

export function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.round(hr / 24);
  if (d < 14) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Compact form with no "ago" suffix — used inside pills. */
export function formatShortRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  const d = Math.round(hr / 24);
  if (d < 30) return `${d}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatLongDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function humanChannel(channel: string): string {
  switch (channel) {
    case "email":
      return "email";
    case "ig_dm":
      return "IG DM";
    case "contact_form":
      return "contact form";
    default:
      return channel;
  }
}

/**
 * Clean AI artifacts out of an organization name for display. The partner
 * sourcing AI sometimes puts a description in the name field for offices with
 * no named person (e.g. "Health Professions Office (not a named person)").
 * Strip those parentheticals so cards/headers read cleanly. Does not mutate
 * stored data — display-only.
 */
export function cleanOrgName(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .replace(/\s*\((?:not a named person|no named[^)]*|general contact|general)\)\s*/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ── Contact name / role display ──────────────────────────────────────────
//
// The add-contact UI (SpecificContactsSection) stores the role-picker value
// in the contact's `title` field (e.g. "Assistant Dean", "Program Director").
// So `title` is only sometimes a real honorific — a naive
// `[title, first, last].join(" ")` surfaces the ROLE as the display name when
// first/last are empty. These helpers are the single source of truth for
// rendering a contact's name and role, shared by the In-Basket cards (queue
// endpoint) and the drawer header so the two can never disagree.

const HONORIFIC_RE = /^(dr|prof|professor|mr|mrs|ms|mx)\.?$/i;

export interface ContactNameParts {
  title?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  role?: string | null;
}

/** The honorific prefix — only when `title` is a genuine honorific
 *  (Dr./Prof./…), never a role string. */
export function contactHonorific(c: ContactNameParts): string | null {
  const t = c.title?.trim();
  return t && HONORIFIC_RE.test(t) ? t : null;
}

/** A contact's display NAME: parsed first+last (with honorific), else the
 *  legacy `name` column. Never a role. Null when there's no name at all. */
export function displayContactName(c: ContactNameParts): string | null {
  const honorific = contactHonorific(c);
  const person =
    [c.first_name, c.last_name].map((s) => s?.trim() ?? "").filter(Boolean).join(" ") ||
    c.name?.trim() ||
    null;
  return person ? [honorific, person].filter(Boolean).join(" ") : null;
}

/** A contact's ROLE for the subline: explicit `role`, else a non-honorific
 *  `title` (which the add-contact UI stores the role in). */
export function displayContactRole(c: ContactNameParts): string | null {
  if (c.role?.trim()) return c.role.trim();
  const t = c.title?.trim();
  return t && !HONORIFIC_RE.test(t) ? t : null;
}
