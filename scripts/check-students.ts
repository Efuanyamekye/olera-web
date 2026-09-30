/**
 * The students ladder, checked against the board model.
 *
 * The thing worth asserting here is that order stopped mattering. Three
 * rungs are facts the system can see for itself, and the cases that used to
 * go wrong are the ones where they arrive out of order: a student who
 * finishes their own application before anybody has spoken to them, and one
 * already hired who would otherwise be queued for an introductory call.
 *
 * EVERY RUNG IS ADDRESSED BY NAME. This file used to hold the indices as
 * literals, so the reorder on 30 September broke fourteen assertions at
 * once and none of them said anything useful about what had changed. The
 * indices are also what business_profile_tasks.payload stores, so a test
 * that hard-codes them is a test that cannot tell a reorder from a bug.
 *
 *   npx tsx scripts/check-students.ts
 */

import { LADDERS } from "../lib/medjobs/ladders";
import { applicationState, studentFacts } from "../lib/medjobs/student-profile";
import {
  complete,
  derivedStep,
  makeRecord,
  resolveNext,
  satisfied,
  stillToCome,
  type BoardRecord,
  type BoardUniversity,
} from "../lib/medjobs/task-board";

let failed = 0;
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) console.log(`  ok    ${label}`);
  else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
};

const steps = LADDERS.students.steps;
const titleAt = (i: number | null) => (i === null ? "nothing" : steps[i]?.title ?? "?");

/** A rung's index, by name. Throws rather than returning -1, because a
 *  silent -1 here would make every assertion downstream meaningless. */
const at = (name: string): number => {
  const i = steps.findIndex((r) => (r.name ?? r.branch) === name);
  if (i < 0) throw new Error(`no rung named "${name}" on the students ladder`);
  return i;
};

const REACH = at("reach-out-to-them");
const SCHEDULE = at("schedule-the-interview");
const HOLD = at("hold-the-interview");
const APPLICATION = at("complete-their-application");
const QUALIFY = at("qualify-their-application");
const PROVIDER = at("get-them-an-interview");
const HIRE = at("confirm-hire");
const MENTOR = at("mentor");
const HOURS = at("hours");

const board = (): BoardUniversity => ({
  id: "u", slug: "uw-madison", name: "University of Wisconsin-Madison",
  mapsDestination: null, channels: {},
  records: { providers: [], students: [], jobboard: [], advisors: [], orgs: [], events: [], professors: [] },
});

const student = (facts: Record<string, string | true>, step?: number): BoardRecord => {
  const at = step ?? derivedStep("students", facts) ?? 0;
  const r = makeRecord("students", "A student", at);
  r.facts = facts;
  return r;
};

console.log("\nThe ladder");
ok(
  "our three rungs come before the application",
  REACH < SCHEDULE && SCHEDULE < HOLD && HOLD < APPLICATION,
  `${REACH} ${SCHEDULE} ${HOLD} then ${APPLICATION}`,
);
ok("and the provider interview comes after it", APPLICATION < QUALIFY && QUALIFY < PROVIDER);
ok("then the hire, the mentoring and the monthly hours", PROVIDER < HIRE && HIRE < MENTOR && MENTOR < HOURS);
ok("none of the first three is a fact the system can see", !steps[REACH].satisfiedBy && !steps[SCHEDULE].satisfiedBy && !steps[HOLD].satisfiedBy);
ok("the interview can be skipped for somebody who needs none", steps[HOLD].actions.some((a) => a.label === "No interview needed"));
ok("a no show goes back to booking rather than onward", steps[HOLD].actions.some((a) => a.label === "No show" && a.goto === "schedule-the-interview"));
ok("booking asks for the date and will not take a blank", steps[SCHEDULE].actions.some((a) => a.inputs?.some((i) => i.key === "interview_at" && i.required)));
ok("and the rung that holds it comes due on the day", steps[SCHEDULE].actions.some((a) => a.delayFrom === "interview_at"));
ok("the interview is where we ask how they found us", steps[HOLD].actions.some((a) => a.inputs?.some((i) => i.key === "student_source" && i.type === "select")));
ok("from a fixed list ending in a catch-all", (() => {
  const f = steps[HOLD].actions.flatMap((a) => a.inputs ?? []).find((i) => i.key === "student_source");
  return (f?.options?.length ?? 0) > 1 && f?.options?.[f.options.length - 1] === "Other";
})());
ok("the application is one the system can answer", steps[APPLICATION].satisfiedBy === "application_complete");
ok("the provider interview is one the system can answer", steps[PROVIDER].satisfiedBy === "interview_booked");
ok("the hire is one the system can answer", steps[HIRE].satisfiedBy === "hired");
ok("the monthly hours are not — only a person knows them", steps[HOURS].monthly === true && !steps[HOURS].satisfiedBy);
ok("a provider interview supersedes what came before", steps[PROVIDER].supersedes === true);
ok("a hire supersedes what came before", steps[HIRE].supersedes === true);
ok(
  "a finished application does not supersede our interview",
  !steps[APPLICATION].supersedes,
  "nobody has spoken to that student yet",
);
ok(
  "every rung the system answers says so in the UI",
  steps.every((s) => !s.satisfiedBy || Boolean(s.satisfiedNote)),
);

console.log("\nWhere a student stands, from the facts alone");
ok(
  "fresh applicant → reach out to them",
  derivedStep("students", {}) === REACH,
  titleAt(derivedStep("students", {})),
);
ok(
  "finished their own application → still reach out to them",
  derivedStep("students", { application_complete: true }) === REACH,
  titleAt(derivedStep("students", { application_complete: true })),
);
ok(
  "provider interview booked → confirm the hire, everything before it moot",
  derivedStep("students", { interview_booked: "2026-09-10" }) === HIRE,
  titleAt(derivedStep("students", { interview_booked: "2026-09-10" })),
);
ok(
  "already hired → mentoring, nothing before it",
  derivedStep("students", { hired: "2026-09-01" }) === MENTOR,
  titleAt(derivedStep("students", { hired: "2026-09-01" })),
);

console.log("\nMatthew: fresh application, nothing done");
{
  const u = board();
  const rec = student({});
  u.records.students.push(rec);
  ok("he is on reaching out", rec.step === REACH, titleAt(rec.step));
  complete(u, rec, rec.tasks[0], steps[REACH].actions[0]);
  const next = rec.tasks.find((t) => !t.done);
  ok("logging it moves him to booking the call", next?.step === SCHEDULE, titleAt(next?.step ?? null));
  ok("and his application is still somebody's to chase", !satisfied(rec, APPLICATION));
}

console.log("\nA no show goes back in the diary");
{
  const u = board();
  const rec = student({}, HOLD);
  u.records.students.push(rec);
  const noShow = steps[HOLD].actions.find((a) => a.label === "No show")!;
  complete(u, rec, rec.tasks[0], noShow);
  const next = rec.tasks.find((t) => !t.done);
  ok(
    "not onward to the application",
    next?.step === SCHEDULE,
    titleAt(next?.step ?? null),
  );
}

console.log("\nA student who finished the application themselves");
{
  const u = board();
  const rec = student({ application_complete: true });
  u.records.students.push(rec);
  ok("we still reach out to them", rec.step === REACH, titleAt(rec.step));
  ok("the application shows as done", satisfied(rec, APPLICATION));
  ok(
    "and is not promised again under still to come",
    !stillToCome(rec).some((x) => x.title === "Complete their application"),
  );
  complete(u, rec, rec.tasks[0], steps[REACH].actions[0]);
  const next = rec.tasks.find((t) => !t.done);
  ok("reaching out still leads to booking the call", next?.step === SCHEDULE, titleAt(next?.step ?? null));
}

console.log("\nThe screen and the server agree");
for (const facts of [{}, { application_complete: true as const }, { interview_booked: "2026-09-10" }]) {
  for (let step = 0; step < steps.length; step += 1) {
    steps[step].actions.forEach((action, i) => {
      const u = board();
      const rec = student(facts, step);
      u.records.students.push(rec);
      complete(u, rec, rec.tasks[0], action);
      const queued = rec.tasks.find((t) => !t.done) ?? null;
      const server = resolveNext("students", step, 0, action, facts);
      const same =
        queued === null
          ? server === null
          : Boolean(server && server.step === queued.step && server.round === queued.round);
      ok(
        `${Object.keys(facts).join("+") || "nothing known"} · ${steps[step].title} · ${action.label} → ${titleAt(server?.step ?? null)}`,
        same,
        `screen ${queued ? queued.step : "null"} vs server ${server ? server.step : "null"}`,
      );
      void i;
    });
  }
}

console.log("\nReaching the goal");
{
  const u = board();
  const rec = student({}, HIRE);
  u.records.students.push(rec);
  const hired = steps[HIRE].actions.find((a) => a.label === "Hired")!;
  complete(u, rec, rec.tasks[0], hired);
  const next = rec.tasks.find((t) => !t.done);
  ok("a hire leads to mentoring", next?.step === MENTOR, titleAt(next?.step ?? null));
  ok("and the record reads hired", rec.state === "hired", String(rec.state));
}

console.log("\nReading an application");
{
  const empty = applicationState({ display_name: null, city: null, state: null, metadata: {} });
  ok("an empty one is 0%", empty.percent === 0, String(empty.percent));
  ok("and lists everything as missing", empty.missing.length === 12, String(empty.missing.length));
  ok("and is not complete", !empty.complete);

  const half = applicationState({
    display_name: "Matthew Chen",
    city: "Madison",
    state: "WI",
    metadata: { university: "University of Wisconsin-Madison", major: "Biology" },
  });
  ok("a part-filled one scores its fields", half.percent === 35, String(half.percent));
  ok("and names what is left", half.missing.includes("intro video"));

  const live = applicationState({
    display_name: "Sara", city: "Bloomington", state: "IN",
    metadata: { application_completed: true },
  });
  ok(
    "going live is what complete means, not a full score",
    live.complete && live.percent < 100,
    `${live.percent}%`,
  );
}

console.log("\nThe facts, from whatever was found");
ok("nothing found is no facts", Object.keys(studentFacts({ applicationComplete: false })).length === 0);
ok(
  "a placement date is carried through",
  studentFacts({ applicationComplete: false, placedOn: "2026-09-01" }).hired === "2026-09-01",
);

console.log(failed === 0 ? "\nAll checks passed.\n" : `\n${failed} check(s) failed.\n`);
process.exit(failed === 0 ? 0 : 1);
