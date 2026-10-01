// ASC Research door — static page. Talks only to the Supabase project in config.js (publishable key, RLS-protected).
// The research itself runs on the Adams Surveying research computer, which picks requests up and posts results back.
(function () {
  "use strict";
  const cfg = window.ASC_RESEARCH || {};
  const $ = (id) => document.getElementById(id);
  const show = (id, on) => $(id).classList.toggle("hidden", !on);
  let sb = null, user = null, selected = null, requests = [], pollTimer = null;

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

  async function init() {
    if (!cfg.supabaseUrl || !cfg.supabaseKey || !window.supabase) { show("setup", true); return; }
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
    sb.auth.onAuthStateChange((_e, session) => { user = session?.user || null; render(); });
    const { data } = await sb.auth.getSession();
    user = data.session?.user || null;
    render();
  }

  function render() {
    show("signin", !user); show("app", !!user); show("signout", !!user);
    $("who").textContent = user ? user.email : "";
    if (user) { refresh(); clearInterval(pollTimer); pollTimer = setInterval(refresh, 8000); }
    else { clearInterval(pollTimer); show("tower", false); }
  }

  $("signinForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("email").value.trim().toLowerCase();
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
    flash(error ? "Could not send the link: " + error.message : "Check your email for the sign-in link.");
  });
  $("signout").addEventListener("click", async () => { await sb.auth.signOut(); selected = null; flash(""); });

  // Reset: clear the form and the open result, ready for the next property.
  function resetSearch() {
    $("searchForm").reset();
    $("searchForm").querySelector("details").open = false;
    selected = null; show("detail", false); flash("");
    document.querySelectorAll(".list a.sel").forEach((a) => a.classList.remove("sel"));
    $("q").focus();
  }
  $("reset").addEventListener("click", resetSearch);

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
    $("searchForm").reset();
    selected = data.id; flash("Submitted — the research computer will pick it up shortly.");
    await refresh();
  });

  async function refresh() {
    const [{ data: reqs, error }, { data: beat }] = await Promise.all([
      sb.from("requests").select("*").order("created_at", { ascending: false }).limit(50),
      sb.from("door_status").select("*").eq("id", 1).maybeSingle(),
    ]);
    if (error) { flash("Could not load your searches: " + error.message); return; }
    requests = reqs || [];
    towerBadge(beat);
    drawList();
    if (selected) drawDetail(requests.find((r) => r.id === selected));
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
    if (!requests.length) { list.append(el("p", { class: "mut" }, "No searches yet.")); return; }
    for (const r of requests) {
      list.append(el("a", { class: r.id === selected ? "sel" : "", onclick: () => { selected = r.id; drawList(); drawDetail(r); } },
        el("strong", { style: "flex:1;min-width:200px" }, r.query),
        r.reference ? el("span", { class: "small mut" }, r.reference) : null,
        el("span", { class: "badge b-" + r.status }, r.plain_status || r.status),
        el("span", { class: "small mut" }, when(r.created_at))));
    }
  }

  async function signed(path, filename) {
    const { data, error } = await sb.storage.from("packages").createSignedUrl(path, 3600, { download: filename });
    if (error) { flash("Download link failed: " + error.message); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  function drawDetail(r) {
    const d = $("detail");
    if (!r) { show("detail", false); return; }
    show("detail", true); d.replaceChildren();
    const s = r.summary || {};
    d.append(el("div", { class: "row", style: "justify-content:space-between" },
      el("h2", {}, r.query), el("span", { class: "badge b-" + r.status }, r.plain_status || r.status)));
    if (r.error) d.append(el("div", { class: "flash" }, r.error));

    const actions = el("div", { class: "row", style: "margin:8px 0 12px" });
    if (r.package_path) actions.append(el("button", { onclick: () => signed(r.package_path, "research_package.zip") }, "Download package (.zip)"));
    if (r.report_path) actions.append(el("button", { class: "ghost", onclick: () => signed(r.report_path, "RESEARCH_REPORT.html") }, "Download report"));
    if (["queued", "running", "waiting"].includes(r.status))
      actions.append(el("button", { class: "ghost", onclick: () => decide(r, "cancel", {}) }, "Cancel"));
    actions.append(el("button", { class: "ghost", onclick: resetSearch }, "New search"));
    d.append(actions);

    if (s.subject) {
      d.append(el("h2", {}, "Subject"),
        el("p", {}, `${s.county || ""} parcel ${s.subject.parcel_id || ""} — ${s.subject.situs || ""}`),
        el("p", { class: "small mut" }, `${s.subject.legal || ""}${s.subject.owner ? " · CAD owner: " + s.subject.owner : ""}`));
    }
    if (r.status === "waiting" && s.candidates?.length) {
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
    if (s.adjoiners?.length) {
      d.append(el("h2", { style: "margin-top:14px" }, "Adjoiners"));
      d.append(el("div", { class: "scroll" }, el("table", {},
        el("tr", {}, el("th", {}, "Adjoiner"), el("th", {}, "Type"), el("th", {}, "Shared")),
        s.adjoiners.map((a) => el("tr", {}, el("td", {}, a.label + (a.accounts > 1 ? ` (${a.accounts} accounts)` : "")),
          el("td", {}, a.classification), el("td", {}, a.shared_ft ? a.shared_ft.toFixed(1) + " ft" : ""))))));
    }
    if (s.instruments?.length) {
      d.append(el("h2", { style: "margin-top:14px" }, "Deeds and plats"));
      d.append(el("div", { class: "scroll" }, el("table", {},
        el("tr", {}, el("th", {}, "Type"), el("th", {}, "Reference"), el("th", {}, "Status"), el("th", {}, "Official search")),
        s.instruments.map((i) => {
          const url = safeUrl(i.search_url);
          return el("tr", {},
            el("td", {}, i.class),
            el("td", {}, i.reference || "", i.official_reference ? el("div", { class: "small mut" }, "County record: " + i.official_reference) : null,
              i.filed ? el("div", { class: "small mut" }, "Filed " + i.filed) : null,
              (i.documents || []).map((x) => el("div", { class: "small" }, "📄 " + x.filename + " (" + x.state.replace(/_/g, " ") + ")"))),
            el("td", {}, (i.state || "").replace(/_/g, " ")),
            el("td", {}, url ? el("a", { href: url, target: "_blank", rel: "noopener" }, "Open ↗") : ""));
        }))));
    }
    if (s.open_items?.length) {
      d.append(el("h2", { style: "margin-top:14px" }, "Open items"),
        el("ul", { class: "small" }, s.open_items.map((o) => el("li", {}, `[${o.severity}] ${o.title}`))));
    }
    if (r.status === "queued") d.append(el("p", { class: "mut" }, "Waiting for the research computer to pick this up."));
  }

  async function decide(r, kind, payload) {
    const { error } = await sb.from("decisions").insert({ request_id: r.id, kind, payload });
    flash(error ? "Could not send: " + error.message : kind === "cancel" ? "Cancel sent." : "Sent — the research continues.");
    refresh();
  }

  init();
})();
