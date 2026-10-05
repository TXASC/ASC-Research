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
