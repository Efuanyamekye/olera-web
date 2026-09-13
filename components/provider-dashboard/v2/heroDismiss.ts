// Per-provider, per-update dismissal. Legacy global dismissals are intentionally ignored.
export function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const storageKey = (providerSlug: string) => `olera_hero_updates_v2:${providerSlug}`;

export function readDismissals(providerSlug: string): string[] {
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey(providerSlug)) ?? "null");
    return saved?.day === todayStamp() && Array.isArray(saved.keys)
      ? saved.keys.filter((key: unknown): key is string => typeof key === "string") : [];
  } catch { return []; }
}

/** Loading hint only: fresh dashboard data always decides actual eligibility. */
export function readUpdatesCollapsed(providerSlug: string): boolean {
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey(providerSlug)) ?? "null");
    return saved?.day === todayStamp() && saved.collapsed === true;
  } catch { return false; }
}

export function writeDismissals(providerSlug: string, keys: string[], collapsed = false): void {
  try {
    window.localStorage.setItem(storageKey(providerSlug), JSON.stringify({ day: todayStamp(), keys, collapsed }));
  } catch { /* In-memory state still works when browser storage is unavailable. */ }
}
