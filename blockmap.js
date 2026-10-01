// Block research map — shared by the tower job page and the public ASC Research page.
// Renders mapdata.build() GeoJSON with Leaflet. All feature text is inserted as text nodes, never HTML.
//
// opts.animate: reveal what the research has found as it arrives — fly to the search location, then light up the
// subject, then each direct adjoiner, the streets, and the block lots. Anything already revealed stays put, so a
// refresh mid-way only plays the new parts. opts.status: a short "what's happening now" label shown on the map.
(function (global) {
  "use strict";
  const PARCEL = {
    subject: { color: "#d62828", fillOpacity: 0.35, weight: 3, label: "Subject" },
    direct_adjoiner: { color: "#2a9d8f", fillOpacity: 0.22, weight: 2, label: "Direct adjoiners" },
    block_lot: { color: "#4361ee", fillOpacity: 0.12, weight: 1.5, label: "Block lots" },
    candidate: { color: "#3a86ff", fillOpacity: 0.10, weight: 2, dashArray: "6 4", label: "Candidates" },
  };
  const LINE = {
    right_of_way: { color: "#6c757d", weight: 6, opacity: 0.85, group: "boundaries" },
    alley: { color: "#8d6e63", weight: 5, dashArray: "8 6", group: "boundaries" },
    reserve: { color: "#52b788", weight: 5, group: "boundaries" },
    utility: { color: "#52b788", weight: 5, dashArray: "2 6", group: "boundaries" },
    drainage: { color: "#4895ef", weight: 5, dashArray: "2 6", group: "boundaries" },
    unknown_gap: { color: "#f4a261", weight: 5, dashArray: "4 6", group: "unresolved" },
  };
  const GROUP_LABEL = { subject: "Subject", direct_adjoiner: "Direct adjoiners", block_lot: "Block lots",
                        candidate: "Candidates", boundaries: "Streets & boundaries", unresolved: "Unresolved items" };
  const STAGES = ["search", "subject", "candidate", "direct_adjoiner", "boundaries", "block_lot", "unresolved"];
  const DFW = [32.9, -96.9];

  function node(tag, text, style) { const n = document.createElement(tag); if (text != null) n.textContent = text; if (style) n.style.cssText = style; return n; }

  (function css() {
    if (document.getElementById("bm-css")) return;
    const s = document.createElement("style");
    s.id = "bm-css";
    s.textContent =
      "@keyframes bmRing{0%{transform:scale(.4);opacity:.9}100%{transform:scale(2.6);opacity:0}}" +
      "@keyframes bmGlow{0%,100%{stroke-opacity:1;stroke-width:3px}50%{stroke-opacity:.35;stroke-width:7px}}" +
      "@keyframes bmSpin{to{transform:rotate(360deg)}}" +
      ".bm-pin{position:relative;width:18px;height:18px}" +
      ".bm-pin i{position:absolute;inset:3px;border-radius:50%;background:#ffd166;border:2px solid #111;box-sizing:border-box}" +
      ".bm-pin b{position:absolute;inset:0;border-radius:50%;border:3px solid #ffd166;animation:bmRing 1.6s ease-out infinite}" +
      ".bm-subject-live{animation:bmGlow 1.4s ease-in-out 4}" +
      ".bm-status{background:rgba(18,13,9,.88);color:#efe4cf;padding:6px 11px;border-radius:5px;font:600 12px/1.3 system-ui,sans-serif;" +
      "letter-spacing:.03em;display:flex;gap:8px;align-items:center;box-shadow:0 2px 8px rgba(0,0,0,.35);max-width:240px}" +
      ".bm-status s{width:12px;height:12px;border-radius:50%;border:2px solid #c99a4b;border-right-color:transparent;" +
      "animation:bmSpin .8s linear infinite;flex:none}" +
      "@media (prefers-reduced-motion:reduce){.bm-pin b,.bm-subject-live,.bm-status s{animation:none}}";
    document.head.append(s);
  })();
  const reducedMotion = () => global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function popup(p) {
    const d = node("div", null, "max-width:280px;font:13px/1.4 system-ui,sans-serif");
    if (p.kind === "boundary") {
      d.append(node("strong", p.type_label || p.type));
      if (p.label) d.append(node("div", p.label));
      if (p.shared_ft) d.append(node("div", p.shared_ft.toFixed(1) + " ft of frontage", "color:#666"));
      if (p.advisory) d.append(node("div", "Advisory: not crossed — check on the ground or the plat.", "color:#a86400"));
      return d;
    }
    d.append(node("strong", (p.role_label || "") + " · " + (p.parcel_id || "")));
    if (p.address) d.append(node("div", p.address));
    if (p.legal) d.append(node("div", p.legal, "color:#555"));
    if (p.owner) d.append(node("div", "CAD owner: " + p.owner, "color:#555"));
    (p.targets || []).forEach(function (t) {
      const row = node("div", null, "margin-top:4px");
      row.append(node("span", t.class + " " + (t.reference || "") + " — " + t.status + " "));
      try {
        const u = new URL(t.search_url);
        if (u.protocol === "https:") { const a = node("a", "search ↗"); a.href = u.href; a.target = "_blank"; a.rel = "noopener"; row.append(a); }
      } catch (e) { /* no link */ }
      d.append(row);
    });
    return d;
  }

  function featKey(f) {
    const p = f.properties || {};
    return p.kind + ":" + (p.role || p.type || "") + ":" + (p.parcel_id || p.label || "");
  }
  // Geometry signature: re-render only when parcels/boundaries materially change (keeps the user's zoom otherwise).
  function signature(fc) { return (fc.features || []).map(featKey).sort().join("|"); }

  function stageOf(f) {
    const p = f.properties || {};
    if (p.kind === "search_point") return "search";
    if (p.kind === "parcel") return PARCEL[p.role] ? p.role : "block_lot";
    if (p.kind === "boundary") return (LINE[p.type] || LINE.unknown_gap).group;
    return null;
  }

  function makeLayer(f) {
    const p = f.properties || {};
    if (p.kind === "parcel") {
      const st = PARCEL[p.role] || PARCEL.block_lot;
      const lyr = L.geoJSON(f, { style: Object.assign({ fillColor: st.color }, st) }).bindPopup(popup(p));
      lyr._target = st;
      return lyr;
    }
    if (p.kind === "boundary") return L.geoJSON(f, { style: LINE[p.type] || LINE.unknown_gap }).bindPopup(popup(p));
    if (p.kind === "search_point") {
      const c = f.geometry.coordinates;
      return L.marker([c[1], c[0]], { icon: L.divIcon({ className: "", html: '<div class="bm-pin"><b></b><i></i></div>', iconSize: [18, 18], iconAnchor: [9, 9] }) })
        .bindTooltip(p.label || "Search location");
    }
    return null;
  }

  // Fade a parcel in from transparent to its normal style.
  function fadeIn(lyr, ms) {
    const st = lyr._target;
    if (!st || reducedMotion()) return;
    const steps = 8;
    let i = 0;
    lyr.setStyle({ opacity: 0, fillOpacity: 0 });
    const t = setInterval(function () {
      i += 1;
      lyr.setStyle({ opacity: Math.min(1, i / steps), fillOpacity: st.fillOpacity * Math.min(1, i / steps) });
      if (i >= steps) clearInterval(t);
    }, ms / steps);
  }

  function setStatus(el, map, text) {
    if (!el._status) {
      const c = L.control({ position: "bottomright" });
      c.onAdd = function () { const d = node("div"); d.className = "bm-status"; d.append(node("s"), node("span")); return d; };
      c.addTo(map);
      el._status = c;
    }
    const box = el._status.getContainer();
    box.style.display = text ? "flex" : "none";
    box.lastChild.textContent = text || "";
  }

  global.renderBlockMap = function (elId, fc, opts) {
    opts = opts || {};
    fc = fc || { type: "FeatureCollection", features: [] };
    const el = typeof elId === "string" ? document.getElementById(elId) : elId;
    if (!global.L || !el) return null;
    const sig = signature(fc);
    if (el._map && el._sig === sig && !opts.force) {
      if (opts.status !== undefined) setStatus(el, el._map, opts.status);
      el._map.invalidateSize();
      return el._map;
    }
    let map = el._map;
    const first = !map;
    if (first) {
      map = L.map(el, { zoomSnap: 0.25 });
      el._map = map;
      el._shown = new Set();
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        { maxZoom: 20, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
      const note = L.control({ position: "bottomleft" });
      note.onAdd = function () {
        return node("div", (fc.properties && fc.properties.disclaimer) || "CAD geometry only — visual research aid, not survey geometry.",
          "background:rgba(255,255,255,.9);color:#333;padding:3px 7px;border-radius:4px;font:11px system-ui,sans-serif");
      };
      note.addTo(map);
      map.setView(DFW, 9);
    }
    (el._timers || []).forEach(clearTimeout);
    el._timers = [];
    (el._groups || []).forEach(function (g) { map.removeLayer(g); });
    if (el._ctl) map.removeControl(el._ctl);
    if (opts.status !== undefined) setStatus(el, map, opts.status);

    const groups = {};
    const group = (k) => (groups[k] = groups[k] || L.featureGroup().addTo(map));
    const pending = {};                                      // stage -> [[key, layer]] not yet revealed
    const animate = !!opts.animate && !reducedMotion();
    (fc.features || []).forEach(function (f) {
      const k = stageOf(f), lyr = k && makeLayer(f);
      if (!lyr) return;
      const g = group(k), key = featKey(f);
      if (!animate || el._shown.has(key)) { lyr.addTo(g); el._shown.add(key); }
      else (pending[k] = pending[k] || []).push([key, lyr]);
    });
    el._groups = Object.values(groups);
    const overlays = {};
    ["subject", "direct_adjoiner", "block_lot", "candidate", "boundaries", "unresolved"].forEach(function (k) {
      if (groups[k]) overlays[GROUP_LABEL[k]] = groups[k];
    });
    el._ctl = L.control.layers(null, overlays, { collapsed: global.innerWidth < 640 }).addTo(map);

    const bounds = function (keys) {
      const fg = L.featureGroup(keys.filter((k) => groups[k]).map((k) => groups[k]));
      return fg.getLayers().length && fg.getBounds().isValid() ? fg.getBounds() : null;
    };
    const parcelKeys = ["subject", "direct_adjoiner", "block_lot", "candidate"];

    if (!animate) {
      const prevParcels = (el._sig || "").split("|").filter((x) => x.startsWith("parcel:")).length;
      const nowParcels = sig.split("|").filter((x) => x.startsWith("parcel:")).length;
      if (first || opts.force || nowParcels !== prevParcels) {          // material change: refit to what we know
        const b = bounds(parcelKeys);
        if (b) map.fitBounds(b, { padding: [24, 24], maxZoom: 19 });
        else if (groups.search) map.setView(groups.search.getLayers()[0].getLatLng(), 17);
      }
      el._sig = sig;
      map.invalidateSize();
      return map;
    }

    // ---- animated reveal: a timeline of camera moves and layer additions, in research order ------------------
    let at = first ? 300 : 0;
    const later = (ms, fn) => { el._timers.push(setTimeout(fn, at + ms)); at += ms; };
    const reveal = (k, key, lyr, fade) => { lyr.addTo(groups[k]); el._shown.add(key); if (fade) fadeIn(lyr, fade); };
    STAGES.forEach(function (k) {
      const items = pending[k];
      if (!items || !items.length) return;
      if (k === "search") {
        const [key, lyr] = items[0];
        later(0, function () { reveal(k, key, lyr); map.flyTo(lyr.getLatLng(), 17.5, { duration: 1.6 }); });
        later(1800, function () {});
      } else if (k === "subject") {
        const b = L.featureGroup(items.map((x) => x[1])).getBounds();
        later(0, function () { map.flyToBounds(b, { padding: [60, 60], maxZoom: 19, duration: 1.2 }); });
        later(1300, function () {
          items.forEach(([key, lyr]) => {
            reveal(k, key, lyr, 700);
            lyr.eachLayer((l) => l.getElement && l.getElement() && l.getElement().classList.add("bm-subject-live"));
          });
        });
        later(900, function () {});
      } else if (k === "direct_adjoiner" || k === "candidate") {
        items.forEach(([key, lyr]) => later(320, function () { reveal(k, key, lyr, 400); }));
        later(250, function () { const b = bounds(["subject", "direct_adjoiner", "candidate"]); if (b) map.flyToBounds(b, { padding: [40, 40], maxZoom: 19, duration: 1 }); });
        later(900, function () {});
      } else if (k === "block_lot") {
        const step = Math.max(40, Math.min(110, 2200 / items.length));
        items.forEach(([key, lyr]) => later(step, function () { reveal(k, key, lyr, 300); }));
        later(200, function () { const b = bounds(parcelKeys); if (b) map.flyToBounds(b, { padding: [24, 24], maxZoom: 19, duration: 1 }); });
      } else {
        later(250, function () { items.forEach(([key, lyr]) => reveal(k, key, lyr)); });
      }
    });
    el._sig = sig;
    map.invalidateSize();
    return map;
  };
})(window);
