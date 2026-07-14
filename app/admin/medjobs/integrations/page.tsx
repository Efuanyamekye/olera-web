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
      <BackfillCard />
      <CalendlyCard />
    </main>
  );
}

type CampaignStat = { campaign_id: number; leads: number; replies: number; resolved: number };
type PreviewData = {
  found: number;
  unresolved: number;
  scanned: number;
  campaigns: number;
  capped: boolean;
  errors: string[];
  sample: Array<Record<string, unknown>>;
  byCampaign: CampaignStat[];
};

function BackfillCard() {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runPreview = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setPreview(null);
    try {
      const res = await fetch("/api/admin/medjobs/backfill-smartlead-replies");
      const body = (await res.json()) as {
        replies_found?: number;
        replies_unresolved?: number;
        leads_scanned?: number;
        campaigns?: number;
        capped?: boolean;
        errors?: string[];
        sample?: Array<Record<string, unknown>>;
        by_campaign?: CampaignStat[];
        error?: string;
      };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setPreview({
        found: body.replies_found ?? 0,
        unresolved: body.replies_unresolved ?? 0,
        scanned: body.leads_scanned ?? 0,
        campaigns: body.campaigns ?? 0,
        capped: !!body.capped,
        errors: body.errors ?? [],
        sample: body.sample ?? [],
        byCampaign: body.by_campaign ?? [],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const runImport = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/medjobs/backfill-smartlead-replies", { method: "POST" });
      const body = (await res.json()) as {
        imported?: number;
        skipped_duplicate?: number;
        capped?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setResult(
        `Imported ${body.imported ?? 0} past reply(ies) (${body.skipped_duplicate ?? 0} already in).` +
          (body.capped ? " More remain — click Import again to continue." : ""),
      );
      setPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-gray-900">Import past replies</h2>
      <p className="mt-1 text-sm text-gray-600">
        Pulls in replies that came in before the connection was live — including out-of-office — so you
        can work those leads. Safe to run again; it won&apos;t duplicate anything.
      </p>

      <div className="mt-3 flex gap-2">
        <button
          onClick={runPreview}
          disabled={loading}
          className="rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {loading && !preview ? "Checking…" : "Preview"}
        </button>
        {preview && (
          <button
            onClick={runImport}
            disabled={loading}
            className="rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {loading ? "Importing…" : `Import ${preview.found} reply(ies)`}
          </button>
        )}
      </div>

      {preview && (
        <div className="mt-3 space-y-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
          <p>
            Found <strong>{preview.found}</strong> past reply(ies)
            {preview.unresolved > 0 ? ` (${preview.unresolved} couldn't be matched to a lead)` : ""}. Press
            Import to bring them into the app.
          </p>
          <p className="text-xs text-gray-500">
            Scanned {preview.scanned} lead(s) across {preview.campaigns} campaign(s)
            {preview.capped ? " · hit the scan limit (some leads not reached)" : ""}.
          </p>
          {preview.errors.length > 0 && (
            <details className="text-xs text-red-700">
              <summary className="cursor-pointer font-medium">
                {preview.errors.length} scan error(s) — click to view
              </summary>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {preview.errors.slice(0, 12).map((e, i) => (
                  <li key={i} className="break-all">{e}</li>
                ))}
              </ul>
            </details>
          )}
          {preview.byCampaign.length > 0 && (
            <details className="text-xs text-gray-500">
              <summary className="cursor-pointer font-medium">
                Per-campaign breakdown ({preview.byCampaign.length}) — click to view
              </summary>
              <table className="mt-1 w-full text-left">
                <thead className="text-gray-400">
                  <tr>
                    <th className="pr-3 font-medium">Campaign</th>
                    <th className="pr-3 font-medium">Leads</th>
                    <th className="pr-3 font-medium">Replies</th>
                    <th className="font-medium">Matched</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {preview.byCampaign.map((c) => (
                    <tr key={c.campaign_id}>
                      <td className="pr-3">{c.campaign_id}</td>
                      <td className="pr-3">{c.leads}</td>
                      <td className="pr-3">{c.replies}</td>
                      <td>{c.resolved}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
          {preview.sample.length > 0 && (
            <details className="text-xs text-gray-500">
              <summary className="cursor-pointer font-medium">
                Sample of {preview.sample.length} parsed reply(ies) — click to view
              </summary>
              <ul className="mt-1 space-y-1 pl-1">
                {preview.sample.map((s, i) => (
                  <li key={i} className="border-l-2 border-gray-200 pl-2">
                    <span className="font-mono">{String(s.from_email ?? "?")}</span>{" "}
                    · {String(s.subject ?? "(no subject)")}{" "}
                    · {String(s.occurred_at ?? "?")}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
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

function SmartleadCard() {
  const [secret, setSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connect = async () => {
    // Secret is optional: when left blank the server uses the value already
    // saved in its environment. Pasting one is only needed to override that.
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
        Turns on provider replies. Connects every campaign so replies, opens,
        and bounces show up in the Emails tab. Just press the button — you can
        leave the box below blank.
      </p>
      <label className="mt-4 block">
        <span className="mb-1 block text-xs font-medium text-gray-700">
          Webhook secret <span className="font-normal text-gray-400">(optional — leave blank to use the saved one)</span>
        </span>
        <input
          type="text"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="Leave blank"
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
