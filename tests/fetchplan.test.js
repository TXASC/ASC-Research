// node --test tests/   — what the page reads each poll (egress, 2026-10-11).
const test = require("node:test");
const assert = require("node:assert/strict");
const F = require("../fetchplan.js");

const row = (id, updated_at, created_at = "2026-10-01T00:00:00Z", status = "done") => ({ id, updated_at, created_at, status });
const T0 = Date.parse("2026-10-11T18:00:00Z");

test("first read is full; the next is a delta after the newest updated_at, as the server wrote it", () => {
  let c = F.initial();
  const r1 = F.listRead(c, T0);
  assert.deepEqual(r1, { full: true });
  c = F.mergeList(c, r1, [row("a", "2026-10-11T17:00:00+00:00"), row("b", "2026-10-11T17:30:00.752057+00:00")], T0).cache;
  assert.deepEqual(F.listRead(c, T0 + 15000), { after: "2026-10-11T17:30:00.752057+00:00" });
  assert.deepEqual(F.listRead(c, T0 + 15000, true), { full: true });       // a user action reads everything
});

test("timestamps are ordered to the microsecond (a JS Date stops at the millisecond)", () => {
  assert.ok(F.micros("2026-10-11T17:30:00.752057+00:00") > F.micros("2026-10-11T17:30:00.752+00:00"));
  assert.ok(F.micros("2026-10-11T17:30:00.75+00:00") > F.micros("2026-10-11T17:30:00+00:00"));
  assert.equal(F.micros("2026-10-11T12:30:00-05:00"), F.micros("2026-10-11T17:30:00+00:00"));
  const c = F.mergeList(F.initial(), { full: true }, [row("a", "2026-10-11T17:30:00.752+00:00"),
    row("b", "2026-10-11T17:30:00.752057+00:00")], T0).cache;
  assert.equal(c.seen, "2026-10-11T17:30:00.752057+00:00");
});

test("a delta merges changed rows and keeps the rest; the list stays newest-first", () => {
  let c = F.initial();
  c = F.mergeList(c, { full: true }, [row("a", "2026-10-11T17:00:00Z", "1"), row("b", "2026-10-11T17:00:00Z", "2")], T0).cache;
  const m = F.mergeList(c, { after: "x" }, [{ ...row("a", "2026-10-11T17:05:00Z", "1"), status: "running" },
    row("c", "2026-10-11T17:06:00Z", "3")], T0 + 15000);
  assert.deepEqual(m.list.map((r) => r.id), ["c", "b", "a"]);
  assert.equal(m.list.find((r) => r.id === "a").status, "running");
  assert.equal(m.cache.seen, "2026-10-11T17:06:00Z");
});

test("an empty delta keeps the watermark", () => {
  let c = F.mergeList(F.initial(), { full: true }, [row("a", "2026-10-11T17:00:00Z")], T0).cache;
  c = F.mergeList(c, { after: "x" }, [], T0 + 15000).cache;
  assert.equal(c.seen, "2026-10-11T17:00:00Z");
});

test("a full read every 10 minutes drops rows deleted in between", () => {
  let c = F.mergeList(F.initial(), { full: true }, [row("a", "2026-10-11T17:00:00Z"), row("b", "2026-10-11T17:00:00Z")], T0).cache;
  assert.ok("after" in F.listRead(c, T0 + F.FULL_EVERY_MS - 1));
  const read = F.listRead(c, T0 + F.FULL_EVERY_MS);
  assert.deepEqual(read, { full: true });
  assert.deepEqual(F.mergeList(c, read, [row("a", "2026-10-11T17:00:00Z")], T0 + F.FULL_EVERY_MS).list.map((r) => r.id), ["a"]);
});

test("an empty list keeps full reads, so the browser clock is never the watermark", () => {
  const c = F.mergeList(F.initial(), { full: true }, [], T0).cache;
  assert.deepEqual(F.listRead(c, T0 + 15000), { full: true });
});

test("the list is capped at 100 rows", () => {
  const rows = Array.from({ length: 120 }, (_, i) => row("r" + i, "2026-10-11T17:00:00Z", String(1000 + i)));
  assert.equal(F.mergeList(F.initial(), { full: true }, rows, T0).list.length, 100);
});

test("door status is read at most once a minute", () => {
  let c = F.initial();
  assert.ok(F.doorDue(c, T0));
  c = { ...c, doorAt: T0 };
  assert.ok(!F.doorDue(c, T0 + 59000));
  assert.ok(F.doorDue(c, T0 + 60000));
});

test("uploads are re-read only when they can have changed", () => {
  const req = row("a", "2026-10-11T17:00:00Z");
  let c = F.initial();
  assert.ok(F.uploadsDue(c, req, T0));                                      // first time on screen
  c = F.storeUploads(c, req, [{ id: "u", status: "accepted" }], T0);
  assert.ok(!F.uploadsDue(c, req, T0 + 15000));                             // nothing moved
  assert.ok(F.uploadsDue(c, { ...req, updated_at: "2026-10-11T17:01:00Z" }, T0 + 15000));   // tower touched it
  assert.ok(F.uploadsDue(F.touched(c, T0 + 10000), req, T0 + 15000));       // user just acted
  const later = F.storeUploads(F.touched(c, T0), req, [{ id: "u", status: "accepted" }], T0 + F.HOT_AFTER_ACTION_MS - 1000);
  assert.ok(!F.uploadsDue(later, req, T0 + F.HOT_AFTER_ACTION_MS));          // hot window over, backstop not due
  assert.ok(F.uploadsDue(c, req, T0 + F.UPLOADS_EVERY_MS));                 // backstop
  const busy = F.storeUploads(F.initial(), req, [{ id: "u", status: "processing" }], T0);
  assert.ok(F.uploadsDue(busy, req, T0 + 3000));                            // still being checked
  assert.ok(!F.uploadsDue(c, null, T0));
});

test("poll cadence: 60 s idle, 3 s only while something on screen is moving, none while hidden", () => {
  const done = { status: "done" }, running = { status: "running" }, queued = { status: "queued" };
  assert.equal(F.nextPoll(false, [done], []), 60000);
  assert.equal(F.nextPoll(false, [], []), 60000);
  assert.equal(F.nextPoll(false, [done, running], []), 3000);
  assert.equal(F.nextPoll(false, [queued], []), 3000);
  assert.equal(F.nextPoll(false, [done], [{ status: "processing" }]), 3000);   // a file is being checked
  assert.equal(F.nextPoll(false, [done], [{ status: "accepted" }]), 60000);
  assert.equal(F.nextPoll(true, [running], [{ status: "processing" }]), null);  // hidden tab: paused
});
