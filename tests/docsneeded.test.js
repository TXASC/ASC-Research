// node --test tests/docsneeded.test.js tests/acquire.test.js tests/uistate.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("../docsneeded.js");

const items = [
  { target_id: "a", label: "Subject property", class: "deed", status: "not_started", version: 0 },
  { target_id: "b", label: "Subject property", class: "plat", status: "verified", version: 2 },
  { target_id: "c", label: "Adjoining parcel 1", class: "deed", status: "unavailable_online", version: 1 },
];

test("status requests carry the base version and a client id", () => {
  const r = D.statusRequest(items[0], "searching", "tried the number", "cid-1");
  assert.deepEqual(r, { target_id: "a", status: "searching", note: "tried the number", base_version: 0, client_request_id: "cid-1" });
});

test("tower-only states can never be requested from the page", () => {
  for (const s of ["uploaded", "verified", "rejected", "acquired"]) assert.throws(() => D.statusRequest(items[0], s, null, "x"));
});

test("old cart marks become a preview of claims, never verified states", () => {
  const stored = { items: [
    { target_id: "a", status: "purchased" }, { target_id: "c", status: "searched" },
    { target_id: "b", status: "uploaded" }, { target_id: "zzz", status: "purchased" }, { target_id: "a", status: "not_opened" }] };
  const rows = D.cartPreview(stored, items);
  assert.deepEqual(rows.map((r) => [r.target_id, r.status]), [["a", "purchased"], ["c", "searched"]]);
  const req = D.importRequest(rows, "cid-2");
  assert.equal(req.action, "import_cart");
  assert.ok(req.marks.every((m) => ["searched", "purchased"].includes(m.status)));
});

test("verified and not-available-online count as resolved", () => {
  assert.deepEqual(D.progress(items), { total: 3, resolved: 2, open: 1 });
});
