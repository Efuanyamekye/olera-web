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
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/medjobs/activation?university=${encodeURIComponent(slug)}`);
      if (!res.ok) throw new Error(String(res.status));
      const d = (await res.json()) as { universities: ActivationUniversity[] };
      setUni(d.universities[0] ?? null);
      setFailed(false);
    } catch {
      setFailed(true);
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
    const data = await res.json().catch(() => ({}));
    await load();
    onChanged();
    return data as { wentLive?: boolean; error?: string };
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
        <p className="px-4 py-6 text-sm text-gray-500">This university could not be loaded.</p>
      ) : !uni ? (
        <p className="px-4 py-6 text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="space-y-2 px-4 py-4">
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
                post("", { campusId: uni.id, channel: ch.channel, note: text }, "PATCH").then(() => {})
              }
              onDetail={(detail) =>
                post("", { campusId: uni.id, channel: ch.channel, detail }, "PATCH").then(() => {})
              }
              onNotAvailable={(reason) =>
                post(
                  "",
                  { campusId: uni.id, channel: ch.channel, notAvailable: true, reason },
                  "PATCH",
                ).then(() => {})
              }
              onAddRecord={(name) =>
                post("/record", {
                  campusId: uni.id,
                  channel: ch.channel,
                  kind:
                    ch.channel === "st5" ? "organization" : ch.channel === "st6" ? "event" : "professor",
                  name,
                }).then(() => {})
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
                post("/record", { recordId, note: text }, "PATCH").then(() => {})
              }
              onRecordDecline={(recordId, reason) =>
                post("/record", { recordId, decline: true, reason }, "PATCH").then(() => {})
              }
            />
          ))}
        </div>
      )}
    </DrawerShell>
  );
}
