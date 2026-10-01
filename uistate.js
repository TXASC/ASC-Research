// Current search / History UI state — pure functions (no DOM), shared by the page and its Node tests.
// Nothing here deletes or cancels a request: "New search" only changes what the Current tab shows.
(function (root) {
  "use strict";
  const KEY = (userId) => "asc-research-ui:" + userId;
  const ACTIVE = ["queued", "running", "waiting"];

  function initial() {
    return { currentRequestId: null, activeTab: "current", newSearchMode: false, historyDetailId: null, stored: false };
  }

  function load(userId, storage) {
    try {
      const raw = storage && storage.getItem(KEY(userId));
      if (raw) return Object.assign(initial(), JSON.parse(raw), { stored: true, historyDetailId: null });
    } catch (e) { /* private window / blocked storage: fall back to defaults */ }
    return initial();
  }

  function save(userId, storage, s) {
    try {
      storage && storage.setItem(KEY(userId), JSON.stringify({
        currentRequestId: s.currentRequestId, activeTab: s.activeTab, newSearchMode: s.newSearchMode }));
    } catch (e) { /* ignore */ }
  }

  // Pressing "New search": the shown request moves to History (it is simply no longer "current").
  function newSearch(s) {
    return Object.assign({}, s, { currentRequestId: null, newSearchMode: true, activeTab: "current", historyDetailId: null });
  }
  function submitted(s, id) {
    return Object.assign({}, s, { currentRequestId: id, newSearchMode: false, activeTab: "current", historyDetailId: null });
  }
  function openHistory(s, id) {   // read-only view; does NOT replace the current search
    return Object.assign({}, s, { activeTab: "history", historyDetailId: id });
  }
  function makeCurrent(s, id) {
    return Object.assign({}, s, { currentRequestId: id, newSearchMode: false, activeTab: "current", historyDetailId: null });
  }
  function setTab(s, tab) {
    return Object.assign({}, s, { activeTab: tab === "history" ? "history" : "current" });
  }

  // Reconcile with the server list (newest first). Never auto-select after an explicit New search.
  function resolve(s, requests) {
    const ids = new Set((requests || []).map((r) => r.id));
    let out = Object.assign({}, s);
    if (out.currentRequestId && !ids.has(out.currentRequestId)) out.currentRequestId = null;
    if (!out.currentRequestId && !out.newSearchMode && !out.stored) {
      const active = (requests || []).find((r) => ACTIVE.includes(r.status));     // first visit: resume a running one
      if (active) out.currentRequestId = active.id;
    }
    if (out.historyDetailId && !ids.has(out.historyDetailId)) out.historyDetailId = null;
    return out;
  }

  function history(s, requests) {
    return (requests || []).filter((r) => r.id !== s.currentRequestId);
  }

  const api = { initial, load, save, newSearch, submitted, openHistory, makeCurrent, setTab, resolve, history, KEY };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ASCState = api;
})(typeof window !== "undefined" ? window : globalThis);
