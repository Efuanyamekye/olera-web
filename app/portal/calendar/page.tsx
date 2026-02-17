"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Connection, Profile } from "@/lib/types";
import Badge from "@/components/ui/Badge";

interface Appointment {
  connection: Connection;
  otherProfile: Profile | null;
  isInbound: boolean;
}

// ------------------------------------------------------------------
// Helper: get the Monday..Sunday range for a given week offset
// ------------------------------------------------------------------
function getWeekDays(weekOffset: number): Date[] {
  const today = new Date();
  const day = today.getDay(); // 0=Sun, 1=Mon, ...
  const diffToMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diffToMon + weekOffset * 7);
  monday.setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export default function CalendarPage() {
  const { activeProfile } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const weekDays = useMemo(() => getWeekDays(weekOffset), [weekOffset]);
  const today = useMemo(() => new Date(), []);

  // Derive header label from the week range
  const weekLabel = useMemo(() => {
    const first = weekDays[0];
    const last = weekDays[6];
    if (first.getMonth() === last.getMonth()) {
      return `${MONTH_NAMES[first.getMonth()]} ${first.getDate()}–${last.getDate()}, ${first.getFullYear()}`;
    }
    return `${MONTH_NAMES[first.getMonth()].slice(0, 3)} ${first.getDate()} – ${MONTH_NAMES[last.getMonth()].slice(0, 3)} ${last.getDate()}, ${last.getFullYear()}`;
  }, [weekDays]);

  const fetchAppointments = useCallback(async () => {
    if (!activeProfile || !isSupabaseConfigured()) {
      setLoading(false);
      return;
    }

    try {
      console.time("[olera] fetchAppointments");
      const supabase = createClient();

      // Fetch accepted connections — these are your "appointments"
      const { data: connections, error: connError } = await supabase
        .from("connections")
        .select("*")
        .or(
          `to_profile_id.eq.${activeProfile.id},from_profile_id.eq.${activeProfile.id}`
        )
        .eq("status", "accepted")
        .neq("type", "save")
        .order("updated_at", { ascending: false });

      if (connError) throw new Error(connError.message);

      if (!connections || connections.length === 0) {
        setAppointments([]);
        return;
      }

      // Fetch all related profiles
      const profileIds = new Set<string>();
      connections.forEach((c: Connection) => {
        profileIds.add(c.from_profile_id);
        profileIds.add(c.to_profile_id);
      });

      const { data: profiles } = await supabase
        .from("business_profiles")
        .select("id, display_name, email, phone")
        .in("id", Array.from(profileIds));

      const profileMap = new Map(
        ((profiles as Profile[]) || []).map((p) => [p.id, p])
      );

      const enriched: Appointment[] = (connections as Connection[]).map((c) => ({
        connection: c,
        otherProfile:
          c.from_profile_id === activeProfile.id
            ? profileMap.get(c.to_profile_id) || null
            : profileMap.get(c.from_profile_id) || null,
        isInbound: c.to_profile_id === activeProfile.id,
      }));

      setAppointments(enriched);
    } catch (err: unknown) {
      console.error("[olera] fetchAppointments failed:", err);
      setError(
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : "Failed to load activity"
      );
    } finally {
      setLoading(false);
      console.timeEnd("[olera] fetchAppointments");
    }
  }, [activeProfile]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  // Filter appointments whose accepted date falls on the selected day
  const selectedDayAppointments = useMemo(
    () =>
      appointments.filter((apt) =>
        isSameDay(new Date(apt.connection.updated_at), selectedDate)
      ),
    [appointments, selectedDate]
  );

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full mx-auto" />
        <p className="mt-4 text-gray-500">Loading activity...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Activity</h1>
        <p className="text-lg text-gray-600 mt-1">
          Track your accepted connections and coordinate next steps.
        </p>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 text-red-700 px-4 py-3 rounded-lg text-base flex items-center justify-between" role="alert">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => { setError(""); setLoading(true); fetchAppointments(); }}
            className="text-sm font-medium text-red-700 hover:text-red-800 underline ml-4"
          >
            Retry
          </button>
        </div>
      )}

      {/* Week navigation + calendar strip */}
      <div className="bg-white rounded-xl border border-gray-200 mb-6">
        {/* Week header with nav arrows */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <button
            onClick={() => setWeekOffset((w) => w - 1)}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
            aria-label="Previous week"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>

          <div className="text-center">
            <p className="text-base font-semibold text-gray-900">
              {weekLabel}
            </p>
            {weekOffset !== 0 && (
              <button
                onClick={() => {
                  setWeekOffset(0);
                  setSelectedDate(new Date());
                }}
                className="text-xs text-primary-600 hover:text-primary-700 font-medium mt-0.5"
              >
                Back to today
              </button>
            )}
          </div>

          <button
            onClick={() => setWeekOffset((w) => w + 1)}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
            aria-label="Next week"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        </div>

        {/* Day strip */}
        <div className="grid grid-cols-7 divide-x divide-gray-100">
          {weekDays.map((day, idx) => {
            const isToday = isSameDay(day, today);
            const isSelected = isSameDay(day, selectedDate);
            // Count appointments on this day
            const count = appointments.filter((apt) =>
              isSameDay(new Date(apt.connection.updated_at), day)
            ).length;

            return (
              <button
                key={idx}
                onClick={() => setSelectedDate(day)}
                className={[
                  "flex flex-col items-center py-3 px-1 transition-colors min-h-[72px]",
                  isSelected
                    ? "bg-primary-50"
                    : "hover:bg-gray-50",
                ].join(" ")}
              >
                <span
                  className={[
                    "text-xs font-medium mb-1",
                    isToday ? "text-primary-600" : "text-gray-500",
                  ].join(" ")}
                >
                  {DAY_NAMES[idx]}
                </span>
                <span
                  className={[
                    "w-8 h-8 flex items-center justify-center rounded-full text-sm font-semibold",
                    isSelected
                      ? "bg-primary-600 text-white"
                      : isToday
                      ? "bg-primary-100 text-primary-700"
                      : "text-gray-900",
                  ].join(" ")}
                >
                  {day.getDate()}
                </span>
                {count > 0 && (
                  <span className="w-1.5 h-1.5 rounded-full bg-primary-500 mt-1" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected day heading */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">
          {isSameDay(selectedDate, today)
            ? "Today"
            : selectedDate.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
        </h2>
        <span className="text-sm text-gray-500">
          {selectedDayAppointments.length === 0
            ? "No activity"
            : `${selectedDayAppointments.length} connection${selectedDayAppointments.length !== 1 ? "s" : ""}`}
        </span>
      </div>

      {/* Day content */}
      {selectedDayAppointments.length === 0 ? (
        <div className="bg-gray-50 rounded-xl border border-dashed border-gray-300 p-8 text-center">
          <svg
            className="w-10 h-10 text-gray-300 mx-auto mb-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <p className="text-base text-gray-500">
            No connections on this day.
          </p>
          {appointments.length === 0 && (
            <p className="text-sm text-gray-400 mt-1">
              Accepted connections will appear here so you can coordinate next steps.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {selectedDayAppointments.map((apt) => (
            <AppointmentCard key={apt.connection.id} appointment={apt} />
          ))}
        </div>
      )}

      {/* All appointments list (below calendar) */}
      {appointments.length > 0 && (
        <div className="mt-10">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            All Connections ({appointments.length})
          </h2>
          <div className="space-y-3">
            {appointments.map((apt) => (
              <AppointmentCard key={apt.connection.id} appointment={apt} compact />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AppointmentCard({
  appointment,
  compact = false,
}: {
  appointment: Appointment;
  compact?: boolean;
}) {
  const { connection, otherProfile } = appointment;

  const typeLabel =
    connection.type === "inquiry"
      ? "Inquiry"
      : connection.type === "invitation"
      ? "Invitation"
      : connection.type === "application"
      ? "Application"
      : connection.type;

  const acceptedDate = new Date(connection.updated_at).toLocaleDateString(
    "en-US",
    { month: "short", day: "numeric", year: "numeric" }
  );

  // Pre-filled mailto for "Propose a time"
  const proposalSubject = encodeURIComponent(
    `Meeting time — ${otherProfile?.display_name || "Connection"}`
  );
  const proposalBody = encodeURIComponent(
    `Hi ${otherProfile?.display_name || "there"},\n\nI'd like to propose a time to connect. Would any of these work for you?\n\n- \n- \n\nLooking forward to speaking with you.\n`
  );
  const proposeHref = otherProfile?.email
    ? `mailto:${otherProfile.email}?subject=${proposalSubject}&body=${proposalBody}`
    : null;

  if (compact) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-bold shrink-0">
            {otherProfile?.display_name?.charAt(0).toUpperCase() || "?"}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {otherProfile?.display_name || "Unknown"}
            </p>
            <p className="text-xs text-gray-500">
              {typeLabel} &middot; {acceptedDate}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {proposeHref && (
            <a
              href={proposeHref}
              className="inline-flex items-center gap-1.5 bg-primary-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-primary-700 transition-colors"
            >
              Propose a Time
            </a>
          )}
          <Link
            href={`/portal/connections/${connection.id}`}
            className="text-xs text-primary-600 hover:text-primary-700 font-medium"
          >
            Details
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 flex-wrap mb-2">
            <div className="w-10 h-10 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-sm font-bold shrink-0">
              {otherProfile?.display_name?.charAt(0).toUpperCase() || "?"}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {otherProfile?.display_name || "Unknown"}
              </h3>
              <p className="text-sm text-gray-500">
                {typeLabel} &middot; Accepted {acceptedDate}
              </p>
            </div>
          </div>

          {/* Primary CTA: Propose a Time */}
          <div className="flex flex-wrap gap-2 mt-4">
            {proposeHref && (
              <a
                href={proposeHref}
                className="inline-flex items-center gap-1.5 bg-primary-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                Propose a Time
              </a>
            )}
            {otherProfile?.phone && (
              <a
                href={`tel:${otherProfile.phone}`}
                className="inline-flex items-center gap-1.5 bg-primary-50 text-primary-700 text-sm font-medium px-3 py-2 rounded-lg hover:bg-primary-100 transition-colors"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                  />
                </svg>
                Call
              </a>
            )}
            {otherProfile?.email && (
              <a
                href={`mailto:${otherProfile.email}`}
                className="inline-flex items-center gap-1.5 bg-primary-50 text-primary-700 text-sm font-medium px-3 py-2 rounded-lg hover:bg-primary-100 transition-colors"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                Email
              </a>
            )}
            <Link
              href={`/portal/connections/${connection.id}`}
              className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-700 text-sm font-medium px-3 py-2 rounded-lg hover:bg-gray-200 transition-colors"
            >
              View details
            </Link>
          </div>
        </div>

        <Badge variant="verified">Connected</Badge>
      </div>
    </div>
  );
}
