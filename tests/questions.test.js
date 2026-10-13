// SWP-7: Needed → Uploaded → Confirmed (+ Can't find it), one plain question with buttons, no reasons on the page.
const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("../docsneeded.js");

test("the page badge is the collapsed status", () => {
  assert.equal(D.pageBadge({ page_status: "needed" }).label, "Needed");
  assert.equal(D.pageBadge({ page_status: "uploaded" }).label, "Uploaded");
  assert.equal(D.pageBadge({ page_status: "confirmed" }).label, "Confirmed");
  assert.equal(D.pageBadge({ page_status: "cant_find" }).label, "Can't find it");
  // an older summary without page_status still collapses
  assert.equal(D.pageBadge({ status: "purchased_downloaded" }).label, "Needed");
  assert.equal(D.pageBadge({ status: "verified" }).label, "Confirmed");
});

test("'Can't find it' and its undo are ordinary checklist requests", () => {
  const it = { target_id: "t1", version: 3, page_status: "needed" };
  const r = D.cantFind(it, "cid-1");
  assert.equal(r.status, "unavailable_online");
  assert.equal(r.target_id, "t1");
  assert.equal(r.base_version, 3);
  assert.equal(D.cantFind({ ...it, page_status: "cant_find" }, "cid-2").status, "not_started");
});

test("a question becomes buttons; 'Not sure' sends nothing", () => {
  const q = { review_id: "r1", text: "150 ft of the west boundary faces no mapped neighbor — is it a road, or a neighbor to add?",
    buttons: [{ label: "It's a road", action: "reject", reason: "page: it's a road" },
              { label: "It's a neighbor", action: "accept", reason: "page: a neighbor to add" },
              { label: "Not sure — office", action: null, reason: null }] };
  const acts = D.questionActions(q);
  assert.deepEqual(acts.map((a) => a.label), ["It's a road", "It's a neighbor", "Not sure — office"]);
  assert.deepEqual(acts[0].decision, { kind: "review_resolution",
    payload: { review_id: "r1", action: "reject", reason: "page: it's a road" } });
  assert.equal(acts[2].decision, null);
});
