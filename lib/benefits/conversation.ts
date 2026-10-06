/**
 * Words for the benefits conversation (Phase 3, first screen, 5 Oct 2026).
 * The question engine decides WHICH fact to ask; this file says it, in the
 * finder's voice, with the reason drawn from the programs the answer decides.
 * Client-safe: no data imports.
 */
import type { FactKey, KnownFacts, Status } from "@/lib/benefits/question-engine";
import type { FinderWho } from "@/lib/benefits/finder-answers";

export interface ConversationProgram {
  id: string;
  name: string;
  status: Status;
  /** One family-readable line on why, or null. */
  why: string | null;
}

export interface ConversationTurn {
  question: { fact: FactKey; turnsOn: string[] } | null;
  /** Upper bound on engine questions still to come, this one included. */
  left: number;
  programs: ConversationProgram[];
}

export interface Choice { value: string; label: string }

function voice(who: FinderWho | null) {
  switch (who) {
    case "parent": return { they: "your parent", their: "their", does: "Does your parent", is: "Is your parent", has: "has", needs: "needs" };
    case "spouse": return { they: "your spouse", their: "their", does: "Does your spouse", is: "Is your spouse", has: "has", needs: "needs" };
    case "other": return { they: "the person you help", their: "their", does: "Does the person you help", is: "Is the person you help", has: "has", needs: "needs" };
    default: return { they: "you", their: "your", does: "Do you", is: "Are you", has: "have", needs: "need" };
  }
}

/** Short names for the "why I'm asking" line: drop parentheticals and the state. */
export function shortName(name: string, stateName?: string | null): string {
  let s = name.replace(/\s*\([^)]*\)/g, "").trim();
  if (stateName) s = s.replace(new RegExp(`^${stateName}\\s+`, "i"), "");
  return s;
}

function listNames(names: string[], stateName?: string | null): string {
  const n = [...new Set(names.map((x) => shortName(x, stateName)))].slice(0, 3);
  if (n.length <= 1) return n[0] ?? "";
  return `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`;
}

export function questionCopy(fact: FactKey, who: FinderWho | null, turnsOn: string[], stateName: string | null): { title: string; why: string; choices: Choice[] } {
  const v = voice(who);
  const programs = listNames(turnsOn, stateName);
  // One short line: which programs this answer decides, by short name.
  const names = [...new Set(turnsOn.map((x) => shortName(x, stateName)))];
  const these = names.length <= 3 ? `This decides ${programs}` : `This decides ${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
  switch (fact) {
    case "dailyHelp":
      return { title: `${v.does} need help with bathing, dressing or using the bathroom?`, why: `${these}.`, choices: [
        { value: "lots", label: "Yes, most days" }, { value: "some", label: "Some help" }, { value: "none", label: "Not really" }] };
    case "age":
      return { title: who === "me" || !who ? "How old are you?" : `How old is ${v.they}?`, why: `${these}.`, choices: [
        { value: "under_60", label: "Under 60" }, { value: "60_64", label: "60 to 64" }, { value: "65_74", label: "65 to 74" }, { value: "75_84", label: "75 to 84" }, { value: "85_plus", label: "85 or older" }] };
    case "savings":
      return { title: who === "spouse" ? "About how much do you and your spouse have in savings?" : `About how much ${who === "me" || !who ? "do you" : `does ${v.they}`} have in savings?`, why: `${these}. A home and car don't count${who === "spouse" ? "" : "; for a married couple, count both"}.`, choices: [
        { value: "under2000", label: "Under $2,000" }, { value: "under10000", label: "$2,000 to $10,000" }, { value: "over10000", label: "More than $10,000" }] };
    case "income":
      // A couple's limits are for the two of them, so a couple answers together.
      return { title: who === "spouse" ? "About how much income do you and your spouse get each month, together?" : `About how much income ${who === "me" || !who ? "do you" : `does ${v.they}`} get each month?`, why: `${these}. Count Social Security and pensions${who === "spouse" ? "" : "; for a married couple, count both"}.`, choices: [
        { value: "under1000", label: "Under $1,000" }, { value: "under1500", label: "$1,000 to $1,500" }, { value: "under2500", label: "$1,500 to $2,500" }, { value: "under4000", label: "$2,500 to $4,000" }, { value: "over4000", label: "More than $4,000" }] };
    case "household":
      return { title: who === "me" || !who ? "Who do you live with?" : `Who does ${v.they} live with?`, why: `Some programs count everyone in the home. ${these}.`, choices: [
        { value: "alone", label: who === "me" || !who ? "I live alone" : "On their own" },
        { value: "couple", label: who === "me" || !who ? "My spouse or partner" : "A spouse or partner" },
        { value: "family", label: who === "me" || !who ? "Other family" : "Me or other family" }] };
    case "disability":
      return { title: `${v.does} have a disability, or get disability benefits?`, why: `${these}. Some take younger people with a disability.`, choices: [
        { value: "yes", label: "Yes" }, { value: "no", label: "No" }] };
    case "medicaid":
      return { title: `${v.does} have Medicaid now?`, why: `${these}.`, choices: [{ value: "has", label: "Yes" }, { value: "no", label: "No" }] };
    case "veteran":
      return { title: `${v.is} a veteran, or the spouse of one?`, why: `${these}.`, choices: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }] };
  }
}

const RULE_WORDS: Record<string, string> = {
  notMedicaid: "being for people without Medicaid", age: "the age rule", income: "its income limit", savings: "its savings limit", medicaid: "needing Medicaid first", veteran: "being for veterans", dailyHelp: "needing help with daily care",
};

/** One line on a program's status, from the rules behind it. */
export function whyLine(status: Status, failed: string[], met: string[]): string | null {
  if (status === "out") return failed[0] === "income" ? "Over its income limit." : failed[0] === "savings" ? "Over its savings limit." : failed[0] === "age" ? "Outside its age range." : failed[0] === "dailyHelp" ? "It's for people who need help with daily care." : failed[0] ? `Ruled out by ${RULE_WORDS[failed[0]] ?? failed[0]}.` : null;
  if (status === "likely") {
    const bits = met.map((m) => ({ age: "the age fits", income: "under the income limit", savings: "under the savings limit", dailyHelp: "the care needs fit", medicaid: "has Medicaid", veteran: "veteran" } as Record<string, string>)[m]).filter(Boolean);
    return bits.length ? `${bits[0][0].toUpperCase()}${bits[0].slice(1)}${bits.length > 1 ? `, ${bits.slice(1).join(", ")}` : ""}.` : null;
  }
  return null;
}

export type { FactKey, KnownFacts };
