"use client";

import { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";
import ReachOutDrawer from "@/components/provider/matches/ReachOutDrawer";
import FamilyMatchCard from "@/components/provider/matches/FamilyMatchCard";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type OutreachStatus = "pending" | "connected" | "declined";

interface OutreachItem {
  id: string; // connection id
  family: Profile;
  message: string | null;
  sentAt: string;
  status: OutreachStatus;
  replyMessage?: string | null;
  repliedAt?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab Configuration
// ─────────────────────────────────────────────────────────────────────────────

const TABS: { id: OutreachStatus; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "connected", label: "Connected" },
  { id: "declined", label: "Declined" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Empty State
// ─────────────────────────────────────────────────────────────────────────────

function EmptyState({ status }: { status: OutreachStatus }) {
  const content = {
    pending: {
      image: "/Pending.png",
      title: "No pending outreach",
      description: "When you reach out to families, they'll appear here until they respond.",
    },
    connected: {
      image: "/Connected.png",
      title: "No connections yet",
      description: "When families respond to your outreach, they'll appear here.",
    },
    declined: {
      image: "/Declined.png",
      title: "No declined outreach",
      description: "Outreach that didn't result in a connection will appear here.",
    },
  };

  const { image, title, description } = content[status];

  return (
    <div className="flex flex-col items-center justify-center py-12 px-8 text-center">
      <Image
        src={image}
        alt={title}
        width={180}
        height={180}
        className="mb-6"
      />
      <h3 className="text-[17px] font-display font-bold text-gray-900 mb-2">{title}</h3>
      <p className="text-[15px] text-gray-500 max-w-sm leading-relaxed">{description}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

// Validate status parameter
function isValidStatus(status: string | null): status is OutreachStatus {
  return status === "pending" || status === "connected" || status === "declined";
}

function OutreachPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusParam = searchParams.get("status");
  const initialStatus: OutreachStatus = isValidStatus(statusParam) ? statusParam : "pending";

  const [activeTab, setActiveTab] = useState<OutreachStatus>(initialStatus);
  const [outreachItems, setOutreachItems] = useState<OutreachItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Drawer state
  const [selectedItem, setSelectedItem] = useState<OutreachItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Provider profile for drawer
  const [providerProfile, setProviderProfile] = useState<Profile | null>(null);

  // Interested providers count per family
  const [reachOutCounts, setReachOutCounts] = useState<Map<string, number>>(new Map());


  // Update URL when tab changes
  const handleTabChange = useCallback((tab: OutreachStatus) => {
    setActiveTab(tab);
    router.replace(`/provider/outreach?status=${tab}`, { scroll: false });
  }, [router]);

  // Fetch data
  useEffect(() => {
    async function fetchOutreach() {
      setLoading(true);
      setError(null);

      try {
        const supabase = createClient();

        // Get current user and their provider profile
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setError("Please sign in to view your outreach");
          setLoading(false);
          return;
        }

        // Get provider's active profile
        const { data: account } = await supabase
          .from("accounts")
          .select("active_profile_id")
          .eq("user_id", user.id)
          .single();

        if (!account?.active_profile_id) {
          setError("No active profile found");
          setLoading(false);
          return;
        }

        // Fetch provider profile
        const { data: provider } = await supabase
          .from("business_profiles")
          .select("*")
          .eq("id", account.active_profile_id)
          .single();

        if (provider) {
          setProviderProfile(provider as Profile);
        }

        // Fetch connections with family profiles
        const { data: connections, error: connError } = await supabase
          .from("connections")
          .select(`
            id,
            to_profile_id,
            message,
            created_at,
            status,
            metadata,
            to_profile:business_profiles!connections_to_profile_id_fkey (
              id,
              display_name,
              image_url,
              city,
              state,
              phone,
              email,
              care_types,
              metadata,
              created_at
            )
          `)
          .eq("from_profile_id", account.active_profile_id)
          .eq("type", "request")
          .in("status", ["pending", "accepted", "declined"])
          .order("created_at", { ascending: false });

        if (connError) {
          throw new Error(connError.message);
        }

        // Transform to OutreachItem format
        const items: OutreachItem[] = (connections || [])
          .filter((conn) => conn.to_profile) // Only include if family profile exists
          .map((conn) => {
            const meta = conn.metadata as { reply_message?: string; replied_at?: string } | null;
            return {
              id: conn.id,
              family: conn.to_profile as unknown as Profile,
              message: conn.message,
              sentAt: conn.created_at,
              status: conn.status === "accepted" ? "connected" : conn.status as OutreachStatus,
              replyMessage: meta?.reply_message,
              repliedAt: meta?.replied_at,
            };
          });

        setOutreachItems(items);

        // Fetch interested providers count for each family
        const familyIds = items.map((item) => item.family.id);
        if (familyIds.length > 0) {
          const { data: reachOuts } = await supabase
            .from("connections")
            .select("to_profile_id")
            .in("to_profile_id", familyIds)
            .eq("type", "request")
            .in("status", ["pending", "accepted"]);

          const counts = new Map<string, number>();
          (reachOuts || []).forEach((r: { to_profile_id: string }) => {
            counts.set(r.to_profile_id, (counts.get(r.to_profile_id) || 0) + 1);
          });
          setReachOutCounts(counts);
        }
      } catch (err) {
        console.error("Failed to fetch outreach:", err);
        setError(err instanceof Error ? err.message : "Failed to load outreach");
      } finally {
        setLoading(false);
      }
    }

    fetchOutreach();
  }, []);

  // Filter items by active tab
  const filteredItems = useMemo(() => {
    return outreachItems.filter((item) => item.status === activeTab);
  }, [outreachItems, activeTab]);

  // Counts for tabs
  const counts = useMemo(() => ({
    pending: outreachItems.filter((i) => i.status === "pending").length,
    connected: outreachItems.filter((i) => i.status === "connected").length,
    declined: outreachItems.filter((i) => i.status === "declined").length,
  }), [outreachItems]);


  // Open drawer
  const openDrawer = useCallback((item: OutreachItem) => {
    setSelectedItem(item);
    setIsDrawerOpen(true);
  }, []);

  // Close drawer
  const closeDrawer = useCallback(() => {
    setIsDrawerOpen(false);
    setTimeout(() => setSelectedItem(null), 300);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Header - sticky */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6 sm:py-8">
            {/* Back link */}
            <Link
              href="/provider/matches"
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-500 hover:text-gray-700 transition-colors mb-4"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
              Find Families
            </Link>

            <h1 className="text-2xl sm:text-3xl font-display font-bold text-gray-900 tracking-tight">
              My Outreach
            </h1>
            <p className="text-[15px] text-gray-500 mt-1">
              Track your messages to families
            </p>
          </div>

          {/* Tabs */}
          <div className="flex gap-6 -mb-px">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabChange(tab.id)}
                className={`relative pb-3 text-[15px] font-medium transition-colors ${
                  activeTab === tab.id
                    ? "text-gray-900"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab.label}
                {counts[tab.id] > 0 && (
                  <span className={`ml-1.5 text-[13px] ${
                    activeTab === tab.id ? "text-gray-900" : "text-gray-400"
                  }`}>
                    ({counts[tab.id]})
                  </span>
                )}
                {activeTab === tab.id && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 rounded-full" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>


      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-16">
            <p className="text-[15px] text-red-600">{error}</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <EmptyState status={activeTab} />
        ) : (
          <div className="space-y-4">
            {filteredItems.map((item, idx) => (
              <FamilyMatchCard
                key={item.id}
                family={item.family}
                hasFullAccess={true}
                providerCareTypes={providerProfile?.care_types || []}
                contacted={true}
                outreachStatus={item.status}
                onReachOut={() => openDrawer(item)}
                animationDelay={idx * 50}
                sentAt={item.sentAt}
                reachOutCount={reachOutCounts.get(item.family.id) || 0}
              />
            ))}
          </div>
        )}
      </div>

      {/* Drawer */}
      <ReachOutDrawer
        family={selectedItem?.family || null}
        isOpen={isDrawerOpen}
        onClose={closeDrawer}
        onSend={async (_familyId, _message, _saveAsDefault, _usedAi) => true} // No-op for view mode
        providerProfile={providerProfile}
        mode="view"
        sentMessage={selectedItem?.message || undefined}
        sentAt={selectedItem?.sentAt}
        outreachStatus={selectedItem?.status}
      />
    </div>
  );
}

// Loading fallback for Suspense
function OutreachPageLoading() {
  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="h-4 w-24 bg-gray-200 rounded animate-pulse mb-4" />
          <div className="h-8 w-48 bg-gray-200 rounded animate-pulse mb-2" />
          <div className="h-4 w-64 bg-gray-200 rounded animate-pulse" />
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
        </div>
      </div>
    </div>
  );
}

// Wrap in Suspense for useSearchParams
export default function OutreachPage() {
  return (
    <Suspense fallback={<OutreachPageLoading />}>
      <OutreachPageContent />
    </Suspense>
  );
}
