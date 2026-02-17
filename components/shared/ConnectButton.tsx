"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  canEngage,
  isProfileShareable,
  getProfileCompletionGaps,
  FREE_CONNECTION_LIMIT,
} from "@/lib/membership";
import type { ConnectionType } from "@/lib/types";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";

interface ConnectButtonProps {
  /** The profile ID initiating the connection. */
  fromProfileId: string;
  /** The target profile ID. */
  toProfileId: string;
  /** Display name of the target (for confirmation UI). */
  toName: string;
  /** Type of connection to create. */
  connectionType: ConnectionType;
  /** Button label when not yet sent. */
  label?: string;
  /** Button label after sent. */
  sentLabel?: string;
  /** Whether to show a confirmation modal with optional note. */
  showModal?: boolean;
  /** Full-width button. */
  fullWidth?: boolean;
  /** Button size. */
  size?: "sm" | "md" | "lg";
}

/**
 * Single modal state machine — exactly one modal can be open at a time.
 * Eliminates the possibility of flash/overlap from independent booleans.
 */
type ModalState =
  | { kind: "closed" }
  | { kind: "confirm" }
  | { kind: "success" }
  | { kind: "upgrade" }
  | { kind: "incomplete"; gaps: string[] }
  | { kind: "wrong-profile-type" };

const CLOSED: ModalState = { kind: "closed" };

/**
 * ConnectButton creates a connection (profile share) between two profiles.
 * The connection record links from_profile_id → to_profile_id. Both parties
 * can then view each other's profile — the profile IS the message.
 */
export default function ConnectButton({
  fromProfileId,
  toProfileId,
  toName,
  connectionType,
  label = "Connect",
  sentLabel = "Connected",
  showModal: showConfirmation = true,
  fullWidth = false,
  size = "sm",
}: ConnectButtonProps) {
  const { user, activeProfile, membership, openAuth, refreshAccountData } =
    useAuth();
  const [alreadySent, setAlreadySent] = useState(false);
  const [modal, setModal] = useState<ModalState>(CLOSED);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Local optimistic counter — tracks connections made in THIS session
  // so we don't depend solely on the async refreshAccountData round-trip.
  const [localConnectionsMade, setLocalConnectionsMade] = useState(0);

  const profileShareable = isProfileShareable(activeProfile);

  // Compute access using both server membership AND local optimistic count
  const serverAccess = canEngage(
    activeProfile?.type,
    membership,
    "initiate_contact"
  );

  // If on free tier, also check local count hasn't exceeded limit
  const isFree =
    membership?.status === "free" || membership?.status === "trialing";
  const serverUsed = membership?.free_responses_used ?? 0;
  const hasEngageAccess = isFree
    ? serverUsed + localConnectionsMade < FREE_CONNECTION_LIMIT && serverAccess
    : serverAccess;

  // Check for existing connection
  useEffect(() => {
    if (!fromProfileId || !toProfileId || !isSupabaseConfigured()) return;

    const check = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("connections")
        .select("id")
        .eq("from_profile_id", fromProfileId)
        .eq("to_profile_id", toProfileId)
        .eq("type", connectionType)
        .limit(1)
        .maybeSingle();

      if (data) setAlreadySent(true);
    };

    check();
  }, [fromProfileId, toProfileId, connectionType]);

  const createConnection = useCallback(async () => {
    if (!fromProfileId || !isSupabaseConfigured()) return;

    setSubmitting(true);
    setError("");

    try {
      const supabase = createClient();
      const { error: insertError } = await supabase
        .from("connections")
        .insert({
          from_profile_id: fromProfileId,
          to_profile_id: toProfileId,
          type: connectionType,
          status: "pending",
          message: note.trim() || null,
        });

      if (insertError) {
        if (
          insertError.code === "23505" ||
          insertError.message.includes("duplicate") ||
          insertError.message.includes("unique")
        ) {
          setAlreadySent(true);
          setModal(CLOSED);
          return;
        }
        throw new Error(insertError.message);
      }

      // Increment free_responses_used for non-paid memberships
      if (
        membership &&
        (membership.status === "free" || membership.status === "trialing")
      ) {
        const newCount = (membership.free_responses_used ?? 0) + 1;
        await supabase
          .from("memberships")
          .update({ free_responses_used: newCount })
          .eq("account_id", membership.account_id);

        // Optimistic local increment — immediately gates next click
        setLocalConnectionsMade((prev) => prev + 1);

        // Refresh auth state so canEngage re-evaluates with updated count.
        // Awaited so state is consistent before user can interact again.
        await refreshAccountData();
      }

      setAlreadySent(true);
      setModal({ kind: "success" });
      setTimeout(() => {
        setModal(CLOSED);
        setNote("");
      }, 1500);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : String(err);
      setError(`Something went wrong: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  }, [fromProfileId, toProfileId, connectionType, note, membership, refreshAccountData]);

  const handleClick = () => {
    if (!user) {
      openAuth({ defaultMode: "sign-up" });
      return;
    }
    if (alreadySent) return;

    // Provider-to-provider care inquiry guard:
    // Orgs/caregivers can't send care consultation inquiries to other providers.
    // They must switch to a family profile for care requests.
    const isProviderProfile =
      activeProfile?.type === "organization" || activeProfile?.type === "caregiver";
    if (isProviderProfile && connectionType === "inquiry") {
      setModal({ kind: "wrong-profile-type" });
      return;
    }

    // Profile completeness check — must have minimum info before sharing
    if (!profileShareable) {
      const gaps = getProfileCompletionGaps(activeProfile);
      setModal({ kind: "incomplete", gaps });
      return;
    }

    // Paywall check — families always pass, providers need membership
    if (!hasEngageAccess) {
      setModal({ kind: "upgrade" });
      return;
    }

    if (showConfirmation) {
      setModal({ kind: "confirm" });
    } else {
      createConnection();
    }
  };

  const closeModal = () => {
    if (!submitting) {
      setModal(CLOSED);
      setError("");
    }
  };

  const actionLabel =
    connectionType === "invitation"
      ? "invite"
      : connectionType === "application"
      ? "apply to"
      : "connect with";

  return (
    <>
      <Button
        size={size}
        fullWidth={fullWidth}
        variant={alreadySent ? "secondary" : "primary"}
        onClick={handleClick}
        disabled={alreadySent}
      >
        {alreadySent ? sentLabel : label}
      </Button>

      {/* Only mount the active modal — avoids N×3 Modal instances in the DOM */}
      {(modal.kind === "confirm" || modal.kind === "success") && (
        <Modal
          isOpen
          onClose={closeModal}
          title={
            modal.kind === "success"
              ? "Sent!"
              : `Share your profile with ${toName}`
          }
          size="md"
        >
          {modal.kind === "success" ? (
            <div className="text-center py-4">
              <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-primary-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <p className="text-lg text-gray-900">
                Your profile has been shared with {toName}.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-base text-gray-600">
                When you {actionLabel} <strong>{toName}</strong>, your profile
                will be shared with them. They&#39;ll be able to see your profile
                details and respond to you.
              </p>

              <div>
                <label
                  htmlFor="connect-note"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Add a note (optional)
                </label>
                <textarea
                  id="connect-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Introduce yourself or share why you're reaching out..."
                  rows={3}
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                />
              </div>

              {error && (
                <div
                  className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-base"
                  role="alert"
                >
                  {error}
                </div>
              )}

              <Button fullWidth loading={submitting} onClick={createConnection}>
                Share Profile
              </Button>
            </div>
          )}
        </Modal>
      )}

      {modal.kind === "upgrade" && (
        <Modal
          isOpen
          onClose={closeModal}
          title="Upgrade to connect"
          size="sm"
        >
          <div className="text-center py-2">
            <div className="w-12 h-12 bg-warm-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-6 h-6 text-warm-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <p className="text-base text-gray-600 mb-6">
              You&#39;ve used all {FREE_CONNECTION_LIMIT} free connections.
              Upgrade to Pro to continue sharing your profile and connecting with
              others on Olera.
            </p>
            <Link
              href="/portal/settings"
              className="inline-flex items-center justify-center w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors min-h-[44px]"
              onClick={closeModal}
            >
              View upgrade options
            </Link>
            <p className="text-sm text-gray-500 mt-3">
              Plans start at $25/month
            </p>
          </div>
        </Modal>
      )}

      {modal.kind === "incomplete" && (
        <Modal
          isOpen
          onClose={closeModal}
          title="Complete your profile first"
          size="sm"
        >
          <div className="py-2">
            <p className="text-base text-gray-600 mb-4">
              Your profile needs a few more details before you can share it with
              others.
            </p>
            {modal.gaps.length > 0 && (
              <ul className="text-sm text-gray-600 mb-6 space-y-1">
                {modal.gaps.map((gap) => (
                  <li key={gap} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-warm-500 rounded-full shrink-0" />
                    Add {gap}
                  </li>
                ))}
              </ul>
            )}
            <Link
              href="/portal/profile"
              className="inline-flex items-center justify-center w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors min-h-[44px]"
              onClick={closeModal}
            >
              Edit Profile
            </Link>
          </div>
        </Modal>
      )}

      {modal.kind === "wrong-profile-type" && (
        <Modal
          isOpen
          onClose={closeModal}
          title="Switch to a family profile"
          size="sm"
        >
          <div className="py-2">
            <p className="text-base text-gray-600 mb-4">
              Care consultation requests can only be sent from a family profile.
              Switch to your family profile to request care from this provider.
            </p>
            <p className="text-sm text-gray-500 mb-6">
              If you&apos;re looking to hire a caregiver for your organization,
              use the hiring workflow from your dashboard instead.
            </p>
            <button
              type="button"
              onClick={closeModal}
              className="inline-flex items-center justify-center w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors min-h-[44px]"
            >
              Got it
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
