import type { StudentMetadata } from "@/lib/types";
import CaregiverSectionCard, { EmptyState } from "./CaregiverSectionCard";
import { parseSchedule } from "@/components/medjobs/ScheduleBuilder";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function formatTime(t: string): string {
  const [hStr, mStr] = t.split(":");
  const h = parseInt(hStr, 10);
  const m = mStr;
  if (h === 0 && m === "00") return "12am";
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  const ampm = h >= 12 ? "pm" : "am";
  return m === "00" ? `${hour}${ampm}` : `${hour}:${m}${ampm}`;
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

  return (
    <CaregiverSectionCard
      title="Weekly Availability"
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
          {/* Vertical column calendar - neutral colors, minimal accents */}
          <div className="grid grid-cols-7 gap-0 overflow-hidden">
            {DAYS.map((day, dayIdx) => {
              const slots = (schedule[day] || []) as Array<{ start: string; end: string }>;
              const dayHours = slots.reduce((sum, s) => sum + slotHours(s), 0);
              const isLast = dayIdx === DAYS.length - 1;

              return (
                <div
                  key={day}
                  className={`flex flex-col ${!isLast ? "border-r border-gray-100" : ""}`}
                >
                  {/* Day header */}
                  <div className={`px-1.5 py-2 text-center border-b border-gray-100 ${
                    slots.length > 0 ? "bg-gray-50" : "bg-gray-50/50"
                  }`}>
                    <span className={`text-xs font-semibold ${
                      slots.length > 0 ? "text-gray-900" : "text-gray-400"
                    }`}>
                      {day}
                    </span>
                    {dayHours > 0 && (
                      <p className="text-[10px] text-gray-500 mt-0.5">{dayHours}h</p>
                    )}
                  </div>

                  {/* Time slots stacked vertically */}
                  <div className="flex-1 flex flex-col gap-1 p-1.5 min-h-[60px]">
                    {slots.length > 0 ? (
                      slots.map((slot, i) => (
                        <div
                          key={i}
                          className="bg-gray-50 border border-gray-200 rounded-lg px-1.5 py-1.5 text-center"
                        >
                          <p className="text-[11px] font-medium text-gray-700 leading-tight">
                            {formatTime(slot.start)}
                          </p>
                          <p className="text-[9px] text-gray-400 leading-tight">to</p>
                          <p className="text-[11px] font-medium text-gray-700 leading-tight">
                            {formatTime(slot.end)}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="flex-1 flex items-center justify-center">
                        <span className="text-[10px] text-gray-300">—</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Total hours */}
          <div className="mt-3 flex items-center justify-center gap-2">
            <div className="w-2 h-2 rounded-full bg-gray-400" />
            <span className="text-sm font-semibold text-gray-900">{totalHours} hours/week</span>
            <span className="text-xs text-gray-400">available</span>
          </div>
        </div>
      )}
    </CaregiverSectionCard>
  );
}
