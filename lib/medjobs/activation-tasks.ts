/**
 * What each generated task tells the Consumer Relations Manager to do.
 *
 * The instructions are drawn from the maintaining-means column of
 * MATRIX.md, so the task and the standard operating procedure say the same
 * thing. Content lives here rather than in the components: five task types
 * and one custom, not one row per university, which is what keeps this an
 * operational tool rather than a CRM.
 */

import type { TaskType } from "@/lib/medjobs/activation";

export interface TaskDef {
  /** Row label in the Tasks tab. */
  title: string;
  what: string;
  why: string;
  steps: string[];
  doneWhen: string;
  /** Absent where the task is a look-at-it check rather than a send. */
  email?: { subject: string; body: string };
  script?: string;
  /** A CRITERION task answers a checkbox and asks a yes/not-yet question
   *  instead of offering Mark done. */
  kind: "check" | "criterion";
}

export const TASK_DEFS: Record<Exclude<TaskType, "manual_followup">, TaskDef> = {
  activation_job_board_check: {
    kind: "check",
    title: "Confirm posting still live",
    what: "Open the job posting and confirm students can still see and apply to it.",
    why: "Postings expire and get archived quietly. A dead posting looks identical to a live one on our side until someone looks.",
    steps: [
      "Open the posting URL on the channel record.",
      "Confirm it is visible and the apply route works.",
      "If it has expired, repost or renew it, then update the URL.",
    ],
    doneWhen: "You have seen the posting live, or reposted it.",
  },

  activation_listserv_confirm: {
    kind: "criterion",
    title: "Confirm advisor agreed to distribute the flyer",
    what: "You sent the advisor the flyer. Find out whether they have agreed to send it to the listserv.",
    why: "The send only happens because we ask. A flyer sitting unanswered in an inbox is not a channel.",
    steps: [
      "Check for a reply.",
      "If there is none, follow up directly. A short note or a call is usually enough.",
      "Answer below once you know.",
    ],
    doneWhen: "The advisor has said yes, or you have asked again.",
    email: {
      subject: "Checking on the flyer",
      body: `Hi {{contact}},

Just checking on the flyer I sent last week. Would you be able to send it to your pre-health list?

Happy to change anything first.

Thanks,
{{me}}`,
    },
    script: `I sent over a one-page flyer last week about paid caregiving shifts for students. Wanted to check whether you had a chance to look at it, and whether you would be willing to send it to your list.`,
  },

  activation_listserv_remind: {
    kind: "check",
    title: "Remind to send copy to listserv again",
    what: "Send the advisor fresh copy for this month's listserv send.",
    why: "The advisor forwards what we write. If we do not write it, nothing goes out.",
    steps: [
      "Write this month's copy: subject line, three sentences, and the link.",
      "Email it ready to forward, unedited, under their own name.",
      "Confirm a send date before closing this task.",
    ],
    doneWhen: "The advisor has this month's copy and a send date is agreed.",
    email: {
      subject: "This month's copy for the pre-health list",
      body: `Hi {{contact}},

Here is this month's note, ready to send as is.

[three sentences and the link]

Is there a day this week that works?

Thanks,
{{me}}`,
    },
    script: `I have this month's copy ready for the list. It is short and written so you can send it as is. Is there a day this week that works for you?`,
  },

  activation_org_reconnect: {
    kind: "check",
    title: "Reconnect to maintain distribution",
    what: "Check back in with the organization and give them something current to share.",
    why: "A single share fades. Officers change, group chats move on, and the relationship goes cold without contact.",
    steps: [
      "Contact the officer on the record.",
      "Send the current flyer or a short update worth sharing.",
      "If leadership has changed, update the contact on the record.",
    ],
    doneWhen: "You have spoken to the organization and they have something current.",
    email: {
      subject: "Quick update for your members",
      body: `Hi {{contact}},

Sending over the current version in case it is useful for your members again this month.

Anything you would like changed before you share it, just say.

Thanks,
{{me}}`,
    },
    script: `Wanted to check in and see whether it would be useful to share the opportunity with your members again. I can send over a current version ready to post.`,
  },

  activation_event_review: {
    kind: "check",
    title: "Semester review of event opportunities",
    what: "Look across the coming semester and decide what we should be at, and what we should host.",
    why: "Fairs and conferences have registration deadlines months ahead. Missing one costs a whole semester.",
    steps: [
      "Check whether we can host a student webinar this semester.",
      "Confirm upcoming career fairs, job fairs and conferences.",
      "Add anything new as an event record with its dates and deadlines.",
    ],
    doneWhen: "The event list reflects the coming semester, with dates on the record.",
  },

  activation_event_day: {
    kind: "check",
    title: "Event day",
    what: "The event is today. Confirm it happened and record how it went.",
    why: "An event nobody recorded is an event we cannot learn from or repeat.",
    steps: [
      "Confirm the event ran and we were there.",
      "Add a note with roughly how many students engaged.",
    ],
    doneWhen: "The event is recorded as held, with a note.",
  },

  activation_professor_reengage: {
    kind: "check",
    title: "Re-engage professor",
    what: "Send the professor the current flyer and ask again for distribution or a short class visit.",
    why: "Terms turn over and classes change. A professor who agreed once will usually agree again if asked at the start of a term.",
    steps: [
      "Send the current flyer.",
      "Ask whether they would share it again, or host a short class visit this term.",
      "If a visit is agreed, record the format, date and presenter on the record.",
    ],
    doneWhen: "The professor has this term's flyer and has answered.",
    email: {
      subject: "A brief note for your students this term",
      body: `Dear {{contact}},

Sending the current version in case it is useful for your students this term.

Would you be willing to pass it along again? If it would be more useful, we can join a class briefly to explain it, virtually or in person.

Either is a real help.

{{me}}`,
    },
    script: `Wanted to check in for the new term. I can send the current flyer for your students, or we can join a class briefly if that is more useful. Whichever is easier.`,
  },
};

/** The two channel-level assets the drawer offers, drawn from the same well. */
export const CHANNEL_ASSETS: Partial<Record<string, { email: { subject: string; body: string }; script: string }>> = {
  st4: {
    email: {
      subject: "A paid option for your pre-health students",
      body: `Hi {{contact}},

Attached is the one-page flyer I mentioned. It explains how students can pick up paid caregiving shifts that work around a class schedule.

Would you be willing to send it to your pre-health listserv? Happy to change anything before you do.

Thanks,
{{me}}`,
    },
    script: `I sent over a one-page flyer about paid caregiving shifts for students. It is written so you can forward it as is.

Would you be able to send it to your pre-health list this month? I can adjust anything first if that helps.`,
  },
  st7: {
    email: {
      subject: "A brief note for your students",
      body: `Dear {{contact}},

{{approver}} suggested I write.

We work with local care providers who hire students for paid caregiving shifts that fit around coursework. It is clinical-adjacent experience, and it pays.

Would you be willing to pass the attached flyer to your students? If it would be more useful, we can join a class briefly to explain it, virtually or in person.

Either is a real help, and no is a fine answer.

{{me}}`,
    },
    script: `{{approver}} suggested I reach out. We connect students with paid caregiving shifts that work around class.

Two ways you could help: pass along a one-page flyer, or give us five minutes at the start of a class. Whichever is easier, or neither if it is not a fit.`,
  },
};

/**
 * Fill a template's placeholders. Anything we cannot resolve becomes a
 * square-bracket prompt rather than surviving as {{mustache}}: the manager
 * copies this text straight into a mail client, and a stray brace reaching
 * an advisor is worse than an obvious blank.
 */
export function fillTemplate(
  body: string,
  values: { contact?: string | null; approver?: string | null; me?: string | null },
): string {
  return body
    .replace(/\{\{contact\}\}/g, values.contact?.trim() || "[name]")
    .replace(/\{\{approver\}\}/g, values.approver?.trim() || "[the advisor]")
    .replace(/\{\{me\}\}/g, values.me?.trim() || "[your name]");
}
