"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { OnboardingData } from "@/app/onboarding/page";
import type { Profile } from "@/lib/types";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";

interface OrgClaimStepProps {
  data: OnboardingData;
  onClaim: (profileId: string, seededProfile: Profile) => void;
  onSkip: () => void;
  submitting: boolean;
}

export default function OrgClaimStep({
  data,
  onClaim,
  onSkip,
  submitting,
}: OrgClaimStepProps) {
  const [searchQuery, setSearchQuery] = useState(data.displayName);
  const [results, setResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [searchError, setSearchError] = useState("");

  const search = useCallback(async (query: string) => {
    if (!query.trim() || !isSupabaseConfigured()) return;
    setSearching(true);
    setSearchError("");

    try {
      const supabase = createClient();
      const { data: profiles, error } = await supabase
        .from("business_profiles")
        .select("*")
        .eq("type", "organization")
        .eq("claim_state", "unclaimed")
        .ilike("display_name", `%${query.trim()}%`)
        .limit(10);

      if (error) {
        console.error("Org search error:", error.message);
        setSearchError("Search failed. You can still create a new profile below.");
        setResults([]);
      } else {
        setResults((profiles as Profile[]) || []);
      }
    } catch (err) {
      console.error("Org search error:", err);
      setSearchError("Search failed. You can still create a new profile below.");
      setResults([]);
    } finally {
      setHasSearched(true);
      setSearching(false);
    }
  }, []);

  // Auto-search on mount with org name from previous step
  useEffect(() => {
    if (data.displayName) {
      search(data.displayName);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    search(searchQuery);
  };

  return (
    <div>
      <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
        Is your organization already listed?
      </h1>
      <p className="text-lg text-gray-600 mb-8">
        We may already have a profile for your organization. Claim it to take
        control and keep your information up to date.
      </p>

      <form onSubmit={handleSearch} className="flex gap-3 mb-6">
        <div className="flex-1">
          <Input
            label="Search by organization name"
            name="orgSearch"
            value={searchQuery}
            onChange={(e) =>
              setSearchQuery((e.target as HTMLInputElement).value)
            }
            placeholder="e.g., Sunrise Senior Living"
          />
        </div>
        <div className="flex items-end">
          <Button type="submit" variant="secondary" loading={searching}>
            Search
          </Button>
        </div>
      </form>

      {searchError && (
        <div className="mb-6 bg-warm-50 text-warm-700 px-4 py-3 rounded-lg text-base" role="alert">
          {searchError}
        </div>
      )}

      {/* Search results */}
      {hasSearched && (
        <div className="space-y-3 mb-8">
          {results.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-xl">
              <p className="text-lg text-gray-600 mb-1">
                No matching organizations found.
              </p>
              <p className="text-base text-gray-500">
                We&apos;ll create a new profile for you.
              </p>
            </div>
          ) : (
            <>
              <p className="text-base text-gray-500 mb-3">
                {results.length} result{results.length !== 1 ? "s" : ""} found.
                Select yours to claim it.
              </p>
              {results.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() =>
                    setSelected(selected === profile.id ? null : profile.id)
                  }
                  className={[
                    "w-full text-left p-4 rounded-xl border-2 transition-all duration-200",
                    "focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2",
                    selected === profile.id
                      ? "border-primary-500 bg-primary-50"
                      : "border-gray-200 bg-white hover:border-gray-300",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {profile.display_name}
                        </h3>
                        <Badge variant="unclaimed">Unclaimed</Badge>
                      </div>
                      {(profile.city || profile.state) && (
                        <p className="text-base text-gray-600 mt-1">
                          {[profile.city, profile.state]
                            .filter(Boolean)
                            .join(", ")}
                        </p>
                      )}
                      {profile.care_types && profile.care_types.length > 0 && (
                        <p className="text-base text-gray-500 mt-1">
                          {profile.care_types.slice(0, 3).join(", ")}
                          {profile.care_types.length > 3 &&
                            ` +${profile.care_types.length - 3} more`}
                        </p>
                      )}
                    </div>
                    {selected === profile.id && (
                      <span className="text-primary-600 font-medium text-base">
                        Selected
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {selected ? (
          <Button
            type="button"
            size="lg"
            fullWidth
            loading={submitting}
            onClick={() => {
              const profile = results.find((p) => p.id === selected);
              if (profile) onClaim(selected, profile);
            }}
          >
            Claim this organization
          </Button>
        ) : (
          <Button
            type="button"
            size="lg"
            fullWidth
            loading={submitting}
            onClick={onSkip}
          >
            {hasSearched && results.length === 0
              ? "Create a new profile"
              : "Create a new profile instead"}
          </Button>
        )}
      </div>
    </div>
  );
}
