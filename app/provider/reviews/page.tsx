"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { useProviderProfile } from "@/hooks/useProviderProfile";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

export default function ProviderReviewsPage() {
  const { user } = useAuth();
  const providerProfile = useProviderProfile();
  const [email, setEmail] = useState(user?.email || "");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleNotify(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      if (isSupabaseConfigured()) {
        const supabase = createClient();
        const { error: dbError } = await supabase.from("feature_waitlist").upsert(
          { feature: "reviews", email: email.trim(), profile_id: providerProfile?.id || null },
          { onConflict: "feature,email" },
        );
        if (dbError) throw dbError;
      }
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-vanilla-50 via-white to-white">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex flex-col items-center justify-center text-center min-h-[70vh]">
        {/* Icon */}
        <svg className="w-12 h-12 text-primary-500 mb-6" viewBox="0 0 20 20" fill="currentColor">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>

        {/* Badge */}
        <span className="inline-flex items-center px-3.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider text-primary-600 border border-primary-200 mb-5">
          Coming Soon
        </span>

        {/* Heading */}
        <h1 className="text-3xl font-display font-bold text-gray-900 tracking-tight mb-3">
          Reviews
        </h1>

        <p className="text-base text-gray-500 max-w-sm leading-relaxed mb-8">
          Collect and showcase authentic feedback from the families you serve.
        </p>

        {/* Notify form */}
        {!submitted ? (
          <form onSubmit={handleNotify} className="w-full max-w-sm mb-3">
            <div className="flex items-center border border-gray-200 rounded-xl bg-white overflow-hidden">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Your email"
                required
                className="flex-1 px-4 py-3.5 text-base text-gray-900 placeholder:text-gray-400 focus:outline-none"
              />
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-3 mr-1.5 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors shrink-0 min-h-[44px]"
              >
                {submitting ? "..." : "Notify me"}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2.5">
              We&apos;ll send one email when reviews launches. No spam.
            </p>
            {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
          </form>
        ) : (
          <div className="mb-8">
            <p className="text-sm text-primary-600 font-medium">
              You&apos;re on the list. We&apos;ll let you know!
            </p>
          </div>
        )}

        {/* Back link */}
        <Link
          href="/provider"
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors mt-4 py-2 px-3 -mx-3 rounded-lg hover:bg-gray-50"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Back to dashboard
        </Link>
      </div>
    </div>
    </div>
  );
}
