// SWP-4: boundaries read "Frontage: US 380 (TxDOT)"; an assumed right-of-way is stated, never flagged as a question.
const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("../docsneeded.js");

test("a road boundary reads as a frontage line", () => {
  const b = { type: "right_of_way", type_label: "Street / right-of-way", label: "HWY 380", shared: 3049.55,
              frontage: "Frontage: HWY 380 (TxDOT)", advisory: false };
  assert.equal(D.boundaryLine(b), "Frontage: HWY 380 (TxDOT) (3049.6 ft)");
});

test("an assumed right-of-way is not marked advisory", () => {
  const b = { type: "right_of_way", label: "Unmapped ROW (assumed)", shared: 1586.5, assumed: true,
              frontage: "Frontage: unmapped right-of-way (assumed)", advisory: false };
  assert.equal(D.boundaryLine(b), "Frontage: unmapped right-of-way (assumed) (1586.5 ft)");
});

test("an older summary without frontage text keeps the old line", () => {
  const b = { type: "unknown_gap", type_label: "Unresolved frontage", label: "x", shared: 24.2, advisory: true };
  assert.equal(D.boundaryLine(b), "Unresolved frontage — x (24.2 ft) · advisory");
});
