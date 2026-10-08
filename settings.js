// Connection settings resolved from window.ASC_RESEARCH (config.js) — pure, shared by the page and its Node tests.
// The same page serves the old ASC-Research project (defaults) and the consolidated ASC project, where the tables live
// in the `research` schema and the buckets are renamed. Cutover and rollback are therefore a config.js change only.
(function (root) {
  "use strict";
  function fromConfig(cfg) {
    cfg = cfg || {};
    return {
      // supabase-js: pass a schema only when one is configured (default = the public schema, as before)
      clientOptions: cfg.schema ? { db: { schema: String(cfg.schema) } } : undefined,
      packagesBucket: cfg.packagesBucket || "packages",
      uploadsBucket: cfg.uploadsBucket || "uploads",
    };
  }
  // Checks the two "new password" fields before anything is sent. The server still enforces its own rules
  // (minimum length, leaked-password check); this only catches typos early. Returns "" when fine.
  function passwordProblem(a, b) {
    if (!a) return "Type a new password.";
    if (a !== b) return "The two passwords do not match.";
    return "";
  }

  // What "Try again" sends: exactly what was submitted the first time (nothing to retype). null if it cannot be resent.
function retryPayload(r) {
  const query = String((r && r.query) || "").trim();
  if (query.length < 3) return null;
  return { query, county: (r && r.county) || null, reference: (r && r.reference) || null };
}

const api = { fromConfig, passwordProblem, retryPayload };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ASCSettings = api;
})(typeof window !== "undefined" ? window : globalThis);
