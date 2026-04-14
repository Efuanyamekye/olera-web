"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

export interface SelectedOrg {
  name: string;
  slug: string;
  city: string | null;
  state: string | null;
  email: string | null;
  claimState: "unclaimed" | "pending" | "claimed" | null;
  source: "business_profiles" | "olera-providers";
  providerId?: string;
  imageUrl?: string | null;
}

interface OrganizationSearchProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (org: SelectedOrg | null) => void; // null = create new
  placeholder?: string;
  disabled?: boolean;
  /** "light" for light backgrounds (default), "dark" for dark backgrounds (solid white input) */
  variant?: "light" | "dark";
  /** Show "completed" styling (green border, checkmark) when an org is selected */
  selected?: boolean;
}

interface SearchResult extends SelectedOrg {
  id: string;
}

export default function OrganizationSearch({
  value,
  onChange,
  onSelect,
  placeholder = "Search for your organization...",
  disabled = false,
  variant = "light",
  selected = false,
}: OrganizationSearchProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const resultRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Search function
  const searchOrganizations = useCallback(async (query: string) => {
    if (query.length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const searchPattern = `%${query}%`;

      // Search business_profiles (by name OR city)
      const { data: bpResults } = await supabase
        .from("business_profiles")
        .select("id, display_name, slug, city, state, email, claim_state, source_provider_id, image_url")
        .in("type", ["organization", "caregiver"])
        .or(`display_name.ilike.${searchPattern},city.ilike.${searchPattern}`)
        .limit(50);

      // Search olera-providers (by name OR city)
      const { data: opResults } = await supabase
        .from("olera-providers")
        .select("provider_id, provider_name, slug, city, state, email, hero_image_url, provider_images")
        .not("deleted", "is", true)
        .or(`provider_name.ilike.${searchPattern},city.ilike.${searchPattern}`)
        .limit(50);

      // Get claim states for olera-providers by checking if they have linked business_profiles
      const opProviderIds = opResults?.map((op) => op.provider_id) || [];
      let claimStatesMap: Record<string, string | null> = {};

      if (opProviderIds.length > 0) {
        const { data: linkedBps } = await supabase
          .from("business_profiles")
          .select("source_provider_id, claim_state")
          .in("source_provider_id", opProviderIds);

        if (linkedBps) {
          claimStatesMap = linkedBps.reduce(
            (acc, bp) => {
              if (bp.source_provider_id) {
                acc[bp.source_provider_id] = bp.claim_state;
              }
              return acc;
            },
            {} as Record<string, string | null>
          );
        }
      }

      // Merge and deduplicate results
      const merged: SearchResult[] = [];
      const seenSlugs = new Set<string>();

      // Add business_profiles results first (they may be more authoritative)
      for (const bp of bpResults || []) {
        const slug = bp.slug || bp.id;
        if (!seenSlugs.has(slug)) {
          seenSlugs.add(slug);
          merged.push({
            id: bp.id,
            name: bp.display_name,
            slug,
            city: bp.city,
            state: bp.state,
            email: bp.email,
            claimState: bp.claim_state as SelectedOrg["claimState"],
            source: "business_profiles",
            providerId: bp.source_provider_id || bp.id,
            imageUrl: bp.image_url || null,
          });
        }
      }

      // Add olera-providers results (skip if already have BP with same source_provider_id)
      for (const op of opResults || []) {
        const slug = op.slug || op.provider_id;
        // Skip if we already have a business_profile linked to this provider
        const alreadyHasBp = (bpResults || []).some(
          (bp) => bp.source_provider_id === op.provider_id
        );
        if (!alreadyHasBp && !seenSlugs.has(slug)) {
          seenSlugs.add(slug);
          // Get first image from pipe-separated list
          const firstImage = op.provider_images?.split("|")[0]?.trim() || null;
          merged.push({
            id: op.provider_id,
            name: op.provider_name,
            slug,
            city: op.city,
            state: op.state,
            email: op.email,
            claimState: (claimStatesMap[op.provider_id] as SelectedOrg["claimState"]) || null,
            source: "olera-providers",
            providerId: op.provider_id,
            imageUrl: op.hero_image_url || firstImage,
          });
        }
      }

      setResults(merged);
    } catch (err) {
      console.error("[OrganizationSearch] Search error:", err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (value.length >= 2) {
      debounceRef.current = setTimeout(() => {
        searchOrganizations(value);
      }, 300);
    } else {
      setResults([]);
    }

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [value, searchOrganizations]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Scroll selected item into view during keyboard navigation
  useEffect(() => {
    if (selectedIndex >= 0 && selectedIndex < results.length) {
      resultRefs.current[selectedIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex, results.length]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" && value.length >= 2) {
        setIsOpen(true);
      }
      return;
    }

    const totalItems = results.length + 1; // +1 for "Create new"

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % totalItems);
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + totalItems) % totalItems);
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex === results.length) {
          // "Create new" selected
          handleCreateNew();
        } else if (selectedIndex >= 0 && selectedIndex < results.length) {
          handleSelect(results[selectedIndex]);
        }
        break;
      case "Escape":
        setIsOpen(false);
        setSelectedIndex(-1);
        break;
    }
  };

  const handleSelect = (org: SearchResult) => {
    onChange(org.name);
    onSelect({
      name: org.name,
      slug: org.slug,
      city: org.city,
      state: org.state,
      email: org.email,
      claimState: org.claimState,
      source: org.source,
      providerId: org.providerId,
    });
    setIsOpen(false);
    setSelectedIndex(-1);
  };

  const handleCreateNew = () => {
    onSelect(null); // null signals "create new"
    setIsOpen(false);
    setSelectedIndex(-1);
  };

  const showDropdown = isOpen && value.length >= 2;

  // Compute input classes based on state
  const inputClasses = selected
    ? "w-full px-4 py-3 rounded-xl border-2 border-primary-500 bg-primary-50/50 text-base placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-300 transition-all min-h-[48px] pr-10"
    : `w-full px-4 py-3 rounded-xl border text-base placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent focus:ring-primary-300 transition-all min-h-[48px] pr-10 ${
        variant === "dark"
          ? "border-gray-200 bg-white text-gray-900"
          : "border-gray-200 bg-gray-50/50 focus:bg-white"
      }`;

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setIsOpen(true);
            setSelectedIndex(-1);
          }}
          onFocus={() => value.length >= 2 && setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={inputClasses}
          autoComplete="off"
        />
        {/* Checkmark for selected state */}
        {selected && !loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-5 h-5 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          </div>
        )}
      </div>

      {showDropdown && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {/* Header */}
          <div className="px-3 py-2 text-xs font-medium text-gray-500 bg-gray-50 border-b border-gray-100">
            Select your organization
          </div>

          {/* Scrollable results container */}
          <div className="max-h-64 overflow-y-auto">
            {results.length > 0 ? (
              <>
                {results.map((org, index) => (
                  <button
                    key={org.id}
                    ref={(el) => { resultRefs.current[index] = el; }}
                    type="button"
                    onClick={() => handleSelect(org)}
                    className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors flex items-center justify-between gap-3 ${
                      index === selectedIndex ? "bg-gray-100" : ""
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-medium text-gray-900 truncate">
                        {org.name}
                      </p>
                      {(org.city || org.state) && (
                        <p className="text-sm text-gray-500 truncate">
                          {[org.city, org.state].filter(Boolean).join(", ")}
                        </p>
                      )}
                    </div>
                    {org.claimState === "claimed" && (
                      <span className="shrink-0 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
                        Claimed
                      </span>
                    )}
                  </button>
                ))}
              </>
            ) : (
              !loading && (
                <div className="px-4 py-3 text-sm text-gray-500">
                  No organizations found matching &quot;{value}&quot;
                </div>
              )
            )}
          </div>

          {/* Fixed footer - always visible */}
          <button
            type="button"
            onClick={handleCreateNew}
            className={`w-full px-4 py-3 text-left transition-colors border-t border-primary-100 ${
              selectedIndex === results.length
                ? "bg-primary-100"
                : "bg-primary-50 hover:bg-primary-100"
            }`}
          >
            <div className="flex items-center gap-2">
              <svg
                className="w-4 h-4 text-primary-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              <span className="text-sm font-medium text-primary-700">
                Create &quot;{value}&quot; as new organization
              </span>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
