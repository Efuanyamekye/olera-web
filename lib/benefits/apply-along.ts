/**
 * Apply-along for Medicare Savings, through Social Security's Extra Help
 * application (Phase 5 of the benefits caseworker, 7 Oct 2026).
 *
 * Why this form: under section 113 of MIPPA, an Extra Help (Part D Low Income
 * Subsidy) application sent to Social Security also starts a Medicare Savings
 * application with the state, unless the person says no to sharing it. Social
 * Security sends the state the application even when it turns Extra Help
 * down (California DHCS letter 25-07), so a family in New York or
 * Massachusetts, where Medicare Savings reaches higher incomes, still gets
 * the state's review. One national form starts two programs in every state.
 *
 * Olera never sees or stores a Social Security number. This builds the
 * answer sheet: Social Security's sections in order, each with what the
 * family already told us filled in and what only they hold marked. The
 * family presses submit on Social Security's site themselves.
 *
 * Sources: SSA POMS HI 03010.038 (the i1020 sections, in order) and HI
 * 03010.015 (MIPPA); SSA "Helping someone apply online". Client-safe.
 */
import { narrowRange, parseCuts } from "@/lib/benefits/cut";
import { finderVoice, type FinderWho } from "@/lib/benefits/finder-answers";
import thresholds from "@/data/pipeline/federal-thresholds.json";

export const SSA_EXTRA_HELP_URL = "https://www.ssa.gov/extrahelp";
export const SSA_PHONE = "1-800-772-1213";

export type ApplyHousehold = "alone" | "couple" | "family" | null;

export interface ApplyAlongInput {
  who: FinderWho | null;
  household: ApplyHousehold;
  /** The conversation's ranges and follow-ups (question-engine values). */
  income: string | null;
  incomeCut: string | null;
  savings: string | null;
  savingsCut: string | null;
  stateName: string;
  /** The state's Medicare Savings program, as the plan names it. */
  mspName: string;
}

export interface ApplyStep {
  title: string;
  /** What to put, from what the family told us, or what they'll need. */
  answer: string;
  note?: string;
  /** The Medicare Savings consent: the step that starts the state's application. */
  key?: boolean;
}

export interface ApplyAlong {
  heading: string;
  lede: string;
  gather: string[];
  steps: ApplyStep[];
  next: string[];
  /** Said on the phone to Social Security instead. */
  phoneScript: string;
}

const INCOME: Record<string, [number, number]> = { under1000: [0, 1000], under1500: [1000, 1500], under2500: [1500, 2500], under4000: [2500, 4000], over4000: [4000, Infinity] };
const SAVINGS: Record<string, [number, number]> = { under2000: [0, 2000], under10000: [2000, 10000], over10000: [10000, Infinity] };

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** "between $1,500 and $2,455", "$2,455 or less", "more than $3,000". */
function rangeText(range: [number, number] | undefined, cut: string | null): string | null {
  if (!range) return null;
  let [lo, hi] = range;
  let above = false;
  for (const c of parseCuts(cut) || []) {
    if (c.under == null || c.at <= lo || c.at >= hi) continue;
    if (c.under) hi = c.at;
    else { lo = c.at; above = true; }
  }
  if (hi === Infinity) return `more than ${usd(lo)}`;
  if (lo <= 0) return `${usd(hi)} or less`;
  return above ? `more than ${usd(lo)} and up to ${usd(hi)}` : `between ${usd(lo)} and ${usd(hi)}`;
}

/** Extra Help's 2026 limits: income 150% of poverty, resources from SSA. */
function extraHelpLimits() {
  const years = Object.keys(thresholds.fpl).sort();
  const [first, extra] = (thresholds.fpl as Record<string, Record<string, number[]>>)[years[years.length - 1]]["48"];
  return {
    incomeSingle: Math.round((first * 1.5) / 12),
    incomeCouple: Math.round(((first + extra) * 1.5) / 12),
    // SSA's published 2026 resource limits, burial allowance included.
    resourcesSingle: 18090,
    resourcesCouple: 36100,
  };
}

export function buildApplyAlong(input: ApplyAlongInput): ApplyAlong {
  // "Medicare Savings Program" reads as a name only with "the" in front.
  const a = { ...input, mspName: /^medicare savings/i.test(input.mspName) ? `the ${input.mspName}` : input.mspName };
  const v = finderVoice(a.who);
  const self = a.who === "me" || !a.who;
  const couple = a.household === "couple";
  const them = self ? "you" : v.subject;
  const their = self ? "your" : "their";
  const income = rangeText(a.income ? INCOME[a.income] : undefined, a.incomeCut);
  const savings = rangeText(a.savings ? SAVINGS[a.savings] : undefined, a.savingsCut);
  const lim = extraHelpLimits();
  const incomeLimit = couple ? lim.incomeCouple : lim.incomeSingle;
  const [, incomeHi] = a.income && INCOME[a.income] ? narrowRange(INCOME[a.income], a.incomeCut) : [0, Infinity];

  const steps: ApplyStep[] = [
    {
      title: "Start the application",
      answer: self ? "Choose to apply for yourself." : `Choose to help someone else apply. You answer as if you were ${v.subject}.`,
      note: self ? undefined : `If ${v.subject} isn't with you, Social Security mails the finished form to them to sign.`,
    },
    {
      title: `About ${them}`,
      answer: `Name, date of birth and Social Security number, as on ${their} Medicare and Social Security cards.`,
    },
    {
      title: "Married and living together?",
      answer: couple ? "Yes." : a.household ? "No." : "Answer for them.",
      note: couple ? "If both of you have Medicare, apply for both on this one form." : undefined,
    },
    {
      title: "Savings and property",
      answer: savings
        ? `You told us ${couple ? "your savings together are" : `${their} savings are`} ${savings}. Enter each account's balance.`
        : "Enter each account's balance: checking, savings, stocks and bonds, retirement accounts, cash at home.",
      // Medicare's Extra Help fact sheet (12203): home, one car, burial plot,
      // furniture and personal items don't count; retirement accounts and
      // land other than the home do.
      note: `Don't count ${their} home, one car, a burial plot, or furniture and personal things. Up to $1,500 each set aside for burial can be left out. Retirement accounts, and land or a second home, do count.`,
    },
    {
      title: self ? "Relatives you support" : "Relatives they support",
      answer: a.household === "alone" || couple
        ? "No, unless a relative lives with them and depends on them for at least half their support."
        : "Only relatives living with them who depend on them for at least half their support. A parent who lives with your family usually answers No.",
    },
    {
      title: "Income",
      answer: income
        ? `You told us ${couple ? "your income together is" : self ? "your income is" : "their income is"} ${income} a month. Enter each source as a monthly amount.`
        : "Enter each source as a monthly amount.",
      note: "Social Security before the Medicare premium is taken out, pensions, and any wages. Food stamps and housing or energy help don't count.",
    },
    {
      title: "Work",
      answer: "If no one on the application works, answer No.",
    },
    {
      // Opt-out, not opt-in: Social Security sends the application to the
      // state "unless you tell them not to" (Medicare fact sheet 12203; SSA
      // POMS HI 03010.038). So the instruction names the meaning, never a
      // button label: a "Yes" could be the opt-out on some versions of the form.
      title: "Sending it to the state for Medicare Savings",
      answer: `Let Social Security send it to ${a.stateName}. Don't choose "do not send". That's what starts ${a.mspName}.`,
      note: "If you tell them not to send it, only Extra Help is decided.",
      key: true,
    },
    {
      title: "Sign and send",
      answer: self ? "Review and submit." : `Review and submit. If ${v.subject} wasn't with you, watch for the form in the mail for them to sign and send back.`,
    },
  ];

  const next = [
    "Social Security mails a decision on Extra Help, usually within a few weeks.",
    `${a.stateName}'s Medicaid office contacts ${them} about ${a.mspName}. States have up to 45 days to decide.`,
  ];
  // Over Extra Help's own limit, the form still matters: it goes to the state.
  if (incomeHi !== Infinity && incomeHi > incomeLimit) {
    next.unshift(`If Social Security says no to Extra Help, the form still goes to ${a.stateName} for Medicare Savings, which can reach higher incomes.`);
  }

  return {
    heading: "Apply for Extra Help, and Medicare Savings with it",
    lede: `One Social Security form, which you can fill in on a phone. Unless you tell them not to, it also starts ${a.mspName} with ${a.stateName}.`,
    gather: [
      couple ? `Both Social Security numbers and Medicare cards` : `${self ? "Your" : "Their"} Social Security number and Medicare card`,
      "Latest balances for each bank account and investment",
      "Monthly amounts of Social Security, pensions and any wages",
    ],
    steps,
    next,
    phoneScript: `Hi, I'd like to apply for Extra Help ${v.callFor}, and have it sent to the state for Medicare Savings too.`,
  };
}

/** Is this program one the apply-along starts (Medicare Savings or Extra Help)? */
export function startsWithExtraHelp(name: string): boolean {
  return /medicare savings|\bqmb\b|\bslmb\b|qualified medicare|healthy horizons|buy-in|extra help|low[- ]income subsidy/i.test(name);
}

/** The apply-along link, carrying the answers that fill the sheet (no personal data). */
export function applyAlongHref(p: {
  stateCode: string | null;
  programId: string;
  who?: string | null;
  household?: ApplyHousehold;
  income?: string | null;
  incomeCut?: string | null;
  savings?: string | null;
  savingsCut?: string | null;
  token?: string | null;
}): string {
  const q = new URLSearchParams();
  if (p.stateCode) q.set("st", p.stateCode);
  q.set("p", p.programId);
  if (p.who) q.set("w", p.who);
  if (p.household) q.set("h", p.household);
  if (p.income && p.income !== "unsure") q.set("i", p.income);
  if (p.incomeCut) q.set("ic", p.incomeCut);
  if (p.savings) q.set("s", p.savings);
  if (p.savingsCut) q.set("sc", p.savingsCut);
  if (p.token) q.set("t", p.token);
  return `/benefits/apply/extra-help?${q.toString()}`;
}
