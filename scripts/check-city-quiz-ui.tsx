import assert from "node:assert/strict";
import { Window } from "happy-dom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import CityQuizFunnel from "../components/admin/CityQuizFunnel";

async function main() {
  const window = new Window();
  Object.assign(globalThis, { window, document: window.document, HTMLElement: window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const calls: string[] = [];
  let fail = false;
  globalThis.fetch = async (input) => {
    calls.push(String(input));
    return { ok: !fail, json: async () => fail ? { error: "Unavailable" } : {
      from: "2026-09-10T07:22:00Z", to: "2026-09-11T08:00:00Z", lastEventAt: "2026-09-10T10:00:00Z",
      excludedLandings: 2, ambiguousVisits: 0, unmatchedEvents: 1,
      rows: [{ slug: "dallas-tx", channel: "google", visitors: 10, visits: 11, starts: 3, contacts: 4, submissions: 1 },
        { slug: "charlotte-nc", channel: "meta", visitors: 0, visits: 0, starts: 0, contacts: 0, submissions: 0 }],
    } } as Response;
  };
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  await act(async () => { root.render(<CityQuizFunnel />); });
  const initialRange = new URL(calls[0], "https://olera.com").searchParams;
  assert.equal(Date.parse(initialRange.get("to")!) - Date.parse(initialRange.get("from")!), 7 * 86400000);
  assert.equal(container.querySelector("select")!.value, "7");
  assert.match(container.textContent!, /30% of visitors/);
  assert.match(container.textContent!, /40% of visitors/);
  assert.doesNotMatch(container.textContent!, /133%/);
  assert.match(container.textContent!, /not a matched fourth stage/);
  const select = container.querySelectorAll("select")[1];
  await act(async () => { select.value = "charlotte-nc"; select.dispatchEvent(new window.Event("change", { bubbles: true })); });
  assert.match(container.textContent!, /No qualifying paid visitors/);
  assert.equal(container.querySelectorAll("tbody tr").length, 1);
  fail = true;
  await act(async () => { container.querySelector("button")!.click(); });
  assert.match(container.textContent!, /Results are unavailable, not zero/);
  assert.equal(container.querySelector("table"), null);
  assert.equal(container.querySelectorAll("select")[1].value, "charlotte-nc", "City filter remains visible after a failed fetch");
  await act(async () => root.unmount());
  window.happyDOM.abort();
  console.log("PASS: rolling seven-day request, rates, city filter, empty view and unavailable-data state");
}
main().catch(e => { console.error(e); process.exitCode = 1; });
