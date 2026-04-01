"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Badge from "@/components/ui/Badge";

interface StatCard {
  label: string;
  value: number | null;
  subtitle: string;
  href: string;
  isWarning?: boolean;
}

interface AuditEntry {
  id: string;
  action: string;
  target_type: string;
  target_id: string;
  details: Record<string, unknown>;
  created_at: string;
  admin_email?: string;
}

/** Fetch a count from an admin API endpoint */
async function fetchCount(url: string, key = "count"): Promise<number> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} failed`);
  const data = await res.json();
  return data[key] ?? 0;
}

export default function AdminOverviewPage() {
  // Each stat loads independently — no more Promise.all blocking
  const [pendingProviders, setPendingProviders] = useState<number | null>(null);
  const [totalInquiries, setTotalInquiries] = useState<number | null>(null);
  const [needsEmail, setNeedsEmail] = useState<number | null>(null);
  const [questionsNeedEmail, setQuestionsNeedEmail] = useState<number | null>(null);
  const [totalReviews, setTotalReviews] = useState<number | null>(null);
  const [totalProviders, setTotalProviders] = useState<number | null>(null);
  const [publicProfiles, setPublicProfiles] = useState<number | null>(null);
  const [auditLog, setAuditLog] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAllStats, setShowAllStats] = useState(false);

  useEffect(() => {
    // Fire all fetches independently — each card updates on its own
    fetchCount("/api/admin/providers?status=pending&count_only=true")
      .then(setPendingProviders)
      .catch(() => { setPendingProviders(0); setError("Some data failed to load."); });

    fetchCount("/api/admin/leads?count_only=true")
      .then(setTotalInquiries)
      .catch(() => { setTotalInquiries(0); setError("Some data failed to load."); });

    fetchCount("/api/admin/leads?needs_email=true&count_only=true")
      .then(setNeedsEmail)
      .catch(() => { setNeedsEmail(0); setError("Some data failed to load."); });

    fetchCount("/api/admin/questions?needs_email=true&count_only=true")
      .then(setQuestionsNeedEmail)
      .catch(() => { setQuestionsNeedEmail(0); setError("Some data failed to load."); });

    fetchCount("/api/admin/reviews?status=all&limit=1")
      .then(setTotalReviews)
      .catch(() => { setTotalReviews(0); setError("Some data failed to load."); });

    fetchCount("/api/admin/directory?tab=all&count_only=true", "total")
      .then(setTotalProviders)
      .catch(() => { setTotalProviders(0); setError("Some data failed to load."); });

    fetchCount("/api/admin/demand", "total_public")
      .then(setPublicProfiles)
      .catch(() => { setPublicProfiles(0); setError("Some data failed to load."); });

    // Audit log
    fetch("/api/admin/audit?limit=10")
      .then((r) => r.ok ? r.json() : { entries: [] })
      .then((d) => setAuditLog(d.entries ?? []))
      .catch(() => setAuditLog([]));
  }, []);

  const primaryCards: StatCard[] = [
    { label: "Pending Providers", value: pendingProviders, subtitle: "Awaiting review", href: "/admin/providers" },
    { label: "Total Inquiries", value: totalInquiries, subtitle: "All connections", href: "/admin/leads" },
    { label: "Needs Email", value: needsEmail, subtitle: "Leads awaiting email", href: "/admin/leads?tab=needs_email", isWarning: true },
    { label: "Q&A Needs Email", value: questionsNeedEmail, subtitle: "Questions blocked", href: "/admin/questions", isWarning: true },
    { label: "Public Profiles", value: publicProfiles, subtitle: "Care seekers live", href: "/admin/demand" },
    { label: "Provider Directory", value: totalProviders, subtitle: "Total providers", href: "/admin/directory" },
  ];

  const secondaryCards: StatCard[] = [
    { label: "Reviews", value: totalReviews, subtitle: "Total reviews", href: "/admin/reviews" },
  ];

  function renderCard(card: StatCard) {
    const showWarning = card.isWarning && card.value !== null && card.value > 0;
    return (
      <Link key={card.href} href={card.href} className="block">
        <div
          className={[
            "p-5 rounded-xl border transition-colors",
            showWarning
              ? "bg-amber-50 border-amber-200 hover:border-amber-300"
              : "bg-white border-gray-200 hover:border-gray-300",
          ].join(" ")}
        >
          <p className="text-[13px] text-gray-500 mb-1">{card.label}</p>
          {card.value === null ? (
            <div className="h-9 flex items-center">
              <div className="w-12 h-6 bg-gray-100 rounded animate-pulse" />
            </div>
          ) : (
            <p
              className={[
                "text-2xl font-semibold mb-1",
                showWarning ? "text-amber-600" : "text-gray-900",
              ].join(" ")}
            >
              {card.value.toLocaleString()}
            </p>
          )}
          <p className="text-[13px] text-gray-400">{card.subtitle}</p>
        </div>
      </Link>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Overview</h1>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Stats grid — each card loads independently */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-4">
        {primaryCards.map((card) => renderCard(card))}
        {showAllStats && secondaryCards.map((card) => renderCard(card))}
      </div>

      {secondaryCards.length > 0 && (
        <div className="mb-8">
          <button
            onClick={() => setShowAllStats((v) => !v)}
            className="text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors"
          >
            {showAllStats ? "Show less" : `See all stats (${secondaryCards.length} more) →`}
          </button>
        </div>
      )}

      {/* Recent Activity */}
      <div>
        <h2 className="text-lg font-medium text-gray-900 mb-3">
          Recent Activity
        </h2>
        {auditLog === null ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8">
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="space-y-1.5">
                    <div className="w-48 h-4 bg-gray-100 rounded animate-pulse" />
                    <div className="w-32 h-3 bg-gray-50 rounded animate-pulse" />
                  </div>
                  <div className="w-24 h-6 bg-gray-100 rounded animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        ) : auditLog.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-gray-500">No activity yet.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {auditLog.map((entry) => (
              <div key={entry.id} className="px-5 py-3.5 flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-medium text-gray-900">
                    {formatAction(entry.action, entry.target_type)}
                  </p>
                  <p className="text-[13px] text-gray-400">
                    {entry.admin_email ?? "Unknown"} &middot; {formatDate(entry.created_at)}
                  </p>
                </div>
                <Badge variant={getActionBadgeVariant(entry.action)}>
                  {entry.action}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatAction(action: string, targetType: string): string {
  const actionLabels: Record<string, string> = {
    approve_provider: "Approved a provider",
    reject_provider: "Rejected a provider",
    approve_review: "Published a review",
    reject_review: "Rejected a review",
    remove_review: "Removed a review",
    add_admin: "Added an admin",
    remove_admin: "Removed an admin",
    update_directory_provider: "Updated a directory provider",
    delete_image: "Deleted a provider image",
    deferred_lead_emails_sent: "Sent deferred lead emails",
    add_provider_email_via_questions: "Added provider email via Q&A",
  };
  return actionLabels[action] ?? `${action} on ${targetType}`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getActionBadgeVariant(action: string): "verified" | "pending" | "default" {
  if (action.includes("approve")) return "verified";
  if (action.includes("reject")) return "pending";
  return "default";
}
