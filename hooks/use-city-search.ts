/**
 * React hook for city search with debouncing and progressive loading
 *
 * Usage:
 * ```tsx
 * const { results, isLoading, preload, preloadZips } = useCitySearch(query);
 *
 * // Preload on input focus
 * <input onFocus={preload} ... />
 *
 * // Results automatically update on query change (debounced)
 * {results.map(city => <div>{city.full}</div>)}
 * ```
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  citySearchService,
  type CitySearchResult,
} from "@/lib/us-city-search";

interface UseCitySearchOptions {
  /** Debounce delay in ms (default: 150) */
  debounce?: number;
  /** Max results to return (default: 8) */
  limit?: number;
  /** Auto-preload tier 1 on mount (default: true) */
  autoPreload?: boolean;
}

interface UseCitySearchResult {
  /** Search results */
  results: CitySearchResult[];
  /** Whether a search is in progress */
  isLoading: boolean;
  /** Preload full city data (call on input focus) */
  preload: () => void;
  /** Preload ZIP data (auto-called when digit detected) */
  preloadZips: () => void;
  /** Whether full city data is loaded */
  isFullyLoaded: boolean;
}

export function useCitySearch(
  query: string,
  options: UseCitySearchOptions = {}
): UseCitySearchResult {
  const { debounce = 150, limit = 8, autoPreload = true } = options;

  const [results, setResults] = useState<CitySearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFullyLoaded, setIsFullyLoaded] = useState(false);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const lastQueryRef = useRef<string>("");

  // Auto-preload tier 1 on mount
  useEffect(() => {
    if (autoPreload) {
      citySearchService.preloadTier1().then(() => {
        // If we have a query, re-search with new data
        if (lastQueryRef.current) {
          setResults(citySearchService.search(lastQueryRef.current, limit));
        }
      });
    }
  }, [autoPreload, limit]);

  // Debounced search effect
  useEffect(() => {
    // Clear previous debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Detect if query starts with digit - preload ZIP data
    if (/^\d/.test(query.trim())) {
      citySearchService.preloadZips();
    }

    // Immediate search for empty or very short queries
    if (!query.trim() || query.trim().length <= 1) {
      lastQueryRef.current = query;
      setResults(citySearchService.search(query, limit));
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    // Debounce search for longer queries
    debounceRef.current = setTimeout(() => {
      lastQueryRef.current = query;
      setResults(citySearchService.search(query, limit));
      setIsLoading(false);
    }, debounce);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, limit, debounce]);

  // Preload full city data (tier 2)
  const preload = useCallback(() => {
    citySearchService.preloadTier2().then(() => {
      setIsFullyLoaded(true);
      // Re-search with new data if we have a query
      if (lastQueryRef.current) {
        setResults(citySearchService.search(lastQueryRef.current, limit));
      }
    });
  }, [limit]);

  // Preload ZIP data
  const preloadZips = useCallback(() => {
    citySearchService.preloadZips();
  }, []);

  return {
    results,
    isLoading,
    preload,
    preloadZips,
    isFullyLoaded,
  };
}

export default useCitySearch;
