"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import {
  getAnonSaves,
  addAnonSave,
  removeAnonSave,
  isAnonSaved,
  clearAnonSaves,
  ANON_SAVE_LIMIT,
  type SavedProviderEntry,
} from "@/lib/saved-providers";

export type { SavedProviderEntry } from "@/lib/saved-providers";

export interface SaveProviderData {
  providerId: string;
  slug: string;
  name: string;
  location: string;
  careTypes: string[];
  image: string | null;
}

interface SavedProvidersContextValue {
  isSaved: (providerId: string) => boolean;
  toggleSave: (provider: SaveProviderData) => void;
  savedCount: number;
  anonSaves: SavedProviderEntry[];
  savedProviders: SavedProviderEntry[];
}

const SavedProvidersContext = createContext<SavedProvidersContextValue | null>(
  null
);

export function useSavedProviders() {
  const ctx = useContext(SavedProvidersContext);
  if (!ctx) {
    throw new Error(
      "useSavedProviders must be used within a SavedProvidersProvider"
    );
  }
  return ctx;
}

export function SavedProvidersProvider({ children }: { children: ReactNode }) {
  const { user, activeProfile, openAuthModal } = useAuth();

  // Anonymous saves (from sessionStorage)
  const [anonSaves, setAnonSaves] = useState<SavedProviderEntry[]>([]);
  // Authenticated saves — set of provider IDs + full entries
  const [dbSaveIds, setDbSaveIds] = useState<Set<string>>(new Set());
  const [dbSaves, setDbSaves] = useState<SavedProviderEntry[]>([]);

  const migrationDone = useRef(false);

  // Hydrate anonymous saves from sessionStorage on mount
  useEffect(() => {
    setAnonSaves(getAnonSaves());
  }, []);

  // Fetch DB saves for authenticated users
  useEffect(() => {
    if (!activeProfile || !isSupabaseConfigured()) {
      setDbSaveIds(new Set());
      setDbSaves([]);
      return;
    }

    const fetchDbSaves = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("connections")
        .select("to_profile_id, message, created_at")
        .eq("from_profile_id", activeProfile.id)
        .eq("type", "save")
        .order("created_at", { ascending: false });

      if (data) {
        setDbSaveIds(new Set(data.map((r) => r.to_profile_id)));
        setDbSaves(
          data.map((r) => {
            const meta = r.message ? JSON.parse(r.message) : {};
            return {
              providerId: r.to_profile_id,
              slug: meta.slug || r.to_profile_id,
              name: meta.name || "Unknown Provider",
              location: meta.location || "",
              careTypes: meta.careTypes || [],
              image: meta.image || null,
              savedAt: r.created_at,
            };
          })
        );
      }
    };

    fetchDbSaves();
  }, [activeProfile]);

  // Migrate anonymous saves to DB when user authenticates
  useEffect(() => {
    if (!user || !activeProfile || !isSupabaseConfigured()) return;
    if (migrationDone.current) return;

    const saves = getAnonSaves();
    if (saves.length === 0) return;

    migrationDone.current = true;

    const migrate = async () => {
      const supabase = createClient();

      const rows = saves.map((s) => ({
        from_profile_id: activeProfile.id,
        to_profile_id: s.providerId,
        type: "save" as const,
        status: "pending" as const,
        message: JSON.stringify({
          name: s.name,
          slug: s.slug,
          location: s.location,
          careTypes: s.careTypes,
          image: s.image,
        }),
      }));

      // Insert all, ignoring duplicates
      for (const row of rows) {
        await supabase
          .from("connections")
          .insert(row)
          .then(({ error }) => {
            if (error && error.code !== "23505") {
              console.error("Migration save error:", error.message);
            }
          });
      }

      clearAnonSaves();
      setAnonSaves([]);

      // Refresh DB saves
      const { data } = await supabase
        .from("connections")
        .select("to_profile_id, message, created_at")
        .eq("from_profile_id", activeProfile.id)
        .eq("type", "save")
        .order("created_at", { ascending: false });

      if (data) {
        setDbSaveIds(new Set(data.map((r) => r.to_profile_id)));
        setDbSaves(
          data.map((r) => {
            const meta = r.message ? JSON.parse(r.message) : {};
            return {
              providerId: r.to_profile_id,
              slug: meta.slug || r.to_profile_id,
              name: meta.name || "Unknown Provider",
              location: meta.location || "",
              careTypes: meta.careTypes || [],
              image: meta.image || null,
              savedAt: r.created_at,
            };
          })
        );
      }
    };

    migrate();
  }, [user, activeProfile]);

  const isSaved = useCallback(
    (providerId: string) => {
      return dbSaveIds.has(providerId) || anonSaves.some((s) => s.providerId === providerId);
    },
    [dbSaveIds, anonSaves]
  );

  const toggleSave = useCallback(
    async (provider: SaveProviderData) => {
      const currentlySaved = dbSaveIds.has(provider.providerId) ||
        anonSaves.some((s) => s.providerId === provider.providerId);

      if (currentlySaved) {
        // ── Unsave ──
        if (user && activeProfile && isSupabaseConfigured()) {
          // DB unsave (optimistic)
          setDbSaveIds((prev) => {
            const next = new Set(prev);
            next.delete(provider.providerId);
            return next;
          });
          setDbSaves((prev) => prev.filter((s) => s.providerId !== provider.providerId));
          const supabase = createClient();
          await supabase
            .from("connections")
            .delete()
            .eq("from_profile_id", activeProfile.id)
            .eq("to_profile_id", provider.providerId)
            .eq("type", "save");
        } else {
          // Anonymous unsave
          removeAnonSave(provider.providerId);
          setAnonSaves(getAnonSaves());
        }
      } else {
        // ── Save ──
        if (user && activeProfile && isSupabaseConfigured()) {
          // DB save (optimistic)
          setDbSaveIds((prev) => new Set(prev).add(provider.providerId));
          setDbSaves((prev) => [
            {
              providerId: provider.providerId,
              slug: provider.slug,
              name: provider.name,
              location: provider.location,
              careTypes: provider.careTypes,
              image: provider.image,
              savedAt: new Date().toISOString(),
            },
            ...prev,
          ]);
          const supabase = createClient();
          await supabase
            .from("connections")
            .insert({
              from_profile_id: activeProfile.id,
              to_profile_id: provider.providerId,
              type: "save" as const,
              status: "pending" as const,
              message: JSON.stringify({
                name: provider.name,
                slug: provider.slug,
                location: provider.location,
                careTypes: provider.careTypes,
                image: provider.image,
              }),
            })
            .then(({ error }) => {
              if (error && error.code !== "23505") {
                console.error("Save error:", error.message);
              }
            });
        } else {
          // Anonymous save
          const added = addAnonSave({
            providerId: provider.providerId,
            slug: provider.slug,
            name: provider.name,
            location: provider.location,
            careTypes: provider.careTypes,
            image: provider.image,
          });

          if (!added) {
            // At limit — prompt auth
            openAuthModal(
              {
                action: "save",
                targetProfileId: provider.providerId,
                returnUrl: typeof window !== "undefined" ? window.location.pathname : "/",
              },
              "sign-up"
            );
            return;
          }

          setAnonSaves(getAnonSaves());
        }
      }
    },
    [user, activeProfile, dbSaveIds, anonSaves, openAuthModal]
  );

  const savedCount = dbSaveIds.size + anonSaves.length;
  const savedProviders = user && activeProfile ? dbSaves : anonSaves;

  return (
    <SavedProvidersContext.Provider
      value={{ isSaved, toggleSave, savedCount, anonSaves, savedProviders }}
    >
      {children}
    </SavedProvidersContext.Provider>
  );
}
