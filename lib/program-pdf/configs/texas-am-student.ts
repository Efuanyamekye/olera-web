/**
 * Texas A&M — STUDENT-facing program flyer config.
 *
 * The partner channel (advising offices + student organizations) shares this
 * with pre-health students. It reuses the same one-page renderer as the
 * provider brochure (lib/program-pdf/Template.tsx) but flips every
 * audience-specific label via the optional fields on ProgramPdfConfig, so the
 * sections read for a student deciding whether to JOIN — not for an agency
 * deciding whether to hire (no pricing/vetting/agency framing).
 *
 * To add another university's student flyer: copy this file, swap the name +
 * accent + ctaUrl, and register it in configs/index.ts under the student map.
 */

import type { ProgramPdfConfig } from "./texas-am";
import { studentApplyUrl } from "@/lib/medjobs/apply-link";

export const TEXAS_AM_STUDENT: ProgramPdfConfig = {
  slug: "texas-am",
  audience: "student",
  universityName: "Texas A&M University",
  universityShort: "Texas A&M",
  localArea: "Bryan/College Station area",
  universityAccent: "#500000",
  // The QR/CTA goes straight to the application, pre-filled to this campus and
  // tagged for attribution (campus-level — one flyer serves every partner).
  // Hardcode the production base so the shared artifact never points at a
  // preview deployment. The displayed URL under the QR is cleaned in Template.
  ctaUrl: studentApplyUrl({
    campusSlug: "texas-am",
    universityName: "Texas A&M University",
    source: "flyer",
    siteUrl: "https://olera.care",
  }),
  universityTagLine: "For pre-health students",
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
    "Olera matches Texas A&M pre-health students and gap-year applicants with local home care agencies as paid caregivers in the Bryan/College Station area. You get the hands-on patient-care experience that medical, nursing, PA, and other professional schools look for — plus mentorship, references, and a recommendation letter — on a schedule that works around your classes. Agencies near campus are hiring student caregivers now.",
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
  // Repurposed "vetting" section → eligibility for students.
  vetting: [
    "Open to any Texas A&M pre-health major — current students and gap-year applicants.",
    "No prior experience required.",
    "Your employer provides training for the role.",
    "Background check handled as part of onboarding.",
  ],
  // Repurposed "pricing" block → what to expect.
  pricing: {
    headline: "Paid hourly · flexible hours · free to join",
    body: "There is no fee to join. You get lifetime access to the Olera job board, plus mentorship, mock interviews, and help with your letters and personal statement from Dr. DuBose's team. You choose how much you work, around your classes.",
  },
  ctaLabel: "Check eligibility: scan or visit",
};
