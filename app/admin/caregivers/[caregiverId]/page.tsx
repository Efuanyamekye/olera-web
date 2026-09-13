"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Badge from "@/components/ui/Badge";
import type { StudentMetadata } from "@/lib/types";

interface ConnectionRow {
  id: string;
  type: string;
  status: string;
  message: string | null;
  created_at: string;
  to_profile: {
    id: string;
    display_name: string;
    type: string;
    slug: string;
  } | null;
}

interface InvitationRow {
  id: string;
  type: string;
  status: string;
  message: string | null;
  created_at: string;
  from_profile: {
    id: string;
    display_name: string;
    type: string;
    slug: string;
  } | null;
}

interface InterviewRow {
  id: string;
  status: string;
  type: string;
  proposed_time: string;
  confirmed_time: string | null;
  duration_minutes: number;
  location: string | null;
  notes: string | null;
  created_at: string;
  provider_profile: {
    id: string;
    display_name: string;
    slug: string;
  } | null;
}

function getStatusVariant(status: string): "pending" | "verified" | "rejected" | "default" {
  switch (status) {
    case "pending": return "pending";
    case "accepted":
    case "confirmed":
    case "completed":
      return "verified";
    case "declined":
    case "cancelled":
    case "no_show":
      return "rejected";
    default: return "default";
  }
}

export default function AdminStudentDetailPage() {
  const { caregiverId: studentId } = useParams<{ caregiverId: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [student, setStudent] = useState<any>(null);
  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [interviews, setInterviews] = useState<InterviewRow[]>([]);
  const [connectionCount, setConnectionCount] = useState(0);

  const fetchStudent = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/caregivers/${studentId}`);
      if (!res.ok) {
        router.push("/admin/caregivers");
        return;
      }
      const data = await res.json();
      setStudent(data.student);
      setConnections(data.connections ?? []);
      setInvitations(data.invitations ?? []);
      setInterviews(data.interviews ?? []);
      setConnectionCount(data.connectionCount ?? 0);
    } catch (err) {
      console.error("Failed to fetch student:", err);
    } finally {
      setLoading(false);
    }
  }, [studentId, router]);

  useEffect(() => {
    fetchStudent();
  }, [fetchStudent]);

  async function handleDelete() {
    if (!confirm(`Permanently delete "${student?.display_name}"? This will also delete all their applications. This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/caregivers/${studentId}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/admin/caregivers");
      }
    } catch {
      // ignore
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-lg text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!student) return null;

  const meta = (student.metadata || {}) as StudentMetadata;
  const isGuest = !student.account_id;

  return (
    <div className="max-w-4xl">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <Link
          href="/admin/caregivers"
          className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Students
        </Link>
      </div>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{student.display_name}</h1>
        <div className="flex items-center gap-3 mt-2">
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            Student
          </span>
          {isGuest ? (
            <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 rounded-full text-xs font-medium">
              Guest
            </span>
          ) : (
            <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">
              Member
            </span>
          )}
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
            student.is_active
              ? "bg-green-100 text-green-700"
              : "bg-gray-100 text-gray-600"
          }`}>
            {student.is_active ? "Active" : "Paused"}
          </span>
          <span className="text-sm text-gray-500">
            {connectionCount} application{connectionCount !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      <div className="space-y-6">
        {/* Identity */}
        <Section title="Identity">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ReadOnlyField label="Name" value={student.display_name} />
            <ReadOnlyField label="Email" value={student.email} />
            <ReadOnlyField label="Phone" value={student.phone} />
            <ReadOnlyField
              label="Location"
              value={student.city && student.state ? `${student.city}, ${student.state}` : student.city || student.state}
            />
            <ReadOnlyField label="Source" value={student.source} />
            <ReadOnlyField
              label="Profile Completeness"
              value={meta.profile_completeness ? `${meta.profile_completeness}%` : null}
            />
          </div>
        </Section>

        {/* Education */}
        <Section title="Education">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ReadOnlyField label="University" value={meta.university} />
              <ReadOnlyField label="Campus" value={meta.campus} />
              <ReadOnlyField label="Major" value={meta.major} />
              <ReadOnlyField label="Graduation Year" value={meta.graduation_year?.toString()} />
              <ReadOnlyField label="GPA" value={meta.gpa?.toFixed(2)} />
              <ReadOnlyField label="Program Track" value={meta.program_track} />
              <ReadOnlyField label="Intended Professional School" value={meta.intended_professional_school} />
            </div>
          </Section>

        {/* Experience */}
        <Section title="Experience">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ReadOnlyField
              label="Certifications"
              value={meta.certifications?.length ? meta.certifications.join(", ") : null}
            />
            <ReadOnlyField
              label="Years of Experience"
              value={meta.years_caregiving?.toString()}
            />
            <ReadOnlyField
              label="Languages"
              value={meta.languages?.length ? meta.languages.join(", ") : null}
            />
            <ReadOnlyField
              label="Care Experience Types"
              value={meta.care_experience_types?.length ? meta.care_experience_types.join(", ") : null}
            />
            <ReadOnlyField
              label="Skills"
              value={meta.skills?.length ? meta.skills.join(", ") : null}
            />
          </div>
          {meta.experience_entries && meta.experience_entries.length > 0 && (
            <details className="mt-4">
              <summary className="text-sm font-medium text-gray-500 cursor-pointer hover:text-gray-700 transition-colors">
                Experience entries ({meta.experience_entries.length})
              </summary>
              <div className="mt-3 space-y-3">
                {meta.experience_entries.map((entry) => (
                  <div key={entry.id} className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900">{entry.title}</p>
                      <span className="px-1.5 py-0.5 text-xs bg-gray-200 text-gray-600 rounded">
                        {entry.tag}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{entry.description}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {entry.start_date} – {entry.end_date || "Present"}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          )}
        </Section>

        {/* Availability */}
        <Section title="Availability">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ReadOnlyField label="Availability Type" value={meta.availability_type} />
            <ReadOnlyField label="Hours Per Week" value={meta.hours_per_week?.toString() || meta.hours_per_week_range} />
            <ReadOnlyField label="Available Start" value={meta.available_start} />
            <ReadOnlyField label="Duration Commitment" value={meta.duration_commitment} />
            <ReadOnlyField label="Has Transportation" value={meta.transportation ? "Yes" : meta.transportation === false ? "No" : null} />
            <ReadOnlyField label="Willing to Relocate" value={meta.willing_to_relocate ? "Yes" : meta.willing_to_relocate === false ? "No" : null} />
            <ReadOnlyField label="Max Commute" value={meta.max_commute_miles ? `${meta.max_commute_miles} miles` : null} />
            <ReadOnlyField label="Seeking Status" value={meta.seeking_status} />
          </div>
          {meta.availability_notes && (
            <div className="mt-4">
              <ReadOnlyField label="Availability Notes" value={meta.availability_notes} />
            </div>
          )}
        </Section>

        {/* Documents & Media */}
        {(meta.resume_url || meta.video_intro_url || meta.linkedin_url || meta.drivers_license_url) && (
          <Section title="Documents & Media">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {meta.resume_url && (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-gray-500">Resume</p>
                  <a
                    href={meta.resume_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary-600 hover:text-primary-700"
                  >
                    View Resume →
                  </a>
                </div>
              )}
              {meta.video_intro_url && (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-gray-500">Video Intro</p>
                  <a
                    href={meta.video_intro_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary-600 hover:text-primary-700"
                  >
                    Watch Video →
                  </a>
                </div>
              )}
              {meta.linkedin_url && (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-gray-500">LinkedIn</p>
                  <a
                    href={meta.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary-600 hover:text-primary-700"
                  >
                    View Profile →
                  </a>
                </div>
              )}
              {meta.drivers_license_url && (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-gray-500">Driver&apos;s License</p>
                  <p className="text-sm text-gray-600">
                    Uploaded {meta.drivers_license_uploaded_at ? new Date(meta.drivers_license_uploaded_at).toLocaleDateString() : ""}
                    {meta.drivers_license_expiration && ` · Expires ${meta.drivers_license_expiration}`}
                  </p>
                </div>
              )}
            </div>
          </Section>
        )}

        {/* Commitments & Pledges */}
        {(meta.ncns_pledge || meta.school_balance_pledge || meta.advance_notice_pledge || meta.prn_willing) && (
          <Section title="Commitments & Pledges">
            <div className="flex flex-wrap gap-2">
              {meta.ncns_pledge && (
                <span className="px-3 py-1.5 bg-green-100 text-green-700 rounded-full text-sm">
                  ✓ No Call No Show Pledge
                </span>
              )}
              {meta.school_balance_pledge && (
                <span className="px-3 py-1.5 bg-green-100 text-green-700 rounded-full text-sm">
                  ✓ School Balance Pledge
                </span>
              )}
              {meta.advance_notice_pledge && (
                <span className="px-3 py-1.5 bg-green-100 text-green-700 rounded-full text-sm">
                  ✓ Advance Notice Pledge
                </span>
              )}
              {meta.prn_willing && (
                <span className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-full text-sm">
                  PRN Available
                </span>
              )}
            </div>
          </Section>
        )}

        {/* Interview History */}
        {interviews.length > 0 && (
          <Section title="Interview History">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-gray-500">Provider</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-500">Type</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-500">Status</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-500">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {interviews.map((interview) => (
                    <tr key={interview.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2">
                        {interview.provider_profile?.slug ? (
                          <Link
                            href={`/provider/${interview.provider_profile.slug}`}
                            target="_blank"
                            className="text-primary-600 hover:text-primary-700 font-medium"
                          >
                            {interview.provider_profile.display_name}
                          </Link>
                        ) : (
                          <span className="text-gray-900">{interview.provider_profile?.display_name ?? "Unknown"}</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant="default">{interview.type}</Badge>
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant={getStatusVariant(interview.status)}>{interview.status}</Badge>
                      </td>
                      <td className="px-4 py-2 text-gray-500">
                        {interview.confirmed_time
                          ? new Date(interview.confirmed_time).toLocaleString()
                          : new Date(interview.proposed_time).toLocaleString() + " (proposed)"
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {/* Applications (connections made by student) */}
        <Section title="Applications">
          {connections.length === 0 ? (
            <p className="text-sm text-gray-400">No applications found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-gray-500">Provider</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-500">Type</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-500">Status</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-500">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {connections.map((conn) => (
                    <tr key={conn.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2">
                        {conn.to_profile?.slug ? (
                          <Link
                            href={`/provider/${conn.to_profile.slug}`}
                            target="_blank"
                            className="text-primary-600 hover:text-primary-700 font-medium"
                          >
                            {conn.to_profile.display_name}
                          </Link>
                        ) : (
                          <span className="text-gray-900">{conn.to_profile?.display_name ?? "Unknown"}</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant="default">{conn.type}</Badge>
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant={getStatusVariant(conn.status)}>{conn.status}</Badge>
                      </td>
                      <td className="px-4 py-2 text-gray-500">
                        {new Date(conn.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* Invitations (from providers) */}
        {invitations.length > 0 && (
          <Section title="Invitations Received">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-gray-500">Provider</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-500">Status</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-500">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {invitations.map((inv) => (
                    <tr key={inv.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2">
                        {inv.from_profile?.slug ? (
                          <Link
                            href={`/provider/${inv.from_profile.slug}`}
                            target="_blank"
                            className="text-primary-600 hover:text-primary-700 font-medium"
                          >
                            {inv.from_profile.display_name}
                          </Link>
                        ) : (
                          <span className="text-gray-900">{inv.from_profile?.display_name ?? "Unknown"}</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant={getStatusVariant(inv.status)}>{inv.status}</Badge>
                      </td>
                      <td className="px-4 py-2 text-gray-500">
                        {new Date(inv.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {/* Danger Zone */}
        <div className="rounded-xl border border-red-200 bg-red-50 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-red-800">Danger Zone</h2>
              <p className="text-sm text-red-600 mt-1">
                Permanently delete this student and all their applications. This cannot be undone.
              </p>
            </div>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {deleting ? "Deleting..." : "Delete Student"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">{title}</h2>
      {children}
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="text-sm text-gray-900">{value || <span className="text-gray-400">Not provided</span>}</p>
    </div>
  );
}
