/**
 * Generates the MedJobs agreement PDFs (Student + Employer) on Olera letterhead
 * using @react-pdf/renderer (no JSX, runs under plain `node`). Each agreement
 * also serves as the "how it works" explainer: plain language, the journey in
 * order, what you agree to at each step, and what Olera does and does not do.
 *
 *   node scripts/gen-medjobs-agreements.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import React from "react";
import { Document, Page, Text, View, Image, renderToBuffer } from "@react-pdf/renderer";

const h = React.createElement;

const EMERALD = "#059669";
const EMERALD_DARK = "#047857";
const GRAY_900 = "#111827";
const GRAY_700 = "#374151";
const GRAY_500 = "#6b7280";
const GRAY_300 = "#d1d5db";

const st = {
  page: { paddingTop: 36, paddingBottom: 48, paddingHorizontal: 52, fontFamily: "Helvetica", fontSize: 10.5, color: GRAY_700, lineHeight: 1.5 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 8, borderBottomWidth: 0.75, borderBottomColor: GRAY_300, marginBottom: 14 },
  brandRow: { flexDirection: "row", alignItems: "center" },
  brandLogo: { width: 18, height: 18, marginRight: 6 },
  brandWord: { fontSize: 16, fontFamily: "Helvetica-Bold", color: EMERALD_DARK, letterSpacing: 0.5 },
  headerTag: { fontSize: 7.5, color: GRAY_500, letterSpacing: 0.6, textTransform: "uppercase" },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", color: GRAY_900, marginBottom: 6 },
  lead: { color: GRAY_700, marginBottom: 6 },
  h2: { fontSize: 12, fontFamily: "Helvetica-Bold", color: GRAY_900, marginTop: 12, marginBottom: 5 },
  p: { color: GRAY_700, marginBottom: 6 },
  pMt: { color: GRAY_700, marginTop: 4, marginBottom: 0 },
  step: { marginBottom: 7 },
  bullet: { color: GRAY_700, marginBottom: 3, paddingLeft: 12 },
  bold: { fontFamily: "Helvetica-Bold", color: GRAY_900 },
  sign: { marginTop: 16, paddingTop: 10, borderTopWidth: 0.75, borderTopColor: GRAY_300, color: GRAY_900, fontFamily: "Helvetica-Bold", fontSize: 10.5 },
  footer: { position: "absolute", bottom: 22, left: 52, right: 52, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.5, borderTopColor: GRAY_300, paddingTop: 5 },
  footerText: { fontSize: 7.5, color: GRAY_500 },
};

// A bullet item is a string, or [boldLead, rest].
function bulletEl(item, key) {
  const body = Array.isArray(item)
    ? [h(Text, { style: st.bold, key: "b" }, item[0] + " "), item[1]]
    : [item];
  return h(Text, { style: st.bullet, key }, "•  ", ...body);
}

function blockEl(b, i) {
  if (b.lead) return h(Text, { style: st.lead, key: i }, b.lead);
  if (b.h2) return h(Text, { style: st.h2, key: i }, b.h2);
  if (b.p) return h(Text, { style: st.p, key: i }, b.p);
  if (b.pkv) return h(Text, { style: st.p, key: i }, h(Text, { style: st.bold }, b.pkv[0] + " "), b.pkv[1]);
  if (b.bullets) return h(View, { key: i, style: { marginBottom: 4 } }, ...b.bullets.map((it, j) => bulletEl(it, j)));
  if (b.sign) return h(Text, { style: st.sign, key: i }, b.sign);
  if (b.step) {
    const { n, title, body, bullets } = b.step;
    const paras = body ? String(body).split("\n\n") : [];
    const children = [];
    children.push(h(Text, { style: st.p, key: "t" }, h(Text, { style: st.bold }, `${n}. ${title} `), paras[0] || ""));
    for (let k = 1; k < paras.length; k++) children.push(h(Text, { style: st.pMt, key: "p" + k }, paras[k]));
    if (bullets) bullets.forEach((it, j) => children.push(bulletEl(it, "b" + j)));
    return h(View, { style: st.step, key: i }, ...children);
  }
  return null;
}

function docEl({ logo, tag, title, blocks }) {
  return h(Document, null,
    h(Page, { size: "LETTER", style: st.page },
      h(View, { style: st.headerRow },
        h(View, { style: st.brandRow },
          logo ? h(Image, { src: logo, style: st.brandLogo }) : null,
          h(Text, { style: st.brandWord }, "Olera"),
        ),
        h(Text, { style: st.headerTag }, tag),
      ),
      h(Text, { style: st.title }, title),
      ...blocks.map(blockEl),
      h(View, { style: st.footer, fixed: true },
        h(Text, { style: st.footerText }, "Draft for review. Not legally binding yet."),
        h(Text, { style: st.footerText }, "olera.care"),
      ),
    ),
  );
}

// ── Student ──────────────────────────────────────────────────────────────────
const STUDENT = {
  tag: "Student Caregiver Program",
  title: "Olera Student Caregiver Program Agreement",
  blocks: [
    { lead: "This agreement explains how the Olera Student Caregiver Program works and what you agree to when you join. It is written for you, the student. Please read it before you start." },
    { h2: "What the program is" },
    { p: "Olera matches pre-health students with local home care agencies for paid caregiving work. You get real, paid experience caring for older adults — the kind of hands-on healthcare experience that medical, nursing, PA, and other professional schools look for — plus mentorship, references, and a recommendation letter for your applications. The program is built as much for students in a gap year as for those currently enrolled." },
    { p: "The agency you work for is your employer. Olera makes the match and supports you along the way; Olera does not employ, pay, or train you for the role — your employer does." },
    { h2: "How it works, step by step" },
    { step: { n: 1, title: "You apply and join.", body: "You can join if you are pursuing a health career and want real patient-care experience, whether you are currently enrolled or in a gap year. When you join, you confirm that you qualify.\n\nJoining is free. Olera does not charge students an application fee or any other fee, at any point. You get lifetime access to the Olera job board, where local providers post caregiver openings, and the application support described below." } },
    { step: { n: 2, title: "You get matched and accept an offer.", body: "Olera matches you with local home care agencies looking for caregivers, and you can browse openings on the job board. You can talk with an agency before you decide. When one wants to bring you on, they make you an offer. You choose the offer you want and accept it. You are never required to accept one." } },
    { step: { n: 3, title: "You get ready before your first shift.", body: "Before you start, you finish your profile and upload any documents we ask for, such as proof of certifications. Your employer provides any training you need for the role. You agree to complete these steps before your first shift. This keeps you and the people you care for safe." } },
    { step: { n: 4, title: "You commit to the term and work your shifts.", body: "You commit to one academic term at a time. Your classes come first, and Olera sets that expectation with every employer up front, so they know your availability works around your course schedule. In return, you take the commitment seriously.\n\nThe agency is your employer. They set your schedule within your availability, pay you through their payroll, and supervise your work. Olera does not set your pay and does not pay you.\n\nWhile you are in the program, you agree to:", bullets: ["keep your availability up to date — the hours you can work outside of class — and submit it so your employer can schedule you", "be flexible and reliable within those hours, including during midterms and finals, and give early notice if your plans change", "show up on time, and only do tasks you have been trained for", "keep private what you learn about the people you care for"] } },
    { step: { n: 5, title: "You build your record.", body: "As you work, you earn experience and reviews from the agencies you work with. When you have earned it, you can also earn references and a recommendation letter. For a letter, Olera gives your employer a short summary of your work and a simple template. You ask, and they decide.\n\nAfter the program, your lifetime job-board access stays yours, and you are welcome to keep working with agencies through Olera for as long as you want." } },
    { h2: "What you get" },
    { bullets: ["real, paid patient-care experience — the healthcare experience that medical, nursing, PA, and other professional schools look for", "bedside-manner experience and real stories for your personal statement, essays, and interviews", "lifetime access to the Olera job board, where local providers post caregiver openings", "reviews from the agencies you work with", "references, if an employer had a good experience with you", "a recommendation letter, if an employer feels you earned one. Olera gives them a short summary of your work and a template to make it easy. You ask, and they decide.", "mentorship, mock interviews, and help writing your letters of recommendation and personal statement from Dr. DuBose's team — included, at no cost to you"] },
    { h2: "What Olera does, and does not do" },
    { pkv: ["Olera does:", "match you with home care agencies, give you lifetime job-board access, support you through the program, and help with your applications."] },
    { pkv: ["Olera does not:", "employ you, pay you, or train you for the role (your employer does), act as your insurer, or promise you a job, a certain amount of pay, a certain number of hours, or admission to any school."] },
    { h2: "A few more things to know" },
    { bullets: [["What it costs you:", "nothing. Olera does not charge students a fee of any kind. Your job-board access and application support are included."], ["More than one employer:", "you can work with more than one agency over time."], ["If it does not work out with an employer:", "talk to us, and we will help you find another match."], ["If we change these terms:", "we will tell you and ask you to accept the new version."], ["Your privacy:", "we handle your information under our privacy policy."]] },
    { h2: "Your agreement" },
    { p: "When you click accept, you are signing this agreement. You confirm that you have read it, that you qualify to join, and that you agree to how the program works as described here. We record the date you accepted." },
    { sign: "Accepted by:   Student name ____________________    Date __________" },
  ],
};

// ── Provider (home care agency; the employer who hires the student) ───────────
const EMPLOYER = {
  tag: "Student Caregiver Program · Providers",
  title: "Olera Provider Agreement",
  blocks: [
    { lead: "This agreement explains how it works to bring on an Olera student caregiver, and what you agree to. It is written for you, the provider — a licensed or registered home care agency. You are free to browse and interview students at no cost; you pay only when you hire." },
    { h2: "What this is" },
    { p: "Olera recruits and vets local pre-health students — pre-nursing, pre-medical, and similar — who want real caregiving experience, and matches them to your agency as caregivers. You review candidates, interview the ones you like, and hire the ones who fit. When you hire a student, you are their employer. Olera makes the match and verifies the student; Olera is not the employer and is not a staffing agency." },
    { h2: "How it works, step by step" },
    { step: { n: 1, title: "You join.", body: "You confirm you are a licensed or registered home care agency. Creating an account is free." } },
    { step: { n: 2, title: "You review and interview candidates.", body: "You browse vetted student caregivers and interview the ones you are interested in. There is no cost to browse, interview, or connect." } },
    { step: { n: 3, title: "You hire, and the fee applies.", body: "When you hire a student, you pay Olera a one-time $200 for that placement, invoiced after the hire. If the student works fewer than 15 hours, we refund it in full. The first 15 hours cover our onboarding cost plus a fair placement fee, so you risk nothing if it does not work out." } },
    { step: { n: 4, title: "You are the employer.", body: "The student works for you. You set the schedule, pay them through your payroll, and supervise the work. You also handle background checks, insurance, and the employment laws that apply to you. Olera does not run your payroll or carry your insurance." } },
    { step: { n: 5, title: "You support the student's record.", body: "Your honest reviews help the student build a record they can use. If a student asks and you feel they earned it, you may write a recommendation letter or agree to be a reference — Olera gives you a short summary of their work and a template to make it easy. That is always your choice.\n\nIf it works out, you are welcome to keep the student on for the long term, and to keep hiring through Olera." } },
    { h2: "Who is responsible for what" },
    { bullets: ["You (the agency): employ the student, set the schedule and pay, supervise the work, and handle hiring and compliance.", "The student: does the care, works professionally, and keeps their profile current.", "Olera: recruits, vets, and matches students, verifies them, and supports the program."] },
    { h2: "Insurance and liability" },
    { p: "Because the student is your employee, all insurance, liability, and legal duties are yours. Olera carries none." },
    { h2: "What Olera does, and does not do" },
    { p: "Olera does: recruit, vet, and match students, verify them, and support the program." },
    { p: "Olera does not: employ the student, pay the student (you do), act as an insurer or staffing agency, or promise any outcome." },
    { h2: "A few more things to know" },
    { bullets: [["Free to browse:", "there is no cost to review candidates, interview, or connect."], ["$200 per hire:", "charged only when you hire, and refunded in full if the student works under 15 hours."], ["Your choice:", "you are never required to make an offer or to keep a student."], ["If we change these terms:", "we will tell you and ask you to accept the new version."], ["Your privacy:", "we handle your information under our privacy policy."]] },
    { h2: "Your agreement" },
    { p: "When you make an offer, you are signing this agreement. You confirm that you have read it, that the role of employer is yours, and that you agree to how this works as described here. We record the date you accepted." },
    { sign: "Accepted by:   Provider name ____________________    Date __________" },
  ],
};

function pageCount(buf) {
  return (buf.toString("latin1").match(/\/Type\s*\/Page(?![s])/g) || []).length;
}

async function main() {
  const pub = path.join(process.cwd(), "public");
  let logo;
  try {
    const b = await fs.readFile(path.join(pub, "olera-logo.png"));
    logo = `data:image/png;base64,${b.toString("base64")}`;
  } catch {
    logo = undefined;
  }
  await fs.mkdir(path.join(pub, "medjobs"), { recursive: true });

  const student = await renderToBuffer(docEl({ logo, ...STUDENT }));
  const employer = await renderToBuffer(docEl({ logo, ...EMPLOYER }));

  await fs.writeFile(path.join(pub, "docs/student-caregiver-agreement-sample.pdf"), student);
  await fs.writeFile(path.join(pub, "docs/employer-agreement-sample.pdf"), employer);
  await fs.writeFile(path.join(pub, "medjobs/employer-agreement.pdf"), employer);

  console.log("Pages — student: %d, employer: %d", pageCount(student), pageCount(employer));
}

main().catch((e) => { console.error(e); process.exit(1); });
