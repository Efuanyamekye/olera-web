"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import Modal from "@/components/ui/Modal";

type SettingsTab = "account" | "notifications";

// Notification configurations per account type
const FAMILY_NOTIFICATIONS = [
  { key: "connection_updates", title: "Connection updates", description: "When a provider responds or messages you" },
  { key: "saved_provider_alerts", title: "Saved provider alerts", description: "When a saved provider becomes available" },
  { key: "match_updates", title: "Match updates", description: "New provider matches and care profile responses" },
  { key: "profile_reminders", title: "Profile reminders", description: "Tips to complete your care profile" },
] as const;

const ORGANIZATION_NOTIFICATIONS = [
  { key: "lead_notifications", title: "New leads", description: "When families send you inquiries or connection requests" },
  { key: "review_alerts", title: "Review alerts", description: "When you receive new reviews or Q&A questions" },
  { key: "message_notifications", title: "Message notifications", description: "When families message you" },
  { key: "profile_insights", title: "Profile insights", description: "Weekly performance insights and tips" },
] as const;

const CAREGIVER_NOTIFICATIONS = [
  { key: "job_alerts", title: "Job alerts", description: "New job opportunities matching your preferences" },
  { key: "interview_reminders", title: "Interview reminders", description: "Upcoming interviews and status updates" },
  { key: "application_updates", title: "Application updates", description: "Status changes on your applications" },
  { key: "message_notifications", title: "Message notifications", description: "When employers message you" },
] as const;

type NotificationKey =
  | typeof FAMILY_NOTIFICATIONS[number]["key"]
  | typeof ORGANIZATION_NOTIFICATIONS[number]["key"]
  | typeof CAREGIVER_NOTIFICATIONS[number]["key"];

export default function AccountSettingsPage() {
  const router = useRouter();
  const { user, activeProfile, refreshAccountData } = useAuth();

  // Determine account type for notifications
  const profileType = activeProfile?.type;
  const isFamily = profileType === "family";
  const isOrganization = profileType === "organization";
  const isCaregiver = profileType === "caregiver" || profileType === "student";

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
    (key: string, channel: "email" | "sms"): boolean => {
      const oKey = `${key}_${channel}`;
      if (oKey in optimisticNotifs) return optimisticNotifs[oKey];
      return notifPrefs[key]?.[channel] ?? (channel === "email");
    },
    [optimisticNotifs, notifPrefs]
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


  // ── Notification toggle (optimistic — flips instantly, persists in background) ──
  const handleNotifToggle = useCallback(
    (key: NotificationKey, channel: "email" | "sms") => {
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-vanilla-50 via-white to-white">
      <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8 py-6">
        <div className="mb-5">
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

          {/* Tab Content */}
          <div className="rounded-2xl bg-white border border-gray-200/80 shadow-sm divide-y divide-gray-100">
            {activeTab === "account" ? (
              <>
                {/* ── Account Info ── */}
                <div className="p-6">
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

                {/* ── Delete Account ── */}
                <div className="p-6">
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
              </>
            ) : (
              /* ── Notifications Tab ── */
              <div className="p-6">
                {notifError && (
                  <div className="mb-4 px-3 py-2 rounded-lg bg-rose-50/80 border border-rose-100/60">
                    <p className="text-[13px] text-rose-600 font-medium">{notifError}</p>
                  </div>
                )}
                <div className="divide-y divide-gray-50">
                  {notifications.map((notif) => (
                    <NotificationRow
                      key={notif.key}
                      title={notif.title}
                      description={notif.description}
                      emailOn={getNotifOn(notif.key, "email")}
                      smsOn={getNotifOn(notif.key, "sms")}
                      onToggle={(channel) => handleNotifToggle(notif.key, channel)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

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
    </div>
  );
}

// ── Notification Row ──

function NotificationRow({
  title,
  description,
  emailOn,
  smsOn,
  onToggle,
}: {
  title: string;
  description: string;
  emailOn: boolean;
  smsOn: boolean;
  onToggle: (channel: "email" | "sms") => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-4 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-[15px] font-semibold text-gray-900">{title}</p>
        <p className="text-sm text-gray-500 mt-0.5">{description}</p>
      </div>
      <div className="flex items-center gap-5 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-500">Email</span>
          <Toggle on={emailOn} onToggle={() => onToggle("email")} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-500">SMS</span>
          <Toggle on={smsOn} onToggle={() => onToggle("sms")} />
        </div>
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
