"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Badge from "@/components/ui/Badge";
import Select from "@/components/ui/Select";
import { PROVIDER_CATEGORIES } from "@/lib/types";
import { useCitySearch } from "@/hooks/use-city-search";
import GooglePlaceSearch from "@/components/providers/GooglePlaceSearch";
import ProviderCommsTimeline from "@/components/admin/ProviderCommsTimeline";
import type { DirectoryProvider } from "@/lib/types";
import { DEMAND_PROFILE_KEY, type DemandProfile } from "@/lib/medjobs/eligibility";
import {
  COVERAGE_OPTIONS,
  PRN_OPTIONS,
  REQUIREMENT_OPTIONS,
  REQUIREMENTS_KEY,
  type MedjobsRequirements,
} from "@/lib/medjobs/hiring-needs-questions";

interface ImageMetadata {
  id: string;
  provider_id: string;
  image_url: string;
  source_field: string;
  image_type: string;
  classification_method: string;
  classification_confidence: number;
  quality_score: number;
  width: number | null;
  height: number | null;
  is_accessible: boolean;
  is_hero: boolean;
  review_status: string;
}

type ProviderSource = "scraped" | "user-created";

export default function AdminDirectoryDetailPage() {
  const { providerId } = useParams<{ providerId: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [googleRefreshing, setGoogleRefreshing] = useState(false);
  const [googleRefreshResult, setGoogleRefreshResult] = useState<{ ok: boolean; text: string; canForce?: boolean } | null>(null);
  async function refreshGoogleReviews(force: boolean) {
    setGoogleRefreshing(true);
    setGoogleRefreshResult(null);
    try {
      const res = await fetch(`/api/admin/google-reviews/refresh?provider_id=${encodeURIComponent(providerId)}${force ? "&force=1" : ""}`);
      const json = await res.json();
      if (res.ok) {
        setGoogleRefreshResult({ ok: true, text: `Updated: ${json.rating} stars, ${json.review_count} reviews on Google.` });
        if (json.rating != null) updateField("google_rating", json.rating);
      } else {
        setGoogleRefreshResult({ ok: false, text: json.error ?? `Refresh failed (${res.status}).`, canForce: res.status === 429 });
      }
    } catch {
      setGoogleRefreshResult({ ok: false, text: "Network error. Try again." });
    } finally {
      setGoogleRefreshing(false);
    }
  }
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [originalData, setOriginalData] = useState<Record<string, unknown>>({});
  const [images, setImages] = useState<ImageMetadata[]>([]);
  const [rawImages, setRawImages] = useState<string[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [source, setSource] = useState<ProviderSource>("scraped");
  const [isClaimed, setIsClaimed] = useState<boolean | null>(null);
  const [sendingClaimLink, setSendingClaimLink] = useState(false);
  const [claimLinkSent, setClaimLinkSent] = useState(false);
  const [showClaimLinkModal, setShowClaimLinkModal] = useState(false);
  // Canonical olera-providers.provider_id from the API response. URLs accept
  // multiple input shapes (op.provider_id, op.slug, bp.id, bp.slug) but PATCH
  // + image action endpoints require the exact provider_id. Without this, a
  // user clicking through from an analytics top-providers link (op.slug URL)
  // would get 404s on every save. Falls back to the URL param for the brief
  // window before fetch completes (no handlers run that early anyway).
  const [canonicalProviderId, setCanonicalProviderId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Owner/staff state (stored in business_profiles.metadata.staff)
  const [staffName, setStaffName] = useState("");
  const [staffPosition, setStaffPosition] = useState("");
  const [staffBio, setStaffBio] = useState("");
  const [staffCareMotivation, setStaffCareMotivation] = useState("");
  const [staffImage, setStaffImage] = useState("");
  const [originalStaff, setOriginalStaff] = useState<Record<string, string>>({});
  const [savingStaff, setSavingStaff] = useState(false);
  const [staffMessage, setStaffMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const staffFileRef = useRef<HTMLInputElement>(null);
  const [uploadingStaffPhoto, setUploadingStaffPhoto] = useState(false);

  // Hiring defaults state (stored in business_profiles.metadata)
  type Bucket = DemandProfile["coverage_buckets"][number];
  const [hiringDescription, setHiringDescription] = useState("");
  const [hiringBuckets, setHiringBuckets] = useState<Bucket[]>([]);
  const [hiringPrn, setHiringPrn] = useState<DemandProfile["prn_open"] | undefined>(undefined);
  const [hiringReqs, setHiringReqs] = useState<MedjobsRequirements>({});
  const [originalHiring, setOriginalHiring] = useState<{
    description?: string;
    buckets?: Bucket[];
    prn?: DemandProfile["prn_open"];
    reqs?: MedjobsRequirements;
  }>({});
  const [savingHiring, setSavingHiring] = useState(false);
  const [hiringMessage, setHiringMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // City search state
  const [cityQuery, setCityQuery] = useState("");
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const { results: cityResults, preload: preloadCities } = useCitySearch(cityQuery);
  const cityDropdownRef = useRef<HTMLDivElement>(null);

  // Close city dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (cityDropdownRef.current && !cityDropdownRef.current.contains(e.target as Node)) {
        setShowCityDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchProvider = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/directory/${providerId}`);
      if (!res.ok) {
        router.push("/admin/directory");
        return;
      }
      const data = await res.json();
      setFormData({ ...data.provider });
      setOriginalData({ ...data.provider });
      setImages(data.images ?? []);
      setRawImages(data.rawImages ?? []);
      setSource(data.source === "user-created" ? "user-created" : "scraped");
      // For scraped: olera-providers.provider_id. For user-created: the BP UUID.
      // Fallback: the URL param (only hit in transient/error states).
      const cid = (data.provider?.provider_id as string | undefined)
        || (data.businessProfileId as string | undefined)
        || providerId;
      setCanonicalProviderId(cid);

      // Populate staff/owner data
      const staff = data.staffData as Record<string, string> | null;
      if (staff) {
        setStaffName(staff.name || "");
        setStaffPosition(staff.position || "");
        setStaffBio(staff.bio || "");
        setStaffCareMotivation(staff.care_motivation || "");
        setStaffImage(staff.image || "");
        setOriginalStaff({
          name: staff.name || "",
          position: staff.position || "",
          bio: staff.bio || "",
          care_motivation: staff.care_motivation || "",
          image: staff.image || "",
        });
      }

      // Set claimed status from API response
      setIsClaimed(data.isClaimed ?? false);

      // Populate hiring defaults from business_profiles.metadata
      const hiringData = data.hiringDefaults as {
        demand?: Partial<DemandProfile>;
        requirements?: MedjobsRequirements;
      } | null;
      if (hiringData) {
        const { demand, requirements } = hiringData;
        setHiringDescription(demand?.job_description ?? "");
        setHiringBuckets((demand?.coverage_buckets as Bucket[] | undefined) ?? []);
        setHiringPrn(demand?.prn_open);
        setHiringReqs(requirements ?? {});
        setOriginalHiring({
          description: demand?.job_description ?? "",
          buckets: (demand?.coverage_buckets as Bucket[] | undefined) ?? [],
          prn: demand?.prn_open,
          reqs: requirements ?? {},
        });
      }
    } catch (err) {
      console.error("Failed to fetch provider:", err);
    } finally {
      setLoading(false);
    }
  }, [providerId, router]);

  useEffect(() => {
    fetchProvider();
  }, [fetchProvider]);

  // Dirty tracking
  const isDirty = useMemo(() => {
    for (const key of Object.keys(formData)) {
      if (formData[key] !== originalData[key]) return true;
    }
    return false;
  }, [formData, originalData]);

  // Warn on navigation when dirty
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // Close claim link modal on Escape key
  useEffect(() => {
    if (!showClaimLinkModal) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !sendingClaimLink) {
        setShowClaimLinkModal(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showClaimLinkModal, sendingClaimLink]);

  function updateField(field: string, value: unknown) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setSaveMessage(null);

    // Compute delta
    const delta: Record<string, unknown> = {};
    for (const key of Object.keys(formData)) {
      if (formData[key] !== originalData[key]) {
        delta[key] = formData[key];
      }
    }

    if (Object.keys(delta).length === 0) {
      setSaving(false);
      return;
    }

    const id = canonicalProviderId ?? providerId;
    try {
      const res = await fetch(`/api/admin/directory/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(delta),
      });

      if (res.ok) {
        setOriginalData({ ...formData });
        setSaveMessage({ type: "success", text: "Changes saved successfully." });
        setTimeout(() => setSaveMessage(null), 3000);
      } else {
        const err = await res.json();
        setSaveMessage({ type: "error", text: err.error || "Failed to save." });
      }
    } catch {
      setSaveMessage({ type: "error", text: "Network error. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  async function handleImageAction(action: string, imageUrl?: string, newType?: string) {
    setActionLoading(`${action}-${imageUrl || ""}`);
    const id = canonicalProviderId ?? providerId;
    try {
      const res = await fetch(`/api/admin/images/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, image_url: imageUrl, new_type: newType }),
      });
      if (res.ok) {
        // Refresh detail to get updated images
        const detailRes = await fetch(`/api/admin/directory/${id}`);
        if (detailRes.ok) {
          const data = await detailRes.json();
          const prevCount = images.length + rawImages.length;
          const newCount = (data.images?.length ?? 0) + (data.rawImages?.length ?? 0);
          setImages(data.images ?? []);
          setRawImages(data.rawImages ?? []);
          // Sync provider fields that image actions can change
          setFormData((prev) => ({
            ...prev,
            hero_image_url: data.provider.hero_image_url,
            provider_images: data.provider.provider_images,
            provider_logo: data.provider.provider_logo,
          }));
          setOriginalData((prev) => ({
            ...prev,
            hero_image_url: data.provider.hero_image_url,
            provider_images: data.provider.provider_images,
            provider_logo: data.provider.provider_logo,
          }));
          // Show feedback for delete actions
          if (action === "delete_image") {
            if (newCount < prevCount) {
              setSaveMessage({ type: "success", text: "Image deleted." });
            } else {
              setSaveMessage({ type: "error", text: "Delete sent but image count unchanged — check server logs." });
            }
            setTimeout(() => setSaveMessage(null), 3000);
          }
        }
      } else {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        console.error(`[handleImageAction] ${action} failed:`, res.status, err);
        setSaveMessage({ type: "error", text: err.error || `Image action failed (${res.status}).` });
        setTimeout(() => setSaveMessage(null), 6000);
      }
    } catch (err) {
      console.error("Image action failed:", err);
      setSaveMessage({ type: "error", text: "Network error during image action." });
      setTimeout(() => setSaveMessage(null), 4000);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleImageUpload(file: File) {
    setUploading(true);
    const id = canonicalProviderId ?? providerId;
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("providerId", id);

      const res = await fetch("/api/admin/directory/upload", {
        method: "POST",
        body,
      });

      if (res.ok) {
        // Refresh to show new image
        const detailRes = await fetch(`/api/admin/directory/${id}`);
        if (detailRes.ok) {
          const data = await detailRes.json();
          setFormData((prev) => ({ ...prev, provider_images: data.provider.provider_images }));
          setOriginalData((prev) => ({ ...prev, provider_images: data.provider.provider_images }));
          setImages(data.images ?? []);
          setRawImages(data.rawImages ?? []);
        }
        setSaveMessage({ type: "success", text: "Image uploaded successfully." });
        setTimeout(() => setSaveMessage(null), 3000);
      } else {
        const err = await res.json().catch(() => ({}));
        setSaveMessage({ type: "error", text: err.error || "Failed to upload image." });
      }
    } catch {
      setSaveMessage({ type: "error", text: "Network error uploading image." });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const isStaffDirty =
    staffName !== (originalStaff.name || "") ||
    staffPosition !== (originalStaff.position || "") ||
    staffBio !== (originalStaff.bio || "") ||
    staffCareMotivation !== (originalStaff.care_motivation || "") ||
    staffImage !== (originalStaff.image || "");

  const isHiringDirty =
    hiringDescription !== (originalHiring.description ?? "") ||
    JSON.stringify([...hiringBuckets].sort()) !== JSON.stringify([...(originalHiring.buckets ?? [])].sort()) ||
    hiringPrn !== originalHiring.prn ||
    JSON.stringify(hiringReqs) !== JSON.stringify(originalHiring.reqs ?? {});

  const toggleHiringBucket = (b: Bucket) =>
    setHiringBuckets((prev) => (prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]));
  const toggleHiringReq = (k: keyof MedjobsRequirements) =>
    setHiringReqs((prev) => ({ ...prev, [k]: !prev[k] }));

  async function handleSaveHiring() {
    setSavingHiring(true);
    setHiringMessage(null);
    const id = canonicalProviderId ?? providerId;
    try {
      const demand: Partial<DemandProfile> = {
        job_description: hiringDescription.trim() || undefined,
        coverage_buckets: hiringBuckets.length > 0 ? hiringBuckets : undefined,
        prn_open: hiringPrn,
      };
      const hasDemand = demand.job_description || (demand.coverage_buckets && demand.coverage_buckets.length > 0) || demand.prn_open;
      const hasReqs = Object.values(hiringReqs).some(Boolean);
      const res = await fetch(`/api/admin/directory/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          _hiring: {
            demand: hasDemand ? demand : undefined,
            requirements: hasReqs ? hiringReqs : undefined,
          },
        }),
      });
      if (res.ok) {
        setOriginalHiring({
          description: hiringDescription.trim(),
          buckets: hiringBuckets,
          prn: hiringPrn,
          reqs: hiringReqs,
        });
        setHiringMessage({ type: "success", text: "Hiring defaults saved." });
        setTimeout(() => setHiringMessage(null), 3000);
      } else {
        const err = await res.json();
        setHiringMessage({ type: "error", text: err.error || "Failed to save." });
      }
    } catch {
      setHiringMessage({ type: "error", text: "Network error." });
    } finally {
      setSavingHiring(false);
    }
  }

  async function handleConfirmSendClaimLink() {
    const id = canonicalProviderId ?? providerId;
    setSendingClaimLink(true);
    setSaveMessage(null);
    try {
      const res = await fetch("/api/admin/directory/send-claim-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: id }),
      });
      if (res.ok) {
        setClaimLinkSent(true);
        setShowClaimLinkModal(false);
        setSaveMessage({ type: "success", text: "Claim link sent successfully!" });
        setTimeout(() => setSaveMessage(null), 4000);
      } else {
        const err = await res.json().catch(() => ({}));
        setSaveMessage({ type: "error", text: err.error || "Failed to send claim link." });
        setShowClaimLinkModal(false);
      }
    } catch {
      setSaveMessage({ type: "error", text: "Network error. Please try again." });
      setShowClaimLinkModal(false);
    } finally {
      setSendingClaimLink(false);
    }
  }

  async function handleSaveStaff() {
    setSavingStaff(true);
    setStaffMessage(null);
    const id = canonicalProviderId ?? providerId;
    try {
      const staffData = {
        name: staffName.trim(),
        position: staffPosition.trim(),
        bio: staffBio.trim(),
        image: staffImage,
        care_motivation: staffCareMotivation.trim() || undefined,
      };
      const res = await fetch(`/api/admin/directory/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _staff: staffName.trim() ? staffData : null }),
      });
      if (res.ok) {
        setOriginalStaff({
          name: staffName.trim(),
          position: staffPosition.trim(),
          bio: staffBio.trim(),
          care_motivation: staffCareMotivation.trim(),
          image: staffImage,
        });
        setStaffMessage({ type: "success", text: "Owner info saved." });
        setTimeout(() => setStaffMessage(null), 3000);
      } else {
        const err = await res.json();
        setStaffMessage({ type: "error", text: err.error || "Failed to save." });
      }
    } catch {
      setStaffMessage({ type: "error", text: "Network error." });
    } finally {
      setSavingStaff(false);
    }
  }

  async function handleStaffPhotoUpload(file: File) {
    setUploadingStaffPhoto(true);
    const id = canonicalProviderId ?? providerId;
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("providerId", id);

      const res = await fetch("/api/admin/directory/upload", {
        method: "POST",
        body,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.imageUrl) setStaffImage(data.imageUrl);
        // Also refresh provider images
        const detailRes = await fetch(`/api/admin/directory/${id}`);
        if (detailRes.ok) {
          const detail = await detailRes.json();
          setImages(detail.images ?? []);
          setRawImages(detail.rawImages ?? []);
        }
      } else {
        setStaffMessage({ type: "error", text: "Failed to upload photo." });
      }
    } catch {
      setStaffMessage({ type: "error", text: "Network error uploading photo." });
    } finally {
      setUploadingStaffPhoto(false);
      if (staffFileRef.current) staffFileRef.current.value = "";
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-lg text-gray-500">Loading...</div>
      </div>
    );
  }

  if (source === "user-created") {
    // Lite mode for providers who self-registered via business_profiles without
    // claiming a scraped listing. The full editing surface assumes olera-providers
    // shape and isn't safe to render against a BP row. Comms timeline is the
    // load-bearing reason this page exists — user-created providers get emails
    // and produce activity events exactly like scraped ones.
    const bp = formData as Record<string, unknown>;
    const displayName = (bp.display_name as string) || "Provider";
    const bpSlug = typeof bp.slug === "string" ? bp.slug : null;
    const city = (bp.city as string) || null;
    const state = (bp.state as string) || null;
    const claimState = (bp.claim_state as string) || null;
    return (
      <div className="max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <Link
            href="/admin/directory"
            className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Directory
          </Link>
          {bpSlug && (
            <Link
              href={`/provider/${bpSlug}`}
              target="_blank"
              className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Open public page &rarr;
            </Link>
          )}
        </div>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">{displayName}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
              User-created
            </span>
            {claimState && (
              <Badge variant={claimState === "claimed" ? "verified" : "default"}>
                {claimState}
              </Badge>
            )}
            {(city || state) && (
              <span className="text-sm text-gray-600">
                {[city, state].filter(Boolean).join(", ")}
              </span>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 mb-6 text-sm text-amber-800">
          This provider self-registered without claiming a scraped listing. The full
          editing surface isn&apos;t available here yet — use{" "}
          <Link href="/admin/verification" className="font-medium underline">/admin/verification</Link>
          {" "}for claim review.
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Comms timeline</h2>
          <ProviderCommsTimeline providerId={canonicalProviderId ?? providerId} viewAllEmailsHref={`/admin/emails?provider_id=${canonicalProviderId ?? providerId}`} />
        </div>
      </div>
    );
  }

  const provider = formData as unknown as DirectoryProvider;

  return (
    <div className="max-w-4xl">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <Link
          href="/admin/directory"
          className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Directory
        </Link>
        <div className="flex items-center gap-3">
          {saveMessage && (
            <span className={`text-sm ${saveMessage.type === "success" ? "text-green-600" : "text-red-600"}`}>
              {saveMessage.text}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={!isDirty || saving}
            className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{provider.provider_name}</h1>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <Badge variant="default">{provider.provider_category}</Badge>
          <Badge variant={provider.deleted ? "rejected" : "verified"}>
            {provider.deleted ? "Deleted" : "Published"}
          </Badge>
          {isClaimed === true && (
            <Badge variant="verified">Claimed</Badge>
          )}
          {isClaimed === false && (
            <Badge variant="default">Unclaimed</Badge>
          )}
          {typeof formData.slug === "string" && (
            <Link
              href={`/provider/${formData.slug}`}
              target="_blank"
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              View Public Profile &rarr;
            </Link>
          )}
          {/* Send Claim Link button - only for unclaimed providers with email */}
          {isClaimed === false && !!formData.email && (
            claimLinkSent ? (
              <span className="px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Claim Link Sent
              </span>
            ) : (
              <button
                onClick={() => setShowClaimLinkModal(true)}
                className="px-3 py-1.5 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors"
              >
                Send Claim Link
              </button>
            )
          )}
        </div>
      </div>

      <div className="space-y-6">
        {/* Basic Info */}
        <Section title="Basic Info">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldInput label="Provider Name" value={formData.provider_name as string} onChange={(v) => updateField("provider_name", v)} />
            <Select
              label="Category"
              options={PROVIDER_CATEGORIES.map(cat => ({ value: cat, label: cat }))}
              value={(formData.provider_category as string) || ""}
              onChange={(val) => updateField("provider_category", val)}
              size="sm"
            />
            <Select
              label="Main Category"
              options={[
                { value: "", label: "Select..." },
                { value: "Home Care", label: "Home Care" },
                { value: "Senior Community", label: "Senior Community" },
              ]}
              value={(formData.main_category as string) || ""}
              onChange={(val) => updateField("main_category", val)}
              size="sm"
            />
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
            <textarea
              value={(formData.provider_description as string) || ""}
              onChange={(e) => updateField("provider_description", e.target.value)}
              rows={4}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            />
          </div>
        </Section>

        {/* Contact */}
        <Section title="Contact">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FieldInput label="Phone" value={formData.phone as string} onChange={(v) => updateField("phone", v)} />
            <FieldInput label="Email" value={formData.email as string} onChange={(v) => updateField("email", v)} />
            <FieldInput label="Website" value={formData.website as string} onChange={(v) => updateField("website", v)} />
          </div>
        </Section>

        {/* Location */}
        <Section title="Location">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <FieldInput label="Address" value={formData.address as string} onChange={(v) => updateField("address", v)} />
            </div>

            {/* Smart city selector */}
            <div className="space-y-1.5 relative" ref={cityDropdownRef}>
              <label className="block text-sm font-medium text-gray-700">City</label>
              <input
                type="text"
                value={showCityDropdown ? cityQuery : (formData.city as string) ?? ""}
                onChange={(e) => {
                  setCityQuery(e.target.value);
                  if (!showCityDropdown) setShowCityDropdown(true);
                }}
                onFocus={() => {
                  preloadCities();
                  setCityQuery((formData.city as string) ?? "");
                  setShowCityDropdown(true);
                }}
                placeholder="Search city or ZIP..."
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              />
              {showCityDropdown && cityResults.length > 0 && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {cityResults.map((result) => (
                    <button
                      key={result.full}
                      type="button"
                      onClick={() => {
                        updateField("city", result.city);
                        updateField("state", result.state);
                        setShowCityDropdown(false);
                        setCityQuery("");
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
                    >
                      {result.full}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <FieldInput label="State" value={formData.state as string} onChange={(v) => updateField("state", v)} />
            <FieldInput label="Zipcode" value={formData.zipcode as string} onChange={(v) => updateField("zipcode", v === "" ? null : Number(v))} type="number" />
            <FieldInput label="Latitude" value={formData.lat as string} onChange={(v) => updateField("lat", v === "" ? null : Number(v))} type="number" step="any" />
            <FieldInput label="Longitude" value={formData.lon as string} onChange={(v) => updateField("lon", v === "" ? null : Number(v))} type="number" step="any" />
            <GooglePlaceSearch
              value={(formData.place_id as string) || null}
              selectedName={(formData.provider_name as string) || null}
              onSelect={(placeId, name, rating) => {
                updateField("place_id", placeId);
                if (rating != null) updateField("google_rating", rating);
              }}
              onClear={() => {
                updateField("place_id", null);
              }}
            />
          </div>
        </Section>

        {/* Pricing */}
        <Section title="Pricing">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FieldInput label="Lower Price" value={formData.lower_price as string} onChange={(v) => updateField("lower_price", v === "" ? null : Number(v))} type="number" />
            <FieldInput label="Upper Price" value={formData.upper_price as string} onChange={(v) => updateField("upper_price", v === "" ? null : Number(v))} type="number" />
            <Select
              label="Contact for Price"
              options={[
                { value: "", label: "—" },
                { value: "True", label: "True" },
                { value: "False", label: "False" },
              ]}
              value={(formData.contact_for_price as string) ?? ""}
              onChange={(val) => updateField("contact_for_price", val || null)}
              size="sm"
            />
          </div>
        </Section>

        {/* Google Rating (read-only reference) */}
        <Section title="Google Rating">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <FieldInput label="Google Rating" value={formData.google_rating as string} onChange={(v) => updateField("google_rating", v === "" ? null : Number(v))} type="number" step="0.1" />
          </div>
          {/* The cached rating and review count the public page shows. A provider
              writing in "Olera shows 2 reviews, Google has 39" is fixed here. */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!formData.place_id || googleRefreshing}
              onClick={() => void refreshGoogleReviews(false)}
              className="px-3 py-1.5 text-sm font-medium rounded-md bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {googleRefreshing ? "Refreshing from Google..." : "Refresh reviews from Google"}
            </button>
            {googleRefreshResult && (
              <span className={`text-sm ${googleRefreshResult.ok ? "text-gray-700" : "text-red-700"}`}>
                {googleRefreshResult.text}
                {!googleRefreshResult.ok && googleRefreshResult.canForce && (
                  <button type="button" className="ml-2 underline" onClick={() => void refreshGoogleReviews(true)}>Refresh anyway</button>
                )}
              </span>
            )}
            {!formData.place_id && <span className="text-sm text-gray-500">Set a Google Place ID above first.</span>}
          </div>
        </Section>

        {/* Images */}
        <Section title="Images">
          {/* Hero image display */}
          {!!formData.hero_image_url && (
            <div className="mb-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Current Hero Image</p>
              <div className="w-48 h-32 rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
                <img
                  src={formData.hero_image_url as string}
                  alt="Hero"
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              </div>
            </div>
          )}

          <div className="mb-4">
            <FieldInput label="Provider Logo URL" value={formData.provider_logo as string} onChange={(v) => updateField("provider_logo", v || null)} />
          </div>

          {/* Image upload */}
          <div className="mb-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Upload Image</p>
            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(file);
                }}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-primary-400 hover:text-primary-600 transition-colors disabled:opacity-50"
              >
                {uploading ? "Uploading..." : "Choose file or drag here"}
              </button>
              <span className="text-xs text-gray-400">JPEG, PNG, or WebP. Max 5MB.</span>
            </div>
          </div>

          {/* Classified images */}
          {images.length > 0 && (
            <div className="mb-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {images.map((img) => (
                  <div key={img.id} className="relative group">
                    <div className={`aspect-square rounded-xl overflow-hidden bg-gray-100 shadow-sm transition-all duration-200 ${img.is_hero ? "ring-2 ring-yellow-400 ring-offset-2" : "hover:shadow-md"}`}>
                      {img.is_accessible ? (
                        <img
                          src={img.image_url}
                          alt=""
                          className={`w-full h-full ${img.image_type === "logo" ? "object-contain p-2" : "object-cover"}`}
                          onError={(e) => { (e.target as HTMLImageElement).className = "hidden"; }}
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-1.5">
                          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" /></svg>
                          <span className="text-[11px]">Unavailable</span>
                        </div>
                      )}

                      {/* Persistent badges */}
                      {img.is_hero && (
                        <div className="absolute top-1.5 left-1.5 bg-yellow-400 text-yellow-900 rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold shadow-sm" title="Hero image">
                          ★
                        </div>
                      )}

                      <div className="absolute top-1.5 right-1.5">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full backdrop-blur-sm ${img.image_type === "photo" ? "bg-white/80 text-gray-700" : img.image_type === "logo" ? "bg-orange-50/80 text-orange-700" : "bg-gray-100/80 text-gray-500"}`}>
                          {img.image_type}
                        </span>
                      </div>

                      {img.review_status === "admin_overridden" && (
                        <div className="absolute bottom-1.5 left-1.5 bg-purple-50/90 text-purple-600 text-[10px] px-1.5 py-0.5 rounded-full font-medium backdrop-blur-sm">
                          Overridden
                        </div>
                      )}

                      {/* Hover overlay with actions */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end justify-between p-2">
                        <div className="flex gap-1">
                          {!img.is_hero && img.is_accessible && (
                            <button
                              onClick={() => handleImageAction("set_hero", img.image_url)}
                              disabled={actionLoading !== null}
                              className="w-7 h-7 rounded-lg bg-white/90 hover:bg-white text-gray-700 flex items-center justify-center transition-colors disabled:opacity-50 shadow-sm"
                              title="Set as hero"
                            >
                              <span className="text-sm">★</span>
                            </button>
                          )}
                          {img.image_type !== "photo" && (
                            <button
                              onClick={() => handleImageAction("override_type", img.image_url, "photo")}
                              disabled={actionLoading !== null}
                              className="h-7 px-2 rounded-lg bg-white/90 hover:bg-white text-gray-700 text-[10px] font-medium flex items-center transition-colors disabled:opacity-50 shadow-sm"
                              title="Mark as photo"
                            >
                              Photo
                            </button>
                          )}
                          {img.image_type !== "logo" && (
                            <button
                              onClick={() => handleImageAction("override_type", img.image_url, "logo")}
                              disabled={actionLoading !== null}
                              className="h-7 px-2 rounded-lg bg-white/90 hover:bg-white text-gray-700 text-[10px] font-medium flex items-center transition-colors disabled:opacity-50 shadow-sm"
                              title="Mark as logo"
                            >
                              Logo
                            </button>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            if (window.confirm("Delete this image? This cannot be undone.")) {
                              handleImageAction("delete_image", img.image_url);
                            }
                          }}
                          disabled={actionLoading !== null}
                          className="w-7 h-7 rounded-lg bg-white/90 hover:bg-red-50 text-gray-500 hover:text-red-600 flex items-center justify-center transition-colors disabled:opacity-50 shadow-sm"
                          title="Delete image"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                        </button>
                      </div>
                    </div>

                    {/* Subtle metadata below */}
                    <div className="mt-1.5 text-[11px] text-gray-400 leading-tight">
                      <span>{img.classification_method} · {(img.classification_confidence * 100).toFixed(0)}%</span>
                      {img.width && img.height && <span> · {img.width}x{img.height}</span>}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100">
                <button
                  onClick={() => handleImageAction("mark_reviewed")}
                  disabled={actionLoading !== null}
                  className="px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
                >
                  Mark All Reviewed
                </button>
                {!!formData.hero_image_url && (
                  <button
                    onClick={() => handleImageAction("clear_hero")}
                    disabled={actionLoading !== null}
                    className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
                  >
                    Clear Hero
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Raw images fallback */}
          {images.length === 0 && rawImages.length > 0 && (
            <div>
              <p className="text-[11px] text-gray-400 mb-3">
                Unclassified images — run classification script for metadata.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {rawImages.map((url, i) => (
                  <div key={i} className="relative group">
                    <div className={`aspect-square rounded-xl overflow-hidden bg-gray-100 shadow-sm transition-all duration-200 ${formData.hero_image_url === url ? "ring-2 ring-yellow-400 ring-offset-2" : "hover:shadow-md"}`}>
                      <img
                        src={url}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const el = e.target as HTMLImageElement;
                          el.style.display = "none";
                          const parent = el.parentElement;
                          if (parent && !parent.querySelector(".img-fallback")) {
                            const fallback = document.createElement("div");
                            fallback.className = "img-fallback w-full h-full flex flex-col items-center justify-center text-gray-400 gap-1.5";
                            fallback.innerHTML = `<svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" /></svg><span class="text-[11px]">Unavailable</span>`;
                            parent.appendChild(fallback);
                          }
                        }}
                      />

                      {formData.hero_image_url === url && (
                        <div className="absolute top-1.5 left-1.5 bg-yellow-400 text-yellow-900 rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold shadow-sm" title="Hero image">
                          ★
                        </div>
                      )}

                      {/* Hover overlay with actions */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end justify-between p-2">
                        <div className="flex gap-1">
                          {formData.hero_image_url !== url && (
                            <button
                              onClick={() => handleImageAction("set_hero", url)}
                              disabled={actionLoading !== null}
                              className="w-7 h-7 rounded-lg bg-white/90 hover:bg-white text-gray-700 flex items-center justify-center transition-colors disabled:opacity-50 shadow-sm"
                              title="Set as hero"
                            >
                              <span className="text-sm">★</span>
                            </button>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            if (window.confirm("Delete this image? This cannot be undone.")) {
                              handleImageAction("delete_image", url);
                            }
                          }}
                          disabled={actionLoading !== null}
                          className="w-7 h-7 rounded-lg bg-white/90 hover:bg-red-50 text-gray-500 hover:text-red-600 flex items-center justify-center transition-colors disabled:opacity-50 shadow-sm"
                          title="Delete image"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {!!formData.hero_image_url && (
                <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100">
                  <button
                    onClick={() => handleImageAction("clear_hero")}
                    disabled={actionLoading !== null}
                    className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
                  >
                    Clear Hero
                  </button>
                </div>
              )}
            </div>
          )}

          {images.length === 0 && rawImages.length === 0 && (
            <p className="text-sm text-gray-500">No images found for this provider.</p>
          )}
        </Section>

        {/* Comms timeline — emails + on-site activity, interleaved */}
        <Section title="Comms timeline">
          <ProviderCommsTimeline providerId={canonicalProviderId ?? providerId} viewAllEmailsHref={`/admin/emails?provider_id=${canonicalProviderId ?? providerId}`} />
        </Section>

        {/* Facility Manager / Owner */}
        <Section title="Facility Manager">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldInput label="Full Name" value={staffName} onChange={setStaffName} />
            <FieldInput label="Title / Position" value={staffPosition} onChange={setStaffPosition} />
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Care Motivation</label>
            <textarea
              value={staffCareMotivation}
              onChange={(e) => setStaffCareMotivation(e.target.value)}
              rows={3}
              placeholder="Why did this person start this care home?"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            />
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Short Bio</label>
            <textarea
              value={staffBio}
              onChange={(e) => setStaffBio(e.target.value)}
              rows={2}
              placeholder="Background, credentials..."
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            />
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Photo</label>
            <div className="flex items-center gap-4">
              {staffImage ? (
                <img src={staffImage} alt="Owner" className="w-14 h-14 rounded-full object-cover" />
              ) : (
                <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-lg font-bold">
                  {staffName ? staffName.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) : "?"}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => staffFileRef.current?.click()}
                  disabled={uploadingStaffPhoto}
                  className="px-3 py-1.5 text-sm font-medium text-primary-600 border border-primary-300 rounded-lg hover:bg-primary-50 transition-colors disabled:opacity-50"
                >
                  {uploadingStaffPhoto ? "Uploading..." : staffImage ? "Change" : "Upload"}
                </button>
                {staffImage && (
                  <button
                    type="button"
                    onClick={() => setStaffImage("")}
                    className="px-3 py-1.5 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
              <input
                ref={staffFileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleStaffPhotoUpload(file);
                }}
                className="hidden"
              />
            </div>
          </div>
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
            <div>
              {staffMessage && (
                <span className={`text-sm ${staffMessage.type === "success" ? "text-green-600" : "text-red-600"}`}>
                  {staffMessage.text}
                </span>
              )}
            </div>
            <button
              onClick={handleSaveStaff}
              disabled={!isStaffDirty || savingStaff}
              className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {savingStaff ? "Saving..." : "Save Owner Info"}
            </button>
          </div>
        </Section>

        {/* Hiring Defaults (MedJobs) */}
        <Section title="Hiring Defaults (MedJobs)">
          <p className="text-sm text-gray-500 mb-4">
            Pre-fill interview invitations with these defaults. Students see full job details in their portal.
          </p>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Job Description</label>
            <textarea
              value={hiringDescription}
              onChange={(e) => setHiringDescription(e.target.value)}
              placeholder="Describe the role, responsibilities, and what you're looking for..."
              rows={3}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            />
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Shifts Hardest to Cover</label>
            <div className="flex flex-wrap gap-2">
              {COVERAGE_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => toggleHiringBucket(o.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    hiringBuckets.includes(o.value)
                      ? "bg-primary-50 border-primary-300 text-primary-700"
                      : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Open to PRN</label>
            <div className="flex flex-wrap gap-2">
              {PRN_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setHiringPrn(o.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    hiringPrn === o.value
                      ? "bg-primary-50 border-primary-300 text-primary-700"
                      : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Requirements</label>
            <div className="space-y-2">
              {REQUIREMENT_OPTIONS.map((o) => (
                <label key={o.key} className="flex items-center gap-3 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={!!hiringReqs[o.key]}
                    onChange={() => toggleHiringReq(o.key)}
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
            <div>
              {hiringMessage && (
                <span className={`text-sm ${hiringMessage.type === "success" ? "text-green-600" : "text-red-600"}`}>
                  {hiringMessage.text}
                </span>
              )}
            </div>
            <button
              onClick={handleSaveHiring}
              disabled={!isHiringDirty || savingHiring}
              className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {savingHiring ? "Saving..." : "Save Hiring Defaults"}
            </button>
          </div>
        </Section>

        {/* Danger Zone */}
        <div className={`rounded-xl border ${formData.deleted ? "border-amber-300 bg-amber-50" : "border-red-200 bg-red-50"} p-6`}>
          {formData.deleted ? (
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-amber-800">This provider is deleted</h2>
                <p className="text-sm text-amber-600 mt-1">
                  Deleted {formData.deleted_at ? new Date(formData.deleted_at as string).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""}. It is hidden from public search results.
                </p>
              </div>
              <button
                onClick={async () => {
                  setSaving(true);
                  const id = canonicalProviderId ?? providerId;
                  try {
                    const res = await fetch(`/api/admin/directory/${id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ deleted: false }),
                    });
                    if (res.ok) {
                      setFormData((prev) => ({ ...prev, deleted: false, deleted_at: null }));
                      setOriginalData((prev) => ({ ...prev, deleted: false, deleted_at: null }));
                      setSaveMessage({ type: "success", text: "Provider restored." });
                      setTimeout(() => setSaveMessage(null), 3000);
                    } else {
                      setSaveMessage({ type: "error", text: "Failed to restore provider." });
                    }
                  } catch {
                    setSaveMessage({ type: "error", text: "Network error." });
                  } finally {
                    setSaving(false);
                  }
                }}
                disabled={saving}
                className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
              >
                Restore Provider
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-red-800">Danger Zone</h2>
                <p className="text-sm text-red-600 mt-1">
                  Removing this provider will hide it from all public search results.
                </p>
              </div>
              <button
                onClick={async () => {
                  if (!confirm(`Are you sure you want to delete "${provider.provider_name}"? It will be hidden from public search.`)) return;
                  setSaving(true);
                  const id = canonicalProviderId ?? providerId;
                  try {
                    const res = await fetch(`/api/admin/directory/${id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ deleted: true }),
                    });
                    if (res.ok) {
                      const now = new Date().toISOString();
                      setFormData((prev) => ({ ...prev, deleted: true, deleted_at: now }));
                      setOriginalData((prev) => ({ ...prev, deleted: true, deleted_at: now }));
                      setSaveMessage({ type: "success", text: "Provider deleted." });
                      setTimeout(() => setSaveMessage(null), 3000);
                    } else {
                      setSaveMessage({ type: "error", text: "Failed to delete provider." });
                    }
                  } catch {
                    setSaveMessage({ type: "error", text: "Network error." });
                  } finally {
                    setSaving(false);
                  }
                }}
                disabled={saving}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                Delete Provider
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Bottom save bar */}
      {isDirty && (
        <div className="sticky bottom-0 bg-white border-t border-gray-200 py-4 mt-6 -mx-4 px-4 sm:-mx-6 sm:px-6 flex items-center justify-end gap-3">
          <span className="text-sm text-amber-600">You have unsaved changes</span>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      )}

      {/* Send Claim Link Confirmation Modal */}
      {showClaimLinkModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => !sendingClaimLink && setShowClaimLinkModal(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-gray-900">
              Send Claim Link
            </h2>
            <p className="text-sm text-gray-600 mt-2">
              You are about to send a claim link email to:
            </p>
            <div className="mt-3 px-4 py-3 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-sm font-medium text-gray-900">{provider.provider_name}</p>
              <p className="text-sm text-teal-600 font-mono mt-1">{formData.email as string}</p>
            </div>
            <p className="text-sm text-gray-500 mt-3">
              Please verify this is the correct email address. Sending to invalid emails affects our sender reputation.
            </p>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowClaimLinkModal(false)}
                disabled={sendingClaimLink}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSendClaimLink}
                disabled={sendingClaimLink}
                className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50"
              >
                {sendingClaimLink ? "Sending..." : "Confirm & Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">{title}</h2>
      {children}
    </div>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  type = "text",
  step,
}: {
  label: string;
  value: string | number | null | undefined;
  onChange: (val: string) => void;
  type?: string;
  step?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        step={step}
        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
      />
    </div>
  );
}
