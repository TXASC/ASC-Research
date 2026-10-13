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
    needs_help: "Needs help", uploaded: "Uploaded — waiting for office check", verified: "Verified", rejected: "Rejected — wrong document",
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

  // F-4 (Castellon 2026-10-05): the subject/adjoiner table is Role · Owner · Deed info · Address · Legal (full legal).
  // Deed info is the tower's number + recorded date, else 'Search grantee'. Shared feet and account counts stay off.
  function parcelTable(block) {
    const header = ["#", "Role", "Owner", "Deed info", "Address", "Legal"];
    const rows = (block || []).map((b, n) => [String(n + 1), b.role || "", b.owner || "",
      b.deed_info || "Search grantee", b.address || "", b.legal || ""]);
    return { header, rows };
  }

  // F-5: the per-row upload button. Plat rows say plat so staff never attach a deed there by mistake.
  function attachLabel(item) {
    return (item && item.class === "plat") ? "Attach plat PDF" : "Attach deed PDF";
  }

  // DAL-4: which clerk row is the deed (grantee, roughly when, which document types).
  function pickNote(item) {
    return item && item.what_to_pick ? "What to pick: " + item.what_to_pick : null;
  }

  // F-3: a questionable subject is one question. Machine reasons never reach the page (the tower log keeps them).
  function confirmView(s) {
    if (!s || !s.confirm) return null;
    const label = (c) => [c.situs, c.owner, c.legal].map((x) => x || "—").join(" — ");
    return {
      question: s.confirm.question,
      yes: { parcel_uuid: s.confirm.parcel_uuid, reason: "Yes — confirmed on the research page" },
      others: (s.candidates || []).filter((c) => c.parcel_uuid !== s.confirm.parcel_uuid)
        .map((c) => ({ parcel_uuid: c.parcel_uuid, parcel_id: c.parcel_id, label: label(c) })),
      otherReason: "Picked a different parcel on the research page",
    };
  }

  // F-1: heading for the subject/adjoiner table; 'Same block' (and old 'Block lot') rows are the rest of the block.
  function blockHeading(block) {
    const rows = block || [];
    const nAdj = rows.filter((b) => /adjoiner/i.test(b.role || "")).length;
    const nLot = rows.filter((b) => /same block|block lot/i.test(b.role || "")).length;
    return `Subject and adjoining parcels — ${nAdj} direct adjoiner(s)` + (nLot ? `, ${nLot} more lot(s) in the block` : "");
  }

  // SWP-2: where an uploaded file is filed. The tower's label wins; the page never asks the user to choose a record.
  function attachedText(u, instruments) {
    const a = (u && u.association) || {};
    if (a.attached_label) return a.attached_label;
    const t = (instruments || []).find((i) => i.target_id === a.target_id);
    if (t) return `Attached to: ${t.class} ${t.reference || ""}`.trim();
    return "Waiting for the office to file it";
  }

  function canChangeTarget(u) {
    return !!u && u.status !== "processing" && u.status !== "uploaded" && !!(u.association || {}).document_id;
  }

  // SWP-4: one boundary line. The tower's "Frontage: …" text wins; older summaries keep the type/label form.
  function boundaryLine(b) {
    const ft = b.shared ? ` (${b.shared.toFixed(1)} ft)` : "";
    if (b.frontage) return b.frontage + ft;
    return b.type_label + (b.label ? " — " + b.label : "") + ft + (b.advisory ? " · advisory" : "");
  }

  // SWP-7: Needed → Uploaded → Confirmed (+ Can't find it). The detailed status and its reasons stay on the tower.
  const PAGE = { needed: ["Needed", ""], uploaded: ["Uploaded", "b-waiting"], confirmed: ["Confirmed", "b-done"],
                 cant_find: ["Can't find it", "b-failed"] };
  const COLLAPSE = { uploaded: "uploaded", verified: "confirmed", unavailable_online: "cant_find" };
  function pageBadge(it) {
    const s = it.page_status || COLLAPSE[it.status] || "needed";
    return { status: s, label: PAGE[s][0], tone: PAGE[s][1] };
  }

  // The small "Can't find it" link, and its undo.
  function cantFind(it, clientId) {
    const undo = pageBadge(it).status === "cant_find";
    return statusRequest(it, undo ? "not_started" : "unavailable_online", null, clientId);
  }

  // One plain question → its buttons. A button with no action ("Not sure — office") sends nothing.
  function questionActions(q) {
    return (q.buttons || []).map((b) => ({ label: b.label, decision: b.action
      ? { kind: "review_resolution", payload: { review_id: q.review_id, action: b.action, reason: b.reason } } : null }));
  }

  const api = { OPERATOR, TOWER, LABEL, statusRequest, cartPreview, importRequest, resolved, progress, parcelTable, attachLabel, pickNote, confirmView, blockHeading, attachedText, canChangeTarget, boundaryLine, pageBadge, cantFind, questionActions };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ASCDocs = api;
})(typeof window !== "undefined" ? window : globalThis);
