/**
 * Availability filtering utilities for interview scheduling.
 *
 * Used by ScheduleInterviewModal, CandidateBottomSheet, and InterviewCalendar
 * to filter date/time options based on student availability.
 *
 * TIMEZONE HANDLING:
 * Student availability is defined in their university's timezone. When filtering
 * dates/times, pass the student's timezone to ensure correct day-of-week matching.
 * Without a timezone, functions fall back to browser-local time (legacy behavior).
 */

import { DEFAULT_TIMEZONE } from "./timezone";

/** Student's weekly availability schedule - day name to array of time windows */
export type AvailabilitySchedule = Record<string, Array<{ start: string; end: string }>>;

/** Time slots from 8 AM to 6 PM in 30-min increments */
export const TIME_SLOTS = [
  "08:00", "08:30", "09:00", "09:30", "10:00", "10:30",
  "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
  "17:00", "17:30", "18:00",
];

/** Day keys matching availability_schedule format, indexed by getUTCDay() */
const DAY_KEYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Convert a Date to the day key used in availability_schedule (Mon, Tue, etc.)
 * If timezone is provided, determines the day in that timezone.
 * Otherwise uses the browser's local timezone (legacy behavior).
 */
export function getDayKey(date: Date, timezone?: string): string {
  if (!timezone) {
    return DAY_KEYS[date.getDay()];
  }
  // Format in the target timezone to get the weekday
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  });
  return formatter.format(date);
}

/**
 * Get the day key for a YYYY-MM-DD date string.
 * Day of week is calendar-based (Oct 7, 2024 is always Monday).
 */
function getDayKeyFromDateStr(dateStr: string): string {
  // Use UTC noon to avoid any DST edge cases
  const d = new Date(`${dateStr}T12:00:00Z`);
  return DAY_KEYS[d.getUTCDay()];
}

/**
 * Get today's date string (YYYY-MM-DD) in a specific timezone.
 */
function getTodayInTimezone(timezone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

/**
 * Add days to a YYYY-MM-DD date string.
 */
function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

/**
 * Check if a date has any availability windows.
 * If timezone is provided, determines the day in that timezone.
 */
export function hasAvailabilityOnDate(
  date: Date,
  availability: AvailabilitySchedule | undefined,
  timezone?: string
): boolean {
  if (!availability) return true; // No availability data = show all
  const dayKey = getDayKey(date, timezone);
  const windows = availability[dayKey];
  return Array.isArray(windows) && windows.length > 0;
}

/** Check if a time slot falls within any of the availability windows */
export function isTimeInWindows(
  time: string,
  windows: Array<{ start: string; end: string }>
): boolean {
  return windows.some(({ start, end }) => time >= start && time < end);
}

/**
 * Get filtered time slots for a specific date based on availability.
 * If timezone is provided, determines the day in that timezone.
 */
export function getAvailableTimeSlots(
  date: Date,
  availability: AvailabilitySchedule | undefined,
  timezone?: string
): string[] {
  if (!availability) return TIME_SLOTS; // No availability data = show all
  const dayKey = getDayKey(date, timezone);
  const windows = availability[dayKey];
  if (!Array.isArray(windows) || windows.length === 0) return [];
  return TIME_SLOTS.filter((slot) => isTimeInWindows(slot, windows));
}

/**
 * Generate date options for next 30 days, filtered by availability.
 * Dates are determined relative to "today" in the student's timezone.
 */
export function getDateOptions(
  availability?: AvailabilitySchedule,
  timezone: string = DEFAULT_TIMEZONE
): { value: string; label: string }[] {
  // Get today's date in the student's timezone
  const todayStr = getTodayInTimezone(timezone);
  const options: { value: string; label: string }[] = [];

  for (let i = 0; i < 30; i++) {
    const dateStr = addDays(todayStr, i);
    const dayKey = getDayKeyFromDateStr(dateStr);

    // Skip dates where student has no availability
    const windows = availability?.[dayKey];
    if (availability && (!Array.isArray(windows) || windows.length === 0)) {
      continue;
    }

    let label: string;
    if (i === 0) {
      label = "Today";
    } else if (i === 1) {
      label = "Tomorrow";
    } else {
      // Format for display using UTC (since dateStr is a calendar date)
      const d = new Date(`${dateStr}T12:00:00Z`);
      label = d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      });
    }

    options.push({ value: dateStr, label });
  }

  return options;
}

/** Format 24-hour time to 12-hour display format */
export function formatTimeSlot(time24: string): string {
  const [hours, minutes] = time24.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  return minutes === 0
    ? `${hour12}:00 ${period}`
    : `${hour12}:${minutes.toString().padStart(2, "0")} ${period}`;
}
