/**
 * Provider Types
 *
 * Matches the iOS Supabase `olera-providers` table schema exactly.
 * The web app uses this schema directly - no adapter needed.
 *
 * Table: olera-providers (39,355+ records)
 */

export interface Provider {
  provider_id: string;
  provider_name: string;
  provider_category: string;
  main_category: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  google_rating: number | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipcode: number | null;
  lat: number | null;
  lon: number | null;
  place_id: string | null;
  provider_images: string | null; // Pipe-separated URLs: "url1 | url2 | url3"
  provider_logo: string | null;
  provider_description: string | null;
  community_Score: number | null;
  value_score: number | null;
  information_availability_score: number | null;
  lower_price: number | null;
  upper_price: number | null;
  contact_for_price: string | null; // "True" or "False"
  deleted: boolean;
  deleted_at: string | null;
}

/**
 * Parse pipe-separated images string into array
 */
export function parseProviderImages(images: string | null): string[] {
  if (!images) return [];
  return images.split(" | ").filter(Boolean);
}

/**
 * Format price range for display
 */
export function formatPriceRange(provider: Provider): string | null {
  if (provider.lower_price && provider.upper_price) {
    return `$${provider.lower_price.toLocaleString()} - $${provider.upper_price.toLocaleString()}/mo`;
  }
  if (provider.lower_price) {
    return `From $${provider.lower_price.toLocaleString()}/mo`;
  }
  if (provider.contact_for_price === "True") {
    return "Contact for pricing";
  }
  return null;
}

/**
 * Get primary image (logo or first gallery image)
 */
export function getPrimaryImage(provider: Provider): string | null {
  if (provider.provider_logo) return provider.provider_logo;
  const images = parseProviderImages(provider.provider_images);
  return images[0] || null;
}

/**
 * Format location string
 */
export function formatLocation(provider: Provider): string {
  const parts = [provider.city, provider.state].filter(Boolean);
  return parts.join(", ");
}

/**
 * Category display names
 */
export const categoryDisplayNames: Record<string, string> = {
  "Home Care (Non-medical)": "Home Care",
  "Home Health Care": "Home Health",
  "Assisted Living": "Assisted Living",
  "Independent Living": "Independent Living",
  "Memory Care": "Memory Care",
  "Nursing Home": "Nursing Home",
  "Assisted Living | Independent Living": "Assisted Living",
  "Memory Care | Assisted Living": "Memory Care",
};

/**
 * Get display name for category
 */
export function getCategoryDisplayName(category: string | null): string {
  if (!category) return "Senior Care";
  return categoryDisplayNames[category] || category;
}

/**
 * The Supabase table name
 */
export const PROVIDERS_TABLE = "olera-providers";

/**
 * Type for provider card display data
 */
export interface ProviderCardData {
  id: string;
  slug: string;
  name: string;
  image: string;
  images: string[];
  address: string;
  rating: number;
  reviewCount?: number;
  priceRange: string;
  primaryCategory: string;
  careTypes: string[];
  highlights: string[];
  acceptedPayments: string[];
  verified: boolean;
  description?: string;
}

/**
 * Convert iOS Provider to the format expected by ProviderCard component
 */
export function toCardFormat(provider: Provider): ProviderCardData {
  const images = parseProviderImages(provider.provider_images);
  const primaryImage = getPrimaryImage(provider);

  return {
    id: provider.provider_id,
    slug: provider.provider_id,
    name: provider.provider_name,
    image: primaryImage || "/placeholder-provider.jpg",
    images: images.length > 0 ? images : (primaryImage ? [primaryImage] : []),
    address: formatLocation(provider),
    rating: provider.google_rating || 0,
    reviewCount: undefined,
    priceRange: formatPriceRange(provider) || "Contact for pricing",
    primaryCategory: getCategoryDisplayName(provider.provider_category),
    careTypes: [provider.provider_category],
    highlights: [
      provider.main_category || provider.provider_category,
    ].filter(Boolean) as string[],
    acceptedPayments: [],
    verified: false,
    description: provider.provider_description?.slice(0, 100) || undefined,
  };
}

/**
 * Convert mock provider data to ProviderCardData
 * Uses a flexible type to work with various mock data shapes
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mockToCardFormat(p: any): ProviderCardData {
  return {
    id: String(p.id || ""),
    slug: String(p.slug || p.id || ""),
    name: String(p.name || ""),
    image: String(p.image || "/placeholder-provider.jpg"),
    images: Array.isArray(p.images) ? p.images : [],
    address: String(p.address || ""),
    rating: Number(p.rating) || 0,
    reviewCount: p.reviewCount as number | undefined,
    priceRange: String(p.priceRange || "Contact for pricing"),
    primaryCategory: String(p.primaryCategory || "Senior Care"),
    careTypes: Array.isArray(p.careTypes) ? p.careTypes : [],
    highlights: Array.isArray(p.highlights) ? p.highlights : [],
    acceptedPayments: Array.isArray(p.acceptedPayments) ? p.acceptedPayments : [],
    verified: Boolean(p.verified),
    description: p.description as string | undefined,
  };
}

