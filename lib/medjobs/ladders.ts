/**
 * The seven ladders — what to do, in order, for each kind of thing a
 * university holds.
 *
 * One rung is one task. A rung says what the task is, why it exists, the
 * steps, and what each button does to the record. Nothing about a rung is
 * per-university: the ladder is the operating model, and a university is
 * just a set of records climbing it.
 *
 * Criteria are not replaced by this file. `campus_channels.criteria` is
 * still what makes a channel live, and Health, the 30-day funnel and Site
 * Health all read it — so a rung that proves a criterion says so with
 * `ticks`, and finishing it writes the tick. See lib/medjobs/activation.ts
 * for the criterion keys.
 */

export type SectionKey =
  | "providers"
  | "students"
  | "jobboard"
  | "advisors"
  | "orgs"
  | "events"
  | "professors";

/** What pressing a button does to the record. */
export type Outcome =
  /** Move to the next rung — or the next follow-up inside a block. */
  | "next"
  /** They answered. Skip the rest of the follow-ups and move on. */
  | "replied"
  /** Same rung again later. */
  | "repeat"
  /** The ladder's goal is reached. */
  | "goal"
  /** Parked without reaching the goal. */
  | "archive"
  /** The whole section is closed for this university. */
  | "closed"
  /** A meeting fell through — start reschedule rounds. */
  | "reschedule"
  /** Turn the names found into their own records, each starting the next rung. */
  | "fanout";

/** A field the rung exists to find, written onto the record. */
export type ContactField = "contact" | "role" | "phone" | "email";

/**
 * The copy an operator sends. Tokens are filled at render time:
 *   {university} {org} {contact} {first} {role} {flyer} {approver}
 * A token with nothing behind it falls back to something that still reads
 * as a sentence, so a half-filled record never produces "Hi ,".
 */
export interface LadderEmail {
  subject: string;
  body: string;
}

export interface LadderInput {
  /** Stable key the value is stored under on the task. */
  key: string;
  label: string;
  /** Defaults to a plain text field. */
  type?: "text" | "datetime-local" | "date" | "url" | "number" | "check";
  /**
   * The rung cannot be finished without it.
   *
   * Only for a value the rung exists to capture. A booking rung logged with
   * no date is not a booking, it is a claim that one happened — and the
   * next person to open the record has no way to tell the difference.
   */
  required?: boolean;
  /**
   * What to say when it is required and blank, as an instruction.
   *
   * "Fill in the how did we hear? first" is what deriving it from the label
   * produces, and a screen that reads like that is a screen nobody trusts.
   */
  needs?: string;
}

export interface LadderAction {
  label: string;
  outcome: Outcome;
  /** What this outcome means, on hover. Four buttons need saying apart. */
  hint?: string;
  /**
   * Another go at the same rung that did not achieve what the rung is for.
   *
   * Counted, and the rung says through `repeats` how many is enough. A
   * voicemail did not reach anybody; a round of conversation that produced
   * no date did not get a date. Both are the same thing from the record's
   * point of view — this rung again — and both are worth counting, because
   * a number is the only thing that tells an operator when to stop.
   *
   * What is not a strike is reaching somebody who will not give you an
   * address: the number works and a person answered, which is a refusal
   * rather than a dead line, and it has its own outcome.
   */
  strike?: boolean;
  /** Business days until the generated task is due. 0 means today. */
  delay: number;
  /**
   * Take the due date from one of this action's own fields instead.
   *
   * A meeting booked for next Thursday should put its log rung on next
   * Thursday. `delay` counts business days from today, which is the right
   * answer for a cadence and the wrong one for a date somebody has typed in.
   */
  delayFrom?: string;
  /**
   * Values this outcome asks for before it fires.
   *
   * On the action rather than the rung because they belong to the outcome.
   * "What needs doing and when should it come back" is a question about an
   * errand, and asking it of somebody logging an unanswered call is noise.
   */
  inputs?: LadderInput[];
  /**
   * Field keys copied onto the task this outcome queues.
   *
   * An errand is only a task if it carries what the errand is. Without this
   * the queued rung would arrive blank and the operator would be looking at
   * "Something else" with no idea what the something was.
   */
  carry?: string[];
  /**
   * Write where the record was onto the rung this queues.
   *
   * A branch has to know its way home. Without it, coming back from an
   * errand or a call put every provider on round one of the block they had
   * left — so a provider three rounds in got four more than they were owed,
   * and the count stopped meaning anything.
   */
  carryOrigin?: boolean;
  /**
   * Go back to where the branch came from rather than to `goto`.
   *
   * One round on from where it left: that round was logged before the
   * branch opened, so repeating it would be contacting them twice for it.
   * Falls back to `goto` when there is no origin to go back to.
   */
  resume?: boolean;
  /**
   * In the row of buttons, but outlined rather than filled.
   *
   * For an action that is always available and is never the answer the rung
   * is asking for. "Something else" is the only one: it has to be visible,
   * because an escape hatch nobody can find is not an escape hatch, and it
   * must not look like the thing to press, because on all 37 rungs it is
   * the exception.
   *
   * It was under the menu until 30 September, where the person who needed it
   * most found it by accident and said "this is just a little bit hidden".
   */
  quiet?: boolean;
  /**
   * Offered under the menu rather than in the row of buttons.
   *
   * Booking a call and logging something the ladder did not foresee are
   * available everywhere, which is exactly why they should not take up two
   * buttons on every screen. The row is for what this rung is about.
   */
  secondary?: boolean;
  /**
   * Things to do before this can be logged, each with the way to do it to
   * hand. The rung already said to call and then email; this is that
   * sentence made operable, so the button logs two acts rather than
   * asserting a non-event.
   */
  acts?: Array<"call" | "email">;
  /**
   * What to call those acts, when the default does not describe them.
   *
   * A cold round resends the programme; an onboarding round asks one
   * question. Same two acts, different sentence, and the sentence is what
   * tells the operator what to say.
   */
  actLabels?: Partial<Record<"call" | "email", string>>;

  /** Criterion keys this answers on the channel, if any. */
  ticks?: string[];
  /**
   * Go to the branch rung of this name rather than the next in sequence.
   *
   * A branch is skipped when climbing, which is the point of it — but an
   * outcome that exists to reach one then had nowhere to go, and fell off
   * the end of the ladder into the goal. "The posting is gone" marked the
   * job board live.
   */
  goto?: string;
}

export interface LadderRung {
  title: string;
  what: string;
  why: string;
  steps: string[];
  script?: string;
  /**
   * What the disclosure holding `script` is called, when "suggested call
   * script and email copy" does not describe it.
   *
   * The map sweep keeps its test for what counts as an agency worth adding
   * behind that disclosure, and a reader told it was a call script will not
   * open it.
   */
  scriptLabel?: string;
  /** The email to send, with tokens filled from the record. */
  email?: LadderEmail;
  /** Offers "They replied", which breaks out of a follow-up block. */
  reply?: boolean;
  /**
   * What one of the things a sweep finds is called, for the add form.
   *
   * "Agency name" and "Office name" rather than "Name": the box is the first
   * thing somebody types into and it should say what it wants.
   */
  foundNoun?: string;

  /**
   * A value carried onto this task, shown as a link.
   *
   * The portal is where an operator checks whether a provider got
   * themselves set up, and telling them to go and look without giving them
   * the address is an instruction that costs a search every time.
   */
  link?: { key: string; label: string };
  /** Contact fields this rung collects, written onto the record. */
  collects?: ContactField[];
  /**
   * Show everything we hold about them, not just the fields being collected.
   *
   * For the rung whose whole job is confirming what is on file. Two boxes
   * meant the role, the phone, the website and the address were confirmed on
   * the call and then written down nowhere, because the screen had not
   * offered anywhere to put them.
   */
  confirmDetails?: boolean;
  /** Values the rung records on the task itself. Typed, so a date is a date
   *  picker and a link is a link field rather than a box you can put
   *  anything in. */
  inputs?: LadderInput[];
  /** A longer note recorded on the task itself. Labels the note box. */
  textarea?: string;
  /**
   * Counting repeated goes at this rung, and what to say after enough of
   * them.
   *
   * The calling rung counts attempts at reaching somebody; the holding rung
   * counts rounds of a conversation going nowhere. One mechanism, and
   * neither is a block — the count prompts a person, it does not decide.
   */
  repeats?: {
    noun: string;
    warnAt: number;
    warning: string;
    /**
     * Whether the closing outcome renames itself to "Archive — N attempts"
     * once the count is reached.
     *
     * Only where archiving is what the warning actually advises. On the rung
     * that chases a meeting it is the opposite of the advice — that provider
     * said yes, and losing them over a calendar is the worst outcome in the
     * funnel — so the button keeps saying what it means.
     */
    archive?: boolean;
  };
  /**
   * Whether "Not yet" is offered. Defaults to yes.
   *
   * It is right for a rung that is a thing a person does on a day and can
   * honestly be done tomorrow. It is noise on a rung that already carries a
   * cadence: putting off a follow-up by two days is what the next round is,
   * so offering both is offering the same act twice under two names.
   */
  defer?: boolean;
  /**
   * A document to look at while doing this. Served through the guarded SOP
   * route by key, never as a public URL — these are internal.
   */
  attachment?: { label: string; doc: string };
  /** Names this rung would find. Each becomes its own record. */
  fanout?: string[];
  /** A block of N identical follow-ups rather than a single task. */
  rounds?: number;
  /**
   * What the last round of a block does. Archives by default.
   *
   * Seven unanswered cold calls is a no. Seven unanswered nudges at a
   * provider who has already said yes is not — losing them over scheduling
   * would be the worst outcome in the funnel — so that block repeats its
   * last round instead, on the same cadence, until somebody says otherwise.
   */
  exhausted?: "archive" | "repeat";
  /** Comes back every season; never part of the forward sequence. */
  seasonal?: boolean;
  /** Comes back every month; never part of the forward sequence. */
  monthly?: boolean;
  /** A branch-only rung, reached by name rather than in sequence. */
  branch?: string;
  /**
   * A name an action can aim at without making the rung a branch.
   *
   * A seasonal rung has to stay visible under "still to come", which a
   * branch does not, but something still has to be able to queue it — a
   * recurring check that nothing ever queues is a promise on a screen.
   */
  name?: string;
  /**
   * A fact about the record that makes this rung already true.
   *
   * Some rungs are not work at all — they are a state the system can see.
   * A student whose application is complete has completed it whether or not
   * anybody chased them, and asking somebody to tick that is asking them to
   * copy the database into the database.
   *
   * The board computes these facts per record; a rung whose fact holds is
   * shown as done and stepped over when climbing. It is what lets this
   * ladder stay in order while the order stops mattering.
   */
  satisfiedBy?: string;
  /** What to say under a rung the system satisfied, instead of an outcome. */
  satisfiedNote?: string;
  /**
   * Reaching this rung means everything before it is moot.
   *
   * An interview on the calendar says the earlier rungs happened one way or
   * another. A finished application does not: nobody has met that student
   * yet, and meeting them is still the next thing to do.
   */
  supersedes?: boolean;
  /**
   * Worked on the record itself rather than through the task screen.
   *
   * Some rungs are not an event to log. Checking that what we hold about a
   * provider is true is done by reading the record and fixing it, so the
   * record is the screen, and the rung is a checkbox in its To do band.
   * There is nothing to script, nothing to send and no outcome to pick —
   * offering notes, deferrals and four buttons would be furniture around an
   * act that is already finished by the time you reach for them.
   */
  check?: boolean;
  actions: LadderAction[];
}

export interface Ladder {
  label: string;
  /** What "done" means for one record on this ladder. */
  goal: string;
  /** Records arrive on their own; there is nothing to start. */
  auto?: boolean;
  /**
   * How many rungs open at once when a record starts.
   *
   * Providers open three: look them up, ring them, send them the programme.
   * They are one sitting's work and they are done in that order, but there
   * is no reason to hide the second until the first is logged — the operator
   * has the record open and the phone in their hand.
   *
   * What it does not change is what comes after. The follow-up is queued by
   * finishing the last rung in the block, not the first, so the two-day
   * clock starts when the email actually goes out.
   */
  openTogether?: number;
  /**
   * The university has exactly one of these, so the section is the record.
   *
   * Opening it should not cost two clicks — one into a list, one onto the
   * only thing in it. The list is furniture around a single object.
   */
  singleton?: boolean;
  /** Explains an empty section that nobody can populate by hand. */
  emptyNote?: string;
  /** The campus channel this ladder's criteria belong to. */
  channel?: "st3" | "st4" | "st5" | "st6" | "st7";
  steps: LadderRung[];
}

/**
 * Book a call to help, from anywhere.
 *
 * A provider can ask to be walked through it at any point — on the
 * confirming call, after the programme email, three rounds into a chase, in
 * the middle of an errand. It is never a stage and it must never cost them
 * their place, so it carries where the record was and the call hands it
 * straight back, one round on.
 */
export const BOOK_CALL: LadderAction = {
  label: "Booked a call to help",
  secondary: true,
  outcome: "next",
  goto: "help",
  delay: 0,
  // The rung comes back on the day of the call, not two days from booking.
  delayFrom: "meeting_at",
  carry: ["meeting_at", "meeting_where", "portal_link"],
  carryOrigin: true,
  hint: "They would rather be walked through it. Comes back on the day, then returns here.",
  inputs: [
    {
      key: "meeting_at",
      label: "Date and time",
      type: "datetime-local",
      required: true,
      needs: "Put the date and time in",
    },
    { key: "meeting_where", label: "Where", type: "text" },
  ],
};

/**
 * An outcome that queues whatever the operator types, on the day they pick.
 *
 * Shared, because a provider can say something unaccounted for on the call
 * as easily as in a reply, and an errand can produce another errand.
 */
export const ERRAND: LadderAction = {
  label: "Something else",
  secondary: true,
  outcome: "next",
  goto: "errand",
  delay: 0,
  // The date typed below, not two business days from now.
  delayFrom: "due_on",
  carryOrigin: true,
  hint: "They asked for something the board has no rung for. Queues it.",
  carry: ["todo", "flag_review"],
  inputs: [
    {
      key: "todo",
      label: "What needs doing",
      required: true,
      needs: "Say what needs doing",
    },
    {
      key: "due_on",
      label: "Come back on",
      type: "date",
      required: true,
      needs: "Pick the day it comes back",
    },
    {
      // Some of these are beyond one operator. Ticking it puts a flag on the
      // record so it is visible from the list, and the rung then says to
      // take it to the team rather than sit on it.
      key: "flag_review",
      label: "Flag for manager review",
      type: "check",
    },
  ],
};

/**
 * The same errand, in the row of buttons rather than under the menu.
 *
 * This is what every rung gets. The three provider rungs that had ERRAND
 * under the menu keep the identical behaviour and only move; the other 34
 * gain it. `hint` is reworded because the provider version speaks about a
 * person who asked for something, and a rung on a campus event or a job
 * board has no "they".
 */
export const ERRAND_EVERYWHERE: LadderAction = {
  ...ERRAND,
  secondary: false,
  quiet: true,
  hint: "Something happened that no button here covers. Say what it is and when to come back.",
};

/**
 * What a reply from a provider can produce.
 *
 * Three, and the first one is the whole point. The ladder used to sort
 * replies by whether they contained a calendar slot, which asked a cold
 * provider for the largest thing we want from them before they had agreed
 * to the smallest. What we actually need is yes, tell me more.
 *
 * Shared by the follow-up block and the confirming call, because a provider
 * who says yes on the first call should not be sent a programme email and
 * seven follow-ups to arrive at the same place.
 */
export const INTEREST_OUTCOMES: LadderAction[] = [
  {
    label: "Interested, start onboarding",
    outcome: "next",
    goto: "onboarding",
    delay: 0,
    hint: "They want to hear more. Sends them the pack next.",
  },
  {
    label: "Not interested",
    outcome: "archive",
    delay: 0,
    hint: "They declined. Closes the record.",
  },
  BOOK_CALL,
  // Everything a provider can say that the other outcomes do not cover, and
  // there is no short list of those. Send it to our corporate office. Call
  // me back when we budget in March. Talk to our RN manager. We need a W-9.
  // The board cannot enumerate them, so it takes them in the operator's own
  // words with a date, and queues that.
  ERRAND,
];

/**
 * The two ways a call can fail, on any rung that makes one.
 *
 * Both are the same outcome for the record — nobody was reached, try again
 * — and they are worth telling apart because one of them means they have
 * heard us and one means they have not. The confirming call has had these
 * from the start; every other rung that dials now uses the same words.
 */
export function noAnswerOutcomes(
  delay: number,
  carry?: string[],
  actLabels?: Partial<Record<"call" | "email", string>>,
): LadderAction[] {
  // Email first, then the call refers to it. A call that arrives before the
  // email is a cold call; one that follows it has something to be about.
  const acts: Array<"call" | "email"> = ["email", "call"];
  return [
    {
      label: "No answer",
      outcome: "next",
      delay,
      acts,
      ...(actLabels ? { actLabels } : {}),
      ...(carry ? { carry } : {}),
      hint: "Nobody picked up. Both logged, and the next round is queued.",
    },
    {
      label: "Left a voicemail",
      outcome: "next",
      delay,
      acts,
      ...(actLabels ? { actLabels } : {}),
      ...(carry ? { carry } : {}),
      hint: "Message left, so they have heard us. Both logged, and the next round is queued.",
    },
    {
      // You reached a person and they undertook to ring back. The round
      // advances like any other follow-up. It repeated itself at first, on
      // the reasoning that a promise is not a round spent — but a rung that
      // returns to itself writes two identical "Follow up 2" lines into the
      // history with nothing to tell them apart, and a provider who keeps
      // promising can never reach the end of the block.
      //
      // It is not a strike, though. A strike is a dead line; this is a live
      // one with somebody on the other end who has agreed to use it. So it
      // costs a round and not a strike, and waits a day longer than a
      // voicemail before the next one to give them the room they asked for.
      label: "They will call back",
      outcome: "next",
      delay: delay + 1,
      acts,
      ...(actLabels ? { actLabels } : {}),
      ...(carry ? { carry } : {}),
      hint: "Somebody took it on and said they would ring. The next follow-up is queued a day later than usual to leave them room.",
    },
  ];
}

/**
 * One follow-up. Providers, advisors and orgs all run the same block of
 * seven, two business days apart, so the copy lives in one place.
 *
 * What differs is what a reply is worth. On the provider ladder the whole
 * block exists to get a meeting, so a reply is sorted into what it actually
 * produced — a time, a conversation, or a no. On the other two the next
 * rung is not a meeting and what the first ask should be is still open
 * (refinement 11), so they keep the single "They replied" they have.
 */
export function followUp(n: number, section: SectionKey): LadderRung {
  const who = followUpWho(section);
  return {
    title: `Follow up ${n}`,
    what: "The two-day check on this contact.",
    why: "No reply yet.",
    steps:
      section === "providers"
        ? [
            // Both, because a provider who rang back and got the machine has
            // got back to us and the board would never know.
            "Check their email and your voicemail first.",
            "Email them, resending the programme.",
            "Call them, refer to the email, and ask if they want to hear more.",
          ]
        : ["Check your inbox first.", "No reply — call, then email."],
    script: `"Hi, this is [your name] from Dr. DuBose's office. I emailed ${who} last week about our Student Caregiver Program — students who work paid caregiving shifts around their classes. Did that reach the right person, or is there someone better I should send it to?"`,
    email: {
      subject: "Following up — Student Caregiver Program at {university}",
      body: `Hi {first},

Following up on my note about the Student Caregiver Program. The short version: we place pre-health students at {university} into paid caregiving shifts that work around their class schedule, and they come to you screened and ready.

They come to you screened. You interview and hire the ones you want, on your own terms, and there is nothing to sign to start.

Would you like to hear more? A reply is enough and I will send you everything — how it works, what it costs, and the pilot terms to look over.

The one-page overview is here if it is easier to forward: {flyer}

Best,
[your name]
Dr. Logan DuBose's office · Olera`,
    },
    // Putting a follow-up off by two days is what the next round is, so
    // "Not yet" here is the same act under a second name.
    defer: false,
    textarea: "What happened",
    ...(section === "providers"
      ? {
          // A follow-up has four endings and the block only ever had one.
          // "They replied" took a summary and moved on, which meant a
          // provider who said "interested, not this month" and a provider
          // who named a time landed on the same rung.
          // Two acts and a log, not a button that says nobody did anything —
          // and which of the two ways the call failed, because one means
          // they have heard us.
          actions: [
            ...noAnswerOutcomes(2, undefined, {
              email: "Email them, resending the programme",
              call: "Call them and refer to the email",
            }),
            ...INTEREST_OUTCOMES,
          ],
        }
      : {
          reply: true,
          actions: [{ label: "Log call and email", outcome: "next" as const, delay: 2 }],
        }),
  };
}

/**
 * One onboarding nudge.
 *
 * The same act as a cold follow-up and deliberately the same screen, but a
 * different question. They have the pack; what is missing is a sentence from
 * them saying they are ready. A call, an email and a meeting are all ways of
 * getting it and none of them is a stage — which is why this block is named
 * for the chasing rather than for any one of them.
 */
export function onboardingFollowUp(n: number): LadderRung {
  return {
    title: `Onboarding follow up ${n}`,
    what: "Check whether they got themselves set up, and help them over the line if not.",
    why: "They said yes and we sent them everything. What is left is hearing that they are ready.",
    steps: [
      "Check their email and your voicemail first, and respond or log accordingly.",
      "No response? Email and call to ask if they are ready for students, or have questions.",
      "Update their portal, or tell them what is missing, if it helps.",
    ],
    link: { key: "portal_link", label: "Their portal" },
    // They have already said yes, so every two days reads as pestering.
    defer: false,
    textarea: "What happened",
    repeats: {
      noun: "round",
      warnAt: 4,
      warning:
        "Four rounds. Ask straight out on the phone whether they are ready, or offer to set their profile up with them there and then — sending it again is not working.",
    },
    script:
      '"Hi, it\'s [your name] from Dr. DuBose\'s office — I sent over the Student Caregiver Program details last week. I wanted to check you are happy with how it works, and whether you are ready for us to send your first student. Anything you would like me to run through while I have got you?"',
    email: {
      subject: "Re: Everything you need — Student Caregiver Program at {university}",
      body: `Hi {first},

Following up on the Student Caregiver Program pack I sent over.

Just one question: are you ready for us to send your first student? If yes, a one-line reply is all I need.

If there is anything you would rather go through first, tell me and I will either answer it here or find fifteen minutes — whichever suits you.

Your portal, in case it is buried: {portal_link}

Best,
[your name]
Dr. Logan DuBose's office · Olera`,
    },
    actions: [
      ...noAnswerOutcomes(3, ["portal_link"], {
        email: "Email them",
        call: "Call, refer to the email, and ask if they are ready for students or have any questions",
      }),
      {
        label: "They are ready",
        outcome: "goal",
        delay: 0,
        hint: "They have said they understand and are ready to receive a student. That is the goal.",
      },
      BOOK_CALL,
      {
        label: "Not interested",
        outcome: "archive",
        delay: 0,
        hint: "They have changed their mind. Closes the record.",
      },
      ERRAND,
    ],
  };
}

/**
 * The rung for everything the ladder did not think of.
 *
 * It replaced "Keep the conversation going", which existed for the warm
 * but-not-now provider — a state that stopped being separate once the ask
 * became interest rather than a meeting. Interested-later is interested:
 * they get the pack and the onboarding block chases them.
 *
 * What was genuinely missing is the reply that produces work. Send it to
 * our corporate office. Talk to our RN manager. Call me back in March. The
 * board cannot hold a list of those, so it holds one of them at a time, in
 * the operator's words, with the day it comes back.
 *
 * It sits where the conversation rung sat, so nothing after it renumbers.
 */
function errandRung(): LadderRung {
  return {
    branch: "errand",
    title: "Something else",
    what: "Whatever they asked for that the ladder has no rung of its own for.",
    why: "A provider who asks for something and never hears back is a provider we lost to our own screen.",
    steps: [
      "Read what was asked, below.",
      "Do it.",
      "Log what came of it.",
    ],
    textarea: "What happened",
    repeats: {
      noun: "errand",
      warnAt: 3,
      warning: "Three errands and still no answer either way. Worth asking them straight.",
    },
    actions: [
      {
        label: "Done — they're interested",
        outcome: "next",
        goto: "onboarding",
        delay: 0,
        hint: "It produced a yes. Sends them the pack.",
      },
      {
        // Back to whatever rung queued the errand, one round on — not to
        // round one of a block the provider may be six rounds into.
        label: "Done — back to following up",
        outcome: "next",
        resume: true,
        goto: "followup",
        delay: 2,
        hint: "Done, no answer either way. Back to where this came from.",
      },
      { ...ERRAND, label: "Something else again", strike: true },
      BOOK_CALL,
      {
        label: "Not interested",
        outcome: "archive",
        delay: 0,
        hint: "They declined, or it went nowhere. Closes the record.",
      },
    ],
  };
}

export const FOLLOW_UP_ROUNDS = 7;

const RAW_LADDERS: Record<SectionKey, Ladder> = {
  providers: {
    label: "Providers",
    goal: "ready for students",
    auto: true,
    // Two, not three. Look them up and ring them in one sitting — but the
    // programme email waits on the call, because you cannot send it to an
    // address nobody has confirmed. With three open, a call that nobody
    // answered still left "Send the program info" sitting there due today.
    openTogether: 2,
    emptyNote: "Providers populate from the catchment when the university is added.",
    steps: [
      {
        name: "research",
        check: true,
        title: "Research the provider",
        what: "Check what we hold against the provider's own website, before anyone calls.",
        why: "Every wrong number caught here is a call nobody has to waste later.",
        steps: [
          "Open the record and find their website.",
          "Review their website and fix anything that's wrong.",
          "Confirm their address is no more than 60 minutes from the university.",
        ],
        actions: [{ label: "Done", outcome: "next", delay: 0 }],
      },
      {
        name: "call-to-confirm-the-right-contact",
        title: "Call to confirm the right contact",
        what: "A short call to confirm who we should be talking to, and how to reach them.",
        why: "The research gives us a name and an address. Only the call proves they are the right ones.",
        steps: ["Call the main line.", "Ask who handles this and for their email.", "Type it in and log the call."],
        script:
          '"Hi, this is [your name] from Dr. DuBose\'s office, calling about his Student Caregiver Program. I\'d like to send your team the details — what\'s the best address?"',
        collects: ["contact", "email"],
        confirmDetails: true,
        repeats: {
          noun: "attempt",
          warnAt: 3,
          warning: "After three attempts and no way to confirm the contact information, archive.",
          archive: true,
        },
        // The four outcomes a confirming call actually has, which are the
        // four PR1 names. It had one, which always advanced — so a call
        // nobody answered had nowhere to go but the history, leaving the
        // rung sitting there unexplained.
        actions: [
          {
            label: "Confirmed contact",
            outcome: "next",
            delay: 0,
            hint: "You have an address that works. Send them the programme next.",
          },
          // A provider who says yes on the call should not be sent a
          // programme email and seven follow-ups to arrive where they
          // already are.
          ...INTEREST_OUTCOMES.filter((a) => a.label === "Interested, start onboarding").map((a) => ({
            ...a,
            hint: "They said yes on the call. Skips the programme email and sends the pack.",
          })),
          {
            label: "Voicemail",
            outcome: "repeat",
            delay: 2,
            strike: true,
            hint: "Left a message. Logged, and this rung comes back in two days.",
          },
          {
            label: "No answer",
            outcome: "repeat",
            delay: 2,
            strike: true,
            hint: "Nobody picked up. Logged, and this rung comes back in two days.",
          },
          {
            // Reaching a gatekeeper who takes it inside is the most common
            // outcome on a first call, and it had nowhere to go: logging it
            // as a voicemail or a no answer counts a strike against a number
            // that plainly works.
            label: "They will call back",
            outcome: "repeat",
            delay: 3,
            hint: "You reached somebody and they said they would ring back. No strike, and this comes back in three days.",
          },
          {
            label: "Not interested",
            outcome: "archive",
            delay: 0,
            hint: "They declined, or will not give an address. Closes the record.",
          },
          BOOK_CALL,
          ERRAND,
        ],
      },
      {
        name: "send-the-program-info",
        title: "Send the program info",
        what: "The first email to this provider, sent by you from your own inbox.",
        why: "It comes from a real person, so replies land in your inbox.",
        steps: ["Copy the email below.", "Check the flyer link opens.", "Send it, then log it."],
        // The email that is actually being sent, as of 21 September, rather
        // than the one that was written for the rung. It earned replies from
        // the Bloomington agencies in a morning. The opening line names who
        // gave you the address, which is what gets it read past line one —
        // so the confirming call has to come back with a name, not just an
        // address.
        email: {
          subject: "Student Caregiver Program — {university} pre-health students",
          body: `Good afternoon {first},

I hope you are well. [Name] provided me with your contact information to share information about our Student Caregiver Program for {university} pre-health students. I am the Director of the program and would like to invite {org} to participate.

The program may be of service to {org} by establishing a pipeline of talented pre-healthcare professions students from {university} who are seeking eldercare experience as they prepare for careers as doctors, nurses, and healthcare professionals.

Please see the attached 2-page document for some program details. If you are interested in learning more about participating or have any initial questions, please let me know, and I can send over more answers and provide additional information on how we could get started working together.

Thank you for your service to the community. Have a great day!

Best,
[your name]`,
        },
        actions: [{ label: "Log email sent", outcome: "next", delay: 2 }, BOOK_CALL],
      },
      { rounds: FOLLOW_UP_ROUNDS, name: "followup", ...followUp(1, "providers") },
      {
        // Step 4. It was the meeting; the meeting is now a branch. The two
        // rungs that stood here moved to the end of the ladder and a
        // migration renumbers the task rows that pointed at them, which is
        // only possible because 6, 7 and 8 keep their places.
        name: "onboarding",
        title: "Send the onboarding pack",
        what: "How the programme works, what they want in a caregiver, the pilot terms, and one question back.",
        why: "They have said yes. This is the email that means nobody has to explain it again.",
        steps: [
          "Create their portal account and paste the link in below.",
          "Copy the email and read it through before you send it.",
          "Attach the pilot terms — they are for review, not for signing.",
          "Send it, then log it. Chasing the reply is the next rung.",
        ],
        inputs: [
          {
            key: "portal_link",
            label: "Portal link",
            type: "url",
            required: true,
            needs: "Create their account and paste the link in",
          },
        ],
        attachment: { label: "Pilot terms, for their review", doc: "pilot-terms" },
        email: {
          subject: "Everything you need — Student Caregiver Program at {university}",
          body: `Hi {first},

Good to hear from you. Here is the whole thing.

HOW IT WORKS
When a pre-health student near {org} is ready, we send them over — by email and by text, and they are waiting in your portal too. Some will ring your office directly and say they came through the Student Caregiver Program.

Each student arrives as one page: what they are studying, when they can work, what they have done before, and a short video. You invite the ones you want to interview, and you hire on your own terms.

  1. We tell you a student is ready
  2. You invite them to interview
  3. You hire the ones you want
  4. We confirm the hire with you and with them

WHAT YOU ARE LOOKING FOR
Tell us and we will only send students who fit — hours, shift types, certifications, anything you will not move on. The easiest thing is to reply to this email and say it in your own words; we will set it up on our side. If you would rather do it yourself, it is all in your portal: {portal_link}

THE TERMS, FOR YOUR REVIEW
Attached. Nothing to sign, and no obligation to carry on — this is a pilot. We will keep sending you students until you hire one and the placement works out. If you like working with our students after that, we agree formal terms then rather than now.

ONE THING BACK FROM YOU
Reply and tell me you are ready to receive your first student and you are clear on what happens when one arrives. If anything is unclear, reply with the question instead and I will answer it here.

When your first student is ready I will get on a call with you then and we will go through reviewing them and inviting them to interview together. And if you would rather talk any of it through sooner — now, at the first student, or later — just say the word.

Best,
[your name]
Dr. Logan DuBose's office · Olera`,
        },
        actions: [
          {
            label: "Log the pack sent",
            outcome: "next",
            delay: 3,
            // The link travels with the record from here on, so every
            // onboarding round can offer it without anybody looking it up.
            carry: ["portal_link"],
            hint: "Sent. We check in three days on whether they have got set up.",
          },
          BOOK_CALL,
        ],
      },
      {
        // Step 5. The whole of onboarding after the pack: did they get
        // themselves set up, and if not, help them. Seven rounds three days
        // apart, and then it keeps going rather than archiving — a provider
        // who has said yes is never closed for failing to answer.
        name: "onboardfollow",
        rounds: FOLLOW_UP_ROUNDS,
        exhausted: "repeat",
        ...onboardingFollowUp(1),
      },
      {
        name: "seasonal-check-late-july",
        seasonal: true,
        title: "Seasonal check",
        what: "Meet the provider to review the season.",
        why: "We need feedback on the students and to know if they want more next term.",
        steps: ["Book a short call.", "Ask how the students did.", "Ask if they want more next season."],
        actions: [{ label: "Logged", outcome: "goal", delay: 0 }],
      },
      // Last, and reached only by name. A branch is stepped over when
      // climbing, so where it sits does not change the sequence — and the
      // end is the only place a new rung can go without renumbering every
      // task row already written against this ladder.
      errandRung(),
      {
        // A branch, reached only when somebody books one. Most providers
        // will never see it, which is the point: a call is a way of getting
        // an acknowledgement, not a stage on the way to one.
        branch: "help",
        title: "Help them on a call",
        what: "Fifteen minutes doing whatever is stopping them, with them.",
        why: "Some providers will not get set up from an email, and a call is faster than four more rounds of asking.",
        steps: [
          "Ask what they are stuck on, and do it with them.",
          "Set their requirements in the portal while you are on the phone.",
          "Walk through what happens when the first student arrives.",
          "Ask them straight: are you ready to receive one?",
        ],
        textarea: "How it went",
        link: { key: "portal_link", label: "Their portal" },
        // A booked call is a thing you do on a day, and putting it off is
        // rebooking it — which is what the block is for.
        defer: false,
        actions: [
          {
            label: "They are ready",
            outcome: "goal",
            delay: 0,
            hint: "They have said so. That is the goal, whatever stage the call was booked from.",
          },
          {
            // Back to the round after the one they left, not to round one.
            // A call booked before the pack went out lands back on the cold
            // block, whose next round carries "Interested, start onboarding"
            // — so that outcome does not need repeating here.
            label: "Back to follow up",
            outcome: "next",
            resume: true,
            goto: "onboardfollow",
            delay: 3,
            hint: "Back to where the call was booked from, one round on.",
          },
          {
            // No reschedule rung. A call nobody turned up to is a call that
            // did not happen, and the way to get another one is the button
            // on the rung this returns to.
            label: "They did not turn up",
            outcome: "next",
            resume: true,
            goto: "onboardfollow",
            delay: 1,
            hint: "Logged as a no-show. Back to chasing tomorrow, where you can book another.",
          },
          ERRAND,
        ],
      },
      {
        // A branch, and not a rung any provider climbs: it belongs to the
        // university rather than to an agency. The board puts it at the
        // bottom of the Providers section, under the last provider, and it
        // goes when it is done.
        //
        // Sitting at the end of the ladder is what keeps it harmless. A
        // branch is stepped over when climbing, and the end is the only
        // place a rung can be added without renumbering the task rows
        // already written against every step before it.
        branch: "mapsweep",
        title: "Find more local providers",
        what: "Search the map pack around campus and add the home care agencies the directory never had.",
        why: "The directory can only give us agencies it has heard of. The map pack has ones it has not, and those stay invisible until somebody looks.",
        steps: [
          "Open Google Maps at the campus, below.",
          "Search each of: home care, home health, senior care, caregiver agency.",
          "For each result near campus, check it against the provider list. Match on phone and street address, not name — franchises repeat names.",
          "Add the ones that pass the test, filling in what the listing already shows you.",
        ],
        script: `Add an agency when all four are true:

  1. It sends caregivers to someone's home. Not a facility, not hospital staffing, not medical supply. Home care agencies only.
  2. Its address is near campus, inside the area we recruit from.
  3. It has a phone number that works, or a website.
  4. No provider already on the board shares its phone number or its street address.

If you are unsure on any of the four, leave it out and say so in the note. A provider added wrongly costs somebody a research rung and a call.`,
        textarea: "Anything worth saying about the sweep",
        scriptLabel: "where to look, and what counts",
        // Built by the board from the campus name, so the same search runs
        // at every university and nobody retypes it.
        link: { key: "maps_url", label: "Google Maps near campus" },
        // Once per university, so there is nothing to defer to.
        defer: false,
        foundNoun: "Agency",
        // The count used to be typed in by hand, and adding was done on
        // another screen — "add them with Add a provider, then come back
        // here". Two screens and a number to remember, for the same job the
        // advisor sweep does in one place. The list is the count now.
        actions: [
          {
            label: "All providers added for this area",
            outcome: "fanout",
            delay: 0,
          },
        ],
      },
    ],
  },

  students: {
    label: "Students",
    goal: "hired",
    auto: true,
    // The application opens on its own now. The meeting used to open beside
    // it, on the reasoning that neither waits on the other; the order this
    // ladder runs in says otherwise — qualification comes between them, and
    // there is no point meeting a student who has not been qualified.
    openTogether: 1,
    emptyNote: "Students appear here when an application lands.",
    steps: [
      {
        name: "complete-their-application",
        title: "Complete their application",
        what: "Chase whatever is missing from their profile.",
        why: "An incomplete application can't be sent to a provider.",
        steps: ["Check what's missing.", "Email or call them for it.", "Log it when complete."],
        // They may finish it themselves, and most will. The record says so
        // the moment they go live.
        satisfiedBy: "application_complete",
        satisfiedNote: "They completed it themselves.",
        email: {
          subject: "One thing left on your Olera application",
          body: `Hi {first},

Thanks for applying to the Student Caregiver Program. Your profile is nearly there — there is one piece still outstanding before we can put you in front of a provider.

Once that is in, I can start matching you to shifts near campus.

Reply here and I will walk you through it.

Best,
[your name]
Dr. Logan DuBose's office · Olera`,
        },
        actions: [{ label: "Application complete", outcome: "next", delay: 0 }],
      },
      {
        name: "qualify-their-application",
        title: "Qualify their application",
        what: "TODO — write this up in the scripts document.",
        why: "TODO.",
        steps: ["TODO."],
        actions: [{ label: "Qualified", outcome: "next", delay: 0 }],
      },
      {
        name: "meeting-with-the-student",
        title: "Meeting with the student",
        what: "The intro call with the applicant.",
        why: "We meet every student before putting them in front of a provider.",
        steps: ["Book a time.", "Hold it.", "Log how it went."],
        textarea: "How it went",
        // Not every student needs one, and a student who has already been
        // interviewed plainly did not. The second outcome exists so nobody
        // has to log a meeting that never happened to move a record on.
        actions: [
          { label: "Meeting held", outcome: "next", delay: 0 },
          { label: "No meeting needed", outcome: "next", delay: 0 },
          { label: "Something else", outcome: "next", delay: 0, goto: "errand" },
        ],
      },
      {
        name: "get-them-an-interview",
        title: "Get them an interview",
        what: "Put them in front of a signed-up provider.",
        why: "The interview is what turns an applicant into a hire.",
        steps: ["Pick a provider taking students.", "Introduce them.", "Confirm the interview is booked."],
        satisfiedBy: "interview_booked",
        satisfiedNote: "An interview is on the calendar.",
        supersedes: true,
        actions: [{ label: "Interview booked", outcome: "next", delay: 0 }],
      },
      {
        name: "confirm-hire",
        title: "Confirm hire",
        what: "Did they get the job?",
        why: "A hire is the outcome the whole program exists for.",
        steps: ["Ask the student.", "Confirm with the provider.", "Log it."],
        satisfiedBy: "hired",
        satisfiedNote: "A placement was accepted.",
        supersedes: true,
        // Reaching the goal, and earning the monthly check with it. Plain
        // "next" would queue the hours and leave the record reading as
        // unfinished, which is the opposite of what a hire means.
        actions: [
          { label: "Hired", outcome: "goal", delay: 30, goto: "mentor" },
          { label: "Not hired", outcome: "archive", delay: 0 },
        ],
      },
      {
        name: "mentor",
        title: "Mentor student",
        what: "TODO — write this up in the scripts document.",
        why: "TODO.",
        steps: ["TODO."],
        actions: [{ label: "Logged", outcome: "goal", delay: 30, goto: "hours" }],
      },
      {
        monthly: true,
        name: "hours",
        title: "Confirm hours worked",
        what: "The monthly check on hours.",
        why: "Hours worked is how we know the placement is real and holding.",
        steps: ["Ask the student how many hours this month.", "Type the number.", "Log it."],
        inputs: [{ key: "hours", label: "Hours this month", type: "number" }],
        actions: [{ label: "Logged", outcome: "repeat", delay: 30 }],
      },
      {
        branch: "errand",
        title: "Something else",
        what: "Whatever the student asked for that no rung covers.",
        why: "Nobody can guess in advance what a student will need.",
        steps: ["Do the thing.", "Log what it was."],
        textarea: "What it was",
        actions: [
          {
            label: "Done — back to the sequence",
            outcome: "next",
            delay: 0,
            // Back to the rung the errand was opened from, which the
            // errand carries with it. The fixed rung below is only the
            // fallback for an errand queued before origins were carried:
            // on its own it sent a record at "Confirm hire" back to
            // "Meeting with the student", which is why nobody trusted it.
            resume: true,
            goto: "meeting-with-the-student",
          },
        ],
      },
    ],
  },

  jobboard: {
    label: "Job board",
    goal: "live",
    channel: "st3",
    // One board per university. The list around it was furniture.
    singleton: true,
    steps: [
      {
        name: "research",
        check: true,
        title: "Research university job boards",
        // No {university} token: the help panel shows a rung as written, and
        // only the email copy is filled from the record. A token here reached
        // the screen as a token.
        what: "Find where the university lets an employer post a job, and record the way in.",
        why: "Every campus does this differently — Handshake, a career-services form, an email to a person.",
        steps: [
          "Search for the university career centre or student job board.",
          "Find where an employer creates an account or submits a posting. Put that in Job board link.",
          "If a person or an inbox owns it, add them under Add a contact. Optional.",
        ],
        actions: [{ label: "Done", outcome: "next", delay: 0 }],
      },
      {
        name: "confirm-it-s-submitted",
        title: "Confirm it's submitted",
        what: "Get the Olera listing in front of the university, however this campus takes it.",
        why: "The job board is where students find us without us finding them.",
        steps: [
          "Open the job board link on the record.",
          "Submit the listing. Use the example posting as the template.",
          "Log it here.",
        ],
        attachment: { label: "Example posting", doc: "posting" },
        email: {
          subject: "Job posting request — paid caregiving roles for pre-health students",
          body: `Hello,

I would like to post a role on the {university} student job board.

  Position    Student Caregiver (part-time, paid)
  Employer    Olera, on behalf of local licensed care providers
  Who it fits Pre-health students — pre-med, pre-nursing, pre-PA
  Schedule    Flexible shifts built around class timetables
  Apply       {flyer}

Students are screened by us and placed with licensed providers in the area. Happy to send anything else your posting process needs.

Thank you,
[your name]
Dr. Logan DuBose's office · Olera`,
        },
        // Two business days, because approval is somebody else's queue.
        actions: [
          { label: "Submitted", outcome: "next", delay: 2, ticks: ["submitted"] },
          { label: "Something else", outcome: "next", delay: 0, goto: "errand" },
        ],
      },
      {
        name: "confirm-it-s-approved",
        title: "Confirm it's approved",
        what: "Check the university approved and posted the listing.",
        why: "Submitting and posting are not the same thing.",
        steps: [
          "Look for the listing on their board.",
          "Put the link in Listing link on the record.",
          "Log it here.",
        ],
        actions: [{ label: "Approved and live", outcome: "next", delay: 2, ticks: ["approved"] }],
      },
      {
        name: "confirm-the-first-student-has-applied",
        title: "Confirm the first student has applied",
        what: "Someone came through the board.",
        why: "A live listing nobody applies to isn't working.",
        steps: ["Check for applications.", "Log it."],
        // The one that turns the light green: with submitted and approved
        // already ticked, this completes the channel. Reaching the goal is
        // also what earns the seasonal check, roughly a term out.
        actions: [
          { label: "First applicant in", outcome: "goal", delay: 120, ticks: ["visible"], goto: "seasonal" },
        ],
      },
      {
        seasonal: true,
        name: "seasonal",
        title: "Seasonal check",
        what: "The seasonal look at the posting.",
        why: "Postings expire silently.",
        steps: ["Open the listing link.", "Confirm a student could still apply."],
        attachment: { label: "Example posting", doc: "posting" },
        actions: [
          { label: "Still live", outcome: "goal", delay: 120, goto: "seasonal" },
        ],
      },
      {
        branch: "errand",
        title: "Something else",
        what: "Whatever the job board asked for that no rung covers.",
        why: "Every campus runs its board differently and some ask for things nothing here anticipates.",
        steps: ["Do the thing.", "Log what it was."],
        textarea: "What it was",
        actions: [
          {
            label: "Done — back to the sequence",
            outcome: "next",
            delay: 0,
            // Back to the rung the errand was opened from, which the
            // errand carries with it. The fixed rung below is only the
            // fallback for an errand queued before origins were carried:
            // on its own it sent a record at "Confirm hire" back to
            // "Meeting with the student", which is why nobody trusted it.
            resume: true,
            goto: "confirm-it-s-submitted",
          },
        ],
      },
    ],
  },

  advisors: {
    label: "Advisors",
    goal: "circulating · meeting held",
    channel: "st4",
    steps: [
      {
        name: "send-the-program-info",
        title: "Send the program info",
        what: "The first email to this office, sent by you from your own inbox.",
        why: "There is nothing to follow up on until something has been sent.",
        steps: ["Copy the email below.", "Attach the flyer.", "Send it, then log it."],
        email: {
          subject: "Paid caregiving shifts for your pre-health students — {university}",
          body: `Hi {first},

I am writing from Dr. Logan DuBose's office. We run the Student Caregiver Program, which places pre-health students at {university} into paid caregiving shifts with licensed local providers.

It is built for the students you advise: paid hands-on patient contact, hours that work around a class schedule, and a reference and recommendation letter at the end. No cost to the student and no cost to the university.

Would you be willing to pass the one-pager to your pre-health list? It is here: {flyer}

Happy to talk it through first if that is easier.

Best,
[your name]
Dr. Logan DuBose's office · Olera`,
        },
        actions: [{ label: "Log email sent", outcome: "next", delay: 2, ticks: ["flyer_sent"] }],
      },
      { name: "follow-up-1", rounds: FOLLOW_UP_ROUNDS, ...followUp(1, "advisors") },
      {
        name: "confirm-the-flyer-is-circulating",
        title: "Confirm the flyer is circulating",
        what: "Check they actually sent it to students.",
        why: "Agreeing and sending are not the same thing.",
        steps: ["Ask how it went out.", "Log what they say."],
        actions: [
          { label: "Yes, circulating", outcome: "next", delay: 0, ticks: ["agreed", "confirmed"] },
        ],
      },
      {
        name: "confirm-a-meeting-with-the-team",
        title: "Meeting with the team",
        what: "A conversation about raising awareness with students — booked, held, logged.",
        why: "The meeting is where the partnership actually forms, and people no-show often.",
        steps: ["Offer times and confirm one.", "Hold it.", "Pick the outcome and write a line about it."],
        inputs: [{ key: "meeting_at", label: "Meeting date and time", type: "datetime-local" }],
        textarea: "How it went",
        actions: [
          { label: "Held", outcome: "goal", delay: 120, goto: "recirculate" },
          { label: "No-show", outcome: "reschedule", delay: 7 },
          { label: "Needs reschedule", outcome: "reschedule", delay: 7 },
          { label: "Something else", outcome: "next", delay: 0, goto: "errand" },
        ],
      },
      {
        seasonal: true,
        // Named, because a goal that recurs has to say which rung comes
        // back and `goto` addresses a rung by name.
        name: "recirculate",
        title: "Seasonal check",
        what: "Ask the office to send the flyer out again.",
        why: "A flyer sent last term isn't reaching this term's students.",
        steps: ["Email the office with the current flyer.", "Confirm it went out."],
        email: {
          subject: "New term, new flyer — Student Caregiver Program",
          body: `Hi {first},

New term, so a fresh copy of the Student Caregiver flyer for your pre-health students: {flyer}

Same programme — paid caregiving shifts with local licensed providers, built around a class schedule. Placements from last term are going well and we have openings again.

Would you be able to send it out with your usual student mail?

Thank you,
[your name]
Dr. Logan DuBose's office · Olera`,
        },
        actions: [
          {
            label: "Logged",
            outcome: "goal",
            goto: "recirculate",
            delay: 90,
            ticks: ["flyer_sent"],
            hint: "Circulated again. Comes back next term.",
          },
        ],
      },
      {
        // A branch at the end of the ladder, and the only rung here that
        // belongs to the university rather than to an office — the same
        // shape as the providers' map sweep, and for the same reason: the
        // end is the only place a rung can be added without renumbering the
        // task rows already written against every step before it.
        //
        // It is also what makes this ladder start at all. Every other rung
        // here acts on an advisor record, and until this ran there was no
        // way for one to exist.
        branch: "advisorsweep",
        title: "Research advising offices",
        what: "Search the university for the offices that can put this programme in front of pre-health students, and add each one.",
        why: "Nobody at a university is going to find us. Every advisor record on this board starts here.",
        steps: [
          "Open the university site search, below.",
          "Work through the list of places to look in the note.",
          "For each one that passes the test, add it, filling in whatever the page already shows you.",
          "The role matters — a career centre manager and a pre-health advisor are approached differently.",
        ],
        script: `Search the university site for each of these:

  pre-health advising · pre-med advising · health professions
  nursing student services · career center · career services
  student success · college of arts and sciences advising

Add an office when all three are true:

  1. Somebody employed by the university works there. Not a student club — those are the Student orgs section.
  2. They talk to pre-health or pre-nursing students as part of the job. An advisor, a career centre manager, a programme director, a dean, a department administrator all count.
  3. There is a way to reach them — an email address, a contact form, or a phone number.

Add the office, not the building. "Pre-Health Advising Office" is a record; "Student Services" on its own is not.

If two names turn out to be the same office, add it once. If you are not sure whether somebody counts, add them and say why in the note — a wrong advisor costs one email, and a missed one costs a term.`,
        scriptLabel: "where to look, and what counts",
        textarea: "Anything worth saying about the sweep",
        // Built by the board from the campus, so the same search runs at
        // every university and nobody retypes it.
        link: { key: "advisor_search_url", label: "Search the university site" },
        // Once per university, so there is nothing to defer to.
        defer: false,
        foundNoun: "Office",
        actions: [
          {
            label: "All advising offices added for this area",
            outcome: "fanout",
            delay: 0,
          },
        ],
      },
      {
        branch: "errand",
        title: "Something else",
        what: "Whatever the office asked for that no rung covers.",
        why: "Nobody can guess in advance what an advising office will need.",
        steps: ["Do the thing.", "Log what it was."],
        textarea: "What it was",
        actions: [
          {
            label: "Done — back to the sequence",
            outcome: "next",
            delay: 0,
            // Back to the rung the errand was opened from, which the
            // errand carries with it. The fixed rung below is only the
            // fallback for an errand queued before origins were carried:
            // on its own it sent a record at "Confirm hire" back to
            // "Meeting with the student", which is why nobody trusted it.
            resume: true,
            goto: "confirm-the-flyer-is-circulating",
          },
        ],
      },
    ],
  },

  orgs: {
    label: "Student orgs",
    goal: "reached this term",
    channel: "st5",
    steps: [
      {
        name: "send-the-program-info",
        title: "Send the program info",
        what: "The first email to the officer you just named.",
        why: "There is nothing to follow up on until something has been sent.",
        steps: ["Copy the email below.", "Attach the flyer.", "Send it, then log it."],
        email: {
          subject: "Something for your members — paid caregiving shifts",
          body: `Hi {first},

I am writing from Dr. Logan DuBose's office about the Student Caregiver Program, and I think it fits {org} well.

We place pre-health students into paid caregiving shifts with licensed providers near {university}. Members get real patient contact before they apply to professional school, paid, on a schedule that works around classes.

Two ways we usually work with a group like yours:

  · You share the one-pager with your members: {flyer}
  · Or we come to a meeting and present for ten minutes

Either is fine. Which suits {org} better?

Best,
[your name]
Dr. Logan DuBose's office · Olera`,
        },
        actions: [{ label: "Log email sent", outcome: "next", delay: 2, ticks: ["flyer_sent"] }],
      },
      { name: "follow-up-1", rounds: FOLLOW_UP_ROUNDS, ...followUp(1, "orgs") },
      {
        name: "confirm-the-flyer-went-out-or-a-presentation-is-booked",
        title: "Confirm the flyer went out",
        what: "Either outcome counts — they circulate it, or they let us present.",
        why: "This is the goal for an org, and it resets every semester.",
        steps: ["Ask which one they'll do.", "Confirm it happened or is booked.", "Log it."],
        actions: [
          { label: "Flyer circulated", outcome: "next", delay: 0, ticks: ["confirmed"] },
          { label: "They will not circulate it", outcome: "next", delay: 0 },
          { label: "Something else", outcome: "next", delay: 0, goto: "errand" },
        ],
      },
      {
        name: "book-a-presentation",
        title: "Book a presentation",
        what: "Ten minutes at one of their meetings.",
        why: "A flyer in a group chat is read by whoever scrolls past. A presentation is the whole room.",
        steps: ["Ask which meeting suits.", "Confirm the date.", "Put it in the calendar."],
        inputs: [{ key: "presentation_at", label: "Presentation date and time", type: "datetime-local" }],
        actions: [
          { label: "Presentation booked", outcome: "goal", delay: 0 },
          { label: "They do not want one", outcome: "goal", delay: 0 },
        ],
      },
      {
        name: "recirculate-with-the-org-late-july",
        seasonal: true,
        title: "Seasonal check",
        what: "Reach the org again for the new term.",
        why: "Presidents and officers change every year.",
        steps: ["Check the contact is still there.", "Ask for the flyer to go out again."],
        email: {
          subject: "Checking in for the new term — {org}",
          body: `Hi {first},

New term, so checking in. Are you still the right person for {org}, or has the committee changed hands?

The Student Caregiver Program is running again with openings near campus — paid caregiving shifts for pre-health students. Current flyer: {flyer}

If you can send it round, or if a ten-minute slot at a meeting is easier, let me know which works.

Thank you,
[your name]
Dr. Logan DuBose's office · Olera`,
        },
        actions: [{ label: "Logged", outcome: "goal", delay: 0, ticks: ["flyer_sent"] }],
      },
      {
        branch: "orgsweep",
        title: "Identify the student orgs and leaders",
        link: { key: "org_search_url", label: "Search for student orgs" },
        what: "Find the pre-health and nursing student organisations, and who runs them.",
        why: "Orgs reach students through channels we cannot touch — group chats, meetings. There is no general inbox, so the officer's name is the address.",
        steps: [
          "Open the search below and work the university's org directory.",
          "Add each org with its president or officer — name, role, email, phone.",
          "Finish when the list is complete. Each one starts its own outreach.",
        ],
        foundNoun: "Org",
        actions: [{ label: "All student orgs added for this area", outcome: "fanout", delay: 0 }],
      },
      {
        branch: "errand",
        title: "Something else",
        what: "Whatever the org asked for that no rung covers.",
        why: "Nobody can guess in advance what a student organisation will need.",
        steps: ["Do the thing.", "Log what it was."],
        textarea: "What it was",
        actions: [
          {
            label: "Done — back to the sequence",
            outcome: "next",
            delay: 0,
            // Back to the rung the errand was opened from, which the
            // errand carries with it. The fixed rung below is only the
            // fallback for an errand queued before origins were carried:
            // on its own it sent a record at "Confirm hire" back to
            // "Meeting with the student", which is why nobody trusted it.
            resume: true,
            goto: "send-the-program-info",
          },
        ],
      },
    ],
  },

  events: {
    label: "Campus events",
    goal: "attended",
    channel: "st6",
    emptyNote: "Find the fairs and events worth being at, or set one up.",
    steps: [
      {
        name: "inquire-about-participating",
        title: "Inquire about participating",
        what: "Ask the organiser whether we can have a table, a slot, or a mention.",
        why: "Most fairs have a form and a deadline, and both are easy to miss by a week.",
        steps: ["Find who runs it.", "Ask what participating involves and what it costs.", "Log what they say."],
        textarea: "What they said",
        actions: [
          { label: "We're in", outcome: "next", delay: 0 },
          { label: "Waiting to hear", outcome: "repeat", delay: 7 },
          { label: "Not this one", outcome: "archive", delay: 0 },
          { label: "Something else", outcome: "next", delay: 0, goto: "errand" },
        ],
      },
      {
        name: "assign-a-leader",
        title: "Assign a leader",
        what: "One person owns this event end to end.",
        why: "An event with no name against it is an event nobody prepares for and two people turn up to.",
        steps: ["Pick who is running it.", "Tell them.", "Type their name."],
        inputs: [{ key: "leader", label: "Who owns this event", type: "text" }],
        actions: [{ label: "Leader assigned", outcome: "next", delay: 0 }],
      },
      {
        name: "prepare-for-the-event",
        title: "Prepare for the event",
        what: "Everything that has to exist before the day.",
        why: "Turning up with nothing to hand anybody is the commonest way an event produces no applications.",
        steps: [
          "Build or pull the collateral — flyers, a one-pager, the QR.",
          "Attach it to this record so whoever goes can find it.",
          "Confirm the logistics: time, place, table, parking.",
        ],
        textarea: "What is ready and what is not",
        actions: [
          { label: "Ready", outcome: "next", delay: 0 },
          { label: "Something else", outcome: "next", delay: 0, goto: "errand" },
        ],
      },
      {
        name: "attend-and-document",
        title: "Attend and document",
        what: "Go, work it, and write down what happened.",
        why: "An event nobody wrote up is an event we cannot decide about next season.",
        steps: [
          "Attend.",
          "Note students spoken to and applications started.",
          "Attach photos or anything worth keeping.",
        ],
        inputs: [
          { key: "students_spoken_to", label: "Students spoken to", type: "number" },
          { key: "applications_started", label: "Applications started", type: "number" },
        ],
        textarea: "How it went",
        actions: [
          { label: "Attended", outcome: "goal", delay: 120, goto: "what-s-coming-this-term-late-july" },
          { label: "We did not go", outcome: "archive", delay: 0 },
        ],
      },
      {
        name: "what-s-coming-this-term-late-july",
        title: "Seasonal check",
        what: "What is on this season, and what should we run ourselves?",
        why: "Fairs move, and the best slot is often one we create rather than join.",
        steps: ["Check the calendar for the coming term.", "Add anything worth attending.", "Decide whether to host one."],
        textarea: "What is coming",
        actions: [{ label: "Logged", outcome: "goal", delay: 120, goto: "what-s-coming-this-term-late-july" }],
      },
      {
        branch: "eventsweep",
        title: "Research career fairs and events",
        what: "Find the fairs, expos and involvement events worth being at.",
        why: "A campus runs more of these than anybody remembers, and the good ones fill up early.",
        steps: [
          "Open the search below and work the university's events calendar.",
          "Add each event worth attending, with whoever organises it.",
          "Finish when the list is complete. Each one starts its own preparation.",
        ],
        link: { key: "event_search_url", label: "Search for campus events" },
        foundNoun: "Event",
        actions: [{ label: "All events added for this area", outcome: "fanout", delay: 0 }],
      },
      {
        branch: "errand",
        title: "Something else",
        what: "Whatever this event needed that no rung covers — an approval, a permit, a marketing ask.",
        why: "Getting an event approved and in front of students throws up things nobody can list in advance.",
        steps: ["Do the thing.", "Log what it was."],
        textarea: "What it was",
        actions: [
          {
            label: "Done — back to the sequence",
            outcome: "next",
            delay: 0,
            // Back to the rung the errand was opened from, which the
            // errand carries with it. The fixed rung below is only the
            // fallback for an errand queued before origins were carried:
            // on its own it sent a record at "Confirm hire" back to
            // "Meeting with the student", which is why nobody trusted it.
            resume: true,
            goto: "prepare-for-the-event",
          },
        ],
      },
    ],
  },

  professors: {
    label: "Professors",
    goal: "emailed this season",
    channel: "st7",
    emptyNote: "Find the faculty whose students fit, and write to them once.",
    steps: [
      {
        name: "email-flyer-and-class-visit",
        title: "Email — flyer and class visit",
        what: "One email asking them to share the flyer and offering a class visit.",
        why: "Never more than one email per professor per season. That is the rule, and it is what makes the next one welcome.",
        steps: [
          "Check the campus note first — a few universities restrict outside solicitation through their systems.",
          "If an advising office has said we may name them, put their name in. If not, send it as it stands.",
          "Send it from your own inbox, then log it.",
        ],
        email: {
          subject: "For your students: paid caregiving shifts near {university}",
          body: `Dear {first},
{approval}
I am writing once, with something that may suit some of your students.

The Student Caregiver Program places pre-health students into paid caregiving shifts with licensed local home care agencies near {university}. They help older adults with supervision, medication reminders, transfers, companionship and personal care — hands-on experience, paid, arranged around a class timetable, and the kind of thing an admissions committee asks about.

Would you be comfortable sharing the one-pager with students you think it fits? {flyer}

If it is easier, we are happy to come and speak for ten minutes at the start of a session instead.

This is the only email you will get from me this term.

With thanks,
[your name]
Dr. Logan DuBose's office · Olera`,
        },
        actions: [
          { label: "Log email sent", outcome: "next", delay: 7 },
          { label: "Something else", outcome: "next", delay: 0, goto: "errand" },
        ],
      },
      {
        name: "confirm-they-shared-it",
        title: "Confirm they shared it",
        what: "Did the flyer reach students?",
        why: "Agreeing and sending are not the same thing, and this is the only number that says the channel works.",
        steps: ["Ask how it went out — email, announcement, in class.", "Log what they say."],
        textarea: "What they said",
        actions: [
          { label: "Yes, shared", outcome: "goal", delay: 120, goto: "message-professors-again-late-july" },
          { label: "Class visit booked", outcome: "goal", delay: 120, goto: "message-professors-again-late-july" },
          { label: "No reply", outcome: "goal", delay: 120, goto: "message-professors-again-late-july" },
          { label: "Asked us not to write again", outcome: "archive", delay: 0 },
        ],
      },
      {
        name: "message-professors-again-late-july",
        seasonal: true,
        title: "Seasonal check",
        what: "The one message this season.",
        why: "A new term means new students on the roster.",
        steps: ["Send the seasonal email.", "Log it."],
        email: {
          subject: "New term — Student Caregiver Program at {university}",
          body: `Dear {first},

New term, so one note about the Student Caregiver Program: paid caregiving shifts for pre-health students with licensed local home care agencies near {university}, arranged around their classes.

Current one-pager: {flyer}

Same offer as before — share it with your students, or we will come and speak for ten minutes. Either way, this is my one email this term.

With thanks,
[your name]
Dr. Logan DuBose's office · Olera`,
        },
        actions: [{ label: "Logged", outcome: "goal", delay: 120, goto: "message-professors-again-late-july" }],
      },
      {
        branch: "professorsweep",
        title: "Research professors from the directory",
        what: "List the faculty whose students fit the program, with their department email.",
        why: "Targeting the right courses matters far more than volume, and one wrong email costs more than ten right ones earn.",
        steps: [
          "Open the search below and work the department directory.",
          "Add each professor worth writing to — name, department or course, email.",
          "Finish when the list is complete. Each one gets one email.",
        ],
        link: { key: "professor_search_url", label: "Search the faculty directory" },
        foundNoun: "Professor",
        actions: [{ label: "All professors added for this area", outcome: "fanout", delay: 0 }],
      },
      {
        branch: "errand",
        title: "Something else",
        what: "Whatever came back from a professor that no rung covers.",
        why: "A reply asking for something specific is the best outcome this channel has, and it never fits a template.",
        steps: ["Do the thing.", "Log what it was."],
        textarea: "What it was",
        actions: [
          {
            label: "Done — back to the sequence",
            outcome: "next",
            delay: 0,
            // Back to the rung the errand was opened from, which the
            // errand carries with it. The fixed rung below is only the
            // fallback for an errand queued before origins were carried:
            // on its own it sent a record at "Confirm hire" back to
            // "Meeting with the student", which is why nobody trusted it.
            resume: true,
            goto: "confirm-they-shared-it",
          },
        ],
      },
      {
        branch: "permission",
        title: "Ask permission to contact faculty",
        what: "One approach to whoever can say yes on behalf of the institution — a department chair, industry or corporate relations, or a communications office.",
        why: "Naming who approved us changes a faculty email more than any other word in it. It is not a gate: the emails go out either way, and this makes the next ones land better.",
        steps: [
          "Find the chair, industry-relations or communications contact for the departments we are writing to.",
          "Ask two things: may we contact faculty, and may we say you approved it.",
          "Type their name and title. Every professor email after this reads better for it.",
        ],
        link: { key: "permission_search_url", label: "Find who can approve this" },
        inputs: [
          { key: "approver", label: "Who approved it", type: "text" },
          { key: "approver_title", label: "Their title", type: "text" },
        ],
        email: {
          subject: "Contacting faculty about a paid student programme at {university}",
          body: `Dear {first},

I am writing from Dr. Logan DuBose's office before contacting any faculty, so that we do it the way you would want it done.

We run the Student Caregiver Program: pre-health students take paid caregiving shifts with licensed local home care agencies near {university}, arranged around their classes. It gives them hands-on experience with older adults before they apply to professional school.

We would like to write once to a small number of faculty whose students it may suit, asking them to use their own judgement about whether to pass it on. One email each, once a term.

One-pager: {flyer}

Two questions:

  · Are you comfortable with us contacting faculty directly?
  · If so, may we say you were happy for us to get in touch?

If you would rather we did not, say so and we will leave faculty alone here.

With thanks,
[your name]
Dr. Logan DuBose's office · Olera`,
        },
        actions: [
          { label: "Approved — we may name them", outcome: "goal", delay: 0, ticks: ["pathway", "approved"] },
          { label: "Approved — do not name them", outcome: "goal", delay: 0, ticks: ["pathway"] },
          { label: "No reply", outcome: "goal", delay: 0 },
          { label: "Refused — do not contact faculty", outcome: "closed", delay: 0 },
        ],
      },
    ],
  },
};

/**
 * "Something else", on every rung, in the row.
 *
 * Reality does not fit 37 buttons. A provider asks for something nobody
 * wrote a rung for; a student needs a thing on a Tuesday. The escape hatch
 * for that has existed since the provider ladder was written: it records
 * what needs doing and when to come back, parks the follow-up sequence
 * until then, and returns the record exactly where it left off.
 *
 * It was on 10 of 37 rungs, and 7 of those 10 were a hand-written copy that
 * carried none of that: no description, no date, no way home, so finishing
 * one threw the record back to a rung hard-coded into the branch. Only the
 * three provider rungs using the shared ERRAND actually worked.
 *
 * Appending it here rather than typing it into 27 more places is the point.
 * A rung added next month gets it without anybody remembering to, and a
 * hand-written near-copy cannot drift from the real one again. The build
 * gate asserts the coverage.
 *
 * Branches are skipped, and that covers the two cases worth skipping. A
 * branch is already the off-sequence path, so an escape hatch out of one is
 * an escape hatch out of an escape hatch: the errand branch offers a second
 * errand itself, deliberately, and says so in its own label. The sweeps are
 * branches too, which is the other case: a sweep fans out into other records
 * and is then finished, so it has no sequence to park.
 */
const withErrand = (ladders: Record<SectionKey, Ladder>): Record<SectionKey, Ladder> =>
  Object.fromEntries(
    Object.entries(ladders).map(([key, ladder]) => [
      key,
      {
        ...ladder,
        steps: ladder.steps.map((rung) => {
          if (rung.branch) return rung;
          // A hand-written "Something else" is replaced, not kept beside
          // the real one. Two buttons with the same label, one of which
          // silently loses the record's place, is worse than either.
          const rest = rung.actions.filter((a) => a.goto !== "errand");
          return { ...rung, actions: [...rest, ERRAND_EVERYWHERE] };
        }),
      },
    ]),
  ) as Record<SectionKey, Ladder>;

export const LADDERS: Record<SectionKey, Ladder> = withErrand(RAW_LADDERS);

/** Column order, left to right, everywhere the seven appear together. */
export const SECTION_ORDER: SectionKey[] = [
  "providers",
  "students",
  "jobboard",
  "advisors",
  "orgs",
  "events",
  "professors",
];

/**
 * The rung at a position, with a follow-up block resolved to the round in
 * hand. `round` is 1-based and ignored outside a block.
 */
export function rungAt(section: SectionKey, step: number, round = 1): LadderRung | null {
  const rung = LADDERS[section].steps[step];
  if (!rung) return null;
  if (rung.rounds) {
    const block =
      rung.name === "onboardfollow" ? onboardingFollowUp(round) : followUp(round, section);
    return { ...block, rounds: rung.rounds, exhausted: rung.exhausted, name: rung.name };
  }
  return rung;
}

function followUpWho(section: SectionKey): string {
  if (section === "advisors") return "the advising office";
  if (section === "orgs") return "your organisation";
  return "your agency";
}

/** Every criterion key the ladders claim to answer, by channel. */
export function criteriaTicked(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const key of SECTION_ORDER) {
    const ladder = LADDERS[key];
    if (!ladder.channel) continue;
    const keys = new Set<string>();
    for (const rung of ladder.steps)
      for (const action of rung.actions) for (const t of action.ticks ?? []) keys.add(t);
    out[ladder.channel] = [...keys];
  }
  return out;
}
