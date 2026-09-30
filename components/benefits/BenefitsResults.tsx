"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { BENEFIT_CATEGORIES } from "@/lib/types/benefits";
import type {
  BenefitsSearchResult,
  BenefitCategory,
  BenefitMatch,
} from "@/lib/types/benefits";
import { useCareProfile } from "@/lib/benefits/care-profile-context";
import { useAuth } from "@/components/auth/AuthProvider";
import { useSavedBenefits } from "@/hooks/use-saved-benefits";
import { syncBenefitsToProfile } from "@/lib/benefits-profile-sync";
import { setBenefitsIntakeCache } from "@/lib/benefits-intake-cache";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { FamilyMetadata } from "@/lib/types";
import ProgramCard from "./ProgramCard";
// SaveResultsBanner removed — value shown first, auth prompted on bookmark
import BenefitsReportHeader from "./BenefitsReportHeader";
import RecommendedFirstStep from "./RecommendedFirstStep";
import DocumentChecklist from "./DocumentChecklist";

// ── Success illustration for confirmation state ──
function MatchesSuccessIllustration({ className = "w-12 h-12" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="20" fill="#199087" fillOpacity="0.12" />
      <circle cx="24" cy="24" r="14" fill="white" />
      <path
        d="M17 24L21.5 28.5L31 19"
        stroke="#199087"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const INITIAL_VISIBLE = 5;

interface BenefitsResultsProps {
  result: BenefitsSearchResult;
}

function generateShareText(
  matchedPrograms: BenefitMatch[],
  stateCode: string | null,
  age: number | null
) {
  const locationPart = stateCode ? ` in ${stateCode}` : "";
  const agePart = age ? `, for someone ${age} years old` : "";
  const header = `Your Benefits Results — ${matchedPrograms.length} program${matchedPrograms.length !== 1 ? "s" : ""} found${locationPart}${agePart}`;

  const grouped = matchedPrograms.reduce<Record<string, BenefitMatch[]>>(
    (acc, m) => {
      const cat = m.program.category;
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(m);
      return acc;
    },
    {}
  );

  const sections = Object.entries(grouped)
    .map(([cat, programs]) => {
      const catInfo = BENEFIT_CATEGORIES[cat as BenefitCategory];
      const lines = programs.map((m) => {
        const name = m.program.short_name || m.program.name;
        const topReason = m.matchReasons[0] || "";
        return `  - ${name} (${m.tierLabel})${topReason ? ` — ${topReason}` : ""}`;
      });
      return `${catInfo?.displayTitle}\n${lines.join("\n")}`;
    })
    .join("\n\n");

  return `${header}\n\n${sections}\n\nFound with Olera Benefits Finder\nhttps://olera.care/benefits/finder`;
}

export default function BenefitsResults({ result }: BenefitsResultsProps) {
  const [activeFilter, setActiveFilter] = useState<BenefitCategory | "all">("all");
  const [shareLabel, setShareLabel] = useState<"share" | "copied">("share");
  const [showAll, setShowAll] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  // Expand everything for print
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onBefore = () => setIsPrinting(true);
    const onAfter = () => setIsPrinting(false);
    window.addEventListener("beforeprint", onBefore);
    window.addEventListener("afterprint", onAfter);
    return () => {
      window.removeEventListener("beforeprint", onBefore);
      window.removeEventListener("afterprint", onAfter);
    };
  }, []);

  const { reset, answers, locationDisplay, restoredFromDb, publishCarePost } = useCareProfile();
  const { user, account, activeProfile, refreshAccountData } = useAuth();
  const { isSaved, toggleSave } = useSavedBenefits();
  const syncedRef = useRef(false);

  // Matches invitation card state
  const [matchesCardDismissed, setMatchesCardDismissed] = useState(false);
  const [matchesCardConfirmed, setMatchesCardConfirmed] = useState(false);
  const [matchesActivating, setMatchesActivating] = useState(false);
  const [matchesError, setMatchesError] = useState<string | null>(null);
  const [syncInProgress, setSyncInProgress] = useState(false);

  const profileMeta = activeProfile?.metadata as FamilyMetadata | undefined;
  const hasActiveMatches = profileMeta?.care_post?.status === "active";
  const showMatchesCard = user && activeProfile && !matchesCardDismissed &&
    (!hasActiveMatches || matchesCardConfirmed);

  const cityDisplay = locationDisplay?.split(",")[0]?.trim() || "your area";

  // ─── Persist results (unchanged) ──────────────────────────────────────────
  useEffect(() => {
    if (syncedRef.current || restoredFromDb) return;

    if (!user) {
      setBenefitsIntakeCache(answers, locationDisplay, result, publishCarePost);
      syncedRef.current = true;
      return;
    }

    if (!activeProfile) return;
    syncedRef.current = true;
    setSyncInProgress(true);

    (async () => {
      try {
        if (!isSupabaseConfigured()) { setSyncInProgress(false); return; }
        const supabase = createClient();

        const { data: current } = await supabase
          .from("business_profiles")
          .select("metadata")
          .eq("id", activeProfile.id)
          .single();

        const meta = (current?.metadata || {}) as FamilyMetadata;
        await supabase
          .from("business_profiles")
          .update({
            metadata: {
              ...meta,
              benefits_results: {
                answers: answers as unknown as Record<string, unknown>,
                results: result as unknown as Record<string, unknown>,
                location_display: locationDisplay,
                completed_at: new Date().toISOString(),
              },
            },
          })
          .eq("id", activeProfile.id);

        await syncBenefitsToProfile(answers, locationDisplay, activeProfile.id);
        await refreshAccountData();

        if (publishCarePost) {
          const { data: fresh } = await supabase
            .from("business_profiles")
            .select("metadata")
            .eq("id", activeProfile.id)
            .single();

          const freshMeta = (fresh?.metadata || {}) as FamilyMetadata;
          if (!freshMeta.timeline) {
            await supabase
              .from("business_profiles")
              .update({ metadata: { ...freshMeta, timeline: "exploring" } })
              .eq("id", activeProfile.id);
          }

          await fetch("/api/care-post/publish", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "publish", source: "benefits_flow" }),
          });

          await refreshAccountData();
        }
      } catch (err) {
        console.error("[olera] Benefits persist/sync failed:", err);
      } finally {
        setSyncInProgress(false);
      }
    })();
  }, [user, activeProfile, answers, locationDisplay, result, restoredFromDb, publishCarePost, refreshAccountData]);

  // ─── Derived data ─────────────────────────────────────────────────────────

  const { matchedPrograms, localAAA } = result;

  const presentCategories = Array.from(
    new Set(matchedPrograms.map((m) => m.program.category))
  );

  const filteredPrograms =
    activeFilter === "all"
      ? matchedPrograms
      : matchedPrograms.filter((m) => m.program.category === activeFilter);

  // The hero shows the top program unless it shows the local agency instead
  // (RecommendedFirstStep's rule). Skip only a program the hero is actually
  // showing: slicing blindly hid the #1 match whenever the agency took the
  // hero, and hid a different program under every category filter.
  const heroProgramId =
    localAAA?.phone || matchedPrograms.length === 0 ? null : matchedPrograms[0].id;
  const remainingPrograms = filteredPrograms.filter((m) => m.id !== heroProgramId);
  const visiblePrograms = (showAll || isPrinting) ? remainingPrograms : remainingPrograms.slice(0, INITIAL_VISIBLE);
  const hiddenCount = remainingPrograms.length - visiblePrograms.length;

  // ─── Handlers ─────────────────────────────────────────────────────────────

  async function handleShare() {
    const text = generateShareText(matchedPrograms, answers.stateCode, answers.age);
    if (navigator.share) {
      try { await navigator.share({ text }); return; } catch { /* fall through */ }
    }
    try {
      await navigator.clipboard.writeText(text);
      setShareLabel("copied");
      setTimeout(() => setShareLabel("share"), 2000);
    } catch { /* noop */ }
  }

  async function handleActivateMatches() {
    if (matchesActivating) return;
    setMatchesActivating(true);
    setMatchesError(null);
    try {
      const res = await fetch("/api/care-post/activate-matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: cityDisplay,
          state: answers.stateCode || undefined,
          primaryNeeds: answers.primaryNeeds || [],
        }),
      });
      if (res.ok) {
        setMatchesCardConfirmed(true);
        await refreshAccountData();
      } else {
        const data = await res.json().catch(() => ({}));
        setMatchesError(data.error || "Something went wrong. Please try again.");
      }
    } catch (err) {
      console.error("[olera] Matches activation error:", err);
      setMatchesError("Something went wrong. Please try again.");
    } finally {
      setMatchesActivating(false);
    }
  }

  // ─── Empty state ──────────────────────────────────────────────────────────

  if (matchedPrograms.length === 0 && !localAAA) {
    return (
      <div className="py-16">
        <p className="font-display text-display-xs font-medium text-gray-900 mb-2">
          No matching programs found
        </p>
        <p className="text-sm text-gray-500 mb-8 max-w-md">
          Try adjusting your answers, or contact your local Area Agency on Aging
          for personalized help.
        </p>
        <button
          onClick={reset}
          className="px-6 py-2.5 min-h-[44px] bg-gray-900 text-white rounded-full text-sm font-medium border-none cursor-pointer hover:bg-gray-800 transition-colors"
        >
          Try different answers
        </button>
      </div>
    );
  }

  // ─── Main results ─────────────────────────────────────────────────────────

  return (
    <div className="w-full">
      {/* ── Beat 1: The moment of relief ─────────────────────────────── */}

      <BenefitsReportHeader
        programCount={matchedPrograms.length}
        answers={answers}
        locationDisplay={locationDisplay}
        matchedPrograms={matchedPrograms}
        userName={account?.display_name?.split(" ")[0] ?? null}
        onShare={handleShare}
        shareLabel={shareLabel}
      />

      {/* Recommended first step — single program, with call script */}
      {matchedPrograms.length > 0 && (
        <RecommendedFirstStep
          topMatch={matchedPrograms[0]}
          localAAA={localAAA}
        />
      )}

      {/* ── Beat 2: Explore at your pace ─────────────────────────────── */}

      {remainingPrograms.length > 0 && (
        <>
          <div className="flex items-baseline justify-between gap-4 mb-4">
            <p className="text-xs font-medium text-gray-400 tracking-widest uppercase">
              {matchedPrograms.length - 1} more program{matchedPrograms.length - 1 !== 1 ? "s" : ""}
            </p>

            {/* Filter tabs — only if multiple categories */}
            {presentCategories.length > 1 && (
              <div className="flex items-center gap-1 print:hidden" role="toolbar" aria-label="Filter by category">
                {["all" as const, ...presentCategories].map((cat) => {
                  const isActive = activeFilter === cat;
                  const label = cat === "all" ? "All" : BENEFIT_CATEGORIES[cat]?.displayTitle;
                  return (
                    <button
                      key={cat}
                      onClick={() => setActiveFilter(cat)}
                      aria-pressed={isActive}
                      className={`px-2.5 py-1 text-xs font-medium border-none cursor-pointer transition-colors bg-transparent rounded-full ${
                        isActive
                          ? "text-gray-900 bg-gray-100"
                          : "text-gray-400 hover:text-gray-600"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Program cards */}
          <div>
            {visiblePrograms.map((m, i) => (
              <div
                key={m.id}
                className="animate-card-enter"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <ProgramCard
                  match={m}
                  isSaved={isSaved(m.program.name)}
                  onToggleSave={() => toggleSave(m.program.name)}
                  defaultExpanded={i === 0}
                />
              </div>
            ))}
          </div>

          {/* Show more */}
          {hiddenCount > 0 && (
            <button
              onClick={() => setShowAll(true)}
              className="w-full py-3 mt-2 mb-8 text-sm font-medium text-gray-500 hover:text-gray-900 bg-transparent border border-gray-200 hover:border-gray-300 rounded-xl cursor-pointer transition-colors"
            >
              See {hiddenCount} more program{hiddenCount !== 1 ? "s" : ""}
            </button>
          )}
        </>
      )}

      {/* ── Beat 3: Tools when you're ready ──────────────────────────── */}

      <div className="mt-12 pt-8 border-t border-gray-100">
        {/* Document checklist — collapsed by default */}
        <button
          onClick={() => setShowChecklist(!showChecklist)}
          className="flex items-center gap-2 w-full text-left bg-transparent border-none cursor-pointer group mb-2"
        >
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${showChecklist ? "rotate-90" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-sm font-medium text-gray-600 group-hover:text-gray-900 transition-colors">
            Prepare your documents
          </span>
          <span className="text-xs text-gray-300">
            Checklist for applications
          </span>
        </button>

        {(showChecklist || isPrinting) && (
          <div className="mt-4 animate-fade-in">
            <DocumentChecklist />
          </div>
        )}
      </div>

      {/* Start over — quiet secondary action */}
      <div className="mt-8 flex justify-center print:hidden">
        <button
          onClick={reset}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-400 hover:text-gray-600 bg-transparent border-none cursor-pointer transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
          </svg>
          Start over
        </button>
      </div>

      {/* Matches invitation card — after value is shown */}
      {showMatchesCard && (
        <div className="mt-10">
          <div className="border border-vanilla-300 border-l-4 border-l-primary-500 bg-vanilla-100 rounded-2xl p-5 lg:p-6">
            {matchesCardConfirmed ? (
              <div className="flex flex-col items-center text-center py-2">
                <MatchesSuccessIllustration className="w-12 h-12 mb-3" />
                <h3 className="font-display text-display-xs font-medium text-gray-900 mb-1">
                  Your profile is live in {cityDisplay}
                </h3>
                <p className="text-sm text-gray-500 leading-relaxed max-w-md mb-4">
                  Providers in your area can now find you. We&apos;ll email you the moment someone reaches out.
                </p>
                <Link
                  href="/portal/profile"
                  className="text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors mb-2"
                >
                  View your care profile &rarr;
                </Link>
                <button
                  onClick={() => { setMatchesCardDismissed(true); setMatchesCardConfirmed(false); }}
                  className="text-sm font-medium text-gray-400 hover:text-gray-600 bg-transparent border-none cursor-pointer transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                <h3 className="font-display text-display-xs font-medium text-gray-900">
                  Let care providers find you
                </h3>
                <p className="text-sm text-gray-600 mt-2 leading-relaxed max-w-xl">
                  Qualified providers in {cityDisplay} will reach out. You choose who to talk to.
                </p>
                {matchesError && (
                  <div className="mt-3">
                    <p className="text-sm text-gray-600">We couldn&apos;t set up your profile right now.</p>
                    <Link href="/portal/profile" className="text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors">
                      Visit your profile to complete setup.
                    </Link>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-3 mt-4">
                  <button
                    onClick={handleActivateMatches}
                    disabled={matchesActivating || syncInProgress}
                    className="inline-flex items-center gap-2 px-6 py-2.5 min-h-[44px] bg-primary-600 text-white rounded-full text-sm font-medium border-none cursor-pointer hover:bg-primary-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {syncInProgress ? (
                      <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving results...</>
                    ) : matchesActivating ? (
                      <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Activating...</>
                    ) : (
                      "Yes, let providers find me"
                    )}
                  </button>
                  <button
                    onClick={() => setMatchesCardDismissed(true)}
                    className="inline-flex items-center min-h-[44px] px-2 text-sm font-medium text-gray-500 hover:text-gray-700 bg-transparent border-none cursor-pointer transition-colors"
                  >
                    No thanks
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Print footer */}
      <p className="hidden print:block text-xs text-gray-400 mt-8 pt-4 border-t border-gray-200">
        Generated by Olera Benefits Finder &mdash; olera.care/benefits/finder &mdash; {new Date().toLocaleDateString()}
      </p>
    </div>
  );
}
