// node --test tests/acquire.test.js tests/uistate.test.js   — Research cart / acquisition workspace.
const test = require("node:test");
const assert = require("node:assert/strict");
const A = require("../acquire.js");

const summary = () => ({
  county: "Denton",
  acquisition: { county: "Denton", mode: "workspace", supported: false, portal_url: "https://denton.tx.publicsearch.us/",
    label: "Acquisition workspace — county cart prefill unavailable" },
  instruments: [
    { target_id: "d1", class: "deed", role: "Subject", search_strategy: A.EXACT, clerk_search_value: "2018-137347", cad_reference_raw: "2018-137347" },
    { target_id: "d2", class: "deed", role: "Direct adjoiner", search_strategy: A.EXACT, clerk_search_value: "2024-138857", cad_reference_raw: "2024-138857" },
    { target_id: "d3", class: "deed", role: "Direct adjoiner", search_strategy: "legacy_document_number", clerk_search_value: null, cad_reference_raw: "00-57476" },
    { target_id: "p1", class: "plat", role: "Subject", search_strategy: "plat_by_subdivision", reference: "WICHITA CHASE PHASE 3" },
  ],
});
const prefill = { county: "Denton", mode: "county_cart", supported: true, portal_url: "https://x.test/",
  url_template: "https://x.test/cart?docs={numbers}", separator: "," };

test("multiple validated deeds and a plat produce one manifest with exact records preselected", () => {
  const m = A.fromSummary("r1", summary(), null, "T0");
  assert.equal(m.items.length, 4);
  assert.deepEqual(m.items.filter((x) => x.selected).map((x) => x.target_id), ["d1", "d2"]);
  assert.equal(m.created_at, "T0");
  assert.ok(A.valid(m));
});

test("unverified legacy numbers cannot silently enter", () => {
  let m = A.fromSummary("r1", summary(), null, "T0");
  m = A.setSelected(m, "d3", true);                                  // no explicit flag: ignored
  assert.equal(m.items.find((x) => x.target_id === "d3").selected, false);
  m = A.setSelected(m, "d3", true, { explicit: true });
  const h = A.handoff(m, prefill, "T1");
  assert.ok(!h.url.includes("00-57476"));                            // even when chosen, never in the county cart
  assert.ok(h.workspaceItems.some((x) => x.target_id === "d3"));
  const forged = Object.assign({}, m, { items: m.items.map((x) => (x.target_id === "p1" ? Object.assign({}, x, { selected: true }) : x)) });
  assert.equal(A.valid(forged), false);                              // the DB check rejects an unchosen unverified item
});

test("removing an item keeps it out of the handoff", () => {
  const m = A.setSelected(A.fromSummary("r1", summary(), null, "T0"), "d2", false);
  const h = A.handoff(m, prefill, "T1");
  assert.equal(h.url, "https://x.test/cart?docs=2018-137347");
  assert.deepEqual(h.cartItems.map((x) => x.target_id), ["d1"]);
});

test("one handoff opens one county URL; the fallback opens the portal home", () => {
  const m = A.fromSummary("r1", summary(), null, "T0");
  const sup = A.handoff(m, prefill, "T1");
  assert.equal(typeof sup.url, "string");
  assert.equal(sup.url, "https://x.test/cart?docs=" + encodeURIComponent("2018-137347,2024-138857"));
  const ws = A.handoff(m, summary().acquisition, "T1");
  assert.equal(ws.url, "https://denton.tx.publicsearch.us/");
  assert.deepEqual(ws.cartItems, []);
  assert.deepEqual(ws.workspaceItems.map((x) => x.target_id), ["d1", "d2"]);
  assert.equal(ws.manifest.handed_off_at, "T1");
});

test("a session failure leaves the manifest resumable with choices and statuses intact", () => {
  let m = A.fromSummary("r1", summary(), null, "T0");
  m = A.mark(A.mark(m, "d1", "purchased"), "d2", "searched");
  m = A.setSelected(m, "d3", true, { explicit: true });
  const row = JSON.parse(JSON.stringify(A.forDb(A.handoff(m, summary().acquisition, "T1").manifest)));
  const resumed = A.fromSummary("r1", summary(), A.fromDb(row), "T9");
  assert.equal(resumed.created_at, "T0");                            // stable stamp, not re-issued
  assert.equal(resumed.handed_off_at, "T1");
  assert.equal(resumed.items.find((x) => x.target_id === "d1").status, "purchased");
  assert.equal(resumed.items.find((x) => x.target_id === "d3").chosen, true);
  assert.equal(A.next(resumed).target_id, "d2");                     // next record to work on
});

test("verified uploads mark records uploaded; statuses are a fixed list", () => {
  const s = summary();
  s.instruments[0].documents = [{ filename: "a.pdf", state: "verified" }];
  const m = A.fromSummary("r1", s, null, "T0");
  assert.equal(m.items.find((x) => x.target_id === "d1").status, "uploaded");
  assert.equal(A.mark(m, "d2", "paid-by-asc"), m);
});

test("a record that loses validation drops out unless the user chose it", () => {
  const prev = A.fromSummary("r1", summary(), null, "T0");
  const s = summary();
  s.instruments[1].search_strategy = "legacy_document_number";
  s.instruments[1].clerk_search_value = null;
  const m = A.fromSummary("r1", s, prev, "T1");
  assert.equal(m.items.find((x) => x.target_id === "d2").selected, false);
  assert.ok(A.valid(m));
});
