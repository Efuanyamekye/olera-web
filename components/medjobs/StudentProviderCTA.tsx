"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import ScheduleInterviewModal from "@/components/medjobs/ScheduleInterviewModal";
import { calculateCompleteness } from "@/lib/medjobs-completeness";
import { getStudentTimezone } from "@/lib/medjobs/timezone";
import type { StudentMetadata } from "@/lib/types";

/**
 * StudentProviderCTA — the student-context action region on the provider page
 * (replaces the family CTA when ?ctx=medjobs-student). A hiring banner + a
 * "Request interview" button, gated on the student having a live application
 * (so agencies never receive an empty profile). For a directory-only provider
 * (no business_profile yet) the request resolves/creates one first
 * (materialize-on-request) — student demand pulls providers into the program.
 */

export default function StudentProviderCTA({
  surface,
  providerId,
  providerName,
  providerSlug,
  providerSource,
  city,
  state,
  campus,
}: {
  surface: "sidebar" | "mobile";
  providerId: string;
  providerName: string;
  providerSlug: string;
  providerSource: "ios" | "bp";
  city?: string | null;
  state?: string | null;
  campus?: string | null;
}) {
  const { profiles, isLoading } = useAuth();
  const studentProfileFromAuth = profiles?.find((p) => p.type === "student");
  const [isLive, setIsLive] = useState<boolean | null>(null);
  const [freshProfile, setFreshProfile] = useState<{
    display_name: string | null;
    email: string | null;
    phone: string | null;
    city: string | null;
    state: string | null;
    image_url: string | null;
    metadata: StudentMetadata | null;
  } | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolvedId, setResolvedId] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!studentProfileFromAuth?.id) return;
    (async () => {
      try {
        const sb = createClient();
        const { data } = await sb
          .from("business_profiles")
          .select("is_active, display_name, email, phone, city, state, image_url, metadata")
          .eq("id", studentProfileFromAuth.id)
          .single();
        setIsLive(!!data?.is_active);
        if (data) {
          setFreshProfile({
            display_name: data.display_name,
            email: data.email,
            phone: data.phone,
            city: data.city,
            state: data.state,
            image_url: data.image_url,
            metadata: data.metadata as StudentMetadata | null,
          });
        }
      } catch {
        setIsLive(null);
      }
    })();
  }, [studentProfileFromAuth?.id]);

  const locationLabel = campus
    ? `near ${campus}`
    : [city, state].filter(Boolean).join(", ") || "in your area";

  async function handleRequest() {
    setError(null);
    // Not signed in / not a student → go check eligibility.
    if (!studentProfileFromAuth?.id) {
      window.location.href = `/medjobs/families?screener=1${campus ? `&campus=${encodeURIComponent(campus)}` : ""}`;
      return;
    }
    // Resolve the provider's business_profile id (materialize directory rows).
    setResolving(true);
    try {
      if (providerSource === "bp") {
        setResolvedId(providerId);
      } else {
        const res = await fetch("/api/medjobs/resolve-provider", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: providerSlug, providerId }),
        });
        const data = await res.json();
        if (!res.ok || !data.providerProfileId) {
          setError("Couldn't open this request. Please try again.");
          return;
        }
        setResolvedId(data.providerProfileId);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setResolving(false);
    }
  }

  const wrapClass =
    surface === "sidebar"
      ? "rounded-2xl border border-primary-200 bg-white p-5 shadow-sm"
      : "fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white p-3 shadow-[0_-2px_12px_rgba(0,0,0,0.06)] md:hidden";

  // Calculate completeness using the same logic as Profile tab and admin panel
  const completeness = freshProfile && freshProfile.metadata
    ? calculateCompleteness(
        freshProfile.metadata,
        !!freshProfile.image_url,
        undefined, // derive hasBasicInfo from profileFields
        {
          display_name: freshProfile.display_name,
          email: freshProfile.email,
          phone: freshProfile.phone,
          city: freshProfile.city,
          state: freshProfile.state,
        }
      )
    : 0;

  // Gate: student must have 100% complete profile before requesting.
  // Approval status is now checked at final submission step in the modal,
  // not upfront — this lets students with complete but unapproved profiles
  // proceed to the apply flow and get specific guidance there.
  const needsApplication = studentProfileFromAuth?.id && completeness < 100;

  return (
    <>
      <div className={wrapClass}>
        {surface === "sidebar" && (
          <>
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Hiring student caregivers {locationLabel}
            </p>
            <p className="mt-2 font-serif text-lg text-gray-900">{providerName}</p>
            <p className="mt-1 text-sm text-gray-600">
              Apply to get hired.
            </p>
          </>
        )}

        {requested ? (
          <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary-600">
            ✓ Interview requested
          </p>
        ) : needsApplication ? (
          <div className={surface === "mobile" ? "" : "mt-3"}>
            <p className="text-sm font-medium text-gray-900">
              Your profile is {completeness}% complete
            </p>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-primary-500 transition-all" style={{ width: `${completeness}%` }} />
            </div>
            <Link
              href="/portal/medjobs"
              className="mt-3 block w-full rounded-xl bg-primary-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-primary-700"
            >
              Finish your profile to unlock interviews →
            </Link>
            <p className="mt-1.5 text-center text-xs text-gray-500">
              Providers need to see who you are before they can interview you.
            </p>
          </div>
        ) : (
          <div className={surface === "mobile" ? "" : "mt-3"}>
            <button
              type="button"
              onClick={handleRequest}
              disabled={isLoading || resolving}
              className="w-full rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {resolving ? "Opening…" : !studentProfileFromAuth?.id ? "Apply Now →" : "Request interview"}
            </button>
          </div>
        )}
        {error ? <p className="mt-2 text-center text-xs text-red-600">{error}</p> : null}
      </div>

      {resolvedId && (
        <ScheduleInterviewModal
          providerProfileId={resolvedId}
          otherName={providerName}
          onClose={() => setResolvedId(null)}
          onScheduled={() => {
            setRequested(true);
            setResolvedId(null);
          }}
          studentTimezone={getStudentTimezone(freshProfile?.metadata)}
        />
      )}
    </>
  );
}
