// node --test tests/   — connection settings: old project by default, consolidated project by config.
const test = require("node:test");
const assert = require("node:assert/strict");
const { fromConfig } = require("../settings.js");

test("with no extra settings the page behaves exactly as before", () => {
  const s = fromConfig({ supabaseUrl: "https://x.supabase.co", supabaseKey: "k" });
  assert.equal(s.clientOptions, undefined);
  assert.equal(s.packagesBucket, "packages");
  assert.equal(s.uploadsBucket, "uploads");
});

test("the consolidated project sets the research schema and the renamed buckets", () => {
  const s = fromConfig({ schema: "research", packagesBucket: "research-packages", uploadsBucket: "research-uploads" });
  assert.deepEqual(s.clientOptions, { db: { schema: "research" } });
  assert.equal(s.packagesBucket, "research-packages");
  assert.equal(s.uploadsBucket, "research-uploads");
});

test("a missing config object does not throw", () => {
  assert.equal(fromConfig(undefined).packagesBucket, "packages");
  assert.equal(fromConfig(null).clientOptions, undefined);
});
