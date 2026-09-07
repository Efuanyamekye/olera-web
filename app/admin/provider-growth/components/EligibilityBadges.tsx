"use client";

/**
 * EligibilityBadges - Shows Ads and MedJobs eligibility status
 *
 * Displays badges indicating what products a provider is eligible for,
 * with MedJobs showing the catchment university if applicable.
 */

interface EligibilityBadgesProps {
  adsEligible?: boolean;
  medjobsEligible?: boolean;
  medjobsUniversity?: string | null;
  size?: "sm" | "md";
}

export function EligibilityBadges({
  adsEligible = true,
  medjobsEligible = false,
  medjobsUniversity,
  size = "sm",
}: EligibilityBadgesProps) {
  const textSize = size === "sm" ? "text-[10px]" : "text-xs";
  const padding = size === "sm" ? "px-1.5 py-0.5" : "px-2 py-1";

  return (
    <div className="flex flex-wrap gap-1">
      {adsEligible && (
        <span
          className={`inline-flex items-center ${padding} ${textSize} font-medium rounded border text-blue-700 bg-blue-50 border-blue-200`}
        >
          Ads
        </span>
      )}
      {medjobsEligible && (
        <span
          className={`inline-flex items-center ${padding} ${textSize} font-medium rounded border text-purple-700 bg-purple-50 border-purple-200`}
          title={medjobsUniversity || "MedJobs eligible"}
        >
          MedJobs{medjobsUniversity ? `: ${abbreviateUniversity(medjobsUniversity)}` : ""}
        </span>
      )}
    </div>
  );
}

function abbreviateUniversity(name: string): string {
  // Common abbreviations for university names
  const abbreviations: Record<string, string> = {
    "University of Texas at Austin": "UT Austin",
    "Texas A&M University": "Texas A&M",
    "University of Houston / Rice": "UH/Rice",
    "University of Florida": "UF",
    "Florida State University": "FSU",
    "University of Georgia": "UGA",
    "Emory University": "Emory",
    "University of North Carolina at Chapel Hill": "UNC",
    "Duke University": "Duke",
    "University of Virginia": "UVA",
    "Virginia Tech": "VT",
    "Vanderbilt University": "Vanderbilt",
    "University of Tennessee Knoxville": "UTK",
    "University of Kentucky": "UK",
    "Ohio State University": "OSU",
    "University of Michigan": "UMich",
    "Michigan State University": "MSU",
    "Penn State University": "Penn State",
    "University of Wisconsin-Madison": "UW-Madison",
    "University of Minnesota": "UMN",
    "University of Illinois Urbana-Champaign": "UIUC",
    "Indiana University Bloomington": "IU",
    "University of Colorado Boulder": "CU Boulder",
    "Arizona State University": "ASU",
    "University of Utah": "Utah",
  };

  return abbreviations[name] || name;
}
