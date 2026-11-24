// node --test tests/planner.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../plat/planner.js");

test("published Dallas rows keep the city's spacing: Wed submittal, Friday paper, Thursday hearing", () => {
  for (const [s, , c] of P.DALLAS_2026) {
    assert.equal(new Date(s + "T12:00:00Z").getUTCDay(), 3, s);
    assert.equal(new Date(c + "T12:00:00Z").getUTCDay(), 4, c);
  }
});

test("projected rows start after the published calendar and land on Thursdays", () => {
  const rows = P.dallasRows("2027-12-31").filter(r => r.projected);
  assert.ok(rows.length >= 20);
  assert.ok(rows[0].cpc > P.DALLAS_PUBLISHED_THROUGH);
  for (const r of rows) {
    assert.equal(new Date(r.cpc + "T12:00:00Z").getUTCDay(), 4);
    assert.equal(new Date(r.submit + "T12:00:00Z").getUTCDay(), 3);
    assert.equal(new Date(r.paper + "T12:00:00Z").getUTCDay(), 5);
  }
  assert.equal(rows[0].cpc, "2027-01-21");
});

test("upcoming skips closed windows; the open window on its Thursday still counts", () => {
  assert.equal(P.upcoming("2026-11-19", 1)[0].cpc, "2026-12-17");
  assert.equal(P.upcoming("2026-11-20", 1)[0].projected, true);
});

test("planning target leaves the prep time before the window opens", () => {
  const t = P.planningTarget("2026-11-24", 42);
  assert.ok(P.diffDays("2026-11-24", t.submit) >= 42);
  assert.equal(t.projected, true);
  const t2 = P.planningTarget("2026-03-01", 42);
  assert.equal(t2.cpc, "2026-05-21");
  assert.equal(t2.projected, false);
});

test("legal descriptions read as platted or acreage", () => {
  assert.equal(P.plattedFromLegal("COMMERCIAL ADDN BLK A LOT 3 INT 2021-0098214"), "platted");
  assert.equal(P.plattedFromLegal("ABST 902 PG 120 TR 3 ACS 61.5"), "acreage");
  assert.equal(P.plattedFromLegal(""), "unknown");
});

test("coverage: Dallas is tier 1, another city tier 2, no city tier 3; El Paso is out of range", () => {
  assert.equal(P.tierFor("Dallas", { lat: 32.78, lng: -96.8 }).tier, 1);
  assert.equal(P.tierFor("Plano", { lat: 33.02, lng: -96.7 }).tier, 2);
  const c = P.tierFor(null, { lat: 32.5, lng: -97.6 });
  assert.equal(c.tier, 3); assert.ok(c.inRange);
  assert.equal(P.tierFor("El Paso", { lat: 31.76, lng: -106.49 }).inRange, false);
});

test("plat type follows the goal and whether the land is already platted", () => {
  assert.equal(P.platType("combine", "platted").name, "Replat");
  assert.match(P.platType("split", "acreage").name, /minor plat/);
  assert.equal(P.platType("subdivide", "acreage").name, "Preliminary plat, then final plat");
});

test("replats ask for the prior plat; first plats do not", () => {
  assert.ok(P.paperwork("split", "platted", 1).some(x => x.id === "prior"));
  assert.ok(!P.paperwork("first", "acreage", 1).some(x => x.id === "prior"));
});

test("the Dallas path carries calendar dates and the comment deadline 13 days out", () => {
  const target = P.planningTarget("2026-03-01", 42);
  const steps = P.path({ tier: 1, goal: "split", today: "2026-03-01", target });
  const by = Object.fromEntries(steps.map(s => [s.id, s]));
  assert.equal(by.cpc.when, "2026-05-21");
  assert.equal(by.comments.when, "2026-05-08");
  assert.equal(P.path({ tier: 2, goal: "split", today: "2026-03-01" }).find(s => s.id === "cpc").when, null);
});
