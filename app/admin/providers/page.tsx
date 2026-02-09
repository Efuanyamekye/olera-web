"use client";

import { useEffect, useState, useCallback } from "react";
import Badge from "@/components/ui/Badge";

type StatusFilter = "pending" | "claimed" | "rejected" | "all";

interface Provider {
  id: string;
  display_name: string;
  type: string;
  category: string | null;
  city: string | null;
  state: string | null;
  claim_state: string;
  created_at: string;
  email: string | null;
  phone: string | null;
}

export default function AdminProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchProviders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/providers?status=${filter}`);
      if (res.ok) {
        const data = await res.json();
        setProviders(data.providers ?? []);
      }
    } catch (err) {
      console.error("Failed to fetch providers:", err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  async function handleAction(id: string, action: "approve" | "reject") {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/admin/providers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        // Remove from list or refresh
        setProviders((prev) => prev.filter((p) => p.id !== id));
      }
    } catch (err) {
      console.error("Action failed:", err);
    } finally {
      setActionLoading(null);
    }
  }

  const tabs: { label: string; value: StatusFilter }[] = [
    { label: "Pending", value: "pending" },
    { label: "Approved", value: "claimed" },
    { label: "Rejected", value: "rejected" },
    { label: "All", value: "all" },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Provider Approvals</h1>
        <p className="text-lg text-gray-600 mt-1">
          Review and manage provider claims.
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={[
              "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              filter === tab.value
                ? "bg-primary-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200",
            ].join(" ")}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-lg text-gray-500">Loading...</div>
        </div>
      ) : providers.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500">No providers found.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Name</th>
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Type</th>
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Location</th>
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Status</th>
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Date</th>
                  {filter === "pending" && (
                    <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {providers.map((provider) => (
                  <tr key={provider.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-gray-900">{provider.display_name}</p>
                      {provider.email && (
                        <p className="text-sm text-gray-500">{provider.email}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {provider.type === "organization" ? "Organization" : "Caregiver"}
                      {provider.category && (
                        <span className="text-gray-400"> / {provider.category.replace(/_/g, " ")}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {[provider.city, provider.state].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={getStatusVariant(provider.claim_state)}>
                        {provider.claim_state}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(provider.created_at).toLocaleDateString()}
                    </td>
                    {filter === "pending" && (
                      <td className="px-6 py-4 text-right">
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => handleAction(provider.id, "approve")}
                            disabled={actionLoading === provider.id}
                            className="px-3 py-1.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleAction(provider.id, "reject")}
                            disabled={actionLoading === provider.id}
                            className="px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function getStatusVariant(state: string): "pending" | "verified" | "rejected" | "default" {
  switch (state) {
    case "pending":
      return "pending";
    case "claimed":
      return "verified";
    case "rejected":
      return "rejected";
    default:
      return "default";
  }
}
