"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { canEngage, getFreeConnectionsRemaining, FREE_CONNECTION_LIMIT } from "@/lib/membership";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";

export default function SettingsPage() {
  const { user, account, activeProfile, membership } = useAuth();
  const searchParams = useSearchParams();
  const justUpgraded = searchParams.get("upgraded") === "true";

  const [loading, setLoading] = useState<"monthly" | "annual" | null>(null);
  const [error, setError] = useState("");

  const isProvider =
    activeProfile?.type === "organization" ||
    activeProfile?.type === "caregiver";
  const hasAccess = canEngage(activeProfile?.type, membership, "respond_to_inquiry");
  const freeRemaining = getFreeConnectionsRemaining(membership);

  const handleUpgrade = async (billingCycle: "monthly" | "annual") => {
    setLoading(billingCycle);
    setError("");

    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billingCycle }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to start checkout");
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : "Something went wrong";
      setError(msg);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-lg text-gray-600 mt-1">
          Manage your account and subscription.
        </p>
      </div>

      {justUpgraded && (
        <div className="mb-6 bg-primary-50 border border-primary-200 text-primary-800 px-4 py-3 rounded-lg text-base">
          Your subscription is now active. You have full access to all features.
        </div>
      )}

      {/* Account section */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Account</h2>
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div>
            <p className="text-sm text-gray-500">Email</p>
            <p className="text-base text-gray-900">{user?.email}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Display name</p>
            <p className="text-base text-gray-900">
              {account?.display_name || "Not set"}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Account created</p>
            <p className="text-base text-gray-900">
              {account?.created_at
                ? new Date(account.created_at).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })
                : "—"}
            </p>
          </div>
        </div>
      </section>

      {/* Subscription section (providers only) */}
      {isProvider && (
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Subscription
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            {/* Current plan */}
            <div className="flex items-center gap-3 mb-4">
              <p className="text-lg font-semibold text-gray-900">
                Current plan:
              </p>
              {membership?.status === "active" && (
                <Badge variant="pro">Pro</Badge>
              )}
              {(membership?.status === "free" || membership?.status === "trialing" || !membership) && (
                <Badge variant="default">Free</Badge>
              )}
              {membership?.status === "past_due" && (
                <Badge variant="pending">Past Due</Badge>
              )}
              {membership?.status === "canceled" && (
                <Badge variant="default">Canceled</Badge>
              )}
            </div>

            {/* Free tier info */}
            {freeRemaining !== null && (
              <div className="mb-4">
                <p className="text-base text-gray-600">
                  You have{" "}
                  <span className="font-semibold text-gray-900">
                    {freeRemaining} of {FREE_CONNECTION_LIMIT}
                  </span>{" "}
                  free connections remaining.
                  {freeRemaining === 0
                    ? " Upgrade to Pro to continue connecting."
                    : " Upgrade to Pro for unlimited connections."}
                </p>
              </div>
            )}

            {/* Active subscription info */}
            {membership?.status === "active" && (
              <div className="mb-4">
                <p className="text-base text-gray-600">
                  You have unlimited access to all Pro features.
                </p>
                {membership.billing_cycle && (
                  <p className="text-sm text-gray-500 mt-1">
                    Billed {membership.billing_cycle === "annual" ? "annually" : "monthly"}
                    {membership.current_period_ends_at &&
                      ` · Next billing date: ${new Date(
                        membership.current_period_ends_at
                      ).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}`}
                  </p>
                )}
              </div>
            )}

            {/* Past due warning */}
            {membership?.status === "past_due" && (
              <div className="mb-4 bg-warm-50 text-warm-700 px-4 py-3 rounded-lg text-base">
                Your last payment failed. Please update your payment method to
                maintain access.
              </div>
            )}

            {/* Upgrade options */}
            {membership?.status !== "active" && (
              <div className="space-y-4">
                {error && (
                  <div
                    className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-base"
                    role="alert"
                  >
                    {error}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Monthly */}
                  <div className="border-2 border-gray-200 rounded-xl p-5 hover:border-primary-300 transition-colors">
                    <p className="text-lg font-semibold text-gray-900">
                      Monthly
                    </p>
                    <p className="text-3xl font-bold text-gray-900 mt-1">
                      $25
                      <span className="text-base font-normal text-gray-500">
                        /mo
                      </span>
                    </p>
                    <Button
                      fullWidth
                      className="mt-4"
                      onClick={() => handleUpgrade("monthly")}
                      loading={loading === "monthly"}
                      disabled={loading !== null}
                    >
                      Subscribe Monthly
                    </Button>
                  </div>

                  {/* Annual */}
                  <div className="border-2 border-primary-300 rounded-xl p-5 relative">
                    <div className="absolute -top-3 right-4 bg-primary-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
                      Save 17%
                    </div>
                    <p className="text-lg font-semibold text-gray-900">
                      Annual
                    </p>
                    <p className="text-3xl font-bold text-gray-900 mt-1">
                      $249
                      <span className="text-base font-normal text-gray-500">
                        /yr
                      </span>
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      ~$20.75/mo
                    </p>
                    <Button
                      fullWidth
                      className="mt-4"
                      onClick={() => handleUpgrade("annual")}
                      loading={loading === "annual"}
                      disabled={loading !== null}
                    >
                      Subscribe Annually
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* What's included */}
      {isProvider && (
        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            What&apos;s included in Pro
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <ul className="space-y-3">
              {[
                "Unlimited connections with families and providers",
                "View full profile details and contact info",
                "Respond to all inquiries and invitations",
                "Browse and connect with family profiles",
                "Priority listing in search results",
              ].map((feature) => (
                <li
                  key={feature}
                  className="flex items-center gap-3 text-base text-gray-700"
                >
                  <svg
                    className="w-5 h-5 text-primary-500 shrink-0"
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
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}
