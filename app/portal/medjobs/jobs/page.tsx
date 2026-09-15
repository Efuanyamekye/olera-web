import { redirect } from "next/navigation";

/**
 * Redirect /portal/medjobs/jobs → /portal/medjobs (profile page).
 * The Find Jobs board has been retired in favor of a unidirectional flow
 * where providers reach out to students.
 */
export default function MedjobsJobsPage() {
  redirect("/portal/medjobs");
}
