/**
 * Google Places API (New) — fetch review snippets for provider pages.
 *
 * Uses the Places API (New) which costs $5/1K requests for Advanced fields (reviews).
 * Results are cached in Supabase as JSONB, not fetched on every page load.
 *
 * Reference: https://developers.google.com/maps/documentation/places/web-service/place-details
 */

import type { GoogleReviewsData, GoogleReviewSnippet } from "@/lib/types";

const PLACES_API_BASE = "https://places.googleapis.com/v1/places";

/** Fields we request — reviews is an Advanced field ($5/1K) */
const FIELD_MASK = "rating,userRatingCount,reviews";

/** Max reviews to store per provider (Google returns up to 5) */
const MAX_REVIEWS = 2;

interface PlacesApiReview {
  name: string;
  rating: number;
  text?: { text: string; languageCode: string };
  originalText?: { text: string; languageCode: string };
  relativePublishTimeDescription: string;
  authorAttribution: {
    displayName: string;
    uri?: string;
    photoUri?: string;
  };
  publishTime: string; // ISO 8601
  googleMapsUri?: string;
}

interface PlacesApiResponse {
  rating?: number;
  userRatingCount?: number;
  reviews?: PlacesApiReview[];
}

/**
 * Fetch Google review data for a single place.
 *
 * Returns null if:
 * - No API key configured
 * - Place has no reviews
 * - API returns an error (logged, not thrown)
 */
export async function fetchGoogleReviews(
  placeId: string,
): Promise<GoogleReviewsData | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.warn("[google-places] GOOGLE_PLACES_API_KEY not set, skipping");
    return null;
  }

  if (!placeId) {
    return null;
  }

  try {
    const url = `${PLACES_API_BASE}/${placeId}?fields=${FIELD_MASK}&key=${apiKey}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "");
      console.error(
        `[google-places] API error for ${placeId}: ${res.status} ${errorBody}`,
      );
      return null;
    }

    const data: PlacesApiResponse = await res.json();

    if (!data.rating && !data.reviews?.length) {
      return null;
    }

    const reviews: GoogleReviewSnippet[] = (data.reviews ?? [])
      .slice(0, MAX_REVIEWS)
      .map((r) => ({
        author_name: r.authorAttribution.displayName,
        rating: r.rating,
        text: r.text?.text ?? r.originalText?.text ?? "",
        relative_time: r.relativePublishTimeDescription,
        profile_photo_url: r.authorAttribution.photoUri ?? null,
        time: Math.floor(new Date(r.publishTime).getTime() / 1000),
      }));

    return {
      rating: data.rating ?? 0,
      review_count: data.userRatingCount ?? 0,
      reviews,
      last_synced: new Date().toISOString(),
    };
  } catch (err) {
    console.error(`[google-places] Failed to fetch ${placeId}:`, err);
    return null;
  }
}

/**
 * Fetch the primary photo URL for a Google Place.
 *
 * Returns the photo URL or null if:
 * - No API key configured
 * - Place has no photos
 * - API returns an error
 */
export async function fetchGooglePlacePhoto(
  placeId: string,
  maxSize: number = 400,
): Promise<string | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.warn("[google-places] GOOGLE_PLACES_API_KEY not set, skipping photo fetch");
    return null;
  }

  if (!placeId) {
    return null;
  }

  try {
    // Fetch place details with photos field
    const url = `${PLACES_API_BASE}/${placeId}?fields=photos&key=${apiKey}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "");
      console.error(
        `[google-places] Photo API error for ${placeId}: ${res.status} ${errorBody}`,
      );
      return null;
    }

    const data = await res.json();

    // Get the first photo reference
    const photoName = data.photos?.[0]?.name;
    if (!photoName) {
      return null;
    }

    // Construct the photo URL
    return `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=${maxSize}&maxWidthPx=${maxSize}&key=${apiKey}`;
  } catch (err) {
    console.error(`[google-places] Failed to fetch photo for ${placeId}:`, err);
    return null;
  }
}

/**
 * Validate that a Place ID exists in Google Places.
 *
 * Makes a minimal API request (displayName field only) to verify the Place ID.
 * Returns { valid: true, name: string } if valid, { valid: false } otherwise.
 */
export async function validateGooglePlaceId(
  placeId: string,
): Promise<{ valid: true; name: string } | { valid: false; error?: string }> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    // If no API key, skip validation and assume valid
    console.warn("[google-places] GOOGLE_PLACES_API_KEY not set, skipping validation");
    return { valid: true, name: "Unknown" };
  }

  if (!placeId) {
    return { valid: false, error: "Place ID is required" };
  }

  try {
    // Minimal request - just get displayName to verify the Place ID exists
    const url = `${PLACES_API_BASE}/${placeId}?fields=displayName&key=${apiKey}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      if (res.status === 404 || res.status === 400) {
        return { valid: false, error: "Invalid Place ID - not found in Google" };
      }
      const errorBody = await res.text().catch(() => "");
      console.error(`[google-places] Validation error for ${placeId}: ${res.status} ${errorBody}`);
      return { valid: false, error: "Could not validate Place ID" };
    }

    const data = await res.json();
    const displayName = data.displayName?.text || "Business";

    return { valid: true, name: displayName };
  } catch (err) {
    console.error(`[google-places] Validation failed for ${placeId}:`, err);
    return { valid: false, error: "Could not validate Place ID" };
  }
}

/**
 * Batch fetch Google reviews with rate limiting.
 *
 * Processes providers in chunks to avoid hitting API rate limits.
 * Returns a map of provider_id → GoogleReviewsData.
 */
export async function batchFetchGoogleReviews(
  providers: { provider_id: string; place_id: string }[],
  options?: { batchSize?: number; delayMs?: number },
): Promise<Map<string, GoogleReviewsData>> {
  const batchSize = options?.batchSize ?? 50;
  const delayMs = options?.delayMs ?? 200;
  const results = new Map<string, GoogleReviewsData>();

  for (let i = 0; i < providers.length; i += batchSize) {
    const batch = providers.slice(i, i + batchSize);

    const batchResults = await Promise.allSettled(
      batch.map(async (p) => {
        const data = await fetchGoogleReviews(p.place_id);
        return { provider_id: p.provider_id, data };
      }),
    );

    for (const result of batchResults) {
      if (result.status === "fulfilled" && result.value.data) {
        results.set(result.value.provider_id, result.value.data);
      }
    }

    // Rate limit between batches
    if (i + batchSize < providers.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return results;
}
