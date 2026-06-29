"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import Modal from "@/components/ui/Modal";
import GooglePlaceSearch from "@/components/providers/GooglePlaceSearch";
import VerificationMethodModal from "@/components/provider/VerificationMethodModal";
import { useVerificationModal } from "@/lib/hooks/useVerificationModal";
import PasskeysSection from "@/components/account/PasskeysSection";
import { useMobileNavVariant } from "@/hooks/use-mobile-nav-variant";

type SettingsTab = "account" | "notifications";

// Notification configurations per account type
// Activity-based notifications are controllable by user
// Transactional emails (auth, connection confirmations) always send
const FAMILY_NOTIFICATIONS = [
  {
    key: "messages_and_responses",
    title: "Messages & responses",
    description: "When a provider messages you or responds to your inquiry",
    channels: ["email", "whatsapp"] as const,
  },
  {
    key: "match_updates",
    title: "Match updates",
    description: "When providers reach out to you on Matches",
    channels: ["email", "whatsapp"] as const,
  },
  {
    key: "followup_reviews",
    title: "Follow-up & reviews",
    description: "Requests to share your experience after connecting with a provider",
    channels: ["email"] as const,
  },
] as const;

const ORGANIZATION_NOTIFICATIONS = [
  {
    key: "new_leads",
    title: "New leads",
    description: "When families send you inquiries or connection requests",
    channels: ["email", "sms", "whatsapp"] as const,
  },
  {
    key: "reviews_and_questions",
    title: "Reviews & questions",
    description: "When you receive new reviews or Q&A questions",
    channels: ["email"] as const,
  },
  {
    key: "messages",
    title: "Messages",
    description: "When families message you",
    channels: ["email", "whatsapp"] as const,
  },
] as const;

const CAREGIVER_NOTIFICATIONS = [
  {
    key: "interview_requests",
    title: "Interview requests",
    description: "When employers want to interview you",
    channels: ["email"] as const,
  },
  {
    key: "application_updates",
    title: "Application updates",
    description: "When your application is accepted or declined",
    channels: ["email"] as const,
  },
] as const;

type NotificationKey =
  | (typeof FAMILY_NOTIFICATIONS)[number]["key"]
  | (typeof ORGANIZATION_NOTIFICATIONS)[number]["key"]
  | (typeof CAREGIVER_NOTIFICATIONS)[number]["key"];

export default function AccountSettingsPage() {
  const router = useRouter();
  const { user, activeProfile, profiles, refreshAccountData } = useAuth();

  // Determine account type for notifications
  const profileType = activeProfile?.type;
  const isFamily = profileType === "family";
  const isOrganization = profileType === "organization";
  const isCaregiver = profileType === "caregiver" || profileType === "student";
  const isProvider = isOrganization || isCaregiver;

  // Mobile nav variant for providers
  const mobileNavVariant = useMobileNavVariant();
  // Verification state (for providers only)
  const verificationState = activeProfile?.verification_state as string | null;
  const isVerified =
    verificationState === "verified" ||
    verificationState === "not_required" ||
    !isProvider; // Non-providers don't need verification

  // Verification modal
  const {
    isOpen: isVerificationModalOpen,
    open: openVerificationModal,
    close: closeVerificationModal,
    handleSubmit: handleVerificationSubmit,
    handleDismiss: handleVerificationDismiss,
  } = useVerificationModal({
    profileId: activeProfile?.id || "",
    onVerified: () => {
      closeVerificationModal();
      router.refresh();
    },
  });

  // Tab state
  const [activeTab, setActiveTab] = useState<SettingsTab>("account");

  // Notification prefs — optimistic overrides for instant toggle response
  const meta = (activeProfile?.metadata || {}) as Record<string, unknown>;
  const notifPrefs = (meta.notification_prefs || {}) as Record<string, Record<string, boolean>>;
  const [optimisticNotifs, setOptimisticNotifs] = useState<Record<string, boolean>>({});
  const [notifError, setNotifError] = useState<string | null>(null);

  // Auto-dismiss notification error after 4 seconds
  useEffect(() => {
    if (!notifError) return;
    const timer = setTimeout(() => setNotifError(null), 4000);
    return () => clearTimeout(timer);
  }, [notifError]);

  /** Returns the display value for a notification toggle (optimistic → server → default) */
  const getNotifOn = useCallback(
    (key: string, channel: "email" | "sms" | "whatsapp"): boolean => {
      const oKey = `${key}_${channel}`;
      if (oKey in optimisticNotifs) return optimisticNotifs[oKey];
      if (channel === "whatsapp") return notifPrefs[key]?.[channel] ?? ((meta.whatsapp_opted_in as boolean) ?? false);
      return notifPrefs[key]?.[channel] ?? (channel === "email");
    },
    [optimisticNotifs, notifPrefs, meta.whatsapp_opted_in]
  );

  // Account editing
  const [editingField, setEditingField] = useState<"email" | "phone" | "password" | null>(null);
  const [fieldValue, setFieldValue] = useState("");
  const [fieldSaving, setFieldSaving] = useState(false);
  const [fieldError, setFieldError] = useState("");
  const [fieldSuccess, setFieldSuccess] = useState("");

  // Email verification
  const [sendingVerification, setSendingVerification] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  // Delete account
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  // Subscription management (providers only)
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const hasActiveSubscription = !!(meta.medjobs_subscription_active as boolean);

  // Google Business Profile (providers only)
  const googleMetadata = (meta.google_metadata || {}) as { place_id?: string };
  const hasGooglePlaceId = !!googleMetadata.place_id;
  const [googlePlaceIdInput, setGooglePlaceIdInput] = useState<string | null>(null);
  const [googleSelectedName, setGoogleSelectedName] = useState<string | null>(null);
  const [googleSaving, setGoogleSaving] = useState(false);
  const [googleError, setGoogleError] = useState("");
  const [showGoogleConfirm, setShowGoogleConfirm] = useState(false);


  // ── Notification toggle (optimistic — flips instantly, persists in background) ──
  const handleNotifToggle = useCallback(
    (key: NotificationKey, channel: "email" | "sms" | "whatsapp") => {
      if (!activeProfile || !isSupabaseConfigured()) return;

      const oKey = `${key}_${channel}`;
      const currentValue = getNotifOn(key, channel);
      const newValue = !currentValue;

      // Flip immediately in the UI
      setOptimisticNotifs((prev) => ({ ...prev, [oKey]: newValue }));

      // Persist in background — use local metadata as base (skip extra SELECT)
      (async () => {
        try {
          const supabase = createClient();
          const currentMeta = (activeProfile.metadata || {}) as Record<string, unknown>;
          const currentPrefs = (currentMeta.notification_prefs || {}) as Record<string, Record<string, boolean>>;

          const updatedPrefs = {
            ...currentPrefs,
            [key]: { ...(currentPrefs[key] || {}), [channel]: newValue },
          };

          const { error } = await supabase
            .from("business_profiles")
            .update({
              metadata: { ...currentMeta, notification_prefs: updatedPrefs },
            })
            .eq("id", activeProfile.id);

          if (error) throw error;
          await refreshAccountData();
        } catch {
          setNotifError("Couldn't update notification settings. Please try again.");
        } finally {
          // Clear optimistic override — server data is now canonical
          setOptimisticNotifs((prev) => {
            const next = { ...prev };
            delete next[oKey];
            return next;
          });
        }
      })();
    },
    [activeProfile, getNotifOn, refreshAccountData]
  );

  // ── Send verification email ──
  const sendVerificationEmail = async () => {
    if (!user?.email || !isSupabaseConfigured()) return;
    setSendingVerification(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: user.email,
      });
      if (error) throw error;
      setVerificationSent(true);
    } catch (err) {
      console.error("Failed to send verification email:", err);
    } finally {
      setSendingVerification(false);
    }
  };

  // ── Account field editing ──
  const startEdit = (field: "email" | "phone" | "password") => {
    setEditingField(field);
    setFieldError("");
    setFieldSuccess("");
    if (field === "email") setFieldValue(user?.email || "");
    else if (field === "phone") setFieldValue(activeProfile?.phone || "");
    else setFieldValue("");
  };

  const saveField = async () => {
    if (!isSupabaseConfigured()) return;

    // Check verification before saving email or phone (providers only)
    if ((editingField === "email" || editingField === "phone") && !isVerified) {
      openVerificationModal();
      return;
    }

    setFieldSaving(true);
    setFieldError("");
    setFieldSuccess("");

    try {
      const supabase = createClient();

      if (editingField === "email") {
        const { error: authError } = await supabase.auth.updateUser({
          email: fieldValue,
        });
        if (authError) throw authError;
        setFieldSuccess("Confirmation email sent to your new address.");
      } else if (editingField === "phone") {
        if (!activeProfile) throw new Error("No profile");
        const { error: updateError } = await supabase
          .from("business_profiles")
          .update({ phone: fieldValue || null })
          .eq("id", activeProfile.id);
        if (updateError) throw updateError;
        await refreshAccountData();
        setFieldSuccess("Phone updated.");
      } else if (editingField === "password") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(
          user?.email || "",
          { redirectTo: `${window.location.origin}/auth/reset-password` }
        );
        if (resetError) throw resetError;
        setFieldSuccess("Password reset email sent.");
      }

      setTimeout(() => setEditingField(null), 1500);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : "Something went wrong";
      setFieldError(msg);
    } finally {
      setFieldSaving(false);
    }
  };

  // ── Delete account ──
  const handleDelete = async () => {
    // Check verification before deleting (providers only)
    if (!isVerified) {
      setShowDeleteModal(false);
      openVerificationModal();
      return;
    }

    setDeleting(true);
    setDeleteError("");

    try {
      const res = await fetch("/api/auth/delete-account", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete account");
      }

      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/");
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : "Something went wrong";
      setDeleteError(msg);
    } finally {
      setDeleting(false);
    }
  };

  // ── Subscription management ──
  const handleUpgrade = async () => {
    setSubscriptionLoading(true);
    try {
      const res = await fetch("/api/medjobs/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnUrl: "/account/settings" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start checkout");
      if (data.url) window.location.href = data.url;
    } catch (err) {
      console.error("Upgrade error:", err);
    } finally {
      setSubscriptionLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    setSubscriptionLoading(true);
    try {
      const res = await fetch("/api/medjobs/billing-portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to open billing portal");
      if (data.url) window.location.href = data.url;
    } catch (err) {
      console.error("Billing portal error:", err);
    } finally {
      setSubscriptionLoading(false);
    }
  };

  // ── Google Business Profile connection ──
  const handleGoogleConnect = async () => {
    if (!googlePlaceIdInput) return;
    setGoogleSaving(true);
    setGoogleError("");

    try {
      const res = await fetch("/api/provider/google-business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ place_id_or_url: googlePlaceIdInput }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to connect");

      await refreshAccountData();
      setShowGoogleConfirm(false);
      setGooglePlaceIdInput(null);
      setGoogleSelectedName(null);
    } catch (err) {
      setGoogleError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setGoogleSaving(false);
    }
  };

  // Get the correct notifications config based on profile type
  const getNotifications = () => {
    if (isOrganization) return ORGANIZATION_NOTIFICATIONS;
    if (isCaregiver) return CAREGIVER_NOTIFICATIONS;
    return FAMILY_NOTIFICATIONS;
  };

  const notifications = getNotifications();

  // Get account type label for display
  const getAccountTypeLabel = () => {
    if (isOrganization) return "Organization";
    if (isCaregiver) return "Caregiver";
    return "Family";
  };

  // Show bottom tabs UI for organization providers with bottom_tabs variant
  // (caregivers have different nav - the mobile nav variant is for org providers only)
  // Default to true when variant is null (brief moment during load) to prevent flash
  const showBottomTabs = isOrganization && mobileNavVariant !== "current";

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Mobile header with back button (provider with bottom_tabs variant) */}
      {showBottomTabs && (
        <div className="lg:hidden sticky top-0 z-40 bg-white border-b border-gray-200">
          <div className="flex items-center gap-3 px-4 py-3">
            <Link
              href="/provider"
              className="flex items-center justify-center w-10 h-10 -ml-2 rounded-full hover:bg-gray-100 transition-colors"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </Link>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Account Settings</h1>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Desktop header (or mobile without bottom_tabs) */}
        <div className={`mb-5 ${showBottomTabs ? "hidden lg:block" : ""}`}>
          <h2 className="text-2xl font-display font-bold text-gray-900">
            Account Settings
          </h2>
          <p className="text-[15px] text-gray-500 mt-1">
            Manage your {getAccountTypeLabel().toLowerCase()} account, login, and notification preferences.
          </p>
        </div>

        <div className="max-w-2xl">
          {/* Tabs - segmented control style */}
          <div className="mb-6">
            <div className="inline-flex gap-0.5 bg-vanilla-50 border border-warm-100/60 p-0.5 rounded-xl">
              <button
                onClick={() => setActiveTab("account")}
                className={`px-5 py-2.5 rounded-[10px] text-sm font-semibold transition-all duration-150 min-h-[44px] ${
                  activeTab === "account"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Account
              </button>
              <button
                onClick={() => setActiveTab("notifications")}
                className={`px-5 py-2.5 rounded-[10px] text-sm font-semibold transition-all duration-150 min-h-[44px] ${
                  activeTab === "notifications"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Notifications
              </button>
            </div>
          </div>

          {/* Tab Content - flat sections on mobile, card container on desktop */}
          <div className="divide-y divide-gray-100 bg-white lg:rounded-2xl lg:border lg:border-gray-200/80">
            {activeTab === "account" ? (
              <>
                {/* ── Account Info ── */}
                <div className="px-4 py-5 lg:p-6">
                  <div className="divide-y divide-gray-100">
                    <AccountRow
                      label="Email"
                      value={user?.email || "Not set"}
                      verified={!!user?.email_confirmed_at}
                      onVerify={sendVerificationEmail}
                      verifying={sendingVerification}
                      verificationSent={verificationSent}
                      isEditing={editingField === "email"}
                      editValue={fieldValue}
                      onEditChange={setFieldValue}
                      onStartEdit={() => startEdit("email")}
                      onSave={saveField}
                      onCancel={() => setEditingField(null)}
                      saving={fieldSaving}
                      error={editingField === "email" ? fieldError : ""}
                      success={editingField === "email" ? fieldSuccess : ""}
                      inputType="email"
                    />
                    <AccountRow
                      label="Phone"
                      value={activeProfile?.phone || "Not set"}
                      isEditing={editingField === "phone"}
                      editValue={fieldValue}
                      onEditChange={setFieldValue}
                      onStartEdit={() => startEdit("phone")}
                      onSave={saveField}
                      onCancel={() => setEditingField(null)}
                      saving={fieldSaving}
                      error={editingField === "phone" ? fieldError : ""}
                      success={editingField === "phone" ? fieldSuccess : ""}
                      inputType="tel"
                      placeholder="(555) 123-4567"
                    />
                    <AccountRow
                      label="Password"
                      value={"\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"}
                      isEditing={editingField === "password"}
                      editValue=""
                      onEditChange={() => {}}
                      onStartEdit={() => startEdit("password")}
                      onSave={saveField}
                      onCancel={() => setEditingField(null)}
                      saving={fieldSaving}
                      error={editingField === "password" ? fieldError : ""}
                      success={editingField === "password" ? fieldSuccess : ""}
                      isPassword
                    />
                  </div>
                </div>

                {/* ── Passkeys ── */}
                <PasskeysSection />

                {/* ── Subscription (Providers only) ── */}
                {isProvider && (
                  <div className="px-4 py-5 lg:p-6">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[15px] font-semibold text-gray-900">
                        Olera Pro
                      </p>
                      {hasActiveSubscription && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                          Active
                        </span>
                      )}
                    </div>

                    {hasActiveSubscription ? (
                      /* ── Subscribed state ── */
                      <div>
                        <p className="text-sm text-gray-500 mb-4">
                          Premium tools to grow your care business.
                        </p>
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-gray-600">
                            <span className="font-medium text-gray-900">$49</span>
                            <span className="text-gray-400">/month</span>
                          </p>
                          <button
                            type="button"
                            onClick={handleManageSubscription}
                            disabled={subscriptionLoading}
                            className="text-[14px] font-medium text-primary-600 hover:text-primary-700 disabled:opacity-50 transition-colors"
                          >
                            {subscriptionLoading ? "Loading..." : "Manage subscription"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* ── Not subscribed state ── */
                      <div>
                        <p className="text-sm text-gray-500 mb-3">
                          Premium tools to grow your care business.
                        </p>
                        <div className="space-y-2 mb-5">
                          <div className="flex items-center gap-2.5 text-sm text-gray-600">
                            <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            Unlimited interview scheduling
                          </div>
                          <div className="flex items-center gap-2.5 text-sm text-gray-600">
                            <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            Unlimited review requests
                          </div>
                          <div className="flex items-center gap-2.5 text-sm text-gray-600">
                            <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            Full candidate profiles &amp; contact info
                          </div>
                          <div className="flex items-center gap-2.5 text-sm text-gray-600">
                            <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            Resume downloads and LinkedIn
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-gray-600">
                            <span className="font-medium text-gray-900">$49</span>
                            <span className="text-gray-400">/month</span>
                            <span className="text-gray-400 ml-1.5">·</span>
                            <span className="text-gray-400 ml-1.5">Cancel anytime</span>
                          </p>
                          <button
                            type="button"
                            onClick={handleUpgrade}
                            disabled={subscriptionLoading}
                            className="px-4 py-2 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 rounded-lg text-sm font-medium text-white transition-colors"
                          >
                            {subscriptionLoading ? "Loading..." : "Upgrade"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Google Business Profile (Providers only, when not connected) ── */}
                {isProvider && (
                  <div className="px-4 py-5 lg:p-6">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[15px] font-semibold text-gray-900">
                        Google Business Profile
                      </p>
                      {hasGooglePlaceId && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                          Connected
                        </span>
                      )}
                    </div>

                    {hasGooglePlaceId ? (
                      /* ── Connected state ── */
                      <div>
                        <p className="text-sm text-gray-500 mb-3">
                          Review requests direct families to leave reviews on Google.
                        </p>
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-gray-600">
                            <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">
                              {googleMetadata.place_id}
                            </span>
                          </p>
                          <a
                            href="mailto:support@olera.care?subject=Change%20Google%20Business%20Profile"
                            className="text-[14px] font-medium text-primary-600 hover:text-primary-700 transition-colors"
                          >
                            Contact support to change
                          </a>
                        </div>
                      </div>
                    ) : (
                      /* ── Not connected state ── */
                      <div>
                        <p className="text-sm text-gray-500 mb-3">
                          Connect your Google Business Profile to have review requests direct families to leave reviews on Google instead of Olera.
                        </p>

                        {showGoogleConfirm && googleSelectedName ? (
                          /* ── Confirmation step ── */
                          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                            <div className="flex items-start gap-3 mb-3">
                              <svg className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                              </svg>
                              <div>
                                <p className="text-sm font-semibold text-amber-900">
                                  Connect &quot;{googleSelectedName}&quot;?
                                </p>
                                <p className="text-sm text-amber-700 mt-1">
                                  This cannot be changed later. Once connected, you&apos;ll need to contact support to change your Google Business Profile.
                                </p>
                              </div>
                            </div>

                            {googleError && (
                              <div className="mb-3 p-2 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700">
                                {googleError}
                              </div>
                            )}

                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => {
                                  setShowGoogleConfirm(false);
                                  setGooglePlaceIdInput(null);
                                  setGoogleSelectedName(null);
                                  setGoogleError("");
                                }}
                                disabled={googleSaving}
                                className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors disabled:opacity-50"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={handleGoogleConnect}
                                disabled={googleSaving || !googlePlaceIdInput}
                                className="px-4 py-2 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-white transition-colors"
                              >
                                {googleSaving ? "Connecting..." : "Yes, connect permanently"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* ── Search step ── */
                          <div>
                            <GooglePlaceSearch
                              value={null}
                              selectedName={null}
                              onSelect={(placeId, name) => {
                                setGooglePlaceIdInput(placeId);
                                setGoogleSelectedName(name);
                                setShowGoogleConfirm(true);
                              }}
                              onClear={() => {
                                setGooglePlaceIdInput(null);
                                setGoogleSelectedName(null);
                              }}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Delete Account ── */}
                <div className="px-4 py-5 lg:p-6 border-b border-gray-100">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[15px] font-semibold text-gray-900">
                        Delete account
                      </p>
                      <p className="text-sm text-gray-500 mt-0.5">
                        Permanently delete your account, all profiles, and all connection
                        history.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowDeleteModal(true)}
                      className="text-[14px] font-medium text-red-500 hover:text-red-600 transition-colors shrink-0 ml-4"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* ── Sign Out (bottom_tabs variant only - current variant has it in hamburger menu) ── */}
                {showBottomTabs && (
                  <div className="px-4 py-5 lg:p-6">
                    <button
                      type="button"
                      onClick={async () => {
                        const supabase = createClient();
                        await supabase.auth.signOut();
                        router.push("/");
                      }}
                      className="w-full py-3 px-4 bg-gray-100 hover:bg-gray-200 rounded-xl text-[15px] font-medium text-gray-700 transition-colors"
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </>
            ) : (
              /* ── Notifications Tab ── */
              <div className="px-4 py-5 lg:p-6">
                {notifError && (
                  <div className="mb-4 px-3 py-2 rounded-lg bg-rose-50/80 border border-rose-100/60">
                    <p className="text-[13px] text-rose-600 font-medium">{notifError}</p>
                  </div>
                )}
                {/* WhatsApp opt-in prompt (if not yet opted in and has phone) */}
                {!meta.whatsapp_opted_in && activeProfile?.phone && (
                  <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-emerald-900">Enable WhatsApp notifications</p>
                      <p className="text-xs text-emerald-700 mt-0.5">Get instant alerts when providers respond — right on WhatsApp.</p>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!activeProfile || !isSupabaseConfigured()) return;
                        try {
                          const supabase = createClient();
                          const currentMeta = (activeProfile.metadata || {}) as Record<string, unknown>;
                          await supabase
                            .from("business_profiles")
                            .update({
                              metadata: {
                                ...currentMeta,
                                whatsapp_opted_in: true,
                                whatsapp_opted_in_at: new Date().toISOString(),
                              },
                            })
                            .eq("id", activeProfile.id);
                          await refreshAccountData();
                        } catch {
                          setNotifError("Couldn't enable WhatsApp. Please try again.");
                        }
                      }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-colors shrink-0"
                    >
                      Enable
                    </button>
                  </div>
                )}
                <div className="divide-y divide-gray-50">
                  {notifications.map((notif) => (
                    <NotificationRow
                      key={notif.key}
                      title={notif.title}
                      description={notif.description}
                      channels={notif.channels}
                      emailOn={getNotifOn(notif.key, "email")}
                      smsOn={getNotifOn(notif.key, "sms")}
                      whatsappOn={meta.whatsapp_opted_in && activeProfile?.phone ? getNotifOn(notif.key, "whatsapp") : undefined}
                      onToggle={(channel) => handleNotifToggle(notif.key, channel)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Verification Modal (for providers) */}
          {isProvider && (
            <VerificationMethodModal
              isOpen={isVerificationModalOpen}
              onClose={closeVerificationModal}
              onSubmit={handleVerificationSubmit}
              onDismiss={handleVerificationDismiss}
              businessName={activeProfile?.display_name || "Your Business"}
              profileId={activeProfile?.id}
            />
          )}

          {/* Delete Confirmation Modal */}
          <Modal
            isOpen={showDeleteModal}
            onClose={() => {
              setShowDeleteModal(false);
              setDeleteConfirmText("");
              setDeleteError("");
            }}
            title="Delete account"
            size="sm"
          >
            <div>
              <p className="text-sm text-gray-600 mb-4">
                This action is permanent and cannot be undone. Deleting your account will:
              </p>
              <ul className="space-y-2 mb-5">
                <li className="flex items-start gap-2.5 text-sm text-gray-600">
                  <svg className="w-4 h-4 text-red-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Remove all your profiles and personal information
                </li>
                <li className="flex items-start gap-2.5 text-sm text-gray-600">
                  <svg className="w-4 h-4 text-red-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Delete all your connections and message history
                </li>
                <li className="flex items-start gap-2.5 text-sm text-gray-600">
                  <svg className="w-4 h-4 text-red-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Cancel any active subscriptions
                </li>
              </ul>

              <div className="mb-5">
                <label htmlFor="delete-confirm" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Type <span className="font-semibold text-gray-900">delete</span> to confirm
                </label>
                <input
                  id="delete-confirm"
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="delete"
                  className="w-full text-base border border-gray-200 rounded-lg px-3 py-2 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-transparent placeholder:text-gray-300"
                  autoComplete="off"
                />
              </div>

              {deleteError && (
                <div className="mb-4 bg-red-50 text-red-700 px-3 py-2.5 rounded-lg text-sm">
                  {deleteError}
                </div>
              )}

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteModal(false);
                    setDeleteConfirmText("");
                    setDeleteError("");
                  }}
                  disabled={deleting}
                  className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors disabled:opacity-50 px-3 py-2"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting || deleteConfirmText !== "delete"}
                  className="text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors rounded-lg px-4 py-2"
                >
                  {deleting ? "Deleting..." : "Delete my account"}
                </button>
              </div>
            </div>
          </Modal>

        </div>
      </div>

      {/* Bottom tabs are rendered by the Navbar for /account when user is organization */}
      {/* MoreBottomSheet is also handled by Navbar, no need to duplicate here */}
    </div>
  );
}

// ── Notification Row ──

function NotificationRow({
  title,
  description,
  channels,
  emailOn,
  smsOn,
  whatsappOn,
  onToggle,
}: {
  title: string;
  description: string;
  channels: readonly ("email" | "sms" | "whatsapp")[];
  emailOn: boolean;
  smsOn: boolean;
  whatsappOn?: boolean;
  onToggle: (channel: "email" | "sms" | "whatsapp") => void;
}) {
  const showEmail = channels.includes("email");
  const showSms = channels.includes("sms");
  const showWhatsapp = channels.includes("whatsapp") && whatsappOn !== undefined;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-4 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-[15px] font-semibold text-gray-900">{title}</p>
        <p className="text-sm text-gray-500 mt-0.5">{description}</p>
      </div>
      <div className="flex items-center gap-5 shrink-0">
        {showEmail && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-500">Email</span>
            <Toggle on={emailOn} onToggle={() => onToggle("email")} />
          </div>
        )}
        {showSms && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-500">SMS</span>
            <Toggle on={smsOn} onToggle={() => onToggle("sms")} />
          </div>
        )}
        {showWhatsapp && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-500">WhatsApp</span>
            <Toggle on={whatsappOn} onToggle={() => onToggle("whatsapp")} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Toggle Switch ──

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        on ? "bg-primary-600" : "bg-gray-200"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
          on ? "translate-x-[25px]" : "translate-x-[3px]"
        }`}
      />
    </button>
  );
}

// ── Account Row ──

function AccountRow({
  label,
  value,
  verified,
  onVerify,
  verifying,
  verificationSent,
  isEditing,
  editValue,
  onEditChange,
  onStartEdit,
  onSave,
  onCancel,
  saving,
  error,
  success,
  inputType = "text",
  placeholder,
  isPassword,
}: {
  label: string;
  value: string;
  verified?: boolean;
  onVerify?: () => void;
  verifying?: boolean;
  verificationSent?: boolean;
  isEditing: boolean;
  editValue: string;
  onEditChange: (v: string) => void;
  onStartEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string;
  success: string;
  inputType?: string;
  placeholder?: string;
  isPassword?: boolean;
}) {
  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-gray-500">{label}</p>
          {isEditing ? (
            isPassword ? (
              <p className="text-sm text-gray-500 mt-1">
                We&apos;ll send a password reset link to your email.
              </p>
            ) : (
              <input
                type={inputType}
                value={editValue}
                onChange={(e) => onEditChange(e.target.value)}
                placeholder={placeholder}
                className="mt-1.5 w-full text-base text-gray-900 border border-gray-200 rounded-lg px-3 py-2 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                autoFocus
              />
            )
          ) : (
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <p className="text-[15px] text-gray-900">{value}</p>
              {verified ? (
                <span className="inline-flex items-center gap-1 text-xs text-success-600 font-medium">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Verified
                </span>
              ) : onVerify ? (
                verificationSent ? (
                  <span className="text-xs text-primary-600 font-medium">
                    Check your inbox
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={onVerify}
                    disabled={verifying}
                    className="text-xs text-amber-600 hover:text-amber-700 font-medium transition-colors disabled:opacity-50"
                  >
                    {verifying ? "Sending..." : "Verify email"}
                  </button>
                )
              ) : null}
            </div>
          )}
        </div>
        {!isEditing && (
          <button
            type="button"
            onClick={onStartEdit}
            className="text-[14px] font-medium text-primary-600 hover:text-primary-700 transition-colors shrink-0 ml-4"
          >
            {isPassword ? "Change" : "Edit"}
          </button>
        )}
      </div>
      {isEditing && (
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="text-sm font-medium text-primary-600 hover:text-primary-700 disabled:opacity-50"
          >
            {saving
              ? "Saving..."
              : isPassword
              ? "Send reset email"
              : "Save"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="text-sm font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      )}
      {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
      {success && <p className="text-sm text-green-600 mt-1">{success}</p>}
    </div>
  );
}
