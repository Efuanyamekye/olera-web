"use client";

import { useState } from "react";
import ActionCard, { type ActionCardState, type NotificationData } from "@/components/provider-onboarding/ActionCard";
import type { Provider } from "@/lib/types/provider";

// Complete mock provider matching the Provider interface
const mockProvider: Provider = {
  provider_id: "preview-sunrise-123",
  provider_name: "Sunrise Senior Care of Houston",
  provider_category: "Assisted Living",
  main_category: "Assisted Living",
  phone: "(713) 555-0123",
  email: "admissions@sunriseseniorhouston.com",
  website: "https://sunriseseniorhouston.com",
  google_rating: 4.7,
  address: "4521 Westheimer Road",
  city: "Houston",
  state: "TX",
  zipcode: 77027,
  lat: 29.7420,
  lon: -95.4587,
  place_id: "ChIJ_preview_place_id",
  provider_images: "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=800 | https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=800",
  provider_logo: null,
  provider_description: "Sunrise Senior Care provides exceptional assisted living services in the heart of Houston. Our dedicated staff offers personalized care plans, engaging activities, and a warm, home-like environment for seniors seeking supportive living arrangements.",
  community_Score: 85,
  value_score: 78,
  information_availability_score: 92,
  lower_price: 4200,
  upper_price: 6800,
  contact_for_price: null,
  deleted: false,
  deleted_at: null,
  hero_image_url: "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=800",
  slug: "sunrise-senior-care-houston-tx",
  google_reviews_data: null,
  cms_data: null,
  ai_trust_signals: null,
  last_viewed_at: null,
};

// Mock provider WITHOUT email (for testing no-email states)
const mockProviderNoEmail: Provider = {
  ...mockProvider,
  provider_id: "preview-oakwood-456",
  provider_name: "Oakwood Memory Care",
  email: null,
  slug: "oakwood-memory-care-houston-tx",
};

// Realistic mock notification data
const mockLeadNotification: NotificationData = {
  type: "lead",
  id: "conn-8f3a2b1c-4d5e-6f7g-8h9i-0j1k2l3m4n5o",
  created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
  message: "I'm looking for care for my mother who has early-stage dementia.",
  metadata: {
    care_type: "memory_care",
    auto_intro: "Hi, I'm looking for memory care services for my 78-year-old mother. She was recently diagnosed with early-stage Alzheimer's and needs assistance with daily activities and medication management. We're hoping to find a caring community close to the Galleria area.",
  },
  from_profile: {
    display_name: "Sarah Johnson",
    city: "Houston",
    state: "TX",
    image_url: null,
  },
};

const mockQuestionNotification: NotificationData = {
  type: "question",
  id: "q-7e2d1c0b-9a8f-7e6d-5c4b-3a2f1e0d9c8b",
  created_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // 5 hours ago
  question: "Do you offer respite care services? My regular caregiver is going on vacation next month and I need temporary care for my father for about two weeks. He requires help with mobility and takes several medications daily.",
  asker_name: "Michael Chen",
};

const mockReviewNotification: NotificationData = {
  type: "review",
  id: "rev-1a2b3c4d-5e6f-7g8h-9i0j-k1l2m3n4o5p6",
  created_at: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(), // 1 day ago
  rating: 5,
  comment: "The staff here is absolutely wonderful. They treated my grandmother with such kindness and respect during her two-year stay. The facility is always clean and well-maintained, and they have so many engaging activities. The memory care unit especially impressed us with their patient, loving approach. Highly recommend to anyone looking for quality senior care!",
  reviewer_name: "Emily Rodriguez",
};

const mock4StarReview: NotificationData = {
  type: "review",
  id: "rev-4star-example",
  created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
  rating: 4,
  comment: "Good facility overall. Staff is friendly and attentive. Food could be better but the care quality is excellent.",
  reviewer_name: "Robert Williams",
};

// All states to preview with comprehensive descriptions
const ALL_STATES: {
  state: ActionCardState;
  label: string;
  description: string;
  needsNotification?: NotificationData;
  useNoEmailProvider?: boolean;
}[] = [
  {
    state: "notification-lead",
    label: "New Lead",
    description: "Provider receives a new care inquiry from a family. Shows person info, care type badge, and message preview.",
    needsNotification: mockLeadNotification,
  },
  {
    state: "notification-question",
    label: "New Question",
    description: "Someone asks a Q&A question on the provider's listing. Shows asker name and question in a teal box.",
    needsNotification: mockQuestionNotification,
  },
  {
    state: "notification-review",
    label: "New Review (5 stars)",
    description: "Someone leaves a 5-star review. Shows reviewer name, star rating, and comment preview.",
    needsNotification: mockReviewNotification,
  },
  {
    state: "notification-review",
    label: "New Review (4 stars)",
    description: "Example of a 4-star review to see different star counts.",
    needsNotification: mock4StarReview,
  },
  {
    state: "pre-verified",
    label: "Pre-verified (Campaign Email)",
    description: "User clicked marketing email with valid token. Email already verified - just need to sign in to complete claim.",
  },
  {
    state: "verify-form",
    label: "Verify Email (Has Email)",
    description: "Default state when provider has email on file. Shows masked email and 'Send verification code' button.",
  },
  {
    state: "verify-form",
    label: "Verify Email (No Email)",
    description: "When provider has NO email on file. Shows 'We don't have your email' prompt.",
    useNoEmailProvider: true,
  },
  {
    state: "verify-code",
    label: "Enter Verification Code",
    description: "After sending code. Shows 6-digit input boxes, resend link, and 'I don't have access' option.",
  },
  {
    state: "no-access",
    label: "No Access (Identity Form)",
    description: "User clicked 'I don't have access to business email'. Shows identity verification form with name, email, phone, role fields.",
  },
  {
    state: "no-access-success",
    label: "Request Submitted",
    description: "After submitting identity form. Shows success message and 'Return to listing' button.",
  },
  {
    state: "already-claimed",
    label: "Already Claimed",
    description: "Listing is already claimed by someone else. Shows amber lock icon and 'Dispute listing' button.",
  },
  {
    state: "dispute-submitted",
    label: "Dispute Submitted",
    description: "After submitting ownership dispute. Shows success message.",
  },
];

export default function ActionCardPreviewPage() {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isSignedIn, setIsSignedIn] = useState(false);

  const currentStateConfig = ALL_STATES[selectedIndex];
  const currentProvider = currentStateConfig?.useNoEmailProvider ? mockProviderNoEmail : mockProvider;

  return (
    <div className="min-h-screen bg-gradient-to-b from-vanilla-50 via-white to-white py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-display font-bold text-gray-900 mb-2">
            ActionCard States Preview
          </h1>
          <p className="text-gray-500 max-w-xl mx-auto">
            Interactive preview of all provider onboarding ActionCard states.
            Use the controls below to switch between states and auth modes.
          </p>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* State selector */}
            <div className="lg:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Card State ({selectedIndex + 1} of {ALL_STATES.length})
              </label>
              <select
                value={selectedIndex}
                onChange={(e) => setSelectedIndex(Number(e.target.value))}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-[15px] focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-transparent"
              >
                {ALL_STATES.map((s, i) => (
                  <option key={i} value={i}>
                    {s.label}
                  </option>
                ))}
              </select>
              {currentStateConfig && (
                <p className="mt-2 text-sm text-gray-500">{currentStateConfig.description}</p>
              )}
            </div>

            {/* Auth toggle */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                User Auth State
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsSignedIn(false)}
                  className={`flex-1 px-3 py-3 rounded-xl text-sm font-medium transition-all ${
                    !isSignedIn
                      ? "bg-primary-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  Signed Out
                </button>
                <button
                  onClick={() => setIsSignedIn(true)}
                  className={`flex-1 px-3 py-3 rounded-xl text-sm font-medium transition-all ${
                    isSignedIn
                      ? "bg-primary-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  Signed In
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-400">
                Affects notification card CTAs
              </p>
            </div>
          </div>

          {/* Navigation arrows */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100">
            <button
              onClick={() => setSelectedIndex((i) => Math.max(0, i - 1))}
              disabled={selectedIndex === 0}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Previous
            </button>
            <span className="text-sm text-gray-400">
              {selectedIndex + 1} / {ALL_STATES.length}
            </span>
            <button
              onClick={() => setSelectedIndex((i) => Math.min(ALL_STATES.length - 1, i + 1))}
              disabled={selectedIndex === ALL_STATES.length - 1}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Next
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Current State Badge */}
        <div className="flex items-center justify-center gap-2 mb-4">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-700">
            state=&quot;{currentStateConfig?.state}&quot;
          </span>
          {currentStateConfig?.needsNotification && (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-primary-50 text-primary-700">
              + notificationData
            </span>
          )}
          {currentStateConfig?.useNoEmailProvider && (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-amber-50 text-amber-700">
              no email on file
            </span>
          )}
        </div>

        {/* Card Preview */}
        <div className="max-w-xl mx-auto">
          <ActionCard
            key={`${selectedIndex}-${isSignedIn}`}
            provider={currentProvider}
            claimSession="preview-session-123"
            initialState={currentStateConfig?.state || "verify-form"}
            onVerificationComplete={() => alert("onVerificationComplete() called!")}
            preVerifiedEmail={currentStateConfig?.state === "pre-verified" ? "a***s@sunriseseniorhouston.com" : undefined}
            notificationData={currentStateConfig?.needsNotification || null}
            isSignedIn={isSignedIn}
          />
        </div>

        {/* Quick Jump */}
        <div className="mt-10 pt-8 border-t border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Jump</h2>
          <div className="flex flex-wrap gap-2">
            {ALL_STATES.map((s, i) => (
              <button
                key={i}
                onClick={() => setSelectedIndex(i)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  selectedIndex === i
                    ? "bg-primary-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Info Footer */}
        <div className="mt-8 p-4 bg-gray-50 rounded-xl text-sm text-gray-500">
          <p className="font-medium text-gray-700 mb-1">Testing Notes:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Toggle &quot;Signed In&quot; to see different CTAs on notification cards</li>
            <li>Notification cards (lead/question/review) show context from emails</li>
            <li>The &quot;No Email&quot; variant shows what happens when provider has no email on file</li>
            <li>Buttons trigger alerts instead of actual actions in this preview</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
