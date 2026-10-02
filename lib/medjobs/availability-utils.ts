/**
 * Availability filtering utilities for interview scheduling.
 *
 * Used by ScheduleInterviewModal, CandidateBottomSheet, and InterviewCalendar
 * to filter date/time options based on student availability.
 */

/** Student's weekly availability schedule - day name to array of time windows */
export type AvailabilitySchedule = Record<string, Array<{ start: string; end: string }>>;

/** Time slots from 8 AM to 6 PM in 30-min increments */
export const TIME_SLOTS = [
  "08:00", "08:30", "09:00", "09:30", "10:00", "10:30",
  "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
  "17:00", "17:30", "18:00",
];

/** Day keys matching availability_schedule format, indexed by Date.getDay() */
const DAY_KEYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Convert a Date to the day key used in availability_schedule (Mon, Tue, etc.) */
export function getDayKey(date: Date): string {
  return DAY_KEYS[date.getDay()];
}

/** Check if a date has any availability windows */
export function hasAvailabilityOnDate(
  date: Date,
  availability: AvailabilitySchedule | undefined
): boolean {
  if (!availability) return true; // No availability data = show all
  const dayKey = getDayKey(date);
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

/** Get filtered time slots for a specific date based on availability */
export function getAvailableTimeSlots(
  date: Date,
  availability: AvailabilitySchedule | undefined
): string[] {
  if (!availability) return TIME_SLOTS; // No availability data = show all
  const dayKey = getDayKey(date);
  const windows = availability[dayKey];
  if (!Array.isArray(windows) || windows.length === 0) return [];
  return TIME_SLOTS.filter((slot) => isTimeInWindows(slot, windows));
}

/** Generate date options for next 30 days, filtered by availability */
export function getDateOptions(
  availability?: AvailabilitySchedule
): { value: string; label: string }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const options: { value: string; label: string }[] = [];

  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);

    // Skip dates where student has no availability
    if (!hasAvailabilityOnDate(d, availability)) continue;

    const dateStr = d.toISOString().split("T")[0];

    let label: string;
    if (i === 0) {
      label = "Today";
    } else if (i === 1) {
      label = "Tomorrow";
    } else {
      label = d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
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
