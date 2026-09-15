"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSearchParams, useRouter, redirect } from "next/navigation";
import { MEDJOBS_MARKETPLACE_V2_HIDDEN } from "@/lib/medjobs/flags";
import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Connection, ConnectionStatus, Profile } from "@/lib/types";
import { SAMPLE_CANDIDATES } from "@/lib/medjobs/demo-candidate";
import { getPostings, setStoragePrefix, updatePosting } from "@/lib/medjobs/job-postings";
import Modal from "@/components/ui/Modal";

/* ─── Types ─────────────────────────────────────────────── */

interface ThreadMessage {
  from_profile_id: string;
  text: string;
  created_at: string;
  type?: string; // "system" | "application" | undefined (regular message)
  application?: {
    coverLetter?: string;
    documents?: string[]; // file names
    profileName?: string;
    profileImage?: string | null;
    profileMajor?: string;
    profileSchool?: string;
  };
}

interface JobPostingMeta {
  title?: string;
  hoursPerWeek?: string;
  payMin?: string;
  payMax?: string;
  commitment?: string;
  hiringCount?: number;
  aboutCompany?: string;
  roleDescription?: string;
  tags?: string[];
  certifications?: string[];
  skills?: string[];
  heroImage?: string;
}

interface ConversationItem extends Connection {
  otherProfile: Profile | null;
  jobPosting: JobPostingMeta | null;
  thread: ThreadMessage[];
  unread: boolean;
  viewedByOther?: boolean; // true when the other party has opened this conversation
}

type Filter = "all" | "unread" | "invites" | "applications";

/* ─── Helpers ───────────────────────────────────────────── */

function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  return Math.abs(h);
}

const CERTS = [
  "CNA (Certified Nursing Assistant)", "CPR certified", "First aid training",
  "HHA (Home Health Aide)", "Dementia care training", "BLS (Basic Life Support)",
];
const SKILLS_LIST = [
  "Vital signs monitoring", "Nutrition and diet awareness", "Mobility and transfer assistance",
  "Fall risk management", "ADL support", "Dementia and memory care", "Care documentation", "HIPAA awareness",
];

function deriveJobDetails(profileId: string, profileName: string, profileImage: string | null, profileMeta: Record<string, unknown>): JobPostingMeta {
  const hash = simpleHash(profileId || profileName);
  const hoursOptions = ["5\u201310", "10\u201315", "10\u201320", "15\u201320", "15\u201325", "20\u201330"];
  const hours = hoursOptions[hash % hoursOptions.length];
  const commitment = hash % 3 === 0 ? "Multiple terms" : "One term";
  const payBase = 14 + (hash % 8);
  const payMax = payBase + 6 + (hash % 4);
  const positions = 1 + (hash % 4);

  const certCount = 2 + (hash % 3);
  const certs: string[] = [];
  for (let i = 0; i < certCount && i < CERTS.length; i++) certs.push(CERTS[(hash + i * 3) % CERTS.length]);

  const skillCount = 2 + (hash % 3);
  const skills: string[] = [];
  for (let i = 0; i < skillCount && i < SKILLS_LIST.length; i++) skills.push(SKILLS_LIST[(hash + i * 5) % SKILLS_LIST.length]);

  const cat = ((profileMeta.primary_category || profileMeta.category || "") as string).toLowerCase();
  let title = `Senior Caregiver & Companion`;
  if (cat.includes("memory") || cat.includes("dementia")) title = "Memory Care & Activities Assistant";
  else if (cat.includes("home health")) title = "Home Health Aide";
  else if (cat.includes("assisted")) title = "Resident Care Associate";
  else if (cat.includes("nursing")) title = "Nursing Support Assistant";

  const desc = (profileMeta.about || profileMeta.description || "") as string;
  const aboutCompany = desc || `${profileName} is a senior care provider serving the area.`;
  const roleDesc = `${profileName} is looking for a student caregiver to join our care team. You\u2019ll help with companion care, daily activities support, and wellness check-ins, working around ${hours} hours per week at $${payBase}\u2013$${payMax}/hr. This is a ${commitment.toLowerCase()} position, perfect if you want to get hands-on care experience alongside your coursework.`;

  return {
    title: `${title} - ${profileName}`,
    heroImage: profileImage || undefined,
    hoursPerWeek: hours,
    payMin: String(payBase),
    payMax: String(payMax),
    commitment,
    hiringCount: positions,
    aboutCompany,
    roleDescription: roleDesc,
    certifications: [...new Set(certs)],
    skills: [...new Set(skills)],
  };
}

const HOURS_LABELS: Record<string, string> = {
  "0_10": "0\u201310 hrs/wk",
  "10_20": "10\u201320 hrs/wk",
  "20_30": "20\u201330 hrs/wk",
  "30_plus": "30+ hrs/wk",
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const GRADIENTS = [
  "from-primary-400 to-teal-500",
  "from-teal-400 to-emerald-500",
  "from-primary-500 to-cyan-500",
  "from-emerald-400 to-teal-500",
];

function gradient(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
}

/* ─── Hiring Timeline ───────────────────────────────────── */

interface TimelineStep {
  key: string;
  label: string;
  subtitle?: string;
  status: "done" | "current" | "upcoming";
}

function getHiringSteps(conv: ConversationItem, role: "provider" | "student" | null): TimelineStep[] {
  const meta = (conv.metadata || {}) as Record<string, unknown>;
  const isInvite = conv.type === "invitation";
  const hasApplied = !!meta.applied_at;
  const hasInterview = !!meta.interview_at;
  const isHired = conv.status === "accepted" || !!meta.hired_at;

  // Determine current stage index
  let stage = 0; // invite/application sent
  if (hasApplied) stage = 1;
  if (hasInterview) stage = 2;
  if (isHired) stage = 3;

  const stepStatus = (i: number): "done" | "current" | "upcoming" =>
    i < stage ? "done" : i === stage ? "current" : "upcoming";

  const createdDate = new Date(conv.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  if (isInvite) {
    return [
      { key: "invited", label: role === "student" ? "Invite received" : "Invite sent", subtitle: createdDate, status: stepStatus(0) },
      {
        key: "applied",
        label: "Application",
        subtitle: hasApplied
          ? new Date(meta.applied_at as string).toLocaleDateString("en-US", { month: "short", day: "numeric" })
          : (role === "provider" ? "Awaiting student response" : "Apply to this posting"),
        status: stepStatus(1),
      },
      {
        key: "interview",
        label: "Interview",
        subtitle: hasInterview
          ? new Date(meta.interview_at as string).toLocaleDateString("en-US", { month: "short", day: "numeric" })
          : undefined,
        status: stepStatus(2),
      },
      {
        key: "hired",
        label: "Hired",
        subtitle: isHired
          ? new Date((meta.hired_at as string) || conv.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
          : undefined,
        status: stepStatus(3),
      },
    ];
  }

  // Application flow
  return [
    { key: "applied", label: "Application submitted", subtitle: createdDate, status: stepStatus(0) },
    {
      key: "review",
      label: "Under review",
      subtitle: !hasApplied && !hasInterview && !isHired
        ? (role === "provider" ? "Review this application" : "Awaiting provider review")
        : undefined,
      status: stepStatus(1),
    },
    {
      key: "interview",
      label: "Interview",
      subtitle: hasInterview
        ? new Date(meta.interview_at as string).toLocaleDateString("en-US", { month: "short", day: "numeric" })
        : undefined,
      status: stepStatus(2),
    },
    {
      key: "hired",
      label: "Hired",
      subtitle: isHired
        ? new Date((meta.hired_at as string) || conv.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
        : undefined,
      status: stepStatus(3),
    },
  ];
}

/* ─── Main Component ────────────────────────────────────── */

function MedJobsInboxContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { activeProfile, profiles, user } = useAuth();

  const urlConnectionId = searchParams.get("id");

  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(urlConnectionId);
  const [filter, setFilter] = useState<Filter>("all");
  const [composing, setComposing] = useState("");
  const [sending, setSending] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [jobFilter, setJobFilter] = useState<string>("all"); // "all" or a posting_id (provider only)
  const [searchQuery, setSearchQuery] = useState("");
  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [applyCoverLetter, setApplyCoverLetter] = useState("");
  const [applyFiles, setApplyFiles] = useState<File[]>([]);
  const [applySubmitting, setApplySubmitting] = useState(false);
  const [jobDetailOpen, setJobDetailOpen] = useState(false);
  const [jobDetailData, setJobDetailData] = useState<JobPostingMeta | null>(null);
  const [jobDetailLoading, setJobDetailLoading] = useState(false);
  const applyFileRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Determine user role and the relevant profile ID for queries.
  // The account may have both provider + student profiles. We pick the right one
  // based on profile type: student profiles see the student inbox, everything else
  // sees the provider inbox.
  const { userRole, inboxProfileId } = useMemo(() => {
    if (!activeProfile) return { userRole: null, inboxProfileId: null };
    // If the active profile IS a student, use it directly
    if (activeProfile.type === "student") {
      return { userRole: "student" as const, inboxProfileId: activeProfile.id };
    }
    // Active profile is provider — but check if user also has a student profile.
    // If user has NO provider profile, treat as student.
    const studentProfile = profiles?.find((p) => p.type === "student");
    const hasProvider = profiles?.some((p) => p.type === "organization" || p.type === "caregiver");
    if (!hasProvider && studentProfile) {
      return { userRole: "student" as const, inboxProfileId: studentProfile.id };
    }
    return { userRole: "provider" as const, inboxProfileId: activeProfile.id };
  }, [activeProfile, profiles]);

  // Backfill demo conversations from job postings (one-time on mount).
  // If a sample candidate was invited but the invite was saved by an older code version
  // (before the editable-message feature), the stale entry is replaced so the
  // provider can re-invite with a custom message.
  useEffect(() => {
    if (!activeProfile) return;
    const pid = activeProfile.id;
    setStoragePrefix(pid);
    try {
      const demoKey = `medjobs_demo_conversations_${pid}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let existing: any[] = JSON.parse(localStorage.getItem(demoKey) || "[]");
      const postings = getPostings();
      const sampleMap = new Map(SAMPLE_CANDIDATES.map((s) => [s.id, s]));
      let changed = false;

      for (const posting of postings) {
        for (const invitedId of posting.invited) {
          const sample = sampleMap.get(invitedId);
          if (!sample) continue;
          const dedupId = `demo-${posting.id}-${invitedId}`;
          const idx = existing.findIndex((c: { id: string }) => c.id === dedupId);

          if (idx !== -1) {
            // Already exists — check if it was a stale backfill entry (canned text, single message).
            // If the provider already sent follow-up messages, keep it.
            const thread = existing[idx]?.metadata?.thread || [];
            const isStaleBackfill =
              thread.length === 1 &&
              thread[0]?.type === "system" &&
              thread[0]?.text?.startsWith("You're invited to apply for");
            if (isStaleBackfill) {
              // Remove stale entry so the provider can re-invite with a custom message
              existing.splice(idx, 1);
              // Also remove the candidate from the posting's invited list so re-invite works
              const newInvited = posting.invited.filter((id: string) => id !== invitedId);
              if (newInvited.length !== posting.invited.length) {
                updatePosting(posting.id, { invited: newInvited });
              }
              changed = true;
            }
            continue;
          }

          // No entry yet — create a backfill entry
          existing.push({
            id: dedupId,
            type: "invitation",
            status: "pending",
            from_profile_id: pid,
            to_profile_id: invitedId,
            message: `You're invited to apply for ${posting.title}`,
            metadata: {
              job_posting: {
                title: posting.title,
                hoursPerWeek: posting.hoursPerWeek,
                payMin: posting.payMin,
                payMax: posting.payMax,
              },
              posting_id: posting.id,
              thread: [
                {
                  from_profile_id: pid,
                  text: `You're invited to apply for ${posting.title}`,
                  created_at: posting.createdAt,
                  type: "system",
                },
              ],
            },
            created_at: posting.createdAt,
            updated_at: posting.createdAt,
            candidate_name: sample.display_name,
            candidate_image: sample.image_url || null,
          });
          changed = true;
        }
      }
      if (changed) localStorage.setItem(demoKey, JSON.stringify(existing));
    } catch {}
  }, [activeProfile]);

  // Seed demo invites for students (so the "Invites" tab has content to showcase)
  useEffect(() => {
    if (userRole !== "student" || !inboxProfileId) return;
    const demoKey = `medjobs_student_demo_invites_${inboxProfileId}`;
    const existing = localStorage.getItem(demoKey);
    if (existing) {
      // Re-seed if old data is missing rich fields (e.g. roleDescription)
      try {
        const parsed = JSON.parse(existing);
        const first = parsed[0];
        if (first?.metadata?.job_posting?.roleDescription) return; // Already has rich data
      } catch { /* re-seed */ }
      localStorage.removeItem(demoKey);
    }

    const now = new Date();
    const demoInvites = [
      {
        id: `demo-invite-1`,
        type: "invitation",
        status: "pending",
        from_profile_id: "demo-provider-sunridge",
        to_profile_id: inboxProfileId,
        message: "Hi! We loved your profile and think you'd be a great fit for our Recreational Activities Manager role. We work with seniors in assisted living and need someone with your energy and background. Would love to chat!",
        metadata: {
          source: "medjobs",
          posting_id: "demo-posting-1",
          job_posting: {
            title: "Recreational Activities Manager",
            heroImage: "/images/assisted-living.jpg",
            hoursPerWeek: "20_30",
            payMin: "18",
            payMax: "24",
            commitment: "One term",
            hiringCount: 2,
            aboutCompany: "Sunridge Senior Living is a premier assisted living community dedicated to enriching the lives of our residents through compassionate care and engaging activities.",
            roleDescription: "Sunridge Senior Living is looking for a student to help plan and lead recreational activities for seniors. You\u2019ll organize group events, art sessions, and light fitness classes, working 20\u201330 hours per week at $18\u2013$24/hr. This is a one-term position, perfect if you want hands-on experience in senior wellness.",
            tags: ["Group activities", "Senior wellness", "Event planning"],
            certifications: ["CPR certified", "First aid training"],
            skills: ["Activity planning", "Communication", "Patience with elderly", "Team coordination"],
          },
          thread: [
            {
              from_profile_id: "demo-provider-sunridge",
              text: "Hi! We loved your profile and think you'd be a great fit for our Recreational Activities Manager role. We work with seniors in assisted living and need someone with your energy and background. Would love to chat!",
              created_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
            },
          ],
        },
        created_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
        provider_name: "Sunridge Senior Living",
        provider_image: "/images/assisted-living.jpg",
      },
      {
        id: `demo-invite-2`,
        type: "invitation",
        status: "pending",
        from_profile_id: "demo-provider-harmony",
        to_profile_id: inboxProfileId,
        message: "We're looking for a Companion Care Associate to join our home care team. Your certifications caught our eye — let us know if you're interested!",
        metadata: {
          source: "medjobs",
          posting_id: "demo-posting-2",
          job_posting: {
            title: "Companion Care Associate",
            heroImage: "/images/home-care.jpg",
            hoursPerWeek: "10_20",
            payMin: "16",
            payMax: "20",
            commitment: "One term",
            hiringCount: 3,
            aboutCompany: "Harmony Home Care provides personalized in-home care services, helping clients maintain independence and quality of life in the comfort of their own homes.",
            roleDescription: "Harmony Home Care is looking for a student caregiver to join our companion care team. You\u2019ll help with evening and overnight presence, light housekeeping, and memory care support, working around 10\u201320 hours per week at $16\u2013$20/hr. Perfect if you want to get hands-on care experience alongside your coursework.",
            tags: ["Evening and overnight presence", "Memory care support", "Light housekeeping"],
            certifications: ["CNA (Certified Nursing Assistant)", "Dementia care training", "CPR certified", "HHA (Home Health Aide)"],
            skills: ["Mobility and transfer assistance", "HIPAA awareness", "ADL support", "Nutrition and diet awareness"],
          },
          thread: [
            {
              from_profile_id: "demo-provider-harmony",
              text: "We're looking for a Companion Care Associate to join our home care team. Your certifications caught our eye — let us know if you're interested!",
              created_at: new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString(),
            },
          ],
        },
        created_at: new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString(),
        provider_name: "Harmony Home Care",
        provider_image: "/images/home-care.jpg",
      },
    ];

    localStorage.setItem(demoKey, JSON.stringify(demoInvites));
  }, [userRole, inboxProfileId]);

  // Fetch MedJobs connections (invitations + applications)
  const fetchConversations = useCallback(async () => {
    if (!inboxProfileId || !isSupabaseConfigured()) {
      setLoading(false);
      return;
    }

    try {
      const supabase = createClient();
      const pid = inboxProfileId;

      // Fetch invitations and applications from connections + interviews
      const [invitesOut, invitesIn, appsOut, appsIn, interviewsResult] = await Promise.all([
        supabase
          .from("connections")
          .select("id, type, status, from_profile_id, to_profile_id, message, metadata, created_at, updated_at")
          .eq("from_profile_id", pid)
          .eq("type", "invitation")
          .in("status", ["pending", "accepted"])
          .order("updated_at", { ascending: false }),
        supabase
          .from("connections")
          .select("id, type, status, from_profile_id, to_profile_id, message, metadata, created_at, updated_at")
          .eq("to_profile_id", pid)
          .eq("type", "invitation")
          .in("status", ["pending", "accepted"])
          .order("updated_at", { ascending: false }),
        supabase
          .from("connections")
          .select("id, type, status, from_profile_id, to_profile_id, message, metadata, created_at, updated_at")
          .eq("from_profile_id", pid)
          .eq("type", "application")
          .in("status", ["pending", "accepted"])
          .order("updated_at", { ascending: false }),
        supabase
          .from("connections")
          .select("id, type, status, from_profile_id, to_profile_id, message, metadata, created_at, updated_at")
          .eq("to_profile_id", pid)
          .eq("type", "application")
          .in("status", ["pending", "accepted"])
          .order("updated_at", { ascending: false }),
        // Also fetch interviews (job applications go here)
        supabase
          .from("interviews")
          .select("id, status, provider_profile_id, student_profile_id, notes, proposed_by, created_at, type")
          .or(`provider_profile_id.eq.${pid},student_profile_id.eq.${pid}`)
          .in("status", ["proposed", "confirmed"])
          .order("created_at", { ascending: false }),
      ]);

      console.log("[inbox] pid:", pid, "userRole:", userRole);
      console.log("[inbox] invitesOut:", invitesOut.data?.length, "invitesIn:", invitesIn.data?.length);
      console.log("[inbox] appsOut:", appsOut.data?.length, "appsIn:", appsIn.data?.length);
      console.log("[inbox] interviews:", interviewsResult.data?.length, interviewsResult.error);

      // Deduplicate connections
      const deduped = new Map<string, Connection>();
      for (const conn of [
        ...(invitesOut.data || []),
        ...(invitesIn.data || []),
        ...(appsOut.data || []),
        ...(appsIn.data || []),
      ] as Connection[]) {
        const meta = conn.metadata as Record<string, unknown> | undefined;
        if (meta?.hidden || meta?.archived) continue;
        deduped.set(conn.id, conn);
      }

      const conns = Array.from(deduped.values());

      // Collect profile IDs from connections + interviews
      const otherIds = new Set<string>();
      for (const c of conns) {
        otherIds.add(c.from_profile_id === pid ? c.to_profile_id : c.from_profile_id);
      }
      // Interview profiles are already embedded, but collect IDs for the profileMap
      for (const iv of (interviewsResult.data || [])) {
        const otherId = iv.provider_profile_id === pid ? iv.student_profile_id : iv.provider_profile_id;
        otherIds.add(otherId);
      }

      let profileMap = new Map<string, Profile>();
      if (otherIds.size > 0) {
        const { data: profileData } = await supabase
          .from("business_profiles")
          .select("id, display_name, image_url, city, state, type, slug, metadata")
          .in("id", Array.from(otherIds));
        profileMap = new Map((profileData as Profile[] || []).map((p) => [p.id, p]));
      }

      // Read state from localStorage
      let readIds = new Set<string>();
      try {
        const stored = localStorage.getItem(`medjobs_inbox_read_${pid}`);
        if (stored) readIds = new Set(JSON.parse(stored));
      } catch {}

      // Enrich DB connections
      const items: ConversationItem[] = conns.map((c) => {
        const meta = (c.metadata || {}) as Record<string, unknown>;
        const thread = (meta.thread as ThreadMessage[]) || [];
        const otherId = c.from_profile_id === pid ? c.to_profile_id : c.from_profile_id;
        const jobPosting = (meta.job_posting as JobPostingMeta) || null;

        const readBy = (meta.read_by as Record<string, string>) || {};
        const isReadDb = !!readBy[pid];
        const isReadLocal = readIds.has(c.id);
        const unread = !isReadDb && !isReadLocal;

        // Check if the other party has viewed this conversation
        const viewedByOther = Object.keys(readBy).some((k) => k !== pid);

        return {
          ...c,
          otherProfile: profileMap.get(otherId) || null,
          jobPosting,
          thread,
          unread,
          viewedByOther,
        };
      });

      // Merge demo conversations from localStorage (for sample candidates)
      try {
        const demoKey = `medjobs_demo_conversations_${pid}`;
        const demoRaw = localStorage.getItem(demoKey);
        if (demoRaw) {
          const demoConvs = JSON.parse(demoRaw) as Array<{
            id: string;
            type: string;
            status: string;
            from_profile_id: string;
            to_profile_id: string;
            message: string;
            metadata: Record<string, unknown>;
            created_at: string;
            updated_at: string;
            candidate_name: string;
            candidate_image: string | null;
          }>;
          for (const dc of demoConvs) {
            if (items.some((i) => i.id === dc.id)) continue;
            const meta = dc.metadata || {};
            const thread = (meta.thread as ThreadMessage[]) || [];
            const jobPosting = (meta.job_posting as JobPostingMeta) || null;
            items.push({
              id: dc.id,
              type: dc.type as Connection["type"],
              status: dc.status as Connection["status"],
              from_profile_id: dc.from_profile_id,
              to_profile_id: dc.to_profile_id,
              message: dc.message,
              metadata: dc.metadata,
              created_at: dc.created_at,
              updated_at: dc.updated_at,
              otherProfile: {
                id: dc.to_profile_id,
                display_name: dc.candidate_name,
                image_url: dc.candidate_image,
                slug: dc.to_profile_id,
              } as Profile,
              jobPosting,
              thread,
              unread: !readIds.has(dc.id),
            } as ConversationItem);
          }
        }
      } catch {}

      // Merge student demo invites from localStorage
      if (userRole === "student") {
        try {
          const demoInvKey = `medjobs_student_demo_invites_${pid}`;
          const demoInvRaw = localStorage.getItem(demoInvKey);
          if (demoInvRaw) {
            const demoInvites = JSON.parse(demoInvRaw) as Array<{
              id: string;
              type: string;
              status: string;
              from_profile_id: string;
              to_profile_id: string;
              message: string;
              metadata: Record<string, unknown>;
              created_at: string;
              updated_at: string;
              provider_name: string;
              provider_image: string | null;
            }>;
            for (const di of demoInvites) {
              if (items.some((i) => i.id === di.id)) continue;
              const meta = di.metadata || {};
              const thread = (meta.thread as ThreadMessage[]) || [];
              const jobPosting = (meta.job_posting as JobPostingMeta) || null;
              // For demo invites that have been applied to, simulate "viewed" by provider
              const hasStudentReply = thread.some((m) => m.from_profile_id === pid);
              items.push({
                id: di.id,
                type: di.type as Connection["type"],
                status: di.status as Connection["status"],
                from_profile_id: di.from_profile_id,
                to_profile_id: di.to_profile_id,
                message: di.message,
                metadata: di.metadata,
                created_at: di.created_at,
                updated_at: di.updated_at,
                otherProfile: {
                  id: di.from_profile_id,
                  display_name: di.provider_name,
                  image_url: di.provider_image,
                  slug: di.from_profile_id,
                } as unknown as Profile,
                jobPosting,
                thread,
                unread: !readIds.has(di.id),
                viewedByOther: hasStudentReply, // simulate: provider views after student applies
              } as ConversationItem);
            }
          }
        } catch {}
      }

      // Merge interviews as application conversations
      for (const iv of (interviewsResult.data || []) as Array<{
        id: string;
        status: string;
        provider_profile_id: string;
        student_profile_id: string;
        notes: string | null;
        proposed_by: string;
        created_at: string;
        type: string;
      }>) {
        const interviewId = `interview-${iv.id}`;
        if (items.some((i) => i.id === interviewId)) continue;

        const isStudent = iv.student_profile_id === pid;
        const otherId = isStudent ? iv.provider_profile_id : iv.student_profile_id;
        const otherProfile = profileMap.get(otherId) || null;
        const otherName = otherProfile?.display_name || "Unknown";

        // Build a thread from the interview notes
        const thread: ThreadMessage[] = [];
        if (iv.notes) {
          thread.push({
            from_profile_id: iv.proposed_by,
            text: iv.notes,
            created_at: iv.created_at,
          });
        } else {
          thread.push({
            from_profile_id: iv.proposed_by,
            text: isStudent
              ? `You applied to ${otherName}`
              : `${otherProfile?.display_name || "A student"} applied to your posting`,
            created_at: iv.created_at,
            type: "system",
          });
        }

        items.push({
          id: interviewId,
          type: "application" as Connection["type"],
          status: (iv.status === "proposed" ? "pending" : "accepted") as Connection["status"],
          from_profile_id: iv.proposed_by,
          to_profile_id: iv.proposed_by === pid
            ? (isStudent ? iv.provider_profile_id : iv.student_profile_id)
            : pid,
          message: iv.notes || `Application to ${otherName}`,
          metadata: { interview_id: iv.id },
          created_at: iv.created_at,
          updated_at: iv.created_at,
          otherProfile,
          jobPosting: { title: otherName } as JobPostingMeta,
          thread,
          unread: !readIds.has(interviewId),
          viewedByOther: iv.status === "confirmed", // confirmed = provider has reviewed
        } as ConversationItem);
      }

      // Sort by last activity
      items.sort((a, b) => {
        const aTime = a.thread.length > 0
          ? new Date(a.thread[a.thread.length - 1].created_at).getTime()
          : new Date(a.updated_at || a.created_at).getTime();
        const bTime = b.thread.length > 0
          ? new Date(b.thread[b.thread.length - 1].created_at).getTime()
          : new Date(b.updated_at || b.created_at).getTime();
        return bTime - aTime;
      });

      setConversations(items);

      // Auto-select first on desktop
      if (!selectedId && items.length > 0 && window.innerWidth >= 1024) {
        setSelectedId(items[0].id);
      }
    } catch (err) {
      console.error("[medjobs-inbox] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [inboxProfileId, selectedId]);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  // Poll every 15s
  useEffect(() => {
    const interval = setInterval(fetchConversations, 15000);
    return () => clearInterval(interval);
  }, [fetchConversations]);

  // Mark as read when selecting
  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    // Update local read state
    const pid = inboxProfileId;
    if (!pid) return;
    try {
      const key = `medjobs_inbox_read_${pid}`;
      const stored = localStorage.getItem(key);
      const readIds: string[] = stored ? JSON.parse(stored) : [];
      if (!readIds.includes(id)) {
        readIds.push(id);
        localStorage.setItem(key, JSON.stringify(readIds));
      }
    } catch {}

    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, unread: false } : c))
    );
  }, [inboxProfileId]);

  // Send message
  const handleSend = useCallback(async () => {
    if (!composing.trim() || !selectedId || sending || !inboxProfileId) return;
    setSending(true);

    const isDemo = selectedId.startsWith("demo-");

    if (isDemo) {
      // Demo conversations: append message to localStorage
      const newMsg: ThreadMessage = {
        from_profile_id: inboxProfileId,
        text: composing.trim(),
        created_at: new Date().toISOString(),
      };
      try {
        // Try provider demo conversations first, then student demo invites
        const providerKey = `medjobs_demo_conversations_${inboxProfileId}`;
        const studentKey = `medjobs_student_demo_invites_${inboxProfileId}`;
        const keys = [providerKey, studentKey];
        for (const demoKey of keys) {
          const demoConvs = JSON.parse(localStorage.getItem(demoKey) || "[]");
          const idx = demoConvs.findIndex((c: { id: string }) => c.id === selectedId);
          if (idx !== -1) {
            const meta = demoConvs[idx].metadata || {};
            const thread = (meta.thread as ThreadMessage[]) || [];
            thread.push(newMsg);
            demoConvs[idx].metadata = { ...meta, thread };
            demoConvs[idx].updated_at = newMsg.created_at;
            localStorage.setItem(demoKey, JSON.stringify(demoConvs));
            break;
          }
        }
      } catch {}

      setConversations((prev) =>
        prev.map((c) =>
          c.id === selectedId
            ? { ...c, thread: [...c.thread, newMsg] }
            : c
        )
      );
      setComposing("");
      setSending(false);
      return;
    }

    try {
      const res = await fetch("/api/connections/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: selectedId, text: composing.trim() }),
      });

      if (res.ok) {
        const data = await res.json();
        setConversations((prev) =>
          prev.map((c) =>
            c.id === selectedId ? { ...c, thread: data.thread } : c
          )
        );
        setComposing("");
      }
    } catch (err) {
      console.error("[medjobs-inbox] send error:", err);
    } finally {
      setSending(false);
    }
  }, [composing, selectedId, sending, inboxProfileId]);

  // Scroll to bottom on new messages
  const selected = conversations.find((c) => c.id === selectedId) || null;
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selected?.thread.length]);

  // Unique job postings for the filter dropdown
  const jobPostings = useMemo(() => {
    const map = new Map<string, string>(); // posting_id → title
    for (const c of conversations) {
      const meta = (c.metadata || {}) as Record<string, unknown>;
      const pid = meta.posting_id as string | undefined;
      const title = c.jobPosting?.title;
      if (pid && title && !map.has(pid)) map.set(pid, title);
    }
    return Array.from(map.entries()).map(([id, title]) => ({ id, title }));
  }, [conversations]);

  // Reset job filter when switching away from a type filter
  useEffect(() => {
    if (filter !== "invites" && filter !== "applications") {
      setJobFilter("all");
    }
  }, [filter]);

  // Filter conversations
  const filtered = useMemo(() => {
    let result = conversations;
    switch (filter) {
      case "unread": result = result.filter((c) => c.unread); break;
      case "invites": result = result.filter((c) => c.type === "invitation"); break;
      case "applications": result = result.filter((c) => c.type === "application"); break;
    }
    // Provider: job posting dropdown filter
    if (jobFilter !== "all") {
      result = result.filter((c) => {
        const meta = (c.metadata || {}) as Record<string, unknown>;
        return meta.posting_id === jobFilter;
      });
    }
    // Search filter (name, job title, messages)
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((c) => {
        const name = c.otherProfile?.display_name?.toLowerCase() || "";
        const title = c.jobPosting?.title?.toLowerCase() || "";
        const msgs = c.thread.map((m) => m.text.toLowerCase()).join(" ");
        return name.includes(q) || title.includes(q) || msgs.includes(q);
      });
    }
    return result;
  }, [conversations, filter, jobFilter, searchQuery]);

  const unreadCount = conversations.filter((c) => c.unread).length;
  const inviteCount = conversations.filter((c) => c.type === "invitation" && c.unread).length;
  const appCount = conversations.filter((c) => c.type === "application").length;

  return (
    <div className="h-[calc(100dvh-64px)] bg-white flex overflow-hidden">
      {/* ── Left: Conversation List ── */}
      <div className={`w-full lg:w-[380px] lg:shrink-0 border-r border-gray-100 flex flex-col ${selectedId ? "hidden lg:flex" : "flex"}`}>
        {/* Header */}
        <div className="px-5 pt-5 pb-3">
          <h1 className="text-xl font-bold text-gray-900">Messages</h1>
        </div>

        {/* Filter pills */}
        <div className="px-5 pb-3 flex items-center gap-2">
          {([
            { key: "all", label: "All" },
            { key: "unread", label: "Unread", count: unreadCount },
            { key: "invites", label: "Invites", count: inviteCount },
            { key: "applications", label: userRole === "student" ? "Pending" : "Applications", count: appCount },
          ] as { key: Filter; label: string; count?: number }[]).map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                filter === f.key
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {f.label}
              {f.count ? (
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[11px] font-bold ${
                  filter === f.key ? "bg-white/20 text-white" : "bg-primary-100 text-primary-700"
                }`}>
                  {f.count}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {/* Search bar (student) or Job posting filter (provider) */}
        <div className="px-5 pb-3">
          {userRole === "student" ? (
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search names, companies, job titles..."
                className="w-full text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder:text-gray-400"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ) : jobPostings.length > 0 ? (
            <select
              value={jobFilter}
              onChange={(e) => setJobFilter(e.target.value)}
              className="w-full text-xs font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="all">All job postings</option>
              {jobPostings.map((jp) => (
                <option key={jp.id} value={jp.id}>{jp.title}</option>
              ))}
            </select>
          ) : null}
        </div>

        {/* Conversation rows */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-600 mb-1">
                {conversations.length === 0 ? "No messages yet" : "No conversations match this filter"}
              </p>
              <p className="text-xs text-gray-400 mb-4">
                {conversations.length === 0
                  ? (userRole === "student"
                    ? "When providers reach out, your conversations will appear here."
                    : "Invite candidates or wait for applications.")
                  : "Try a different filter."}
              </p>
              {conversations.length === 0 && (
                <Link
                  href={userRole === "student" ? "/portal/medjobs" : "/provider/medjobs/candidates"}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  {userRole === "student" ? "View Profile" : "Browse Candidates"}
                </Link>
              )}
            </div>
          ) : (
            filtered.map((conv) => {
              const name = conv.otherProfile?.display_name || "Unknown";
              const lastMsg = conv.thread[conv.thread.length - 1];
              const lastTime = lastMsg?.created_at || conv.created_at;
              const isMe = lastMsg?.from_profile_id === inboxProfileId;
              const preview = lastMsg ? (isMe ? `You: ${lastMsg.text}` : lastMsg.text) : conv.message || "";
              const jobTitle = conv.jobPosting?.title || null;
              const isSelected = conv.id === selectedId;
              const typeLabel = conv.type === "invitation" ? "Invite" : "Application";
              const img = conv.otherProfile?.image_url;

              return (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => handleSelect(conv.id)}
                  className={`w-full text-left px-5 py-3.5 flex gap-3 transition-colors border-b border-gray-50 ${
                    isSelected ? "bg-primary-50/60" : "hover:bg-gray-50"
                  }`}
                >
                  {/* Avatar */}
                  <div className="shrink-0 relative">
                    {img ? (
                      <Image
                        src={img}
                        alt={name}
                        width={44}
                        height={44}
                        className="w-11 h-11 rounded-full object-cover"
                      />
                    ) : (
                      <div className={`w-11 h-11 rounded-full bg-gradient-to-br ${gradient(conv.id)} flex items-center justify-center`}>
                        <span className="text-sm font-semibold text-white">{initials(name)}</span>
                      </div>
                    )}
                    {conv.unread && (
                      <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-primary-500 border-2 border-white" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Row 1: Name + time */}
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm truncate ${conv.unread ? "font-bold text-gray-900" : "font-semibold text-gray-900"}`}>
                        {name}
                      </p>
                      <span className="text-xs text-gray-400 shrink-0">{timeAgo(lastTime)}</span>
                    </div>
                    {/* Row 2: Job title */}
                    {jobTitle && jobTitle !== name && (
                      <p className={`text-sm truncate mt-0.5 ${conv.unread ? "font-bold text-gray-800" : "font-semibold text-gray-700"}`}>
                        {jobTitle}
                      </p>
                    )}
                    {/* Row 3: Preview */}
                    <p className={`text-xs truncate mt-0.5 ${conv.unread ? "text-gray-700 font-medium" : "text-gray-500"}`}>
                      {preview}
                    </p>
                    {/* Viewed badge — shown to students when provider has opened their application */}
                    {userRole === "student" && conv.viewedByOther && conv.thread.some((m) => m.from_profile_id === inboxProfileId && m.type !== "system") && (
                      <div className="flex items-center gap-1 mt-1.5">
                        <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                        </svg>
                        <span className="text-[11px] font-medium text-emerald-600">Viewed</span>
                      </div>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Middle: Message Thread ── */}
      <div className={`flex-1 flex flex-col min-w-0 ${selectedId ? "flex" : "hidden lg:flex"}`}>
        {selected ? (
          <>
            {/* Top bar — name + job context (Upwork style) */}
            <div className="px-5 py-3 border-b border-gray-200 flex items-center gap-3">
              {/* Back button (mobile) */}
              <button
                type="button"
                onClick={() => { setSelectedId(null); setSidebarOpen(false); }}
                className="lg:hidden shrink-0 -ml-1 p-1 text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>

              <p className="text-base font-bold text-gray-900 truncate">
                {selected.otherProfile?.display_name || "Unknown"}
              </p>

              <div className="flex items-center gap-2 text-xs text-gray-500 min-w-0">
                {selected.jobPosting?.title && (
                  <>
                    <span className="text-gray-300">|</span>
                    <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 0 0 .75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 0 0-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0 1 12 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 0 1-.673-.38m0 0A2.18 2.18 0 0 1 3 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 0 1 3.413-.387m7.5 0V5.25A2.25 2.25 0 0 0 13.5 3h-3a2.25 2.25 0 0 0-2.25 2.25v.894m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                    <span className="truncate">{selected.jobPosting.title}</span>
                  </>
                )}
              </div>

              <div className="ml-auto shrink-0">
                {/* Toggle sidebar button */}
                <button
                  type="button"
                  onClick={() => setSidebarOpen((v) => !v)}
                  title={sidebarOpen ? "Hide conversation info" : "Show conversation info"}
                  className={`p-2 rounded-lg transition-colors ${sidebarOpen ? "bg-gray-100 text-gray-700" : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"}`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {selected.thread.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-400">No messages yet. Start the conversation!</p>
                </div>
              ) : (
                selected.thread.map((msg, i) => {
                  const isMe = msg.from_profile_id === inboxProfileId;
                  const isFirstMsg = i === 0;
                  const jp = selected.jobPosting;
                  return (
                    <div key={i}>
                      {msg.type === "application" && msg.application ? (
                        /* ── Application Package Card ── */
                        <div className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                          <div className="max-w-[80%] rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                            {/* Header */}
                            <div className="px-4 py-3 bg-gray-900 text-white">
                              <div className="flex items-center gap-2">
                                <svg className="w-4 h-4 text-primary-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                                </svg>
                                <p className="text-xs font-semibold uppercase tracking-wide">Application Submitted</p>
                              </div>
                            </div>

                            {/* Profile */}
                            <div className="px-4 py-3 flex items-center gap-3 border-b border-gray-100">
                              {msg.application.profileImage ? (
                                <Image src={msg.application.profileImage} alt="" width={40} height={40} className="w-10 h-10 rounded-full object-cover" />
                              ) : (
                                <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${gradient(msg.from_profile_id)} flex items-center justify-center`}>
                                  <span className="text-sm font-bold text-white">{initials(msg.application.profileName || "")}</span>
                                </div>
                              )}
                              <div>
                                <p className="text-sm font-bold text-gray-900">{msg.application.profileName}</p>
                                {msg.application.profileMajor && (
                                  <p className="text-xs text-gray-500">
                                    {msg.application.profileMajor}
                                    {msg.application.profileSchool ? ` at ${msg.application.profileSchool}` : ""}
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Cover letter */}
                            {msg.application.coverLetter && (
                              <div className="px-4 py-3 border-b border-gray-100">
                                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Cover Letter</p>
                                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{msg.application.coverLetter}</p>
                              </div>
                            )}

                            {/* Documents */}
                            {msg.application.documents && msg.application.documents.length > 0 && (
                              <div className="px-4 py-3 border-b border-gray-100">
                                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Documents</p>
                                <div className="space-y-1.5">
                                  {msg.application.documents.map((doc) => (
                                    <div key={doc} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
                                      <svg className="w-4 h-4 text-primary-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9z" />
                                      </svg>
                                      <span className="text-xs text-gray-700 truncate">{doc}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Timestamp */}
                            <div className="px-4 py-2">
                              <p className="text-[10px] text-gray-400">{timeAgo(msg.created_at)}</p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* ── Regular Message Bubble ── */
                        <div className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl ${
                            isMe
                              ? "bg-primary-600 text-white rounded-br-md"
                              : "bg-gray-100 text-gray-900 rounded-bl-md"
                          }`}>
                            <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                            <p className={`text-[10px] mt-1 ${isMe ? "text-white/60" : "text-gray-400"}`}>
                              {timeAgo(msg.created_at)}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Inline job posting card after the first message */}
                      {isFirstMsg && jp?.title && (() => {
                        const hasApplied = selected.thread.some((m) => m.from_profile_id === inboxProfileId && m.type !== "system");
                        const isInviteForMe = selected.type === "invitation" && selected.to_profile_id === inboxProfileId;
                        const showApplyBtn = userRole === "student" && isInviteForMe && !hasApplied;
                        return (
                          <>
                            <div className={`flex ${isMe ? "justify-end" : "justify-start"} mt-2`}>
                              <div className="max-w-[75%] rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                                <div className="px-4 py-3">
                                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Attached job posting</p>
                                  <p className="text-sm font-semibold text-gray-900">{jp.title}</p>
                                  {(jp.hoursPerWeek || jp.payMin) && (
                                    <p className="text-xs text-gray-500 mt-0.5">
                                      {jp.hoursPerWeek && (HOURS_LABELS[jp.hoursPerWeek] || jp.hoursPerWeek)}
                                      {jp.hoursPerWeek && jp.payMin && " \u00B7 "}
                                      {jp.payMin && `$${jp.payMin}\u2013$${jp.payMax}/hr`}
                                    </p>
                                  )}
                                </div>
                                <div className="flex border-t border-gray-100">
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const jp2 = selected.jobPosting;
                                      // If we already have rich data (demo invites with full details), use it directly
                                      const hasRichData = jp2?.roleDescription && jp2?.aboutCompany && jp2?.certifications;
                                      if (hasRichData) {
                                        setJobDetailData(jp2);
                                        setJobDetailOpen(true);
                                        return;
                                      }
                                      // Otherwise derive/fetch full details from the provider profile
                                      setJobDetailLoading(true);
                                      setJobDetailOpen(true);
                                      try {
                                        const otherId = selected.from_profile_id === inboxProfileId
                                          ? selected.to_profile_id : selected.from_profile_id;
                                        // For demo conversations, derive from what we have
                                        if (selected.id.startsWith("demo-")) {
                                          const provName = selected.otherProfile?.display_name || "";
                                          const provImg = selected.otherProfile?.image_url || null;
                                          const derived = deriveJobDetails(otherId, provName, provImg, {});
                                          // Merge any existing partial data (title, pay, hours) over the derived defaults
                                          setJobDetailData({ ...derived, ...jp2, roleDescription: jp2?.roleDescription || derived.roleDescription, aboutCompany: jp2?.aboutCompany || derived.aboutCompany, certifications: jp2?.certifications || derived.certifications, skills: jp2?.skills || derived.skills, heroImage: jp2?.heroImage || derived.heroImage });
                                          setJobDetailLoading(false);
                                          return;
                                        }
                                        const supabase = createClient();
                                        const { data: prof } = await supabase
                                          .from("business_profiles")
                                          .select("id, display_name, image_url, metadata")
                                          .eq("id", otherId)
                                          .single();
                                        if (prof) {
                                          const derived = deriveJobDetails(
                                            prof.id,
                                            prof.display_name,
                                            prof.image_url,
                                            (prof.metadata || {}) as Record<string, unknown>
                                          );
                                          setJobDetailData(derived);
                                        } else {
                                          setJobDetailData(jp2 || null);
                                        }
                                      } catch {
                                        setJobDetailData(jp2 || null);
                                      } finally {
                                        setJobDetailLoading(false);
                                      }
                                    }}
                                    className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-gray-50/50 text-xs font-semibold text-primary-700 hover:bg-gray-100 transition-colors"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                                    </svg>
                                    View details
                                  </button>
                                  {showApplyBtn && (
                                    <button
                                      type="button"
                                      onClick={() => setApplyModalOpen(true)}
                                      className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 border-l border-gray-100 bg-primary-600 text-xs font-semibold text-white hover:bg-primary-700 transition-colors"
                                    >
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                                      </svg>
                                      Apply now
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Compose */}
            <div className="border-t border-gray-200 bg-gray-50 px-5 py-4">
              <div className="flex items-end gap-2">
                <textarea
                  value={composing}
                  onChange={(e) => setComposing(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Send a message..."
                  rows={2}
                  className="flex-1 resize-none rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder:text-gray-400 shadow-sm"
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!composing.trim() || sending}
                  className="shrink-0 p-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 disabled:bg-gray-200 disabled:cursor-not-allowed text-white transition-colors"
                >
                  {sending ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </>
        ) : (
          /* No conversation selected (desktop) */
          <div className="hidden lg:flex flex-1 items-center justify-center">
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                <svg className="w-7 h-7 text-gray-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                </svg>
              </div>
              <p className="text-sm text-gray-400">Select a conversation to start messaging</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Right Sidebar: Candidate Info + Timeline ── */}
      {selected && sidebarOpen && (
        <div className="hidden lg:flex w-[320px] shrink-0 border-l border-gray-200 flex-col overflow-y-auto bg-gray-50/30">
          {/* Close button */}
          <div className="flex justify-end px-4 pt-4">
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="p-1 text-gray-400 hover:text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Centered avatar + name card */}
          <div className="flex flex-col items-center px-5 pb-5">
            <div className="relative">
              {selected.otherProfile?.image_url ? (
                <Image
                  src={selected.otherProfile.image_url}
                  alt={selected.otherProfile.display_name || ""}
                  width={80}
                  height={80}
                  className="w-20 h-20 rounded-full object-cover"
                />
              ) : (
                <div className={`w-20 h-20 rounded-full bg-gradient-to-br ${gradient(selected.id)} flex items-center justify-center`}>
                  <span className="text-xl font-bold text-white">
                    {initials(selected.otherProfile?.display_name || "?")}
                  </span>
                </div>
              )}
              <div className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-gray-300 border-[2.5px] border-white" />
            </div>

            <p className="text-base font-bold text-gray-900 mt-3">
              {selected.otherProfile?.display_name || "Unknown"}
            </p>

            {/* Detail lines */}
            {(() => {
              const meta = (selected.otherProfile?.metadata || {}) as Record<string, unknown>;
              const major = meta.major as string | undefined;
              const school = meta.university as string | undefined;
              const gradYear = meta.graduation_year as number | undefined;
              const certs = (meta.certifications || []) as string[];
              return (
                <div className="mt-2 space-y-1.5 text-center">
                  {major && (
                    <div className="flex items-center justify-center gap-1.5 text-xs text-gray-600">
                      <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342" />
                      </svg>
                      {major}{school ? ` at ${school}` : ""}{gradYear ? ` \u00B7 ${gradYear}` : ""}
                    </div>
                  )}
                  {certs.length > 0 && (
                    <div className="flex items-center justify-center gap-1.5 text-xs text-gray-600">
                      <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z" />
                      </svg>
                      {certs.slice(0, 3).join(", ")}{certs.length > 3 ? ` +${certs.length - 3}` : ""}
                    </div>
                  )}
                  {selected.jobPosting?.title && (
                    <div className="flex items-center justify-center gap-1.5 text-xs text-gray-600">
                      <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 0 0 .75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 0 0-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0 1 12 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 0 1-.673-.38m0 0A2.18 2.18 0 0 1 3 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 0 1 3.413-.387m7.5 0V5.25A2.25 2.25 0 0 0 13.5 3h-3a2.25 2.25 0 0 0-2.25 2.25v.894m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                      </svg>
                      {selected.jobPosting.title}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* View profile button */}
            {selected.otherProfile?.slug && (
              <Link
                href={userRole === "student"
                  ? `/providers/${selected.otherProfile.slug}`
                  : `/medjobs/candidates/${selected.otherProfile.slug}`}
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:text-primary-800"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                </svg>
                View profile
              </Link>
            )}
          </div>

          {/* Activity Timeline */}
          <div className="border-t border-gray-200 px-5 pt-4 pb-6">
            <button
              type="button"
              onClick={() => setTimelineOpen((v) => !v)}
              className="w-full flex items-center justify-between mb-4"
            >
              <div className="flex items-center gap-2">
                <svg className="w-4.5 h-4.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                <span className="text-sm font-semibold text-gray-800">Activity timeline</span>
              </div>
              <svg className={`w-4 h-4 text-gray-400 transition-transform ${timelineOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>

            {timelineOpen && (() => {
              const steps = getHiringSteps(selected, userRole);
              return (
                <div className="relative ml-1">
                  {steps.map((step, i) => {
                    const isLast = i === steps.length - 1;
                    return (
                      <div key={step.key} className="flex gap-3.5 relative">
                        {!isLast && (
                          <div className="absolute left-[11px] top-7 bottom-0 w-0.5 bg-gray-200" />
                        )}
                        <div className="relative z-10 shrink-0 mt-0.5">
                          {step.status === "done" ? (
                            <div className="w-6 h-6 rounded-full bg-primary-600 flex items-center justify-center">
                              <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                              </svg>
                            </div>
                          ) : step.status === "current" ? (
                            <div className="w-6 h-6 rounded-full border-2 border-primary-600 bg-white flex items-center justify-center">
                              <div className="w-2 h-2 rounded-full bg-primary-600" />
                            </div>
                          ) : (
                            <div className="w-6 h-6 rounded-full border-2 border-gray-200 bg-white" />
                          )}
                        </div>
                        <div className={`${isLast ? "pb-0" : "pb-6"}`}>
                          <p className={`text-sm font-medium leading-tight ${
                            step.status === "done" ? "text-gray-900" :
                            step.status === "current" ? "text-primary-700" :
                            "text-gray-400"
                          }`}>
                            {step.label}
                          </p>
                          {step.subtitle && (
                            <p className={`text-xs mt-0.5 ${
                              step.status === "done" ? "text-gray-500" :
                              step.status === "current" ? "text-primary-600/70" :
                              "text-gray-300"
                            }`}>
                              {step.subtitle}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      )}
      {/* Job Details Popup */}
      {jobDetailOpen && selected && (() => {
        const jp = jobDetailData || selected.jobPosting;
        if (!jp) return null;
        const provName = selected.otherProfile?.display_name || "";
        const provImg = selected.otherProfile?.image_url;
        const hasApplied = selected.thread.some((m) => m.from_profile_id === inboxProfileId && m.type !== "system");

        return (
          <Modal isOpen onClose={() => { setJobDetailOpen(false); setJobDetailData(null); }} hideHeader size="lg">
            {jobDetailLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
            <div className="max-h-[85vh] overflow-y-auto">
              {/* Hero image */}
              {jp.heroImage ? (
                <div className="relative h-48 w-full bg-gray-200">
                  <Image src={jp.heroImage} alt={jp.title || ""} fill className="object-cover" />
                  <button
                    type="button"
                    onClick={() => setJobDetailOpen(false)}
                    className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center text-white transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                  <div className="absolute bottom-3 left-4">
                    <p className="text-white font-bold text-lg drop-shadow-lg">{provName}</p>
                  </div>
                </div>
              ) : (
                <div className="flex justify-end px-4 pt-4">
                  <button type="button" onClick={() => setJobDetailOpen(false)} className="p-1 text-gray-400 hover:text-gray-600">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}

              <div className="px-6 py-5 space-y-6">
                {/* Title */}
                {!jp.heroImage && (
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">{jp.title}</h2>
                    <p className="text-sm text-gray-500 mt-1">{provName}</p>
                  </div>
                )}
                {jp.heroImage && (
                  <h2 className="text-xl font-bold text-gray-900">{jp.title}</h2>
                )}

                {/* Hours & Pay */}
                <div>
                  <p className="text-[11px] font-semibold text-primary-600 uppercase tracking-wide mb-2">Hours & Pay</p>
                  <div className="grid grid-cols-3 gap-3">
                    {jp.hoursPerWeek && (
                      <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Hours / Week</p>
                        <p className="text-sm font-bold text-gray-900 mt-1">{HOURS_LABELS[jp.hoursPerWeek]?.replace(" hrs/wk", "") || jp.hoursPerWeek}</p>
                      </div>
                    )}
                    {jp.payMin && (
                      <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Pay Range</p>
                        <p className="text-sm font-bold text-gray-900 mt-1">${jp.payMin}&ndash;${jp.payMax}/hr</p>
                      </div>
                    )}
                    {jp.commitment && (
                      <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Commitment</p>
                        <p className="text-sm font-bold text-gray-900 mt-1">{jp.commitment}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Hiring count */}
                {jp.hiringCount && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
                    </svg>
                    Hiring {jp.hiringCount} student{jp.hiringCount > 1 ? "s" : ""} for this role
                  </div>
                )}

                {/* Applied status */}
                {hasApplied && (
                  <div className="w-full py-3 border border-primary-200 bg-primary-50/50 rounded-xl text-center">
                    <p className="text-sm font-semibold text-primary-700">You&apos;ve already applied</p>
                  </div>
                )}

                {/* About Company */}
                {jp.aboutCompany && (
                  <div>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">About {provName}</p>
                    <p className="text-sm text-gray-700 leading-relaxed">{jp.aboutCompany}</p>
                  </div>
                )}

                {/* The Role */}
                {jp.roleDescription && (
                  <div>
                    <p className="text-[11px] font-semibold text-primary-600 uppercase tracking-wide mb-2">The Role</p>
                    <p className="text-sm text-gray-700 leading-relaxed">{jp.roleDescription}</p>
                    {jp.tags && jp.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {jp.tags.map((tag) => (
                          <span key={tag} className="px-3 py-1 bg-primary-50 text-primary-700 text-xs font-medium rounded-full border border-primary-100">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* What we're looking for */}
                {((jp.certifications && jp.certifications.length > 0) || (jp.skills && jp.skills.length > 0)) && (
                  <div>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-3">What We&apos;re Looking For</p>

                    {jp.certifications && jp.certifications.length > 0 && (
                      <div className="mb-3">
                        <p className="text-xs font-semibold text-gray-600 mb-2">Certifications</p>
                        <div className="flex flex-wrap gap-2">
                          {jp.certifications.map((cert) => (
                            <span key={cert} className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-50 border border-gray-100 rounded-full text-xs text-gray-700">
                              <svg className="w-3.5 h-3.5 text-primary-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                              </svg>
                              {cert}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {jp.skills && jp.skills.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-600 mb-2">Skills</p>
                        <div className="flex flex-wrap gap-2">
                          {jp.skills.map((skill) => (
                            <span key={skill} className="px-3 py-1.5 bg-gray-50 border border-gray-100 rounded-full text-xs text-gray-700">
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Company card */}
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-3">Company</p>
                  <div className="flex items-center gap-3">
                    {provImg ? (
                      <Image src={provImg} alt="" width={44} height={44} className="w-11 h-11 rounded-full object-cover" />
                    ) : (
                      <div className={`w-11 h-11 rounded-full bg-gradient-to-br ${gradient(selected.id)} flex items-center justify-center`}>
                        <span className="text-sm font-bold text-white">{initials(provName)}</span>
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-bold text-gray-900">{provName}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            )}
          </Modal>
        );
      })()}

      {/* Apply Modal (student responding to an invitation) */}
      {applyModalOpen && selected && (() => {
        const isDemo = selected.id.startsWith("demo-");
        const providerName = selected.otherProfile?.display_name || "this provider";
        const jobTitle = selected.jobPosting?.title || "this position";

        const formatSize = (bytes: number) => {
          if (bytes < 1024) return `${bytes} B`;
          if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
          return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        };

        const handleApplySubmit = async () => {
          if (applySubmitting) return;
          setApplySubmitting(true);

          const coverText = applyCoverLetter.trim();
          const fileNames = applyFiles.map((f) => f.name);

          // Get student profile info for the application card
          const studentProfile = profiles?.find((p) => p.type === "student") || activeProfile;
          const studentMeta = ((studentProfile?.metadata || {}) as Record<string, unknown>);

          const newMsg: ThreadMessage = {
            from_profile_id: inboxProfileId!,
            text: coverText || `Applied to ${jobTitle}`,
            created_at: new Date().toISOString(),
            type: "application",
            application: {
              coverLetter: coverText || undefined,
              documents: fileNames.length > 0 ? fileNames : undefined,
              profileName: studentProfile?.display_name || "Student",
              profileImage: studentProfile?.image_url || null,
              profileMajor: (studentMeta.major as string) || undefined,
              profileSchool: (studentMeta.university as string) || undefined,
            },
          };

          if (isDemo) {
            try {
              const demoKey = `medjobs_student_demo_invites_${inboxProfileId}`;
              const demoConvs = JSON.parse(localStorage.getItem(demoKey) || "[]");
              const idx = demoConvs.findIndex((c: { id: string }) => c.id === selected.id);
              if (idx !== -1) {
                const meta = demoConvs[idx].metadata || {};
                const thread = (meta.thread as ThreadMessage[]) || [];
                thread.push(newMsg);
                demoConvs[idx].metadata = { ...meta, thread, applied_at: newMsg.created_at };
                demoConvs[idx].updated_at = newMsg.created_at;
                localStorage.setItem(demoKey, JSON.stringify(demoConvs));
              }
            } catch {}

            setConversations((prev) =>
              prev.map((c) =>
                c.id === selected.id
                  ? {
                      ...c,
                      thread: [...c.thread, newMsg],
                      metadata: { ...((c.metadata || {}) as Record<string, unknown>), applied_at: newMsg.created_at },
                    }
                  : c
              )
            );
          } else {
            try {
              await fetch("/api/medjobs/interviews", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  providerProfileId: selected.from_profile_id,
                  type: "video",
                  proposedTime: new Date().toISOString(),
                  notes: coverText || undefined,
                  isJobApplication: true,
                }),
              });
              await fetch("/api/connections/message", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  connectionId: selected.id,
                  text: newMsg.text,
                }),
              });
              fetchConversations();
            } catch (err) {
              console.error("[inbox] apply error:", err);
            }
          }

          setApplySubmitting(false);
          setApplyModalOpen(false);
          setApplyCoverLetter("");
          setApplyFiles([]);
        };

        return (
          <Modal isOpen onClose={() => { setApplyModalOpen(false); setApplyCoverLetter(""); setApplyFiles([]); }} title="Apply to this job" size="lg" footer={
            <div className="pt-2">
              <button
                type="button"
                onClick={handleApplySubmit}
                disabled={applySubmitting}
                className="w-full py-3.5 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-100 disabled:text-gray-400 rounded-xl text-sm font-semibold text-white transition-colors min-h-[48px]"
              >
                {applySubmitting ? "Sending..." : "Send application"}
              </button>
            </div>
          }>
            <div className="py-4 space-y-5">
              {/* Job info */}
              <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 0 0 .75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 0 0-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0 1 12 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 0 1-.673-.38m0 0A2.18 2.18 0 0 1 3 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 0 1 3.413-.387m7.5 0V5.25A2.25 2.25 0 0 0 13.5 3h-3a2.25 2.25 0 0 0-2.25 2.25v.894m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900 leading-snug">{jobTitle}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{providerName}</p>
                </div>
              </div>

              {/* Cover letter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cover letter <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <textarea
                  value={applyCoverLetter}
                  onChange={(e) => setApplyCoverLetter(e.target.value)}
                  placeholder="Tell them why you're a great fit..."
                  rows={5}
                  className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none transition-colors"
                />
              </div>

              {/* Documents */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Documents <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <p className="text-xs text-gray-400 mb-3">
                  Resume, certifications, or anything else that helps your application. Up to 5 files.
                </p>

                {applyFiles.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {applyFiles.map((file) => (
                      <div key={file.name} className="flex items-center gap-3 px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg">
                        <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9z" />
                        </svg>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700 truncate">{file.name}</p>
                          <p className="text-[11px] text-gray-400">{formatSize(file.size)}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setApplyFiles((prev) => prev.filter((f) => f.name !== file.name))}
                          className="text-gray-400 hover:text-red-500 transition-colors shrink-0"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {applyFiles.length < 5 && (
                  <button
                    type="button"
                    onClick={() => applyFileRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2.5 border border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:text-gray-700 hover:border-gray-400 hover:bg-gray-50 transition-all w-full justify-center"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    Upload a file
                  </button>
                )}
                <input
                  ref={applyFileRef}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png"
                  onChange={(e) => {
                    const selected2 = e.target.files;
                    if (!selected2) return;
                    const newFiles = Array.from(selected2).filter(
                      (f) => !applyFiles.some((existing) => existing.name === f.name)
                    );
                    setApplyFiles((prev) => [...prev, ...newFiles].slice(0, 5));
                    e.target.value = "";
                  }}
                  className="hidden"
                />
              </div>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}

/* ─── Page Export ────────────────────────────────────────── */

export default function MedJobsInboxPage() {
  // MVP: the marketplace inbox (Gen 2) is hidden; interview status lives on the
  // interview calendar. Flip the env flag to restore it.
  if (MEDJOBS_MARKETPLACE_V2_HIDDEN) redirect("/portal/medjobs/interviews");
  return (
    <Suspense
      fallback={
        <div className="h-[calc(100dvh-64px)] flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <MedJobsInboxContent />
    </Suspense>
  );
}
