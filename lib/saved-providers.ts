/**
 * SessionStorage helpers for anonymous provider saves.
 *
 * Anonymous users can save up to ANON_SAVE_LIMIT providers locally.
 * After authenticating, these are migrated to the database.
 */

const STORAGE_KEY = "olera_saved_providers";
export const ANON_SAVE_LIMIT = 3;

export interface SavedProviderEntry {
  providerId: string;
  slug: string;
  name: string;
  location: string;
  careTypes: string[];
  image: string | null;
  savedAt: string;
}

function readStorage(): SavedProviderEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeStorage(entries: SavedProviderEntry[]) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function getAnonSaves(): SavedProviderEntry[] {
  return readStorage();
}

export function getAnonSaveCount(): number {
  return readStorage().length;
}

export function isAnonSaved(providerId: string): boolean {
  return readStorage().some((e) => e.providerId === providerId);
}

/**
 * Add an anonymous save. Returns false if at limit.
 */
export function addAnonSave(
  entry: Omit<SavedProviderEntry, "savedAt">
): boolean {
  const saves = readStorage();
  if (saves.length >= ANON_SAVE_LIMIT) return false;
  if (saves.some((e) => e.providerId === entry.providerId)) return true; // already saved

  saves.push({ ...entry, savedAt: new Date().toISOString() });
  writeStorage(saves);
  return true;
}

export function removeAnonSave(providerId: string): void {
  const saves = readStorage().filter((e) => e.providerId !== providerId);
  writeStorage(saves);
}

export function clearAnonSaves(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(STORAGE_KEY);
}
