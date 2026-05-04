"use client";

/**
 * Staffing Pilot Activation Page
 *
 * Providers land here after clicking the magic link in their email.
 * They see the Terms & Conditions and can accept to enroll in the pilot.
 */

import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import Image from "next/image";

function StaffingPilotContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");
  const error = searchParams.get("error");

  const [loading, setLoading] = useState(false);
  const [enrolled, setEnrolled] = useState(false);
  const [enrollmentData, setEnrollmentData] = useState<{
    providerName: string;
    universityName: string;
  } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Handle error states
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Link Invalid or Expired</h1>
          <p className="text-gray-600 mb-6">
            {error === "missing_token"
              ? "No activation token was provided."
              : error === "invalid_token"
              ? "This link has expired or is invalid. Please contact your Olera representative for a new link."
              : "The activation link could not be verified. Please contact your Olera representative."}
          </p>
          <a
            href="mailto:support@olera.care"
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-3 text-white font-medium hover:bg-primary-700"
          >
            Contact Support
          </a>
        </div>
      </div>
    );
  }

  // No token provided (direct page visit)
  if (!token) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
            <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Activation Required</h1>
          <p className="text-gray-600">
            Please use the activation link from your email to access this page.
          </p>
        </div>
      </div>
    );
  }

  const handleAccept = async () => {
    setLoading(true);
    setSubmitError(null);

    try {
      const res = await fetch("/api/medjobs/staffing-pilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Enrollment failed");
      }

      setEnrolled(true);
      setEnrollmentData({
        providerName: data.providerName,
        universityName: data.universityName,
      });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Success state
  if (enrolled && enrollmentData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-lg w-full text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
            <svg className="h-10 w-10 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-3">Welcome to the Pilot!</h1>
          <p className="text-lg text-gray-600 mb-6">
            <span className="font-semibold text-gray-900">{enrollmentData.providerName}</span> is now enrolled
            in the {enrollmentData.universityName} Student Caregiver Program.
          </p>
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-left mb-8">
            <h2 className="font-semibold text-gray-900 mb-3">What happens next?</h2>
            <ul className="space-y-3 text-gray-600">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-sm font-medium">1</span>
                <span>We&apos;ll begin recruiting pre-nursing students for your agency</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-sm font-medium">2</span>
                <span>You&apos;ll receive vetted candidate profiles via email</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-sm font-medium">3</span>
                <span>Interview and hire students who fit your needs</span>
              </li>
            </ul>
          </div>
          <p className="text-sm text-gray-500">
            Questions? Contact us at{" "}
            <a href="mailto:support@olera.care" className="text-primary-600 hover:underline">
              support@olera.care
            </a>
          </p>
        </div>
      </div>
    );
  }

  // T&C acceptance form
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Image src="/olera-logo.svg" alt="Olera" width={120} height={40} />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Student Caregiver Pilot</h1>
          <p className="text-lg text-gray-600">
            Join our pilot program connecting pre-nursing students with caregiving opportunities.
          </p>
        </div>

        {/* T&C Card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-xl font-semibold text-gray-900">Pilot Agreement</h2>
            <p className="text-sm text-gray-500 mt-1">Please review and accept to enroll</p>
          </div>

          <div className="p-6 max-h-80 overflow-y-auto bg-gray-50 text-sm text-gray-700 space-y-4">
            <p>
              <strong>Program Overview:</strong> The Olera Student Caregiver Pilot Program connects
              pre-nursing and pre-medical students with home care agencies for paid caregiving positions.
              This pilot is designed to help address caregiver shortages while providing students with
              valuable healthcare experience.
            </p>

            <p>
              <strong>What You&apos;ll Receive:</strong>
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Vetted student candidate profiles sent to your email</li>
              <li>Students who have completed background checks and are actively seeking caregiving work</li>
              <li>Goal of 5 new candidates per week with 1-3 solid hires per month</li>
              <li>During the pilot period, this service is provided at no cost</li>
            </ul>

            <p>
              <strong>Your Commitment:</strong>
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Review candidate profiles in a timely manner</li>
              <li>Provide feedback on candidates to help us improve matching</li>
              <li>Conduct your standard hiring and onboarding process</li>
              <li>Share occasional feedback about the pilot program</li>
            </ul>

            <p>
              <strong>Pilot Terms:</strong> This is a pilot program. Olera may modify or discontinue
              the program at any time. You may opt out at any time by contacting us. During the pilot,
              there are no fees or long-term commitments.
            </p>

            <p>
              <strong>Privacy:</strong> We handle all candidate and agency data in accordance with our
              Privacy Policy. Student information shared with you should be used solely for hiring purposes.
            </p>
          </div>

          <div className="p-6 bg-white border-t border-gray-100">
            {submitError && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
                {submitError}
              </div>
            )}

            <button
              onClick={handleAccept}
              disabled={loading}
              className="w-full rounded-lg bg-primary-600 py-3 text-white font-semibold hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Enrolling..." : "I Accept — Enroll My Agency"}
            </button>

            <p className="mt-4 text-xs text-center text-gray-500">
              By clicking above, you agree to participate in the pilot program under these terms.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StaffingPilotPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    }>
      <StaffingPilotContent />
    </Suspense>
  );
}
