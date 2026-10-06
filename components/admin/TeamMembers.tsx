"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Team logins for one agency (migration 271). An added email signs in as
 * itself and works the agency next to the owner, and is copied on family
 * alerts. Lives on the provider's relationship page.
 */

type Member = { email: string; role: string; added_by: string | null; created_at: string };

export default function TeamMembers({ providerId }: { providerId: string }) {
  const [owner, setOwner] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/providers/${providerId}/members`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load team");
      setOwner(json.owner_email ?? null);
      setMembers(json.members ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load team");
    }
  }, [providerId]);

  useEffect(() => {
    load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/providers/${providerId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not add");
      setNotice(`Added ${json.email}. They can sign in with that email now.`);
      setEmail("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add");
    } finally {
      setBusy(false);
    }
  }

  async function remove(target: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/providers/${providerId}/members?email=${encodeURIComponent(target)}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not remove");
      setNotice(`Removed ${target}.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-gray-200 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500">Team logins</p>
      <ul className="mt-2 space-y-1 text-sm">
        <li className="text-gray-700">
          {owner ?? "No owner account"} <span className="font-mono text-[10px] text-gray-500">owner</span>
        </li>
        {members.map((m) => (
          <li key={m.email} className="flex items-center gap-2 text-gray-700">
            <span>{m.email}</span>
            <span className="font-mono text-[10px] text-gray-500">team</span>
            <button
              type="button"
              onClick={() => remove(m.email)}
              disabled={busy}
              className="ml-auto text-xs text-gray-500 hover:text-red-700 disabled:opacity-50"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="mt-2 flex flex-wrap gap-2">
        <label htmlFor={`team-email-${providerId}`} className="sr-only">
          Team member email
        </label>
        <input
          id={`team-email-${providerId}`}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@agency.com"
          className="min-w-0 flex-1 rounded-md border border-gray-200 px-2.5 py-1.5 text-base sm:text-sm"
        />
        <button
          type="submit"
          disabled={busy || !email}
          className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : "Add team login"}
        </button>
      </form>
      {notice ? <p className="mt-1.5 text-xs text-teal-700">{notice}</p> : null}
      {error ? <p className="mt-1.5 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
