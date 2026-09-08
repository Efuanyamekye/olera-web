import type { Channel } from "@/lib/medjobs/activation";
import type { AnyStatus } from "./StatusDot";

/** What /api/admin/medjobs/activation returns. One shape for both views. */

export interface ActivationContact {
  name: string;
  role?: string;
  email?: string;
  phone?: string;
}

export interface ActivationNote {
  at: string;
  text: string;
}

export interface ActivationRecord {
  id: string;
  kind: "organization" | "event" | "professor";
  name: string;
  status: AnyStatus;
  statusReason: string | null;
  firstActivatedAt: string | null;
  criteria: Record<string, string>;
  detail: Record<string, unknown>;
  contacts: ActivationContact[];
  notes: ActivationNote[];
  nextCheck: { taskId: string; dueAt: string } | null;
  due: boolean;
  liveWhen: string;
}

export interface ActivationChannel {
  channel: Channel;
  name: string;
  status: AnyStatus;
  statusReason: string | null;
  firstActivatedAt: string | null;
  criteria: Record<string, string>;
  detail: Record<string, unknown>;
  notes: ActivationNote[];
  nextCheck: { taskId: string; dueAt: string } | null;
  due: boolean;
  liveCount: number | null;
  recordCount: number | null;
  records?: ActivationRecord[];
}

export interface ActivationUniversity {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  state: string | null;
  due: boolean;
  channels: ActivationChannel[];
}

/** Short date, the format every card and row uses. */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
