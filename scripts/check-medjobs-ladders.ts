/**
 * The MedJobs ladders have to stay wired to the scripts document.
 *
 * Three things on the Tasks board are the same string by construction: the
 * rung title on the task screen, the entry in the contents, and the heading
 * of the section it links to. They stay the same because both sides call
 * scriptSlug() — but that only holds if every rung actually has a section,
 * every route names a rung that exists, and no branch is left with no way in.
 *
 * None of those fail loudly. A rung with no section gives you a link to
 * nothing; a goto naming a deleted rung strands a record; TaskView renders
 * `null` for a step that is off the end, so the symptom is a blank drawer
 * rather than an error. This turns all three into a build failure.
 *
 * Run by `npm run check:ladders`, and by prebuild.
 */

import { LADDERS, SECTION_ORDER } from "../lib/medjobs/ladders";
import { scriptSlug, SWEEPS } from "../lib/medjobs/task-board";
import { seedSections, NON_RUNG_SECTIONS, READS_FIRST_ANCHORS } from "../lib/medjobs/scripts-seed";

/** The two sections written by their own handler rather than the record one. */
const REPLY_UNSAFE = new Set<string>(["students", "jobboard"]);

const problems: string[] = [];
const note = (s: string) => problems.push(s);

const seeded = new Set(
  seedSections()
    .filter((s) => s.kind === "rung")
    .map((s) => s.slug),
);

// The two sweeps are reached by the board making a synthetic record for the
// campus, not by an action on another rung. They are branches with a door
// that is not a goto.
const sweepBranches = new Set(Object.values(SWEEPS).map((s) => s.branch));

let rungs = 0;
const reachable = new Set<string>();

for (const section of SECTION_ORDER) {
  const ladder = LADDERS[section];
  const named = new Set<string>();
  const doors = new Set<string>();

  ladder.steps.forEach((rung) => {
    if (rung.name) named.add(rung.name);
    if (rung.branch) named.add(rung.branch);
    (rung.actions ?? []).forEach((a) => a.goto && doors.add(a.goto));
  });

  ladder.steps.forEach((rung, step) => {
    rungs += 1;
    const where = `${section}[${step}] "${rung.title}"`;

    // Every rung can be finished.
    if (!(rung.actions ?? []).length) note(`${where} has no actions — it can never be completed`);

    // Every route names a rung that exists.
    (rung.actions ?? []).forEach((a) => {
      if (a.goto && !named.has(a.goto)) {
        note(`${where} routes to "${a.goto}", which names no rung on this ladder`);
      }
    });

    // Every branch has a way in.
    if (rung.branch && !doors.has(rung.branch) && !sweepBranches.has(rung.branch)) {
      note(`${where} is a branch nothing routes to — it would show in the contents and never open`);
    }

    // Every rung has a section of the document to link to.
    const slug = scriptSlug(section, step);
    if (!slug) {
      note(`${where} produces no anchor`);
      return;
    }
    reachable.add(slug);
    if (!seeded.has(slug)) note(`${where} links to #${slug}, which the document does not have`);

    // The anchor must not be derived from the title, or renaming the rung
    // orphans whatever has been written into its section.
    if (!rung.name && !rung.branch) {
      note(`${where} has no permanent name — its anchor follows its title and a rename would orphan it`);
    }
  });

  const block = ladder.openTogether ?? 0;
  if (block > ladder.steps.length) {
    note(`${section} opens ${block} rungs together but only has ${ladder.steps.length}`);
  }

  // "They replied" is the outcome no rung declares: the screen sends index
  // -1 for it, and only the record handler knows to read that as a reply.
  // The student and job-board handlers look the index up in rung.actions
  // directly, where -1 is nothing — so a reply rung on either of those two
  // would take a note, close the rung on screen, and be refused by the
  // server without the operator seeing anything. That is the bug this check
  // exists to stop coming back on a different ladder.
  if (REPLY_UNSAFE.has(section) && ladder.steps.some((r) => r.reply)) {
    note(
      `${section} has a rung with "They replied", but its handler resolves an action index directly and -1 names nothing there`,
    );
  }
}

// A section of the document nothing links to is a page somebody maintains
// and nobody is ever sent to — unless it is deliberately not a rung.
for (const slug of seeded) {
  if (!reachable.has(slug) && !NON_RUNG_SECTIONS.has(slug)) {
    note(`the document has #${slug}, which no rung links to`);
  }
}

// The reading order names rungs by anchor, so a deleted rung must not still
// be ordering the contents.
for (const [section, key] of READS_FIRST_ANCHORS) {
  const ladder = LADDERS[section as (typeof SECTION_ORDER)[number]];
  if (!ladder) {
    note(`the reading order mentions section "${section}", which does not exist`);
    continue;
  }
  if (!ladder.steps.some((r) => r.name === key || r.branch === key)) {
    note(`the reading order puts "${key}" first in ${section}, which names no rung there`);
  }
}

// ── the escape hatch, on every rung that can take one ─────────────────────
//
// "Something else" is appended to every non-branch rung by withErrand() in
// ladders.ts, so this cannot fail by somebody forgetting to type it. It can
// fail if somebody writes one by hand beside the appended one, or edits the
// shared action into a shape that no longer carries its way home. Seven of
// these existed as hand-written near-copies until 30 September: no
// description, no return date, no origin, so finishing one threw the record
// back to a rung hard-coded in the branch.
let hatches = 0;
for (const section of SECTION_ORDER) {
  for (const rung of LADDERS[section].steps) {
    if (rung.branch) continue;
    const found = rung.actions.filter((a) => a.goto === "errand");
    const where = `${section} rung "${rung.title ?? rung.name}"`;
    if (found.length === 0) {
      note(`${where} has no "Something else"`);
      continue;
    }
    if (found.length > 1) {
      note(`${where} has ${found.length} actions going to the errand branch; there should be one`);
      continue;
    }
    const [a] = found;
    if (!a.carryOrigin) note(`${where}: "Something else" does not carry where the record was, so it cannot come back`);
    if (!a.quiet) note(`${where}: "Something else" is not marked quiet, so it renders as an answer`);
    if (a.secondary) note(`${where}: "Something else" is under the menu again`);
    if (!a.inputs?.some((i) => i.key === "todo")) note(`${where}: "Something else" asks for no description`);
    if (!a.inputs?.some((i) => i.key === "due_on")) note(`${where}: "Something else" asks for no return date`);
    hatches += 1;
  }
}

// And the branch it leads to must be able to send the record back where it
// came from, rather than to one rung named in the branch.
for (const section of SECTION_ORDER) {
  const errand = LADDERS[section].steps.find((r) => r.branch === "errand");
  if (!errand) {
    note(`${section} has no errand branch, but every rung offers "Something else"`);
    continue;
  }
  if (!errand.actions.some((a) => a.resume)) {
    note(`${section}'s errand branch has no action that resumes, so it cannot return the record`);
  }
}

const line = `${rungs} rungs across ${SECTION_ORDER.length} ladders · ${seeded.size} document sections · ${hatches} escape hatches`;

if (problems.length) {
  console.error(`✗ MedJobs ladders — ${line}\n`);
  for (const p of problems) console.error(`  ${p}`);
  console.error("");
  process.exit(1);
}

console.log(`✓ MedJobs ladders — ${line}, every link lands and every route resolves`);
