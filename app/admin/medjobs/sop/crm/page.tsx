"use client";

import SopReader, { type SopJump } from "@/components/admin/medjobs/SopReader";
import RoleOrientation from "@/components/admin/medjobs/RoleOrientation";

/**
 * SOP · CRM — the Consumer Relations Manager's view of the operating system.
 *
 * CRM is the workspace label; the operating role is Consumer Relations Manager, and
 * the document uses that term throughout. Built from
 * docs/medjobs/roles-src/CRM.md.
 */

const JUMPS: SopJump[] = [
  { label: "Provider success", dest: "pr3", title: "PR3 client success" },
  { label: "University activation", dest: "st", title: "ST3 to ST7 university activation" },
  { label: "Portal exceptions", dest: "portal", title: "ST8, QUAL, MA1 and MA2, where you handle exceptions" },
  { label: "Hire confirmed", dest: "ma3", title: "MA3 hire confirmed" },
  { label: "Six shifts", dest: "ma4", title: "MA4 six or more shifts worked, confirmed" },
  { label: "Billing", dest: "ma5", title: "MA5 bill issued and collected" },
  { label: "List call", dest: "listcall", title: "The monthly client list call" },
  { label: "Gaps", dest: "gaps", title: "Gaps and decisions needed", divide: true },
  { label: "Traceability", dest: "trace", title: "Every section against its source in the master" },
];

export default function MedJobsSopCrmPage() {
  return (
    <SopReader
      doc="crm"
      title="MedJobs Consumer Relations"
      readerLabel="Standard Operating Procedure"
      jumps={JUMPS}
      openAt={JUMPS[0]}
      alsoOpen={{ label: "University Activation guide", doc: "activation" }}
      above={(jump) => <RoleOrientation role="crm" onJump={jump} />}
    />
  );
}
