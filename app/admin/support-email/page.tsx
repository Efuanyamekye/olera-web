"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import AdminWorkspace from "@/components/admin/AdminWorkspace";
import {
  ArrowDownUp,
  ArrowLeft,
  Check,
  Download,
  Filter,
  ListFilter,
  Paperclip,
  Phone,
  Search,
} from "lucide-react";

type View = "needs_reply" | "all" | "handled" | "noise" | "escalated" | "snoozed";
type DateWindow = "all" | "today" | "7d" | "30d" | "90d";
type Sort = "newest" | "oldest";

interface Mailbox {
  id: string;
  email: string;
  sync_status: string;
  watch_expiration: string | null;
  full_sync_complete: boolean;
  full_sync_messages_imported: number;
  last_sync_at: string | null;
  last_error: string | null;
}

interface Thread {
  id: string;
  gmail_thread_id: string;
  subject: string;
  snippet: string;
  participants: string[];
  last_message_at: string;
  message_count: number;
  unread: boolean;
  state: string;
  category: string;
  priority: string;
  matched_profile_id: string | null;
  matched_profile_type: string | null;
  matched_profile_name: string | null;
  matched_provider_id: string | null;
  agent_summary: string | null;
  agent_reason: string | null;
  agent_confidence: number | null;
  suggested_action: string | null;
  suggested_owner: string | null;
  suggested_draft: string | null;
  agent_risk_flags: string[];
  gmail_draft_id: string | null;
  draft_body: string | null;
  snoozed_until: string | null;
}

interface Message {
  id: string;
  gmail_message_id: string;
  direction: "in" | "out";
  from_email: string | null;
  from_name: string | null;
  to_emails: string[];
  subject: string;
  body_text: string;
  snippet: string;
  internal_date: string;
  has_attachments: boolean;
  attachments: Array<{ attachmentId: string | null; filename: string; mimeType: string; size: number }>;
  list_unsubscribe: string[];
  list_unsubscribe_post: boolean;
}

interface Detail {
  thread: Thread & { mailbox: { email: string } };
  messages: Message[];
  actions: Array<{ action: string; actor: string; created_at: string }>;
  recommendations: Array<{ id: string; feedback: string | null }>;
}

const VIEWS: Array<{ key: View; label: string }> = [
  { key: "needs_reply", label: "Needs attention" },
  { key: "all", label: "All" },
  { key: "escalated", label: "Escalated" },
  { key: "snoozed", label: "Snoozed" },
  { key: "noise", label: "Noise" },
];

const ACTION_LABELS: Record<string, string> = {
  draft_reply: "Draft a reply",
  archive: "Archive",
  unsubscribe: "Unsubscribe",
  escalate: "Escalate internally",
  call_back: "Call back",
  provider_removal: "Start provider removal",
  do_not_contact: "Add to Do Not Contact",
  create_task: "Create internal task",
  no_action: "No action needed",
};

const CATEGORY_LABELS: Record<string, string> = {
  care_seeker: "Care seeker",
  provider: "Provider",
  partner: "Partner",
  press: "Press",
  marketing: "Marketing",
  automated: "Automated",
  legal: "Legal / removal",
  security: "Security",
  billing: "Billing",
  voicemail: "Voicemail",
  internal: "Internal",
  other: "Other",
};

const CATEGORY_OPTIONS = [
  "all", "voicemail", "care_seeker", "provider", "partner", "press", "marketing",
  "automated", "legal", "security", "billing", "internal", "other",
];

const DATE_LABELS: Record<DateWindow, string> = {
  all: "Any date",
  today: "Past 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
};

function relative(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function mailboxSyncMessage(message: string): string {
  if (/Gmail API|Google OAuth|fetch failed|timed?\s*out/i.test(message)) {
    return "Gmail sync was temporarily interrupted. Olera will retry automatically; the inbox remains available.";
  }
  return message;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function sender(thread: Thread): string {
  return thread.matched_profile_name || thread.participants?.find((p) => !p.endsWith("@olera.care")) || "Unknown sender";
}

function confidence(value: number | null): string | null {
  if (value == null) return null;
  return `${Math.round(value * 100)}% confidence`;
}

function formatBytes(value: number): string {
  if (!value) return "";
  if (value < 1_024) return `${value} B`;
  if (value < 1_048_576) return `${Math.round(value / 1_024)} KB`;
  return `${(value / 1_048_576).toFixed(1)} MB`;
}

function isAudioAttachment(attachment: Message["attachments"][number]): boolean {
  return attachment.mimeType.startsWith("audio/") || /\.(?:mp3|m4a|wav|ogg)$/i.test(attachment.filename);
}

function callbackNumber(detail: Detail | null): string | null {
  if (!detail) return null;
  const inbound = [...detail.messages].reverse().find((message) => message.direction === "in");
  const text = [detail.thread.subject, inbound?.body_text ?? ""].join("\n");
  const match = text.match(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/);
  return match?.[0]?.trim() ?? null;
}

function attachmentUrl(threadId: string, messageId: string, attachmentId: string, download = false): string {
  const base = `/api/admin/support-email/${encodeURIComponent(threadId)}/attachments/${encodeURIComponent(messageId)}/${encodeURIComponent(attachmentId)}`;
  return download ? `${base}?download=1` : base;
}

export default function SupportEmailPage() {
  const [view, setView] = useState<View>("needs_reply");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [dateWindow, setDateWindow] = useState<DateWindow>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [priority, setPriority] = useState<"all" | "urgent">("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [total, setTotal] = useState(0);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [reply, setReply] = useState("");
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const listRequestRef = useRef(0);
  const listInFlightRef = useRef<number | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const detailRequestRef = useRef(0);
  const markingReadRef = useRef<Set<string>>(new Set());
  const threadsRef = useRef<Thread[] | null>(null);
  const listScopeRef = useRef<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  const unreadOnlyRef = useRef(false);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    unreadOnlyRef.current = unreadOnly;
  }, [unreadOnly]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const oauthError = params.get("error");
    if (params.get("view") === "needs_reply") setView("needs_reply");
    if (params.get("priority") === "urgent") setPriority("urgent");
    if (params.get("sort") === "oldest") setSort("oldest");
    if (connected) setNotice(`${connected} is connected. Full mailbox history is importing newest first.`);
    if (oauthError) setError(oauthError);
    if (connected || oauthError) window.history.replaceState({}, "", "/admin/support-email");
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const loadList = useCallback(async (background = false) => {
    // A timer must not supersede a still-pending filter/action refresh. On a
    // slow connection that would discard every response and freeze the list.
    if (background && listInFlightRef.current !== null) return;
    const requestId = ++listRequestRef.current;
    listInFlightRef.current = requestId;
    const scopeKey = JSON.stringify({ view, query, category, dateWindow, priority, sort });
    try {
      if (!background) setError(null);
      const params = new URLSearchParams({ view });
      if (query) params.set("q", query);
      if (category !== "all") params.set("category", category);
      if (dateWindow !== "all") params.set("date", dateWindow);
      if (unreadOnly) params.set("unread", "true");
      if (priority !== "all") params.set("priority", priority);
      if (sort === "oldest") params.set("sort", "oldest");
      const res = await fetch(`/api/admin/support-email?${params}`, { signal: AbortSignal.timeout(30_000) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load support email");
      if (requestId !== listRequestRef.current) return;
      const nextThreads: Thread[] = data.threads ?? [];
      // An unread thread becomes read as soon as its detail successfully
      // opens. Preserve that selected row through same-scope refreshes until
      // the operator moves away, even though the server now excludes it.
      const retainedSelected = unreadOnly && listScopeRef.current === scopeKey
        ? threadsRef.current?.find((thread) => thread.id === selectedRef.current && !thread.unread)
        : null;
      threadsRef.current = retainedSelected && !nextThreads.some((thread) => thread.id === retainedSelected.id)
        ? [retainedSelected, ...nextThreads]
        : nextThreads;
      listScopeRef.current = scopeKey;
      setRefreshError(null);
      setMailboxes(data.mailboxes ?? []);
      setThreads(threadsRef.current);
      setTotal(data.total ?? 0);
    } catch (err) {
      if (requestId !== listRequestRef.current) return;
      if (background) {
        setRefreshError("Inbox refresh paused. Showing the last loaded conversations; retrying automatically.");
        return;
      }
      threadsRef.current = [];
      setThreads([]);
      setTotal(0);
      setRefreshError(err instanceof Error ? err.message : "Could not load support email");
    } finally {
      if (listInFlightRef.current === requestId) listInFlightRef.current = null;
    }
  }, [category, dateWindow, priority, query, sort, unreadOnly, view]);

  useEffect(() => { void loadList(); }, [loadList]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") void loadList(true);
    };
    const timer = setInterval(refresh, 15_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [loadList]);

  const markThreadRead = useCallback(async (id: string) => {
    if (markingReadRef.current.has(id)) return;
    markingReadRef.current.add(id);
    try {
      const res = await fetch(`/api/admin/support-email/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_read" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not mark this conversation read");
      const targetWasVisible = Boolean(threadsRef.current?.some((thread) => thread.id === id));
      threadsRef.current = threadsRef.current?.flatMap((thread) => {
        if (thread.id !== id) return [thread];
        // The just-opened row stays put while it is selected. If the admin
        // already moved on before Gmail answered, remove it from Unread now.
        if (unreadOnlyRef.current && selectedRef.current !== id) return [];
        return [{ ...thread, unread: false }];
      }) ?? threadsRef.current;
      setThreads(threadsRef.current);
      setDetail((current) => current?.thread.id === id
        ? { ...current, thread: { ...current.thread, unread: false } }
        : current);
      if (unreadOnlyRef.current && targetWasVisible) {
        setTotal((current) => Math.max(0, current - 1));
      }
    } catch (err) {
      if (selectedRef.current === id) {
        setError(err instanceof Error ? err.message : "Could not mark this conversation read");
      }
    } finally {
      markingReadRef.current.delete(id);
    }
  }, []);

  const loadDetail = useCallback(async (id: string, adoptDraft = true) => {
    const requestId = ++detailRequestRef.current;
    setLoadingDetail(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/support-email/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load this thread");
      if (requestId !== detailRequestRef.current || selectedRef.current !== id) return;
      setDetail(data);
      if (adoptDraft) setReply(data.thread.draft_body || data.thread.suggested_draft || "");
      if (data.thread.unread) void markThreadRead(id);
    } catch (err) {
      if (requestId !== detailRequestRef.current || selectedRef.current !== id) return;
      setDetail(null);
      setError(err instanceof Error ? err.message : "Could not load this thread");
    } finally {
      if (requestId === detailRequestRef.current) setLoadingDetail(false);
    }
  }, [markThreadRead]);

  useEffect(() => {
    if (selected) void loadDetail(selected);
    else {
      detailRequestRef.current += 1;
      setDetail(null);
      setLoadingDetail(false);
    }
  }, [selected, loadDetail]);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    if (!selected) return;
    const targetId = selected;
    setActing(action);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/support-email/${targetId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Action failed");
      const messages: Record<string, string> = {
        save_draft: "Draft saved in Gmail.", send: "Reply sent from Olera Support.", archive: "Thread archived.",
        mark_noise: "Moved out of the active inbox.", unsubscribe: "Unsubscribed and archived.",
        escalate: "Escalated for internal review.", mark_handled: "Marked handled.",
        do_not_contact: "Sender added to Do Not Contact.", feedback: "Agent feedback saved.",
      };
      setNotice(data.warning || messages[action] || "Done.");
      if (action === "send" && selectedRef.current === targetId) setReply("");
      await loadList();
      if (selectedRef.current === targetId) {
        await loadDetail(targetId, action !== "save_draft" && action !== "send");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActing(null);
    }
  }

  async function syncNow() {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/support-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync_now", mailboxId: mailboxes[0]?.id }),
        signal: AbortSignal.timeout(55_000),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      setNotice(data.queued
        ? "Gmail sync requested. This inbox will refresh automatically."
        : "Gmail sync finished.");
      await loadList();
    } catch (err) {
      setError(mailboxSyncMessage(err instanceof Error ? err.message : "Sync failed"));
    } finally {
      setSyncing(false);
    }
  }

  function leaveSelectedThread(nextId: string | null) {
    const previousId = selectedRef.current;
    const previousIsNowRead = threadsRef.current?.some((thread) => thread.id === previousId && !thread.unread);
    if (unreadOnly && previousId && previousId !== nextId && previousIsNowRead) {
      threadsRef.current = threadsRef.current?.filter((thread) => thread.id !== previousId) ?? threadsRef.current;
      setThreads(threadsRef.current);
    }
    selectedRef.current = nextId;
  }

  function selectThread(id: string) {
    if (selectedRef.current === id) return;
    leaveSelectedThread(id);
    detailRequestRef.current += 1;
    setDetail(null);
    setReply("");
    setSelected(id);
  }

  const latestInbound = useMemo(
    () => detail ? [...detail.messages].reverse().find((m) => m.direction === "in") ?? null : null,
    [detail],
  );
  const mailbox = mailboxes[0] ?? null;
  const phone = callbackNumber(detail);
  const isVoicemail = detail?.thread.category === "voicemail";

  function clearPriorityFilter() {
    setPriority("all");
    const params = new URLSearchParams(window.location.search);
    params.delete("priority");
    const queryString = params.toString();
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${queryString ? `?${queryString}` : ""}`,
    );
  }

  const scopeParts = [
    priority === "urgent" ? "Urgent + escalated" : null,
    category !== "all" ? CATEGORY_LABELS[category] : null,
    dateWindow !== "all" ? DATE_LABELS[dateWindow] : null,
  ].filter((value): value is string => Boolean(value));
  const resultLabel = threads == null
    ? "Loading conversations…"
    : `${total.toLocaleString()} ${unreadOnly ? "unread" : `conversation${total === 1 ? "" : "s"}`}${scopeParts.length ? ` · ${scopeParts.join(" · ")}` : ""}`;

  return (
    <AdminWorkspace>
      {refreshError && <div role="status" className="shrink-0 border-b border-amber-100 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">{refreshError}</div>}
      {mailbox && !mailbox.full_sync_complete && (
        <div className="flex shrink-0 flex-col gap-1 border-b border-amber-100 bg-amber-50/60 px-4 py-2 text-xs text-amber-900 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" /><strong>{mailbox.full_sync_messages_imported.toLocaleString()}</strong> imported · History is still syncing</span>
          <span className="text-amber-700">New mail always arrives first</span>
        </div>
      )}
      {mailbox?.sync_status === "error" && mailbox.last_error && <div className="shrink-0 border-b border-rose-100 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{mailboxSyncMessage(mailbox.last_error)}</div>}
      {notice && <div className="shrink-0 border-b border-emerald-100 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">{notice}</div>}
      {error && <div className="shrink-0 border-b border-rose-100 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{error}</div>}

      {priority === "urgent" && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <span><strong>Urgent + escalated queue.</strong> Work oldest first; reply, assign a real escalation owner, or mark handled when the customer has a next step.</span>
          <button type="button" onClick={clearPriorityFilter} className="shrink-0 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-rose-100">
            Show all
          </button>
        </div>
      )}

      {!mailbox && !error && !refreshError ? (
        <div className="flex flex-1 items-center justify-center px-6 py-16 text-center">
          <div>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 text-xl text-teal-700">✦</div>
          <h2 className="text-lg font-semibold text-gray-900">Connect the Olera support mailbox</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-500">The first sync starts with today, then keeps walking backwards until the complete Gmail history is available here.</p>
          <Link prefetch={false} href="/api/admin/support-email/connect" className="mt-5 inline-flex rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800">Connect Gmail</Link>
          </div>
        </div>
      ) : mailbox && (
        <div className={`grid min-h-0 min-w-0 flex-1 grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] ${detail ? "2xl:grid-cols-[340px_minmax(0,1fr)_320px]" : ""}`}>
            <section className={`${selected ? "hidden lg:flex" : "flex"} min-h-0 min-w-0 flex-col border-r border-gray-200 bg-white`}>
              <div className="border-b border-gray-200 px-4 pb-3 pt-5">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="truncate text-xl font-semibold tracking-tight text-gray-950">Support Email</h1>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${mailbox.sync_status === "error" ? "bg-rose-50 text-rose-700" : mailbox.sync_status === "backfilling" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                        {mailbox.sync_status === "error" ? "Needs attention" : mailbox.sync_status === "backfilling" ? "Catching up" : "Live"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-gray-500">Support conversations and their next move.</p>
                    {mailbox.sync_status === "backfilling" && mailbox.full_sync_complete && (
                      <p className="mt-1 text-xs leading-5 text-amber-700">Catching up on older Gmail changes. Read and archive updates may leave the conversation count unchanged.</p>
                    )}
                    {mailbox.last_sync_at && (
                      <p className="mt-1 text-[11px] leading-4 text-gray-400">Last sync progress: <time dateTime={mailbox.last_sync_at} title={new Date(mailbox.last_sync_at).toLocaleString()}>{relative(mailbox.last_sync_at)}</time></p>
                    )}
                  </div>
                  <button onClick={() => void syncNow()} disabled={syncing} className="shrink-0 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                    {syncing ? "Syncing…" : "Sync"}
                  </button>
                </div>
                <div className="flex gap-1 overflow-x-auto pb-2">
                  {VIEWS.map((item) => (
                    <button key={item.key} onClick={() => setView(item.key)} className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium ${view === item.key ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:text-gray-800"}`}>
                      {item.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <label className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                    <input aria-label="Search support email" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search mail…" className="w-full rounded-lg border border-gray-200 py-2 pl-8 pr-3 text-sm outline-none placeholder:text-gray-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-100" />
                  </label>
                  <button
                    onClick={() => {
                      if (!unreadOnly && detail && !detail.thread.unread) {
                        leaveSelectedThread(null);
                        setSelected(null);
                      }
                      setUnreadOnly((current) => !current);
                    }}
                    aria-pressed={unreadOnly}
                    aria-label={unreadOnly ? "Show all conversations" : "Show unread conversations only"}
                    title={unreadOnly ? "Show all conversations" : "Show unread only"}
                    className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full border shadow-sm transition-[color,background-color,border-color,transform] duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 ${unreadOnly ? "border-teal-600 bg-teal-600 text-white hover:bg-teal-700" : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900"}`}
                  >
                    <ListFilter className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setSort((current) => current === "newest" ? "oldest" : "newest")}
                    aria-label={sort === "newest" ? "Sort oldest first" : "Sort newest first"}
                    title={sort === "newest" ? "Newest first" : "Oldest first"}
                    className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900"
                  >
                    <ArrowDownUp className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="relative">
                    <Filter className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                    <select aria-label="Filter by email type" value={category} onChange={(e) => setCategory(e.target.value)} className="h-8 w-full appearance-none rounded-lg border border-gray-200 bg-white pl-8 pr-2 text-xs font-medium text-gray-600 outline-none hover:border-gray-300 focus:border-teal-500 focus:ring-2 focus:ring-teal-100">
                      {CATEGORY_OPTIONS.map((value) => <option key={value} value={value}>{value === "all" ? "All types" : CATEGORY_LABELS[value]}</option>)}
                    </select>
                  </label>
                  <select aria-label="Filter by date" value={dateWindow} onChange={(e) => setDateWindow(e.target.value as DateWindow)} className="h-8 w-full appearance-none rounded-lg border border-gray-200 bg-white px-2 text-xs font-medium text-gray-600 outline-none hover:border-gray-300 focus:border-teal-500 focus:ring-2 focus:ring-teal-100">
                    {(Object.keys(DATE_LABELS) as DateWindow[]).map((value) => <option key={value} value={value}>{DATE_LABELS[value]}</option>)}
                  </select>
                </div>
                <div className="mt-2 flex items-start justify-between gap-3 text-[11px] leading-4 text-gray-400">
                  <span className="min-w-0">{resultLabel}</span>
                  <span className="shrink-0">{sort === "newest" ? "Newest first" : "Oldest first"}</span>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {threads == null ? (
                  <p className="px-4 py-10 text-center text-sm text-gray-400">Loading inbox…</p>
                ) : threads.length === 0 ? (
                  <div className="px-6 py-16 text-center">
                    <p className="text-sm font-medium text-gray-700">{unreadOnly ? "You’re caught up" : "Nothing here"}</p>
                    <p className="mt-1 text-xs leading-5 text-gray-400">
                      {unreadOnly
                        ? `No unread${category !== "all" ? ` ${CATEGORY_LABELS[category]}` : ""} conversations${dateWindow !== "all" ? ` from ${DATE_LABELS[dateWindow].toLowerCase()}` : ""}.`
                        : "This view is caught up."}
                    </p>
                    {unreadOnly && (
                      <button onClick={() => setUnreadOnly(false)} className="mt-3 text-xs font-medium text-teal-700 hover:text-teal-800 hover:underline">
                        Show all{category !== "all" ? ` ${CATEGORY_LABELS[category]}` : ""}
                      </button>
                    )}
                  </div>
                ) : threads.map((thread) => (
                  <button key={thread.id} onClick={() => selectThread(thread.id)} className={`relative block w-full border-b border-gray-100 px-4 py-3 text-left transition-colors duration-150 ${selected === thread.id ? "bg-teal-50/70" : "hover:bg-gray-50"}`}>
                    {selected === thread.id && <span className="absolute inset-y-0 left-0 w-0.5 bg-teal-600" />}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        {thread.unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-teal-600" aria-label="Unread" />}
                        <p className={`truncate text-sm ${thread.unread ? "font-semibold text-gray-900" : "font-medium text-gray-700"}`}>{sender(thread)}</p>
                      </div>
                      <span className="shrink-0 text-[11px] text-gray-400">{relative(thread.last_message_at)}</span>
                    </div>
                    <p className="mt-0.5 truncate text-[13px] font-medium text-gray-700">{thread.subject}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-[18px] text-gray-500">{thread.agent_summary || thread.snippet}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${thread.category === "marketing" || thread.category === "automated" ? "bg-gray-100 text-gray-500" : thread.priority === "urgent" ? "bg-rose-100 text-rose-700" : thread.priority === "high" ? "bg-amber-100 text-amber-700" : "bg-teal-50 text-teal-700"}`}>
                        {CATEGORY_LABELS[thread.category] || thread.category}
                      </span>
                      {thread.gmail_draft_id && <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">DRAFT</span>}
                      {thread.state === "escalated" && <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">ESCALATED</span>}
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <section className={`${selected ? "flex" : "hidden lg:flex"} min-h-0 min-w-0 flex-col bg-white`}>
              {!selected ? (
                <div className="flex flex-1 items-center justify-center px-8 text-center">
                  <div><p className="text-sm font-medium text-gray-700">Select a conversation</p><p className="mt-1 text-sm text-gray-400">Read the thread, review the agent&apos;s reasoning, and take the next action.</p></div>
                </div>
              ) : loadingDetail && !detail ? (
                <div className="flex flex-1 items-center justify-center text-sm text-gray-400">Loading conversation…</div>
              ) : detail && (
                <div className="flex min-h-0 flex-1 flex-col">
                  <header className="shrink-0 border-b border-gray-200 px-5 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 items-start gap-3">
                        <button onClick={() => { leaveSelectedThread(null); setSelected(null); }} aria-label="Back to inbox" className="mt-0.5 rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 lg:hidden">
                          <ArrowLeft className="h-4 w-4" />
                        </button>
                        <div className="min-w-0">
                        <h2 className="truncate text-lg font-semibold text-gray-900">{detail.thread.subject}</h2>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                          <span>{sender(detail.thread)}</span><span>•</span><span>{detail.messages.length} message{detail.messages.length === 1 ? "" : "s"}</span>
                          {detail.thread.matched_profile_name && (
                            <>
                              <span>•</span>
                              {detail.thread.matched_profile_type === "family" && detail.thread.matched_profile_id ? (
                                <Link href={`/admin/care-seekers/${detail.thread.matched_profile_id}`} className="font-medium text-teal-700 hover:underline">Open care-seeker record</Link>
                              ) : detail.thread.matched_provider_id ? (
                                <Link href={`/admin/directory/${detail.thread.matched_provider_id}`} className="font-medium text-teal-700 hover:underline">Open provider record</Link>
                              ) : <span>{detail.thread.matched_profile_name}</span>}
                            </>
                          )}
                        </div>
                        </div>
                      </div>
                      <button onClick={() => void act("mark_handled")} disabled={!!acting} className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">Mark handled</button>
                    </div>
                  </header>

                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-gray-50/30">
                  {detail.thread.agent_summary && (
                    <div className="m-5 mb-0 overflow-hidden rounded-xl border border-teal-100 bg-gradient-to-br from-teal-50/70 via-white to-white">
                      <div className="p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-teal-700">{isVoicemail ? "Callback brief" : "Olera support copilot"}</p>
                            <p className="mt-1.5 text-[15px] font-semibold leading-6 text-gray-950">{detail.thread.agent_summary}</p>
                          </div>
                          <span className="rounded-full bg-white/90 px-2 py-1 text-[10px] font-medium text-gray-500 ring-1 ring-gray-100">{confidence(detail.thread.agent_confidence)}</span>
                        </div>

                        <div className="mt-3 grid gap-3 border-t border-teal-100/70 pt-3 sm:grid-cols-[minmax(0,1fr)_190px]">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{isVoicemail ? "What we heard" : "Why this matters"}</p>
                            <p className="mt-1 text-xs leading-5 text-gray-600">{detail.thread.agent_reason}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Next move</p>
                            <p className="mt-1 text-sm font-semibold text-gray-900">{ACTION_LABELS[detail.thread.suggested_action || ""] || "Review manually"}</p>
                            {isVoicemail && phone && <p className="mt-0.5 text-xs text-gray-500">{phone}</p>}
                          </div>
                        </div>

                        {isVoicemail && latestInbound?.attachments.some(isAudioAttachment) && (
                          <div className="mt-3 space-y-2 border-t border-teal-100/70 pt-3">
                            {latestInbound.attachments.filter(isAudioAttachment).map((attachment, index) => attachment.attachmentId && (
                              <div key={`${attachment.attachmentId}-${index}`} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                <audio controls preload="metadata" className="h-9 min-w-0 flex-1" src={attachmentUrl(detail.thread.id, latestInbound.id, attachment.attachmentId)}>
                                  Your browser does not support audio playback.
                                </audio>
                                <a href={attachmentUrl(detail.thread.id, latestInbound.id, attachment.attachmentId, true)} className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-900">
                                  <Download className="h-3.5 w-3.5" /> Download
                                </a>
                              </div>
                            ))}
                          </div>
                        )}

                        {detail.thread.agent_risk_flags?.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{detail.thread.agent_risk_flags.map((flag) => <span key={flag} className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${flag === "transcript_unavailable" || flag === "voice_message" ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"}`}>{flag.replaceAll("_", " ")}</span>)}</div>}

                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          {isVoicemail && phone && <a href={`tel:${phone.replace(/[^+\d]/g, "")}`} className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-teal-800"><Phone className="h-3.5 w-3.5" />Call back</a>}
                          {detail.thread.suggested_action === "unsubscribe" && latestInbound?.list_unsubscribe_post && <button onClick={() => void act("unsubscribe")} disabled={!!acting} className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50">Unsubscribe and archive</button>}
                          {detail.thread.suggested_action === "provider_removal" && <button onClick={() => void act("do_not_contact")} disabled={!!acting} className="rounded-lg bg-rose-700 px-3 py-2 text-xs font-medium text-white hover:bg-rose-800 disabled:opacity-50">Add to Do Not Contact</button>}
                          <button onClick={() => void act("escalate")} disabled={!!acting} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Escalate</button>
                          <button onClick={() => void act("mark_noise")} disabled={!!acting} className="rounded-lg border border-transparent px-2 py-2 text-xs font-medium text-gray-500 hover:bg-white hover:text-gray-800 disabled:opacity-50">Mark noise</button>
                          <div className="ml-auto flex items-center gap-1 text-[11px] text-gray-400">
                            <span className="mr-1">Useful?</span>
                            <button onClick={() => void act("feedback", { feedback: "correct" })} disabled={!!acting} title="Good recommendation" className="rounded-md p-1.5 hover:bg-white hover:text-emerald-700"><Check className="h-3.5 w-3.5" /></button>
                            <button onClick={() => void act("feedback", { feedback: "incorrect" })} disabled={!!acting} className="rounded-md px-1.5 py-1 hover:bg-white hover:text-rose-700">Not quite</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="mx-auto w-full max-w-4xl space-y-4 px-5 py-5">
                    {detail.messages.map((message) => (
                      <article key={message.id} className={`rounded-xl border p-4 ${message.direction === "out" ? "ml-6 border-teal-100 bg-teal-50/40" : "mr-6 border-gray-200 bg-white"}`}>
                        <div className="flex items-start justify-between gap-4">
                          <div><p className="text-sm font-semibold text-gray-800">{message.direction === "out" ? "Olera Support" : message.from_name || message.from_email || "Unknown sender"}</p><p className="mt-0.5 text-[11px] text-gray-400">{message.direction === "out" ? `To ${message.to_emails.join(", ")}` : message.from_email}</p></div>
                          <time className="shrink-0 text-[11px] text-gray-400">{formatDate(message.internal_date)}</time>
                        </div>
                        <div className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-gray-700">{message.body_text || message.snippet || "(No text body)"}</div>
                        {message.has_attachments && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {message.attachments.map((attachment, i) => attachment.attachmentId ? (
                              <a
                                key={`${attachment.filename}-${i}`}
                                href={attachmentUrl(detail.thread.id, message.id, attachment.attachmentId)}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex max-w-full items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-[11px] text-gray-600 transition-colors hover:border-gray-300 hover:bg-white hover:text-gray-900"
                              >
                                <Paperclip className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate font-medium">{attachment.filename}</span>
                                {attachment.size > 0 && <span className="shrink-0 text-gray-400">{formatBytes(attachment.size)}</span>}
                              </a>
                            ) : (
                              <span key={`${attachment.filename}-${i}`} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-[11px] text-gray-500">
                                <Paperclip className="h-3.5 w-3.5" /> {attachment.filename}
                              </span>
                            ))}
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                  </div>

                  <div id="support-reply" className="shrink-0 border-t border-gray-200 bg-white p-4">
                    <div className="mx-auto w-full max-w-4xl">
                    <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={4} maxLength={20_000} placeholder="Write a reply, or edit the copilot draft…" className="w-full resize-y rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-sm leading-6 outline-none placeholder:text-gray-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-100" />
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2 text-[11px] text-gray-400">
                        {detail.thread.gmail_draft_id ? <span>Saved in Gmail</span> : detail.thread.suggested_draft ? <span>Agent draft -- review before sending</span> : <span>Nothing sends without your click</span>}
                        <span>•</span><span>{reply.length.toLocaleString()} characters</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => void act("archive")} disabled={!!acting} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">Archive</button>
                        <button onClick={() => void act("save_draft", { body: reply })} disabled={!!acting || !reply.trim()} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Save draft</button>
                        <button onClick={() => void act("send", { body: reply })} disabled={!!acting || !reply.trim()} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">{acting === "send" ? "Sending…" : "Send reply"}</button>
                      </div>
                    </div>
                    </div>
                  </div>
                </div>
              )}
            </section>

            {detail && (
              <aside className="hidden min-h-0 flex-col border-l border-gray-200 bg-white 2xl:flex">
                <header className="shrink-0 border-b border-gray-200 px-5 py-4">
                  <h2 className="text-base font-semibold text-gray-900">Conversation</h2>
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">From</p>
                  <h3 className="mt-1.5 text-lg font-semibold text-gray-950">{sender(detail.thread)}</h3>
                  <p className="mt-1 break-words text-sm text-gray-500">{latestInbound?.from_email || detail.thread.participants[0] || "Unknown sender"}</p>

                  {detail.thread.matched_profile_name && (
                    <div className="mt-6 rounded-xl border border-gray-200 p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">Matched record</p>
                      <p className="mt-1.5 text-sm font-semibold text-gray-900">{detail.thread.matched_profile_name}</p>
                      <p className="mt-0.5 text-xs capitalize text-gray-500">{detail.thread.matched_profile_type || "Olera contact"}</p>
                      {detail.thread.matched_profile_type === "family" && detail.thread.matched_profile_id ? (
                        <Link href={`/admin/care-seekers/${detail.thread.matched_profile_id}`} className="mt-3 inline-flex text-xs font-semibold text-teal-700 hover:underline">Open care-seeker record</Link>
                      ) : detail.thread.matched_provider_id ? (
                        <Link href={`/admin/directory/${detail.thread.matched_provider_id}`} className="mt-3 inline-flex text-xs font-semibold text-teal-700 hover:underline">Open provider record</Link>
                      ) : null}
                    </div>
                  )}

                  <div className="mt-6 border-y border-gray-100 py-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">Next move</p>
                    <p className="mt-1.5 text-sm font-semibold text-gray-900">{ACTION_LABELS[detail.thread.suggested_action || ""] || "Review manually"}</p>
                    {detail.thread.suggested_owner && <p className="mt-1 text-xs text-gray-500">Owner: {detail.thread.suggested_owner}</p>}
                  </div>

                  <dl className="divide-y divide-gray-100 text-sm">
                    <div className="flex items-center justify-between gap-3 py-3">
                      <dt className="text-gray-500">Category</dt>
                      <dd className="font-medium text-gray-800">{CATEGORY_LABELS[detail.thread.category] || detail.thread.category}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3 py-3">
                      <dt className="text-gray-500">Priority</dt>
                      <dd className="font-medium capitalize text-gray-800">{detail.thread.priority}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3 py-3">
                      <dt className="text-gray-500">Messages</dt>
                      <dd className="font-medium text-gray-800">{detail.messages.length}</dd>
                    </div>
                  </dl>

                  {detail.thread.agent_risk_flags?.length > 0 && (
                    <div className="mt-5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">Flags</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {detail.thread.agent_risk_flags.map((flag) => <span key={flag} className="rounded bg-amber-50 px-1.5 py-1 text-[10px] font-medium text-amber-700">{flag.replaceAll("_", " ")}</span>)}
                      </div>
                    </div>
                  )}
                </div>
              </aside>
            )}
        </div>
      )}
    </AdminWorkspace>
  );
}
