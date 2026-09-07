// Regression for Provider Comms recipient deep links and out-of-order email-log responses.
const fs = require("node:fs"),
  path = require("node:path");
const root = path.resolve(__dirname, "..");
const req = require("node:module").createRequire(
  path.join(root, "package.json"),
);
const ts = req("typescript");
const { Window } = req("happy-dom");
const win = new Window();
Object.assign(globalThis, {
  window: win,
  self: win,
  document: win.document,
  HTMLElement: win.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: win.navigator,
  configurable: true,
});
const React = req("react"),
  { createRoot } = req("react-dom/client"),
  assert = require("node:assert/strict");
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const mod = { exports: {} };
  cache.set(file, mod.exports);
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  new Function("require", "module", "exports", code)(
    (id) => {
      if (id === "next/navigation")
        return { useSearchParams: () => searchParams };
      if (id.startsWith("@/")) {
        const p = path.join(root, id.slice(2));
        return load(fs.existsSync(p + ".tsx") ? p + ".tsx" : p + ".ts");
      }
      return req(id);
    },
    mod,
    mod.exports,
  );
  return mod.exports;
}
const searchParams = new URLSearchParams(
  "email_type=provider_welcome&search=provider%40example.com",
);
const View = load(path.join(root, "app/admin/emails/page.tsx")).default;
const pending = [];
globalThis.fetch = (url, options = {}) =>
  new Promise((resolve) => pending.push({ url, options, resolve }));
const record = (id) => ({
  id,
  recipient: "provider@example.com",
  sender: "support@example.com",
  subject: id,
  email_type: "provider_welcome",
  recipient_type: "provider",
  status: "failed",
  created_at: "2026-09-01T12:00:00Z",
  error_message: "Suppressed: verified undeliverable",
});
async function main() {
  const target = document.createElement("div");
  document.body.append(target);
  const mounted = createRoot(target);
  await React.act(() => mounted.render(React.createElement(View)));
  assert.ok(pending[0].url.includes("search=provider%40example.com"));
  const failed = [...target.querySelectorAll("button")].find(
    (b) => b.textContent === "Failed",
  );
  await React.act(() => failed.click());
  assert.equal(pending.length, 2);
  await React.act(async () =>
    pending[1].resolve({
      ok: true,
      json: async () => ({
        emails: [record("NEW-FILTER"), record("SECOND-RECIPIENT")],
        total: 1,
      }),
    }),
  );
  await React.act(async () =>
    pending[0].resolve({
      ok: true,
      json: async () => ({ emails: [record("STALE-FILTER")], total: 1 }),
    }),
  );
  assert.ok(
    target.textContent.includes("NEW-FILTER"),
    "latest filter response must remain visible",
  );
  assert.ok(
    !target.textContent.includes("STALE-FILTER"),
    "older response must not overwrite current filter",
  );
  const emailRows = target.querySelectorAll("tbody tr");
  await React.act(() => emailRows[0].click());
  await React.act(() => emailRows[1].click());
  await React.act(async () =>
    pending[3].resolve({
      ok: true,
      json: async () => ({ email: { html_body: "<p>RIGHT-PREVIEW</p>" } }),
    }),
  );
  await React.act(async () =>
    pending[2].resolve({
      ok: true,
      json: async () => ({ email: { html_body: "<p>WRONG-PREVIEW</p>" } }),
    }),
  );
  assert.equal(
    target.querySelector("iframe").getAttribute("srcdoc"),
    "<p>RIGHT-PREVIEW</p>",
    "older preview must not overwrite the selected email",
  );
  await React.act(() => mounted.unmount());
  console.log("Email log response-race regression passed.");
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
