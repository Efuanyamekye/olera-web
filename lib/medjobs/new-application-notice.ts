import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import { resolveCampusUniversity } from "./campus-university-bridge";
import { ROSTER, firstName } from "./assignments";

/**
 * Tell somebody a student has applied.
 *
 * A Slack alert already fires on every application and has done for months.
 * It is not enough: on 30 September the person who works students said she
 * had missed a couple, because the only reliable way to find a new applicant
 * was to remember to go and open the student records and look. A channel
 * everybody can see is a channel nobody owns.
 *
 * So this is addressed. It goes to whoever owns Students at the campus the
 * applicant named, because an email with one name on it is a task and an
 * alert in a channel is weather.
 *
 * One email per application rather than a daily digest. At the volume we are
 * at, a student sitting unanswered for a day costs more than an extra email
 * costs anybody. If that stops being true, this is the place to batch it.
 */

export interface NewApplication {
  profileId: string;
  name: string;
  /** What they typed. May not match any campus we have opened. */
  university: string;
  /** medjobs_universities.id, when the form resolved one. */
  universityId?: string | null;
  program?: string;
  city?: string;
  state?: string;
  /** Whether they finished it, or only started. */
  complete: boolean;
}

const esc = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Who should hear about it.
 *
 * The owner of Students at that campus, if there is one. Otherwise the whole
 * MedJobs team, which is four people: an applicant nobody is told about is a
 * worse outcome than three people deleting an email. A student from a
 * university we have not opened has no campus and no owner, so they take the
 * same path, and that is the case most worth not dropping.
 */
async function recipients(
  db: SupabaseClient,
  app: NewApplication,
): Promise<{ to: string[]; owner: string | null; campusName: string | null }> {
  const fallback = { to: [...ROSTER], owner: null, campusName: null };

  const { data: campuses } = await db
    .from("student_outreach_campuses")
    .select("id, slug, name");
  if (!campuses?.length) return fallback;

  const typed = app.university.trim().toLowerCase();
  let campus: { id: string; name: string } | null = null;
  for (const c of campuses) {
    const { university_id, university_name } = await resolveCampusUniversity(db, c.slug);
    const hit =
      (app.universityId && university_id === app.universityId) ||
      (typed && university_name?.trim().toLowerCase() === typed);
    if (hit) {
      campus = { id: c.id, name: c.name };
      break;
    }
  }
  if (!campus) return fallback;

  const { data: owned } = await db
    .from("medjobs_assignments")
    .select("admin_user_id")
    .eq("campus_id", campus.id)
    .eq("section", "students")
    .maybeSingle();
  if (!owned?.admin_user_id) return { ...fallback, campusName: campus.name };

  const { data: person } = await db
    .from("admin_users")
    .select("email")
    .eq("id", owned.admin_user_id)
    .maybeSingle();
  const email = person?.email?.trim().toLowerCase();
  // An owner who has left the roster is an owner nobody reads for. Fall back
  // rather than send into an address that is not being watched.
  if (!email || !ROSTER.includes(email)) {
    return { ...fallback, campusName: campus.name };
  }
  return { to: [email], owner: email, campusName: campus.name };
}

/**
 * The email itself.
 *
 * Exported so it can be rendered and looked at without waiting for a real
 * student to apply. There is no screen for this anywhere in the admin panel
 * and there should not be: it is a thing that happens once, to one inbox,
 * at the moment somebody applies.
 */
export function newApplicationNoticeHtml(
  app: NewApplication,
  owner: string | null,
  campusName: string | null,
): string {
  const url = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://olera.care"}/admin/medjobs/${app.profileId}`;
  const facts = [
    app.university || "No university given",
    app.program,
    [app.city, app.state].filter(Boolean).join(", "),
  ]
    .filter((v): v is string => Boolean(v))
    .map(esc)
    .join(" &middot; ");

  // Said plainly, because it decides what the reader does next. An
  // application somebody abandoned halfway needs chasing; a finished one
  // needs booking.
  const state = app.complete
    ? "Application: complete."
    : "Application: started but not finished, so the first thing is chasing what is missing.";

  // A campus nobody has opened is the one fact in here worth acting on
  // beyond the applicant themselves.
  const where = campusName
    ? `They are at ${esc(campusName)}, which is on the board.`
    : "We have not opened a campus for their university, so they are on the waiting list under the board rather than in a column.";

  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:1.55;color:#232b2b;max-width:520px">
  <p style="margin:0 0 14px">${owner ? `${esc(firstName(owner))} &mdash; ` : ""}<strong>${esc(app.name)}</strong> applied to the Student Caregiver Program.</p>
  <p style="margin:0 0 14px;color:#687575">${facts}</p>
  <p style="margin:0 0 14px">${state}</p>
  <p style="margin:0 0 18px">${where}</p>
  <p style="margin:0 0 18px"><a href="${esc(url)}" style="display:inline-block;background:#417272;color:#fff;text-decoration:none;padding:9px 16px;border-radius:6px;font-weight:600">Open their record</a></p>
  <p style="margin:0;color:#687575;font-size:13px">Nothing is scheduled on them until somebody picks them up.</p>
</div>`;
}

/**
 * Fire and forget. An application must never fail because a notification
 * did: the student has already submitted, and refusing the request would
 * lose the thing we are trying not to lose.
 */
export async function notifyNewApplication(
  db: SupabaseClient,
  app: NewApplication,
): Promise<void> {
  try {
    const { to, owner, campusName } = await recipients(db, app);
    if (to.length === 0) return;
    await sendEmail({
      to,
      subject: `New student application: ${app.name}${app.university ? `, ${app.university}` : ""}`,
      html: newApplicationNoticeHtml(app, owner, campusName),
      emailType: "medjobs_new_application",
      recipientType: "admin",
      metadata: { profileId: app.profileId, campus: campusName, owner },
    });
  } catch (err) {
    console.error("[medjobs] new application notice failed:", err);
  }
}
