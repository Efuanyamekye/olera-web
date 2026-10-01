/**
 * Generic (campus-agnostic) STUDENT-facing program flyer config.
 *
 * Serves the public /medjobs#help share card, where no campus is in scope, and
 * acts as the fallback for any campus that doesn't yet have its own student
 * config. Per-campus personalization (Texas A&M, etc.) still flows through the
 * partner portal + outreach emails, which know the slug — this is the "any
 * pre-health student, any school" version.
 *
 * Same one-page renderer as every other config (Template.tsx); it just leaves
 * the university-specific labels generic. The QR/CTA goes to the application
 * tagged src=flyer (no campus attribution, since the channel is open share).
 */

import type { ProgramPdfConfig } from "./texas-am";
import { studentApplyUrl } from "@/lib/medjobs/apply-link";

export const GENERIC_STUDENT: ProgramPdfConfig = {
  slug: "generic",
  audience: "student",
  universityName: "Pre-Health Students",
  universityShort: "", // Title collapses to "Olera's Student Caregiver Program"
  localArea: "your area",
  universityAccent: "#047857", // Olera emerald (no university accent for the generic flyer)
  ctaUrl: studentApplyUrl({
    source: "flyer",
    siteUrl: "https://olera.care",
  }),
  universityTagLine: "Paid caregiving program",
  subtitle: "A paid Student Caregiver Program for pre-nursing and pre-medical students",
  documentSubject: "Student Caregiver Program flyer",
  sectionHeaders: {
    benefits: "Why students join",
    steps: "How to join",
    vetting: "Who can join",
    pricing: "What to expect",
  },
  heroHeadline: "Get paid for real caregiving experience that strengthens your health-school application.",
  heroSubhead:
    "Olera matches pre-health students and gap-year applicants with local home care agencies as paid caregivers. You get the hands-on patient-care experience that medical, nursing, PA, and other professional schools look for — plus mentorship, references, and a recommendation letter — on a schedule that works around your classes. Agencies near you are hiring student caregivers now.",
  benefits: [
    { title: "Get paid", body: "Earn an hourly wage for meaningful work — a real job, not a volunteer gig." },
    { title: "Healthcare experience that counts", body: "Hands-on patient-care experience — exactly what medical, nursing, PA, and other professional schools look for." },
    { title: "References + a recommendation letter", body: "Build a record from people who watched you work, plus real stories for your personal statement and interviews." },
    { title: "Coaching from Dr. DuBose's team", body: "Mentorship, mock interviews, and help with your letters and personal statement — included, around your class schedule." },
  ],
  steps: [
    "Check your eligibility in a few minutes.",
    "Apply, get screened, and onboard.",
    "Get matched with a local home care agency that needs caregivers.",
    "Start your shifts and start earning.",
  ],
  vetting: [
    "Open to any pre-health major — current students and gap-year applicants.",
    "No prior experience required.",
    "Your employer provides training for the role.",
    "Background check handled as part of onboarding.",
  ],
  pricing: {
    headline: "Paid hourly · flexible hours · free to join",
    body: "There is no fee to join. You get lifetime access to the Olera job board, plus mentorship, mock interviews, and help with your letters and personal statement from Dr. DuBose's team. You choose how much you work, around your classes.",
  },
  ctaLabel: "Check eligibility: scan or visit",
};
