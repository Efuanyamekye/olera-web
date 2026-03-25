"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

/**
 * Lightweight hook that counts unread pending Q&A questions for a provider.
 * Fetches pending questions from the database and checks against localStorage
 * for read tracking.
 *
 * Features:
 * - Fetches from database on mount (not just localStorage cache)
 * - Listens for "olera:qna-read" custom events for immediate updates
 * - Listens for "olera:qna-sync" for page-level syncs
 * - Cross-tab synchronization via storage events
 */
export function useUnreadQnACount(providerSlug: string | null): number {
  const [count, setCount] = useState(0);
  const fetchingRef = useRef(false);

  const recount = useCallback(() => {
    if (!providerSlug || fetchingRef.current) return;

    if (!isSupabaseConfigured()) {
      setCount(0);
      return;
    }

    fetchingRef.current = true;

    (async () => {
      try {
        const supabase = createClient();

        // Fetch pending (unanswered) questions for this provider
        const { data: questions } = await supabase
          .from("provider_questions")
          .select("id")
          .eq("provider_id", providerSlug)
          .eq("status", "pending");

        if (!questions || questions.length === 0) {
          setCount(0);
          // Cache the count
          try {
            localStorage.setItem(`olera_qna_count_${providerSlug}`, "0");
          } catch { /* localStorage unavailable */ }
          return;
        }

        // Get read question IDs from localStorage
        let readIds = new Set<string>();
        try {
          const stored = localStorage.getItem(`olera_qna_read_${providerSlug}`);
          if (stored) {
            const parsed: string[] = JSON.parse(stored);
            parsed.forEach((id) => readIds.add(id));
          }
        } catch { /* localStorage unavailable */ }

        // Count unread questions
        const unreadCount = questions.filter((q) => !readIds.has(q.id)).length;
        setCount(unreadCount);

        // Cache the count
        try {
          localStorage.setItem(`olera_qna_count_${providerSlug}`, String(unreadCount));
        } catch { /* localStorage unavailable */ }
      } catch (err) {
        console.error("[useUnreadQnACount] Error:", err);
        setCount(0);
      } finally {
        fetchingRef.current = false;
      }
    })();
  }, [providerSlug]);

  // Initial count from database
  useEffect(() => {
    recount();
  }, [recount]);

  // Re-count when a question is marked as read
  useEffect(() => {
    const handler = () => {
      setTimeout(recount, 100);
    };
    window.addEventListener("olera:qna-read", handler);
    return () => window.removeEventListener("olera:qna-read", handler);
  }, [recount]);

  // Listen for sync events from Q&A page
  useEffect(() => {
    const syncHandler = (e: Event) => {
      const { count: syncedCount, providerSlug: syncSlug } = (e as CustomEvent).detail;
      if (syncSlug === providerSlug && typeof syncedCount === "number") {
        setCount(syncedCount);
        try {
          localStorage.setItem(`olera_qna_count_${providerSlug}`, String(syncedCount));
        } catch { /* localStorage unavailable */ }
      }
    };
    window.addEventListener("olera:qna-sync", syncHandler);
    return () => window.removeEventListener("olera:qna-sync", syncHandler);
  }, [providerSlug]);

  // Listen for new questions (increment count)
  useEffect(() => {
    const newHandler = () => setCount((c) => c + 1);
    window.addEventListener("olera:qna-new", newHandler);
    return () => window.removeEventListener("olera:qna-new", newHandler);
  }, []);

  // Cross-tab synchronization
  useEffect(() => {
    if (!providerSlug) return;
    const readKey = `olera_qna_read_${providerSlug}`;
    const handleStorage = (e: StorageEvent) => {
      if (e.key === readKey) {
        recount();
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [providerSlug, recount]);

  return count;
}

/**
 * Mark a question as read in localStorage and dispatch event.
 */
export function markQuestionAsRead(questionId: string, providerSlug: string): void {
  const readKey = `olera_qna_read_${providerSlug}`;
  try {
    const stored = localStorage.getItem(readKey);
    const readIds: string[] = stored ? JSON.parse(stored) : [];
    if (!readIds.includes(questionId)) {
      readIds.push(questionId);
      localStorage.setItem(readKey, JSON.stringify(readIds));
      window.dispatchEvent(new CustomEvent("olera:qna-read"));
    }
  } catch { /* localStorage unavailable */ }
}
