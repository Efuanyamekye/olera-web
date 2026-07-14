"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { US_STATES } from "@/lib/us-states";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

const OUTREACH_STAGES = [
  "not_contacted",
  "in_sequence",
  "needs_call",
  "called",
  "claimed",
  "not_interested",
  "archived",
] as const;

type OutreachStage = (typeof OUTREACH_STAGES)[number];

const STAGE_LABELS: Record<OutreachStage, string> = {
  not_contacted: "Not Contacted",
  in_sequence: "In Sequence",
  needs_call: "Needs Call",
  called: "Called",
  claimed: "Claimed",
  not_interested: "Not Interested",
  archived: "Archived",
};

const TERMINAL_STAGES: OutreachStage[] = ["claimed", "not_interested", "archived"];

interface CityStats {
  city: string;
  total: number;
  has_email: number;
  needs_email: number;
}

interface OutreachProvider {
  provider_id: string;
  provider_name: string;
  provider_category: string | null;
  city: string | null;
  state: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  slug: string | null;
  tracking_id: string | null;
  stage: OutreachStage;
  stage_changed_at: string | null;
  notes: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function timeAgo(isoDate: string | undefined | null): string {
  if (!isoDate) return "—";
  const days = Math.floor((Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  if (days === 1) return "1d ago";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage Badge Component
// ─────────────────────────────────────────────────────────────────────────────

function StageBadge({ stage }: { stage: OutreachStage }) {
  const config: Record<OutreachStage, { bg: string; text: string; dot: string }> = {
    not_contacted: { bg: "bg-gray-100", text: "text-gray-700", dot: "bg-gray-400" },
    in_sequence: { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500 animate-pulse" },
    needs_call: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
    called: { bg: "bg-purple-50", text: "text-purple-700", dot: "bg-purple-500" },
    claimed: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
    not_interested: { bg: "bg-gray-100", text: "text-gray-600", dot: "bg-gray-400" },
    archived: { bg: "bg-gray-100", text: "text-gray-500", dot: "bg-gray-300" },
  };

  const { bg, text, dot } = config[stage];

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full ${bg} ${text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {STAGE_LABELS[stage]}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Contact Status Badges
// ─────────────────────────────────────────────────────────────────────────────

// Format phone number for display
function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === "1") {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

// Editable Provider Contact - inline email editing like Questions page
function ProviderContactEditor({
  providerId,
  email: initialEmail,
  phone,
  onEmailUpdate,
}: {
  providerId: string;
  email: string | null;
  phone: string | null;
  onEmailUpdate?: (newEmail: string) => void;
}) {
  const [email, setEmail] = useState(initialEmail || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasChanged = email.trim() !== (initialEmail || "").trim();
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function handleSave() {
    if (!email.trim() || !isValidEmail) return;

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/provider-outreach/update-email", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: providerId, email: email.trim() }),
      });

      if (res.ok) {
        setSaved(true);
        onEmailUpdate?.(email.trim());
        setTimeout(() => setSaved(false), 2000);
      } else {
        const data = await res.json();
        setError(data.error || "Failed to save");
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {/* Email row */}
      <div className="flex items-center gap-2">
        <input
          type="email"
          placeholder="email@provider.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
            setSaved(false);
          }}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 min-w-0 px-2.5 py-1 text-sm bg-white border border-gray-200 rounded-md focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-900/10 placeholder:text-gray-300 transition"
          disabled={saving}
        />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            // Placeholder for future email finder
            alert("Email finder coming soon!");
          }}
          className="shrink-0 px-2 py-1 text-xs font-medium text-teal-700 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition"
        >
          ✦ Find
        </button>
        {hasChanged && isValidEmail && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleSave();
            }}
            disabled={saving}
            className="shrink-0 px-2.5 py-1 text-xs font-medium text-white bg-teal-600 rounded-md hover:bg-teal-700 disabled:opacity-50 transition"
          >
            {saving ? "..." : "Save"}
          </button>
        )}
        {saved && (
          <span className="text-xs text-emerald-600 flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            Saved
          </span>
        )}
        {error && (
          <span className="text-xs text-red-600">{error}</span>
        )}
      </div>

      {/* Phone row */}
      {phone && (
        <a
          href={`tel:${phone.replace(/\D/g, "")}`}
          className="text-sm text-primary-600 hover:text-primary-700 hover:underline w-fit"
          onClick={(e) => e.stopPropagation()}
        >
          {formatPhone(phone)}
        </a>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// City Row Component (collapsed/expanded)
// ─────────────────────────────────────────────────────────────────────────────

interface CityRowProps {
  city: CityStats;
  isExpanded: boolean;
  onToggle: () => void;
  providers: OutreachProvider[];
  loadingProviders: boolean;
  selectedProviders: Set<string>;
  onToggleProvider: (providerId: string) => void;
  onSelectAllInCity: (providerIds: string[]) => void;
  onEmailSaved: (providerId: string, newEmail: string) => void;
}

function CityRow({
  city,
  isExpanded,
  onToggle,
  providers,
  loadingProviders,
  selectedProviders,
  onToggleProvider,
  onSelectAllInCity,
  onEmailSaved,
}: CityRowProps) {
  const [showOnlyWithEmail, setShowOnlyWithEmail] = useState(false);

  const cityProviders = providers.filter((p) => (p.city || "(No City)") === city.city);
  const filteredProviders = showOnlyWithEmail
    ? cityProviders.filter((p) => p.email && p.email.trim())
    : cityProviders;
  const providersWithEmail = cityProviders.filter((p) => p.email && p.email.trim());

  const allSelected = filteredProviders.length > 0 && filteredProviders.every((p) => selectedProviders.has(p.provider_id));
  const someSelected = filteredProviders.some((p) => selectedProviders.has(p.provider_id)) && !allSelected;

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      {/* City Header */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500"
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        {/* Expand Icon */}
        <div className="w-5 shrink-0">
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M6.5 3.5l7 6.5-7 6.5V3.5z" />
          </svg>
        </div>

        {/* City Name */}
        <div className="flex-1 min-w-0">
          <span className="font-medium text-gray-900">{city.city}</span>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-6 text-sm">
          <div className="text-center">
            <span className="font-semibold text-gray-900 tabular-nums">{city.total}</span>
            <span className="text-gray-400 ml-1">total</span>
          </div>
          <div className="text-center">
            <span className="font-semibold text-emerald-600 tabular-nums">{city.has_email}</span>
            <span className="text-gray-400 ml-1">ready</span>
          </div>
          <div className="text-center">
            <span className="font-semibold text-amber-600 tabular-nums">{city.needs_email}</span>
            <span className="text-gray-400 ml-1">needs email</span>
          </div>
        </div>
      </div>

      {/* Expanded: Provider List */}
      {isExpanded && (
        <div className="bg-gray-50/50 border-t border-gray-100">
          {loadingProviders ? (
            <div className="p-6 text-center">
              <div className="inline-block w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
            </div>
          ) : cityProviders.length === 0 ? (
            <p className="px-5 py-4 text-sm text-gray-400 italic">No providers in this city</p>
          ) : (
            <>
              {/* Filter & Select Bar */}
              <div className="px-5 py-2 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected;
                      }}
                      onChange={() => {
                        if (allSelected) {
                          filteredProviders.forEach((p) => {
                            if (selectedProviders.has(p.provider_id)) {
                              onToggleProvider(p.provider_id);
                            }
                          });
                        } else {
                          onSelectAllInCity(filteredProviders.map((p) => p.provider_id));
                        }
                      }}
                      className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-xs text-gray-500">
                      Select all {filteredProviders.length}
                    </span>
                  </div>

                  {/* Quick select with email only */}
                  {providersWithEmail.length > 0 && providersWithEmail.length < cityProviders.length && (
                    <button
                      type="button"
                      onClick={() => onSelectAllInCity(providersWithEmail.map((p) => p.provider_id))}
                      className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                    >
                      Select {providersWithEmail.length} with email
                    </button>
                  )}
                </div>

                {/* Filter toggle */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showOnlyWithEmail}
                    onChange={(e) => setShowOnlyWithEmail(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-xs text-gray-500">Show only with email</span>
                </label>
              </div>

              {/* Provider Cards */}
              <div className="divide-y divide-gray-100">
                {filteredProviders.map((provider) => (
                  <div key={provider.provider_id} className="px-5 py-4 pl-10 flex items-start gap-4 hover:bg-white transition-colors">
                    <input
                      type="checkbox"
                      checked={selectedProviders.has(provider.provider_id)}
                      onChange={() => onToggleProvider(provider.provider_id)}
                      className="w-4 h-4 mt-1 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />

                    {/* Provider Card */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Link
                              href={provider.slug ? `/admin/directory/${provider.slug}` : "#"}
                              className="font-medium text-gray-900 hover:text-primary-600 transition-colors truncate"
                            >
                              {provider.provider_name}
                            </Link>
                            {provider.slug && (
                              <Link
                                href={`/admin/directory/${provider.slug}`}
                                className="text-xs text-gray-400 hover:text-primary-600"
                              >
                                View
                              </Link>
                            )}
                          </div>
                          {provider.provider_category && (
                            <p className="text-xs text-gray-500 mt-0.5">{provider.provider_category}</p>
                          )}
                        </div>
                      </div>

                      {/* Contact Info */}
                      <div className="mt-2">
                        <ProviderContactEditor
                          providerId={provider.provider_id}
                          email={provider.email}
                          phone={provider.phone}
                          onEmailUpdate={(newEmail) => onEmailSaved(provider.provider_id, newEmail)}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Show count if filtered */}
              {showOnlyWithEmail && filteredProviders.length < cityProviders.length && (
                <div className="px-5 py-2 text-xs text-gray-400 border-t border-gray-100">
                  Showing {filteredProviders.length} of {cityProviders.length} providers
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider Row Component (for non-not_contacted stages)
// ─────────────────────────────────────────────────────────────────────────────

interface ProviderRowProps {
  provider: OutreachProvider;
  isSelected: boolean;
  onToggleSelect: () => void;
  onEmailSaved: (providerId: string, newEmail: string) => void;
}

function ProviderRow({ provider, isSelected, onToggleSelect, onEmailSaved }: ProviderRowProps) {
  return (
    <div className="flex items-start gap-4 px-5 py-4 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors">
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggleSelect}
        className="w-4 h-4 mt-1 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
      />

      {/* Provider Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Link
            href={provider.slug ? `/admin/directory/${provider.slug}` : "#"}
            className="font-medium text-gray-900 hover:text-primary-600 transition-colors truncate"
          >
            {provider.provider_name}
          </Link>
          {provider.slug && (
            <Link
              href={`/admin/directory/${provider.slug}`}
              className="text-xs text-gray-400 hover:text-primary-600"
            >
              View
            </Link>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          {[provider.city, provider.state].filter(Boolean).join(", ")}
          {provider.provider_category && ` · ${provider.provider_category}`}
        </p>

        {/* Contact Info */}
        <div className="mt-2">
          <ProviderContactEditor
            providerId={provider.provider_id}
            email={provider.email}
            phone={provider.phone}
            onEmailUpdate={(newEmail) => onEmailSaved(provider.provider_id, newEmail)}
          />
        </div>
      </div>

      {/* Stage Changed */}
      <div className="w-24 text-right shrink-0">
        <p className="text-sm text-gray-400">{timeAgo(provider.stage_changed_at)}</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export default function ProviderOutreachPage() {
  // State filter
  const [selectedState, setSelectedState] = useState<string>("TX");

  // Stage tab
  const [stage, setStage] = useState<OutreachStage>("not_contacted");

  // Cities data (for not_contacted tab)
  const [cities, setCities] = useState<CityStats[]>([]);
  const [loadingCities, setLoadingCities] = useState(false);
  const [totalUnclaimed, setTotalUnclaimed] = useState(0);

  // Providers data
  const [providers, setProviders] = useState<OutreachProvider[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);

  // Stage counts
  const [stageCounts, setStageCounts] = useState<Record<OutreachStage, number>>({
    not_contacted: 0,
    in_sequence: 0,
    needs_call: 0,
    called: 0,
    claimed: 0,
    not_interested: 0,
    archived: 0,
  });

  // Expanded cities (for not_contacted tab)
  const [expandedCities, setExpandedCities] = useState<Set<string>>(new Set());

  // Selected providers
  const [selectedProviders, setSelectedProviders] = useState<Set<string>>(new Set());

  // Action loading
  const [actionLoading, setActionLoading] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Fetch cities for not_contacted stage
  const fetchCities = useCallback(async () => {
    if (!selectedState) return;
    setLoadingCities(true);

    try {
      const res = await fetch(`/api/admin/provider-outreach/cities?state=${selectedState}`);
      if (res.ok) {
        const data = await res.json();
        setCities(data.cities || []);
        setTotalUnclaimed(data.total_unclaimed || 0);
      }
    } catch (err) {
      console.error("Failed to fetch cities:", err);
    } finally {
      setLoadingCities(false);
    }
  }, [selectedState]);

  // Fetch providers for current stage/state
  const fetchProviders = useCallback(async (city?: string) => {
    if (!selectedState) return;
    setLoadingProviders(true);

    try {
      const params = new URLSearchParams({
        state: selectedState,
        stage,
      });
      if (city) params.set("city", city);

      const res = await fetch(`/api/admin/provider-outreach?${params}`);
      if (res.ok) {
        const data = await res.json();
        setProviders(data.providers || []);
        if (data.stage_counts) {
          setStageCounts(data.stage_counts);
        }
      }
    } catch (err) {
      console.error("Failed to fetch providers:", err);
    } finally {
      setLoadingProviders(false);
    }
  }, [selectedState, stage]);

  // Effect: fetch cities when state changes (for not_contacted tab)
  useEffect(() => {
    if (stage === "not_contacted") {
      fetchCities();
    }
  }, [selectedState, stage, fetchCities]);

  // Effect: fetch providers when stage changes (for non-not_contacted tabs)
  useEffect(() => {
    if (stage !== "not_contacted") {
      fetchProviders();
    }
  }, [selectedState, stage, fetchProviders]);

  // Effect: fetch providers when a city is expanded
  useEffect(() => {
    if (stage === "not_contacted" && expandedCities.size > 0) {
      // Fetch all providers for the state (will filter by city in UI)
      fetchProviders();
    }
  }, [expandedCities, stage, fetchProviders]);

  // Clear selection when stage changes
  useEffect(() => {
    setSelectedProviders(new Set());
    setExpandedCities(new Set());
  }, [stage, selectedState]);

  // Show toast helper
  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Toggle city expansion
  const toggleCity = (cityName: string) => {
    setExpandedCities((prev) => {
      const next = new Set(prev);
      if (next.has(cityName)) {
        next.delete(cityName);
      } else {
        next.add(cityName);
      }
      return next;
    });
  };

  // Toggle provider selection
  const toggleProvider = (providerId: string) => {
    setSelectedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(providerId)) {
        next.delete(providerId);
      } else {
        next.add(providerId);
      }
      return next;
    });
  };

  // Select all providers in a city
  const selectAllInCity = (providerIds: string[]) => {
    setSelectedProviders((prev) => {
      const next = new Set(prev);
      providerIds.forEach((id) => next.add(id));
      return next;
    });
  };

  // Update stage for selected providers
  const updateStage = async (newStage: OutreachStage) => {
    if (selectedProviders.size === 0) return;

    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/provider-outreach/update-stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider_ids: Array.from(selectedProviders),
          stage: newStage,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        showToast(`Moved ${data.updated + data.created} provider(s) to ${STAGE_LABELS[newStage]}`, "success");
        setSelectedProviders(new Set());

        // Refresh data
        if (stage === "not_contacted") {
          fetchCities();
          fetchProviders();
        } else {
          fetchProviders();
        }
      } else {
        const err = await res.json();
        showToast(err.error || "Failed to update stage", "error");
      }
    } catch (err) {
      console.error("Failed to update stage:", err);
      showToast("Failed to update stage", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // Available actions based on current stage
  const getAvailableActions = (): { stage: OutreachStage; label: string; color: string }[] => {
    switch (stage) {
      case "not_contacted":
        return [
          { stage: "in_sequence", label: "Move to In Sequence", color: "bg-blue-600 hover:bg-blue-700" },
          { stage: "archived", label: "Archive", color: "bg-gray-600 hover:bg-gray-700" },
        ];
      case "in_sequence":
        return [
          { stage: "needs_call", label: "Needs Call", color: "bg-amber-600 hover:bg-amber-700" },
          { stage: "claimed", label: "Mark Claimed", color: "bg-emerald-600 hover:bg-emerald-700" },
          { stage: "not_interested", label: "Not Interested", color: "bg-gray-600 hover:bg-gray-700" },
          { stage: "archived", label: "Archive", color: "bg-gray-500 hover:bg-gray-600" },
        ];
      case "needs_call":
        return [
          { stage: "called", label: "Mark Called", color: "bg-purple-600 hover:bg-purple-700" },
          { stage: "claimed", label: "Mark Claimed", color: "bg-emerald-600 hover:bg-emerald-700" },
          { stage: "not_interested", label: "Not Interested", color: "bg-gray-600 hover:bg-gray-700" },
          { stage: "archived", label: "Archive", color: "bg-gray-500 hover:bg-gray-600" },
        ];
      case "called":
        return [
          { stage: "claimed", label: "Mark Claimed", color: "bg-emerald-600 hover:bg-emerald-700" },
          { stage: "not_interested", label: "Not Interested", color: "bg-gray-600 hover:bg-gray-700" },
          { stage: "needs_call", label: "Back to Needs Call", color: "bg-amber-600 hover:bg-amber-700" },
          { stage: "archived", label: "Archive", color: "bg-gray-500 hover:bg-gray-600" },
        ];
      default:
        // Terminal stages - allow moving back
        return [
          { stage: "not_contacted", label: "Reset to Not Contacted", color: "bg-gray-600 hover:bg-gray-700" },
        ];
    }
  };

  const tabs = OUTREACH_STAGES.map((s) => ({
    value: s,
    label: STAGE_LABELS[s],
    count: stageCounts[s],
    isTerminal: TERMINAL_STAGES.includes(s),
  }));

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
            toast.type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
            Provider Cold Outreach
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Track and manage outreach to unclaimed providers
          </p>
        </div>

        {/* State Dropdown */}
        <select
          value={selectedState}
          onChange={(e) => setSelectedState(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        >
          {US_STATES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label} ({s.value})
            </option>
          ))}
        </select>
      </div>

      {/* Stage Tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStage(tab.value)}
            className={[
              "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              stage === tab.value
                ? "bg-primary-600 text-white"
                : tab.isTerminal
                  ? "bg-gray-50 text-gray-500 hover:bg-gray-100"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200",
            ].join(" ")}
          >
            {tab.label}
            <span
              className={[
                "ml-1.5 px-1.5 py-0.5 rounded text-xs tabular-nums",
                stage === tab.value
                  ? "bg-white/20 text-white"
                  : "bg-gray-200 text-gray-500",
              ].join(" ")}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Action Bar (when items selected) */}
      {selectedProviders.size > 0 && (
        <div className="mb-4 p-3 bg-primary-50 rounded-lg border border-primary-200 flex items-center justify-between">
          <span className="text-sm font-medium text-primary-900">
            {selectedProviders.size} provider{selectedProviders.size === 1 ? "" : "s"} selected
          </span>
          <div className="flex items-center gap-2">
            {getAvailableActions().map((action) => (
              <button
                key={action.stage}
                onClick={() => updateStage(action.stage)}
                disabled={actionLoading}
                className={`px-3 py-1.5 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${action.color}`}
              >
                {action.label}
              </button>
            ))}
            <button
              onClick={() => setSelectedProviders(new Set())}
              className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {stage === "not_contacted" ? (
          // Not Contacted: City-grouped view
          <>
            {/* Header */}
            <div className="flex items-center gap-4 px-5 py-3 border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wide">
              <div className="w-5" />
              <div className="flex-1">City</div>
              <div className="w-48 text-right">Providers</div>
            </div>

            {loadingCities ? (
              <div className="p-8 text-center">
                <div className="inline-block w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
              </div>
            ) : cities.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-gray-500">No unclaimed providers in {selectedState}</p>
              </div>
            ) : (
              <div>
                {cities.map((city) => (
                  <CityRow
                    key={city.city}
                    city={city}
                    isExpanded={expandedCities.has(city.city)}
                    onToggle={() => toggleCity(city.city)}
                    providers={providers}
                    loadingProviders={loadingProviders}
                    selectedProviders={selectedProviders}
                    onToggleProvider={toggleProvider}
                    onSelectAllInCity={selectAllInCity}
                    onEmailSaved={(providerId, newEmail) => {
                      // Update local providers state immediately
                      setProviders((prev) =>
                        prev.map((p) =>
                          p.provider_id === providerId ? { ...p, email: newEmail } : p
                        )
                      );
                      // Refresh cities to update counts
                      fetchCities();
                    }}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          // Other stages: Flat provider list
          <>
            {/* Header */}
            <div className="flex items-center gap-4 px-5 py-3 border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wide">
              <div className="w-4" />
              <div className="flex-[2]">Provider</div>
              <div className="w-32 text-center">Contact</div>
              <div className="w-24 text-right">Changed</div>
            </div>

            {loadingProviders ? (
              <div className="p-8 text-center">
                <div className="inline-block w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
              </div>
            ) : providers.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-gray-500">No providers in {STAGE_LABELS[stage]}</p>
              </div>
            ) : (
              <div>
                {providers.map((provider) => (
                  <ProviderRow
                    key={provider.provider_id}
                    provider={provider}
                    isSelected={selectedProviders.has(provider.provider_id)}
                    onToggleSelect={() => toggleProvider(provider.provider_id)}
                    onEmailSaved={(providerId, newEmail) => {
                      // Update local providers state immediately
                      setProviders((prev) =>
                        prev.map((p) =>
                          p.provider_id === providerId ? { ...p, email: newEmail } : p
                        )
                      );
                    }}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Summary */}
      {stage === "not_contacted" && !loadingCities && (
        <div className="mt-4 text-sm text-gray-500">
          {totalUnclaimed.toLocaleString()} unclaimed providers in {selectedState} across {cities.length} cities
        </div>
      )}
    </div>
  );
}
