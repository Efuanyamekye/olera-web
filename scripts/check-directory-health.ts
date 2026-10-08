/**
 * Deterministic checks for directory health decisions (lib/providers/directory-health.ts).
 *
 *   npx tsx scripts/check-directory-health.ts
 */
import assert from "node:assert/strict";
import { cosmeticRenameTarget, decideHealthActions, isCosmeticRename, normalizeProviderName, planStatusPass } from "../lib/providers/directory-health";

const open = { provider_id: "a", provider_name: "Sunrise Senior Living of Dallas", deleted: false, google_status: "OPERATIONAL", google_name: "Sunrise Senior Living of Dallas" };

// Permanently closed: archive, and say nothing about the name.
assert.deepEqual(
  decideHealthActions(open, { status: "CLOSED_PERMANENTLY", googleName: "Something Else Entirely" }).map((d) => d.kind),
  ["closed_archived"],
);
// Already archived: nothing to do again.
assert.deepEqual(decideHealthActions({ ...open, deleted: true }, { status: "CLOSED_PERMANENTLY", googleName: null }), []);
// A person restored a provider Google still calls closed: their word stands.
assert.deepEqual(decideHealthActions({ ...open, google_status: "CLOSED_PERMANENTLY" }, { status: "CLOSED_PERMANENTLY", googleName: null }), []);
// A name already seen on an earlier pass is never flagged or applied again.
assert.deepEqual(decideHealthActions({ ...open, google_name: "Brookdale Dallas" }, { status: "OPERATIONAL", googleName: "Brookdale Dallas" }), []);
assert.deepEqual(decideHealthActions({ ...open, google_name: "SUNRISE SENIOR LIVING - DALLAS" }, { status: "OPERATIONAL", googleName: "SUNRISE SENIOR LIVING - DALLAS" }), []);
// Temporarily closed: a flag, once. A repeat observation is silent.
assert.deepEqual(decideHealthActions(open, { status: "CLOSED_TEMPORARILY", googleName: null }).map((d) => d.kind), ["closed_temporarily"]);
assert.deepEqual(decideHealthActions({ ...open, google_status: "CLOSED_TEMPORARILY" }, { status: "CLOSED_TEMPORARILY", googleName: null }), []);
// Same name, still open: no ledger row.
assert.deepEqual(decideHealthActions(open, { status: "OPERATIONAL", googleName: "Sunrise Senior Living of Dallas" }), []);
// Google adding LLC/Inc (or only changing case/punctuation) is the same name: nothing happens.
assert.deepEqual(decideHealthActions(open, { status: "OPERATIONAL", googleName: "SUNRISE SENIOR LIVING - DALLAS, LLC" }), []);
const named = (provider_name: string) => ({ ...open, provider_name, google_name: null });
for (const [stored, google] of [
  ["Quality Life Homecare", "Quality Life Homecare Inc"],
  ["ALLIANCE HOME CARE", "ALLIANCE HOME CARE LLC"],
  ["Lilies of Hope Home Care", "Lilies of Hope Home Care LLC"],
  ["Alliance Assisted Living", "Alliance assisted living inc"],
  ["Snavson Senior Care", "Snavson Senior Care, L.L.C."],
]) assert.deepEqual(decideHealthActions(named(stored), { status: "OPERATIONAL", googleName: google }), [], `${stored} → ${google}`);
// Google dropping a suffix ours carries applies itself and carries the old name for undo.
const dropped = decideHealthActions(named("Acme Home Care LLC"), { status: "OPERATIONAL", googleName: "Acme Home Care" });
assert.equal(dropped[0]?.kind, "rename_applied");
assert.equal(dropped[0]?.kind === "rename_applied" ? dropped[0].newName : null, "Acme Home Care");
assert.deepEqual(dropped[0]?.kind === "rename_applied" ? dropped[0].undo : null, { provider_name: "Acme Home Care LLC" });
// Ours in ALL CAPS, Google's not: take Google's casing, without the suffix it added.
const caps = decideHealthActions(named("ALLIANCE HOME CARE"), { status: "OPERATIONAL", googleName: "Alliance Home Care LLC" });
assert.equal(caps[0]?.kind === "rename_applied" ? caps[0].newName : null, "Alliance Home Care");
assert.equal(cosmeticRenameTarget("Bright Star Care Inc", "Bright Star Care Inc."), null);
// A real rename waits for a person.
assert.deepEqual(decideHealthActions(open, { status: "OPERATIONAL", googleName: "Brookdale Dallas" }).map((d) => d.kind), ["rename_flagged"]);
// No status at all (Google returned only a name): still diffs the name.
assert.deepEqual(decideHealthActions(open, { status: null, googleName: "Brookdale Dallas" }).map((d) => d.kind), ["rename_flagged"]);

// Fences tuned from #cortex: "ask" turns the reversible action into a flag.
assert.deepEqual(
  decideHealthActions(open, { status: "CLOSED_PERMANENTLY", googleName: null }, { renames: "alone", archive: "ask" }).map((d) => d.kind),
  ["closed_flagged"],
);
assert.deepEqual(
  decideHealthActions(named("Acme Home Care LLC"), { status: "OPERATIONAL", googleName: "Acme Home Care" }, { renames: "ask", archive: "alone" }).map((d) => d.kind),
  ["rename_flagged"],
);

assert.equal(normalizeProviderName("Bella Vista Apts., Inc."), "bella vista apts");
assert.equal(normalizeProviderName("A & B Home Care LLC"), "a b home care");
assert.equal(normalizeProviderName("Sunrise Senior Living of Dallas"), normalizeProviderName("SUNRISE SENIOR LIVING - DALLAS, LLC"));
assert.ok(isCosmeticRename("Comfort Keepers of Plano", "COMFORT KEEPERS OF PLANO"));
assert.ok(!isCosmeticRename("Comfort Keepers of Plano", "Comfort Keepers of Frisco"));
assert.ok(!isCosmeticRename(null, "Anything"));

// The pass orders claimed, then clicked, then by view; never-checked first; cut at the cap.
const c = (id: string, slug: string, viewed: string | null, checked: string | null) => ({ provider_id: id, place_id: `p-${id}`, slug, last_viewed_at: viewed, google_status_checked_at: checked });
const planned = planStatusPass(
  [c("tail", "tail", "2026-10-01", null), c("claimed", "claimed", null, null), c("clicked", "clicked", "2026-09-01", null), c("rechecked", "rechecked", "2026-10-05", "2026-03-01")],
  new Set(["claimed"]),
  new Set(["clicked"]),
  3,
);
assert.deepEqual(planned.map((p) => p.provider_id), ["claimed", "clicked", "tail"], "claimed, then clicked, then the never-checked tail; the old recheck is cut by the cap");
// A dead website puts a provider ahead of everyone, claimed included.
assert.deepEqual(
  planStatusPass([c("claimed", "claimed", null, null), c("deadsite", "deadsite", null, null)], new Set(["claimed"]), new Set(), 2, new Set(["deadsite"])).map((p) => p.provider_id),
  ["deadsite", "claimed"],
);

console.log("directory health checks passed");
