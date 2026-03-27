"use client";

import { useState } from "react";
import Image from "next/image";
import { useAuth } from "@/components/auth/AuthProvider";
import type { BusinessProfile, FamilyMetadata } from "@/lib/types";
import { useProfileCompleteness, type SectionStatus } from "./completeness";
import { BenefitsFinderBanner } from "./ProfileEditContent";
import ProfileEditWizard from "./ProfileEditWizard";

// ── Constants ──

const TIMELINE_LABELS: Record<string, string> = {
  immediate: "As soon as possible",
  within_1_month: "Within a month",
  within_3_months: "In a few months",
  exploring: "Just researching",
};

const CONTACT_PREF_LABELS: Record<string, string> = {
  call: "Phone call",
  text: "Text message",
  email: "Email",
};

const SCHEDULE_LABELS: Record<string, string> = {
  mornings: "Mornings",
  afternoons: "Afternoons",
  evenings: "Evenings",
  overnight: "Overnight",
  full_time: "Full-time / Live-in",
  flexible: "Flexible",
};

// Map section index to wizard step
type WizardStep = 1 | 2 | 3 | 4;

// ── Main Component ──

interface FamilyProfileViewProps {
  /** Override the profile to render. Falls back to activeProfile from context. */
  profile?: BusinessProfile | null;
}

export default function FamilyProfileView({ profile: profileProp }: FamilyProfileViewProps = {}) {
  const { user, activeProfile, refreshAccountData } = useAuth();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardInitialStep, setWizardInitialStep] = useState<WizardStep>(1);

  const profile = (profileProp ?? activeProfile) as BusinessProfile;
  const meta = (profile?.metadata || {}) as FamilyMetadata;
  const userEmail = user?.email || "";

  const { percentage, sectionStatus } = useProfileCompleteness(profile, userEmail);

  const openWizard = (step: WizardStep = 1) => {
    setWizardInitialStep(step);
    setWizardOpen(true);
  };

  const handleWizardClose = () => {
    setWizardOpen(false);
  };

  const handleWizardSaved = () => {
    setWizardOpen(false);
    refreshAccountData();
  };

  if (!profile) return null;

  // ── Derived display values ──
  const location = [profile.city, profile.state].filter(Boolean).join(", ");
  const careTypesDisplay = profile.care_types?.length ? profile.care_types.join(", ") : null;
  const careNeedsDisplay = meta.care_needs?.length ? meta.care_needs.join(", ") : null;
  const timelineDisplay = meta.timeline ? TIMELINE_LABELS[meta.timeline] || meta.timeline : null;
  const scheduleDisplay = meta.schedule_preference ? SCHEDULE_LABELS[meta.schedule_preference] || meta.schedule_preference : null;
  const contactPrefDisplay = meta.contact_preference ? CONTACT_PREF_LABELS[meta.contact_preference] || meta.contact_preference : null;
  const descriptionDisplay = meta.about_situation || profile.description || null;
  const ageDisplay = meta.age ? `${meta.age} years old` : null;

  return (
    <div className="max-w-2xl">
      {/* Profile Edit Wizard Modal */}
      {wizardOpen && (
        <ProfileEditWizard
          profile={profile}
          userEmail={userEmail}
          initialStep={wizardInitialStep}
          onClose={handleWizardClose}
          onSaved={handleWizardSaved}
        />
      )}

      <div className="rounded-2xl bg-white border border-gray-200/80 shadow-sm divide-y divide-gray-100">
        {/* ── Profile Header ── */}
        <div className="p-5 sm:p-6">
          {/* Mobile: Stacked layout */}
          <div className="flex flex-col items-center text-center sm:hidden">
            {/* Avatar */}
            <button
              type="button"
              onClick={() => openWizard(1)}
              className="w-24 h-24 rounded-full overflow-hidden bg-gray-50 ring-[3px] ring-gray-100 shadow-sm flex items-center justify-center mb-4 hover:ring-primary-200 transition-all group"
            >
              {profile.image_url ? (
                <>
                  <Image src={profile.image_url} alt={profile.display_name || "Profile"} width={96} height={96} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center gap-0.5 text-gray-400 group-hover:text-primary-600 transition-colors">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
              )}
            </button>

            {/* Name and details */}
            <h2 className="text-xl font-display font-bold text-gray-900 tracking-tight mb-1">
              {profile.display_name || "Your Name"}
            </h2>
            <p className="text-[14px] text-gray-500 mb-3">
              {location || "Location not set"}
              <span className="mx-1.5 text-gray-300">&middot;</span>
              Family care seeker
            </p>

            {/* Progress bar */}
            {percentage < 100 && (
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-28 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${percentage >= 80 ? "bg-gray-700" : "bg-warning-400"}`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <span className={`text-xs font-medium ${percentage >= 80 ? "text-gray-600" : "text-warning-600"}`}>
                  {percentage}%
                </span>
              </div>
            )}

            {/* Edit button */}
            <button
              type="button"
              onClick={() => openWizard(1)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-[14px] font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit profile
            </button>
          </div>

          {/* Desktop: Horizontal layout */}
          <div className="hidden sm:flex items-center gap-5">
            <button
              type="button"
              onClick={() => openWizard(1)}
              className="shrink-0 relative group"
            >
              <div className="w-[88px] h-[88px] rounded-full overflow-hidden bg-gray-50 ring-[3px] ring-gray-100 hover:ring-primary-200 shadow-xs flex items-center justify-center transition-all">
                {profile.image_url ? (
                  <Image src={profile.image_url} alt={profile.display_name || "Profile"} width={88} height={88} className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center gap-0.5 text-gray-400 group-hover:text-primary-600 transition-colors">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                )}
              </div>
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </div>
            </button>

            <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-display font-bold text-gray-900 truncate tracking-tight">
                {profile.display_name || "Your Name"}
              </h2>
              <p className="text-base text-gray-500 mt-1">
                {location || "Location not set"}
                <span className="mx-1.5 text-gray-300">&middot;</span>
                Family care seeker
              </p>
              {percentage < 100 && (
                <div className="flex items-center gap-2.5 mt-2.5">
                  <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${percentage >= 80 ? "bg-gray-700" : "bg-warning-400"}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <span className={`text-xs font-medium ${percentage >= 80 ? "text-gray-600" : "text-warning-600"}`}>
                    {percentage}%
                  </span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => openWizard(1)}
              className="shrink-0 self-start mt-1 inline-flex items-center gap-1.5 px-4 py-2 text-[14px] font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit profile
            </button>
          </div>
        </div>

        {/* ── Contact Information ── */}
        <SectionCard
          title="Contact Information"
          status={sectionStatus[1]}
          onEdit={() => openWizard(2)}
        >
          <div className="divide-y divide-gray-50">
            <ViewRow label="Email" value={profile.email || userEmail || null} />
            <ViewRow label="Phone" value={profile.phone} />
            <ViewRow label="Preferred contact method" value={contactPrefDisplay} />
          </div>
        </SectionCard>

        {/* ── Care Preferences ── */}
        <SectionCard
          title="Care Preferences"
          status={sectionStatus[2]}
          onEdit={() => openWizard(3)}
        >
          <div className="divide-y divide-gray-50">
            <ViewRow label="Who needs care" value={meta.relationship_to_recipient || null} />
            <ViewRow label="Age" value={ageDisplay} />
            <ViewRow label="Type of care" value={careTypesDisplay} />
            <ViewRow label="Help needed" value={careNeedsDisplay} />
            <ViewRow label="Timeline" value={timelineDisplay} />
            <ViewRow label="Schedule" value={scheduleDisplay} />
            {descriptionDisplay && (
              <div className="py-3">
                <p className="text-[13px] font-medium text-gray-500">About the situation</p>
                <p className="text-[15px] text-gray-900 mt-0.5 whitespace-pre-wrap">{descriptionDisplay}</p>
              </div>
            )}
            {!descriptionDisplay && <ViewRow label="About the situation" value={null} />}
          </div>
        </SectionCard>

        {/* ── Payment & Benefits ── */}
        <SectionCard
          title="Payment & Benefits"
          status={sectionStatus[3]}
          onEdit={() => openWizard(4)}
        >
          {meta.payment_methods && meta.payment_methods.length > 0 ? (
            <div className="flex flex-wrap gap-2 mb-4">
              {meta.payment_methods.map((method) => (
                <span key={method} className="px-3 py-1.5 text-sm font-medium rounded-lg bg-[#F5F4F1] text-gray-700">
                  {method}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic mb-4">Not added</p>
          )}
          {meta.saved_benefits && meta.saved_benefits.length > 0 && (
            <div className="mb-4">
              <p className="text-[13px] font-medium text-gray-500 mb-2">Saved benefits</p>
              <div className="flex flex-wrap gap-2">
                {meta.saved_benefits.map((benefit) => (
                  <span key={benefit} className="px-3 py-1.5 text-sm font-medium rounded-lg bg-gray-50 text-gray-600 border border-gray-200">
                    {benefit}
                  </span>
                ))}
              </div>
            </div>
          )}
          <BenefitsFinderBanner />
        </SectionCard>
      </div>
    </div>
  );
}

// ── Helper Components ──

function SectionBadge({ status }: { status: SectionStatus | undefined }) {
  if (!status || status === "complete") {
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-success-50">
        <svg className="w-3 h-3 text-success-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      </span>
    );
  }
  const label = status === "empty" ? "Not added" : "Incomplete";
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-warning-50 text-warning-700">
      {label}
    </span>
  );
}

function SectionCard({
  title,
  status,
  onEdit,
  children,
}: {
  title: string;
  status: SectionStatus | undefined;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  const editLabel = status === "empty" ? "Add" : "Edit";

  return (
    <div
      className="p-5 sm:p-6 cursor-pointer hover:bg-gray-50/50 transition-colors group"
      onClick={onEdit}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onEdit(); } }}
    >
      {/* Header row */}
      <div className="flex items-center gap-2.5 mb-4">
        <h3 className="text-lg font-display font-bold text-gray-900">{title}</h3>
        <SectionBadge status={status} />
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="ml-auto text-[14px] font-medium text-primary-600 hover:text-primary-700 transition-colors opacity-0 group-hover:opacity-100"
        >
          {editLabel} &rarr;
        </button>
      </div>

      {/* View content */}
      {children}
    </div>
  );
}

function ViewRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="py-3">
      <p className="text-[13px] font-medium text-gray-500">{label}</p>
      {value ? (
        <p className="text-[15px] text-gray-900 mt-0.5">{value}</p>
      ) : (
        <p className="text-sm text-gray-400 italic mt-0.5">Not added</p>
      )}
    </div>
  );
}
