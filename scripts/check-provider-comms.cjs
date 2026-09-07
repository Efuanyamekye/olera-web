/* Run with node scripts/check-provider-comms.cjs; uses the locked TS compiler. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", code)(
    (id) =>
      id.startsWith(".")
        ? load(path.resolve(path.dirname(file), id + ".ts"))
        : require(id),
    mod,
    mod.exports,
  );
  cache.set(file, mod.exports);
  return mod.exports;
}
const reporting = load("lib/provider-comms/reporting.ts");
const { loadProviderCommsReport } = load("lib/provider-comms/load-report.ts");
const base = {
  id: "e1",
  provider_id: "11111111-1111-4111-8111-111111111111",
  recipient: "owner@example.com",
  email_type: "provider_welcome",
  recipient_type: "provider",
  channel: "email",
  status: "sent",
  error_message: null,
  resend_id: "r1",
  created_at: "2026-09-02T12:00:00Z",
  delivered_at: "2026-09-02T12:00:01Z",
  first_opened_at: null,
  first_clicked_at: "2026-09-03T12:00:00Z",
  bounced_at: null,
  complained_at: null,
};
assert.equal(reporting.isAcceptedEmail(base), true);
assert.equal(
  reporting.isAcceptedEmail({
    ...base,
    status: "failed",
    delivered_at: null,
    error_message: "Suppressed: verified undeliverable",
  }),
  false,
);
assert.equal(
  reporting.isAcceptedEmail({
    ...base,
    status: "failed",
    delivered_at: null,
    error_message: "API request failed",
    resend_id: null,
  }),
  false,
);
assert.equal(
  reporting.isAcceptedEmail({
    ...base,
    status: "pending",
    delivered_at: null,
    resend_id: null,
  }),
  false,
);
assert.equal(
  reporting.deliveryState({
    ...base,
    status: "failed",
    error_message: "Suppressed: verified undeliverable",
    delivered_at: null,
  }),
  "suppressed",
);
assert.equal(
  reporting.deliveryState({
    ...base,
    status: "failed",
    error_message: "API request failed",
    delivered_at: null,
    resend_id: null,
  }),
  "failed",
);
assert.equal(
  reporting.deliveryState({
    ...base,
    delivered_at: null,
    resend_id: null,
    status: "pending",
  }),
  "pending",
);
assert.equal(
  reporting.deliveryState({ ...base, delivered_at: null }),
  "accepted",
);
assert.equal(
  reporting.deliveryState({ ...base, status: "opened" }),
  "delivered",
);
assert.equal(
  reporting.deliveryState({ ...base, complained_at: "2026-09-04T00:00:00Z" }),
  "complained",
);
assert.equal(
  reporting.suppressionReason("Skipped: user notification preference disabled"),
  "Notification preference",
);
assert.equal(reporting.suppressionReason("nudge_cap"), "Frequency limit");
assert.equal(reporting.isInternalRecipient(" TEST@OLERA.CARE "), true);
assert.equal(reporting.isInternalRecipient("test@notolera.care"), false);
assert.equal(reporting.outreachBeforeClaim("2026-09-01", ["2026-08-30"]), true);
assert.equal(
  reporting.outreachBeforeClaim("2026-09-01", ["2026-09-02"]),
  false,
);
assert.equal(reporting.outreachBeforeClaim(null, ["2026-08-30"]), false);
assert.equal(reporting.outreachBeforeClaim("2026-09-01", ["invalid"]), false);

// A small PostgREST test double exercises query filters, identity variants,
// pagination and fail-closed behavior without production credentials.
function db(tables, failTable = null) {
  return {
    from(table) {
      let rows = [...(tables[table] ?? [])];
      const q = {
        select() {
          return q;
        },
        eq(k, v) {
          rows = rows.filter((r) => r[k] === v);
          return q;
        },
        in(k, values) {
          rows = rows.filter((r) => values.includes(r[k]));
          return q;
        },
        gte(k, v) {
          rows = rows.filter((r) => r[k] >= v);
          return q;
        },
        lt(k, v) {
          rows = rows.filter((r) => r[k] < v);
          return q;
        },
        order(k) {
          rows.sort((a, b) => String(a[k]).localeCompare(String(b[k])));
          return q;
        },
        range(a, b) {
          return Promise.resolve(
            table === failTable
              ? { data: null, error: { message: "offline" } }
              : { data: rows.slice(a, b + 1), error: null },
          );
        },
      };
      return q;
    },
  };
}
async function main() {
  const profile = {
    id: base.provider_id,
    slug: "claimed-slug",
    source_provider_id: "directory-id",
    display_name: "Example Care",
    claimed_at: "2026-09-01T00:00:00Z",
  };
  const tables = {
    email_log: [
      base,
      { ...base, id: "e2", provider_id: "public-slug" },
      {
        ...base,
        id: "e3",
        provider_id: "claimed-slug",
        status: "failed",
        error_message: "Suppressed: do-not-contact list",
        delivered_at: null,
        resend_id: null,
        first_clicked_at: null,
      },
      { ...base, id: "e4", recipient: "internal@olera.care" },
      { ...base, id: "e5", provider_id: "missing-id" },
      { ...base, id: "e6", created_at: "2026-09-07T00:00:00Z" },
    ],
    provider_activity: [
      { id: "a1", email_log_id: "e1", event_type: "notification_settings_viewed", created_at: "2026-09-03T12:00:00Z", metadata: {} },
      { id: "a2", email_log_id: "e1", event_type: "notification_settings_viewed", created_at: "2026-09-03T13:00:00Z", metadata: {} },
      { id: "a3", email_log_id: "e1", event_type: "notification_preference_saved", created_at: "2026-09-03T14:00:00Z", metadata: {key:"new_leads",channel:"sms",enabled:true,previous:false} },
      { id: "a4", email_log_id: "e2", event_type: "notification_preference_saved", created_at: "2026-09-01T00:00:00Z", metadata: {key:"new_leads",channel:"sms",enabled:true,previous:false} },
      { id: "a5", email_log_id: "e2", event_type: "notification_settings_viewed", created_at: "2026-09-20T00:00:00Z", metadata: {} },
      { id: "a6", email_log_id: "e3", event_type: "notification_settings_viewed", created_at: "2026-09-03T00:00:00Z", metadata: {} },
    ],
    business_profiles: [profile],
    "olera-providers": [{ slug: "public-slug", provider_id: "directory-id" }],
    provider_outreach_touchpoints: [
      {
        id: "t1",
        provider_id: "directory-id",
        touchpoint_type: "email_sent",
        created_at: "2026-08-30T00:00:00Z",
      },
    ],
  };
  const report = await loadProviderCommsReport(
    db(tables),
    "2026-09-01",
    "2026-09-07",
  );
  assert.equal(report.excludedInternal, 1);
  assert.equal(report.recipients.length, 4); // exclusive upper date boundary
  assert.equal(report.unresolved, 1);
  assert.equal(
    report.recipients.filter((r) => r.source === "outreach").length,
    3,
  );
  const stats = reporting.summarizeRecipients(report.recipients)[0];
  assert.equal(stats.settingsViewed, 1);
  assert.equal(stats.preferenceSaved, 1);
  assert.equal(stats.smsEnabled, 1);
  assert.equal(stats.providers, 2); // UUID, public slug and claimed slug collapse
  assert.equal(stats.attempts, 4);
  assert.equal(stats.delivered, 3);
  assert.equal(stats.clicked, 3); // clicks need not have an open webhook
  assert.equal(stats.suppressed, 1);
  assert.equal(stats.failed, 0);
  assert.equal(
    (
      await loadProviderCommsReport(
        db(tables),
        "2026-09-01",
        "2026-09-07",
        true,
      )
    ).recipients.length,
    5,
  );
  const late = {
    ...tables,
    provider_outreach_touchpoints: [
      { ...tables.provider_outreach_touchpoints[0], created_at: "2026-09-04" },
    ],
  };
  assert.equal(
    (
      await loadProviderCommsReport(db(late), "2026-09-01", "2026-09-07")
    ).recipients.filter((r) => r.source === "outreach").length,
    0,
  );
  await assert.rejects(() =>
    loadProviderCommsReport(
      db(tables, "provider_outreach_touchpoints"),
      "2026-09-01",
      "2026-09-07",
    ),
  );
  const many = {
    ...tables,
    email_log: Array.from({ length: 501 }, (_, i) => ({
      ...base,
      id: `e${String(i).padStart(4, "0")}`,
    })),
  };
  assert.equal(
    (await loadProviderCommsReport(db(many), "2026-09-01", "2026-09-07"))
      .recipients.length,
    501,
  );
  const ambiguous = {
    ...tables,
    business_profiles: [
      profile,
      {
        ...profile,
        id: "22222222-2222-4222-8222-222222222222",
        slug: "second-claim",
      },
    ],
  };
  assert.equal(
    (
      await loadProviderCommsReport(db(ambiguous), "2026-09-01", "2026-09-07")
    ).recipients.find((r) => r.id === "e2").source,
    "unresolved",
  );
  console.log(
    "Provider Comms checks passed: accounting, date boundaries, source timing, identity aliases, internal filtering, pagination and query failures.",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
