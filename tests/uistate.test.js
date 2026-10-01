// node --test tests/   — Current search / History / New search state transitions.
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../uistate.js");

function mem() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m };
}
const reqs = [
  { id: "c", status: "running", created_at: "3" },
  { id: "b", status: "done", created_at: "2" },
  { id: "a", status: "done", created_at: "1" },
];

test("default view is Current search", () => {
  assert.equal(S.initial().activeTab, "current");
});

test("first visit resumes a running search; never an old finished one", () => {
  const s = S.resolve(S.initial(), reqs);
  assert.equal(s.currentRequestId, "c");
  const s2 = S.resolve(S.initial(), reqs.slice(1));
  assert.equal(s2.currentRequestId, null);
});

test("New search moves the current request to History without deleting it", () => {
  let s = S.submitted(S.initial(), "c");
  assert.deepEqual(S.history(s, reqs).map((r) => r.id), ["b", "a"]);
  s = S.newSearch(s);
  assert.equal(s.currentRequestId, null);
  assert.equal(s.activeTab, "current");
  assert.deepEqual(S.history(s, reqs).map((r) => r.id), ["c", "b", "a"]);   // running search immediately in History
});

test("after New search, a refresh does not auto-select the newest request", () => {
  const store = mem();
  const s = S.newSearch(S.submitted(S.initial(), "c"));
  S.save("u1", store, s);
  const reloaded = S.resolve(S.load("u1", store), reqs);
  assert.equal(reloaded.currentRequestId, null);
  assert.equal(reloaded.newSearchMode, true);
});

test("refresh keeps the current search per signed-in user", () => {
  const store = mem();
  S.save("u1", store, S.submitted(S.initial(), "b"));
  S.save("u2", store, S.submitted(S.initial(), "a"));
  assert.equal(S.resolve(S.load("u1", store), reqs).currentRequestId, "b");
  assert.equal(S.resolve(S.load("u2", store), reqs).currentRequestId, "a");
});

test("opening a History item does not replace the current search", () => {
  let s = S.submitted(S.initial(), "c");
  s = S.openHistory(s, "a");
  assert.equal(s.activeTab, "history");
  assert.equal(s.historyDetailId, "a");
  assert.equal(s.currentRequestId, "c");
  s = S.makeCurrent(s, "a");                                           // only an explicit action switches it
  assert.equal(s.currentRequestId, "a");
  assert.equal(s.activeTab, "current");
});

test("submitting a new search makes it current", () => {
  const s = S.submitted(S.newSearch(S.submitted(S.initial(), "b")), "d");
  assert.equal(s.currentRequestId, "d");
  assert.equal(s.newSearchMode, false);
});

test("a vanished current request is cleared, not replaced", () => {
  const s = S.resolve(Object.assign(S.submitted(S.initial(), "zzz"), { stored: true }), reqs);
  assert.equal(s.currentRequestId, null);
});

test("blocked storage falls back to defaults", () => {
  const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.equal(S.load("u1", broken).currentRequestId, null);
  S.save("u1", broken, S.initial());                                    // must not throw
});
