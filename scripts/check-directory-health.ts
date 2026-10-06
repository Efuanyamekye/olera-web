/**
 * Deterministic checks for directory health decisions (lib/providers/directory-health.ts).
 *
 *   npx tsx scripts/check-directory-health.ts
 */
import assert from "node:assert/strict";
import { decideHealthActions, isCosmeticRename, normalizeProviderName, planStatusPass } from "../lib/providers/directory-health";

const open = { provider_id: "a", provider_name: "Sunrise Senior Living of Dallas", deleted: false, google_status: "OPERATIONAL" };

// Permanently closed: archive, and say nothing about the name.
assert.deepEqual(
  decideHealthActions(open, { status: "CLOSED_PERMANENTLY", googleName: "Something Else Entirely" }).map((d) => d.kind),
  ["closed_archived"],
);
// Already archived: nothing to do again.
assert.deepEqual(decideHealthActions({ ...open, deleted: true }, { status: "CLOSED_PERMANENTLY", googleName: null }), []);
// Temporarily closed: a flag, once. A repeat observation is silent.
assert.deepEqual(decideHealthActions(open, { status: "CLOSED_TEMPORARILY", googleName: null }).map((d) => d.kind), ["closed_temporarily"]);
assert.deepEqual(decideHealthActions({ ...open, google_status: "CLOSED_TEMPORARILY" }, { status: "CLOSED_TEMPORARILY", googleName: null }), []);
// Same name, still open: no ledger row.
assert.deepEqual(decideHealthActions(open, { status: "OPERATIONAL", googleName: "Sunrise Senior Living of Dallas" }), []);
// Cosmetic rename applies itself and carries the old name for undo.
const cosmetic = decideHealthActions(open, { status: "OPERATIONAL", googleName: "SUNRISE SENIOR LIVING - DALLAS, LLC" });
assert.equal(cosmetic[0]?.kind, "rename_applied");
assert.deepEqual(cosmetic[0]?.kind === "rename_applied" ? cosmetic[0].undo : null, { provider_name: "Sunrise Senior Living of Dallas" });
// A real rename waits for a person.
assert.deepEqual(decideHealthActions(open, { status: "OPERATIONAL", googleName: "Brookdale Dallas" }).map((d) => d.kind), ["rename_flagged"]);
// No status at all (Google returned only a name): still diffs the name.
assert.deepEqual(decideHealthActions(open, { status: null, googleName: "Brookdale Dallas" }).map((d) => d.kind), ["rename_flagged"]);

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

console.log("directory health checks passed");
