"use client";

import { useState } from "react";

/**
 * Admin page — one-click connectors for the two MedJobs webhooks.
 *
 * Smartlead replies: registers our reply webhook on every campus campaign
 *   (uses the production SMARTLEAD_API_KEY). Admin pastes the webhook secret.
 * Calendly: registers the meeting webhook on the Calendly org. Admin pastes a
 *   Calendly access token + the webhook secret.
 *
 * The "secret" in each case is the same value the admin set in the Supabase
 * dashboard as SMARTLEAD_WEBHOOK_SECRET / CALENDLY_WEBHOOK_SECRET.
 */
export default function IntegrationsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10 space-y-10">
      <div>
        <h1 className="font-display text-3xl text-gray-900">Connect integrations</h1>
        <p className="mt-2 text-sm text-gray-600">
          Turn on provider replies (Smartlead) and meeting bookings (Calendly).
          Before using a button below, set its secret in the Supabase dashboard
          (Edge Functions → Secrets), then paste the same secret here.
        </p>
      </div>

      <SmartleadCard />
      <CalendlyCard />
    </main>
  );
}

function SmartleadCard() {
  const [secret, setSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connect = async () => {
    if (!secret.trim()) {
      setError("Paste your Smartlead webhook secret first.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/medjobs/register-smartlead-webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: secret.trim() }),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        total?: number;
        created?: number[];
        updated?: number[];
        exists?: number[];
        wired?: number;
        failed?: { campaign_id: number; error?: string }[];
        error?: string;
      };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      const total = body.total ?? 0;
      const wired = body.wired ?? 0;
      const newCount = body.created?.length ?? 0;
      const updatedCount = body.updated?.length ?? 0;
      const alreadyCount = body.exists?.length ?? 0;
      const fail = body.failed?.length ?? 0;
      const breakdown = `${newCount} newly connected, ${updatedCount} updated, ${alreadyCount} already wired`;
      if (fail > 0) {
        const detail = body.failed
          ?.map((f) => `#${f.campaign_id}: ${f.error ?? "unknown error"}`)
          .join(" · ");
        setError(`Wired ${wired} of ${total} (${breakdown}). ${fail} failed — ${detail}`);
        setResult(null);
      } else {
        setResult(`Wired ${wired} of ${total} campaign(s): ${breakdown}.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-gray-900">Smartlead replies</h2>
      <p className="mt-1 text-sm text-gray-600">
        Registers our reply line on every campus campaign so provider replies,
        opens, and bounces show up in the Emails tab. Uses the Smartlead key
        already in production.
      </p>
      <label className="mt-4 block">
        <span className="mb-1 block text-xs font-medium text-gray-700">Webhook secret</span>
        <input
          type="text"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="Paste SMARTLEAD_WEBHOOK_SECRET"
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm font-mono focus:border-gray-400 focus:outline-none"
        />
      </label>
      <button
        onClick={connect}
        disabled={loading}
        className="mt-3 rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
      >
        {loading ? "Connecting…" : "Connect Smartlead replies"}
      </button>
      {result && (
        <p className="mt-3 rounded-md border border-primary-200 bg-primary-50 px-3 py-2 text-sm text-primary-800">
          ✓ {result}
        </p>
      )}
      {error && (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}

function CalendlyCard() {
  const [token, setToken] = useState("");
  const [secret, setSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connect = async () => {
    if (!token.trim() || !secret.trim()) {
      setError("Paste both the Calendly token and the webhook secret.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/medjobs/register-calendly-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim(), secret: secret.trim() }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setResult("Calendly connected. Booked meetings will appear in the Meetings tab.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-gray-900">Calendly meetings</h2>
      <p className="mt-1 text-sm text-gray-600">
        Registers our meeting line so a booked (or canceled) Calendly meeting
        shows up in the Meetings tab automatically.
      </p>
      <label className="mt-4 block">
        <span className="mb-1 block text-xs font-medium text-gray-700">Calendly access token</span>
        <input
          type="text"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Paste Dr. DuBose's Calendly token"
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm font-mono focus:border-gray-400 focus:outline-none"
        />
      </label>
      <label className="mt-3 block">
        <span className="mb-1 block text-xs font-medium text-gray-700">Webhook secret</span>
        <input
          type="text"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="Paste CALENDLY_WEBHOOK_SECRET"
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm font-mono focus:border-gray-400 focus:outline-none"
        />
      </label>
      <button
        onClick={connect}
        disabled={loading}
        className="mt-3 rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
      >
        {loading ? "Connecting…" : "Connect Calendly"}
      </button>
      {result && (
        <p className="mt-3 rounded-md border border-primary-200 bg-primary-50 px-3 py-2 text-sm text-primary-800">
          ✓ {result}
        </p>
      )}
      {error && (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
