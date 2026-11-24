/* ASC Plat Planner page. Lookups go from the visitor's browser to public services; the request inserts into
   snapshot_requests (insert-only for the public key). ?dry=1, or a name starting TEST, walks the request without
   writing a row. ?demo=1 skips the network lookups with a sample Dallas lot, for review and tests. */
(function () {
  "use strict";
  const P = window.Planner;
  const CONFIG = {
    store: { url: "https://cjwiaxadnoboqvjvycwt.supabase.co", key: "sb_publishable_cX2htvqwO__Kg326qQQzug_ii7pPiVf", table: "snapshot_requests" },
    geocoder: "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer",
    parcels: "https://feature.geographic.texas.gov/arcgis/rest/services/Parcels/stratmap_land_parcels_48_most_recent/MapServer",
    cities: "https://feature.geographic.texas.gov/arcgis/rest/services/City_Boundaries/Texas_City_Boundaries/MapServer",
    fallbackEmail: "surveytx@txasc.com",
  };
  const params = new URLSearchParams(location.search);
  const DRY = params.has("dry"), DEMO = params.has("demo");
  if (DRY) document.body.classList.add("dry");

  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const qs = o => Object.entries(o).map(([k, v]) => k + "=" + encodeURIComponent(v)).join("&");
  const titleCase = s => String(s || "").toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
  const todayIso = () => { const t = new Date(); return new Date(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate(), 12)).toISOString().slice(0, 10); };

  async function getJSON(url, ms) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms || 12000);
    try {
      const r = await fetch(url, { signal: ctl.signal });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json(); if (j && j.error) throw new Error(j.error.message || "service error");
      return j;
    } finally { clearTimeout(t); }
  }

  /* ---------- location: address, map link, coordinates, plus code ---------- */
  const OLC = "23456789CFGHJMPQRVWX";
  function olcDecode(code) {
    const c = code.toUpperCase().replace("+", "").replace(/0+$/, "");
    let lat = -90, lng = -180, res = 20, last = 20;
    for (let i = 0; i < Math.min(10, c.length); i += 2) { lat += OLC.indexOf(c[i]) * res; lng += OLC.indexOf(c[i + 1]) * res; last = res; res /= 20; }
    let ls = last, gs = last;
    for (let i = 10; i < c.length; i++) { const d = OLC.indexOf(c[i]); ls /= 5; gs /= 4; lat += Math.floor(d / 4) * ls; lng += (d % 4) * gs; }
    return { lat: lat + ls / 2, lng: lng + gs / 2 };
  }
  function olcEncodePrefix(lat, lng, len) {
    lat = Math.min(89.9999, Math.max(-90, lat)) + 90; lng = ((lng + 180) % 360 + 360) % 360; let out = "", res = 20;
    for (let i = 0; i < len; i += 2) { const a = Math.floor(lat / res), b = Math.floor(lng / res); out += OLC[a] + OLC[b]; lat -= a * res; lng -= b * res; res /= 20; }
    return out;
  }
  function olcRecover(short, ref) {
    const s = short.toUpperCase(), pad = 8 - s.indexOf("+"), res = Math.pow(20, 2 - pad / 2), half = res / 2;
    const p = olcDecode(olcEncodePrefix(ref.lat, ref.lng, pad) + s);
    if (ref.lat + half < p.lat) p.lat -= res; else if (ref.lat - half > p.lat) p.lat += res;
    if (ref.lng + half < p.lng) p.lng -= res; else if (ref.lng - half > p.lng) p.lng += res;
    return p;
  }
  function dms(str) {
    const re = /(\d{1,3})[°\s]+(\d{1,2})['′\s]+(\d{1,2}(?:\.\d+)?)["″]?\s*([NSEW])/gi, out = []; let m;
    while ((m = re.exec(str))) { let v = +m[1] + m[2] / 60 + m[3] / 3600; if (/[SW]/i.test(m[4])) v = -v; out.push({ v, h: m[4].toUpperCase() }); }
    if (out.length === 2) { const la = out.find(o => /[NS]/.test(o.h)), lo = out.find(o => /[EW]/.test(o.h)); if (la && lo) return { lat: la.v, lng: lo.v }; }
    return null;
  }
  async function geocode(text) {
    const j = await getJSON(CONFIG.geocoder + "/findAddressCandidates?" + qs({ SingleLine: text, f: "json", maxLocations: 1, countryCode: "USA", outFields: "Match_addr", searchExtent: "-106.7,25.8,-93.5,36.6" }));
    const c = j.candidates && j.candidates[0]; if (!c || c.score < 75) return null;
    return { lat: c.location.y, lng: c.location.x, label: c.attributes.Match_addr || c.address };
  }
  async function parseLocation(raw) {
    const s = raw.trim(); if (!s) throw new Error("Enter an address, a map pin link or coordinates.");
    let m = s.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || s.match(/[?&](?:q|ll|query|center)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i);
    if (m) return { lat: +m[1], lng: +m[2], kind: "Map pin" };
    if (/^https?:\/\//i.test(s)) throw new Error("That link doesn't carry coordinates. Drop a pin in Google Maps and paste the coordinates it shows.");
    const d = dms(s); if (d) return { ...d, kind: "Coordinates" };
    m = s.match(/^\s*(-?\d{1,3}\.\d+)\s*[, ]\s*(-?\d{1,3}\.\d+)\s*$/);
    if (m) { let a = +m[1], b = +m[2]; if (Math.abs(a) > 90) [a, b] = [b, a]; if (a > 0 && b > 0 && a < 40) b = -b; return { lat: a, lng: b, kind: "Coordinates" }; }
    m = s.match(/\b([23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]{2,})\b/i);
    if (m) {
      const code = m[1];
      if (code.indexOf("+") === 8) return { ...olcDecode(code), kind: "Plus code" };
      const locality = s.replace(code, "").replace(/^[\s,]+|[\s,]+$/g, ""); let ref = { lat: 32.85, lng: -96.85 };
      if (locality) { try { const g = await geocode(locality + ", TX"); if (g) ref = g; } catch (_) {} }
      return { ...olcRecover(code, ref), kind: "Plus code" };
    }
    let g;
    try { g = await geocode(/\btx\b|texas/i.test(s) ? s : s + ", TX"); }
    catch (_) { throw new Error("The address search didn't answer. Paste coordinates or a map pin link, or try again in a minute."); }
    if (!g) throw new Error("We couldn't place that address. Add the city, or paste coordinates or a map pin link.");
    return { ...g, kind: "Address" };
  }

  async function fetchCity(p) {
    const d = 0.01, ext = [p.lng - d, p.lat - d, p.lng + d, p.lat + d].join(",");
    const j = await getJSON(CONFIG.cities + "/identify?" + qs({ geometry: p.lng + "," + p.lat, geometryType: "esriGeometryPoint", sr: 4326, layers: "all", tolerance: 0, mapExtent: ext, imageDisplay: "400,400,96", returnGeometry: false, f: "json" }));
    const r = (j.results || [])[0]; return r ? titleCase(r.attributes.city_name) : null;
  }
  async function fetchParcel(p) {
    const d = 0.003, ext = [p.lng - d, p.lat - d, p.lng + d, p.lat + d].join(",");
    const j = await getJSON(CONFIG.parcels + "/identify?" + qs({ geometry: p.lng + "," + p.lat, geometryType: "esriGeometryPoint", sr: 4326, layers: "all:0", tolerance: 0, mapExtent: ext, imageDisplay: "600,600,96", returnGeometry: false, f: "json" }));
    const r = (j.results || [])[0]; if (!r) return null; const a = r.attributes;
    return { county: a.COUNTY || null, legal: a.LEGAL_DESC || null, propId: a.PROP_ID != null ? String(a.PROP_ID) : null, acres: +a.LEGAL_AREA || null, situs: a.SITUS_ADDR || null };
  }

  /* ---------- state ---------- */
  const S = { goal: "split", site: null, tier: null, target: null, docs: {} };
  const PREP_DAYS = 42;

  /* ---------- hero: goals and the next Dallas windows ---------- */
  function renderGoals() {
    $("#goalGrid").innerHTML = P.GOALS.map(g => `<label class="goal"><input type="radio" name="goal" value="${g.id}"${g.id === S.goal ? " checked" : ""}><span>${esc(g.label)}</span></label>`).join("");
    $("#goalGrid").addEventListener("change", e => { if (e.target.name === "goal") { S.goal = e.target.value; if (S.site) render(); } });
  }
  function renderNext() {
    const rows = P.upcoming(todayIso(), 4);
    $("#nextList").innerHTML = rows.map(r => `<li><span class="nl-sub">File ${esc(P.fmt(r.submit))} / ${esc(P.fmt(r.submit2))}</span><span class="nl-cpc">Hearing ${esc(P.fmt(r.cpc, true))}</span></li>`).join("");
    $("#nextProj").hidden = !rows.some(r => r.projected);
  }

  /* ---------- run ---------- */
  async function run(e) {
    e.preventDefault();
    const raw = $("#loc").value, btn = $("#go"), st = $("#status");
    btn.disabled = true; st.textContent = "Finding the land…"; st.className = "status";
    try {
      let p, city = null, parcel = null;
      if (DEMO) { p = { lat: 32.8013, lng: -96.8001, label: raw.trim() || "Sample lot, Uptown Dallas", kind: "Sample" }; city = "Dallas"; parcel = { county: "DALLAS", legal: "SAMPLE ADDN BLK 3/948 LOT 7", propId: null, acres: 0.31 }; }
      else {
        p = await parseLocation(raw);
        st.textContent = "Reading city limits and the appraisal record…";
        const [c, pr] = await Promise.allSettled([fetchCity(p), fetchParcel(p)]);
        city = c.status === "fulfilled" ? c.value : undefined; parcel = pr.status === "fulfilled" ? pr.value : null;
      }
      S.site = { input: raw.trim(), lat: p.lat, lng: p.lng, label: p.label || (parcel && parcel.situs) || p.kind, kind: p.kind, city, cityUnknown: city === undefined,
        county: parcel && parcel.county, legal: parcel && parcel.legal, propId: parcel && parcel.propId, acres: parcel && parcel.acres };
      S.site.platted = P.plattedFromLegal(S.site.legal);
      S.tier = P.tierFor(city, p);
      S.target = S.tier.tier === 1 ? P.planningTarget(todayIso(), PREP_DAYS) : null;
      S.docs = {};
      st.textContent = "";
      render();
      $("#result").scrollIntoView({ behavior: "smooth" });
    } catch (err) {
      st.textContent = err.message || "Something went wrong. Try again, or call us."; st.className = "status err";
    } finally { btn.disabled = false; }
  }

  function render() {
    const s = S.site, t = S.tier, type = P.platType(S.goal, s.platted);
    const where = s.city ? `City of ${s.city}` : s.cityUnknown ? "City limits not read" : "Outside city limits";
    if (s.cityUnknown) {
      $("#resH").textContent = `${type.name} for this site`;
      $("#resSub").textContent = "The city limits service didn't answer, so we can't tell yet whether a city or the county reviews this plat. The sequence below is the Texas plat path both follow, and we confirm the reviewer when we start.";
    } else {
    $("#resH").textContent = t.tier === 1 ? `${type.name} in the City of ${s.city}` : t.tier === 2 ? `${type.name} in ${s.city}` : `${type.name} outside city limits`;
    $("#resSub").textContent = t.tier === 1 ? "Dated from the city's plat submittal calendar. Pick a different hearing below to see the dates move."
      : t.tier === 2 ? `We'll pull ${s.city}'s submittal calendar and checklist when we start. The sequence below is the Texas plat path every city follows.`
      : "Land outside city limits is platted through the county, or through the nearby city if it sits in that city's extraterritorial jurisdiction. We confirm which when we start.";
    }
    const facts = [["Location", s.label], ["Jurisdiction", where], ["County", s.county ? titleCase(s.county) + " County" : "Not read"],
      ["Appraisal legal", s.legal || "Not read"], ["On record as", { platted: "A platted lot", acreage: "An unplatted tract", unknown: "Not clear from the record" }[s.platted]]];
    if (!t.inRange) facts.push(["Service area", `About ${Math.round(t.near.miles)} miles from ${t.near.hub}. Outside our regular area, so we'll tell you plainly if we're the right fit.`]);
    $("#facts").innerHTML = facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");
    $("#typeCard").innerHTML = `<p class="mono-k">Likely plat type</p><h3>${esc(type.name)}</h3><p>${esc(type.why)}</p>${s.platted === "unknown" ? "<p class=\"soft\">We read the type from the appraisal record and your goal. The recorded history confirms it.</p>" : ""}`;

    const box = $("#targetBox");
    if (t.tier === 1) {
      box.hidden = false;
      const rows = P.upcoming(todayIso(), 12);
      $("#target").innerHTML = rows.map(r => `<option value="${r.cpc}"${S.target && r.cpc === S.target.cpc ? " selected" : ""}>${esc(P.fmt(r.cpc, true))} hearing · file ${esc(P.fmt(r.submit))}${r.projected ? " · projected" : ""}</option>`).join("");
      $("#targetNote").textContent = `Planning target: the first hearing that leaves about six weeks for field work and drawing before the filing window. ${S.target && S.target.projected ? "Dates after December 17, 2026 are projected from the city's 2026 rhythm until Dallas publishes its next calendar." : ""}`;
    } else box.hidden = true;

    const steps = P.path({ tier: t.tier, goal: S.goal, today: todayIso(), target: S.target });
    $("#path").innerHTML = steps.map((st, i) => {
      const when = st.when ? (st.when2 ? `${P.fmt(st.when)} – ${P.fmt(st.when2, true)}` : P.fmt(st.when, true)) : st.span;
      const today = st.when === todayIso();
      return `<li class="step${st.id === "cpc" ? " key" : ""}" style="--i:${i}">
        <div class="when">${esc(today ? "Today" : when)}${st.projected ? '<span class="tag">Projected</span>' : ""}</div>
        <div class="node" aria-hidden="true"></div>
        <div class="what"><h3>${esc(st.title)}</h3><p>${esc(st.body)}</p></div></li>`;
    }).join("");

    renderDocs(); renderSummary();
    $("#result").hidden = false; $("#papers").hidden = false;
  }

  /* ---------- paperwork ---------- */
  function renderDocs() {
    const L = P.paperwork(S.goal, S.site.platted, S.tier.tier);
    const item = d => {
      const v = S.docs[d.id] || "";
      const ctl = d.who === "you" ? `<div class="seg" role="group" aria-label="${esc(d.label)}">
          <button type="button" data-doc="${d.id}" data-v="have" aria-pressed="${v === "have"}">I have it</button>
          <button type="button" data-doc="${d.id}" data-v="help" aria-pressed="${v === "help"}">Need help</button>
          ${d.pull ? `<button type="button" data-doc="${d.id}" data-v="pull" aria-pressed="${v === "pull"}">You pull it</button>` : ""}</div>` : "";
      return `<li class="doc${v ? " is-" + v : ""}"><div><h4>${esc(d.label)}${d.pull ? ' <span class="pull">we can pull it</span>' : ""}</h4><p>${esc(d.note)}</p></div>${ctl}</li>`;
    };
    $("#docsYou").innerHTML = L.filter(d => d.who === "you").map(item).join("");
    $("#docsAsc").innerHTML = L.filter(d => d.who === "asc").map(item).join("");
    $("#docsCity").innerHTML = L.filter(d => d.who === "city").map(item).join("");
    const mine = L.filter(d => d.who === "you"), done = mine.filter(d => S.docs[d.id] === "have" || S.docs[d.id] === "pull").length;
    $("#readyFill").style.width = (mine.length ? done / mine.length * 100 : 0) + "%";
    $("#readyTxt").textContent = done === mine.length ? "Everything on your side is covered. That is the fastest way into a filing window."
      : `${done} of ${mine.length} owner-side items covered. Anything marked "Need help" goes on our first call.`;
  }
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-doc]"); if (!b) return;
    const id = b.dataset.doc, v = b.dataset.v; S.docs[id] = S.docs[id] === v ? "" : v; renderDocs(); renderSummary();
  });
  $("#target") && $("#target").addEventListener("change", e => {
    S.target = P.upcoming(todayIso(), 12).find(r => r.cpc === e.target.value) || S.target; render();
  });

  function renderSummary() {
    const ul = $("#startSum");
    if (!S.site) { ul.innerHTML = "<li>Plan your plat above and the details come with your request.</li>"; return; }
    const type = P.platType(S.goal, S.site.platted), have = Object.values(S.docs).filter(v => v === "have" || v === "pull").length;
    ul.innerHTML = [`<li><b>${esc(type.name)}</b> · ${esc(S.site.label)}</li>`,
      S.target ? `<li>Target hearing ${esc(P.fmt(S.target.cpc, true))}${S.target.projected ? " (projected)" : ""}</li>` : `<li>${esc(S.site.city ? S.site.city : S.site.county ? titleCase(S.site.county) + " County" : "Texas")}</li>`,
      `<li>${have} owner-side item${have === 1 ? "" : "s"} ready</li>`].join("");
  }

  /* ---------- request ---------- */
  async function send(e) {
    e.preventDefault();
    const f = e.target, msg = $("#formMsg"), fd = new FormData(f), v = k => String(fd.get(k) || "").trim();
    if (!v("name") || !/^\S+@\S+\.\S+$/.test(v("email"))) { msg.textContent = "Add your name and an email we can reply to."; msg.className = "form-msg err"; return; }
    const s = S.site, type = s ? P.platType(S.goal, s.platted) : null;
    const row = {
      kind: "request", goal: ("plat:" + S.goal).slice(0, 40), site_type: "plat", survey: type ? type.name.slice(0, 200) : "Plat (not planned on page)",
      location: (s ? s.label + (s.input && s.input !== s.label ? " | " + s.input : "") : "not given").slice(0, 400),
      lat: s ? s.lat : null, lng: s ? s.lng : null, county: s && s.county ? String(s.county).slice(0, 80) : null,
      legal: s && s.legal ? s.legal.slice(0, 1000) : null, prop_id: s && s.propId ? s.propId.slice(0, 80) : null, acres: s && s.acres ? s.acres : null,
      name: v("name").slice(0, 200), email: v("email").slice(0, 320), phone: v("phone").slice(0, 40) || null, company: v("company").slice(0, 200) || null,
      role: v("role").slice(0, 60), note: v("note").slice(0, 1000) || null, wants_proposal: true, is_sample: DEMO,
      timing: S.target ? ("CPC " + S.target.cpc + (S.target.projected ? " projected" : "")).slice(0, 60) : null,
      packet: { page: "plat", v: 1, city: s ? s.city || null : null, tier: S.tier ? S.tier.tier : null, in_range: S.tier ? S.tier.inRange : null,
        platted: s ? s.platted : null, plat_type: type ? type.name : null, target: S.target || null, docs: S.docs },
    };
    const btn = $("#send"); btn.disabled = true; msg.className = "form-msg"; msg.textContent = "Sending…";
    try {
      if (DRY || /^test/i.test(row.name)) { console.log("[plat] dry run", row); await new Promise(r => setTimeout(r, 400)); }
      else {
        const r = await fetch(CONFIG.store.url + "/rest/v1/" + CONFIG.store.table, { method: "POST",
          headers: { "Content-Type": "application/json", apikey: CONFIG.store.key, Authorization: "Bearer " + CONFIG.store.key, Prefer: "return=minimal" }, body: JSON.stringify(row) });
        if (!r.ok) throw new Error("HTTP " + r.status);
      }
      f.reset(); msg.className = "form-msg ok";
      msg.textContent = "Got it. A surveyor will review the record and reply with next steps and the documents we still need.";
    } catch (_) {
      msg.className = "form-msg err";
      msg.innerHTML = `That didn't go through. Call <a href="tel:+14693170250">(469) 317-0250</a> or email <a href="mailto:${CONFIG.fallbackEmail}">${CONFIG.fallbackEmail}</a>.`;
    } finally { btn.disabled = false; }
  }

  /* ---------- hero reel and header ---------- */
  function heroReel() {
    const box = $("#heroReel"); if (!box || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const v = document.createElement("video"); v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = true; v.preload = "auto";
    v.src = "../screen/img/reel/2.mp4"; v.addEventListener("playing", () => v.classList.add("on"), { once: true }); box.appendChild(v); v.play().catch(() => {});
  }
  addEventListener("scroll", () => $("#hdr").classList.toggle("is-scrolled", scrollY > 40), { passive: true });

  renderGoals(); renderNext(); renderSummary(); heroReel();
  $("#plan").addEventListener("submit", run);
  $("#startForm").addEventListener("submit", send);
  if (params.get("loc")) { $("#loc").value = params.get("loc"); }
})();
