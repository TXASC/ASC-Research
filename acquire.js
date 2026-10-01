// Research cart / acquisition workspace — pure functions (no DOM), shared by the page and its Node tests.
// ASC never signs in, pays or downloads: the handoff opens ONE official-portal tab and the user does the rest.
// Only validated exact clerk numbers can ever be handed to a county cart; anything unverified is a manual search
// that the user must explicitly choose to list.
(function (root) {
  "use strict";
  const EXACT = "exact_document_number";
  const STATUSES = ["not_opened", "searched", "purchased", "uploaded"];
  // 'searched' and 'purchased' are only what the user clicked; ASC cannot see the county checkout. 'uploaded' is never
  // clicked: it is derived from a PDF the tower matched and verified against the record.
  const USER_STATUSES = ["not_opened", "searched", "purchased"];
  const STATUS_LABEL = { not_opened: "Not opened", searched: "Marked searched", purchased: "Marked purchased by user",
    uploaded: "Acquired — verified PDF uploaded" };
  const ROLE_ORDER = { "Subject": 0, "Direct adjoiner": 1, "Block lot": 2 };

  function itemFrom(i, county) {
    const exact = i.search_strategy === EXACT && !!i.clerk_search_value;
    return {
      target_id: i.target_id, class: i.class, county: county, role: i.role || null,
      reference: i.clerk_search_value || i.cad_reference_raw || i.reference || "",
      clerk_search_value: exact ? i.clerk_search_value : null,
      strategy: i.search_strategy || null, confidence: i.search_confidence || null,
      selected: exact, chosen: false, status: "not_opened",
    };
  }

  // Build (or resume) the manifest for a request. Existing choices and statuses always win over defaults.
  function fromSummary(requestId, summary, existing, now) {
    const acq = (summary && summary.acquisition) || {};
    const county = acq.county || (summary && summary.county) || "";
    const prev = new Map(((existing && existing.items) || []).map((x) => [x.target_id, x]));
    const items = ((summary && summary.instruments) || []).map((i) => {
      const fresh = itemFrom(i, county);
      const old = prev.get(i.target_id);
      if (!old) return fresh;
      const keep = { selected: old.selected, chosen: old.chosen,
        status: USER_STATUSES.includes(old.status) ? old.status : old.status === "uploaded" ? "purchased" : "not_opened" };
      if (!fresh.clerk_search_value && keep.selected && !keep.chosen) keep.selected = false;   // was exact, no longer validated
      return Object.assign(fresh, keep);
    });
    return {
      request_id: requestId, county: county, mode: acq.mode || "workspace",
      created_at: (existing && existing.created_at) || now || new Date().toISOString(),   // stable cart/session stamp
      handed_off_at: (existing && existing.handed_off_at) || null,
      items: withUploads({ items }, summary).items,
    };
  }

  function _set(m, id, patch) {
    return Object.assign({}, m, { items: m.items.map((x) => (x.target_id === id ? Object.assign({}, x, patch) : x)) });
  }

  // Exact items toggle freely. An unverified item enters only with explicit=true (a deliberate checkbox), and even
  // then it is a manual-search entry: handoff() never puts it in a county cart.
  function setSelected(m, id, on, opts) {
    const it = m.items.find((x) => x.target_id === id);
    if (!it) return m;
    if (!on) return _set(m, id, { selected: false, chosen: false });
    if (it.clerk_search_value) return _set(m, id, { selected: true });
    if (opts && opts.explicit === true) return _set(m, id, { selected: true, chosen: true });
    return m;
  }

  function mark(m, id, status) {
    const it = m.items.find((x) => x.target_id === id);
    if (!it || it.status === "uploaded" || !USER_STATUSES.includes(status)) return m;   // 'uploaded' only from a verified PDF
    return _set(m, id, { status: status });
  }

  // A record whose upload was accepted on the tower is 'uploaded' regardless of what was clicked.
  function withUploads(m, summary) {
    const done = new Set(((summary && summary.instruments) || [])
      .filter((i) => (i.documents || []).some((d) => d.state === "verified") || i.state === "verified")
      .map((i) => i.target_id));
    return Object.assign({}, m, { items: m.items.map((x) => (done.has(x.target_id) ? Object.assign({}, x, { status: "uploaded" }) : x)) });
  }

  function ordered(m) {
    return m.items.filter((x) => x.selected).slice().sort((a, b) =>
      (a.clerk_search_value ? 0 : 1) - (b.clerk_search_value ? 0 : 1) ||
      (a.class === b.class ? 0 : a.class === "deed" ? -1 : 1) ||
      (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9));
  }

  function next(m) {
    return ordered(m).find((x) => x.status === "not_opened" || x.status === "searched") || null;
  }

  // The single job-level action. Returns ONE url; the caller opens exactly one tab with it.
  function handoff(m, acq, now) {
    const sel = ordered(m);
    const cartItems = sel.filter((x) => x.clerk_search_value && x.strategy === EXACT);
    let url = (acq && acq.portal_url) || null;
    if (acq && acq.supported && acq.mode === "county_cart" && acq.url_template && cartItems.length) {
      const take = cartItems.slice(0, acq.max_items || 50);
      url = acq.url_template.replace("{numbers}", encodeURIComponent(take.map((x) => x.clerk_search_value).join(acq.separator || ",")));
    }
    const manifest = Object.assign({}, m, { handed_off_at: m.handed_off_at || now || new Date().toISOString() });
    return {
      url: url, manifest: manifest,
      cartItems: acq && acq.supported ? cartItems : [],
      workspaceItems: acq && acq.supported ? sel.filter((x) => !cartItems.includes(x)) : sel,
    };
  }

  // Mirrors the database check: unverified items must be explicit choices; statuses from the fixed list.
  function valid(m) {
    return Array.isArray(m.items) && m.items.length <= 300 && m.items.every((x) =>
      STATUSES.includes(x.status) && (x.strategy === EXACT || !x.selected || x.chosen === true) &&
      (x.clerk_search_value == null || x.strategy === EXACT));
  }

  function forDb(m) {
    return { request_id: m.request_id, county: m.county, mode: m.mode, cart_created_at: m.created_at,
      handed_off_at: m.handed_off_at, items: m.items };
  }
  function fromDb(row) {
    return row ? { request_id: row.request_id, county: row.county, mode: row.mode, created_at: row.cart_created_at,
      handed_off_at: row.handed_off_at, items: row.items || [] } : null;
  }

  const api = { EXACT, STATUSES, USER_STATUSES, STATUS_LABEL, fromSummary, setSelected, mark, withUploads, ordered, next, handoff,
    valid, forDb, fromDb };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ASCAcquire = api;
})(typeof window !== "undefined" ? window : globalThis);
