"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";

export default function ClaimSearchPage() {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState("");

  const handleSearch = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!query.trim() || !isSupabaseConfigured()) return;

      setSearching(true);
      setError("");

      try {
        const supabase = createClient();

        // Build base query — only search non-family profiles
        let q = supabase
          .from("profiles")
          .select("*")
          .neq("type", "family")
          .ilike("display_name", `%${query.trim()}%`)
          .limit(20);

        if (location.trim()) {
          const loc = location.trim();
          q = q.or(
            `city.ilike.%${loc}%,state.ilike.%${loc}%,zip.eq.${loc}`
          );
        }

        const { data: profiles, error: fetchError } = await q;

        if (fetchError) {
          console.error("Claim search error:", fetchError.message);
          setError(`Search failed: ${fetchError.message}`);
          setResults([]);
        } else {
          setResults((profiles as Profile[]) || []);
        }
      } catch (err) {
        console.error("Claim search error:", err);
        setError("Search failed. Please try again.");
        setResults([]);
      } finally {
        setHasSearched(true);
        setSearching(false);
      }
    },
    [query, location]
  );

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
      <div className="mb-8">
        <Link
          href="/for-providers"
          className="text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1 mb-6"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to For Providers
        </Link>
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900">
          Get Started on Olera
        </h1>
        <p className="mt-2 text-lg text-gray-600">
          First, let&apos;s check if we already have a listing for your
          organization. If we do, you can claim it. If not, we&apos;ll help
          you create one.
        </p>
      </div>

      <form onSubmit={handleSearch} className="space-y-4 mb-8">
        <Input
          label="Organization or provider name"
          name="query"
          value={query}
          onChange={(e) => setQuery((e.target as HTMLInputElement).value)}
          placeholder="e.g., Sunrise Senior Living"
        />
        <Input
          label="City, state, or ZIP (optional)"
          name="location"
          value={location}
          onChange={(e) => setLocation((e.target as HTMLInputElement).value)}
          placeholder="e.g., Austin, TX or 78701"
        />
        <Button type="submit" size="lg" fullWidth loading={searching}>
          Search Directory
        </Button>
      </form>

      {/* Skip search — go straight to create */}
      {!hasSearched && (
        <div className="text-center pt-4 border-t border-gray-100">
          <p className="text-gray-500 mb-3">
            Not part of an existing organization?
          </p>
          <Link href="/for-providers/create">
            <Button variant="secondary">Create a New Profile</Button>
          </Link>
        </div>
      )}

      {error && (
        <div className="mb-6 bg-warm-50 text-warm-700 px-4 py-3 rounded-lg text-base" role="alert">
          {error}
        </div>
      )}

      {hasSearched && (
        <div>
          {results.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-xl">
              <div className="mb-4">
                <svg className="w-12 h-12 text-gray-300 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                No matching listings found
              </h3>
              <p className="text-gray-500 mb-6 max-w-md mx-auto">
                We don&apos;t have a listing for &quot;{query}&quot; yet. You
                can create a new profile to get started.
              </p>
              <Link href="/for-providers/create">
                <Button size="lg">Create a New Profile</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-base text-gray-500">
                {results.length} result{results.length !== 1 ? "s" : ""} found
                — select yours to claim it
              </p>
              {results.map((profile) => (
                <Link
                  key={profile.id}
                  href={
                    profile.claim_state === "unclaimed"
                      ? `/for-providers/claim/${profile.slug}`
                      : `/provider/${profile.slug}`
                  }
                  className="block p-5 rounded-xl border-2 border-gray-200 bg-white hover:border-primary-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {profile.display_name}
                        </h3>
                        {profile.claim_state === "unclaimed" && (
                          <Badge variant="unclaimed">Unclaimed</Badge>
                        )}
                        {profile.claim_state === "claimed" && (
                          <Badge variant="verified">Claimed</Badge>
                        )}
                        {profile.claim_state === "pending" && (
                          <Badge variant="pending">Pending</Badge>
                        )}
                      </div>
                      {(profile.city || profile.state) && (
                        <p className="text-base text-gray-600 mt-1">
                          {[profile.city, profile.state].filter(Boolean).join(", ")}
                          {profile.zip && ` ${profile.zip}`}
                        </p>
                      )}
                      {profile.care_types && profile.care_types.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {profile.care_types.slice(0, 4).map((ct) => (
                            <span
                              key={ct}
                              className="bg-primary-50 text-primary-700 text-sm px-2.5 py-0.5 rounded-full"
                            >
                              {ct}
                            </span>
                          ))}
                          {profile.care_types.length > 4 && (
                            <span className="text-sm text-gray-500">
                              +{profile.care_types.length - 4} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 text-primary-600">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </Link>
              ))}

              <div className="pt-6 border-t border-gray-100 text-center">
                <p className="text-gray-500 mb-3">
                  Don&apos;t see your organization?
                </p>
                <Link href="/for-providers/create">
                  <Button variant="secondary">Create a New Profile</Button>
                </Link>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
