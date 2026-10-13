// SWP-6: Address · Map pin · Parcel ID. Each mode builds the request the tower already understands.
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../uistate.js");

test("address mode sends the text as typed", () => {
  assert.deepEqual(S.buildQuery("address", { text: " 2409 Stonegate Cir, Denton TX " }),
    { query: "2409 Stonegate Cir, Denton TX", county: null });
});

test("a plus code typed as an address goes through unchanged", () => {
  assert.equal(S.buildQuery("address", { text: "832Q+3VX Celina, Texas" }).query, "832Q+3VX Celina, Texas");
});

test("map pin mode sends pin: lat, lng with six decimals", () => {
  assert.deepEqual(S.buildQuery("pin", { lat: 33.30023751, lng: -96.91026562 }),
    { query: "pin: 33.300238, -96.910266", county: null });
});

test("map pin mode without a pin asks for one", () => {
  assert.equal(S.buildQuery("pin", {}).error, "Click the map to drop a pin on the property.");
});

test("parcel ID mode needs a county", () => {
  assert.equal(S.buildQuery("parcel", { text: "64337" }).error, "Choose the county for a parcel ID.");
  assert.deepEqual(S.buildQuery("parcel", { text: " 64337 ", county: "Denton" }),
    { query: "parcel 64337", county: "Denton" });
});
