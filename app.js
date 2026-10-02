// ASC Research door — static page. Talks only to the Supabase project in config.js (publishable key, RLS-protected).
// The research itself runs on the Adams Surveying research computer, which picks requests up and posts results back.
(function () {
  "use strict";
  const cfg = window.ASC_RESEARCH || {};
  const S = window.ASCState;
  const $ = (id) => document.getElementById(id);
  const show = (id, on) => $(id).classList.toggle("hidden", !on);
  let sb = null, user = null, requests = [], pollTimer = null, ui = S.initial();
  const views = {                       // per-tab detail state: which request, its uploads, last render key
    current: { box: "currentDetail", id: null, uploads: [], key: "" },
    history: { box: "historyDetail", id: null, uploads: [], key: "" },
  };

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") n.className = v; else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false)
      n.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    return n;
  }
  function flash(msg) { const f = $("flash"); f.textContent = msg || ""; show("flash", !!msg); }
  function when(ts) { if (!ts) return ""; const d = new Date(ts); return d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
  function safeUrl(u) { try { const x = new URL(u); return x.protocol === "https:" ? x.href : null; } catch { return null; } }
  function persist() { if (user) S.save(user.id, window.localStorage, ui); }
  // Call the prototype method: a control named/id'd "reset" inside a form shadows form.reset() (that broke submit).
  function clearForm() { HTMLFormElement.prototype.reset.call($("searchForm")); }

  async function init() {
    if (!cfg.supabaseUrl || !cfg.supabaseKey || !window.supabase) { show("setup", true); return; }
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
    sb.auth.onAuthStateChange((_e, session) => { const was = user && user.id; user = session?.user || null;
      if (user && user.id !== was) ui = S.load(user.id, window.localStorage); render(); });
    const { data } = await sb.auth.getSession();
    user = data.session?.user || null;
    if (user) ui = S.load(user.id, window.localStorage);
    render();
  }

  function render() {
    show("signin", !user); show("app", !!user); show("signout", !!user);
    $("who").textContent = user ? user.email : "";
    clearTimeout(pollTimer);
    if (user) { drawTabs(); poll(); }
    else show("tower", false);
  }

  $("signinForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("email").value.trim().toLowerCase();
    $("signinBtn").disabled = true;
    const { error } = await sb.auth.signInWithPassword({ email, password: $("password").value });
    $("signinBtn").disabled = false;
    $("password").value = "";
    flash(error ? (/invalid/i.test(error.message) ? "Email or password is incorrect." : "Could not sign in: " + error.message) : "");
  });
  $("signout").addEventListener("click", async () => { await sb.auth.signOut(); flash(""); });

  function drawTabs() {
    const cur = ui.activeTab === "current";
    $("tabCurrentBtn").classList.toggle("sel", cur); $("tabCurrentBtn").setAttribute("aria-selected", String(cur));
    $("tabHistoryBtn").classList.toggle("sel", !cur); $("tabHistoryBtn").setAttribute("aria-selected", String(!cur));
    show("tabCurrent", cur); show("tabHistory", !cur);
  }
  $("tabCurrentBtn").addEventListener("click", () => { ui = S.setTab(ui, "current"); persist(); drawTabs(); refresh(); });
  $("tabHistoryBtn").addEventListener("click", () => { ui = S.setTab(ui, "history"); persist(); drawTabs(); refresh(); });

  // New search: the current request moves to History (nothing is cancelled or deleted).
  function newSearch() {
    ui = S.newSearch(ui); persist();
    clearForm(); $("searchForm").querySelector("details").open = false;
    views.current.id = null; views.current.key = ""; show("currentDetail", false); flash("");
    drawTabs(); drawList(); $("q").focus();
  }
  $("newSearchBtn").addEventListener("click", newSearch);

  $("searchForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const query = $("q").value.trim();
    if (query.length < 3) return;
    $("go").disabled = true;
    const { data, error } = await sb.from("requests")
      .insert({ query, county: $("county").value || null, reference: $("ref").value.trim() || null })
      .select().single();
    $("go").disabled = false;
    if (error) {
      flash(/row-level security|permission/i.test(error.message)
        ? "Your email is not approved for ASC Research yet — ask Adams Surveying to add it."
        : "Could not submit: " + error.message);
      return;
    }
    clearForm();
    ui = S.submitted(ui, data.id); persist();
    flash("Submitted — the research computer will pick it up shortly.");
    await poll();
  });

  // Poll quickly while the current search is running so the map visibly builds; slowly otherwise.
  async function poll() {
    clearTimeout(pollTimer);
    try { await refresh(); } catch (e) { /* keep polling */ }
    const cur = requests.find((r) => r.id === views.current.id);
    const busy = cur && ["queued", "running"].includes(cur.status);
    if (user) pollTimer = setTimeout(poll, busy ? 2000 : 6000);
  }

  async function refresh() {
    const [{ data: reqs, error }, { data: beat }] = await Promise.all([
      sb.from("requests").select("*").order("created_at", { ascending: false }).limit(100),
      sb.from("door_status").select("*").eq("id", 1).maybeSingle(),
    ]);
    if (error) { flash("Could not load your searches: " + error.message); return; }
    requests = reqs || [];
    ui = S.resolve(ui, requests); persist();
    views.current.id = ui.currentRequestId;
    views.history.id = ui.historyDetailId;
    for (const v of Object.values(views)) {
      if (v.id) {
        const { data: ups } = await sb.from("uploads").select("*").eq("request_id", v.id).order("created_at");
        v.uploads = ups || [];
      } else v.uploads = [];
    }
    towerBadge(beat);
    drawTabs();
    drawList();
    drawDetail(requests.find((r) => r.id === views.current.id), views.current, false);
    drawDetail(requests.find((r) => r.id === views.history.id), views.history, true);
    $("updated").textContent = "updated " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  function towerBadge(beat) {
    const b = $("tower"); show("tower", true);
    const age = beat?.last_seen ? (Date.now() - new Date(beat.last_seen).getTime()) / 1000 : Infinity;
    const online = age < 180;
    b.className = "badge " + (online ? "b-online" : "b-offline");
    b.textContent = online ? "Research computer online" : "Research computer offline — requests will wait";
    const sel = $("county");
    if (beat?.counties && sel.options.length === 1)
      beat.counties.forEach((c) => sel.append(el("option", { value: c }, c)));
  }

  function drawList() {
    const list = $("list"); list.replaceChildren();
    const hist = S.history(ui, requests);
    $("histCount").textContent = hist.length ? `(${hist.length})` : "";
    if (!hist.length) { list.append(el("p", { class: "mut" }, "No previous searches.")); return; }
    for (const r of hist) {
      const dl = el("span", { class: "row" });
      if (r.package_path) dl.append(el("button", { class: "ghost small", onclick: (e) => { e.stopPropagation(); signed(r.package_path, "research_package.zip"); } }, "Package"));
      if (r.report_path) dl.append(el("button", { class: "ghost small", onclick: (e) => { e.stopPropagation(); signed(r.report_path, "RESEARCH_REPORT.html"); } }, "Report"));
      list.append(el("a", { class: r.id === ui.historyDetailId ? "sel" : "", onclick: () => { ui = S.openHistory(ui, r.id); persist(); views.history.key = ""; refresh(); } },
        el("strong", { style: "flex:1;min-width:200px" }, r.query),
        r.reference ? el("span", { class: "small mut" }, r.reference) : null,
        el("span", { class: "badge b-" + r.status }, r.plain_status || r.status),
        el("span", { class: "small mut" }, when(r.created_at)), dl));
    }
  }

  async function signed(path, filename) {
    const { data, error } = await sb.storage.from("packages").createSignedUrl(path, 3600, { download: filename });
    if (error) { flash("Download link failed: " + error.message); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  const STAGE_ORDER = [["submitted", "Located"], ["subject_candidates", "Subject"], ["boundaries", "Boundaries"],
                       ["adjoiners", "Adjoiners"], ["block", "Block"], ["documents", "Deeds & plats"], ["complete", "Done"]];
  function stageBar(rs) {
    const order = STAGE_ORDER.map((x) => x[0]);
    const norm = { locating: "submitted", subject_confirmed: "subject_candidates" }[rs] || rs;
    const at = order.indexOf(norm);
    return el("div", { class: "stage" }, STAGE_ORDER.map(([k, label], i) =>
      el("span", { class: i < at ? "done" : i === at ? "on" : "" }, label)));
  }

  function drawDetail(r, view, readOnly) {
    const d = $(view.box);
    if (!r) { show(view.box, false); view.key = ""; return; }
    const uploads = view.uploads;
    const key = r.id + "|" + r.updated_at + "|" + JSON.stringify(uploads.map((u) => [u.id, u.status, u.association])) +
                "|" + JSON.stringify(r.drafting || {});
    if (key === view.key) return;                       // nothing changed: keep the map view and any chosen files
    view.key = key;
    show(view.box, true);
    const mapNode = d._mapNode && d._mapReq === r.id ? d._mapNode : el("div", { class: "bmap" });
    d._mapNode = mapNode; d._mapReq = r.id;
    d.replaceChildren();
    const s = r.summary || {};
    d.append(el("div", { class: "row", style: "justify-content:space-between" },
      el("h2", {}, (readOnly ? "History: " : "") + r.query), el("span", { class: "badge b-" + r.status }, r.plain_status || r.status)));
    if (s.research_stage && !["failed"].includes(s.research_stage)) d.append(stageBar(s.research_stage));
    if (r.error) d.append(el("div", { class: "flash" }, r.error));
    (s.notices || []).forEach((n) => d.append(el("div", { class: "note adv" }, n)));

    const actions = el("div", { class: "row", style: "margin:8px 0 12px" });
    if (r.package_path) actions.append(el("button", { onclick: () => signed(r.package_path, "research_package.zip") }, "Download package (.zip)"));
    if (r.report_path) actions.append(el("button", { class: "ghost", onclick: () => signed(r.report_path, "RESEARCH_REPORT.html") }, "Download report"));
    if (!readOnly && ["queued", "running", "waiting"].includes(r.status))
      actions.append(el("button", { class: "ghost", onclick: () => decide(r, "cancel", {}) }, "Cancel"));
    if (readOnly) actions.append(el("button", { class: "ghost", onclick: () => { ui = S.makeCurrent(ui, r.id); persist();
      views.current.key = ""; refresh(); } }, "Make this the current search"));
    else actions.append(el("button", { class: "ghost", onclick: newSearch }, "New search"));
    d.append(actions);

    // Live research map: shown from the moment a search starts. It flies to the address, then lights up the subject,
    // the direct adjoiners and the block as the research computer finds them (blockmap.js opts.animate).
    const active = ["queued", "running"].includes(r.status);
    const hasMap = !!(s.map && s.map.features && s.map.features.length);
    if (hasMap || (active && !readOnly)) {
      d.append(el("h2", { style: "margin-top:14px" }, s.research_stage === "complete" ? "Block map" : "Research map"));
      d.append(mapNode);
      const status = active ? (s.stage_label || (r.status === "queued" ? "Waiting for the research computer…" : r.plain_status || "Researching…")) : null;
      setTimeout(() => { try { window.renderBlockMap(mapNode, s.map, { animate: !readOnly, status }); }
                         catch (e) { mapNode.textContent = "Map unavailable."; } }, 0);
      d.append(el("p", { class: "small mut" }, "CAD geometry only — visual research aid, not survey geometry. Click a parcel for details."));
    }

    if (s.subject) {
      d.append(el("h2", {}, "Subject"),
        el("p", {}, `${s.county || ""} parcel ${s.subject.parcel_id || ""} — ${s.subject.situs || ""}`),
        el("p", { class: "small mut" }, `${s.subject.legal || ""}${s.subject.owner ? " · CAD owner: " + s.subject.owner : ""}`));
    }
    if (!readOnly && r.status === "waiting" && s.candidates?.length) {
      const form = el("form", {});
      form.append(el("p", {}, s.decision || "Choose the subject parcel."));
      s.candidates.forEach((c, i) => form.append(el("label", { style: "display:block;padding:6px 0;border-top:1px solid var(--line)" },
        el("input", { type: "radio", name: "pick", value: c.parcel_uuid, required: true, checked: i === 0 ? "checked" : null }), " ",
        el("strong", {}, c.parcel_id), " ", c.situs || "", el("div", { class: "small mut" }, (c.legal || "") + " — " + (c.reasons || []).join("; ")))));
      const reason = el("input", { placeholder: "Why this parcel? (required)", required: true, minlength: "3", style: "flex:1;min-width:220px" });
      form.append(el("div", { class: "row", style: "margin-top:8px" }, reason, el("button", { type: "submit" }, "Use this parcel")));
      form.addEventListener("submit", (e) => { e.preventDefault();
        decide(r, "confirm_subject", { parcel_uuid: form.pick.value, reason: reason.value.trim() }); });
      d.append(form);
    }
    // Blocking items only when the user can act; advisories are flagged, never blocking.
    (s.blocking || []).forEach((b) => d.append(el("div", { class: "note block" }, "Action needed: " + b)));
    if (s.advisories?.length) {
      d.append(el("h2", { style: "margin-top:10px" }, "Flagged for the surveyor (advisory)"));
      s.advisories.forEach((a) => d.append(el("div", { class: "note adv" }, a)));
    }
    if (s.block?.length) {
      const nAdj = s.block.filter((b) => /adjoiner/i.test(b.role || "")).length;
      const nLot = s.block.filter((b) => /block lot/i.test(b.role || "")).length;
      d.append(el("h2", { style: "margin-top:14px" }, `Subject and adjoining parcels — ${nAdj} direct adjoiner(s)` +
        (nLot ? `, ${nLot} block lot(s)` : "")));
      if (s.block_note) d.append(el("div", { class: "note adv" }, s.block_note));
      d.append(el("div", { class: "scroll" }, el("table", {},
        el("tr", {}, el("th", {}, "#"), el("th", {}, "Role"), el("th", {}, "Parcel"), el("th", {}, "Address"), el("th", {}, "Legal")),
        s.block.map((b, n) => el("tr", {}, el("td", {}, n + 1), el("td", {}, b.role),
          el("td", {}, b.parcel_id + (b.accounts > 1 ? ` (${b.accounts} accounts)` : "")),
          el("td", { class: "small" }, b.address || ""), el("td", { class: "small" }, b.legal || ""))))));
    }
    if (s.boundaries?.length) {
      d.append(el("h2", { style: "margin-top:14px" }, "Boundaries of the subject"),
        el("ul", { class: "small" }, s.boundaries.map((b) => el("li", {}, b.type_label + (b.label ? " — " + b.label : "") +
          (b.shared ? ` (${b.shared.toFixed(1)} ft)` : "") + (b.advisory ? " · advisory" : "")))));
    }
    if (s.features?.legacy_cart && s.acquisition && s.instruments?.length && ["done", "waiting"].includes(r.status))
      drawAcquisition(d, r, s, readOnly);                      // retired cart: only behind the legacy flag
    if (s.checklist?.items?.length) drawDocumentsNeeded(d, r, s, readOnly, uploads);
    if (s.instruments?.length) {
      const all = el("details", { style: "margin-top:12px" }, el("summary", { class: "small" }, "All deed and plat search details"));
      d.append(all);
      all.append(el("div", { class: "scroll" }, el("table", {},
        el("tr", {}, el("th", {}, "Type"), el("th", {}, "For"), el("th", {}, "Reference"), el("th", {}, "Status"), el("th", {}, "Search")),
        s.instruments.map((i) => {
          const url = safeUrl(i.search_url), fb = safeUrl(i.fallback_url);
          // One person per clerk search; the joint CAD string is shown only under Search details.
          const ownerName = i.owner_search && i.owner_search.default;
          const ownerVerb = ownerName ? `Search owner: ${ownerName}` : "Search by legal description";
          const ownerNote = ownerName && i.search_strategy !== "plat_by_subdivision" && i.search_basis !== "CAD owner name — verify"
            ? el("div", { class: "small mut" }, "CAD owner name — verify") : null;
          const verb = i.search_strategy === "exact_document_number" ? `Search ${s.county || "county"} records`
            : i.search_strategy === "plat_by_subdivision" ? "Search by subdivision"
            : i.search_value ? `Try document number: ${i.search_value}` : ownerVerb;
          return el("tr", {},
            el("td", { style: "white-space:nowrap" }, i.class),
            el("td", { class: "small" }, (i.role || "") + (i.parcels?.length ? " " + i.parcels.join(", ") : "")),
            el("td", {}, i.cad_reference_raw || i.reference || "", i.official_reference ? el("div", { class: "small mut" }, "County record: " + i.official_reference) : null,
              i.filed ? el("div", { class: "small mut" }, "Filed " + i.filed) : null,
              (i.documents || []).map((x) => el("div", { class: "small" }, "📄 " + x.filename))),
            el("td", { class: "small" }, i.status_label || ""),
            el("td", {}, url ? el("a", { href: url, target: "_blank", rel: "noopener" }, verb + " ↗") : "",
              i.search_basis ? el("div", { class: "small mut" }, i.search_basis) : null,
              fb ? el("div", { class: "small" }, el("a", { href: fb, target: "_blank", rel: "noopener" }, ownerVerb + " ↗")) : null,
              ownerNote,
              (i.fallback_search_terms || []).length ? el("details", { class: "small" }, el("summary", {}, "Search details"),
                (i.fallback_search_terms || []).map((t) => el("div", {}, t))) : null));
        }))));
    }
    if (!readOnly && s.subject && ["done", "waiting"].includes(r.status)) drawUploads(d, r, s, uploads);
    if (r.status === "queued") d.append(el("p", { class: "mut" }, "Waiting for the research computer to pick this up."));
  }

  // ---------------------------------------------------------------------------------------------
  // Upload deeds and plats for drafting
  // ---- Research cart / acquisition workspace (acquire.js holds the rules) ---------------------------------------
  // ASC never signs in, pays or downloads. One click opens ONE official-portal tab; the list stays here.
  // The manifest is kept in this browser per signed-in user and request (like Current search), so it survives a
  // county session timing out or a page refresh.
  const acqKey = (rid) => `asc-research-acq:${user ? user.id : "anon"}:${rid}`;
  function loadAcq(rid) { try { return JSON.parse(window.localStorage.getItem(acqKey(rid)) || "null"); } catch { return null; } }
  function saveAcq(m) { try { window.localStorage.setItem(acqKey(m.request_id), JSON.stringify(m)); return true; } catch { return false; } }

  function drawAcquisition(d, r, s, readOnly) {
    const A = window.ASCAcquire, acq = s.acquisition;
    const stored = loadAcq(r.id);
    let m = A.fromSummary(r.id, s, stored);
    if (!stored && !readOnly) saveAcq(m);                              // fixes the record list's start stamp
    const byId = new Map((s.instruments || []).map((i) => [i.target_id, i]));
    const box = el("div", { class: "card", style: "margin-top:14px" });
    d.append(box);
    const commit = (next) => { m = next; if (!saveAcq(m)) flash("This browser would not save the record list — keep this tab open."); paint(); };
    // Document/instrument number first (validated or just a number to try); the owner name is the fallback.
    const copyValue = (it) => it.clerk_search_value || byId.get(it.target_id)?.search_value
      || (byId.get(it.target_id)?.owner_search?.default) || it.reference || "";
    async function copy(it) {
      const v = copyValue(it);
      try { await navigator.clipboard.writeText(v); flash("Copied " + v + " — paste it into the county search."); }
      catch { flash("Copy this into the county search: " + v); }
      if (!readOnly && it.status === "not_opened") commit(A.mark(m, it.target_id, "searched"));
    }
    const statusSel = (it) => {
      if (it.status === "uploaded") return el("span", { class: "badge b-done" }, A.STATUS_LABEL.uploaded);
      const sel = el("select", { disabled: readOnly || null }, A.USER_STATUSES.map((st) =>
        el("option", { value: st, selected: it.status === st || null }, A.STATUS_LABEL[st])));
      sel.addEventListener("change", () => commit(A.mark(m, it.target_id, sel.value)));
      return sel;
    };
    const kind = (it) => `${it.class}${it.role ? " · " + it.role : ""}`;

    function paint() {
      const exact = m.items.filter((x) => x.clerk_search_value);
      const manual = m.items.filter((x) => !x.clerk_search_value);
      const sel = A.ordered(m), nxt = A.next(m);
      const title = acq.supported ? "Research cart" : "Research cart — " + acq.label;
      box.replaceChildren(
        el("h2", {}, title),
        el("p", { class: "small mut" }, acq.supported
          ? "Validated record numbers go to the county's own cart in one step. You sign in, review the cost and check out yourself."
          : acq.unsupported_reason || "",
          " ASC never signs in, pays or downloads for you. After checkout, upload the PDFs in the upload area below."),
        el("h3", { class: "small", style: "margin:10px 0 4px" }, "Validated record numbers"),
        exact.length ? el("div", { class: "scroll" }, el("table", {},
          el("tr", {}, el("th", {}, "Order"), el("th", {}, "Record"), el("th", {}, "Number"), el("th", {}, "Status"), el("th", {}, "")),
          exact.map((it) => {
            const cb = el("input", { type: "checkbox", checked: it.selected || null, disabled: readOnly || null });
            cb.addEventListener("change", () => commit(A.setSelected(m, it.target_id, cb.checked)));
            return el("tr", {}, el("td", {}, cb), el("td", { class: "small" }, kind(it)), el("td", {}, it.clerk_search_value),
              el("td", {}, statusSel(it)), el("td", {}, el("button", { class: "ghost", onclick: () => copy(it) }, "Copy")));
          }))) : el("p", { class: "small mut" }, "None of these records has a validated county number yet."),
        manual.length ? el("details", { style: "margin-top:8px" },
          el("summary", { class: "small" }, `Need a manual search (${manual.length}) — not added unless you tick them`),
          el("div", { class: "scroll" }, el("table", {},
            el("tr", {}, el("th", {}, "Add"), el("th", {}, "Record"), el("th", {}, "CAD reference"), el("th", {}, "Search details"), el("th", {}, "Status")),
            manual.map((it) => {
              const ins = byId.get(it.target_id) || {};
              const cb = el("input", { type: "checkbox", checked: it.selected || null, disabled: readOnly || null });
              cb.addEventListener("change", () => commit(A.setSelected(m, it.target_id, cb.checked, { explicit: true })));
              return el("tr", {}, el("td", {}, cb), el("td", { class: "small" }, kind(it)),
                el("td", {}, it.reference || "—", el("div", { class: "small mut" }, ins.search_basis || "Verify against the clerk index")),
                el("td", { class: "small" }, (ins.fallback_search_terms || []).slice(0, 6).map((t) => el("div", {}, t))),
                el("td", {}, it.selected ? statusSel(it) : ""));
            })))) : null,
        readOnly ? null : el("div", { class: "row", style: "margin-top:10px" },
          el("button", { disabled: !sel.length || null, onclick: () => {
            const h = A.handoff(m, acq);
            const url = safeUrl(h.url);
            commit(h.manifest);                                        // saved before the tab opens: a failed session keeps the list
            if (url) window.open(url, "_blank", "noopener");           // exactly one county tab
            flash(acq.supported ? `Sent ${h.cartItems.length} record(s) to the county cart — review and check out there.`
              : "County records opened in a new tab. Work down the list below; copy each number into the county search.");
          } }, acq.supported ? "Build official cart" : "Open acquisition workspace"),
          el("span", { class: "small mut" }, `${sel.length} selected`)),
        sel.length ? el("div", { style: "margin-top:10px" },
          el("div", { class: "small mut" }, `Record list started ${when(m.created_at)}` + (m.handed_off_at ? ` · county portal opened ${when(m.handed_off_at)}` : "") +
            ` · ${m.county} · ${acq.supported ? "county cart" : "acquisition workspace"}`),
          nxt && !readOnly ? el("div", { class: "row", style: "margin-top:6px" },
            el("strong", {}, "Next: "), el("span", {}, `${kind(nxt)} — ${copyValue(nxt)}`),
            el("button", { onclick: () => copy(nxt) }, "Copy next record")) : null,
          el("ol", { class: "small", style: "margin:6px 0 0 18px" }, sel.map((it) =>
            el("li", {}, `${kind(it)} — ${it.reference || ""} · ${it.clerk_search_value ? "validated number" : "manual search (" + (it.confidence || "unverified") + ")"} · ${A.STATUS_LABEL[it.status]}`)))) : null);
    }
    paint();
  }

  function targetOptions(s, docType, selectedId) {
    const opts = [el("option", { value: "" }, "Match it from the document")];
    (s.instruments || []).filter((i) => !docType || ["easement", "survey", "other"].includes(docType) || i.class === docType)
      .forEach((i) => opts.push(el("option", { value: i.target_id, selected: i.target_id === selectedId ? "selected" : null },
        `${i.class} · ${i.reference || ""}${i.parcels?.length ? " · " + i.parcels.join(", ") : ""}`)));
    return opts;
  }

  function drawUploads(d, r, s, uploads) {
    d.append(el("h2", { style: "margin-top:18px" }, "Upload several files at once"));
    d.append(el("p", { class: "small mut" }, "Download each record from the official search, then drop the PDFs here. " +
      "We match each file to its record from what's printed in the document — never from the file name — and flag anything that doesn't match."));
    const queue = el("div", {});
    const input = el("input", { type: "file", multiple: true, accept: ".pdf,.png,.jpg,.jpeg,.tif,.tiff", class: "hidden" });
    const drop = el("div", { class: "drop", onclick: () => input.click() }, "Drop PDFs here or click to choose files");
    ["dragover", "dragenter"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove("over")));
    drop.addEventListener("drop", (e) => { e.preventDefault(); stage(e.dataTransfer.files); });
    input.addEventListener("change", () => stage(input.files));
    function stage(files) {
      [...files].forEach((f) => {
        const type = el("select", {}, ["deed", "plat", "easement", "survey", "other"].map((t) => el("option", { value: t }, t)));
        const target = el("select", {}, targetOptions(s, "deed"));
        type.addEventListener("change", () => target.replaceChildren(...targetOptions(s, type.value)));
        const row = el("div", { class: "row", style: "padding:6px 0;border-top:1px solid var(--line)" },
          el("span", { style: "flex:1;min-width:160px" }, f.name), type, target);
        row._file = f; row._type = type; row._target = target;
        queue.append(row);
      });
      send.disabled = !queue.children.length;
    }
    const send = el("button", { disabled: true, onclick: async () => {
      send.disabled = true;
      for (const row of [...queue.children]) {
        const f = row._file;
        if (f.size > 60 * 1024 * 1024) { flash(f.name + " is larger than 60 MB."); continue; }
        const safe = f.name.replace(/[^A-Za-z0-9._ -]+/g, "_").slice(-120);
        const path = `${user.id}/${r.id}/${crypto.randomUUID()}-${safe}`;
        const up = await sb.storage.from("uploads").upload(path, f, { contentType: f.type || "application/pdf" });
        if (up.error) { flash("Upload failed for " + f.name + ": " + up.error.message); continue; }
        const ins = await sb.from("uploads").insert({ request_id: r.id, storage_path: path, filename: f.name.slice(0, 200),
          doc_type: row._type.value, chosen_target: row._target.value || null });
        if (ins.error) flash("Could not record " + f.name + ": " + ins.error.message);
        row.remove();
      }
      flash("Uploaded — each file is checked by the research computer in a few seconds.");
      refresh();
    } }, "Upload files");
    d.append(drop, input, queue, el("div", { class: "row", style: "margin-top:8px" }, send));

    if (uploads.length) {
      const tbl = el("table", {}, el("tr", {}, el("th", {}, "File"), el("th", {}, "Type"), el("th", {}, "Record"), el("th", {}, "Status")));
      uploads.forEach((u) => {
        const t = (s.instruments || []).find((i) => i.target_id === (u.association || {}).target_id);
        const sel = el("select", {}, targetOptions(s, u.doc_type, (u.association || {}).target_id));
        sel.addEventListener("change", () => sel.value && decide(r, "reassign_upload", { upload_id: u.id, target_id: sel.value }));
        tbl.append(el("tr", {}, el("td", {}, u.filename), el("td", {}, u.doc_type),
          el("td", { class: "small" }, t ? `${t.class} ${t.reference || ""}${u.association.suggested ? " (matched from the document)" : ""}` : "—",
            u.status !== "processing" && u.status !== "uploaded" ? el("div", {}, "Change: ", sel) : null),
          el("td", {}, el("span", { class: "badge b-" + u.status }, u.status_label || u.status))));
      });
      d.append(el("div", { class: "scroll", style: "margin-top:10px" }, tbl));
    }

    // Drafting is frozen (feature flag off by default): no drafting controls in the research workflow.
    if (!s.features?.drafting) return;
    const dr = r.drafting || {};
    d.append(el("h2", { style: "margin-top:18px" }, "Drafting"));
    const ready = uploads.some((u) => u.status === "accepted" && u.doc_type === "deed");
    const row = el("div", { class: "row" });
    if (!["queued", "running", "needs_call_review", "drawing"].includes(dr.status))
      row.append(el("button", { disabled: ready ? null : true, onclick: () => decide(r, "start_drafting", {}) }, "Start drafting"));
    if (dr.status_label) row.append(el("span", { class: "badge" }, dr.status_label));
    if (dr.package_path) row.append(el("button", { onclick: () => signed(dr.package_path, "drafting_package.zip") }, "Download DXF package"));
    d.append(row);
    if (!ready) d.append(el("p", { class: "small mut" }, "Upload at least the subject's deed (matched and verified) to start drafting."));
    if (dr.warnings?.length) d.append(el("details", { class: "small" }, el("summary", {}, dr.warnings.length + " drafting warning(s)"),
      el("ul", {}, dr.warnings.map((w) => el("li", {}, w)))));
  }

  // Upload one file to this search, optionally attached to one checklist item (the tower still verifies it
  // from the document's content, never from the file name).
  async function uploadOne(r, f, docType, targetId) {
    if (f.size > 60 * 1024 * 1024) { flash(f.name + " is larger than 60 MB."); return false; }
    const safe = f.name.replace(/[^A-Za-z0-9._ -]+/g, "_").slice(-120);
    const path = `${user.id}/${r.id}/${crypto.randomUUID()}-${safe}`;
    const up = await sb.storage.from("uploads").upload(path, f, { contentType: f.type || "application/pdf" });
    if (up.error) { flash("Upload failed for " + f.name + ": " + up.error.message); return false; }
    const ins = await sb.from("uploads").insert({ request_id: r.id, storage_path: path, filename: f.name.slice(0, 200),
      doc_type: docType, chosen_target: targetId || null });
    if (ins.error) { flash("Could not record " + f.name + ": " + ins.error.message); return false; }
    return true;
  }

  // ---- Documents Needed: one row per document the research needs (tower checklist is the source of truth) ----
  const WRITES = !!(cfg.checklistWrites);   // turned on after the Supabase decision types are approved
  function drawDocumentsNeeded(d, r, s, readOnly, uploads) {
    const D = window.ASCDocs, cl = s.checklist, prog = D.progress(cl.items);
    const box = el("div", { class: "card", style: "margin-top:14px" });
    d.append(box);
    const kinds = cl.reference_kinds || {};
    let seen = false;
    try { seen = !!localStorage.getItem("asc-docs-help-seen"); } catch (e) { /* ignore */ }
    box.append(
      el("h2", {}, "Documents Needed", el("span", { class: "small mut" }, `  ${prog.resolved} of ${prog.total} resolved`)),
      el("div", { class: "flash", style: "margin:8px 0" }, el("strong", {}, "What do I do next? "), cl.next?.text || ""),
      el("details", { open: seen ? null : true },
        el("summary", { class: "small" }, "How this works (read once)"),
        el("ol", { class: "small" }, (cl.tips || []).map((t) => el("li", {}, t))),
        el("p", { class: "small" }, el("strong", {}, "What the reference labels mean")),
        el("ul", { class: "small" }, ["verified", "candidate", "owner_legal", "plat"].filter((k) => kinds[k]).map((k) =>
          el("li", {}, el("strong", {}, kinds[k].label + ": "), kinds[k].explain))),
        (cl.notices || []).length ? el("p", { class: "small mut" }, cl.notices.join(" ")) : null,
        el("p", { class: "small mut" }, "Statuses you set (searching, found, purchased…) are your own notes. Only the research computer can mark a document Verified — after it reads the uploaded file.")));
    try { localStorage.setItem("asc-docs-help-seen", "1"); } catch (e) { /* ignore */ }
    if (!WRITES && !readOnly) box.append(el("p", { class: "small mut" },
      "Status changes from this page are switched on after the next database update. Uploading works now."));
    importOffer(box, r, cl, readOnly);
    cl.items.forEach((it) => box.append(itemCard(r, it, readOnly, uploads)));
  }

  function itemCard(r, it, readOnly, uploads) {
    const D = window.ASCDocs;
    const url = safeUrl(it.search_url), fb = safeUrl(it.fallback_url);
    const copyBtn = (label, v) => v ? el("button", { class: "ghost", onclick: async () => {
      try { await navigator.clipboard.writeText(v); flash("Copied: " + v); } catch (e) { flash("Copy this: " + v); } } }, label) : null;
    const tone = it.status === "verified" ? "b-done" : it.status === "rejected" ? "b-failed" : it.status === "uploaded" ? "b-waiting" : "";
    const card = el("div", { style: "border-top:1px solid var(--line);padding:12px 0" },
      el("div", { class: "row", style: "justify-content:space-between" },
        el("div", {}, el("strong", {}, `${it.label} — ${it.class === "deed" ? "Deed" : "Plat"}`),
          el("div", { class: "small mut" }, [it.owner, it.legal_short, (it.parcels || []).join(", ")].filter(Boolean).join(" · "))),
        el("span", { class: "badge " + tone }, D.LABEL[it.status] || it.status)),
      el("div", { class: "small", style: "margin-top:6px" }, el("strong", {}, it.reference_label + ": "), it.reference || "—"),
      el("div", { class: "row", style: "margin-top:6px" },
        url ? el("a", { class: "btn", href: url, target: "_blank", rel: "noopener" }, "Open county search ↗") : null,
        fb && it.reference_kind === "candidate" ? el("a", { class: "btn", href: fb, target: "_blank", rel: "noopener",
          style: "background:transparent;color:var(--fg);border-color:var(--brass)" }, "Owner search ↗") : null,
        copyBtn("Copy number", it.copy?.number), copyBtn("Copy owner", it.copy?.owner), copyBtn("Copy legal", it.copy?.legal)),
      el("div", { class: "small", style: "margin-top:6px" }, el("strong", {}, "Next: "), it.next_action),
      it.verification ? el("div", { class: "small mut" }, "Check result: " + it.verification) : null,
      (it.documents || []).length ? el("div", { class: "small mut" }, (it.documents || []).map((x) => `📄 ${x.filename} (${x.state})`).join(" · ")) : null);
    if (!readOnly) {
      const controls = el("div", { class: "row", style: "margin-top:6px" });
      const sel = el("select", { disabled: (WRITES && !D.TOWER.includes(it.status)) ? null : true },
        D.OPERATOR.map((st) => el("option", { value: st, selected: it.operator_status === st ? "selected" : null }, D.LABEL[st])));
      const note = el("input", { placeholder: "Note (optional)", value: it.note || "", maxlength: "1000",
        style: "flex:1;min-width:160px", disabled: WRITES ? null : true });
      const save = el("button", { class: "ghost", disabled: WRITES ? null : true, onclick: async () => {
        save.disabled = true;
        try { await decide(r, "checklist_update", D.statusRequest(it, sel.value, note.value, crypto.randomUUID())); }
        catch (e) { flash(e.message); }
      } }, "Save");
      const file = el("input", { type: "file", accept: ".pdf,.png,.jpg,.jpeg,.tif,.tiff", class: "hidden" });
      file.addEventListener("change", async () => {
        if (!file.files[0]) return;
        if (await uploadOne(r, file.files[0], it.class, it.target_id)) { flash("Uploaded — checking it against this item now."); refresh(); }
      });
      controls.append(sel, note, save, file, el("button", { onclick: () => file.click() }, "Upload for this item"));
      card.append(controls);
    }
    if ((it.history || []).length) card.append(el("details", { class: "small" }, el("summary", {}, `History (${it.history.length})`),
      el("ul", {}, it.history.map((h) => el("li", {}, `${(h.at || "").slice(0, 16)} · ${h.actor}: ${D.LABEL[h.from] || h.from || "—"} → ${D.LABEL[h.to] || h.to || "—"}` +
        (h.source === "import" ? " (imported old-cart mark)" : "") + (h.result !== "applied" ? ` [${h.result}]` : "") + (h.note ? ` — ${h.note}` : ""))))));
    return card;
  }

  // Old browser-cart marks: preview first, then a deliberate confirm. The browser storage is left untouched.
  function importOffer(box, r, cl, readOnly) {
    if (readOnly) return;
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(`asc-research-acq:${user.id}:${r.id}`) || "null"); } catch (e) { return; }
    const rows = window.ASCDocs.cartPreview(stored, cl.items);
    if (!rows.length || cl.items.some((i) => (i.history || []).some((h) => h.source === "import"))) return;
    const btn = el("button", { class: "ghost", disabled: WRITES ? null : true, onclick: () =>
      decide(r, "checklist_update", window.ASCDocs.importRequest(rows, crypto.randomUUID())) }, "Add these to the history");
    box.append(el("details", { class: "small", style: "margin:8px 0" },
      el("summary", {}, `This browser has ${rows.length} mark(s) from the old research cart — preview`),
      el("p", { class: "mut" }, "These are past notes you made. They are added to each item's history as your claims; they never mark a document found or verified."),
      el("ul", {}, rows.map((x) => el("li", {}, `${x.label}: ${x.claim}`))), btn));
  }

  async function decide(r, kind, payload) {
    const { error } = await sb.from("decisions").insert({ request_id: r.id, kind, payload });
    const done = { cancel: "Cancel sent.", reassign_upload: "Re-checking the file against that record…",
                   start_drafting: "Drafting requested — the research computer will read the deeds.",
                   checklist_update: "Saved — the research computer records it in a few seconds." };
    flash(error ? "Could not send: " + error.message : done[kind] || "Sent — the research continues.");
    refresh();
  }

  init();
})();
