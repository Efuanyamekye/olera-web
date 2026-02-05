/**
 * US City Search Service
 *
 * Singleton service for searching US cities with progressive loading.
 * Supports city name search, ZIP code lookup, and state filtering.
 *
 * Data tiers:
 * - Fallback: 50 hardcoded cities (instant, 0KB)
 * - Tier 1: Top 200 cities (~8KB, loaded on page load)
 * - Tier 2: 18K+ cities (~400KB gzip, loaded on input focus)
 * - ZIP Index: ZIP prefix mapping (~150KB gzip, loaded on first digit)
 */

// Compact city format: [city, state, population, lat, lng]
export type CompactCity = [string, string, number, number, number];

// Search result with formatted display
export interface CitySearchResult {
  city: string;
  state: string;
  full: string;
  population: number;
  lat?: number;
  lng?: number;
}

// ZIP index format
type ZipIndex = Record<string, [string, string][]>;

// Hardcoded fallback cities - top 50 US cities
const FALLBACK_CITIES: CompactCity[] = [
  ["New York", "NY", 8336817, 40.71, -74.01],
  ["Los Angeles", "CA", 3979576, 34.05, -118.24],
  ["Chicago", "IL", 2693976, 41.88, -87.63],
  ["Houston", "TX", 2320268, 29.76, -95.36],
  ["Phoenix", "AZ", 1680992, 33.45, -112.07],
  ["Philadelphia", "PA", 1584064, 39.95, -75.17],
  ["San Antonio", "TX", 1547253, 29.42, -98.49],
  ["San Diego", "CA", 1423851, 32.72, -117.16],
  ["Dallas", "TX", 1343573, 32.78, -96.8],
  ["San Jose", "CA", 1021795, 37.34, -121.89],
  ["Austin", "TX", 978908, 30.27, -97.74],
  ["Jacksonville", "FL", 911507, 30.33, -81.66],
  ["Fort Worth", "TX", 909585, 32.75, -97.33],
  ["Columbus", "OH", 898553, 39.96, -83.0],
  ["Indianapolis", "IN", 876384, 39.77, -86.16],
  ["Charlotte", "NC", 872498, 35.23, -80.84],
  ["San Francisco", "CA", 873965, 37.77, -122.42],
  ["Seattle", "WA", 753675, 47.61, -122.33],
  ["Denver", "CO", 727211, 39.74, -104.99],
  ["Washington", "DC", 702455, 38.91, -77.04],
  ["Boston", "MA", 692600, 42.36, -71.06],
  ["El Paso", "TX", 681124, 31.76, -106.49],
  ["Nashville", "TN", 670820, 36.16, -86.78],
  ["Detroit", "MI", 639111, 42.33, -83.05],
  ["Oklahoma City", "OK", 655057, 35.47, -97.52],
  ["Portland", "OR", 654741, 45.52, -122.68],
  ["Las Vegas", "NV", 651319, 36.17, -115.14],
  ["Memphis", "TN", 650618, 35.15, -90.05],
  ["Louisville", "KY", 617638, 38.25, -85.76],
  ["Baltimore", "MD", 585708, 39.29, -76.61],
  ["Milwaukee", "WI", 577222, 43.04, -87.91],
  ["Albuquerque", "NM", 560218, 35.08, -106.65],
  ["Tucson", "AZ", 548073, 32.22, -110.93],
  ["Fresno", "CA", 531576, 36.75, -119.77],
  ["Sacramento", "CA", 513624, 38.58, -121.49],
  ["Kansas City", "MO", 508090, 39.1, -94.58],
  ["Mesa", "AZ", 508958, 33.42, -111.83],
  ["Atlanta", "GA", 498044, 33.75, -84.39],
  ["Omaha", "NE", 486051, 41.26, -95.94],
  ["Colorado Springs", "CO", 478221, 38.83, -104.82],
  ["Raleigh", "NC", 474069, 35.78, -78.64],
  ["Miami", "FL", 467963, 25.77, -80.19],
  ["Long Beach", "CA", 466742, 33.77, -118.19],
  ["Virginia Beach", "VA", 459470, 36.85, -75.98],
  ["Oakland", "CA", 433031, 37.8, -122.27],
  ["Minneapolis", "MN", 429954, 44.98, -93.27],
  ["Tulsa", "OK", 413066, 36.15, -95.99],
  ["Tampa", "FL", 399700, 27.95, -82.46],
  ["Arlington", "TX", 398854, 32.74, -97.11],
  ["Plano", "TX", 287677, 33.02, -96.7],
];

class USCitySearchService {
  private static instance: USCitySearchService;

  private tier1Cities: CompactCity[] = [];
  private tier2Cities: CompactCity[] = [];
  private zipIndex: ZipIndex = {};

  private tier1Loaded = false;
  private tier2Loaded = false;
  private zipsLoaded = false;

  private tier1Loading: Promise<void> | null = null;
  private tier2Loading: Promise<void> | null = null;
  private zipsLoading: Promise<void> | null = null;

  private constructor() {
    // Initialize with fallback cities
    this.tier1Cities = [...FALLBACK_CITIES];
  }

  static getInstance(): USCitySearchService {
    if (!USCitySearchService.instance) {
      USCitySearchService.instance = new USCitySearchService();
    }
    return USCitySearchService.instance;
  }

  /**
   * Preload tier 1 cities (top 200)
   * Call on page load
   */
  async preloadTier1(): Promise<void> {
    if (this.tier1Loaded) return;
    if (this.tier1Loading) return this.tier1Loading;

    this.tier1Loading = this.loadTier1();
    return this.tier1Loading;
  }

  private async loadTier1(): Promise<void> {
    try {
      const response = await fetch("/data/cities-tier1.json");
      if (response.ok) {
        this.tier1Cities = await response.json();
        this.tier1Loaded = true;
      }
    } catch (error) {
      console.warn("Failed to load tier 1 cities, using fallback:", error);
    }
  }

  /**
   * Preload tier 2 cities (full 18K+ cities)
   * Call on input focus
   */
  async preloadTier2(): Promise<void> {
    if (this.tier2Loaded) return;
    if (this.tier2Loading) return this.tier2Loading;

    this.tier2Loading = this.loadTier2();
    return this.tier2Loading;
  }

  private async loadTier2(): Promise<void> {
    try {
      const response = await fetch("/data/cities-tier2.json");
      if (response.ok) {
        this.tier2Cities = await response.json();
        this.tier2Loaded = true;
      }
    } catch (error) {
      console.warn("Failed to load tier 2 cities:", error);
    }
  }

  /**
   * Preload ZIP index
   * Call on first digit typed
   */
  async preloadZips(): Promise<void> {
    if (this.zipsLoaded) return;
    if (this.zipsLoading) return this.zipsLoading;

    this.zipsLoading = this.loadZips();
    return this.zipsLoading;
  }

  private async loadZips(): Promise<void> {
    try {
      const response = await fetch("/data/zip-index.json");
      if (response.ok) {
        this.zipIndex = await response.json();
        this.zipsLoaded = true;
      }
    } catch (error) {
      console.warn("Failed to load ZIP index:", error);
    }
  }

  /**
   * Get loading state for UI feedback
   */
  getLoadingState() {
    return {
      tier1Loaded: this.tier1Loaded,
      tier2Loaded: this.tier2Loaded,
      zipsLoaded: this.zipsLoaded,
    };
  }

  /**
   * Get popular cities for empty input
   */
  popularCities(limit: number = 8): CitySearchResult[] {
    const cities = this.tier2Loaded ? this.tier2Cities : this.tier1Cities;
    return cities.slice(0, limit).map(this.toResult);
  }

  /**
   * Search cities by query
   *
   * Search modes:
   * 1. Empty query -> popular cities by population
   * 2. Starts with digit -> ZIP code search
   * 3. Two-letter uppercase -> State search
   * 4. Text -> City name search (prefix then contains)
   */
  search(query: string, limit: number = 8): CitySearchResult[] {
    const trimmed = query.trim();

    // Empty query - return popular cities
    if (!trimmed) {
      return this.popularCities(limit);
    }

    // ZIP code search (starts with digit)
    if (/^\d/.test(trimmed)) {
      return this.searchByZip(trimmed, limit);
    }

    // State search (two uppercase letters)
    const upperQuery = trimmed.toUpperCase();
    if (/^[A-Z]{2}$/.test(upperQuery)) {
      return this.searchByState(upperQuery, limit);
    }

    // City name search
    return this.searchByName(trimmed, limit);
  }

  private searchByZip(query: string, limit: number): CitySearchResult[] {
    // Use at least 3 digits for prefix lookup
    const prefix = query.substring(0, 3);
    const matches = this.zipIndex[prefix] || [];

    // Filter by exact ZIP if more digits provided
    let filtered = matches;
    if (query.length > 3) {
      // We don't have full ZIP data, so just return prefix matches
      // In a real implementation, you'd match against full ZIPs
    }

    return filtered.slice(0, limit).map(([city, state]) => ({
      city,
      state,
      full: `${city}, ${state}`,
      population: 0, // ZIP search doesn't include population
    }));
  }

  private searchByState(stateCode: string, limit: number): CitySearchResult[] {
    const cities = this.tier2Loaded ? this.tier2Cities : this.tier1Cities;

    return cities
      .filter(([, state]) => state === stateCode)
      .slice(0, limit)
      .map(this.toResult);
  }

  private searchByName(query: string, limit: number): CitySearchResult[] {
    const cities = this.tier2Loaded ? this.tier2Cities : this.tier1Cities;
    const lowerQuery = query.toLowerCase();

    // Separate prefix matches and contains matches
    const prefixMatches: CompactCity[] = [];
    const containsMatches: CompactCity[] = [];

    for (const city of cities) {
      const cityName = city[0].toLowerCase();
      const stateName = city[1].toLowerCase();
      const fullName = `${cityName}, ${stateName}`;

      if (cityName.startsWith(lowerQuery) || fullName.startsWith(lowerQuery)) {
        prefixMatches.push(city);
      } else if (cityName.includes(lowerQuery) || fullName.includes(lowerQuery)) {
        containsMatches.push(city);
      }

      // Early exit if we have enough results
      if (prefixMatches.length + containsMatches.length >= limit * 2) {
        break;
      }
    }

    // Combine results: prefix matches first (already sorted by population), then contains matches
    const results = [...prefixMatches, ...containsMatches];
    return results.slice(0, limit).map(this.toResult);
  }

  private toResult = (city: CompactCity): CitySearchResult => ({
    city: city[0],
    state: city[1],
    full: `${city[0]}, ${city[1]}`,
    population: city[2],
    lat: city[3],
    lng: city[4],
  });
}

// Export singleton instance
export const citySearchService = USCitySearchService.getInstance();

// Export convenience functions
export function searchCities(query: string, limit?: number): CitySearchResult[] {
  return citySearchService.search(query, limit);
}

export function getPopularCities(limit?: number): CitySearchResult[] {
  return citySearchService.popularCities(limit);
}

export function preloadCityData(): Promise<void> {
  return citySearchService.preloadTier1();
}

export function preloadFullCityData(): Promise<void> {
  return citySearchService.preloadTier2();
}

export function preloadZipData(): Promise<void> {
  return citySearchService.preloadZips();
}
