/**
 * Render a touchpoint as a self-explanatory line for the History section.
 *
 * Keeps payload-aware copy in one place so additions are consistent.
 * Returns plain text — the component formats relative time + admin name
 * around it.
 */

import { STATUS_LABELS } from "./types";
import type { Contact, Touchpoint } from "./types";

export interface NarrationContext {
  /** Map of admin user_id → first-name display string. */
  adminFirstNames: Map<string, string>;
  /** Map of contact_id → name, for touchpoints that reference a specific contact. */
  contactsById: Map<string, Contact>;
}

export interface NarratedTouchpoint {
  /** One-line action sentence (the "what happened"). */
  text: string;
  /** Secondary specifics shown beneath the title (the partner's message, the
   *  event details, an admin's free-form note). Null when the title says it
   *  all. Kept separate from `text` so the timeline never renders the same
   *  note twice. */
  detail: string | null;
  admin: string | null;
  whenIso: string;
}

export function narrateTouchpoint(t: Touchpoint, ctx: NarrationContext): NarratedTouchpoint {
  const admin = t.created_by ? (ctx.adminFirstNames.get(t.created_by) ?? null) : null;
  const contact = t.contact_id ? ctx.contactsById.get(t.contact_id) : null;
  const contactSuffix = contact ? ` to ${contact.email ?? contact.name}` : "";
  const contactName = contact ? ` (${contact.name})` : "";
  const p = t.payload ?? {};
  const note = typeof t.notes === "string" && t.notes.trim() ? t.notes.trim() : null;

  let text: string;
  // Default subline = the free-form note (admin/system specifics). Structured
  // events override this with payload-derived detail so the note — which often
  // just restates the title — isn't echoed twice.
  let detail: string | null = note;
  switch (t.touchpoint_type) {
    case "stage_change": {
      // E3: narrate stage transitions as complete sentences. Terminal
      // and conversion transitions get stronger language so the
      // timeline reads as the relationship's story, not a state log.
      const from = String(p.from ?? "?");
      const to = String(p.to ?? "?");
      const fromLabel = labelFor(from);
      const toLabel = labelFor(to);
      if (p.reopen) {
        text = `Row reopened from ${fromLabel} back to ${toLabel}.`;
      } else if (to === "active_partner") {
        // v10 Phase 4+5 (2026-06-04): differentiate the two activation
        // paths so the timeline tells the story of HOW conversion
        // happened (admin made the call vs provider self-served).
        const via = typeof p.via === "string" ? p.via : null;
        if (via === "self_serve_activation") {
          text = `🎉 Pilot Active — provider accepted the agreement on the candidate board.`;
        } else {
          text = `🎉 Pilot Active — row converted, now an active partner.`;
        }
      } else if (to === "not_interested") {
        text = `Row closed as Not interested.`;
      } else if (to === "do_not_contact") {
        text = `Row closed as Do Not Contact — communications stopped.`;
      } else if (to === "no_response_closed") {
        text = `Row archived after no response.`;
      } else if (to === "wrong_contact") {
        text = `Row closed — contact was unreachable.`;
      } else if (to === "redirected") {
        text = `Row redirected to a different stakeholder.`;
      } else if (to === "archived") {
        text = `Prospect archived — outreach halted. Can be reopened.`;
      } else {
        text = `Row moved from ${fromLabel} to ${toLabel}.`;
      }
      break;
    }
    case "email_sent": {
      text = `Sent email${contactSuffix}${contactName}.`;
      // Prefer an admin note; otherwise label which email in the sequence went
      // out (humanized template) so the row reads as the cadence step it is.
      detail = note ?? friendlyTemplate(typeof p.template === "string" ? p.template : null);
      break;
    }
    case "email_replied":
      text = `Reply received${contactSuffix}${contactName} — cadence stopped.`;
      break;
    case "email_bounced":
      text = `Email bounced${contactSuffix} — address needs correction.`;
      break;
    case "email_complained":
      text = `Email marked as spam${contactSuffix} — row auto-closed (do not contact).`;
      break;
    case "email_failed":
      text = `Email send failed${contactSuffix}.`;
      break;

    case "call_no_answer":
      text = `Called${contactName} — no answer. Row reappears on the next phone day.`;
      break;
    case "call_voicemail":
      text = `Called${contactName} — voicemail / message left. Row now awaiting callback.`;
      break;
    case "call_connected": {
      // Outcome carries the engagement detail (connected_engaged,
      // promised_callback, convert_to_client, etc.) — render the
      // human-facing consequence when known.
      const outcome = t.outcome ?? "";
      if (outcome === "connected_engaged") {
        text = `Reached${contactName} — interested. Cadence stopped; row moved to Replies.`;
      } else if (outcome === "promised_callback") {
        text = `Reached${contactName} — promised callback. Row awaiting their return call.`;
      } else if (outcome === "convert_to_partner") {
        text = `Reached${contactName} — committing to Partner.`;
      } else if (outcome === "connected_not_interested") {
        text = `Reached${contactName} — not interested. Row closed.`;
      } else {
        text = `Reached${contactName} on the phone.`;
      }
      break;
    }
    case "call_wrong_number":
      text = `Called${contactName} — wrong number. Row closed.`;
      break;

    case "ig_dm_sent":
      text = `Sent Instagram DM${contactName}.`;
      break;
    case "ig_dm_replied":
      text = `Reply received via Instagram DM${contactName} — cadence stopped.`;
      break;
    case "contact_form_submitted":
      text = `Submitted the agency's contact form.`;
      break;

    case "meeting_scheduled": {
      const at = p.meeting_at ? ` for ${formatDate(String(p.meeting_at))}` : "";
      const kind = p.kind ? ` (${p.kind})` : "";
      text = `Meeting scheduled${at}${kind} — row moved to Meetings.`;
      break;
    }
    case "meeting_held":
      text = t.outcome ? `Meeting held — ${t.outcome}.` : `Meeting held.`;
      break;
    case "meeting_no_show":
      text = `Meeting no-show.`;
      break;
    case "meeting_rescheduled": {
      const at = p.meeting_at ? ` to ${formatDate(String(p.meeting_at))}` : "";
      text = `Meeting rescheduled${at}.`;
      break;
    }

    case "approval_requested": {
      const what = p.approval_for ? `: ${p.approval_for}` : "";
      const type = p.approval_type ? ` (${p.approval_type})` : "";
      text = `Approval requested${type}${what}`;
      break;
    }
    case "approval_granted": {
      if (p.bulk_professor_unlock) {
        text = `${p.created_count ?? 0} professor row(s) created (${p.permission})`;
      } else if (p.source === "bulk_unlock") {
        text = `Unlocked via dept (${p.permission})`;
      } else {
        const type = p.approval_type ? ` (${p.approval_type})` : "";
        text = `Approval granted${type}`;
      }
      break;
    }
    case "approval_denied":
      text = `Approval denied${p.approval_type ? ` (${p.approval_type})` : ""}`;
      break;
    case "approval_expired":
      text = `Approval expired${p.approval_type ? ` (${p.approval_type})` : ""}`;
      break;

    case "distribution_confirmed": {
      const ev = p.evidence ? ` — evidence: ${p.evidence}` : "";
      text = `Marked as Partner${ev}.`;
      break;
    }

    case "contact_added":
      text = p.initial ? `Initial contact added.` : `Contact added${contactName}.`;
      break;
    case "contact_marked_stale": {
      const newStatus = p.new_status ?? "stale";
      text = `Contact marked ${newStatus}${contactName}.`;
      break;
    }
    case "contact_replaced":
      text = `Contact replaced${contactName}.`;
      break;

    case "redirect_initiated":
      text = `Redirected to a new stakeholder.`;
      break;
    case "note_added": {
      // v10 Phases 2-5 (2026-06-04): the magic-link landing + Calendly
      // webhook + activation API + partner self-service all use note_added with
      // structured `reason` payloads. Surface the operational meaning instead of
      // a generic "Note added" so the timeline tells the actual story.
      const reasonRaw = typeof p.reason === "string" ? p.reason : null;
      const fields = Array.isArray(p.fields_updated) ? p.fields_updated.join(", ") : "";
      switch (reasonRaw) {
        case "platform_visited":
          text = `🔗 Provider clicked the magic link and visited the candidate board.`;
          detail = null;
          break;
        case "partner_portal_visited":
          text = `🔗 Partner opened their portal and signed in.`;
          detail = null;
          break;
        case "claim_conflict":
          text = `⚠️ Magic-link click on an organization already linked to another account. Read-only co-tenancy until reconciled.`;
          detail = null;
          break;
        case "calendly_reschedule_pending":
          text = `📅 Calendly reschedule in progress (old slot canceled — waiting for the new one).`;
          detail = null;
          break;
        // ── Partner self-service from the portal (relationship signals) ──
        case "partner_referral": {
          const name = str(p.referred_name) ?? "a colleague";
          const role = str(p.referred_role);
          text = `🤝 Partner referred a colleague: ${name}${role ? `, ${role}` : ""}.`;
          detail = joinDetail([str(p.referred_email), str(p.context)]);
          break;
        }
        case "partner_event": {
          const name = str(p.event_name) ?? "a campus event";
          text = `📅 Partner flagged a campus event: ${name}.`;
          detail = joinDetail([
            str(p.date) ?? str(p.timing),
            p.mode === "virtual" ? "virtual" : str(p.location),
            str(p.notes),
          ]);
          break;
        }
        case "partner_message": {
          text = `💬 Partner sent a message.`;
          detail = str(p.message) ?? note;
          break;
        }
        case "dept_head_partner_documented": {
          const perm: Record<string, string> = {
            yes: "✅ professor outreach approved",
            no: "🚫 no professor outreach",
            not_yet: "⏳ professor outreach not yet",
            unclear: "❓ professor permission unclear",
          };
          const next: Record<string, string> = {
            email_professors: "We may email professors directly",
            will_forward: "Dept head will forward the flyer",
            will_introduce: "Dept head will introduce us",
            need_followup: "Need a follow-up to decide",
            do_not_contact_yet: "Do not contact professors yet",
            other: "See notes",
          };
          const permLabel = perm[String(p.professor_permission)] ?? "professor permission documented";
          text = `🏛️ Department-head partnership documented — ${permLabel}.`;
          detail = next[String(p.next_step)] ?? note;
          break;
        }
        default:
          text = fields ? `📋 Research / notes updated (${fields}).` : `Note added.`;
          // For a plain research/notes update the free-form note IS the detail;
          // keep the default `detail = note`.
      }
      break;
    }
    case "snoozed": {
      const until = p.snoozed_until ? ` until ${formatDate(String(p.snoozed_until))}` : "";
      text = `Snoozed${until}.`;
      break;
    }
    case "task_cancelled":
      text = `Task cancelled${p.reason ? ` (${p.reason})` : ""}.`;
      break;
    case "task_superseded": {
      const reason = p.reason === "stage_change" ? " — stage advanced" : "";
      text = `Pending tasks superseded${reason}.`;
      break;
    }
    case "system_seasonal_due":
      text = `Seasonal check-in due.`;
      break;

    default:
      text = String(t.touchpoint_type).replace(/_/g, " ");
  }

  return { text, detail, admin, whenIso: t.created_at };
}

function labelFor(status: string): string {
  return (STATUS_LABELS as Record<string, string>)[status] ?? status;
}

/** Coerce an unknown payload field to a trimmed non-empty string, or null. */
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Join present detail fragments into one " · "-separated subline, or null. */
function joinDetail(parts: Array<string | null | undefined>): string | null {
  const kept = parts.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  return kept.length > 0 ? kept.join(" · ") : null;
}

/** Humanize an email template key (e.g. "activation_nudge" → "Activation nudge
 *  email", "followup_final" → "Final follow-up email") for the timeline subline.
 *  Returns null when there's no template to label. */
function friendlyTemplate(key: string | null): string | null {
  if (!key) return null;
  const k = key.toLowerCase();
  if (k.includes("final")) return "Final follow-up email";
  if (k.includes("socialproof")) return "Social-proof follow-up email";
  if (k.includes("nudge")) return "Activation nudge email";
  if (k.includes("followup") || k.includes("follow_up")) return "Follow-up email";
  if (k.includes("intro")) return "Intro email";
  if (k.includes("welcome")) return "Welcome email";
  // Fallback: strip the audience prefix + de-snake.
  const cleaned = k.replace(/^(provider|partner|activation|advisor|student_org|dept_head|professor)_/, "").replace(/_/g, " ");
  return cleaned ? `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)} email` : null;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
