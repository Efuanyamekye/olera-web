"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import type { ProfileType } from "@/lib/types";
import Button from "@/components/ui/Button";

interface RoleGateProps {
  /** The profile type(s) required to view this content. */
  requiredType: ProfileType | ProfileType[];
  /** Content to render when the user has the right profile type. */
  children: React.ReactNode;
  /** Optional label for the action that requires the role. */
  actionLabel?: string;
}

/**
 * RoleGate checks the active profile type and shows a contextual prompt
 * if the user's current profile doesn't match the required type.
 *
 * It handles:
 * - Not authenticated → prompt to sign in
 * - No active profile → prompt to complete onboarding
 * - Wrong profile type but user owns a matching one → prompt to switch
 * - Wrong profile type and no matching profile → prompt to create one
 * - Correct profile type → render children
 */
export default function RoleGate({ requiredType, children, actionLabel }: RoleGateProps) {
  const { user, account, activeProfile, profiles, openAuth, switchProfile } = useAuth();

  const requiredTypes = Array.isArray(requiredType) ? requiredType : [requiredType];
  const typeLabels = requiredTypes.map(formatType).join(" or ");

  // Not logged in
  if (!user || !account) {
    return (
      <div className="max-w-lg mx-auto text-center py-16 px-4">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Sign in required</h2>
        <p className="text-base text-gray-600 mb-6">
          {actionLabel
            ? `You need to sign in to ${actionLabel}.`
            : `This page requires a ${typeLabels} account.`}
        </p>
        <Button onClick={() => openAuth({ defaultMode: "sign-in" })}>
          Sign in
        </Button>
      </div>
    );
  }

  // No active profile
  if (!activeProfile) {
    return (
      <div className="max-w-lg mx-auto text-center py-16 px-4">
        <h2 className="text-xl font-bold text-gray-900 mb-2">Complete your profile</h2>
        <p className="text-base text-gray-600 mb-6">
          Set up your profile to access this page.
        </p>
        <Button onClick={() => openAuth()}>Get started</Button>
      </div>
    );
  }

  // Check if active profile matches
  if (requiredTypes.includes(activeProfile.type)) {
    return <>{children}</>;
  }

  // User has the wrong active profile — check if they own a matching one
  const matchingProfile = profiles.find((p) => requiredTypes.includes(p.type));

  if (matchingProfile) {
    return (
      <div className="max-w-lg mx-auto text-center py-16 px-4">
        <h2 className="text-xl font-bold text-gray-900 mb-2">
          Switch to your {formatType(matchingProfile.type)} profile
        </h2>
        <p className="text-base text-gray-600 mb-6">
          {actionLabel
            ? `You need a ${typeLabels} profile to ${actionLabel}.`
            : `This page is for ${typeLabels} profiles.`}
          {" "}You have one — switch to <strong>{matchingProfile.display_name}</strong> to continue.
        </p>
        <Button onClick={() => switchProfile(matchingProfile.id)}>
          Switch to {matchingProfile.display_name}
        </Button>
      </div>
    );
  }

  // User doesn't own a matching profile at all — offer to create one
  return (
    <div className="max-w-lg mx-auto text-center py-16 px-4">
      <h2 className="text-xl font-bold text-gray-900 mb-2">
        {typeLabels} profile required
      </h2>
      <p className="text-base text-gray-600 mb-6">
        {actionLabel
          ? `You need a ${typeLabels} profile to ${actionLabel}.`
          : `This page is only available to ${typeLabels} profiles.`}
        {" "}You can create one to get started.
      </p>
      <Button onClick={() => openAuth()}>Create a {typeLabels} profile</Button>
    </div>
  );
}

function formatType(type: ProfileType): string {
  switch (type) {
    case "organization":
      return "organization";
    case "caregiver":
      return "private caregiver";
    case "family":
      return "family";
    default:
      return type;
  }
}
