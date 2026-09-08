"use client";

import { useCallback, useEffect, useState } from "react";
import { DrawerShell } from "@/components/admin/medjobs/DrawerShell";
import ChannelCard from "./ChannelCard";
import type { ActivationUniversity } from "./types";
import type { Channel } from "@/lib/medjobs/activation";

/**
 * One university, its five channels, and nothing else. No owner, no last
 * activity, no tabs: the header is the name and the one line that says how
 * far along the whole university is.
 */
export default function UniversityDrawer({
  slug,
  onClose,
  onOpenTask,
  onChanged,
}: {
  slug: string;
  onClose: () => void;
  onOpenTask: (taskId: string) => void;
  /** Lets the list behind refresh its dots after a change in here. */
  onChanged: () => void;
}) {
  const [uni, setUni] = useState<ActivationUniversity | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  // Writes that have no control of their own to report into. The checklist
  // shows its own errors; everything else surfaces here.
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/medjobs/activation?university=${encodeURIComponent(slug)}`);
      const d = (await res.json()) as {
        universities: ActivationUniversity[];
        error?: string;
      };
      if (!res.ok) throw new Error(d.error ?? `Request failed (${res.status}).`);
      setUni(d.universities[0] ?? null);
      setFailed(null);
    } catch (e) {
      setFailed(e instanceof Error ? e.message : "This university could not be loaded.");
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const post = async (path: string, body: unknown, method: "POST" | "PATCH" = "POST") => {
    const res = await fetch(`/api/admin/medjobs/activation${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { wentLive?: boolean; error?: string };
    if (!res.ok) {
      // Surfaced by whichever control was clicked, rather than swallowed.
      // The server now says what actually went wrong, migration included.
      throw new Error(data.error ?? `Could not save that (${res.status}).`);
    }
    await load();
    onChanged();
    setError(null);
    return data;
  };

  /** For actions with nowhere of their own to show a failure. */
  const postSafe = async (path: string, body: unknown, method: "POST" | "PATCH" = "POST") => {
    try {
      await post(path, body, method);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that.");
    }
  };

  const counts = uni
    ? {
        live: uni.channels.filter((c) => c.status === "live").length,
        progress: uni.channels.filter((c) => c.status === "in_progress").length,
        notYet: uni.channels.filter((c) => c.status === "not_yet").length,
        na: uni.channels.filter((c) => c.status === "not_available").length,
      }
    : null;

  const summary = counts
    ? [
        `${counts.live} of 5 live`,
        counts.progress ? `${counts.progress} in progress` : null,
        counts.notYet ? `${counts.notYet} not yet` : null,
        counts.na ? `${counts.na} not available` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <DrawerShell
      onClose={onClose}
      header={
        <div>
          <h2 className="text-base font-semibold text-gray-900">{uni?.name ?? "Loading…"}</h2>
          {summary ? <p className="mt-0.5 text-xs text-gray-500">{summary}</p> : null}
        </div>
      }
    >
      {failed ? (
        <p className="m-4 rounded-md bg-error-50 px-3 py-2.5 text-sm text-error-700">{failed}</p>
      ) : !uni ? (
        <p className="px-4 py-6 text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="space-y-2 px-4 py-4">
          {error ? (
            <p className="rounded-md bg-error-50 px-3 py-2 text-[13px] text-error-700">{error}</p>
          ) : null}
          {uni.channels.map((ch) => (
            <ChannelCard
              key={ch.channel}
              campusId={uni.id}
              channel={ch}
              onOpenTask={onOpenTask}
              onToggle={(key, checked) =>
                post("/criterion", {
                  campusId: uni.id,
                  channel: ch.channel as Channel,
                  key,
                  checked,
                }).then((d) => ({ wentLive: Boolean(d.wentLive) }))
              }
              onNote={(text) =>
                postSafe("", { campusId: uni.id, channel: ch.channel, note: text }, "PATCH")
              }
              onDetail={(detail) =>
                postSafe("", { campusId: uni.id, channel: ch.channel, detail }, "PATCH")
              }
              onNotAvailable={(reason) =>
                postSafe(
                  "",
                  { campusId: uni.id, channel: ch.channel, notAvailable: true, reason },
                  "PATCH",
                )
              }
              onAddRecord={(name) =>
                postSafe("/record", {
                  campusId: uni.id,
                  channel: ch.channel,
                  kind:
                    ch.channel === "st5" ? "organization" : ch.channel === "st6" ? "event" : "professor",
                  name,
                })
              }
              onRecordToggle={(recordId, key, checked) =>
                post("/criterion", {
                  campusId: uni.id,
                  channel: ch.channel as Channel,
                  recordId,
                  key,
                  checked,
                }).then((d) => ({ wentLive: Boolean(d.wentLive) }))
              }
              onRecordNote={(recordId, text) =>
                postSafe("/record", { recordId, note: text }, "PATCH")
              }
              onRecordDecline={(recordId, reason) =>
                postSafe("/record", { recordId, decline: true, reason }, "PATCH")
              }
            />
          ))}
        </div>
      )}
    </DrawerShell>
  );
}
