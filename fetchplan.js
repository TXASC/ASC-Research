// What the page reads from Supabase on each poll, and how it merges what comes back. Pure, so it is node-tested.
// Egress (2026-10-11): re-reading the whole request list, the door status and the open search's uploads every few
// seconds was ~72 MB/day for one open tab. Now: the list is a delta (updated_at > the newest seen) with a full read
// every 10 minutes and after every user action; the door status at most once a minute; uploads only when they can
// have changed. The watermark is the server's own timestamp string, compared to the microsecond (a JS Date keeps only
// milliseconds, and `.752057` > `.752` would re-return that row forever). The browser clock is never a watermark.
// Only a new request (Submit) is stamped by the database clock rather than the tower's; Submit is a user action, so
// it is followed by a full read.
// Cadence (Phase 0): poll every 60 s when idle, every 3 s only while the search on screen is queued/running or one of
// its uploads is being checked, and not at all while the tab is hidden (one refresh when it is shown again).
(function (root) {
  "use strict";
  const FULL_EVERY_MS = 10 * 60 * 1000;
  const DOOR_EVERY_MS = 60 * 1000;
  const UPLOADS_EVERY_MS = 10 * 60 * 1000;
  const IDLE_POLL_MS = 60 * 1000;
  const ACTIVE_POLL_MS = 3 * 1000;
  const HOT_AFTER_ACTION_MS = 2 * 60 * 1000;
  const UPLOAD_IN_FLIGHT = ["uploaded", "processing"];
  const LIST_LIMIT = 100;

  function initial() {
    return { rows: {}, seen: null, fullAt: -Infinity, doorAt: -Infinity, door: null, hotUntil: -Infinity, uploads: {} };
  }

  // Which list read to make now: { full: true } or { after: the server's updated_at string }.
  function listRead(c, now, userAction) {
    if (userAction || c.seen === null || now - c.fullAt >= FULL_EVERY_MS) return { full: true };
    return { after: c.seen };
  }

  // Microseconds since the epoch for a Postgres timestamp string ("2026-10-11T18:00:02.752057+00:00"), or NaN.
  function micros(ts) {
    const m = /^(.*?T\d\d:\d\d:\d\d)(?:\.(\d+))?(.*)$/.exec(String(ts || ""));
    if (!m) return NaN;
    const ms = Date.parse(m[1] + (m[3] || "Z"));
    return ms * 1000 + Number(((m[2] || "") + "000000").slice(0, 6));
  }

  function newest(rows, seen) {
    let best = seen;
    for (const r of rows) {
      const t = micros(r.updated_at);
      if (!Number.isNaN(t) && (best === null || t > micros(best))) best = r.updated_at;
    }
    return best;
  }

  // Merge one list read into the cache; returns the new cache and the list to show (newest first, at most 100).
  function mergeList(c, read, rows, now) {
    const out = { ...c, rows: read.full ? {} : { ...c.rows } };
    for (const r of rows || []) out.rows[r.id] = r;
    if (read.full) out.fullAt = now;
    out.seen = newest(rows || [], read.full ? null : c.seen);    // a delta with no rows keeps the old watermark
    const list = Object.values(out.rows).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, LIST_LIMIT);
    return { cache: out, list };
  }

  function doorDue(c, now) { return now - c.doorAt >= DOOR_EVERY_MS; }

  // The user just did something (submit, upload, decision): read uploads freely for a couple of minutes.
  function touched(c, now) { return { ...c, hotUntil: now + HOT_AFTER_ACTION_MS }; }

  // Should the open search's uploads be re-read? req is the request row on screen.
  function uploadsDue(c, req, now) {
    if (!req) return false;
    const u = c.uploads[req.id];
    if (!u) return true;                                       // first time this search is on screen
    if (u.updated_at !== req.updated_at) return true;          // the tower touched the search
    if (now < c.hotUntil) return true;                         // right after a user action
    if ((u.rows || []).some((x) => UPLOAD_IN_FLIGHT.includes(x.status))) return true;   // still being checked
    return now - u.at >= UPLOADS_EVERY_MS;                     // backstop
  }

  // When to poll next, in ms, or null to stop (tab hidden: visibilitychange restarts it). onScreen = the request rows
  // shown (current + history detail), uploads = their upload rows.
  function nextPoll(hidden, onScreen, uploads) {
    if (hidden) return null;
    const busy = (onScreen || []).some((r) => r && ["queued", "running"].includes(r.status)) ||
      (uploads || []).some((u) => UPLOAD_IN_FLIGHT.includes(u.status));
    return busy ? ACTIVE_POLL_MS : IDLE_POLL_MS;
  }

  // A read refused because the browser no longer has a signed-in session. On 2026-10-11 a tab's token refresh failed
  // during the ASC-ERP outage; supabase-js fell back to the publishable key, and the tab kept polling as `anon`, which
  // has no access to the research schema ("permission denied for schema research", 42501). The page must say so and
  // stop, not poll on as nobody.
  function sessionLost(error, status) {
    if (!error) return false;
    return status === 401 || status === 403 || ["42501", "PGRST301", "PGRST302", "PGRST303"].includes(error.code);
  }

  function storeUploads(c, req, rows, now) {
    return { ...c, uploads: { ...c.uploads, [req.id]: { at: now, updated_at: req.updated_at, rows: rows || [] } } };
  }

  const api = { initial, listRead, mergeList, micros, doorDue, touched, uploadsDue, storeUploads, nextPoll, sessionLost,
    FULL_EVERY_MS, DOOR_EVERY_MS, UPLOADS_EVERY_MS, HOT_AFTER_ACTION_MS, IDLE_POLL_MS, ACTIVE_POLL_MS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ASCFetch = api;
})(typeof window !== "undefined" ? window : globalThis);
