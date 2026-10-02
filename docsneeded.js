// Documents Needed — the per-job acquisition checklist. Pure helpers (no DOM, no network), shared by the page and
// its Node tests. The research computer is the source of truth: the page only displays its checklist and sends
// requests (status/note changes, a confirmed import of old browser-cart marks) that the tower validates.
(function (root) {
  "use strict";
  const OPERATOR = ["not_started", "searching", "found", "purchased_downloaded", "unavailable_online", "needs_help"];
  const TOWER = ["uploaded", "verified", "rejected"];
  const LABEL = {
    not_started: "Not started", searching: "Searching", found: "Found in the county records",
    purchased_downloaded: "Purchased / downloaded (your mark)", unavailable_online: "Not available online",
    needs_help: "Needs help", uploaded: "Uploaded — being checked", verified: "Verified", rejected: "Rejected — wrong document",
  };

  // A status request the tower will accept. Tower-only states are never sent; every request carries the version
  // it was based on (conflict detection) and a client id (duplicate submissions are applied once).
  function statusRequest(item, status, note, clientId) {
    if (!OPERATOR.includes(status)) throw new Error("This status is set by the research computer, not by hand.");
    return { target_id: item.target_id, status: status, note: note == null ? null : String(note).slice(0, 1000),
             base_version: item.version, client_request_id: clientId };
  }

  // Old browser-cart marks (asc-research-acq:<user>:<request>) -> a preview the operator must confirm.
  // Only past "searched"/"purchased" marks for items that still exist are offered; nothing becomes verified.
  function cartPreview(stored, items) {
    const ids = new Map((items || []).map((i) => [i.target_id, i]));
    const rows = [];
    ((stored && stored.items) || []).forEach((m) => {
      const it = ids.get(m.target_id);
      if (!it || !["searched", "purchased"].includes(m.status)) return;
      rows.push({ target_id: m.target_id, status: m.status, label: it.label + " — " + it.class,
                  claim: m.status === "purchased" ? "you marked it purchased" : "you marked it searched" });
    });
    return rows;
  }

  function importRequest(previewRows, clientId) {
    return { action: "import_cart", client_request_id: clientId,
             marks: previewRows.map((r) => ({ target_id: r.target_id, status: r.status })) };
  }

  function resolved(item) { return item.status === "verified" || item.status === "unavailable_online"; }

  function progress(items) {
    const n = (items || []).length, done = (items || []).filter(resolved).length;
    return { total: n, resolved: done, open: n - done };
  }

  const api = { OPERATOR, TOWER, LABEL, statusRequest, cartPreview, importRequest, resolved, progress };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ASCDocs = api;
})(typeof window !== "undefined" ? window : globalThis);
