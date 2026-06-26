"use client";

import { Suspense, useState, useRef, useCallback, useEffect, useMemo, Component, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useClickOutside } from "@/hooks/use-click-outside";
import { useCitySearch } from "@/hooks/use-city-search";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { createAuthClient } from "@/lib/supabase/auth-client";
import Button from "@/components/ui/Button";
import OrganizationSearch, { type SelectedOrg } from "@/components/shared/OrganizationSearch";
import OnboardingBottomNav from "@/components/provider/OnboardingBottomNav";
import { ReactiveHint } from "@/components/medjobs/Tooltip";
import { validateEmail, type EmailValidationResult } from "@/lib/email-validation";
// Note: We don't import the full Provider type - search only selects specific columns
// to avoid JSONB fields that can cause React rendering errors
import { useAuth } from "@/components/auth/AuthProvider";

// Error boundary to catch and display rendering errors
class OnboardingErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[OnboardingErrorBoundary] Caught error:", error);
    console.error("[OnboardingErrorBoundary] Component stack:", errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#FAFAF8] p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h2>
            <p className="text-gray-500 mb-4 text-sm">
              {this.state.error?.message || "An unexpected error occurred"}
            </p>
            <pre className="text-left text-xs bg-gray-100 p-3 rounded-lg overflow-auto max-h-40 mb-4 text-red-600">
              {this.state.error?.stack?.slice(0, 500)}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500 transition-colors"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// ============================================================
// Types
// ============================================================

type Screen = "search" | "results" | "preview" | "confirm-claim" | "dispute";

interface FormData {
  orgName: string;
  city: string;
  state: string;
  email: string;
  phone: string;
  careTypes: string[];
}

// Care categories for the preview form (from NavMenuData)
const CARE_TYPE_OPTIONS = [
  { id: "home-health", label: "Home Health" },
  { id: "home-care", label: "Home Care" },
  { id: "assisted-living", label: "Assisted Living" },
  { id: "memory-care", label: "Memory Care" },
  { id: "nursing-homes", label: "Nursing Homes" },
  { id: "independent-living", label: "Independent Living" },
];

// Role options for dispute form
const DISPUTE_ROLE_OPTIONS = [
  { value: "Owner", label: "Owner" },
  { value: "Administrator", label: "Administrator" },
  { value: "Executive Director", label: "Executive Director" },
  { value: "Office Manager", label: "Office Manager" },
  { value: "Marketing / Communications", label: "Marketing / Communications" },
  { value: "Staff Member", label: "Staff Member" },
  { value: "Other", label: "Other" },
];

// Consumer email domains (personal emails)
// Used to show ReactiveHint encouraging business email use
const CONSUMER_EMAIL_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com",
  "icloud.com", "aol.com", "protonmail.com", "live.com",
  "msn.com", "me.com", "mail.com", "ymail.com", "googlemail.com",
  "comcast.net", "att.net", "verizon.net", "sbcglobal.net",
  "cox.net", "earthlink.net", "juno.com", "netzero.com",
  "zoho.com", "fastmail.com", "tutanota.com", "hey.com",
  "pm.me", "proton.me", "yahoo.co.uk", "hotmail.co.uk",
  "outlook.co.uk", "btinternet.com", "virginmedia.com",
]);

// Check if email is a business email (not a consumer/personal email)
function isBusinessEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return false;
  return !CONSUMER_EMAIL_DOMAINS.has(domain);
}

// Search result from olera-providers (only includes columns we select in search query)
interface ProviderMatch {
  provider_id: string;
  provider_name: string;
  slug: string | null;
  city: string | null;
  state: string | null;
  email: string | null;
  provider_images: string | null;
  _source: "olera-providers";
  _claimed: boolean;
  _emailMatch: boolean;
}

// Search result from business_profiles
interface BusinessProfileMatch {
  id: string;
  display_name: string;
  slug: string;
  city: string | null;
  state: string | null;
  email: string | null;
  image_url: string | null;
  account_id: string | null;
  source_provider_id: string | null;
  claim_state: string | null;
  _source: "business_profiles";
  _claimed: boolean;
  _emailMatch: boolean;
}

type SearchResult = ProviderMatch | BusinessProfileMatch;

const EMPTY_FORM: FormData = {
  orgName: "",
  city: "",
  state: "",
  email: "",
  phone: "",
  careTypes: [],
};

// ============================================================
// Main Component (with Suspense wrapper)
// ============================================================

export default function ProviderOnboardingPage() {
  return (
    <OnboardingErrorBoundary>
      <Suspense fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#FAFAF8]">
          <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
        </div>
      }>
        <ProviderOnboardingContent />
      </Suspense>
    </OnboardingErrorBoundary>
  );
}

function ProviderOnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { openAuth, user, profiles, refreshAccountData } = useAuth();

  // Screen state
  const [screen, setScreen] = useState<Screen>("search");
  const [actionLoading, setActionLoading] = useState<string | null>(null); // Track loading by slug

  // Form data (persists across screens)
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM);

  // Search state
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);

  // Organization autocomplete state
  const [selectedOrg, setSelectedOrg] = useState<SelectedOrg | null>(null);
  // Track when user explicitly clicks "Create new" from autocomplete
  const [createNewSelected, setCreateNewSelected] = useState(false);
  // Track if org was pre-filled from URL (provider details page) - these should stay read-only
  const [isPrefilledFromUrl, setIsPrefilledFromUrl] = useState(false);

  // City picker state
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const cityDropdownRef = useRef<HTMLDivElement>(null);
  const cityInputRef = useRef<HTMLInputElement>(null);
  const searchFormRef = useRef<HTMLFormElement>(null);
  const [cityQuery, setCityQuery] = useState("");
  const { results: cityResults, preload: preloadCities } = useCitySearch(cityQuery);

  useClickOutside(cityDropdownRef, () => setShowCityDropdown(false));

  // Action/API error state
  const [actionError, setActionError] = useState("");

  // Dispute form state
  const [disputingResult, setDisputingResult] = useState<SearchResult | null>(null);
  const [disputeName, setDisputeName] = useState("");
  const [disputeEmail, setDisputeEmail] = useState("");
  const [disputePhone, setDisputePhone] = useState("");
  const [disputeRole, setDisputeRole] = useState("");
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeSubmitting, setDisputeSubmitting] = useState(false);
  const [disputeError, setDisputeError] = useState("");
  const [disputeSubmitted, setDisputeSubmitted] = useState(false);

  // Claim sign-in state (for when user signs in on a claimed listing)
  const [claimSignInMismatch, setClaimSignInMismatch] = useState<{
    userEmail: string;
    listingName: string;
  } | null>(null);

  // Email validation state
  const [emailValidation, setEmailValidation] = useState<EmailValidationResult>({ valid: true });
  const [emailChecking, setEmailChecking] = useState(false);
  const [emailAccountError, setEmailAccountError] = useState<string | null>(null);

  // Exit URL - read from ?returnTo param, fallback to /for-providers
  const exitUrl = useMemo(() => {
    const returnTo = searchParams.get("returnTo");
    // Only allow relative paths starting with single "/" (not protocol-relative "//")
    if (returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")) {
      return returnTo;
    }
    return "/for-providers";
  }, [searchParams]);

  const handleExit = useCallback(() => {
    router.push(exitUrl);
  }, [exitUrl, router]);

  // Instant claim existing listing (no OTP)
  const handleInstantClaim = async () => {
    if (!selectedResult) return;

    const email = formData.email.trim().toLowerCase();
    const isOleraProvider = selectedResult._source === "olera-providers";
    const providerId = isOleraProvider
      ? selectedResult.provider_id
      : selectedResult.source_provider_id || selectedResult.id;
    const providerName = isOleraProvider
      ? selectedResult.provider_name
      : selectedResult.display_name;
    const providerSlug = isOleraProvider
      ? (selectedResult.slug || selectedResult.provider_id)
      : selectedResult.slug;

    setActionLoading("instant-claim");
    setActionError("");

    try {
      // Check if email is available for provider account
      const checkRes = await fetch("/api/auth/check-email-type", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, intendedType: "organization" }),
      });
      const checkResult = await checkRes.json();

      if (!checkResult.available) {
        if (checkResult.alreadyHasProfile) {
          setActionError("This email is already associated with a provider account. Please sign in instead.");
        } else {
          setActionError(
            `This email is linked to a ${checkResult.existingType} account. Please use a different email.`
          );
        }
        setActionLoading(null);
        return;
      }

      // Call instant claim API
      const res = await fetch("/api/provider/claim-instant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          providerId,
          providerName,
          providerSlug,
          providerEmail: selectedResult.email,
          city: selectedResult.city || formData.city,
          state: selectedResult.state || formData.state,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        setActionError(result.error || "Failed to claim page. Please try again.");
        setActionLoading(null);
        return;
      }

      // Establish session using token
      const authClient = createAuthClient();
      const { data: verifyData, error: verifyError } = await authClient.auth.verifyOtp({
        token_hash: result.tokenHash,
        type: "magiclink",
      });

      if (verifyError || !verifyData?.session) {
        console.error("[handleInstantClaim] verifyOtp failed:", verifyError?.message || "no session returned");
        setActionError("Failed to sign in. Please try again.");
        setActionLoading(null);
        return;
      }

      // Transfer session from implicit flow client to SSR client (for cookie persistence)
      await createClient().auth.setSession({
        access_token: verifyData.session.access_token,
        refresh_token: verifyData.session.refresh_token,
      });

      // Load the newly claimed account + provider profile into the auth context
      // BEFORE navigating. Without this, the provider layout mounts with a stale
      // (empty) profiles list, sees no provider profile, and bounces to the
      // family portal (/portal/inbox). Pass the explicit user id since the
      // provider's auth state may not have propagated yet.
      await refreshAccountData(verifyData.session.user.id);

      // Redirect to provider dashboard
      setActionLoading(null);
      router.push("/provider");
    } catch (err) {
      console.error("[handleInstantClaim] Error:", err);
      setActionError("Something went wrong. Please try again.");
      setActionLoading(null);
    }
  };

  // Instant create new listing (no OTP)
  const handleInstantCreate = async () => {
    // Validation
    if (!formData.orgName.trim()) {
      setActionError("Organization name is required.");
      return;
    }
    if (!formData.city.trim() || !formData.state.trim()) {
      setActionError("City and state are required.");
      return;
    }
    if (!formData.email.trim() || !formData.email.includes("@")) {
      setActionError("A valid email is required.");
      return;
    }
    if (formData.careTypes.length === 0) {
      setActionError("Please select at least one care type.");
      return;
    }
    if (formData.phone.trim()) {
      const digitsOnly = formData.phone.replace(/\D/g, "");
      if (digitsOnly.length < 10 || digitsOnly.length > 15) {
        setActionError("Please enter a valid phone number (10-15 digits).");
        return;
      }
    }

    const email = formData.email.trim().toLowerCase();
    setActionLoading("instant-create");
    setActionError("");

    try {
      // Check if email is available for provider account
      const checkRes = await fetch("/api/auth/check-email-type", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, intendedType: "organization" }),
      });
      const checkResult = await checkRes.json();

      if (!checkResult.available) {
        if (checkResult.alreadyHasProfile) {
          setActionError("This email is already associated with a provider account. Please sign in instead.");
        } else {
          setActionError(
            `This email is linked to a ${checkResult.existingType} account. Please use a different email.`
          );
        }
        setActionLoading(null);
        return;
      }

      // Call instant claim API with isNewOrg flag
      const res = await fetch("/api/provider/claim-instant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          isNewOrg: true,
          orgName: formData.orgName.trim(),
          city: formData.city.trim(),
          state: formData.state.trim(),
          phone: formData.phone.trim() || null,
          careTypes: formData.careTypes,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        setActionError(result.error || "Failed to create page. Please try again.");
        setActionLoading(null);
        return;
      }

      // Establish session using token
      const authClient = createAuthClient();
      const { data: verifyData, error: verifyError } = await authClient.auth.verifyOtp({
        token_hash: result.tokenHash,
        type: "magiclink",
      });

      if (verifyError || !verifyData?.session) {
        console.error("[handleInstantCreate] verifyOtp failed:", verifyError?.message || "no session returned");
        setActionError("Failed to sign in. Please try again.");
        setActionLoading(null);
        return;
      }

      // Transfer session from implicit flow client to SSR client (for cookie persistence)
      await createClient().auth.setSession({
        access_token: verifyData.session.access_token,
        refresh_token: verifyData.session.refresh_token,
      });

      // Load the newly created account + provider profile into the auth context
      // BEFORE navigating. Without this, the provider layout mounts with a stale
      // (empty) profiles list, sees no provider profile, and bounces to the
      // family portal (/portal/inbox). Pass the explicit user id since the
      // provider's auth state may not have propagated yet.
      await refreshAccountData(verifyData.session.user.id);

      // Redirect to provider dashboard
      setActionLoading(null);
      router.push("/provider");
    } catch (err) {
      console.error("[handleInstantCreate] Error:", err);
      setActionError("Something went wrong. Please try again.");
      setActionLoading(null);
    }
  };

  // Track which email we're currently checking (to avoid race conditions)
  const emailCheckRef = useRef<string | null>(null);

  // Validate email on blur - checks format, typos, and account conflicts
  const handleEmailBlur = useCallback(async () => {
    const email = formData.email.trim();

    // Skip if empty
    if (!email) {
      setEmailValidation({ valid: true });
      setEmailAccountError(null);
      return;
    }

    // Step 1: Validate format and check for typos
    const validation = validateEmail(email);
    setEmailValidation(validation);

    // If format is invalid or has typo, don't check account type yet
    if (!validation.valid) {
      setEmailAccountError(null);
      return;
    }

    // Step 2: Check if email is already used by another account type
    const emailToCheck = email.toLowerCase();
    emailCheckRef.current = emailToCheck;

    setEmailChecking(true);
    setEmailAccountError(null);

    try {
      const res = await fetch("/api/auth/check-email-type", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailToCheck, intendedType: "organization" }),
      });

      // Only update state if this is still the email we're checking (avoid race condition)
      if (emailCheckRef.current !== emailToCheck) return;

      if (res.ok) {
        const data = await res.json();
        if (!data.available) {
          if (data.alreadyHasProfile) {
            setEmailAccountError("This email already manages a provider page. Sign in instead.");
          } else if (data.existingType === "family") {
            setEmailAccountError("This email is linked to a family account. Use a different email for your provider page.");
          } else if (data.existingType === "caregiver") {
            setEmailAccountError("This email is linked to a caregiver account. Use a different email for your provider page.");
          } else {
            setEmailAccountError("This email is already in use. Please use a different email.");
          }
        }
      }
    } catch (err) {
      console.error("[handleEmailBlur] check-email-type error:", err);
      // Don't block on network errors - the submit handler will catch it
    } finally {
      if (emailCheckRef.current === emailToCheck) {
        setEmailChecking(false);
      }
    }
  }, [formData.email]);

  // Apply email suggestion (typo correction) and re-validate
  const applyEmailSuggestion = useCallback(() => {
    if (emailValidation.suggestedEmail) {
      const correctedEmail = emailValidation.suggestedEmail;
      setFormData(prev => ({ ...prev, email: correctedEmail }));
      setEmailValidation({ valid: true });
      setEmailAccountError(null);

      // Re-check account type for the corrected email
      const checkCorrectedEmail = async () => {
        emailCheckRef.current = correctedEmail;
        setEmailChecking(true);

        try {
          const res = await fetch("/api/auth/check-email-type", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: correctedEmail, intendedType: "organization" }),
          });

          if (emailCheckRef.current !== correctedEmail) return;

          if (res.ok) {
            const data = await res.json();
            if (!data.available) {
              if (data.alreadyHasProfile) {
                setEmailAccountError("This email already manages a provider page. Sign in instead.");
              } else if (data.existingType === "family") {
                setEmailAccountError("This email is linked to a family account. Use a different email for your provider page.");
              } else if (data.existingType === "caregiver") {
                setEmailAccountError("This email is linked to a caregiver account. Use a different email for your provider page.");
              } else {
                setEmailAccountError("This email is already in use. Please use a different email.");
              }
            }
          }
        } catch (err) {
          console.error("[applyEmailSuggestion] check-email-type error:", err);
        } finally {
          if (emailCheckRef.current === correctedEmail) {
            setEmailChecking(false);
          }
        }
      };

      checkCorrectedEmail();
    }
  }, [emailValidation.suggestedEmail]);

  // Check if email is valid for proceeding
  const isEmailValid = useMemo(() => {
    // Must have email
    if (!formData.email.trim() || !formData.email.includes("@")) return false;
    // Must pass format validation (typos also block - user must fix them)
    if (!emailValidation.valid) return false;
    // Must not have account conflicts
    if (emailAccountError) return false;
    return true;
  }, [formData.email, emailValidation, emailAccountError]);

  // Handle "Sign in" click on a claimed listing
  // Store listing context and open auth with return URL
  const handleClaimSignIn = useCallback((result: SearchResult) => {
    const name = result._source === "olera-providers" ? result.provider_name : result.display_name;
    const listingEmail = result.email?.toLowerCase() || null;

    // If user is already signed in, validate immediately instead of opening auth
    if (user) {
      const userEmail = user.email?.toLowerCase();
      if (listingEmail && userEmail !== listingEmail) {
        // Already signed in with wrong email
        setClaimSignInMismatch({
          userEmail: user.email || "",
          listingName: name,
        });
        return; // Don't open auth modal
      } else if (!listingEmail || userEmail === listingEmail) {
        // Already signed in with correct email (or no email to validate)
        router.push("/portal/inbox");
        return;
      }
    }

    // Not signed in - store context for validation after auth completes
    try {
      sessionStorage.setItem("olera_claim_signin_pending", JSON.stringify({
        listingEmail,
        listingName: name,
        createdAt: Date.now(), // TTL tracking
      }));
    } catch {
      // sessionStorage unavailable
    }

    // Open auth modal - after sign-in, user returns to this page
    openAuth({
      defaultMode: "sign-in",
      deferred: {
        action: "claim-listing",
        returnUrl: "/provider/onboarding",
      },
    });
  }, [openAuth, user, router]);

  // Validate claim sign-in after user signs in
  // Check if the signed-in user's email matches the claimed listing's email
  useEffect(() => {
    if (!user) return;

    try {
      const pending = sessionStorage.getItem("olera_claim_signin_pending");
      if (!pending) return;

      const parsed = JSON.parse(pending) as {
        listingEmail: string | null;
        listingName: string;
        createdAt?: number;
      };

      // Clear the pending state immediately
      sessionStorage.removeItem("olera_claim_signin_pending");

      // Check TTL - ignore if older than 5 minutes (stale from abandoned flow)
      const MAX_PENDING_AGE_MS = 5 * 60 * 1000;
      if (parsed.createdAt && Date.now() - parsed.createdAt > MAX_PENDING_AGE_MS) {
        return; // Stale, ignore
      }

      const { listingEmail, listingName } = parsed;

      // If listing has no email on file, we can't validate - redirect to portal
      if (!listingEmail) {
        router.push("/portal/inbox");
        return;
      }

      // Check if emails match (case-insensitive)
      const userEmail = user.email?.toLowerCase();
      if (userEmail !== listingEmail) {
        // Mismatch - show error (don't force screen change, show on current screen)
        setClaimSignInMismatch({
          userEmail: user.email || "",
          listingName,
        });
      } else {
        // Match - redirect to portal
        router.push("/portal/inbox");
      }
    } catch {
      // Parse error or sessionStorage unavailable
    }
  }, [user, router]);

  // Pre-fill form from marketing page (sessionStorage)
  useEffect(() => {
    try {
      const prefillKey = "olera_provider_search_prefill";
      const stored = sessionStorage.getItem(prefillKey);
      if (!stored) return;

      const parsed = JSON.parse(stored) as {
        searchQuery?: string;
        locationQuery?: string; // Legacy format
        selectedOrg?: SelectedOrg | null;
        createNewSelected?: boolean; // User explicitly clicked "Create new"
      };

      // Clear after reading so it doesn't persist across sessions
      sessionStorage.removeItem(prefillKey);

      // New format: selectedOrg from OrganizationSearch
      if (parsed.selectedOrg) {
        // Defensive: sanitize all fields to prevent React Error #310
        // SessionStorage data might have unexpected object types from API
        const org: SelectedOrg = {
          name: String(parsed.selectedOrg.name || ""),
          slug: String(parsed.selectedOrg.slug || ""),
          city: parsed.selectedOrg.city ? String(parsed.selectedOrg.city) : null,
          state: parsed.selectedOrg.state ? String(parsed.selectedOrg.state) : null,
          email: parsed.selectedOrg.email ? String(parsed.selectedOrg.email) : null,
          claimState: parsed.selectedOrg.claimState || null,
          source: parsed.selectedOrg.source || "olera-providers",
          providerId: parsed.selectedOrg.providerId ? String(parsed.selectedOrg.providerId) : undefined,
          imageUrl: parsed.selectedOrg.imageUrl ? String(parsed.selectedOrg.imageUrl) : null,
        };
        setSelectedOrg(org);
        setFormData(prev => ({
          ...prev,
          orgName: org.name,
          city: org.city || "",
          state: org.state || "",
        }));
        if (org.city && org.state) {
          setCityQuery(`${org.city}, ${org.state}`);
        }
      } else if (parsed.searchQuery?.trim()) {
        // User typed org name but didn't select from dropdown
        setFormData(prev => ({ ...prev, orgName: parsed.searchQuery!.trim() }));
        // Check if user explicitly clicked "Create new" on marketing page
        if (parsed.createNewSelected) {
          setCreateNewSelected(true);
          // Go directly to Create Your Page screen (skip search)
          setScreen("preview");
        }
      }

      // Legacy format: locationQuery (for backwards compatibility)
      if (parsed.locationQuery?.trim() && !parsed.selectedOrg) {
        setCityQuery(parsed.locationQuery.trim());
        const parts = parsed.locationQuery.split(",").map(s => s.trim());
        if (parts.length >= 2) {
          setFormData(prev => ({
            ...prev,
            city: parts[0],
            state: parts[1],
          }));
        }
      }
    } catch {
      // sessionStorage unavailable or parse error — ignore
    }
  }, []);

  // Pre-fill from URL param ?org={slug} (from provider details page links)
  useEffect(() => {
    const orgSlug = searchParams.get("org");
    if (!orgSlug) return;

    // Don't override if we already have a selected org from sessionStorage
    if (selectedOrg) return;

    // Fetch provider data by slug
    const fetchProvider = async () => {
      if (!isSupabaseConfigured()) return;

      try {
        const supabase = createClient();

        // Try business_profiles first (may have been claimed/created)
        const { data: bp } = await supabase
          .from("business_profiles")
          .select("id, display_name, slug, city, state, email, image_url, claim_state, account_id")
          .eq("slug", orgSlug)
          .in("type", ["organization", "caregiver"])
          .maybeSingle();

        if (bp) {
          const isClaimed = bp.claim_state === "claimed" && !!bp.account_id;
          const org: SelectedOrg = {
            name: bp.display_name,
            slug: bp.slug,
            city: bp.city,
            state: bp.state,
            email: bp.email,
            imageUrl: bp.image_url,
            claimState: isClaimed ? "claimed" : (bp.claim_state as "unclaimed" | "pending" | null),
            source: "business_profiles",
            providerId: bp.id,
          };
          setSelectedOrg(org);
          setIsPrefilledFromUrl(true); // Mark as prefilled from URL - should stay read-only
          setFormData(prev => ({
            ...prev,
            orgName: org.name,
            city: org.city || "",
            state: org.state || "",
          }));
          if (org.city && org.state) {
            setCityQuery(`${org.city}, ${org.state}`);
          }
          return;
        }

        // Try olera-providers
        const { data: op } = await supabase
          .from("olera-providers")
          .select("provider_id, provider_name, slug, city, state, email, provider_images")
          .eq("slug", orgSlug)
          .not("deleted", "is", true)
          .maybeSingle();

        if (op) {
          // Check if this provider has a claimed business_profile
          const { data: claimedBp } = await supabase
            .from("business_profiles")
            .select("claim_state, account_id")
            .eq("source_provider_id", op.provider_id)
            .maybeSingle();

          const isClaimed = claimedBp?.claim_state === "claimed" && !!claimedBp?.account_id;
          const firstImage = op.provider_images?.split("|")[0]?.trim() || null;

          const org: SelectedOrg = {
            name: op.provider_name,
            slug: op.slug || op.provider_id,
            city: op.city,
            state: op.state,
            email: op.email,
            imageUrl: firstImage,
            claimState: isClaimed ? "claimed" : "unclaimed",
            source: "olera-providers",
            providerId: op.provider_id,
          };
          setSelectedOrg(org);
          setIsPrefilledFromUrl(true); // Mark as prefilled from URL - should stay read-only
          setFormData(prev => ({
            ...prev,
            orgName: org.name,
            city: org.city || "",
            state: org.state || "",
          }));
          if (org.city && org.state) {
            setCityQuery(`${org.city}, ${org.state}`);
          }
        }
      } catch (err) {
        console.error("Failed to fetch provider by slug:", err);
      }
    };

    fetchProvider();
  }, [searchParams, selectedOrg, isPrefilledFromUrl]);

  // ──────────────────────────────────────────────────────────
  // Form Handlers
  // ──────────────────────────────────────────────────────────

  const handleCitySelect = useCallback((city: string, state: string) => {
    setFormData(prev => ({ ...prev, city, state }));
    setCityQuery(`${city}, ${state}`);
    setShowCityDropdown(false);
  }, []);

  // Handle organization selection from autocomplete
  const handleOrgSelect = useCallback((org: SelectedOrg | null) => {
    setSelectedOrg(org);
    if (org) {
      // Existing org selected - clear "create new" flag
      setCreateNewSelected(false);
      // Auto-fill city/state from selected org
      if (org.city && org.state) {
        setFormData(prev => ({ ...prev, city: org.city!, state: org.state! }));
        setCityQuery(`${org.city}, ${org.state}`);
      } else {
        // Org doesn't have city/state - clear fields so user knows to fill them
        setFormData(prev => ({ ...prev, city: "", state: "" }));
        setCityQuery("");
      }
    } else {
      // "Create new" explicitly selected from autocomplete
      setCreateNewSelected(true);
      // Keep existing city/state - user already entered it, no need to clear
    }
  }, []);

  const handleSearch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    let { orgName, city, state, email } = formData;

    // Auto-parse city/state from cityQuery if user typed manually without selecting
    if ((!city || !state) && cityQuery.trim()) {
      const parts = cityQuery.split(",").map(s => s.trim());
      if (parts.length >= 2) {
        city = parts[0];
        state = parts[1];
        // Update formData for consistency
        setFormData(prev => ({ ...prev, city, state }));
      } else if (parts.length === 1 && parts[0].length === 2) {
        // Just a state abbreviation
        state = parts[0].toUpperCase();
        setFormData(prev => ({ ...prev, state }));
      }
    }

    // Validation
    if (!orgName.trim()) {
      setSearchError("Organization name is required.");
      return;
    }
    if (!city.trim() || !state.trim()) {
      setSearchError("Please select a city and state from the dropdown.");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      setSearchError("A valid email is required.");
      return;
    }

    // Run email validation if blur hasn't fired yet (user clicked Continue directly)
    // This handles the case where user types email and immediately clicks Continue
    const validation = validateEmail(email);
    if (!validation.valid) {
      // Set inline validation state - UI will show error near the email input
      setEmailValidation(validation);
      // Don't set searchError here to avoid duplicate error messages
      return;
    }
    // Update validation state if it was stale
    if (!emailValidation.valid || emailValidation.error) {
      setEmailValidation(validation);
    }

    // If there's an account error from a previous check, block submission
    if (emailAccountError) {
      // Show account error inline - don't duplicate in searchError
      return;
    }

    // Check email account type (handles case where blur didn't fire yet)
    // This ensures one-click flow works even if user clicked Continue immediately after typing email
    const normalizedEmail = email.trim().toLowerCase();
    setSearching(true); // Show loading state during check

    try {
      const checkRes = await fetch("/api/auth/check-email-type", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, intendedType: "organization" }),
      });

      if (checkRes.ok) {
        const checkResult = await checkRes.json();
        if (!checkResult.available) {
          // Set error and stay on page so user can fix the email
          if (checkResult.alreadyHasProfile) {
            setEmailAccountError("This email already manages a provider page. Sign in instead.");
          } else if (checkResult.existingType === "family") {
            setEmailAccountError("This email is linked to a family account. Use a different email for your provider page.");
          } else if (checkResult.existingType === "caregiver") {
            setEmailAccountError("This email is linked to a caregiver account. Use a different email for your provider page.");
          } else {
            setEmailAccountError("This email is already in use. Please use a different email.");
          }
          setSearching(false);
          return;
        }
        // Clear any stale account error from blur handler
        setEmailAccountError(null);
      }
    } catch (err) {
      console.error("[handleSearch] check-email-type error:", err);
      // Don't block on network errors - continue and let subsequent handlers catch issues
    }

    // If user explicitly selected "Create new" from autocomplete, go directly to preview
    if (createNewSelected && formData.orgName.trim()) {
      // They clicked "Create [name] as new organization" - skip search, go to create screen
      setSearching(false);
      setScreen("preview");
      return;
    }

    // If user selected an existing org from autocomplete, create result directly
    if (selectedOrg) {
      const normalizedEmail = email.trim().toLowerCase();
      const emailMatch = selectedOrg.email?.toLowerCase() === normalizedEmail;
      const isClaimed = selectedOrg.claimState === "claimed";

      // Defensive: ensure all fields are proper primitives to prevent React Error #310
      // Data from sessionStorage/API might have unexpected object types
      const safeProviderId = String(selectedOrg.providerId || selectedOrg.slug || "");
      const safeName = String(selectedOrg.name || "");
      const safeSlug = String(selectedOrg.slug || "");
      const safeCity = selectedOrg.city ? String(selectedOrg.city) : null;
      const safeState = selectedOrg.state ? String(selectedOrg.state) : null;
      const safeEmail = selectedOrg.email ? String(selectedOrg.email) : null;
      const safeImageUrl = selectedOrg.imageUrl ? String(selectedOrg.imageUrl) : null;
      const safeClaimState = selectedOrg.claimState || null; // Already a string literal type, but ensure it's not an object
      const safeSource = selectedOrg.source || "olera-providers";

      // Create a search result from the selected org
      const result: SearchResult = safeSource === "olera-providers"
        ? {
            provider_id: safeProviderId,
            provider_name: safeName,
            slug: safeSlug,
            city: safeCity,
            state: safeState,
            email: safeEmail,
            provider_images: safeImageUrl || undefined, // For getProviderImage()
            _source: "olera-providers" as const,
            _claimed: isClaimed,
            _emailMatch: emailMatch,
          } as ProviderMatch
        : {
            id: safeProviderId,
            display_name: safeName,
            slug: safeSlug,
            city: safeCity,
            state: safeState,
            email: safeEmail,
            image_url: safeImageUrl,
            account_id: isClaimed ? "claimed" : null, // Simplified - just need to know if claimed
            source_provider_id: safeProviderId || null,
            claim_state: safeClaimState,
            _source: "business_profiles" as const,
            _claimed: isClaimed,
            _emailMatch: emailMatch,
          } as BusinessProfileMatch;

      setSearchResults([result]);
      setSearching(false);

      // For unclaimed pre-selected orgs, skip results and go directly to confirm-claim
      if (!isClaimed) {
        setSelectedResult(result);
        setScreen("confirm-claim");
      } else {
        // Claimed orgs still go to results (for dispute/sign-in options)
        setScreen("results");
      }
      return;
    }

    if (!isSupabaseConfigured()) {
      setSearchError("Database not configured.");
      return;
    }

    setSearching(true);
    setSearchError("");

    try {
      const supabase = createClient();
      const normalizedEmail = email.trim().toLowerCase();
      const normalizedName = orgName.trim();
      const normalizedCity = city.trim();
      const normalizedState = state.trim();

      // Escape special characters for Postgres LIKE/ILIKE patterns
      const escapeLike = (str: string) => str.replace(/[%_\\]/g, "\\$&");
      const escapedName = escapeLike(normalizedName);

      // ═══════════════════════════════════════════════════════
      // Query 1: olera-providers (scraped listings)
      // Run two separate queries and merge (safer than OR with special chars)
      // Note: Only select columns we need - avoid JSONB columns (google_reviews_data, cms_data, ai_trust_signals)
      // which can cause React rendering errors if accidentally spread into JSX
      // ═══════════════════════════════════════════════════════
      const providerColumns = "provider_id, provider_name, slug, city, state, email, provider_images";
      const [nameMatchResult, emailMatchResult] = await Promise.all([
        // Name match
        supabase
          .from("olera-providers")
          .select(providerColumns)
          .not("deleted", "is", true)
          .ilike("provider_name", `%${escapedName}%`)
          .limit(15),
        // Email match
        supabase
          .from("olera-providers")
          .select(providerColumns)
          .not("deleted", "is", true)
          .eq("email", normalizedEmail)
          .limit(5),
      ]);

      // Merge and dedupe providers
      type PartialProvider = {
        provider_id: string;
        provider_name: string;
        slug: string | null;
        city: string | null;
        state: string | null;
        email: string | null;
        provider_images: string | null;
      };
      const providerMap = new Map<string, PartialProvider>();
      for (const p of [...(emailMatchResult.data || []), ...(nameMatchResult.data || [])]) {
        if (!providerMap.has(p.provider_id)) {
          providerMap.set(p.provider_id, p as PartialProvider);
        }
      }
      const providers = Array.from(providerMap.values());

      if (nameMatchResult.error) {
        console.error("Provider name search error:", nameMatchResult.error);
      }
      if (emailMatchResult.error) {
        console.error("Provider email search error:", emailMatchResult.error);
      }

      // ═══════════════════════════════════════════════════════
      // Query 2: business_profiles (claimed/created profiles)
      // ═══════════════════════════════════════════════════════
      const [bpNameResult, bpEmailResult] = await Promise.all([
        supabase
          .from("business_profiles")
          .select("id, display_name, slug, city, state, email, image_url, account_id, source_provider_id, claim_state")
          .in("type", ["organization", "caregiver"])
          .ilike("display_name", `%${escapedName}%`)
          .limit(15),
        supabase
          .from("business_profiles")
          .select("id, display_name, slug, city, state, email, image_url, account_id, source_provider_id, claim_state")
          .in("type", ["organization", "caregiver"])
          .eq("email", normalizedEmail)
          .limit(5),
      ]);

      // Merge and dedupe profiles
      type PartialBusinessProfile = {
        id: string;
        display_name: string;
        slug: string;
        city: string | null;
        state: string | null;
        email: string | null;
        image_url: string | null;
        account_id: string | null;
        source_provider_id: string | null;
        claim_state: string | null;
      };
      const profileMap = new Map<string, PartialBusinessProfile>();
      for (const bp of [...(bpEmailResult.data || []), ...(bpNameResult.data || [])] as PartialBusinessProfile[]) {
        if (!profileMap.has(bp.id)) {
          profileMap.set(bp.id, bp);
        }
      }
      const profiles = Array.from(profileMap.values());

      if (bpNameResult.error) {
        console.error("Profile name search error:", bpNameResult.error);
      }
      if (bpEmailResult.error) {
        console.error("Profile email search error:", bpEmailResult.error);
      }

      // ═══════════════════════════════════════════════════════
      // Query 3: Check which olera-providers are already claimed
      // ═══════════════════════════════════════════════════════
      const providerIds = (providers || []).map(p => p.provider_id);
      let claimedProviderIds = new Set<string>();

      if (providerIds.length > 0) {
        const { data: claimedProfiles } = await supabase
          .from("business_profiles")
          .select("source_provider_id")
          .in("source_provider_id", providerIds)
          .eq("claim_state", "claimed");

        claimedProviderIds = new Set(
          ((claimedProfiles || []) as Array<{ source_provider_id: string | null }>)
            .map(p => p.source_provider_id)
            .filter(Boolean) as string[]
        );
      }

      // ═══════════════════════════════════════════════════════
      // Merge & Deduplicate Results
      // ═══════════════════════════════════════════════════════
      const results: SearchResult[] = [];
      const seenSlugs = new Set<string>();

      // Add olera-providers (exclude those with a claimed business_profile)
      for (const p of providers || []) {
        const slug = p.slug || p.provider_id;
        if (seenSlugs.has(slug)) continue;

        // Skip if this provider has a claimed business_profile (we'll show that instead)
        const isClaimed = claimedProviderIds.has(p.provider_id);
        const hasClaimedBP = (profiles || []).some(
          bp => bp.source_provider_id === p.provider_id && bp.claim_state === "claimed"
        );
        if (hasClaimedBP) continue;

        seenSlugs.add(slug);
        results.push({
          ...p,
          _source: "olera-providers",
          _claimed: isClaimed,
          _emailMatch: p.email?.toLowerCase() === normalizedEmail,
        });
      }

      // Add business_profiles
      for (const bp of profiles || []) {
        const slug = bp.slug;
        if (seenSlugs.has(slug)) continue;

        seenSlugs.add(slug);
        results.push({
          ...bp,
          _source: "business_profiles",
          _claimed: bp.claim_state === "claimed" && !!bp.account_id,
          _emailMatch: bp.email?.toLowerCase() === normalizedEmail,
        });
      }

      // ═══════════════════════════════════════════════════════
      // Sort: Email matches first, then by city match, then name
      // ═══════════════════════════════════════════════════════
      results.sort((a, b) => {
        // Email match priority (highest)
        if (a._emailMatch && !b._emailMatch) return -1;
        if (!a._emailMatch && b._emailMatch) return 1;

        // City match priority
        const aCityMatch = a.city?.toLowerCase() === normalizedCity.toLowerCase();
        const bCityMatch = b.city?.toLowerCase() === normalizedCity.toLowerCase();
        if (aCityMatch && !bCityMatch) return -1;
        if (!aCityMatch && bCityMatch) return 1;

        // State match as tiebreaker
        const aStateMatch = a.state?.toLowerCase() === normalizedState.toLowerCase();
        const bStateMatch = b.state?.toLowerCase() === normalizedState.toLowerCase();
        if (aStateMatch && !bStateMatch) return -1;
        if (!aStateMatch && bStateMatch) return 1;

        return 0;
      });

      setSearchResults(results);
      setScreen("results");

    } catch (err) {
      console.error("Search error:", err);
      setSearchError("Search failed. Please try again.");
    } finally {
      setSearching(false);
    }
  }, [formData, emailValidation, emailAccountError]);

  // Handle Flow B: sign in to claim (for personal email users)
  // Opens auth modal with deferred claim-listing action
  const handleSignInToClaim = useCallback(() => {
    if (!selectedResult) return;

    // Extract provider data based on source type
    const isOleraProvider = selectedResult._source === "olera-providers";

    // Cache provider data for post-auth claim processing
    const providerData = {
      provider_id: isOleraProvider
        ? selectedResult.provider_id
        : selectedResult.source_provider_id || selectedResult.id,
      provider_name: isOleraProvider
        ? selectedResult.provider_name
        : selectedResult.display_name,
      slug: isOleraProvider
        ? (selectedResult.slug || selectedResult.provider_id)
        : selectedResult.slug,
      email: selectedResult.email,
      city: selectedResult.city || formData.city,
      state: selectedResult.state || formData.state,
      source_type: selectedResult._source,
      // For business_profiles, include the actual ID (for updating vs creating)
      business_profile_id: !isOleraProvider ? selectedResult.id : undefined,
    };

    try {
      sessionStorage.setItem("olera_claim_provider_cache", JSON.stringify(providerData));
    } catch {
      console.warn("[handleSignInToClaim] sessionStorage not available");
    }

    // Open auth modal with provider intent and claim-listing deferred action
    // Pre-fill their email so they don't have to re-enter it
    openAuth({
      intent: "provider",
      initialEmail: formData.email.trim(),
      deferred: {
        action: "claim-listing",
        returnUrl: "/provider",
      },
    });
  }, [selectedResult, formData.city, formData.state, formData.email, openAuth]);

  // Handle sign-in to create NEW organization (personal email - requires auth)
  const handleSignInToCreateNewOrg = useCallback(() => {
    // Validation first
    if (!formData.orgName.trim()) {
      setActionError("Organization name is required.");
      return;
    }
    if (!formData.city.trim() || !formData.state.trim()) {
      setActionError("City and state are required.");
      return;
    }
    if (!formData.email.trim() || !formData.email.includes("@")) {
      setActionError("A valid email is required.");
      return;
    }
    if (formData.careTypes.length === 0) {
      setActionError("Please select at least one care type.");
      return;
    }
    if (formData.phone.trim()) {
      const digitsOnly = formData.phone.replace(/\D/g, "");
      if (digitsOnly.length < 10 || digitsOnly.length > 15) {
        setActionError("Please enter a valid phone number (10-15 digits).");
        return;
      }
    }

    // Cache new org data for post-auth processing
    const newOrgData = {
      isNewOrg: true,
      orgName: formData.orgName,
      email: formData.email.trim().toLowerCase(),
      city: formData.city,
      state: formData.state,
      phone: formData.phone || undefined,
      careTypes: formData.careTypes,
    };

    try {
      sessionStorage.setItem("olera_new_org_cache", JSON.stringify(newOrgData));
    } catch {
      console.warn("[handleSignInToCreateNewOrg] sessionStorage not available");
    }

    // Open auth modal with provider intent and deferred action
    // Note: Using "claim-listing" action - after auth, user will be redirected to complete listing creation
    openAuth({
      intent: "provider",
      providerType: "organization",
      initialEmail: formData.email.trim(),
      deferred: {
        action: "claim-listing",
        returnUrl: "/provider",
      },
    });
  }, [formData, openAuth]);

  // ──────────────────────────────────────────────────────────
  // Screen 1: Search Form
  // ──────────────────────────────────────────────────────────

  if (screen === "search") {
    return (
      <div className="min-h-screen flex flex-col bg-vanilla-100">
        {/* Minimal sticky nav */}
        <nav className="sticky top-0 z-50 border-b border-vanilla-200 bg-vanilla-100/95 backdrop-blur-sm">
          <div className="flex items-center justify-between max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <Link href="/" className="flex items-center space-x-2">
              <Image src="/images/olera-logo.png" alt="Olera" width={32} height={32} className="object-contain" />
              <span className="text-xl font-bold text-gray-900">Olera</span>
            </Link>
            <button
              onClick={handleExit}
              className="px-4 py-2 text-base font-medium text-gray-600 border border-gray-300 rounded-lg hover:border-gray-400 hover:text-gray-900 transition-colors"
            >
              Exit
            </button>
          </div>
        </nav>

        <div className="flex-1 flex items-center justify-center px-4 pt-12 md:pt-16 pb-24">
          <div className="w-full max-w-xl animate-fade-in">
            {/* Header - changes based on state */}
            <div className="text-center mb-8">
              <h1 className="text-2xl md:text-3xl font-display font-bold text-gray-900 tracking-tight">
                Confirm your organization
              </h1>
              <p className="text-gray-500 mt-2 max-w-md mx-auto">
                Enter your email to continue.
              </p>
            </div>

            {/* Search Form Card */}
            <form ref={searchFormRef} onSubmit={handleSearch} className="bg-white rounded-2xl border border-gray-200 p-6 md:p-8 space-y-5">
              {/* Organization Name - read-only only if prefilled from URL (provider details page) */}
              <div className="space-y-2">
                <label className="block text-base font-semibold text-gray-900">
                  Organization name
                </label>
                {selectedOrg && !createNewSelected && isPrefilledFromUrl ? (
                  // Read-only display for claiming from provider details page
                  <div className="flex items-center gap-2 px-4 py-3 bg-primary-50/50 rounded-xl border-2 border-primary-500 text-gray-900">
                    <svg className="w-5 h-5 text-primary-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    <span className="flex-1 font-medium">{selectedOrg.name}</span>
                    <svg className="w-5 h-5 text-primary-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                ) : (
                  // Editable autocomplete for searching/creating
                  <OrganizationSearch
                    value={formData.orgName}
                    onChange={(value) => {
                      setFormData(prev => ({ ...prev, orgName: value }));
                      // Clear selected org when user types something different
                      if (selectedOrg && value !== selectedOrg.name) {
                        setSelectedOrg(null);
                      }
                      // Note: We do NOT clear createNewSelected here.
                      // User may be editing their org name, still intending to create new.
                      // createNewSelected is only cleared when they SELECT an existing org from dropdown.
                    }}
                    onSelect={handleOrgSelect}
                    placeholder="e.g., Sunrise Senior Living"
                    selected={!!selectedOrg && selectedOrg.claimState !== "claimed"}
                  />
                )}
                {selectedOrg?.claimState === "claimed" && (
                  <p className="text-sm text-amber-600 font-medium flex items-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    This page has already been claimed
                  </p>
                )}
                {createNewSelected && formData.orgName.trim() && (
                  <p className="text-sm text-primary-600 font-medium flex items-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Creating new page for &quot;{formData.orgName.trim()}&quot;
                  </p>
                )}
              </div>

              {/* City, State - read-only only if prefilled from URL (provider details page) */}
              <div className="space-y-2">
                <label htmlFor="city" className="block text-base font-semibold text-gray-900">
                  City, State
                </label>
                {selectedOrg && !createNewSelected && isPrefilledFromUrl && selectedOrg.city && selectedOrg.state ? (
                  // Read-only display for claiming from provider details page
                  <div className="flex items-center gap-2 px-4 py-3 bg-primary-50/50 rounded-xl border-2 border-primary-500 text-gray-900">
                    <svg className="w-5 h-5 text-primary-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="flex-1 font-medium">{selectedOrg.city}, {selectedOrg.state}</span>
                    <svg className="w-5 h-5 text-primary-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                ) : (
                  // Editable city input
                  (() => {
                    const cityCompleted = !!(formData.city && formData.state);
                    return (
                      <div className="relative" ref={cityDropdownRef}>
                        <div className={`flex items-center px-4 py-3 rounded-xl border transition-colors ${
                          cityCompleted
                            ? "border-primary-300 bg-primary-50/30"
                            : showCityDropdown
                              ? "border-primary-400 ring-2 ring-primary-100 bg-gray-50"
                              : "border-gray-200 hover:border-gray-300 bg-gray-50"
                        }`}>
                          <svg className={`w-5 h-5 shrink-0 ${cityCompleted ? "text-primary-600" : "text-gray-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <input
                            ref={cityInputRef}
                            id="city"
                            type="text"
                            value={cityQuery}
                            onChange={(e) => {
                              setCityQuery(e.target.value);
                              setShowCityDropdown(true);
                              // Clear structured data if user is typing
                              if (formData.city || formData.state) {
                                setFormData(prev => ({ ...prev, city: "", state: "" }));
                              }
                            }}
                            onFocus={() => {
                              preloadCities();
                              setShowCityDropdown(true);
                            }}
                            placeholder="e.g., Austin, TX"
                            autoComplete="off"
                            className="w-full ml-3 bg-transparent border-none text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-0 text-base"
                            required
                          />
                          {/* Checkmark for completed state */}
                          {cityCompleted && (
                            <svg className="w-5 h-5 text-primary-600 shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>

                        {/* City Dropdown */}
                        {showCityDropdown && cityResults.length > 0 && (
                          <div className="absolute left-0 right-0 top-full mt-2 bg-white rounded-xl shadow-xl border border-gray-200 py-2 z-50 max-h-[280px] overflow-y-auto">
                            {!cityQuery.trim() && (
                              <div className="px-4 pt-1 pb-2">
                                <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Popular cities</span>
                              </div>
                            )}
                            {cityResults.map((city, idx) => (
                              <button
                                key={`${city.city}-${city.state}-${idx}`}
                                type="button"
                                onClick={() => handleCitySelect(city.city, city.state)}
                                className="flex items-center gap-3 w-full px-4 py-3 text-left text-base hover:bg-gray-50 transition-colors"
                              >
                                <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                <span>
                                  <span className="font-medium text-gray-700">{city.city}</span>
                                  <span className="text-gray-500">, {city.state}</span>
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()
                )}
              </div>

              {/* Email */}
              <div className="space-y-2">
                <label htmlFor="email" className="block text-base font-semibold text-gray-900">
                  Your business email
                </label>
                <div className={`flex items-center px-4 py-3 bg-gray-50 rounded-xl border transition-colors ${
                  emailAccountError || (emailValidation.error && !emailValidation.suggestion)
                    ? "border-red-300 focus-within:border-red-400 focus-within:ring-2 focus-within:ring-red-100"
                    : emailValidation.suggestion
                    ? "border-amber-300 focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-amber-100"
                    : "border-gray-200 hover:border-gray-300 focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-100"
                }`}>
                  <svg className={`w-5 h-5 shrink-0 ${
                    emailAccountError || (emailValidation.error && !emailValidation.suggestion)
                      ? "text-red-400"
                      : emailValidation.suggestion
                      ? "text-amber-500"
                      : "text-gray-400"
                  }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => {
                      setFormData(prev => ({ ...prev, email: e.target.value }));
                      // Clear validation errors on change
                      if (emailValidation.error || emailValidation.suggestion) {
                        setEmailValidation({ valid: true });
                      }
                      if (emailAccountError) {
                        setEmailAccountError(null);
                      }
                    }}
                    onBlur={handleEmailBlur}
                    placeholder="you@yourorganization.com"
                    autoComplete="email"
                    className="w-full ml-3 bg-transparent border-none text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-0 text-base"
                    required
                  />
                  {emailChecking && (
                    <div className="w-4 h-4 border-2 border-gray-300 border-t-primary-600 rounded-full animate-spin shrink-0" />
                  )}
                </div>

                {/* Email validation error */}
                {emailValidation.error && !emailValidation.suggestion && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-100 rounded-lg">
                    <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm text-red-700">{emailValidation.error}</p>
                  </div>
                )}

                {/* Email typo suggestion */}
                {emailValidation.suggestion && (
                  <div className="flex items-center justify-between gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-sm text-amber-800">{emailValidation.suggestion}</p>
                    </div>
                    <button
                      type="button"
                      onClick={applyEmailSuggestion}
                      className="text-sm font-medium text-amber-700 hover:text-amber-800 underline hover:no-underline whitespace-nowrap"
                    >
                      Use this
                    </button>
                  </div>
                )}

                {/* Account conflict error */}
                {emailAccountError && (
                  <div className="flex items-start gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg">
                    <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm text-red-700">{emailAccountError}</p>
                  </div>
                )}

                {/* Business email hint - only show if no errors */}
                {!emailValidation.error && !emailValidation.suggestion && !emailAccountError && (
                  <ReactiveHint show={!isBusinessEmail(formData.email) && formData.email.includes("@")}>
                    Using your business email (e.g., you@yourcompany.com) speeds up verification.
                  </ReactiveHint>
                )}

                {/* Warning: logged-in user with family/caregiver account using same email */}
                {!emailAccountError && user &&
                 formData.email.trim().toLowerCase() === user.email?.toLowerCase() &&
                 profiles?.length > 0 &&
                 !profiles.some(p => p.type === "organization") && (
                  <div className="flex items-start gap-2 mt-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                    <svg className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <p className="text-sm text-amber-800">
                      This email is linked to your personal account. Use a different email to claim a provider page, or <button type="button" onClick={() => openAuth({ defaultMode: "sign-in" })} className="font-medium underline hover:no-underline">sign in</button> with your organization&apos;s email.
                    </p>
                  </div>
                )}

                {/* Subtle dispute note for claimed listings */}
                {selectedOrg?.claimState === "claimed" && !emailValidation.error && !emailAccountError && (
                  <p className="text-xs text-gray-500 mt-1">
                    Are you the rightful owner? Login or{" "}
                    <button
                      type="button"
                      onClick={() => {
                        // Navigate to results screen with dispute option
                        if (selectedOrg) {
                          const disputeResult: SearchResult = selectedOrg.source === "olera-providers"
                            ? {
                                provider_id: selectedOrg.providerId || "",
                                provider_name: selectedOrg.name,
                                slug: selectedOrg.slug,
                                city: selectedOrg.city,
                                state: selectedOrg.state,
                                email: selectedOrg.email,
                                provider_images: selectedOrg.imageUrl || null,
                                _source: "olera-providers",
                                _claimed: true,
                                _emailMatch: false,
                              }
                            : {
                                id: selectedOrg.providerId || "",
                                display_name: selectedOrg.name,
                                slug: selectedOrg.slug,
                                city: selectedOrg.city,
                                state: selectedOrg.state,
                                email: selectedOrg.email,
                                image_url: selectedOrg.imageUrl || null,
                                account_id: null,
                                source_provider_id: null,
                                claim_state: "claimed",
                                _source: "business_profiles",
                                _claimed: true,
                                _emailMatch: false,
                              };
                          setDisputingResult(disputeResult);
                          setDisputeName("");
                          setDisputeEmail(formData.email);
                          setDisputePhone("");
                          setDisputeRole("");
                          setDisputeReason("");
                          setDisputeError("");
                          setDisputeSubmitted(false);
                          setScreen("dispute");
                        }
                      }}
                      className="text-primary-600 hover:text-primary-700 font-medium hover:underline"
                    >
                      Submit a dispute
                    </button>
                  </p>
                )}
              </div>

              {/* Error */}
              {searchError && (
                <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-100 rounded-xl">
                  <svg className="w-5 h-5 text-red-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                  </svg>
                  <p className="text-sm text-red-700">{searchError}</p>
                </div>
              )}

              {/* Claim sign-in mismatch error (can appear on search screen if user navigated here) */}
              {claimSignInMismatch && (
                <div className="px-4 py-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-amber-800">Wrong account</p>
                      <p className="text-sm text-amber-700 mt-1">
                        You&apos;re signed in as <span className="font-medium">{claimSignInMismatch.userEmail}</span>, but &quot;{claimSignInMismatch.listingName}&quot; was claimed with a different email. Please sign in with the correct email or search for the page and click &quot;Dispute&quot;.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setClaimSignInMismatch(null)}
                      className="shrink-0 p-1 text-amber-600 hover:text-amber-800 rounded transition-colors"
                      aria-label="Dismiss"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}

              {/* Submit button */}
              <button
                type="submit"
                disabled={searching || !isEmailValid}
                className="w-full py-3.5 bg-primary-600 text-white text-base font-semibold rounded-xl hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {searching && (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                Continue
              </button>
            </form>

          </div>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────
  // Screen 2: Search Results
  // ──────────────────────────────────────────────────────────

  // Helper to get provider image
  const getProviderImage = (result: SearchResult): string | null => {
    if (result._source === "business_profiles") {
      return result.image_url || null;
    }
    // olera-providers: images are pipe-separated
    const images = result.provider_images;
    if (!images) return null;
    const first = images.split("|")[0]?.trim();
    return first || null;
  };

  // Determine button action based on claim state
  // Simplified logic per plan: Unclaimed → Manage, Claimed → Dispute
  const getResultAction = (result: SearchResult): {
    label: string;
    variant: "primary" | "secondary" | "ghost";
    action: "manage" | "dispute";
  } => {
    if (result._claimed) {
      // Claimed by someone → Dispute flow
      return { label: "Dispute", variant: "ghost", action: "dispute" };
    }
    // Unclaimed → Manage flow (primary if email matches, secondary otherwise)
    if (result._emailMatch) {
      return { label: "Manage", variant: "primary", action: "manage" };
    }
    return { label: "Manage", variant: "secondary", action: "manage" };
  };

  // Handle result card action
  const handleResultAction = (result: SearchResult, action: "manage" | "dispute") => {
    const slug = result._source === "olera-providers"
      ? (result.slug || result.provider_id)
      : result.slug;

    setActionError("");

    if (action === "manage") {
      // Navigate to claim confirmation screen
      setSelectedResult(result);
      setScreen("confirm-claim");
    } else if (action === "dispute") {
      // Show inline dispute form instead of navigating away
      setDisputingResult(result);
      setDisputeName("");
      setDisputeEmail(formData.email); // Pre-fill with email from search form
      setDisputePhone("");
      setDisputeRole("");
      setDisputeReason("");
      setDisputeError("");
      setDisputeSubmitted(false);
      setScreen("dispute");
    }
  };

  // Handle "Create New Page" button - navigate to preview screen
  const handleCreateNew = () => {
    setSelectedResult(null); // Clear any selected result
    setActionError("");
    setScreen("preview");
  };

  // Handle preview form submission - triggers instant create
  const handlePreviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Validation and API call handled by handleInstantCreate
    await handleInstantCreate();
  };

  // Toggle care type selection
  const toggleCareType = (typeId: string) => {
    setFormData(prev => ({
      ...prev,
      careTypes: prev.careTypes.includes(typeId)
        ? prev.careTypes.filter(t => t !== typeId)
        : [...prev.careTypes, typeId],
    }));
  };

  // Handle dispute form submission
  const handleDisputeSubmit = async () => {
    if (!disputingResult) return;
    if (!disputeName.trim() || !disputeEmail.trim() || !disputeRole || !disputeReason.trim()) {
      setDisputeError("Please fill in all required fields.");
      return;
    }

    const slug = disputingResult._source === "olera-providers"
      ? (disputingResult.slug || disputingResult.provider_id)
      : disputingResult.slug;
    const name = disputingResult._source === "olera-providers"
      ? disputingResult.provider_name
      : disputingResult.display_name;

    setDisputeSubmitting(true);
    setDisputeError("");

    try {
      const res = await fetch("/api/disputes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider_id: slug,
          provider_name: name,
          claimant_name: disputeName.trim(),
          claimant_email: disputeEmail.trim().toLowerCase(),
          claimant_phone: disputePhone.trim() || null,
          claimant_role: disputeRole,
          reason: disputeReason.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDisputeError(data.error || "Failed to submit dispute.");
        return;
      }

      setDisputeSubmitted(true);
    } catch {
      setDisputeError("Something went wrong. Please try again.");
    } finally {
      setDisputeSubmitting(false);
    }
  };

  if (screen === "results") {
    // Separate email matches (priority) from other matches
    const emailMatches = searchResults.filter(r => r._emailMatch);
    const otherMatches = searchResults.filter(r => !r._emailMatch);

    return (
      <div className="min-h-screen flex flex-col bg-vanilla-100">
        {/* Minimal sticky nav */}
        <nav className="sticky top-0 z-50 border-b border-vanilla-200 bg-vanilla-100/95 backdrop-blur-sm">
          <div className="flex items-center justify-between max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <Link href="/" className="flex items-center space-x-2">
              <Image src="/images/olera-logo.png" alt="Olera" width={32} height={32} className="object-contain" />
              <span className="text-xl font-bold text-gray-900">Olera</span>
            </Link>
            <button
              onClick={handleExit}
              className="px-4 py-2 text-base font-medium text-gray-600 border border-gray-300 rounded-lg hover:border-gray-400 hover:text-gray-900 transition-colors bg-white"
            >
              Exit
            </button>
          </div>
        </nav>

        <div className="flex-1 px-4 py-8 md:py-12 pb-24">
          <div className="max-w-2xl mx-auto animate-fade-in">
            {/* Header */}
            <div className="text-center mb-8">
              <h1 className="text-2xl md:text-3xl font-display font-bold text-gray-900 tracking-tight">
                {searchResults.length === 0
                  ? "Create your page"
                  : selectedOrg && selectedOrg.claimState === "claimed"
                    ? "This page is claimed"
                    : "Select your organization"}
              </h1>
              <p className="text-gray-500 mt-2">
                {searchResults.length === 0
                  ? "Let's get your organization set up on Olera."
                  : selectedOrg && selectedOrg.claimState === "claimed"
                    ? "Choose how you'd like to proceed."
                    : `${searchResults.length} result${searchResults.length !== 1 ? "s" : ""} for "${formData.orgName}" near ${formData.city}, ${formData.state}`
                }
              </p>
            </div>

            {/* Action error display (for Manage failures) */}
            {actionError && searchResults.length > 0 && (
              <div className="mb-4 px-4 py-3 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3">
                <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                </svg>
                <p className="text-sm text-red-700">{actionError}</p>
              </div>
            )}

            {/* Claim sign-in email mismatch error */}
            {claimSignInMismatch && (
              <div className="mb-4 px-4 py-4 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-amber-800">
                      Wrong account
                    </p>
                    <p className="text-sm text-amber-700 mt-1">
                      You&apos;re signed in as <span className="font-medium">{claimSignInMismatch.userEmail}</span>, but &quot;{claimSignInMismatch.listingName}&quot; was claimed with a different email.
                    </p>
                    <p className="text-sm text-amber-700 mt-2">
                      {(() => {
                        const claimedResult = searchResults.find(r => r._claimed);
                        if (claimedResult) {
                          return (
                            <>
                              Please sign in with the email you used to claim this page, or{" "}
                              <button
                                type="button"
                                onClick={() => {
                                  setClaimSignInMismatch(null);
                                  handleResultAction(claimedResult, "dispute");
                                }}
                                className="font-medium underline hover:no-underline"
                              >
                                file a dispute
                              </button>{" "}
                              if you believe you should have access.
                            </>
                          );
                        }
                        // No search results available (page was refreshed) - give generic guidance
                        return "Please sign in with the email you used to claim this page, or search for it again and click \"Dispute\" if you believe you should have access.";
                      })()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setClaimSignInMismatch(null)}
                    className="shrink-0 p-1 text-amber-600 hover:text-amber-800 rounded transition-colors"
                    aria-label="Dismiss"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {/* Results List */}
            <div className="space-y-4">
              {searchResults.length === 0 ? (
                /* No results - Create new CTA */
                <div className="text-center py-12 bg-white rounded-2xl shadow-sm border border-gray-200">
                  <div className="w-16 h-16 rounded-2xl bg-primary-100 flex items-center justify-center mx-auto mb-5">
                    <svg className="w-8 h-8 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">No results found</h3>
                  <p className="text-gray-500 mb-6 max-w-sm mx-auto">
                    We don&apos;t have a page for your organization yet. Create one to start connecting with families.
                  </p>
                  {actionError && (
                    <p className="text-sm text-red-600 mb-4">{actionError}</p>
                  )}
                  <Button
                    size="lg"
                    onClick={handleCreateNew}
                    loading={actionLoading === "create-new"}
                  >
                    Create Your Page
                  </Button>
                </div>
              ) : (
                <>
                  {/* Email matches section (if any) */}
                  {emailMatches.length > 0 && (
                    <div className="mb-6">
                      <p className="text-sm font-medium text-primary-700 mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Matched by email
                      </p>
                      <div className="space-y-3">
                        {emailMatches.map((result) => {
                          // Defensive: ensure all rendered values are strings to prevent React Error #310
                          const name = String(result._source === "olera-providers" ? result.provider_name : result.display_name || "");
                          const location = [result.city, result.state].filter(Boolean).map(String).join(", ");
                          const slug = String(result._source === "olera-providers" ? (result.slug || result.provider_id) : result.slug || "");
                          const image = getProviderImage(result);
                          const { label, variant, action } = getResultAction(result);
                          const isLoading = actionLoading === slug;

                          return (
                            <div
                              key={slug}
                              className="bg-white rounded-xl overflow-hidden border-2 border-primary-200 ring-2 ring-primary-50 hover:shadow-md transition-all duration-200"
                            >
                              <div className="flex">
                                {/* Image - horizontal layout matching old page */}
                                <div className="w-28 sm:w-36 min-h-[100px] sm:min-h-[130px] shrink-0 bg-gradient-to-br from-primary-50 via-gray-50 to-warm-50 relative">
                                  {image ? (
                                    <Image
                                      src={image}
                                      alt={name}
                                      fill
                                      className="object-cover"
                                      sizes="144px"
                                    />
                                  ) : (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/80 flex items-center justify-center shadow-sm">
                                        <span className="text-base sm:text-lg font-bold text-primary-400">
                                          {(name || "")
                                            .split(/\s+/)
                                            .map((w) => w[0])
                                            .filter(Boolean)
                                            .slice(0, 2)
                                            .join("")
                                            .toUpperCase()}
                                        </span>
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* Content */}
                                <div className="flex-1 p-3 sm:p-4 min-w-0 flex flex-col">
                                  {location && (
                                    <p className="text-xs sm:text-sm text-gray-500 mb-0.5">{location}</p>
                                  )}
                                  <h3 className="text-base sm:text-lg font-bold text-gray-900 leading-snug line-clamp-1">
                                    {name}
                                  </h3>
                                  <p className="text-xs sm:text-sm text-gray-500 mt-1">
                                    {result._claimed ? "This page is claimed." : "Verify to claim."}
                                  </p>
                                  <div className="flex-1 min-h-2" />
                                  <div className="flex justify-end gap-2">
                                    {result._claimed ? (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => handleResultAction(result, "dispute")}
                                          disabled={isLoading}
                                          className="px-3 py-1.5 text-sm font-semibold rounded-lg transition-all text-amber-600 ring-1 ring-amber-200 hover:ring-amber-300 hover:bg-amber-50 disabled:opacity-50"
                                        >
                                          Dispute
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleClaimSignIn(result)}
                                          className="px-3 py-1.5 text-sm font-semibold rounded-lg transition-all text-primary-600 ring-1 ring-primary-200 hover:ring-primary-300 hover:bg-primary-50"
                                        >
                                          Sign in
                                        </button>
                                      </>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => handleResultAction(result, action)}
                                        disabled={isLoading}
                                        className={`px-3 py-1.5 text-sm font-semibold rounded-lg transition-all ${
                                          variant === "primary"
                                            ? "text-white bg-primary-600 hover:bg-primary-500"
                                            : "text-primary-600 ring-1 ring-primary-200 hover:ring-primary-300 hover:bg-primary-50"
                                        } disabled:opacity-50`}
                                      >
                                        {isLoading ? "..." : `${label} →`}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Other matches section */}
                  {otherMatches.length > 0 && (
                    <div>
                      {emailMatches.length > 0 && (
                        <p className="text-sm font-medium text-gray-500 mb-3">Other matches</p>
                      )}
                      <div className="space-y-3">
                        {otherMatches.map((result) => {
                          // Defensive: ensure all rendered values are strings to prevent React Error #310
                          const name = String(result._source === "olera-providers" ? result.provider_name : result.display_name || "");
                          const location = [result.city, result.state].filter(Boolean).map(String).join(", ");
                          const slug = String(result._source === "olera-providers" ? (result.slug || result.provider_id) : result.slug || "");
                          const image = getProviderImage(result);
                          const { label, variant, action } = getResultAction(result);
                          const isLoading = actionLoading === slug;

                          return (
                            <div
                              key={slug}
                              className="bg-white rounded-xl overflow-hidden border border-gray-200 hover:shadow-md hover:border-gray-300 transition-all duration-200"
                            >
                              <div className="flex">
                                {/* Image - horizontal layout matching old page */}
                                <div className="w-28 sm:w-36 min-h-[100px] sm:min-h-[130px] shrink-0 bg-gradient-to-br from-primary-50 via-gray-50 to-warm-50 relative">
                                  {image ? (
                                    <Image
                                      src={image}
                                      alt={name}
                                      fill
                                      className="object-cover"
                                      sizes="144px"
                                    />
                                  ) : (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/80 flex items-center justify-center shadow-sm">
                                        <span className="text-base sm:text-lg font-bold text-primary-400">
                                          {(name || "")
                                            .split(/\s+/)
                                            .map((w) => w[0])
                                            .filter(Boolean)
                                            .slice(0, 2)
                                            .join("")
                                            .toUpperCase()}
                                        </span>
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* Content */}
                                <div className="flex-1 p-3 sm:p-4 min-w-0 flex flex-col">
                                  {location && (
                                    <p className="text-xs sm:text-sm text-gray-500 mb-0.5">{location}</p>
                                  )}
                                  <h3 className="text-base sm:text-lg font-bold text-gray-900 leading-snug line-clamp-1">
                                    {name}
                                  </h3>
                                  <p className="text-xs sm:text-sm text-gray-500 mt-1">
                                    {result._claimed ? "This page is claimed." : "Unclaimed page."}
                                  </p>
                                  <div className="flex-1 min-h-2" />
                                  <div className="flex justify-end gap-2">
                                    {result._claimed ? (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => handleResultAction(result, "dispute")}
                                          disabled={isLoading}
                                          className="px-3 py-1.5 text-sm font-semibold rounded-lg transition-all text-amber-600 ring-1 ring-amber-200 hover:ring-amber-300 hover:bg-amber-50 disabled:opacity-50"
                                        >
                                          Dispute
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleClaimSignIn(result)}
                                          className="px-3 py-1.5 text-sm font-semibold rounded-lg transition-all text-primary-600 ring-1 ring-primary-200 hover:ring-primary-300 hover:bg-primary-50"
                                        >
                                          Sign in
                                        </button>
                                      </>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => handleResultAction(result, action)}
                                        disabled={isLoading}
                                        className="px-3 py-1.5 text-sm font-semibold rounded-lg transition-all text-primary-600 ring-1 ring-primary-200 hover:ring-primary-300 hover:bg-primary-50 disabled:opacity-50"
                                      >
                                        {isLoading ? "..." : `${label} →`}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Create new option */}
                  <div className="mt-6 pt-6 border-t border-gray-200">
                    <div className="bg-white/60 rounded-xl border-2 border-dashed border-gray-300 p-6 text-center hover:border-gray-400 hover:bg-white/80 transition-all">
                      <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                        <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                      </div>
                      <h4 className="font-semibold text-gray-900 mb-1">Don&apos;t see your organization?</h4>
                      <p className="text-sm text-gray-500 mb-4">Create a new page to get started on Olera</p>
                      <Button
                        variant="secondary"
                        onClick={handleCreateNew}
                        loading={actionLoading === "create-new"}
                      >
                        Create New Page
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Nav */}
        <OnboardingBottomNav
          back={{
            label: "Back",
            onClick: () => {
              setActionError("");
              setScreen("search");
            },
          }}
        />
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────
  // Screen 2.5: Preview / Complete Your Profile
  // ──────────────────────────────────────────────────────────

  if (screen === "preview") {
    return (
      <div className="min-h-screen flex flex-col bg-vanilla-100">
        {/* Minimal sticky nav */}
        <nav className="sticky top-0 z-50 border-b border-vanilla-200 bg-vanilla-100/95 backdrop-blur-sm">
          <div className="flex items-center justify-between max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <Link href="/" className="flex items-center space-x-2">
              <Image src="/images/olera-logo.png" alt="Olera" width={32} height={32} className="object-contain" />
              <span className="text-xl font-bold text-gray-900">Olera</span>
            </Link>
            <button
              onClick={handleExit}
              className="px-4 py-2 text-base font-medium text-gray-600 border border-gray-300 rounded-lg hover:border-gray-400 hover:text-gray-900 transition-colors"
            >
              Exit
            </button>
          </div>
        </nav>

        <div className="flex-1 flex items-center justify-center px-4 py-8 md:py-12 pb-24 md:pb-12">
          <div className="w-full max-w-xl animate-fade-in">
            {/* Header */}
            <div className="text-center mb-6">
              <h1 className="text-2xl md:text-3xl font-display font-bold text-gray-900 tracking-tight">
                Create your page
              </h1>
              <p className="text-gray-500 mt-1.5">
                Add your details to start connecting with families.
              </p>
            </div>

            {/* Preview Form */}
            <form id="preview-form" onSubmit={handlePreviewSubmit} className="bg-white rounded-2xl border border-gray-200 p-6 md:p-8 space-y-5">
              {/* Organization Name */}
              <div className="space-y-2">
                <label htmlFor="previewOrgName" className="block text-base font-semibold text-gray-900">
                  Organization name
                </label>
                <input
                  id="previewOrgName"
                  type="text"
                  value={formData.orgName}
                  onChange={(e) => setFormData(prev => ({ ...prev, orgName: e.target.value }))}
                  className="w-full px-4 py-3 bg-gray-50 rounded-xl border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 transition-colors"
                  required
                />
              </div>

              {/* Location - always editable */}
              <div className="space-y-2">
                <label className="block text-base font-semibold text-gray-900">
                  Location
                </label>
                <div className="relative" ref={cityDropdownRef}>
                  <div className={`flex items-center px-4 py-3 rounded-xl border transition-colors ${
                    showCityDropdown
                      ? "border-primary-400 ring-2 ring-primary-100 bg-gray-50"
                      : formData.city && formData.state
                        ? "border-primary-300 bg-primary-50/30"
                        : "border-gray-200 hover:border-gray-300 bg-gray-50"
                  }`}>
                    <svg className={`w-5 h-5 shrink-0 ${formData.city && formData.state ? "text-primary-600" : "text-gray-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <input
                      ref={cityInputRef}
                      type="text"
                      value={cityQuery}
                      onChange={(e) => {
                        setCityQuery(e.target.value);
                        setShowCityDropdown(true);
                        if (formData.city || formData.state) {
                          setFormData(prev => ({ ...prev, city: "", state: "" }));
                        }
                      }}
                      onFocus={() => {
                        preloadCities();
                        setShowCityDropdown(true);
                      }}
                      placeholder="e.g., Austin, TX"
                      autoComplete="off"
                      className="w-full ml-3 bg-transparent border-none text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-0 text-base"
                      required
                    />
                    {formData.city && formData.state && (
                      <svg className="w-5 h-5 text-primary-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>

                  {/* City Dropdown */}
                  {showCityDropdown && cityResults.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-2 bg-white rounded-xl shadow-xl border border-gray-200 py-2 z-50 max-h-[280px] overflow-y-auto">
                      {!cityQuery.trim() && (
                        <div className="px-4 pt-1 pb-2">
                          <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Popular cities</span>
                        </div>
                      )}
                      {cityResults.map((city, idx) => (
                        <button
                          key={`preview-${city.city}-${city.state}-${idx}`}
                          type="button"
                          onClick={() => handleCitySelect(city.city, city.state)}
                          className="flex items-center gap-3 w-full px-4 py-3 text-left text-base hover:bg-gray-50 transition-colors"
                        >
                          <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <span>
                            <span className="font-medium text-gray-700">{city.city}</span>
                            <span className="text-gray-500">, {city.state}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Email - always editable */}
              <div className="space-y-2">
                <label className="block text-base font-semibold text-gray-900">
                  Business email
                </label>
                <div className={`flex items-center px-4 py-3 rounded-xl border transition-colors ${
                  emailAccountError || (emailValidation.error && !emailValidation.suggestion)
                    ? "border-red-300 bg-red-50/30 focus-within:border-red-400 focus-within:ring-2 focus-within:ring-red-100"
                    : emailValidation.suggestion
                    ? "border-amber-300 bg-amber-50/30 focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-amber-100"
                    : formData.email && formData.email.includes("@") && !emailChecking
                    ? "border-primary-300 bg-primary-50/30"
                    : "border-gray-200 hover:border-gray-300 bg-gray-50"
                } focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-100`}>
                  <svg className={`w-5 h-5 shrink-0 ${
                    emailAccountError || (emailValidation.error && !emailValidation.suggestion)
                      ? "text-red-500"
                      : emailValidation.suggestion
                      ? "text-amber-500"
                      : formData.email && formData.email.includes("@")
                      ? "text-primary-600"
                      : "text-gray-400"
                  }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => {
                      setFormData(prev => ({ ...prev, email: e.target.value }));
                      if (emailValidation.error || emailValidation.suggestion) {
                        setEmailValidation({ valid: true });
                      }
                      if (emailAccountError) {
                        setEmailAccountError(null);
                      }
                    }}
                    onBlur={handleEmailBlur}
                    placeholder="you@yourorganization.com"
                    autoComplete="email"
                    className="w-full ml-3 bg-transparent border-none text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-0 text-base"
                    required
                  />
                  {emailChecking ? (
                    <div className="w-5 h-5 border-2 border-gray-300 border-t-primary-600 rounded-full animate-spin shrink-0" />
                  ) : isEmailValid && formData.email.includes("@") ? (
                    <svg className="w-5 h-5 text-primary-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : null}
                </div>

                {/* Email validation error */}
                {emailValidation.error && !emailValidation.suggestion && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-100 rounded-lg">
                    <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm text-red-700">{emailValidation.error}</p>
                  </div>
                )}

                {/* Email typo suggestion */}
                {emailValidation.suggestion && (
                  <div className="flex items-center justify-between gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-sm text-amber-800">{emailValidation.suggestion}</p>
                    </div>
                    <button
                      type="button"
                      onClick={applyEmailSuggestion}
                      className="text-sm font-medium text-amber-700 hover:text-amber-800 underline hover:no-underline whitespace-nowrap"
                    >
                      Use this
                    </button>
                  </div>
                )}

                {/* Account conflict error */}
                {emailAccountError && (
                  <div className="flex items-start gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg">
                    <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm text-red-700">{emailAccountError}</p>
                  </div>
                )}
              </div>

              {/* Care Types (multi-select) */}
              <div className="space-y-2">
                  <label className="block text-base font-semibold text-gray-900">
                    Services <span className="text-gray-400 font-normal">(select all that apply)</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {CARE_TYPE_OPTIONS.map((type) => {
                      const isSelected = formData.careTypes.includes(type.id);
                      return (
                        <button
                          key={type.id}
                          type="button"
                          onClick={() => toggleCareType(type.id)}
                          className={`px-3.5 py-2 rounded-xl text-sm font-medium border transition-all duration-200 ${
                            isSelected
                              ? "bg-primary-50 border-primary-300 text-primary-700"
                              : "bg-white border-warm-100 text-gray-900 hover:border-warm-200"
                          }`}
                        >
                          {type.label}
                        </button>
                      );
                    })}
                  </div>
              </div>

              {/* Consumer email warning - only show if no errors */}
              {!emailValidation.error && !emailValidation.suggestion && !emailAccountError && (
                <ReactiveHint show={!isBusinessEmail(formData.email) && formData.email.includes("@")}>
                  Using your business email speeds up verification.
                </ReactiveHint>
              )}

              {/* Error */}
              {actionError && (
                <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-100 rounded-xl">
                  <svg className="w-5 h-5 text-red-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                  </svg>
                  <p className="text-sm text-red-700">{actionError}</p>
                </div>
              )}

              {/* Action buttons - Desktop only (inline) */}
              <div className="hidden md:flex flex-col gap-3 pt-4">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      setActionError("");
                      setScreen(createNewSelected ? "search" : "results");
                    }}
                    className="text-base font-medium text-gray-500 hover:text-gray-700 transition-colors py-2"
                  >
                    ← Back
                  </button>
                  <button
                    type="button"
                    onClick={handleInstantCreate}
                    disabled={
                      actionLoading === "instant-create" ||
                      !formData.orgName.trim() ||
                      !formData.city.trim() ||
                      !formData.state.trim() ||
                      !isEmailValid ||
                      formData.careTypes.length === 0
                    }
                    className="px-6 py-3 bg-primary-600 text-white text-base font-semibold rounded-xl hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  >
                    {actionLoading === "instant-create" ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Creating...
                      </>
                    ) : (
                      "Create page"
                    )}
                  </button>
                </div>
                <p className="text-center text-xs text-gray-500">
                  By creating this page, you confirm you're authorized to manage this business and agree to our{" "}
                  <Link href="/terms" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">
                    Terms
                  </Link>.
                </p>
              </div>
            </form>
          </div>
        </div>

        {/* Mobile sticky bottom nav */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-vanilla-100 border-t border-vanilla-200 px-4 py-3 safe-area-inset-bottom">
          <p className="text-center text-xs text-gray-500 mb-3">
            By creating this page, you confirm you're authorized to manage this business and agree to our{" "}
            <Link href="/terms" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">
              Terms
            </Link>.
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setActionError("");
                setScreen(createNewSelected ? "search" : "results");
              }}
              className="px-4 py-3 text-base font-medium text-gray-600 border border-gray-300 rounded-xl hover:border-gray-400 hover:text-gray-900 transition-colors"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleInstantCreate}
              disabled={
                actionLoading === "instant-create" ||
                !formData.orgName.trim() ||
                !formData.city.trim() ||
                !formData.state.trim() ||
                !isEmailValid ||
                formData.careTypes.length === 0
              }
              className="flex-1 py-3 bg-primary-600 text-white text-base font-semibold rounded-xl hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {actionLoading === "instant-create" ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating...
                </>
              ) : (
                "Create page"
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────
  // Screen 2.75: Confirm Claim (for "Manage" flow)
  // ──────────────────────────────────────────────────────────

  if (screen === "confirm-claim" && selectedResult) {
    // Defensive: ensure all rendered values are strings to prevent React Error #310
    const providerName = String(selectedResult._source === "olera-providers"
      ? selectedResult.provider_name
      : selectedResult.display_name || "");
    const location = [selectedResult.city, selectedResult.state].filter(Boolean).map(String).join(", ");
    const providerImage = selectedResult._source === "olera-providers"
      ? selectedResult.provider_images?.split("|")[0]?.trim() || null
      : selectedResult.image_url;

    // Email to send OTP to
    const userEmail = formData.email;

    return (
      <div className="min-h-screen flex flex-col bg-vanilla-100">
        {/* Minimal sticky nav */}
        <nav className="sticky top-0 z-50 border-b border-vanilla-200 bg-vanilla-100/95 backdrop-blur-sm">
          <div className="flex items-center justify-between max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <Link href="/" className="flex items-center space-x-2">
              <Image src="/images/olera-logo.png" alt="Olera" width={32} height={32} className="object-contain" />
              <span className="text-xl font-bold text-gray-900">Olera</span>
            </Link>
            <button
              onClick={handleExit}
              className="px-4 py-2 text-base font-medium text-gray-600 border border-gray-300 rounded-lg hover:border-gray-400 hover:text-gray-900 transition-colors"
            >
              Exit
            </button>
          </div>
        </nav>

        <div className="flex-1 flex items-center justify-center px-4 py-8 md:py-12">
          <div className="max-w-lg w-full animate-fade-in">
            {/* Provider Card Preview */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              {/* Provider header */}
              <div className="flex items-center gap-4 p-5 border-b border-gray-100">
                <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-primary-50 via-gray-50 to-warm-50 relative shrink-0 overflow-hidden">
                  {providerImage ? (
                    <Image
                      src={providerImage}
                      alt={providerName}
                      fill
                      className="object-cover"
                      sizes="64px"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-lg font-bold text-primary-400">
                        {(providerName || "")
                          .split(/\s+/)
                          .map((w) => w[0])
                          .filter(Boolean)
                          .slice(0, 2)
                          .join("")
                          .toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-gray-900 truncate">{providerName}</h2>
                  {location && <p className="text-sm text-gray-500">{location}</p>}
                </div>
              </div>

              {/* Claim verification */}
              <div className="p-5 space-y-4">
                {/* Heading */}
                <div className="text-center">
                  <h3 className="text-xl font-display font-bold text-gray-900 tracking-tight">Claim this page</h3>
                  <p className="text-gray-500 mt-1.5">
                    Claiming as <span className="font-semibold text-gray-700">{userEmail}</span>
                  </p>
                </div>

                {/* Consumer email warning */}
                <ReactiveHint show={!isBusinessEmail(userEmail) && userEmail.includes("@")}>
                  Using your business email speeds up verification.
                </ReactiveHint>

                {/* Error */}
                {actionError && (
                  <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-100 rounded-xl">
                    <svg className="w-5 h-5 text-red-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                    </svg>
                    <p className="text-sm text-red-700">{actionError}</p>
                  </div>
                )}

                {/* Buttons */}
                <div className="flex flex-col gap-3">
                  <Button
                    onClick={handleInstantClaim}
                    disabled={actionLoading === "instant-claim"}
                    loading={actionLoading === "instant-claim"}
                    className="w-full"
                  >
                    Claim this page
                  </Button>
                  <button
                    type="button"
                    onClick={() => {
                      setActionError("");
                      // For pre-selected unclaimed orgs, go back to search (they skipped results)
                      setScreen(selectedOrg && selectedOrg.claimState !== "claimed" ? "search" : "results");
                    }}
                    className="text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors py-2"
                  >
                    Back
                  </button>
                </div>

                <p className="text-center text-xs text-gray-500">
                  By claiming this page, you confirm you're authorized to manage this business and agree to our{" "}
                  <Link href="/terms" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">
                    Terms
                  </Link>.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────
  // Screen: Dispute (inline dispute form with amber styling)
  // ──────────────────────────────────────────────────────────

  if (screen === "dispute" && disputingResult) {
    // Defensive: ensure all rendered values are strings to prevent React Error #310
    const disputeProviderName = String(disputingResult._source === "olera-providers"
      ? disputingResult.provider_name
      : disputingResult.display_name || "");

    // Success state after dispute submission
    if (disputeSubmitted) {
      return (
        <div className="min-h-screen flex flex-col bg-[#FAFAF8]">
          <nav className="sticky top-0 z-20 bg-[#FAFAF8] border-b border-gray-200/60">
            <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
              <Link href="/" className="flex items-center gap-2">
                <Image src="/images/olera-logo.png" alt="Olera" width={28} height={28} />
                <span className="font-bold text-gray-900">Olera</span>
              </Link>
              <button
                onClick={handleExit}
                className="text-sm font-medium text-gray-500 hover:text-gray-700"
              >
                Exit
              </button>
            </div>
          </nav>

          <div className="flex-1 flex items-center justify-center px-4 py-12">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-100 to-primary-50 flex items-center justify-center mx-auto mb-4 shadow-sm">
                <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-display font-bold text-gray-900 tracking-tight">Dispute submitted</h2>
              <p className="text-gray-500 mt-2">
                We&apos;ll review and respond within 2–3 business days.
              </p>
            </div>
          </div>

          {/* Bottom Nav */}
          <OnboardingBottomNav
            back={{
              label: "Back to results",
              onClick: () => setScreen("results"),
            }}
          />
        </div>
      );
    }

    // Dispute form
    return (
      <div className="min-h-screen flex flex-col bg-[#FAFAF8]">
        <nav className="sticky top-0 z-20 bg-[#FAFAF8] border-b border-gray-200/60">
          <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <Image src="/images/olera-logo.png" alt="Olera" width={28} height={28} />
              <span className="font-bold text-gray-900">Olera</span>
            </Link>
            <button
              onClick={handleExit}
              className="text-sm font-medium text-gray-500 hover:text-gray-700"
            >
              Exit
            </button>
          </div>
        </nav>

        <div className="flex-1 px-4 py-8 md:py-12 pb-24">
          <div className="max-w-xl mx-auto">
            {/* Clean dispute card */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 md:p-8">
              {/* Header */}
              <div className="text-center mb-6">
                <h2 className="text-xl font-display font-bold text-gray-900 tracking-tight">
                  Dispute this page
                </h2>
                <p className="text-gray-500 mt-2">
                  Tell us why you should manage <strong className="text-gray-700">{disputeProviderName}</strong>.
                </p>
              </div>

              {/* Form fields */}
              <div className="space-y-4">
                {/* Full name - full width */}
                <div className="space-y-1.5">
                  <label htmlFor="dispute-name" className="block text-[13px] font-semibold text-gray-700">
                    Full name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="dispute-name"
                    type="text"
                    value={disputeName}
                    onChange={(e) => setDisputeName(e.target.value)}
                    placeholder="Your full name"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50/50 text-[15px] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400 focus:bg-white transition-all min-h-[48px]"
                  />
                </div>

                {/* Email + Phone - side by side on desktop */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="dispute-email" className="block text-[13px] font-semibold text-gray-700">
                      Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="dispute-email"
                      type="email"
                      value={disputeEmail}
                      onChange={(e) => setDisputeEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50/50 text-[15px] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400 focus:bg-white transition-all min-h-[48px]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="dispute-phone" className="block text-[13px] font-semibold text-gray-700">
                      Phone <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <input
                      id="dispute-phone"
                      type="tel"
                      value={disputePhone}
                      onChange={(e) => setDisputePhone(e.target.value)}
                      placeholder="(555) 123-4567"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50/50 text-[15px] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400 focus:bg-white transition-all min-h-[48px]"
                    />
                  </div>
                </div>

                {/* Role dropdown - full width */}
                <div className="space-y-1.5">
                  <label htmlFor="dispute-role" className="block text-[13px] font-semibold text-gray-700">
                    Your role <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="dispute-role"
                    value={disputeRole}
                    onChange={(e) => setDisputeRole(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50/50 text-[15px] focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400 focus:bg-white transition-all min-h-[48px] appearance-none cursor-pointer"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.75rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.25em 1.25em', paddingRight: '2.5rem' }}
                  >
                    <option value="">Select your role...</option>
                    {DISPUTE_ROLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                {/* Reason - full width */}
                <div className="space-y-1.5">
                  <label htmlFor="dispute-reason" className="block text-[13px] font-semibold text-gray-700">
                    Why should you manage this page? <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    id="dispute-reason"
                    value={disputeReason}
                    onChange={(e) => setDisputeReason(e.target.value)}
                    placeholder="Explain your connection to this organization..."
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50/50 text-[15px] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400 focus:bg-white transition-all resize-none"
                  />
                </div>

                {/* Error */}
                {disputeError && (
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-100 rounded-lg">
                    <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                    </svg>
                    <p className="text-sm text-red-700">{disputeError}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Nav */}
        <OnboardingBottomNav
          back={{
            label: "Back",
            onClick: () => {
              setDisputeError("");
              setScreen("results");
            },
          }}
          primary={{
            label: "Submit Dispute",
            onClick: handleDisputeSubmit,
            loading: disputeSubmitting,
            disabled: !disputeName.trim() || !disputeEmail.trim() || !disputeRole || !disputeReason.trim(),
          }}
        />
      </div>
    );
  }

  return null;
}
