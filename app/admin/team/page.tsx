"use client";

import { useEffect, useState, useCallback } from "react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import Badge from "@/components/ui/Badge";
import type { AdminUser } from "@/lib/types";

export default function AdminTeamPage() {
  const { adminUser: currentAdmin } = useAdminAuth();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState<"admin" | "master_admin">("admin");
  const [addError, setAddError] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [removeLoading, setRemoveLoading] = useState<string | null>(null);

  const isMaster = currentAdmin?.role === "master_admin";

  const fetchAdmins = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/team");
      if (res.ok) {
        const data = await res.json();
        setAdmins(data.admins ?? []);
      }
    } catch (err) {
      console.error("Failed to fetch admins:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAdmins();
  }, [fetchAdmins]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError("");
    setAddLoading(true);

    try {
      const res = await fetch("/api/admin/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: addEmail, role: addRole }),
      });

      if (res.ok) {
        setShowAddModal(false);
        setAddEmail("");
        setAddRole("admin");
        await fetchAdmins();
      } else {
        const data = await res.json();
        setAddError(data.error || "Failed to add admin");
      }
    } catch {
      setAddError("Network error");
    } finally {
      setAddLoading(false);
    }
  }

  async function handleRemove(id: string) {
    if (!confirm("Are you sure you want to remove this admin?")) return;

    setRemoveLoading(id);
    try {
      const res = await fetch("/api/admin/team", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      if (res.ok) {
        await fetchAdmins();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to remove admin");
      }
    } catch {
      alert("Network error");
    } finally {
      setRemoveLoading(null);
    }
  }

  const masterCount = admins.filter((a) => a.role === "master_admin").length;

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Team</h1>
          <p className="text-lg text-gray-600 mt-1">
            Manage admin access to the dashboard.
          </p>
        </div>
        {isMaster && (
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
          >
            Add Admin
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-lg text-gray-500">Loading...</div>
        </div>
      ) : admins.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500">No admins found.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Email</th>
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Role</th>
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Added</th>
                  {isMaster && (
                    <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {admins.map((admin) => {
                  const isLastMaster =
                    admin.role === "master_admin" && masterCount <= 1;
                  const isSelf = admin.id === currentAdmin?.id;

                  return (
                    <tr key={admin.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <p className="text-sm font-medium text-gray-900">{admin.email}</p>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={admin.role === "master_admin" ? "pro" : "default"}>
                          {admin.role === "master_admin" ? "Master Admin" : "Admin"}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {new Date(admin.created_at).toLocaleDateString()}
                      </td>
                      {isMaster && (
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => handleRemove(admin.id)}
                            disabled={
                              removeLoading === admin.id ||
                              (isSelf && isLastMaster)
                            }
                            className="px-3 py-1.5 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            title={
                              isSelf && isLastMaster
                                ? "Cannot remove the last master admin"
                                : "Remove admin"
                            }
                          >
                            Remove
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Admin Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Add Admin
            </h2>
            <form onSubmit={handleAdd}>
              <div className="mb-4">
                <label
                  htmlFor="admin-email"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Email address
                </label>
                <input
                  id="admin-email"
                  type="email"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  placeholder="user@example.com"
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  The user must have an existing Olera account.
                </p>
              </div>
              <div className="mb-4">
                <label
                  htmlFor="admin-role"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Role
                </label>
                <select
                  id="admin-role"
                  value={addRole}
                  onChange={(e) =>
                    setAddRole(e.target.value as "admin" | "master_admin")
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="admin">Admin</option>
                  <option value="master_admin">Master Admin</option>
                </select>
              </div>
              {addError && (
                <p className="text-sm text-red-600 mb-4">{addError}</p>
              )}
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setAddError("");
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addLoading}
                  className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
                >
                  {addLoading ? "Adding..." : "Add Admin"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
