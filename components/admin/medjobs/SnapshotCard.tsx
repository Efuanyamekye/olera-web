"use client";

/**
 * SnapshotCard — zone-3 of the unified drawer skeleton.
 *
 * Provider variant: the operational record for one provider's
 * outreach. Three sections, top to bottom:
 *
 *   1. Directory snapshot
 *      Read-only mirror of the canonical business_profiles record —
 *      address, public phone, public email, website, fax. Marks
 *      coverage with ✓/–. The 🔗 live-page link opens the public
 *      provider page in a new tab.
 *
 *   2. Outreach Contacts
 *      Multi-contact list. Each row: first/last name, title, role
 *      (Owner / Hiring Manager / General Inbox / etc.), email, phone,
 *      and a status toggle (active ↔ stale). The cadence pipeline
 *      reads every active contact with an email and sends to them —
 *      one contact per email address, multiple addresses per
 *      organization supported natively. Status='stale' excludes a
 *      contact from sends without deleting their history (operational
 *      memory preserved). Tagging a contact General Inbox vs Owner
 *      lets future template logic compose the salutation
 *      contextually (see lib/student-outreach/templates.ts).
 *
 *   3. Research notes
 *      Free-form text for context (source of contact info, agency
 *      character, anything the admin learned). Persists on blur
 *      via update_outreach.
 *
 * Collapse rule per the architecture spec:
 *   - stage = prospect → SnapshotCard mounted prominent (admin is
 *     filling gaps before launch).
 *   - any other stage → caller decides; common pattern is to mount
 *     inside a More Details collapse so it stays reachable but
 *     doesn't dominate the operational surface.
 *
 * Partner variant: ResearchSection / ResearchModePanel already serves
 * the equivalent role for stakeholders (stakeholder-type-aware
 * research checklist). Migration deferred — no concrete simplification
 * to pull from its existing surface.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { Contact, DrawerContext } from "@/lib/student-outreach/types";
import type { VerificationState } from "@/lib/student-outreach/verification-state";
import type { CadenceKey } from "@/lib/student-outreach/cadence";
import { OTHER, PROVIDER_CONTACT_ROLES } from "@/lib/student-outreach/presets";
import Select from "@/components/ui/Select";
import Input from "@/components/ui/Input";
import { PreFlightCallModal } from "@/components/admin/medjobs/PreFlightCallModal";
import { SpecificContactsSection } from "@/components/admin/medjobs/SpecificContactsSection";
import { ProviderPreFlightModal } from "@/components/admin/medjobs/ProviderPreFlightModal";
import { linkageFromResearchData } from "@/lib/medjobs/smartlead-inbox";
import { PreFlightReviewModal } from "@/app/admin/student-outreach/PreFlightReviewModal";

type ActionFn = (
  actionName: string,
  payload?: Record<string, unknown>,
  opts?: { silent?: boolean },
) => Promise<DrawerContext>;

interface Props {
  ctx: DrawerContext;
  action: ActionFn;
  setError: (msg: string | null) => void;
  /** v9.x Phase 2b: when mounted prominently pre-launch the drawer
   *  body passes the derived verification state so the Research Card
   *  can carry the Pre-Flight status indicator. Omitted post-launch
   *  (Snapshot lives inside More Details there). */
  verificationState?: VerificationState;
  /** v9.x Phase 2c: Pre-Flight launch gating + persistence hook so the
   *  Research Card footer can host Visit Website / Call to Confirm /
   *  Launch Outreach. Omitted post-launch — the footer hides. */
  launchEnabled?: boolean;
  launchDisabledReason?: string;
  beforeLaunch?: () => Promise<void>;
}

export function ProviderSnapshotCard({
  ctx,
  action,
  setError,
  verificationState,
  launchEnabled,
  launchDisabledReason,
  beforeLaunch,
}: Props) {
  const { outreach, provider_business_profile: bp } = ctx;
  const orgName = bp?.display_name || outreach.organization_name;
  const address = bp?.address || null;
  const cityState = [bp?.city, bp?.state].filter(Boolean).join(", ") || null;
  const website = bp?.website || null;
  const slug = bp?.slug || null;
  const livePagePath = slug ? `/provider/${slug}` : null;
  const isPreLaunch =
    outreach.status === "prospect" || outreach.status === "researched";

  // Pre-flight content lock. Once a real account owns the listing, its
  // directory content is sovereign: Business Name + General Contact render
  // read-only by default so an operator doesn't casually edit a claimed
  // provider's profile. An Edit override unlocks them to capture a better
  // contact found on a call — those edits persist to the outreach record only
  // (the backend never mirrors a claimed provider's data to the directory; see
  // update_general_contact + getProviderOwnership). Decision-maker targeting
  // stays editable (CRM-only). Outreach still launches in either state.
  const owned = Boolean(bp?.account_id);
  const [overrideEdit, setOverrideEdit] = useState(false);
  const editable = isPreLaunch && (!owned || overrideEdit);
  const claimTag = owned
    ? bp?.verification_state === "verified" ||
      bp?.verification_state === "not_required"
      ? "Claimed · verified"
      : "Claimed · unverified"
    : null;

  const activeContacts = useMemo(
    () => ctx.contacts.filter((c) => c.status === "active"),
    [ctx.contacts],
  );
  const inactiveContacts = useMemo(
    () => ctx.contacts.filter((c) => c.status !== "active"),
    [ctx.contacts],
  );

  const [notes, setNotes] = useState<string>(outreach.notes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);

  useEffect(() => {
    setNotes(outreach.notes ?? "");
  }, [outreach.id, outreach.notes]);

  const saveNotes = async () => {
    if (notes === (outreach.notes ?? "")) return;
    setSavingNotes(true);
    setError(null);
    try {
      await action("update_outreach", { notes });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save notes");
    } finally {
      setSavingNotes(false);
    }
  };

  // v9 final: contact-form banner. Whenever a contact_form_url is
  // on file AND no contact_form_submitted touchpoint exists yet,
  // surface a one-line banner asking admin to decide on the form.
  // Shows pre-launch (admin must resolve before Launch is enabled —
  // the pre-flight gate keys off this same touchpoint) and post-
  // launch (URL added later, or never resolved). Hides the moment
  // any outcome lands.
  const hasContactFormUrl = Boolean(
    (outreach.research_data?.general_contact?.contact_form_url ?? "").trim(),
  );
  const lastContactFormTp = ctx.touchpoints.find(
    (t) => t.touchpoint_type === "contact_form_submitted",
  );
  const showContactFormBanner = hasContactFormUrl && !lastContactFormTp;

  // v9.x Research progress — passive indicator. 7 fields counted: each
  // is resolved if filled OR marked unavailable OR (for Decision Maker)
  // has name/email/phone OR unavailable. Same predicate set Phase 0a
  // landed in NextStepCard; surfaced here too so the Research Card
  // can stand alone as the Pre-Flight surface once Phase 2e removes
  // the NextStepCard checklist.
  const gc = outreach.research_data?.general_contact ?? {};
  const bpRow = bp;
  const _effWebsite = gc.website !== undefined ? gc.website : bpRow?.website ?? null;
  const _effPhone = gc.phone !== undefined ? gc.phone : bpRow?.phone ?? null;
  const _effEmail = gc.email !== undefined ? gc.email : bpRow?.email ?? null;
  const _effStreet =
    gc.street !== undefined ? gc.street ?? "" : bpRow?.address ?? "";
  const _effCity = gc.city !== undefined ? gc.city ?? "" : bpRow?.city ?? "";
  const _effState = gc.state !== undefined ? gc.state ?? "" : bpRow?.state ?? "";
  const _effZip = gc.zip ?? bpRow?.zip ?? "";
  const _addressComplete = Boolean(
    _effStreet?.trim() &&
      _effCity?.trim() &&
      _effState?.trim() &&
      /^\d{5}(?:-\d{4})?$/.test(_effZip?.trim() ?? ""),
  );

  return (
    <section className="space-y-5 rounded-lg border border-gray-200 bg-white p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Research
          </p>
          {isPreLaunch && (
            <p className="mt-0.5 text-sm text-gray-600">
              Check the info, call to confirm, then launch outreach.
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs">
          {livePagePath && (
            <a
              href={livePagePath}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary-700 hover:underline"
            >
              🔗 Open live page →
            </a>
          )}
        </div>
      </header>

      {/* Claimed-provider lock banner. The provider owns this listing, so its
          content is read-only by default; Edit captures a better outreach
          contact (saved to the outreach record only — never the public page). */}
      {owned && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-amber-900">
              🔒 {claimTag} — owned by the provider
            </p>
            <p className="mt-0.5 text-[11px] text-amber-800">
              Fields are read-only; edits update our outreach contact only and
              never change the provider&apos;s public page.
            </p>
          </div>
          {isPreLaunch && (
            <button
              type="button"
              onClick={() => setOverrideEdit((v) => !v)}
              className="shrink-0 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100"
            >
              {overrideEdit ? "Done editing" : "Edit"}
            </button>
          )}
        </div>
      )}

      {/* ── 0. Business Name ───────────────────────────────────────
          Editable canonical name. Materialized from business_profiles
          but the directory data can be stale; admin needs to fix it
          during pre-flight so outreach + Smartlead campaign carry
          the right brand. */}
      <BusinessNameSection
        ctx={ctx}
        action={action}
        setError={setError}
        editable={editable}
      />

      {/* ── 1. General Contact ─────────────────────────────────────
          Organization-level fallback contact info (front desk /
          info@ / contact form). Edits write to research_data.
          general_contact ONLY — never to student_outreach_contacts.
          Strict separation from Specific Contacts per user spec. */}
      <GeneralContactSection
        ctx={ctx}
        action={action}
        setError={setError}
        editable={editable}
        lastContactFormOutcome={
          (lastContactFormTp?.payload as Record<string, unknown> | null)
            ?.outcome as string | undefined
        }
      />

      {/* v9.x Phase 2d: contact-form banner lives directly under
          the General Contact section (whose final row is the
          Contact Form URL field) so the decision sits next to the
          field that triggered it. Renders pre-launch AND post-
          launch — whenever a URL is on file and no
          contact_form_submitted touchpoint exists yet. Hides the
          moment any outcome lands. */}
      {showContactFormBanner && (
        <ContactFormBanner
          url={
            outreach.research_data?.general_contact?.contact_form_url ?? ""
          }
          action={action}
          setError={setError}
          campusName={ctx.campus?.name ?? null}
          specificContactName={(() => {
            const first = activeContacts[0];
            if (!first) return null;
            const named = [first.first_name, first.last_name]
              .filter(Boolean)
              .join(" ")
              .trim();
            return named || first.name || null;
          })()}
        />
      )}

      {/* ── 2. Decision Maker ───────────────────────────────────────
          v9.x single-slot named recipient. Replaces the multi-contact
          UI for new rows. Stored in research_data.decision_maker;
          surfaces in the Smartlead fan-out as the named recipient
          alongside the General Contact. */}
      {/* Decision makers — the SAME shared component the Partner drawer uses
          for Advisors. Stored in research_data.decision_makers; materialized
          into recipients at launch (ResearchActionFooter). */}
      <SpecificContactsSection
        ctx={ctx}
        action={action}
        setError={setError}
        researchKey="decision_makers"
        title="Decision makers"
        primaryRoleLabel="Decision maker"
        addLabel="Add decision maker"
        helpText="People at this agency. Anyone with an email becomes a selectable recipient at launch, alongside the general contact."
      />

      {/* ── 4. Verification ───────────────────────────────────────
          v9.x Phase 2b: passive Pre-Flight status indicator. The
          call modal still drives the actual unlock — this section
          mirrors the resulting state so admin sees whether Launch
          will fire without scrolling back to the Next Step card.
          Pre-launch only; post-launch the status no longer matters
          (outreach is in flight). The separate Verification card was removed —
          the Launch button enabling after Call to Confirm already conveys it. */}

      {/* ── 5. Pre-Flight action footer ────────────────────────────
          v9.x Phase 2c: action affordances live inside the Research
          Card so admin can finish Pre-Flight without leaving the
          card. Visit Website opens the provider site for research;
          Call to Confirm opens the Pre-Flight outcome modal;
          Launch Outreach kicks off the cadence. Pre-launch only —
          the footer collapses post-launch when the Snapshot moves
          into More Details. */}
      {isPreLaunch && verificationState && (
        <ResearchActionFooter
          ctx={ctx}
          action={action}
          setError={setError}
          verificationState={verificationState}
          launchEnabled={launchEnabled ?? false}
          launchDisabledReason={launchDisabledReason}
          beforeLaunch={beforeLaunch}
        />
      )}

      {/* ── 6. Research notes ─────────────────────────────────────── */}
      {/* Notes sit BELOW the workflow (call to confirm + launch) so they
          don't interrupt the main path — matches the Partner drawer. */}
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          Research notes
        </p>
        <Input
          as="textarea"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          placeholder="Source of contact info, agency character, hiring activity, anything else worth remembering."
          rows={3}
          size="sm"
        />
        {savingNotes && <p className="mt-0.5 text-[11px] text-gray-400">Saving…</p>}
      </div>
    </section>
  );
}

// ── General Contact section ─────────────────────────────────────────────

/**
 * v9 final: General Contact section — organization-level fallback
 * contact info. Lives at the outreach row (not in
 * student_outreach_contacts). Edits write to research_data.
 * general_contact via the update_general_contact action; never
 * touches student_outreach_contacts.
 *
 * Display values are effective overrides (research_data.general_
 * contact.<field>) when present, else fall back to the business_
 * profiles directory record. Address is read-only — it's a physical
 * location, not a channel.
 */
function GeneralContactSection({
  ctx,
  action,
  setError,
  editable,
  lastContactFormOutcome,
}: {
  ctx: DrawerContext;
  action: ActionFn;
  setError: (msg: string | null) => void;
  editable: boolean;
  /** v9 final: when a contact_form_submitted touchpoint exists,
   *  show the latest outcome as a small chip next to the Contact
   *  Form field so admin sees the decision at a glance. */
  lastContactFormOutcome?: string;
}) {
  const bp = ctx.provider_business_profile;
  const research = (ctx.outreach.research_data ?? {}) as Record<string, unknown>;
  const overrides = (research.general_contact ?? {}) as {
    email?: string | null;
    phone?: string | null;
    fax?: string | null;
    contact_form_url?: string | null;
    website?: string | null;
    street?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
  };

  // Effective values: per-outreach override OR directory fallback.
  // The structured address slots (street/city/state) each fall back
  // to the matching bp column; ZIP has no bp fallback since
  // business_profiles doesn't store ZIP.
  const effective = useMemo(
    () => ({
      email: overrides.email ?? bp?.email ?? "",
      phone: overrides.phone ?? bp?.phone ?? "",
      fax: overrides.fax ?? "",
      contact_form_url: overrides.contact_form_url ?? "",
      website: overrides.website ?? bp?.website ?? "",
      street: overrides.street ?? bp?.address ?? "",
      city: overrides.city ?? bp?.city ?? "",
      state: overrides.state ?? bp?.state ?? "",
      // v9 final: ZIP falls back to bp.zip — the directory has a ZIP
      // column even though earlier code paths ignored it. Drops the
      // "must save an override before it's snail-mail ready" friction
      // when the bp record already carries the ZIP.
      zip: overrides.zip ?? bp?.zip ?? "",
    }),
    [
      overrides,
      bp?.email,
      bp?.phone,
      bp?.website,
      bp?.address,
      bp?.city,
      bp?.state,
      bp?.zip,
    ],
  );

  const [email, setEmail] = useState(effective.email);
  const [phone, setPhone] = useState(effective.phone);
  const [fax, setFax] = useState(effective.fax);
  const [contactFormUrl, setContactFormUrl] = useState(effective.contact_form_url);
  const [website, setWebsite] = useState(effective.website);
  const [street, setStreet] = useState(effective.street);
  const [city, setCity] = useState(effective.city);
  const [stateField, setStateField] = useState(effective.state);
  const [zip, setZip] = useState(effective.zip);
  const [saving, setSaving] = useState<string | null>(null);
  // v9 final: surface explicit save state at the section header so
  // admin sees "Saving…" → "Saved" feedback after every blur. The
  // earlier autosave was silent except for tiny per-field text.
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // v9.x Find-from-website enrichment (TJ). Per-row "Find email" /
  // "Find contact form" buttons + a header "✦ Auto-fill from website"
  // pill that hit /api/admin/medjobs/enrich-contact (read-only website
  // scrape + Perplexity fallback). Feedback stays INLINE under each
  // field — never the drawer-level setError, which blanks the panel.
  // v9.x Fill-from-Website state. `finding` tracks the in-flight mode;
  // `findNote` carries per-field miss/error feedback; the `pulse*` flags
  // briefly flash a primary ring on the input that just got auto-filled.
  // Mode "all" runs every finder in parallel via the route's "all" mode.
  type FindField = "email" | "contact_form" | "phone" | "fax" | "address";
  type FindMode = FindField | "both" | "all";
  const [finding, setFinding] = useState<null | FindMode>(null);
  const [findNote, setFindNote] = useState<
    Partial<Record<FindField, { kind: "miss" | "error"; text: string }>>
  >({});
  const [pulseEmail, setPulseEmail] = useState(false);
  const [pulseForm, setPulseForm] = useState(false);
  const [pulsePhone, setPulsePhone] = useState(false);
  const [pulseFax, setPulseFax] = useState(false);
  const [pulseAddress, setPulseAddress] = useState(false);

  useEffect(() => {
    setEmail(effective.email);
    setPhone(effective.phone);
    setFax(effective.fax);
    setContactFormUrl(effective.contact_form_url);
    setWebsite(effective.website);
    setStreet(effective.street);
    setCity(effective.city);
    setStateField(effective.state);
    setZip(effective.zip);
  }, [
    effective.email,
    effective.phone,
    effective.fax,
    effective.contact_form_url,
    effective.website,
    effective.street,
    effective.city,
    effective.state,
    effective.zip,
  ]);

  // Snail-mail readiness: street + city + state + valid ZIP.
  const hasZip = /^\d{5}(?:-\d{4})?$/.test(zip.trim());
  const addressComplete = Boolean(
    street.trim() && city.trim() && stateField.trim() && hasZip,
  );
  const composedAddress =
    [street, [city, stateField].filter(Boolean).join(", "), zip]
      .filter((s) => s && s.trim())
      .join(" · ");

  const gcOverrides = ctx.outreach.research_data?.general_contact ?? {};
  const faxUnavailable = gcOverrides.fax_unavailable === true;
  const contactFormUnavailable = gcOverrides.contact_form_unavailable === true;
  const websiteUnavailable = gcOverrides.website_unavailable === true;
  const phoneUnavailable = gcOverrides.phone_unavailable === true;
  const emailUnavailable = gcOverrides.email_unavailable === true;
  const addressUnavailable = gcOverrides.address_unavailable === true;

  const toggleUnavailable = async (
    field:
      | "fax_unavailable"
      | "contact_form_unavailable"
      | "website_unavailable"
      | "phone_unavailable"
      | "email_unavailable"
      | "address_unavailable",
    next: boolean,
  ) => {
    setSaving(field);
    setError(null);
    try {
      await action("update_general_contact", { [field]: next });
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update field");
    } finally {
      setSaving(null);
    }
  };

  const saveField = async (
    field:
      | "email"
      | "phone"
      | "fax"
      | "contact_form_url"
      | "website"
      | "street"
      | "city"
      | "state"
      | "zip",
    value: string,
  ) => {
    const directoryFallback =
      field === "email"
        ? bp?.email ?? ""
        : field === "phone"
          ? bp?.phone ?? ""
          : field === "website"
            ? bp?.website ?? ""
            : field === "street"
              ? bp?.address ?? ""
              : field === "city"
                ? bp?.city ?? ""
                : field === "state"
                  ? bp?.state ?? ""
                  : "";
    const trimmed = value.trim();
    const wasEffective =
      overrides[field] !== undefined && overrides[field] !== null
        ? overrides[field]
        : directoryFallback;
    if (trimmed === (wasEffective ?? "")) return;
    setSaving(field);
    setError(null);
    try {
      // During the on-open auto-fill, write silently so the parent In Basket
      // isn't refreshed (which would race mark_read and re-bold the row).
      // Manual edits keep the normal path.
      await action(
        "update_general_contact",
        { [field]: trimmed === "" ? null : trimmed },
        { silent: autoFillingRef.current },
      );
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(null);
    }
  };

  // v9.x Find-from-website enrichment helpers. The route's "all" mode
  // returns every finder's result in parallel; the apply* helpers
  // each handle one field's success/miss path (fill + save + flash on
  // hit, calm note on miss).
  const setNoteFor = (
    field: FindField,
    n: { kind: "miss" | "error"; text: string } | null,
  ) => setFindNote((prev) => ({ ...prev, [field]: n ?? undefined }));
  const flash = (field: FindField) => {
    const set =
      field === "email"
        ? setPulseEmail
        : field === "contact_form"
          ? setPulseForm
          : field === "phone"
            ? setPulsePhone
            : field === "fax"
              ? setPulseFax
              : setPulseAddress;
    set(true);
    setTimeout(() => set(false), 1200);
  };
  // Persist a discovered website as the source of record — only when none is
  // already on file (the route only discovers in that case anyway).
  const applyWebsite = async (value: string | null) => {
    if (!value || (website ?? "").trim()) return;
    setWebsite(value);
    await saveField("website", value);
  };
  // blanksOnly (auto-fill): never overwrite a value already on file (e.g. the
  // directory's email/phone) — only populate empty fields.
  const applyEmail = async (value: string | null, blanksOnly = false) => {
    if (blanksOnly && (email ?? "").trim()) return;
    if (value) {
      setEmail(value);
      setNoteFor("email", null);
      flash("email");
      await saveField("email", value);
    } else {
      setNoteFor("email", { kind: "miss", text: "No email on the site." });
    }
  };
  const applyForm = async (value: string | null, blanksOnly = false) => {
    if (blanksOnly && (contactFormUrl ?? "").trim()) return;
    if (value) {
      setContactFormUrl(value);
      setNoteFor("contact_form", null);
      flash("contact_form");
      await saveField("contact_form_url", value);
    } else {
      setNoteFor("contact_form", { kind: "miss", text: "No contact form on the site." });
    }
  };
  const applyPhone = async (value: string | null, blanksOnly = false) => {
    if (blanksOnly && (phone ?? "").trim()) return;
    if (value) {
      setPhone(value);
      setNoteFor("phone", null);
      flash("phone");
      await saveField("phone", value);
    } else {
      setNoteFor("phone", { kind: "miss", text: "No phone on the site." });
    }
  };
  const applyFax = async (value: string | null, blanksOnly = false) => {
    if (blanksOnly && (fax ?? "").trim()) return;
    if (value) {
      setFax(value);
      setNoteFor("fax", null);
      flash("fax");
      await saveField("fax", value);
    } else {
      setNoteFor("fax", { kind: "miss", text: "No fax on the site." });
    }
  };
  // Address is multi-part: each component saves independently so admin can
  // edit any incorrect part without re-typing the rest. A hit means at
  // least one part came back; we apply whatever we have (blanks-only skips
  // any part already filled).
  const applyAddress = async (
    parts: {
      street: string | null;
      city: string | null;
      state: string | null;
      zip: string | null;
    },
    blanksOnly = false,
  ) => {
    const { street: s, city: c, state: st, zip: z } = parts;
    if (s || c || st || z) {
      setNoteFor("address", null);
      flash("address");
      if (s && !(blanksOnly && (street ?? "").trim())) {
        setStreet(s);
        await saveField("street", s);
      }
      if (c && !(blanksOnly && (city ?? "").trim())) {
        setCity(c);
        await saveField("city", c);
      }
      if (st && !(blanksOnly && (stateField ?? "").trim())) {
        setStateField(st);
        await saveField("state", st);
      }
      if (z && !(blanksOnly && (zip ?? "").trim())) {
        setZip(z);
        await saveField("zip", z);
      }
    } else {
      setNoteFor("address", { kind: "miss", text: "No address on the site." });
    }
  };
  const findContact = async (mode: FindMode, fillBlanksOnly = false) => {
    setFinding(mode);
    // Clear stale notes for any field this lookup will touch.
    const touched: FindField[] =
      mode === "all"
        ? ["email", "contact_form", "phone", "fax", "address"]
        : mode === "both"
          ? ["email", "contact_form"]
          : [mode];
    for (const f of touched) setNoteFor(f, null);
    try {
      const res = await fetch("/api/admin/medjobs/enrich-contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outreachId: ctx.outreach.id, mode }),
      });
      const data = (await res.json()) as {
        value?: string | null;
        website?: { value: string | null };
        email?: { value: string | null };
        contactForm?: { value: string | null };
        phone?: { value: string | null };
        fax?: { value: string | null };
        address?: {
          street: string | null;
          city: string | null;
          state: string | null;
          zip: string | null;
        };
        // Single-field address responses come back flat.
        street?: string | null;
        city?: string | null;
        state?: string | null;
        zip?: string | null;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Lookup failed");
      if (mode === "all") {
        await applyWebsite(data.website?.value ?? null);
        await applyEmail(data.email?.value ?? null, fillBlanksOnly);
        await applyForm(data.contactForm?.value ?? null, fillBlanksOnly);
        await applyPhone(data.phone?.value ?? null, fillBlanksOnly);
        await applyFax(data.fax?.value ?? null, fillBlanksOnly);
        await applyAddress(
          {
            street: data.address?.street ?? null,
            city: data.address?.city ?? null,
            state: data.address?.state ?? null,
            zip: data.address?.zip ?? null,
          },
          fillBlanksOnly,
        );
      } else if (mode === "both") {
        await applyEmail(data.email?.value ?? null);
        await applyForm(data.contactForm?.value ?? null);
      } else if (mode === "email") {
        await applyEmail(data.value ?? null);
      } else if (mode === "contact_form") {
        await applyForm(data.value ?? null);
      } else if (mode === "phone") {
        await applyPhone(data.value ?? null);
      } else if (mode === "fax") {
        await applyFax(data.value ?? null);
      } else if (mode === "address") {
        await applyAddress({
          street: data.street ?? null,
          city: data.city ?? null,
          state: data.state ?? null,
          zip: data.zip ?? null,
        });
      }
    } catch (e) {
      const text = e instanceof Error ? e.message : "Lookup failed";
      for (const f of touched) setNoteFor(f, { kind: "error", text });
    } finally {
      setFinding(null);
    }
  };

  // Task 2: auto-run "Fill from Website" the FIRST time a provider prospect
  // drawer opens — saves a click and overlaps the lookup with the admin's
  // reading. Fires once ever: gated on (a) provider rows, (b) nothing filled
  // yet, and (c) no prior auto-fill marker. The marker (research_data
  // .provider_autofill_at, written via the merge-any update_research action)
  // guarantees an empty result never re-fires on a later open. The button
  // stays for manual re-runs.
  const alreadyAutoFilled = Boolean(
    (ctx.outreach.research_data as { provider_autofill_at?: string } | null)
      ?.provider_autofill_at,
  );
  // Run on first open even when the directory already gave us email/phone — the
  // enrichment fills the GAPS (contact form, fax, address, a missing email)
  // from the website, blanks-only, so directory data is never overwritten. The
  // marker is the only "once" guard.
  const canAutoFill =
    editable && ctx.outreach.kind === "provider" && !alreadyAutoFilled;
  const autoFillRan = useRef(false);
  // True only while the on-open auto-fill is writing. saveField reads this to
  // persist silently (no parent list refresh) during the auto-fill window,
  // so opening a card never resurrects its unread/bold state. Manual edits,
  // which happen outside this window, keep the normal refreshing path.
  const autoFillingRef = useRef(false);
  useEffect(() => {
    if (autoFillRan.current || !canAutoFill) return;
    autoFillRan.current = true;
    void (async () => {
      // The route discovers a website (Google Places) when none is on file, so
      // this pre-fills on EVERY first open — source link or not. Blanks-only, so
      // existing values are never overwritten. Stamp "done" once afterward.
      autoFillingRef.current = true;
      try {
        await findContact("all", true);
        try {
          await action(
            "update_research",
            { research: { provider_autofill_at: new Date().toISOString() } },
            { silent: true },
          );
        } catch {
          /* marker is best-effort; the ref still prevents a re-run this session */
        }
      } finally {
        autoFillingRef.current = false;
      }
    })();
    // findContact/action are stable for our purposes; the ref guard makes any
    // re-run inert, so we only need to react to canAutoFill flipping true.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAutoFill]);

  const websiteHref = website
    ? website.startsWith("http")
      ? website
      : `https://${website}`
    : null;
  // Show the header "Auto-fill from website" pill when there's a website
  // AND at least one fillable field is missing (and not explicitly marked
  // unavailable — admin already made a decision there). Now covers every
  // field the route's "all" mode can fill: email, contact_form, phone,
  // fax, address.
  const showAutofill =
    editable &&
    Boolean(website) &&
    (
      (!email && !emailUnavailable) ||
      (!contactFormUrl && !contactFormUnavailable) ||
      (!phone && !phoneUnavailable) ||
      (!fax && !faxUnavailable) ||
      (!addressComplete && !addressUnavailable)
    );

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          General Contact
        </p>
        <div className="flex items-center gap-2">
          {websiteHref && (
            <a
              href={websiteHref}
              target="_blank"
              rel="noopener noreferrer"
              title="Open the website / research source"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary-600 hover:underline"
            >
              🌐 source ↗
            </a>
          )}
          {showAutofill && (
            <button
              type="button"
              onClick={() => findContact("all")}
              disabled={finding !== null}
              className="inline-flex items-center gap-1 rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1 text-[11px] font-medium text-primary-700 transition-colors hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {finding === "all" ? (
                <>
                  <Spinner /> Searching…
                </>
              ) : (
                <>✦ Fill from Website</>
              )}
            </button>
          )}
          <SaveStatusBadge saving={saving} savedAt={savedAt} />
        </div>
      </div>
      {/* Website moved to the green "source" link by the Business Name. */}
      <dl className="grid grid-cols-[16px_88px_1fr] gap-x-3 gap-y-1.5 text-sm">
        <CoverageRow
          checked={Boolean(phone) || phoneUnavailable}
          label="Phone"
        >
          {editable ? (
            <div className="space-y-1.5">
              <div
                className={`rounded-lg transition-shadow duration-700 ${
                  pulsePhone ? "ring-2 ring-primary-400" : "ring-0"
                }`}
              >
                <Input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onBlur={() => saveField("phone", phone)}
                  placeholder="(555) 123-4567"
                  size="sm"
                />
              </div>
            </div>
          ) : phoneUnavailable ? (
            <span className="text-gray-500">Marked not available</span>
          ) : phone ? (
            <a href={`tel:${phone}`} className="block truncate text-primary-700 hover:underline">
              {phone}
            </a>
          ) : (
            <span className="text-gray-400">Not on file</span>
          )}
        </CoverageRow>
        <CoverageRow
          checked={Boolean(email) || emailUnavailable}
          label="Email"
        >
          {editable ? (
            <div className="space-y-1.5">
              <div
                className={`rounded-lg transition-shadow duration-700 ${
                  pulseEmail ? "ring-2 ring-primary-400" : "ring-0"
                }`}
              >
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => saveField("email", email)}
                  placeholder="info@agency.com"
                  size="sm"
                />
              </div>
            </div>
          ) : emailUnavailable ? (
            <span className="text-gray-500">Marked not available</span>
          ) : (
            <span className="block truncate text-gray-700">
              {email || <span className="text-gray-400">Not on file</span>}
            </span>
          )}
        </CoverageRow>
        <CoverageRow
          checked={addressComplete || addressUnavailable}
          label="Address"
        >
          {editable ? (
            <div className="space-y-1.5">
              <div
                className={`rounded-lg transition-shadow duration-700 ${
                  pulseAddress ? "ring-2 ring-primary-400" : "ring-0"
                }`}
              >
                <Input
                  type="text"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  onBlur={() => saveField("street", street)}
                  placeholder="Street + suite"
                  disabled={addressUnavailable}
                  size="sm"
                />
                <div className="mt-1 grid grid-cols-[1fr_56px_88px] gap-1">
                  <Input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    onBlur={() => saveField("city", city)}
                    placeholder="City"
                    disabled={addressUnavailable}
                    size="sm"
                  />
                  <Input
                    type="text"
                    value={stateField}
                    onChange={(e) => setStateField(e.target.value.toUpperCase())}
                    onBlur={() => saveField("state", stateField)}
                    placeholder="ST"
                    maxLength={2}
                    disabled={addressUnavailable}
                    size="sm"
                    className="uppercase"
                  />
                  <Input
                    type="text"
                    value={zip}
                    onChange={(e) => setZip(e.target.value)}
                    onBlur={() => saveField("zip", zip)}
                    placeholder="ZIP"
                    disabled={addressUnavailable}
                    size="sm"
                  />
                </div>
              </div>
            </div>
          ) : addressUnavailable ? (
            <span className="text-gray-500">Marked not available</span>
          ) : composedAddress ? (
            <span className="block truncate text-gray-700">
              {composedAddress}
            </span>
          ) : (
            <span className="text-gray-400">Not on file</span>
          )}
        </CoverageRow>
        <CoverageRow checked={Boolean(fax) || faxUnavailable} label="Fax">
          {editable ? (
            <div className="space-y-1.5">
              <div
                className={`rounded-lg transition-shadow duration-700 ${
                  pulseFax ? "ring-2 ring-primary-400" : "ring-0"
                }`}
              >
                <Input
                  type="tel"
                  value={fax}
                  onChange={(e) => setFax(e.target.value)}
                  onBlur={() => saveField("fax", fax)}
                  placeholder="(555) 123-9999"
                  size="sm"
                />
              </div>
            </div>
          ) : faxUnavailable ? (
            <span className="text-gray-500">Marked not available</span>
          ) : (
            <span className="block truncate text-gray-700">
              {fax || <span className="text-gray-400">Not on file · coming soon</span>}
            </span>
          )}
        </CoverageRow>
        <CoverageRow
          checked={Boolean(contactFormUrl) || contactFormUnavailable}
          label="Contact form"
        >
          {editable ? (
            <div className="space-y-1.5">
              <div
                className={`rounded-lg transition-shadow duration-700 ${
                  pulseForm ? "ring-2 ring-primary-400" : "ring-0"
                }`}
              >
                <Input
                  type="url"
                  value={contactFormUrl}
                  onChange={(e) => setContactFormUrl(e.target.value)}
                  onBlur={() => saveField("contact_form_url", contactFormUrl)}
                  placeholder="https://agency.com/contact"
                  size="sm"
                />
              </div>
            </div>
          ) : contactFormUnavailable ? (
            <span className="text-gray-500">Marked not available</span>
          ) : contactFormUrl ? (
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={contactFormUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block truncate text-primary-700 hover:underline"
              >
                {contactFormUrl}
              </a>
              {lastContactFormOutcome && (
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    lastContactFormOutcome === "submitted"
                      ? "bg-primary-50 text-primary-700"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {lastContactFormOutcome === "not_available"
                    ? "Not available"
                    : lastContactFormOutcome.charAt(0).toUpperCase() +
                      lastContactFormOutcome.slice(1)}
                </span>
              )}
            </div>
          ) : (
            <span className="text-gray-400">Not on file</span>
          )}
        </CoverageRow>
      </dl>
    </div>
  );
}

/**
 * v9 final: explicit save state. Three modes:
 *   saving=field     → "Saving…"
 *   savedAt recent   → "Saved · just now"  (≤ 3s)
 *   savedAt older    → hidden (signal stops being noise)
 * Mounted in the General Contact header so the cue lives next to
 * what's being saved, not buried below.
 */
function SaveStatusBadge({
  saving,
  savedAt,
}: {
  saving: string | null;
  savedAt: number | null;
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!savedAt || saving) return;
    const t = setTimeout(() => setTick((x) => x + 1), 3000);
    return () => clearTimeout(t);
  }, [savedAt, saving]);
  if (saving) {
    return (
      <span className="text-[11px] font-medium text-gray-500">Saving…</span>
    );
  }
  if (savedAt && Date.now() - savedAt < 3000) {
    return (
      <span className="text-[11px] font-medium text-primary-700">
        ✓ Saved
      </span>
    );
  }
  return null;
}

// ── Business Name section ──────────────────────────────────────────────

/**
 * v9.x editable canonical Business Name. Sits at the top of the Research
 * Card. Directory data (business_profiles.display_name) can be stale or
 * wrong; admin needs to correct it during pre-flight so outreach,
 * snapshots, and the Smartlead campaign carry the right brand.
 */
function BusinessNameSection({
  ctx,
  action,
  setError,
  editable,
}: {
  ctx: DrawerContext;
  action: (
    actionName: string,
    payload?: Record<string, unknown>,
  ) => Promise<DrawerContext>;
  setError: (msg: string | null) => void;
  editable: boolean;
}) {
  const [name, setName] = useState(ctx.outreach.organization_name);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(ctx.outreach.organization_name);
  }, [ctx.outreach.organization_name]);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === ctx.outreach.organization_name) return;
    setSaving(true);
    setError(null);
    try {
      await action("update_organization_name", { organization_name: trimmed });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save business name");
    } finally {
      setSaving(false);
    }
  };

  const sourceUrl =
    ctx.outreach.research_data?.general_contact?.website ||
    ctx.provider_business_profile?.website ||
    null;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          Business Name
        </p>
        <span className="flex items-center gap-2">
          {/* The source link moved to the General Contact row (next to Fill
              from Website). */}
          {saving && <p className="text-[10px] text-gray-400">Saving…</p>}
        </span>
      </div>
      {editable ? (
        <Input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={save}
          placeholder="Provider business name"
          size="sm"
        />
      ) : (
        <p className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900">
          {ctx.outreach.organization_name}
        </p>
      )}
    </div>
  );
}

// ── Decision Maker section ─────────────────────────────────────────────

/**
 * v9.x single-slot Decision Maker. Replaces multi-contact UX for new rows.
 * Stored in `research_data.decision_maker`. The Smartlead bridge emails
 * General Contact + Decision Maker (max 2 leads per row).
 *
 * "Mark not available" satisfies the Research Card row when the admin
 * couldn't identify a decision maker after research + the call to confirm
 * gate. The row launches with the General Contact lead only.
 */
function DecisionMakerSection({
  ctx,
  action,
  setError,
  editable,
}: {
  ctx: DrawerContext;
  action: (
    actionName: string,
    payload?: Record<string, unknown>,
  ) => Promise<DrawerContext>;
  setError: (msg: string | null) => void;
  editable: boolean;
}) {
  const dm = ctx.outreach.research_data?.decision_maker ?? {};
  const [name, setName] = useState(dm.name ?? "");
  const [role, setRole] = useState(dm.role ?? "");
  const [phone, setPhone] = useState(dm.phone ?? "");
  const [email, setEmail] = useState(dm.email ?? "");
  const [saving, setSaving] = useState<string | null>(null);
  const unavailable = dm.unavailable === true;

  useEffect(() => {
    setName(dm.name ?? "");
    setRole(dm.role ?? "");
    setPhone(dm.phone ?? "");
    setEmail(dm.email ?? "");
  }, [dm.name, dm.role, dm.phone, dm.email]);

  const save = async (
    field: "name" | "role" | "phone" | "email",
    value: string,
  ) => {
    if ((dm[field] ?? "") === value.trim()) return;
    setSaving(field);
    setError(null);
    try {
      await action("update_decision_maker", {
        [field]: value.trim() === "" ? null : value.trim(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save Decision Maker");
    } finally {
      setSaving(null);
    }
  };

  const toggleUnavailable = async () => {
    setSaving("unavailable");
    setError(null);
    try {
      await action("update_decision_maker", { unavailable: !unavailable });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update Decision Maker");
    } finally {
      setSaving(null);
    }
  };

  const hasAny =
    Boolean(name.trim() || role.trim() || phone.trim() || email.trim()) ||
    unavailable;

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          Decision Maker
        </p>
        {saving && (
          <p className="text-[10px] text-gray-400">Saving {saving}…</p>
        )}
      </div>
      {!editable && unavailable ? (
        <p className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-500">
          Decision Maker marked not available.
        </p>
      ) : !editable && !hasAny ? (
        <p className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-2.5 text-center text-xs text-gray-500">
          No Decision Maker on file.
        </p>
      ) : (
        <div
          className={`rounded-md border ${unavailable ? "border-gray-200 bg-gray-50" : "border-gray-200 bg-white"} px-3 py-2.5`}
        >
          <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-[11px] uppercase tracking-wide text-gray-500">
              Name
            </dt>
            <dd>
              {editable ? (
                <Input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => save("name", name)}
                  placeholder="First Last"
                  disabled={unavailable}
                  size="sm"
                />
              ) : (
                <span className="block truncate text-gray-700">
                  {name || <span className="text-gray-400">—</span>}
                </span>
              )}
            </dd>
            <dt className="text-[11px] uppercase tracking-wide text-gray-500">
              Role
            </dt>
            <dd>
              {editable ? (
                <Input
                  type="text"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  onBlur={() => save("role", role)}
                  placeholder="Owner / Hiring Manager / Administrator"
                  disabled={unavailable}
                  size="sm"
                />
              ) : (
                <span className="block truncate text-gray-700">
                  {role || <span className="text-gray-400">—</span>}
                </span>
              )}
            </dd>
            <dt className="text-[11px] uppercase tracking-wide text-gray-500">
              Phone
            </dt>
            <dd>
              {editable ? (
                <Input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onBlur={() => save("phone", phone)}
                  placeholder="(555) 123-4567"
                  disabled={unavailable}
                  size="sm"
                />
              ) : phone ? (
                <a
                  href={`tel:${phone}`}
                  className="block truncate text-primary-700 hover:underline"
                >
                  {phone}
                </a>
              ) : (
                <span className="text-gray-400">—</span>
              )}
            </dd>
            <dt className="text-[11px] uppercase tracking-wide text-gray-500">
              Email
            </dt>
            <dd>
              {editable ? (
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => save("email", email)}
                  placeholder="name@agency.com"
                  disabled={unavailable}
                  size="sm"
                />
              ) : (
                <span className="block truncate text-gray-700">
                  {email || <span className="text-gray-400">—</span>}
                </span>
              )}
            </dd>
          </dl>
          {editable && (
            <button
              type="button"
              onClick={toggleUnavailable}
              className="mt-2 text-[11px] font-medium text-gray-600 hover:text-gray-900"
            >
              {unavailable
                ? "Revert (mark Decision Maker available)"
                : "Mark Decision Maker not available"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Verification section ───────────────────────────────────────────────

/**
 * v9.x Phase 2b: Pre-Flight status indicator inside the Research Card.
 * Read-only — the actual unlock happens in the Pre-Flight call modal
 * (PreFlightCallModal) via log_research_call(verified) or
 * override_pre_flight. This section just mirrors the derived state
 * so admin can see at a glance whether Launch will fire.
 */
export function VerificationSection({ state }: { state: VerificationState }) {
  const tone =
    state.status === "verified"
      ? {
          icon: "✓",
          ring: "border-primary-200 bg-primary-50",
          dot: "text-primary-700",
          label: "text-primary-900",
          sub: "text-primary-700",
          heading: "Verified",
        }
      : state.status === "overridden"
        ? {
            icon: "⚠",
            ring: "border-amber-200 bg-amber-50",
            dot: "text-amber-700",
            label: "text-amber-900",
            sub: "text-amber-700",
            heading: "Overridden",
          }
        : {
            icon: "•",
            ring: "border-gray-200 bg-gray-50",
            dot: "text-gray-500",
            label: "text-gray-700",
            sub: "text-gray-500",
            heading: "Not yet confirmed",
          };
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        Verification
      </p>
      <div
        className={`flex items-start gap-2.5 rounded-md border px-3 py-2.5 ${tone.ring}`}
      >
        <span aria-hidden className={`text-sm leading-5 ${tone.dot}`}>
          {tone.icon}
        </span>
        <div className="min-w-0">
          <p className={`text-sm font-medium ${tone.label}`}>{tone.heading}</p>
          <p className={`mt-0.5 text-[11px] ${tone.sub}`}>{state.label}</p>
        </div>
      </div>
    </div>
  );
}

// ── Pre-Flight action footer ───────────────────────────────────────────

/**
 * v9.x Phase 2c: Pre-Flight action footer rendered inside the Research
 * Card. Owns the three operational affordances:
 *
 *   - Visit Website        → opens provider site (research entry point)
 *   - Call to Confirm      → opens PreFlightCallModal (pre-flight outcome)
 *   - Launch Outreach      → opens ProviderPreFlightModal (cadence)
 *
 * Modals live inside this component so the Research Card is self-
 * contained for Pre-Flight actions. Once Phase 2e removes the
 * NextStepCard checklist, this footer is the sole entry point for
 * these three actions.
 */
function ResearchActionFooter({
  ctx,
  action,
  setError,
  verificationState,
  launchEnabled,
  launchDisabledReason,
  beforeLaunch,
}: {
  ctx: DrawerContext;
  action: ActionFn;
  setError: (msg: string | null) => void;
  verificationState: VerificationState;
  launchEnabled: boolean;
  launchDisabledReason?: string;
  beforeLaunch?: () => Promise<void>;
}) {
  const [showPreFlight, setShowPreFlight] = useState(false);
  const [showCallForEmail, setShowCallForEmail] = useState(false);

  const generalContactSlot = ctx.outreach.research_data?.general_contact ?? {};
  // Effective values: per-outreach override OR directory fallback. Mirrors
  // the same precedence used in GeneralContactSection so the footer
  // reflects whatever the admin sees in the General Contact rows above.
  const generalContactPhone =
    generalContactSlot.phone ?? ctx.provider_business_profile?.phone ?? null;
  const generalContactWebsite =
    generalContactSlot.website ??
    ctx.provider_business_profile?.website ??
    null;

  const cadenceKey: CadenceKey =
    ctx.outreach.kind === "provider"
      ? "provider"
      : (ctx.outreach.stakeholder_type ?? "student_org");

  const showVisitWebsite = Boolean(generalContactWebsite);
  const showCallToConfirm =
    ctx.outreach.kind === "provider" && Boolean(generalContactPhone);

  const launchLabel =
    verificationState.status === "overridden"
      ? "Launch outreach (override) →"
      : "Launch outreach →";

  // Prepare recipients (materialize decision makers with an email into named
  // contacts) and open the cadence pre-flight review. Shared by the normal
  // Launch button and the call modal's "Override & launch outreach" escape
  // hatch — the latter skips the launchEnabled gate (override already written).
  const prepareAndOpenReview = async () => {
    if (beforeLaunch) await beforeLaunch();
    const dms = (ctx.outreach.research_data as Record<string, unknown>).decision_makers;
    if (Array.isArray(dms)) {
      const existing = new Set(ctx.contacts.map((c) => c.email?.toLowerCase()).filter(Boolean) as string[]);
      const gcLc = ctx.outreach.research_data?.general_contact?.email?.toLowerCase();
      for (const m of dms as Array<{ name?: string; title?: string; email?: string; phone?: string }>) {
        const em = m.email?.trim().toLowerCase();
        if (!em || em === gcLc || existing.has(em)) continue;
        existing.add(em);
        await action("add_contact", { name: m.name, title: m.title ?? null, role: m.title ?? null, email: m.email, phone: m.phone });
      }
    }
    setShowPreFlight(true);
  };

  return (
    <div className="border-t border-gray-200 pt-4">
      {/* Two clean actions only — the website lives in the green source link by
          the Business Name now, so the old "Visit Website" button is gone. */}
      <div className="flex flex-wrap items-center gap-2">
        {showCallToConfirm && (
          <button
            onClick={() => setShowCallForEmail(true)}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            title="Phone the provider to verify email, phone, address, and decision maker."
          >
            📞 Call to Confirm
          </button>
        )}
        <button
          onClick={async () => {
            if (!launchEnabled) {
              setError(
                launchDisabledReason ??
                  "Complete the checklist before launching.",
              );
              return;
            }
            try {
              await prepareAndOpenReview();
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Failed to prepare launch",
              );
            }
          }}
          disabled={!launchEnabled}
          title={
            launchEnabled
              ? "Open the cadence pre-flight review."
              : launchDisabledReason
          }
          className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {launchLabel}
        </button>
      </div>

      {showPreFlight && cadenceKey === "provider" && (
        <ProviderPreFlightModal
          organizationName={ctx.outreach.organization_name}
          campusName={ctx.campus.name}
          campusSlug={ctx.campus.slug}
          campusProgramPdfUrl={ctx.campus.program_pdf_url ?? null}
          contacts={ctx.contacts}
          generalContact={{
            email:
              ctx.outreach.research_data?.general_contact?.email ??
              ctx.provider_business_profile?.email ??
              null,
            phone:
              ctx.outreach.research_data?.general_contact?.phone ??
              ctx.provider_business_profile?.phone ??
              null,
          }}
          smartleadPreview={ctx.smartlead_preview}
          smartleadLinkage={linkageFromResearchData(ctx.outreach.research_data)}
          onCancel={() => setShowPreFlight(false)}
          onSubmit={async (payload) => {
            try {
              await action("schedule_sequence", payload);
              setShowPreFlight(false);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Schedule failed");
              throw e;
            }
          }}
        />
      )}
      {showPreFlight && cadenceKey !== "provider" && (
        <PreFlightReviewModal
          stakeholderType={cadenceKey}
          organizationName={ctx.outreach.organization_name}
          campusName={ctx.campus.name}
          contacts={ctx.contacts}
          onCancel={() => setShowPreFlight(false)}
          onSubmit={async (snapshots) => {
            try {
              await action("schedule_sequence", { email_snapshots: snapshots });
              setShowPreFlight(false);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Schedule failed");
              throw e;
            }
          }}
        />
      )}
      {showCallForEmail && (
        <PreFlightCallModal
          organizationName={ctx.outreach.organization_name}
          campusName={ctx.campus?.name ?? null}
          phone={generalContactPhone}
          action={action}
          onCancel={() => setShowCallForEmail(false)}
          onDone={() => setShowCallForEmail(false)}
          setError={setError}
          // Escape hatch when the provider can't be reached by phone: override
          // the confirm-call gate and open the cadence review directly.
          onOverrideLaunch={prepareAndOpenReview}
        />
      )}
    </div>
  );
}

// ── ContactRow ──────────────────────────────────────────────────────────

/**
 * v9 Phase 9 step 8: detect whether a contact has any cadence work
 * already (pending tasks, prior email_sent touchpoints, or an
 * explicit informational-only marker). Used to gate the post-launch
 * "How should we proceed?" banner — banner only shows for newly-
 * added contacts that haven't been routed yet.
 */
function contactHasCadenceWork(contactId: string, ctx: DrawerContext): boolean {
  // Pending tasks tagged with this recipient_contact_id (per-recipient
  // cadence mode).
  const hasPendingTask = ctx.pending_tasks.some((t) => {
    const p = t.payload as Record<string, unknown> | null;
    return p?.recipient_contact_id === contactId;
  });
  if (hasPendingTask) return true;
  // Email sent to this contact (legacy or per-recipient).
  const hasSentTouchpoint = ctx.touchpoints.some((t) => {
    if (t.touchpoint_type !== "email_sent") return false;
    if (t.contact_id === contactId) return true;
    const p = t.payload as Record<string, unknown> | null;
    return p?.recipient_contact_id === contactId;
  });
  if (hasSentTouchpoint) return true;
  // Informational-only marker explicitly set by admin.
  const hasInformationalMarker = ctx.touchpoints.some((t) => {
    if (t.touchpoint_type !== "note_added") return false;
    const p = t.payload as Record<string, unknown> | null;
    return (
      p?.contact_id === contactId &&
      (p?.informational_only === true || typeof p?.enrolled_mode === "string")
    );
  });
  return hasInformationalMarker;
}

function ContactRow({
  contact,
  action,
  setError,
  editable,
  hasCadenceWork,
  isPostLaunch,
}: {
  contact: Contact;
  action: ActionFn;
  setError: (m: string | null) => void;
  editable: boolean;
  /** v9 Phase 9: when false AND isPostLaunch, banner shows asking
   *  admin how to enroll this newly-discovered contact. */
  hasCadenceWork: boolean;
  isPostLaunch: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [firstName, setFirstName] = useState(contact.first_name ?? "");
  const [lastName, setLastName] = useState(contact.last_name ?? "");
  const [title, setTitle] = useState(contact.title ?? "");
  const [role, setRole] = useState<string>(
    contact.role && PROVIDER_CONTACT_ROLES.includes(contact.role)
      ? contact.role
      : contact.role
        ? OTHER
        : "",
  );
  const [roleOther, setRoleOther] = useState(
    contact.role && !PROVIDER_CONTACT_ROLES.includes(contact.role)
      ? contact.role
      : "",
  );
  const [email, setEmail] = useState(contact.email ?? "");
  const [phone, setPhone] = useState(contact.phone ?? "");
  const [mobile, setMobile] = useState(contact.mobile ?? "");
  const [extension, setExtension] = useState(contact.extension ?? "");
  const [saving, setSaving] = useState(false);

  const isActive = contact.status === "active";
  const displayName =
    [contact.title, contact.first_name, contact.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() || contact.name;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const resolvedRole =
        role === OTHER ? roleOther.trim() || null : role || null;
      await action("update_contact", {
        contact_id: contact.id,
        first_name: firstName || null,
        last_name: lastName || null,
        title: title || null,
        role: resolvedRole,
        email: email.trim() || null,
        phone: phone.trim() || null,
        mobile: mobile.trim() || null,
        extension: extension.trim() || null,
      });
      setExpanded(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save contact");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async () => {
    setError(null);
    try {
      if (isActive) {
        await action("mark_contact_stale", { contact_id: contact.id });
      } else {
        await action("update_contact", {
          contact_id: contact.id,
          status: "active",
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update status");
    }
  };

  // v9 Phase 9 step 8: enrollment banner shows when outreach is
  // already in flight AND this contact has no cadence work yet
  // (no pending tasks, no prior sends, no informational marker).
  // Admin picks how to route them — send-now or full cadence,
  // gated by the contact's email/phone availability.
  const showEnrollBanner =
    isPostLaunch && isActive && !hasCadenceWork;

  if (!expanded) {
    return (
      <div
        className={`flex flex-col gap-0 rounded-md border ${
          isActive
            ? "border-gray-200 bg-white"
            : "border-gray-100 bg-gray-50 text-gray-400"
        }`}
      >
        <div className="flex items-start justify-between gap-3 px-3 py-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium text-gray-900">
                {displayName || "(unnamed)"}
              </span>
              {contact.is_primary && (
                <span className="rounded bg-primary-50 px-1.5 py-0.5 text-[10px] font-medium text-primary-700">
                  PRIMARY
                </span>
              )}
              {!isActive && (
                <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium uppercase text-gray-600">
                  {contact.status}
                </span>
              )}
            </div>
            {contact.role && (
              <p className="mt-0.5 truncate text-[11px] text-gray-500">
                {contact.role}
              </p>
            )}
            <p className="mt-0.5 truncate text-xs text-gray-600">
              {contact.email || (
                <span className="text-gray-400">No email</span>
              )}
              {contact.phone && (
                <span className="text-gray-400">
                  {" · "}
                  {contact.phone}
                  {contact.extension ? ` ext ${contact.extension}` : ""}
                </span>
              )}
              {contact.mobile && (
                <span className="text-gray-400"> · 📱 {contact.mobile}</span>
              )}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <button
              onClick={() => setExpanded(true)}
              className="text-[11px] font-medium text-primary-700 hover:underline"
            >
              Edit
            </button>
            <button
              onClick={toggleStatus}
              title={
                isActive
                  ? "Exclude from outreach sends (preserves history)."
                  : "Reactivate this contact for outreach sends."
              }
              className="text-[11px] font-medium text-gray-500 hover:text-gray-700 hover:underline"
            >
              {isActive ? "Mark inactive" : "Reactivate"}
            </button>
          </div>
        </div>
        {showEnrollBanner && (
          <EnrollmentBanner
            contact={contact}
            action={action}
            setError={setError}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-gray-300 bg-white px-3 py-3">
      <div className="grid grid-cols-2 gap-2">
        <LabeledInput
          label="First name"
          value={firstName}
          onChange={setFirstName}
        />
        <LabeledInput
          label="Last name"
          value={lastName}
          onChange={setLastName}
        />
      </div>
      <LabeledInput
        label="Title (Dr., Mr., etc.)"
        value={title}
        onChange={setTitle}
      />
      <div>
        <Select
          label="Role"
          value={role}
          onChange={(val) => setRole(val)}
          placeholder="(no role)"
          size="sm"
          options={[
            { value: "", label: "(no role)" },
            ...PROVIDER_CONTACT_ROLES.map((r) => ({ value: r, label: r })),
          ]}
        />
        {role === OTHER && (
          <div className="mt-1">
            <Input
              type="text"
              value={roleOther}
              onChange={(e) => setRoleOther(e.target.value)}
              placeholder="Custom role"
              size="sm"
            />
          </div>
        )}
      </div>
      <LabeledInput label="Email" value={email} onChange={setEmail} type="email" />
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <LabeledInput label="Phone" value={phone} onChange={setPhone} type="tel" />
        </div>
        <LabeledInput label="Ext" value={extension} onChange={setExtension} />
      </div>
      <LabeledInput
        label="Mobile (optional)"
        value={mobile}
        onChange={setMobile}
        type="tel"
      />
      <div className="flex justify-end gap-2 pt-1">
        <button
          onClick={() => setExpanded(false)}
          className="rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

// ── AddContactInline ────────────────────────────────────────────────────

function AddContactInline({
  orgName,
  action,
  setError,
}: {
  orgName: string;
  action: ActionFn;
  setError: (m: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState("");
  const [roleOther, setRoleOther] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [mobile, setMobile] = useState("");
  const [extension, setExtension] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const resolvedRole =
      role === OTHER ? roleOther.trim() || null : role || null;
    setSaving(true);
    setError(null);
    try {
      const derivedName =
        [firstName, lastName].filter(Boolean).join(" ").trim() ||
        resolvedRole ||
        orgName;
      await action("add_contact", {
        name: derivedName,
        first_name: firstName || null,
        last_name: lastName || null,
        role: resolvedRole,
        email: email.trim() || null,
        phone: phone.trim() || null,
        mobile: mobile.trim() || null,
        extension: extension.trim() || null,
      });
      setFirstName("");
      setLastName("");
      setRole("");
      setRoleOther("");
      setEmail("");
      setPhone("");
      setMobile("");
      setExtension("");
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add contact");
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 text-xs font-medium text-primary-700 hover:underline"
      >
        + Add contact
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-md border border-primary-200 bg-primary-50/30 px-3 py-3">
      <div className="grid grid-cols-2 gap-2">
        <LabeledInput
          label="First name"
          value={firstName}
          onChange={setFirstName}
        />
        <LabeledInput
          label="Last name"
          value={lastName}
          onChange={setLastName}
        />
      </div>
      <div>
        <Select
          label="Role"
          value={role}
          onChange={(val) => setRole(val)}
          placeholder="(no role)"
          size="sm"
          options={[
            { value: "", label: "(no role)" },
            ...PROVIDER_CONTACT_ROLES.map((r) => ({ value: r, label: r })),
          ]}
        />
        {role === OTHER && (
          <div className="mt-1">
            <Input
              type="text"
              value={roleOther}
              onChange={(e) => setRoleOther(e.target.value)}
              placeholder="Custom role"
              size="sm"
            />
          </div>
        )}
      </div>
      <LabeledInput label="Email" value={email} onChange={setEmail} type="email" />
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <LabeledInput label="Phone" value={phone} onChange={setPhone} type="tel" />
        </div>
        <LabeledInput label="Ext" value={extension} onChange={setExtension} />
      </div>
      <LabeledInput
        label="Mobile (optional)"
        value={mobile}
        onChange={setMobile}
        type="tel"
      />
      <div className="flex justify-end gap-2 pt-1">
        <button
          onClick={() => setOpen(false)}
          className="rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={saving}
          className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {saving ? "Adding…" : "Add contact"}
        </button>
      </div>
    </div>
  );
}

// ── Small helpers ───────────────────────────────────────────────────────

function CoverageRow({
  checked,
  label,
  children,
}: {
  checked: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <span
        aria-hidden
        className={`pt-0.5 ${checked ? "text-primary-600" : "text-gray-300"}`}
      >
        {checked ? "✓" : "—"}
      </span>
      <span className="pt-0.5 text-[11px] font-medium uppercase tracking-wide text-gray-500">
        {label}
      </span>
      <div className="min-w-0">{children}</div>
    </>
  );
}

/**
 * v9 Phase 9 step 8: post-launch enrollment banner. Shows on
 * newly-discovered contacts (no cadence work yet) so admin can
 * route them explicitly — never auto-sends. Channel options gate
 * on the contact's email/phone availability.
 */
function EnrollmentBanner({
  contact,
  action,
  setError,
}: {
  contact: Contact;
  action: ActionFn;
  setError: (m: string | null) => void;
}) {
  const [saving, setSaving] = useState<string | null>(null);
  const hasEmail = Boolean(contact.email && contact.email.trim().length > 0);
  const hasPhone = Boolean(
    (contact.phone && contact.phone.trim().length > 0) ||
      (contact.mobile && contact.mobile.trim().length > 0),
  );

  const dispatch = async (mode: string) => {
    setSaving(mode);
    setError(null);
    try {
      await action("enroll_contact_in_cadence", {
        contact_id: contact.id,
        mode,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to enroll contact");
    } finally {
      setSaving(null);
    }
  };

  const buttonClass =
    "rounded-md border border-primary-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-primary-700 hover:bg-primary-50 disabled:opacity-50";
  const secondaryClass =
    "rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50";

  // The full cadence on whichever channels this contact has.
  const addMode = hasEmail && hasPhone
    ? "full_both"
    : hasEmail
      ? "full_email_cadence"
      : "full_call_cadence";

  return (
    <div className="border-t border-primary-200 bg-primary-50/40 px-3 py-2">
      <p className="text-[11px] text-primary-900">Added after launch — send to them too?</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {(hasEmail || hasPhone) && (
          <button
            onClick={() => dispatch(addMode)}
            disabled={saving != null}
            className={buttonClass}
            title="Run the cadence for this contact too."
          >
            {saving === addMode ? "Adding…" : "Add to cadence"}
          </button>
        )}
        <button
          onClick={() => dispatch("informational")}
          disabled={saving != null}
          className={secondaryClass}
          title="Keep in the contact list but don't send anything."
        >
          {saving === "informational" ? "Saving…" : "Just add (no send)"}
        </button>
      </div>
    </div>
  );
}

/**
 * v9 final: contact-form pre-flight banner. Surfaces whenever a
 * contact_form_url is on file AND no contact_form_submitted
 * touchpoint exists. Mounted by NextStepCard pre-launch (gates the
 * Launch button) and by the SnapshotCard post-launch (catches URLs
 * added after the cadence is in motion).
 *
 * Carries a short pre-written message + Copy button so admin can
 * paste it into the provider's contact form in one motion. Message
 * personalizes on the presence of a Specific Contact name. Each
 * outcome click writes one log_contact_form_outcome touchpoint;
 * the banner hides on the next refresh.
 */
export function ContactFormBanner({
  url,
  action,
  setError,
  campusName,
  specificContactName,
}: {
  url: string;
  action: ActionFn;
  setError: (m: string | null) => void;
  /** Campus / Site name for the message body. Falls back to "your
   *  university" if unknown. */
  campusName?: string | null;
  /** First active Specific Contact's display name, if any. When
   *  present, message asks for them by name; otherwise it asks for
   *  someone on the leadership / hiring team. */
  specificContactName?: string | null;
}) {
  const [saving, setSaving] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const site = campusName?.trim() || "your university";
  const message = specificContactName?.trim()
    ? `Hi, this is Graize, assistant to Dr. Logan DuBose. We were hoping to connect with ${specificContactName.trim()} regarding a student caregiver initiative connected to ${site}. Would you be able to point us in the right direction?`
    : `Hi, this is Graize, assistant to Dr. Logan DuBose. We're hoping to connect with someone on your leadership or hiring team regarding a student caregiver initiative connected to ${site}. Could someone point us in the right direction?`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy to clipboard");
    }
  };

  const dispatch = async (outcome: string) => {
    setSaving(outcome);
    setError(null);
    try {
      await action("log_contact_form_outcome", { outcome, url });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to log outcome");
    } finally {
      setSaving(null);
    }
  };
  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-gray-700">
          Contact form on file — has it been submitted yet?
        </p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-[11px] font-medium text-primary-700 hover:underline"
        >
          Open form ↗
        </a>
      </div>
      <div className="mt-2 rounded-md border border-gray-200 bg-white px-2.5 py-2">
        <p className="whitespace-pre-line text-[11px] leading-relaxed text-gray-700">
          {message}
        </p>
        <button
          onClick={handleCopy}
          className="mt-1.5 rounded-md border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-700 hover:bg-gray-50"
        >
          {copied ? "✓ Copied" : "Copy message"}
        </button>
      </div>
      {/* v9.1 Graize 05.13 audit (Item 3): short, practical guidance
          so admins know how to handle the variety of contact forms
          they'll encounter on agency websites. */}
      <div className="mt-2 rounded-md border border-gray-200 bg-white px-2.5 py-2 text-[11px] leading-relaxed text-gray-600">
        <p className="font-semibold text-gray-700">How to submit:</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          <li>Contact forms come in different shapes — use the best available fields and your judgment.</li>
          <li>Email field → use <span className="font-mono">support@olera.care</span>.</li>
          <li>Phone field → use Olera&apos;s outreach phone number.</li>
          <li>Family / client-lead forms → still submit the message if it&apos;s the only contact path; the goal is reaching the agency through every available channel.</li>
          <li>Paste the message above, submit the form, then log the outcome below.</li>
        </ul>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {(
          [
            { value: "submitted", label: "Submitted" },
            { value: "skipped", label: "Skipped" },
            { value: "not_available", label: "Not available" },
          ] as const
        ).map((opt) => (
          <button
            key={opt.value}
            onClick={() => dispatch(opt.value)}
            disabled={saving != null}
            className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {saving === opt.value ? "Logging…" : opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-gray-500">
        {label}
      </label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        size="sm"
      />
    </div>
  );
}

// ── Find-from-website affordances (TJ) ─────────────────────────────────

function Spinner() {
  return (
    <svg
      className="h-3 w-3 animate-spin text-primary-600"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

/**
 * Inline find affordance under an empty General Contact field. Shows one of:
 * an in-flight "searching" state, a soft "✦ Find X" pill, or a calm result
 * note (a miss offers "Open website ↗" so the operator can look manually).
 * Feedback never leaves this row — the drawer body stays put.
 */
function FindRow({
  showButton,
  label,
  busy,
  disabled,
  onClick,
  note,
  websiteHref,
}: {
  showButton: boolean;
  label: string;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
  note?: { kind: "miss" | "error"; text: string };
  websiteHref: string | null;
}) {
  if (busy) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
        <Spinner /> Searching the site…
      </div>
    );
  }
  if (!showButton && !note) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {showButton && (
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600 shadow-sm transition-colors hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="text-primary-600" aria-hidden>
            ✦
          </span>
          {label}
        </button>
      )}
      {note && (
        <span className={`text-[11px] ${note.kind === "error" ? "text-red-600" : "text-gray-500"}`}>
          {note.text}
          {note.kind === "miss" && websiteHref && (
            <a
              href={websiteHref}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-1.5 font-medium text-primary-700 hover:underline"
            >
              Open website ↗
            </a>
          )}
        </span>
      )}
    </div>
  );
}
