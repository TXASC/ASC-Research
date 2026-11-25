// Site Screen engine fixes (Nov 25): Dallas deed record, address guards, stacked adjoiners, address cleanup,
// request retries. screen.js is a browser script, so the pieces under test are lifted out of it by name.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const SRC = fs.readFileSync(path.join(__dirname, "..", "screen", "screen.js"), "utf8");

// cut one top-level declaration out of the source: from its first line to the line before the next
// top-level statement (screen.js starts every declaration at column 0 and indents its continuation lines)
const LINES = SRC.split("\n");
function cut(name){
  const re = new RegExp(`^(?:async\\s+)?(?:function\\s+${name}\\s*\\(|const\\s+${name}\\s*=)`);
  const i = LINES.findIndex(l => re.test(l)); if(i < 0) throw new Error("not found: " + name);
  let j = i + 1; while(j < LINES.length && !/^(const |let |var |function |async function |\/\*|\/\/|[A-Za-z_$])/.test(LINES[j])) j++;
  return LINES.slice(i, j).join("\n");
}

function load(names, extra = ""){
  const ctx = { console, URLSearchParams, Math, String, Number, Object, Array, Set, Map, Promise, setTimeout, clearTimeout, AbortController, JSON };
  vm.createContext(ctx);
  vm.runInContext(extra + "\n" + names.map(cut).join("\n") + "\n" + `this.__ = {${names.map(n=>n).join(",")}};`, ctx);
  return ctx.__;
}

test("Dallas deed: instrument and date read from the 2026 roll's Legal4", () => {
  const F = load(["blankNo", "parseLegal", "deedDate", "deedFrom"]);
  const d = F.deedFrom({AccountID:"440164400G0300000", AppraisalYr:2026, Legal1:"PRINCETON POINTE PH 1B REP", Legal2:"BLK G LOT 30", Legal3:"", Legal4:"INT201700146408 DD05192017 CO-DC"});
  assert.equal(d.inst, "201700146408");
  assert.equal(d.date, "05/19/2017");
});

test("Dallas deed: volume/page form and a two-digit year", () => {
  const F = load(["blankNo", "parseLegal", "deedDate", "deedFrom"]);
  const d = F.deedFrom({Legal1:"PRINCETON POINTE PH 1A REP", Legal2:"BLK K LOT 16", Legal4:"VOL94115/5563 DD051794 CO-DALLAS"});
  assert.equal(d.vol, "94115"); assert.equal(d.pg, "5563"); assert.equal(d.date, "05/17/1994");
});

test("deedDate ignores text that is not a date", () => {
  const F = load(["deedDate"]);
  assert.equal(F.deedDate("ADDN BLK 4 LOT 2"), null);
  assert.equal(F.deedDate("DD13402017"), null);
});

test("the Dallas source is the current roll, not the 2019 layer", () => {
  assert.ok(!/DallasTaxParcels\/FeatureServer\/0"\s*$/m.test(SRC.split("deeds: {")[1].split("},")[0]), "old Dallas layer still configured");
  assert.match(SRC, /Crm_public\/CrmLayers\/MapServer\/0", points:true/);
});

test("address guard: the city typed is kept apart from the street", () => {
  const F = load(["addrAsk"]);
  assert.deepEqual({...F.addrAsk("1714 Sherwood Dr, Irving, TX")}, {num:"1714", city:"IRVING", street:"SHERWOOD DR"});
  assert.deepEqual({...F.addrAsk("3400 W 7th St, Fort Worth, TX 76107")}, {num:"3400", city:"FORT WORTH", street:"W 7TH ST"});
  assert.equal(F.addrAsk("32.8227, -96.7673").num, null);
});

test("address guard: the house next door does not count as a match", () => {
  const F = load(["streetKey", "situsMatches"]);
  const ask = {askNum:"3400", askStreet:"W 7TH ST"};
  assert.equal(F.situsMatches("3400 W 7th St, Fort Worth, TX 76107", ask), true);
  assert.equal(F.situsMatches("3404 W 7th St, Fort Worth, TX 76107", ask), false);
  assert.equal(F.situsMatches("3400 Camp Bowie Blvd, Fort Worth", ask), false);
  assert.equal(F.situsMatches("5814 Vickery Blvd, Dallas, TX 75206", {askNum:"5814", askStreet:"VICKERY BLVD"}), true);
});

test("stacked condo records collapse to one neighbor with the other owners noted", () => {
  const F = load(["dedupeParcels"]);
  const ring = [[[-97.37,32.75],[-97.369,32.75],[-97.369,32.751],[-97.37,32.75]]];
  const list = ["A","B","C","D","E","F","G"].map((o,i)=>({oid:i, propId:"1460-5-16", owner:"OWNER " + o, ringsLL:ring}));
  list.push({oid:9, propId:"1460-5-17", owner:"NEXT DOOR", ringsLL:[[[-97.369,32.75],[-97.368,32.75],[-97.368,32.751],[-97.369,32.75]]]});
  const out = F.dedupeParcels(list);
  assert.equal(out.length, 2);
  assert.equal(out[0].owner, "OWNER A + 6 MORE");
  assert.equal(out[0].stacked, 7);
});

test("placeholder ZIPs are dropped from the site address", () => {
  const F = load(["fmtAddr"], 'const titleCase = t => String(t||"").toLowerCase().replace(/\\b\\w/g,c=>c.toUpperCase());');
  assert.equal(F.fmtAddr("2100 W WALL ST, MIDLAND, TX 000000"), "2100 W Wall St, Midland, TX");
  assert.ok(!/0000/.test(F.fmtAddr("2100 W WALL ST MIDLAND TX 00000")));
  assert.equal(F.fmtAddr("5814 VICKERY BLVD, DALLAS, TX 752061234"), "5814 Vickery Blvd, Dallas, TX 75206");
});

test("map reads retry a dropped request, then switch to a form POST", async () => {
  const calls = [];
  const extra = `const sleep = () => Promise.resolve(); const cacheKey = u => u; const cacheGet = async () => null; const cachePut = () => {};
    let n = 0; const fetch = async (url, opt) => { __calls.push((opt && opt.method) || "GET"); n++;
      if(n === 1) throw new TypeError("Failed to fetch"); return { ok:true, status:200, text: async () => '{"features":[]}' }; };`;
  const ctx = { console, URLSearchParams, Math, String, Promise, setTimeout, clearTimeout, AbortController, JSON, __calls: calls, Object };
  vm.createContext(ctx);
  vm.runInContext(extra + "\n" + ["ARC_RE", "fetchOnce", "retryable", "getJSON"].map(cut).join("\n") + "\nthis.__ = {getJSON};", ctx);
  const j = await ctx.__.getJSON("https://example.test/arcgis/rest/services/X/FeatureServer/0/query?where=1%3D1&f=json");
  assert.deepEqual(j, {features:[]});
  assert.deepEqual(calls, ["GET", "POST"]);
});

test("map reads do not retry a bad request", async () => {
  let n = 0;
  const ctx = { console, URLSearchParams, Math, String, Promise, setTimeout, clearTimeout, AbortController, JSON, Object,
    fetch: async () => { n++; return { ok:false, status:400, text: async () => "" }; } };
  vm.createContext(ctx);
  vm.runInContext(`const sleep = () => Promise.resolve(); const cacheKey = u => u; const cacheGet = async () => null; const cachePut = () => {};\n` +
    ["ARC_RE", "fetchOnce", "retryable", "getJSON"].map(cut).join("\n") + "\nthis.__ = {getJSON};", ctx);
  await assert.rejects(ctx.__.getJSON("https://example.test/a/query?f=json"));
  assert.equal(n, 1);
});

test("two different parcels with the same box and vertex count stay separate", () => {
  const F = load(["dedupeParcels"]);
  const a = {oid:1, propId:"A", owner:"WEST", ringsLL:[[[0,0],[1,0],[0,1],[0,0]]]}, b = {oid:2, propId:"B", owner:"EAST", ringsLL:[[[1,0],[1,1],[0,1],[1,0]]]};
  const out = F.dedupeParcels([a, b]);
  assert.equal(out.length, 2); assert.equal(out[0].owner, "WEST"); assert.equal(out[1].owner, "EAST");
});

test("TxDOT roads get one try so the OpenStreetMap fallback keeps its time", () => {
  assert.match(SRC, /resultRecordCount:1500, f:"json"\}\), \{\}, 9000, \{tries:1\}\)/);
});
