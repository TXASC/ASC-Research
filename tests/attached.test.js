// SWP-2: a file attached from a row stays on that row, and the uploads table says so plainly.
const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("../docsneeded.js");

const instruments = [{ target_id: "x", class: "deed", reference: "2025-109700" }];

test("the tower's attached label is shown as-is", () => {
  const u = { association: { target_id: "x", attached_label: "Attached to: Subject deed 2025-109700 — awaiting office confirm" } };
  assert.equal(D.attachedText(u, instruments), "Attached to: Subject deed 2025-109700 — awaiting office confirm");
});

test("an older upload without a label still names its record", () => {
  assert.equal(D.attachedText({ association: { target_id: "x" } }, instruments), "Attached to: deed 2025-109700");
});

test("an upload with no record never asks the user to choose", () => {
  const t = D.attachedText({ association: {} }, instruments);
  assert.equal(t, "Waiting for the office to file it");
  assert.doesNotMatch(t, /choose/i);
});

test("the change control is offered only once the tower has processed the file", () => {
  assert.equal(D.canChangeTarget({ status: "processing" }), false);
  assert.equal(D.canChangeTarget({ status: "uploaded" }), false);
  assert.equal(D.canChangeTarget({ status: "needs_review", association: { document_id: "d" } }), true);
});
