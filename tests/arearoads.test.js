// DEMO-2: the affected area stops at major roads and crosses local streets one hop; the page says which.
const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("../docsneeded.js");

const ROADS = [
  { name: "FM 407", tier: "major", frontage_ft: 2177, crossed: false },
  { name: "COPPER CANYON RD", tier: "major", frontage_ft: 3020, crossed: false },
  { name: "BROWNWOOD AVE", tier: "local", frontage_ft: 860, crossed: true },
  { name: "TANGLEWOOD DR", tier: "local", frontage_ft: 32, crossed: false },
];

test("names the major roads it stops at and the local streets it crossed", () => {
  assert.equal(D.areaRoadsLine(ROADS), "Stops at: Copper Canyon Rd, FM 407 · Crosses: Brownwood Ave");
});

test("no roads, or an older summary, gives no line", () => {
  assert.equal(D.areaRoadsLine([]), null);
  assert.equal(D.areaRoadsLine(undefined), null);
});

test("only majors: no 'Crosses' part", () => {
  assert.equal(D.areaRoadsLine(ROADS.slice(0, 1)), "Stops at: FM 407");
});
