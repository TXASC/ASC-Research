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
  const api = { fromConfig };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ASCSettings = api;
})(typeof window !== "undefined" ? window : globalThis);
