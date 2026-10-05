// node --test tests/*.test.js   — F-4 (Castellon 2026-10-05): Role · Owner · Deed info · Address · Legal.
const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("../docsneeded.js");

const block = [
  { parcel_id: "43009312", role: "Subject", owner: "MRW INVESTORS LLC", deed_info: "Search grantee",
    address: "12 CASTELLON DR", legal: "WESTLAKE ENTRADA Block F Lot 6R", shared: null, accounts: 1 },
  { parcel_id: "43009304", role: "Direct adjoiner", owner: "KA HOME CONSTRUCTION INC",
    deed_info: "D223026631 · recorded 2023-08-03", address: "14 CASTELLON DR",
    legal: "WESTLAKE ENTRADA Block F Lot 5R", shared: 87.2, accounts: 3 },
];

test("the parcel table has the five F-4 columns in order", () => {
  assert.deepEqual(D.parcelTable(block).header, ["#", "Role", "Owner", "Deed info", "Address", "Legal"]);
});

test("rows carry deed info and the full legal, never shared feet or account counts", () => {
  const rows = D.parcelTable(block).rows;
  assert.deepEqual(rows[1], ["2", "Direct adjoiner", "KA HOME CONSTRUCTION INC", "D223026631 · recorded 2023-08-03",
    "14 CASTELLON DR", "WESTLAKE ENTRADA Block F Lot 5R"]);
  assert.equal(rows[0][3], "Search grantee");
  assert.ok(!rows.flat().some((c) => /87\.2|accounts/.test(c)));
});

test("an older summary without deed_info still reads 'Search grantee'", () => {
  assert.equal(D.parcelTable([{ role: "Subject" }]).rows[0][3], "Search grantee");
  assert.deepEqual(D.parcelTable([{ role: "Subject" }]).rows[0].slice(2), ["", "Search grantee", "", ""]);
});

test("F-5: the per-row button reads 'Attach deed PDF' (plat rows: 'Attach plat PDF')", () => {
  assert.equal(D.attachLabel({ class: "deed" }), "Attach deed PDF");
  assert.equal(D.attachLabel({ class: "plat" }), "Attach plat PDF");
  assert.equal(D.attachLabel({}), "Attach deed PDF");
});

test("DAL-4: the 'What to pick' line shows only when the tower sends one", () => {
  assert.equal(D.pickNote({ what_to_pick: "Grantee EDE PROPERTIES LLC · around 10/2024 · Warranty Deed or Special Warranty Deed" }),
    "What to pick: Grantee EDE PROPERTIES LLC · around 10/2024 · Warranty Deed or Special Warranty Deed");
  assert.equal(D.pickNote({ class: "plat" }), null);
});

test("F-3: one question about the best candidate, others listed without reasons", () => {
  const s = { confirm: { parcel_uuid: "u1", question: "Is this the subject? 12 CASTELLON DR — MRW INVESTORS LLC — LOT 6R" },
    candidates: [{ parcel_uuid: "u1", parcel_id: "43009312", situs: "12 CASTELLON DR", owner: "MRW INVESTORS LLC", legal: "LOT 6R" },
      { parcel_uuid: "u2", parcel_id: "43009304", situs: "14 CASTELLON DR", owner: "KA HOME", legal: "LOT 5R", reasons: ["x"] }] };
  const v = D.confirmView(s);
  assert.equal(v.question, s.confirm.question);
  assert.deepEqual(v.yes, { parcel_uuid: "u1", reason: "Yes — confirmed on the research page" });
  assert.deepEqual(v.others.map((o) => o.label), ["14 CASTELLON DR — KA HOME — LOT 5R"]);
  assert.ok(!JSON.stringify(v).includes("\"x\""));
  assert.equal(D.confirmView({ candidates: [] }), null);
});
