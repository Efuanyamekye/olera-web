"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { isAgeBand, type AgeBand } from "@/lib/benefits/age";

/**
 * FactChips — the tappable half of the /m recognition row (Phase 3).
 *
 * The "what we know" panel was always meant to ASK, not just recite: facts
 * we hold render as regular chips; the gaps render as dashed "+ Add" chips
 * that expand into one-tap options inline. Every answer PATCHes
 * /api/benefits/update-enrichment (the results token is the auth — a POST
 * body, never a GET that writes), then router.refresh() re-runs the server
 * re-rank so the family SEES their matches sharpen. That refresh is the
 * payoff that makes answering feel worth it.
 */

export interface KnownFacts {
  /** Typed exact age only. */
  age: number | null;
  /** One-tap age band ("under_65" | "65_74" | "75_84" | "85_plus"). */
  ageBand?: AgeBand | null;
  medicaidStatus: string | null;
  incomeBand: string | null;
}

interface FactChipsProps {
  token: string;
  profileId: string;
  facts: KnownFacts;
  /** True when the payments chip already says Medicaid — the inferred "On
   *  Medicaid" fact chip would just repeat it. */
  suppressMedicaidChip?: boolean;
  /** The family is looking for themselves ("Myself") — ask "you", not
   *  "they". */
  isSelf?: boolean;
}

const AGE_LABELS: Record<AgeBand, string> = {
  under_65: "Under 65",
  "65_74": "Age 65 to 74",
  "75_84": "Age 75 to 84",
  "85_plus": "Age 85 or older",
  under_60: "Under 60",
  "60_64": "Age 60 to 64",
};

const MEDICAID_LABELS: Record<string, string> = {
  alreadyHas: "On Medicaid",
  applying: "Applying for Medicaid",
  notSure: "Medicaid: not sure",
  doesNotHave: "No Medicaid yet",
  denied: "Medicaid denied",
};

const INCOME_LABELS: Record<string, string> = {
  under1500: "Income under $1,500/mo",
  under2500: "Income $1,500 to $2,500/mo",
  under4000: "Income $2,500 to $4,000/mo",
  over4000: "Income over $4,000/mo",
  under6000: "Income $4,000 to $6,000/mo",
  over6000: "Income over $6,000/mo",
};

type Ask = "age" | "medicaid" | "income";

type AskConfig = { addLabel: string; prompt: string; options: { label: string; value: string }[] };

function askConfig(isSelf: boolean): Record<Ask, AskConfig> {
  return {
  age: {
    addLabel: "+ Add age",
    prompt: isSelf ? "How old are you?" : "How old is the person needing care?",
    options: [
      { label: "Under 65", value: "under_65" },
      { label: "65 to 74", value: "65_74" },
      { label: "75 to 84", value: "75_84" },
      { label: "85 or older", value: "85_plus" },
    ],
  },
  medicaid: {
    addLabel: "+ Medicaid?",
    prompt: isSelf ? "Do you have Medicaid?" : "Do they have Medicaid?",
    options: [
      { label: isSelf ? "Yes, I have it" : "Yes, they have it", value: "alreadyHas" },
      { label: "Applying or not sure", value: "notSure" },
      { label: "No", value: "doesNotHave" },
    ],
  },
  income: {
    addLabel: "+ Add income",
    prompt: isSelf
      ? "About how much is your monthly income? Just your own, not the whole family's."
      : "About how much is the monthly income of the person needing care? Just their own, not the whole family's.",
    options: [
      { label: "Under $1,500", value: "under1500" },
      { label: "$1,500 to $2,500", value: "under2500" },
      { label: "$2,500 to $4,000", value: "under4000" },
      { label: "Over $4,000", value: "over4000" },
      { label: "Prefer not to say", value: "preferNotToSay" },
    ],
  },
  };
}

const FIELD_FOR_ASK: Record<Ask, string> = {
  age: "ageBand",
  medicaid: "medicaidStatus",
  income: "incomeRange",
};

export default function FactChips({ token, profileId, facts, suppressMedicaidChip, isSelf = false }: FactChipsProps) {
  const ASK_CONFIG = askConfig(isSelf);
  const router = useRouter();
  const [open, setOpen] = useState<Ask | null>(null);
  const [saved, setSaved] = useState<Partial<Record<Ask, string>>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [isRefreshing, startTransition] = useTransition();

  const knownChips: string[] = [];
  if (facts.age != null) knownChips.push(`Age ${facts.age}`);
  else if (facts.ageBand) knownChips.push(AGE_LABELS[facts.ageBand]);
  else if (saved.age && isAgeBand(saved.age)) knownChips.push(AGE_LABELS[saved.age]);
  if (facts.medicaidStatus) {
    if (!suppressMedicaidChip) knownChips.push(MEDICAID_LABELS[facts.medicaidStatus] || "Medicaid: answered");
  } else if (saved.medicaid) knownChips.push(MEDICAID_LABELS[saved.medicaid] || "Medicaid: answered");
  if (facts.incomeBand && facts.incomeBand !== "preferNotToSay") {
    knownChips.push(INCOME_LABELS[facts.incomeBand] || "Income: shared");
  } else if (saved.income && saved.income !== "preferNotToSay") {
    knownChips.push(INCOME_LABELS[saved.income] || "Income: shared");
  }

  const gaps: Ask[] = [];
  if (facts.age == null && !facts.ageBand && !saved.age) gaps.push("age");
  if (!facts.medicaidStatus && !saved.medicaid) gaps.push("medicaid");
  if (!facts.incomeBand && !saved.income) gaps.push("income");

  const answer = (ask: Ask, value: string) => {
    if (saving) return;
    setSaving(true);
    setSaveError(false);
    fetch("/api/benefits/update-enrichment", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileId,
        token,
        source: "m_chips",
        [FIELD_FOR_ASK[ask]]: value,
      }),
    })
      .then((res) => {
        if (res.ok) {
          setSaved((prev) => ({ ...prev, [ask]: value }));
          setOpen(null);
          // Re-run the server re-rank so the list visibly sharpens.
          startTransition(() => router.refresh());
        } else {
          setSaveError(true);
        }
      })
      .catch(() => {
        // The options stay open so they can retry.
        setSaveError(true);
      })
      .finally(() => setSaving(false));
  };

  return (
    <>
      {knownChips.map((c) => (
        <span
          key={c}
          className="rounded-full border border-gray-200 bg-white px-3 py-1 text-[13px] font-medium text-gray-700"
        >
          {c}
        </span>
      ))}
      {gaps.map((ask) => (
        <button
          key={ask}
          onClick={() => setOpen(open === ask ? null : ask)}
          className={`rounded-full border border-dashed px-3 py-1 text-[13px] font-medium transition-colors ${
            open === ask
              ? "border-gray-500 bg-gray-100 text-gray-800"
              : "border-gray-300 bg-transparent text-gray-500 hover:border-gray-400 hover:text-gray-700"
          }`}
        >
          {ASK_CONFIG[ask].addLabel}
        </button>
      ))}
      {isRefreshing && (
        <span className="rounded-full px-1 py-1 text-[13px] font-medium text-emerald-700">
          Updating your matches…
        </span>
      )}
      {open && (
        <div className="w-full basis-full pt-2">
          <p className="text-[14px] font-medium text-gray-800">{ASK_CONFIG[open].prompt}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {ASK_CONFIG[open].options.map((opt) => (
              <button
                key={opt.value}
                disabled={saving}
                onClick={() => answer(open, opt.value)}
                className="rounded-full border border-gray-300 bg-white px-3.5 py-1.5 text-[13px] font-medium text-gray-800 transition-colors hover:border-gray-900 hover:bg-gray-900 hover:text-white disabled:opacity-50"
              >
                {opt.label}
              </button>
            ))}
          </div>
          {saveError && (
            <p className="mt-2 text-[13px] text-red-600" role="alert">
              That didn&apos;t save. Please tap it again.
            </p>
          )}
        </div>
      )}
    </>
  );
}
