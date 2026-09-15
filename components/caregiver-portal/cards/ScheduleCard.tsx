import type { StudentMetadata } from "@/lib/types";
import CaregiverSectionCard, { EmptyState } from "./CaregiverSectionCard";
import { parseSchedule } from "@/components/medjobs/ScheduleBuilder";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const FULL_DAYS: Record<string, string> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
  Sun: "Sunday",
};

function formatTime(t: string): string {
  const [hStr, mStr] = t.split(":");
  const h = parseInt(hStr, 10);
  const m = mStr;
  if (h === 0 && m === "00") return "12am";
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  const ampm = h >= 12 ? "pm" : "am";
  return m === "00" ? `${hour}${ampm}` : `${hour}:${m}${ampm}`;
}

function formatSlot(slot: { start: string; end: string }): string {
  return `${formatTime(slot.start)}–${formatTime(slot.end)}`;
}

function slotHours(slot: { start: string; end: string }): number {
  const [sh, sm] = slot.start.split(":").map(Number);
  let [eh, em] = slot.end.split(":").map(Number);
  if (eh === 0 && em === 0) { eh = 24; em = 0; }
  return Math.max(0, ((eh * 60 + em) - (sh * 60 + sm)) / 60);
}

interface ScheduleCardProps {
  meta: StudentMetadata;
  onEdit?: () => void;
}

export default function ScheduleCard({ meta, onEdit }: ScheduleCardProps) {
  // Use new field first, fall back to old grid
  const schedule = meta.availability_schedule || parseSchedule(meta.course_schedule_grid);
  const hasSchedule = Object.values(schedule).some((slots) => Array.isArray(slots) && slots.length > 0);

  // Calculate total hours
  let totalHours = 0;
  for (const slots of Object.values(schedule)) {
    if (!Array.isArray(slots)) continue;
    for (const slot of slots) totalHours += slotHours(slot);
  }
  totalHours = Math.round(totalHours * 10) / 10;

  // Get days with availability for mobile view
  const activeDays = DAYS.filter((day) => {
    const slots = schedule[day];
    return Array.isArray(slots) && slots.length > 0;
  });

  return (
    <CaregiverSectionCard
      title="Availability"
      isComplete={hasSchedule}
      id="schedule"
      onEdit={onEdit}
    >
      {!hasSchedule ? (
        <EmptyState
          message="No availability set"
          subMessage="Add the times you're available each week so providers can match with you."
          icon={
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
          }
        />
      ) : (
        <div>
          {/* Mobile: Clean vertical list showing only active days */}
          <div className="sm:hidden space-y-2">
            {activeDays.map((day) => {
              const slots = (schedule[day] || []) as Array<{ start: string; end: string }>;
              return (
                <div
                  key={day}
                  className="flex items-baseline gap-3 py-2 border-b border-gray-100 last:border-0"
                >
                  <span className="w-20 shrink-0 text-sm font-medium text-gray-900">
                    {FULL_DAYS[day]}
                  </span>
                  <span className="text-sm text-gray-600">
                    {slots.map((slot) => formatSlot(slot)).join(", ")}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Desktop: Compact 7-column grid */}
          <div className="hidden sm:grid grid-cols-7 gap-px bg-gray-100 rounded-lg overflow-hidden">
            {DAYS.map((day) => {
              const slots = (schedule[day] || []) as Array<{ start: string; end: string }>;
              const hasSlots = slots.length > 0;

              return (
                <div
                  key={day}
                  className={`flex flex-col bg-white ${hasSlots ? "" : "opacity-50"}`}
                >
                  {/* Day header */}
                  <div className={`px-2 py-2 text-center ${hasSlots ? "bg-gray-50" : ""}`}>
                    <span className={`text-xs font-semibold ${hasSlots ? "text-gray-900" : "text-gray-400"}`}>
                      {day}
                    </span>
                  </div>

                  {/* Time slots */}
                  <div className="flex-1 flex flex-col gap-1 p-1.5 min-h-[48px]">
                    {hasSlots ? (
                      slots.map((slot, i) => (
                        <div
                          key={i}
                          className="bg-primary-50 rounded px-1.5 py-1 text-center"
                        >
                          <p className="text-[11px] font-medium text-primary-700 leading-tight">
                            {formatSlot(slot)}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="flex-1 flex items-center justify-center">
                        <span className="text-xs text-gray-300">—</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Total hours - cleaner presentation */}
          <div className="mt-4 text-center">
            <span className="text-sm text-gray-600">
              <span className="font-semibold text-gray-900">{totalHours} hours</span> per week
            </span>
          </div>
        </div>
      )}
    </CaregiverSectionCard>
  );
}
