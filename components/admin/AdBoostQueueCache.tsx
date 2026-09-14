"use client";

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import type { CampaignRequest } from "./AdBoostShared";
import type { AdBoostQueueSort } from "./ad-boost-queue";

export type QueueView = "active" | "archived";
export interface QueueSnapshot {
  requests: CampaignRequest[];
  counts: { active: number; archived: number };
  at: number;
}
interface QueueCache {
  rows: Map<QueueView, QueueSnapshot>;
  preferences: { view: QueueView; filter: Record<QueueView, string | null | undefined>; sort: AdBoostQueueSort; expanded: Set<string> };
}
const Context = createContext<QueueCache | null>(null);
export const AD_BOOST_QUEUE_SETTLED = "ad-boost-queue-settled";
const INVALIDATE = "ad-boost-queue-invalidated";

export function AdBoostQueueCacheProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  // Memory only, scoped to this authenticated layout and identity. Never share
  // admin responses through a public HTTP cache or browser persistent storage.
  const cache = useMemo<QueueCache>(() => ({
    rows: new Map(),
    preferences: { view: "active", filter: { active: undefined, archived: undefined }, sort: "priority", expanded: new Set() },
  }), [user?.id]);
  useEffect(() => {
    const invalidate = () => cache.rows.clear();
    window.addEventListener(INVALIDATE, invalidate);
    return () => window.removeEventListener(INVALIDATE, invalidate);
  }, [cache]);
  return <Context.Provider key={user?.id ?? "signed-out"} value={cache}>{children}</Context.Provider>;
}

export function useAdBoostQueueCache() {
  const cache = useContext(Context);
  if (!cache) throw new Error("Ad Boost queue requires its admin cache provider");
  return cache;
}

/** Invalidate on attempted mutations too: a disconnected response may still
 * have committed on the server. Both queue tabs must be refreshed. */
export async function fetchAdBoost(input: RequestInfo | URL, init?: RequestInit) {
  try {
    return await fetch(input, init);
  } finally {
    if (init?.method && init.method.toUpperCase() !== "GET") {
      window.dispatchEvent(new Event(INVALIDATE));
    }
  }
}
