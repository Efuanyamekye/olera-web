/**
 * SMS quiet hours — TCPA-aligned send-time gating for care-seeker texts.
 *
 * TCPA quiet hours are 8am–9pm in the RECIPIENT'S local time, not the sender's.
 * Anchoring to a single national clock breaks both ways: 8am ET = 5am PT (too
 * early out West) and 9pm PT = midnight ET (too late back East). So we gate per
 * recipient using their state's timezone.
 *
 * Policy (locked 2026-06-30):
 *   - Window: 8am–8pm recipient-local (8pm, not the legal 9pm max, for headroom).
 *   - Unknown/missing state → national-safe 11am–8pm ET, which keeps West Coast
 *     ≥ 8am local and East Coast ≤ 8pm local under one clock.
 *   - A reactive send that lands outside the window is QUEUED to the next window
 *     open (caller decides whether to honor sendAfter or drop). A 6am reply holds
 *     to 8am; an 11pm reply holds to 8am next day.
 */

export const QUIET_START_HOUR = 8; // 8am local
export const QUIET_END_HOUR = 20; // 8pm local (exclusive)

// National fallback when we don't know the recipient's state: evaluate against
// Eastern time but with a tighter 11am–8pm ET window so both coasts stay legal.
const FALLBACK_TZ = "America/New_York";
const FALLBACK_START_HOUR = 11; // 11am ET == 8am PT
const FALLBACK_END_HOUR = 20; // 8pm ET

/**
 * US state/territory → primary IANA timezone. Multi-zone states map to their
 * dominant zone (good enough for a quiet-hours buffer; the 8pm cap absorbs the
 * 1-hour error in the minority zone).
 */
const STATE_TZ: Record<string, string> = {
  AL: "America/Chicago", AK: "America/Anchorage", AZ: "America/Phoenix",
  AR: "America/Chicago", CA: "America/Los_Angeles", CO: "America/Denver",
  CT: "America/New_York", DE: "America/New_York", DC: "America/New_York",
  FL: "America/New_York", GA: "America/New_York", HI: "Pacific/Honolulu",
  ID: "America/Boise", IL: "America/Chicago", IN: "America/Indiana/Indianapolis",
  IA: "America/Chicago", KS: "America/Chicago", KY: "America/New_York",
  LA: "America/Chicago", ME: "America/New_York", MD: "America/New_York",
  MA: "America/New_York", MI: "America/Detroit", MN: "America/Chicago",
  MS: "America/Chicago", MO: "America/Chicago", MT: "America/Denver",
  NE: "America/Chicago", NV: "America/Los_Angeles", NH: "America/New_York",
  NJ: "America/New_York", NM: "America/Denver", NY: "America/New_York",
  NC: "America/New_York", ND: "America/Chicago", OH: "America/New_York",
  OK: "America/Chicago", OR: "America/Los_Angeles", PA: "America/New_York",
  RI: "America/New_York", SC: "America/New_York", SD: "America/Chicago",
  TN: "America/Chicago", TX: "America/Chicago", UT: "America/Denver",
  VT: "America/New_York", VA: "America/New_York", WA: "America/Los_Angeles",
  WV: "America/New_York", WI: "America/Chicago", WY: "America/Denver",
  PR: "America/Puerto_Rico",
};

/** Resolve a state code (any case, optional whitespace) to an IANA timezone. */
export function stateToTimezone(state?: string | null): string | null {
  if (!state) return null;
  const key = state.trim().toUpperCase();
  return STATE_TZ[key] ?? null;
}

/** Wall-clock parts of `date` rendered in `tz`. */
function wallClockParts(date: Date, tz: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const map: Record<string, number> = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== "literal") map[p.type] = Number(p.value);
  }
  // Intl renders midnight as hour 24 in some engines; normalize to 0.
  if (map.hour === 24) map.hour = 0;
  return map as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** Offset (minutes) of `tz` from UTC at the instant `date`, DST-aware. */
function tzOffsetMinutes(date: Date, tz: string): number {
  const p = wallClockParts(date, tz);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return (asUTC - date.getTime()) / 60000;
}

/** The UTC instant of local wall-time (y,m,d,hour:00) in `tz`. */
function utcForLocalHour(y: number, m: number, d: number, hour: number, tz: string, near: Date): Date {
  const offset = tzOffsetMinutes(near, tz);
  return new Date(Date.UTC(y, m - 1, d, hour, 0, 0) - offset * 60000);
}

export interface QuietHoursResult {
  /** True when `now` is inside the recipient's send window. */
  allowed: boolean;
  /** When blocked, the next instant the window opens; null when allowed. */
  sendAfter: Date | null;
  /** Timezone used to evaluate (recipient's, or the ET fallback). */
  tz: string;
}

/**
 * Is `now` within the recipient's SMS quiet-hours window? When it isn't, returns
 * the next window-open instant in `sendAfter` so a reactive caller can queue.
 */
export function quietHoursCheck(opts: { now?: Date; state?: string | null }): QuietHoursResult {
  const now = opts.now ?? new Date();
  const recipientTz = stateToTimezone(opts.state);
  const tz = recipientTz ?? FALLBACK_TZ;
  const startHour = recipientTz ? QUIET_START_HOUR : FALLBACK_START_HOUR;
  const endHour = recipientTz ? QUIET_END_HOUR : FALLBACK_END_HOUR;

  const local = wallClockParts(now, tz);

  if (local.hour >= startHour && local.hour < endHour) {
    return { allowed: true, sendAfter: null, tz };
  }

  // Before the window opens today → open today at startHour.
  if (local.hour < startHour) {
    return { allowed: false, sendAfter: utcForLocalHour(local.year, local.month, local.day, startHour, tz, now), tz };
  }

  // After the window closed → open the NEXT local calendar day at startHour.
  // Roll the local date forward by one day directly (UTC date math on the local
  // Y/M/D is pure calendar arithmetic — do NOT re-derive wall-clock parts, which
  // would shift the day back across the UTC offset).
  const next = new Date(Date.UTC(local.year, local.month - 1, local.day + 1));
  return {
    allowed: false,
    sendAfter: utcForLocalHour(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), startHour, tz, now),
    tz,
  };
}
