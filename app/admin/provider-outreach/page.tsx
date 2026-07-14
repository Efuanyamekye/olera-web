"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { US_STATES } from "@/lib/us-states";
import Select from "@/components/ui/Select";

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

// Helper to compute city stats from providers (for non-not_contacted stages)
function computeCityStatsFromProviders(providers: OutreachProvider[]): CityStats[] {
  const cityMap = new Map<string, { total: number; has_email: number; needs_email: number }>();

  for (const p of providers) {
    const cityName = p.city || "(No City)";
    const existing = cityMap.get(cityName) || { total: 0, has_email: 0, needs_email: 0 };
    existing.total++;
    if (p.email && p.email.trim()) {
      existing.has_email++;
    } else {
      existing.needs_email++;
    }
    cityMap.set(cityName, existing);
  }

  return Array.from(cityMap.entries())
    .map(([city, stats]) => ({ city, ...stats }))
    .sort((a, b) => b.total - a.total); // Sort by total descending
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

// Editable Provider Contact - with Edit mode for existing emails
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
  const [isEditing, setIsEditing] = useState(!initialEmail); // Start in edit mode if no email
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync internal state when prop changes (e.g., from external refresh)
  useEffect(() => {
    setEmail(initialEmail || "");
    setIsEditing(!initialEmail);
  }, [initialEmail]);

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
        setIsEditing(false);
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

  function handleCancel() {
    setEmail(initialEmail || "");
    setIsEditing(false);
    setError(null);
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      <div className="flex items-center gap-1.5">
        {isEditing ? (
          // Edit mode: input + Find + Save + Cancel
          <>
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
              className="w-52 px-2.5 py-1 text-sm bg-white border border-gray-200 rounded-md focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-900/10 placeholder:text-gray-300 transition"
              disabled={saving}
              autoFocus={!!initialEmail}
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
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleSave();
              }}
              disabled={saving || !isValidEmail}
              className={`shrink-0 px-3 py-1 text-xs font-medium rounded-md transition ${
                isValidEmail
                  ? "text-white bg-teal-600 hover:bg-teal-700"
                  : "text-gray-400 bg-gray-100 cursor-not-allowed"
              } disabled:opacity-50`}
            >
              {saving ? "..." : "Save"}
            </button>
            {initialEmail && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCancel();
                }}
                disabled={saving}
                className="shrink-0 px-2 py-1 text-xs font-medium text-gray-500 hover:text-gray-700 transition"
              >
                Cancel
              </button>
            )}
            {error && <span className="text-xs text-red-600 shrink-0">{error}</span>}
          </>
        ) : (
          // Display mode: show email + Edit button
          <>
            <span className="text-sm text-gray-700">{email}</span>
            {saved && (
              <span className="text-xs text-emerald-600 flex items-center gap-0.5">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </span>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
              }}
              className="shrink-0 px-2 py-0.5 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition"
            >
              Edit
            </button>
          </>
        )}
      </div>

      {/* Phone - inline */}
      {phone && (
        <a
          href={`tel:${phone.replace(/\D/g, "")}`}
          className="text-sm text-primary-600 hover:text-primary-700 hover:underline"
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
  stage: OutreachStage;
  isExpanded: boolean;
  onToggle: () => void;
  providers: OutreachProvider[];
  loadingProviders: boolean;
  selectedProviders: Set<string>;
  onToggleProvider: (providerId: string) => void;
  onSelectAllInCity: (providerIds: string[]) => void;
  onEmailSaved: (providerId: string, newEmail: string) => void;
  onQuickAction: (providerId: string, action: "not_interested" | "archived") => void;
  actionLoading: boolean;
}

function CityRow({
  city,
  stage,
  isExpanded,
  onToggle,
  providers,
  loadingProviders,
  selectedProviders,
  onToggleProvider,
  onSelectAllInCity,
  onEmailSaved,
  onQuickAction,
  actionLoading,
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

        {/* Stats - different display based on stage */}
        <div className="flex items-center gap-6 text-sm">
          {stage === "not_contacted" ? (
            // Not contacted: show ready/needs email breakdown
            <>
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
            </>
          ) : (
            // Other stages: just show count
            <div className="text-center">
              <span className="font-semibold text-gray-900 tabular-nums">{city.total}</span>
              <span className="text-gray-400 ml-1">{city.total === 1 ? "provider" : "providers"}</span>
            </div>
          )}
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
                  <div key={provider.provider_id} className="group px-5 py-3 pl-10 flex items-center gap-3 hover:bg-white transition-colors">
                    <input
                      type="checkbox"
                      checked={selectedProviders.has(provider.provider_id)}
                      onChange={() => onToggleProvider(provider.provider_id)}
                      className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 shrink-0"
                    />

                    {/* Provider Name + Category */}
                    <div className="w-56 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={provider.slug ? `/admin/directory/${provider.slug}` : "#"}
                          className="font-medium text-gray-900 hover:text-primary-600 transition-colors truncate text-sm"
                        >
                          {provider.provider_name}
                        </Link>
                        {provider.slug && (
                          <Link
                            href={`/admin/directory/${provider.slug}`}
                            className="text-xs text-gray-400 hover:text-primary-600 shrink-0"
                          >
                            View
                          </Link>
                        )}
                      </div>
                      {provider.provider_category && (
                        <p className="text-xs text-gray-500 truncate">{provider.provider_category}</p>
                      )}
                    </div>

                    {/* Contact Info - inline */}
                    <div className="flex-1 min-w-0">
                      <ProviderContactEditor
                        providerId={provider.provider_id}
                        email={provider.email}
                        phone={provider.phone}
                        onEmailUpdate={(newEmail) => onEmailSaved(provider.provider_id, newEmail)}
                      />
                    </div>

                    {/* Hover Actions - Not Interested / Archive (trash icon) */}
                    {stage !== "archived" && stage !== "not_interested" && stage !== "claimed" && (
                      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 shrink-0 transition-opacity">
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={(e) => {
                            e.stopPropagation();
                            onQuickAction(provider.provider_id, "not_interested");
                          }}
                          className="px-2 py-1 text-xs text-gray-500 hover:text-orange-600 hover:bg-orange-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Mark as Not Interested"
                        >
                          Not Interested
                        </button>
                        {/* Trash icon = Archive (remove from list) */}
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={(e) => {
                            e.stopPropagation();
                            onQuickAction(provider.provider_id, "archived");
                          }}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Remove from list"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    )}
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

  // Quick action for single provider (hover actions)
  const handleQuickAction = async (providerId: string, action: "not_interested" | "archived") => {
    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/provider-outreach/update-stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider_ids: [providerId],
          stage: action,
        }),
      });

      if (res.ok) {
        const actionLabel = action === "not_interested" ? "Not Interested" : "Archived";
        showToast(`Marked as ${actionLabel}`, "success");

        // Refresh data
        if (stage === "not_contacted") {
          fetchCities();
          fetchProviders();
        } else {
          fetchProviders();
        }
      } else {
        const err = await res.json();
        showToast(err.error || "Failed to update", "error");
      }
    } catch (err) {
      console.error("Failed to quick action:", err);
      showToast("Failed to update", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // Available actions based on current stage
  // Note: "Mark Claimed" is NOT included because Claimed auto-syncs from business_profiles
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
          { stage: "not_interested", label: "Not Interested", color: "bg-gray-600 hover:bg-gray-700" },
          { stage: "archived", label: "Archive", color: "bg-gray-500 hover:bg-gray-600" },
        ];
      case "needs_call":
        return [
          { stage: "called", label: "Mark Called", color: "bg-purple-600 hover:bg-purple-700" },
          { stage: "not_interested", label: "Not Interested", color: "bg-gray-600 hover:bg-gray-700" },
          { stage: "archived", label: "Archive", color: "bg-gray-500 hover:bg-gray-600" },
        ];
      case "called":
        return [
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
        <div className="w-56">
          <Select
            value={selectedState}
            onChange={setSelectedState}
            options={US_STATES.map((s) => ({
              value: s.value,
              label: `${s.label} (${s.value})`,
            }))}
            searchable
            searchPlaceholder="Search states..."
            size="sm"
          />
        </div>
      </div>

      {/* Stage Tabs - underlined style like Questions page */}
      <div className="flex gap-1 mb-6 border-b border-gray-100">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStage(tab.value)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              stage === tab.value
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-1.5 text-xs text-gray-400 tabular-nums">
                {tab.count}
              </span>
            )}
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

      {/* Content - City-grouped view for ALL stages */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-4 px-5 py-3 border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wide">
          <div className="w-5" />
          <div className="flex-1">City</div>
          <div className="w-48 text-right">Providers</div>
        </div>

        {(() => {
          // For not_contacted, use the cities API data; for other stages, compute from providers
          const displayCities = stage === "not_contacted" ? cities : computeCityStatsFromProviders(providers);
          const isLoading = stage === "not_contacted" ? loadingCities : loadingProviders;
          const emptyMessage = stage === "not_contacted"
            ? `No unclaimed providers in ${selectedState}`
            : `No providers in ${STAGE_LABELS[stage]}`;

          if (isLoading) {
            return (
              <div className="p-8 text-center">
                <div className="inline-block w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
              </div>
            );
          }

          if (displayCities.length === 0) {
            return (
              <div className="p-12 text-center">
                <p className="text-gray-500">{emptyMessage}</p>
              </div>
            );
          }

          return (
            <div>
              {displayCities.map((city) => (
                <CityRow
                  key={city.city}
                  city={city}
                  stage={stage}
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
                    // Refresh cities to update counts (for not_contacted)
                    if (stage === "not_contacted") {
                      fetchCities();
                    }
                  }}
                  onQuickAction={handleQuickAction}
                  actionLoading={actionLoading}
                />
              ))}
            </div>
          );
        })()}
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
