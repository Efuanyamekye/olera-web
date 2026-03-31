"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import FamilyProfileView from "@/components/portal/profile/FamilyProfileView";

export default function PortalProfilePage() {
  const router = useRouter();
  const { profiles, isLoading } = useAuth();

  // This page is for family profiles only
  const familyProfile = profiles.find((p) => p.type === "family") ?? null;
  const hasProviderProfile = profiles.some((p) => p.type === "organization" || p.type === "caregiver");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Provider-only accounts don't have family profiles — redirect to provider hub
  if (!familyProfile && hasProviderProfile) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-vanilla-50 via-white to-white">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-gray-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-2xl font-display font-bold text-gray-900 mb-2">
            Family account required
          </h2>
          <p className="text-gray-500 mb-6">
            This page is for family accounts. To manage your provider profile,
            visit the Provider Hub.
          </p>
          <button
            onClick={() => router.push("/provider")}
            className="inline-flex items-center px-6 py-3 bg-primary-600 hover:bg-primary-500 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            Go to Provider Hub
          </button>
        </div>
      </div>
    );
  }

  // No profile at all — edge case, shouldn't happen with auth middleware
  if (!familyProfile) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-vanilla-50 via-white to-white">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-gray-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-2xl font-display font-bold text-gray-900 mb-2">
            Profile not found
          </h2>
          <p className="text-gray-500 mb-6">
            Something went wrong. Please try again or contact support.
          </p>
          <button
            onClick={() => router.push("/")}
            className="inline-flex items-center px-6 py-3 bg-primary-600 hover:bg-primary-500 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            Go home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-vanilla-50 via-white to-white">
      <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8 py-6">
        <div className="mb-5">
          <h2 className="text-2xl font-display font-bold text-gray-900">
            Profile
          </h2>
          <p className="text-[15px] text-gray-500 mt-1">
            Your personal information and care preferences.
          </p>
        </div>

        <FamilyProfileView profile={familyProfile} />
      </div>
    </div>
  );
}
