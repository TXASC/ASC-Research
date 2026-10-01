// Block research map — shared by the tower job page and the public ASC Research page.
// Renders mapdata.build() GeoJSON with Leaflet. All feature text is inserted as text nodes, never HTML.
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

  function node(tag, text, style) { const n = document.createElement(tag); if (text != null) n.textContent = text; if (style) n.style.cssText = style; return n; }

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

  global.renderBlockMap = function (elId, fc) {
    const el = document.getElementById(elId);
    if (!global.L || !el) return null;
    if (el._map) { el._map.remove(); }
    const map = L.map(el);
    el._map = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      { maxZoom: 20, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
    const groups = {};
    const group = (k) => (groups[k] = groups[k] || L.featureGroup().addTo(map));
    (fc.features || []).forEach(function (f) {
      const p = f.properties || {};
      if (p.kind === "parcel") {
        const st = PARCEL[p.role] || PARCEL.block_lot;
        L.geoJSON(f, { style: Object.assign({ fillColor: st.color }, st) }).bindPopup(popup(p)).addTo(group(p.role));
      } else if (p.kind === "boundary") {
        const st = LINE[p.type] || LINE.unknown_gap;
        L.geoJSON(f, { style: st }).bindPopup(popup(p)).addTo(group(st.group));
      }
    });
    const overlays = {};
    ["subject", "direct_adjoiner", "block_lot", "candidate", "boundaries", "unresolved"].forEach(function (k) {
      if (groups[k]) overlays[GROUP_LABEL[k]] = groups[k];
    });
    L.control.layers(null, overlays, { collapsed: false }).addTo(map);
    const note = L.control({ position: "bottomleft" });
    note.onAdd = function () {
      return node("div", (fc.properties && fc.properties.disclaimer) || "CAD geometry only — visual research aid, not survey geometry.",
        "background:rgba(255,255,255,.9);color:#333;padding:3px 7px;border-radius:4px;font:11px system-ui,sans-serif");
    };
    note.addTo(map);
    const fit = L.featureGroup(["subject", "direct_adjoiner", "block_lot", "candidate"].filter((k) => groups[k]).map((k) => groups[k]));
    if (fit.getLayers().length) map.fitBounds(fit.getBounds(), { padding: [24, 24], maxZoom: 19 });
    else map.setView([32.9, -96.9], 9);
    return map;
  };
})(window);
