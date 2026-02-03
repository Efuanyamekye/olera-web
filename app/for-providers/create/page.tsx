"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { getDeferredAction, clearDeferredAction } from "@/lib/deferred-action";
import type { ProfileType, ProfileCategory } from "@/lib/types";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";

const FORM_STORAGE_KEY = "olera_create_profile_form";

const CARE_TYPES = [
  "Assisted Living",
  "Memory Care",
  "Independent Living",
  "Skilled Nursing",
  "Home Care",
  "Home Health",
  "Hospice",
  "Respite Care",
  "Adult Day Care",
  "Rehabilitation",
];

const ORG_CATEGORIES: { value: ProfileCategory; label: string }[] = [
  { value: "assisted_living", label: "Assisted Living Facility" },
  { value: "memory_care", label: "Memory Care Facility" },
  { value: "independent_living", label: "Independent Living Community" },
  { value: "nursing_home", label: "Nursing Home / Skilled Nursing" },
  { value: "home_care_agency", label: "Home Care Agency" },
  { value: "home_health_agency", label: "Home Health Agency" },
  { value: "hospice_agency", label: "Hospice Agency" },
  { value: "adult_day_care", label: "Adult Day Care Center" },
  { value: "rehab_facility", label: "Rehabilitation Facility" },
  { value: "wellness_center", label: "Wellness Center" },
  { value: "inpatient_hospice", label: "Inpatient Hospice" },
];

type ProviderKind = "organization" | "caregiver";

function generateSlug(name: string, city: string, state: string): string {
  const base = `${name} ${city} ${state}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const suffix = Math.random().toString(36).substring(2, 6);
  return `${base}-${suffix}`;
}

interface FormData {
  kind: ProviderKind | null;
  name: string;
  category: ProfileCategory | "";
  city: string;
  state: string;
  zip: string;
  careTypes: string[];
  description: string;
  phone: string;
}

function saveFormToStorage(data: FormData) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(data));
}

function loadFormFromStorage(): FormData | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(FORM_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearFormStorage() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(FORM_STORAGE_KEY);
}

export default function CreateProfilePage() {
  const router = useRouter();
  const { user, account, openAuthModal, refreshAccountData } = useAuth();

  const [kind, setKind] = useState<ProviderKind | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ProfileCategory | "">("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [careTypes, setCareTypes] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const autoSubmitTriggered = useRef(false);

  // Restore form data from sessionStorage on mount (after returning from auth)
  useEffect(() => {
    const saved = loadFormFromStorage();
    if (saved) {
      setKind(saved.kind);
      setName(saved.name);
      setCategory(saved.category);
      setCity(saved.city);
      setState(saved.state);
      setZip(saved.zip);
      setCareTypes(saved.careTypes);
      setDescription(saved.description);
      setPhone(saved.phone);
    }
  }, []);

  const toggleCareType = (ct: string) => {
    setCareTypes((prev) =>
      prev.includes(ct) ? prev.filter((t) => t !== ct) : [...prev, ct]
    );
  };

  const executeCreate = useCallback(async (
    formData: FormData,
    createAccount: NonNullable<typeof account>
  ) => {
    if (!formData.kind || !formData.name.trim() || !formData.city.trim() || !formData.state.trim()) return;
    if (!isSupabaseConfigured()) return;

    setSubmitting(true);
    setError("");

    try {
      const supabase = createClient();
      const profileType: ProfileType = formData.kind;
      const slug = generateSlug(formData.name, formData.city, formData.state);

      const { data: newProfile, error: insertError } = await supabase
        .from("profiles")
        .insert({
          account_id: createAccount.id,
          slug,
          type: profileType,
          category: formData.kind === "organization" ? formData.category || null : "private_caregiver",
          display_name: formData.name.trim(),
          description: formData.description.trim() || null,
          phone: formData.phone.trim() || null,
          city: formData.city.trim(),
          state: formData.state.trim(),
          zip: formData.zip.trim() || null,
          care_types: formData.careTypes,
          claim_state: "claimed",
          verification_state: "unverified",
          source: "user_created",
          metadata: {},
        })
        .select("id")
        .single();

      if (insertError) throw new Error(insertError.message);

      // Set as active profile
      const { error: accountError } = await supabase
        .from("accounts")
        .update({
          active_profile_id: newProfile.id,
          onboarding_completed: true,
        })
        .eq("id", createAccount.id);

      if (accountError) throw new Error(accountError.message);

      // Create trial membership if none exists
      const { data: existingMembership } = await supabase
        .from("memberships")
        .select("id")
        .eq("account_id", createAccount.id)
        .single();

      if (!existingMembership) {
        await supabase.from("memberships").insert({
          account_id: createAccount.id,
          plan: "free",
          status: "free",
        });
      }

      clearFormStorage();
      await refreshAccountData();
      router.push("/portal");
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : String(err);
      console.error("Create profile error:", message);
      setError(`Something went wrong: ${message}`);
      setSubmitting(false);
    }
  }, [refreshAccountData, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const formData: FormData = { kind, name, category, city, state, zip, careTypes, description, phone };

    if (!user) {
      // Save form data so it persists across the auth redirect
      saveFormToStorage(formData);
      openAuthModal({
        action: "create_profile",
        returnUrl: "/for-providers/create",
      }, "sign-up");
      return;
    }

    if (!account) return;
    executeCreate(formData, account);
  };

  // Auto-submit: if user returns from auth with saved form data,
  // submit automatically instead of making them click again
  useEffect(() => {
    if (autoSubmitTriggered.current) return;
    if (!user || !account) return;

    const deferred = getDeferredAction();
    const saved = loadFormFromStorage();
    if (deferred?.action === "create_profile" && saved?.kind && saved?.name) {
      autoSubmitTriggered.current = true;
      clearDeferredAction();
      executeCreate(saved, account);
    }
  }, [user, account, executeCreate]);

  // Step 1: Pick org vs caregiver
  if (!kind) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
        <Link
          href="/for-providers"
          className="text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1 mb-8"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to For Providers
        </Link>

        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
          Create Your Profile
        </h1>
        <p className="text-lg text-gray-600 mb-8">
          What type of provider are you?
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => setKind("organization")}
            className="text-left p-6 rounded-xl border-2 border-gray-200 bg-white hover:border-primary-300 hover:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
          >
            <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Organization</h3>
            <p className="text-gray-600">
              Facility, agency, or care community with staff and operations.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setKind("caregiver")}
            className="text-left p-6 rounded-xl border-2 border-gray-200 bg-white hover:border-primary-300 hover:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
          >
            <div className="w-12 h-12 bg-secondary-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-secondary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Private Caregiver</h3>
            <p className="text-gray-600">
              Independent caregiver offering personal care services.
            </p>
          </button>
        </div>
      </div>
    );
  }

  // Step 2: Profile form
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
      <button
        type="button"
        onClick={() => setKind(null)}
        className="text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1 mb-8"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
        {kind === "organization" ? "Create Organization Profile" : "Create Caregiver Profile"}
      </h1>
      <p className="text-lg text-gray-600 mb-8">
        Fill in your details to get started. You can always update these later.
      </p>

      {error && (
        <div className="mb-6 bg-warm-50 text-warm-700 px-4 py-3 rounded-lg text-base" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Input
          label={kind === "organization" ? "Organization name" : "Your name"}
          name="name"
          value={name}
          onChange={(e) => setName((e.target as HTMLInputElement).value)}
          placeholder={kind === "organization" ? "e.g., Sunrise Senior Living" : "e.g., Jane Smith"}
          required
        />

        {kind === "organization" && (
          <div className="space-y-1.5">
            <label htmlFor="category" className="block text-base font-medium text-gray-700">
              Organization type
            </label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value as ProfileCategory)}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 text-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent min-h-[44px]"
            >
              <option value="">Select a type...</option>
              {ORG_CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="City"
            name="city"
            value={city}
            onChange={(e) => setCity((e.target as HTMLInputElement).value)}
            placeholder="Austin"
            required
          />
          <Input
            label="State"
            name="state"
            value={state}
            onChange={(e) => setState((e.target as HTMLInputElement).value)}
            placeholder="TX"
            required
          />
        </div>

        <Input
          label="ZIP code"
          name="zip"
          value={zip}
          onChange={(e) => setZip((e.target as HTMLInputElement).value)}
          placeholder="78701"
        />

        <Input
          label="Phone (optional)"
          name="phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone((e.target as HTMLInputElement).value)}
          placeholder="(512) 555-0100"
        />

        <div className="space-y-2">
          <p className="text-base font-medium text-gray-700">
            Types of care offered
          </p>
          <div className="flex flex-wrap gap-2">
            {CARE_TYPES.map((ct) => (
              <button
                key={ct}
                type="button"
                onClick={() => toggleCareType(ct)}
                className={[
                  "px-4 py-2 rounded-full text-base font-medium transition-colors min-h-[44px]",
                  "focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2",
                  careTypes.includes(ct)
                    ? "bg-primary-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200",
                ].join(" ")}
              >
                {ct}
              </button>
            ))}
          </div>
        </div>

        <Input
          as="textarea"
          label="Description (optional)"
          name="description"
          value={description}
          onChange={(e) => setDescription((e.target as HTMLTextAreaElement).value)}
          placeholder="Tell families about your services, approach to care, and what makes you special."
          rows={4}
        />

        <Button type="submit" size="lg" fullWidth loading={submitting}>
          {user ? "Create Profile" : "Create Account & Profile"}
        </Button>
      </form>
    </div>
  );
}
