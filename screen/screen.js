/* ASC Site Screen: a preliminary public-record screen for Texas land.
   Static page. Every lookup goes straight from the visitor's browser to a public service.
   Rules this file keeps: no suitability verdicts, no capacity claims, no client names,
   no equipment names, every derived number labeled approximate. */
"use strict";

/* ===== Settings ===== */
const CONFIG = {
  site: "https://txasc-c4b03fc922e0177f01298f114a33dce1.webflow.io",
  // The staging contact form reads ?type=alta|boundary|topo|construction|unsure and ?loc=
  quoteUrl: "https://txasc-c4b03fc922e0177f01298f114a33dce1.webflow.io/contact",
  // Proposal requests are written to an insert-only table. The anonymous role can INSERT and cannot SELECT,
  // so submitted names and emails are not readable from this page or by anyone holding this key.
  store: { url: "https://cjwiaxadnoboqvjvycwt.supabase.co", key: "sb_publishable_cX2htvqwO__Kg326qQQzug_ii7pPiVf", table: "snapshot_requests" },
  geocoder: "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer",
  parcels: "https://feature.geographic.texas.gov/arcgis/rest/services/Parcels/stratmap_land_parcels_48_most_recent/MapServer",
  cities: "https://feature.geographic.texas.gov/arcgis/rest/services/City_Boundaries/Texas_City_Boundaries/MapServer",
  hydro: "https://feature.geographic.texas.gov/arcgis/rest/services/Hydrography/Tx_Rivers_Streams_Waterbodies/MapServer",
  fema: "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28",
  nwi: "https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/0",
  sda: "https://SDMDataAccess.sc.egov.usda.gov/Tabular/post.rest",
  dem: "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer",
  lidarIndex: "https://index.nationalmap.gov/arcgis/rest/services/3DEPElevationIndex/MapServer/8",
  lines: "https://services1.arcgis.com/Hp6G80Pky0om7QvQ/arcgis/rest/services/Electric_Power_Transmission_Lines/FeatureServer/0",
  imagery: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export",
  vicinity: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/export",
  ercotPlanning: "https://www.ercot.com/gridinfo/planning",
  puctLargeLoad: "https://ftp.puc.texas.gov/public/puct-info/agency/rulesnlaws/subrules/electric/25.194/25.194.pdf",
  powerRadiusMi: 2
};

/* ===== Choices ===== */
const ICON = {
  ind:'<path d="M3 21V10l5 3V10l5 3V10l5 3V5h3v16z"/>',
  dc:'<rect x="4" y="3" width="16" height="6"/><rect x="4" y="11" width="16" height="6"/><path d="M7 6h2M7 14h2M4 21h16"/>',
  mf:'<rect x="3" y="7" width="8" height="14"/><rect x="13" y="3" width="8" height="18"/><path d="M6 11h2M6 15h2M16 7h2M16 11h2M16 15h2"/>',
  retail:'<path d="M3 9l2-5h14l2 5"/><path d="M4 9v11h16V9"/><path d="M3 9h18"/><path d="M9 20v-6h6v6"/>',
  sf:'<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  land:'<path d="M2 18c3-4 6-6 9-6s6 3 11 2"/><path d="M2 13c3-3 5-4 8-4s6 2 12 1"/><path d="M2 8c3-2 5-3 8-3s6 1 12 0"/>'
};
const TYPES = [["ind","Industrial or logistics"],["dc","Large campus, data center type"],["mf","Multifamily"],["retail","Retail or commercial"],["sf","Residential lot"],["land","Land or master-planned"]];
const STAGES = [["early","Early look"],["option","Under option or contract"],["design","Designing or permitting"],["sell","Selling or listing"],["finance","Financing"]];
let TYPE = null, STAGE = "early";

/* ===== Helpers ===== */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const qs = o => Object.entries(o).map(([k,v]) => k + "=" + encodeURIComponent(v)).join("&");
const R = 6378137, FT = 3.280839895, SQFT_AC = 43560;
const fmt = (n, d=0) => n == null || !isFinite(n) ? "–" : Number(n).toLocaleString("en-US", {maximumFractionDigits:d, minimumFractionDigits:d});
const sig2 = n => { if(!n) return 0; const p = Math.pow(10, Math.floor(Math.log10(Math.abs(n))) - 1); return Math.round(n/p)*p; };
const ac = sqft => sqft / SQFT_AC;
const acTxt = a => a >= 100 ? fmt(a,0) : a >= 10 ? fmt(a,1) : fmt(a,2);
const today = () => new Date().toLocaleDateString("en-US", {month:"short", day:"numeric", year:"numeric"});
function safeReplace(a,b,u){ try { history.replaceState(a,b,u); } catch(e){} }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const nul = v => (v == null || v === "Null" || v === "") ? null : v;

async function getJSON(url, opt={}, ms=15000){
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, {...opt, signal: ctl.signal});
    if(!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    if(j && j.error) throw new Error(j.error.message || "service error");
    return j;
  } finally { clearTimeout(t); }
}
function toast(msg){ const t = $("#toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("on"), 2600); }

/* ===== Plus codes ===== */
const OLC = "23456789CFGHJMPQRVWX";
function olcDecode(code){
  const c = code.toUpperCase().replace("+","").replace(/0+$/,"");
  let lat=-90, lng=-180, res=20, last=20;
  for(let i=0;i<Math.min(10,c.length);i+=2){ lat+=OLC.indexOf(c[i])*res; lng+=OLC.indexOf(c[i+1])*res; last=res; res/=20; }
  let ls=last, gs=last;
  for(let i=10;i<c.length;i++){ const d=OLC.indexOf(c[i]); ls/=5; gs/=4; lat+=Math.floor(d/4)*ls; lng+=(d%4)*gs; }
  return {lat:lat+ls/2, lng:lng+gs/2};
}
function olcEncodePrefix(lat,lng,len){
  lat=Math.min(89.9999,Math.max(-90,lat))+90; lng=((lng+180)%360+360)%360; let out="", res=20;
  for(let i=0;i<len;i+=2){ const a=Math.floor(lat/res), b=Math.floor(lng/res); out+=OLC[a]+OLC[b]; lat-=a*res; lng-=b*res; res/=20; }
  return out;
}
function olcRecover(short, ref){
  const s=short.toUpperCase(), pad=8-s.indexOf("+");
  const res=Math.pow(20,2-pad/2), half=res/2;
  const p=olcDecode(olcEncodePrefix(ref.lat,ref.lng,pad)+s);
  if(ref.lat+half<p.lat) p.lat-=res; else if(ref.lat-half>p.lat) p.lat+=res;
  if(ref.lng+half<p.lng) p.lng-=res; else if(ref.lng-half>p.lng) p.lng+=res;
  return p;
}

/* ===== Parse any location format ===== */
function dms(str){
  const re=/(\d{1,3})[°\s]+(\d{1,2})['′\s]+(\d{1,2}(?:\.\d+)?)["″]?\s*([NSEW])/gi; const out=[]; let m;
  while((m=re.exec(str))){ let v=+m[1]+m[2]/60+m[3]/3600; if(/[SW]/i.test(m[4])) v=-v; out.push({v,h:m[4].toUpperCase()}); }
  if(out.length===2){ const la=out.find(o=>/[NS]/.test(o.h)), lo=out.find(o=>/[EW]/.test(o.h)); if(la&&lo) return {lat:la.v,lng:lo.v}; }
  return null;
}
async function geocode(text){
  const j = await getJSON(CONFIG.geocoder + "/findAddressCandidates?" + qs({SingleLine:text, f:"json", maxLocations:1, countryCode:"USA", outFields:"Match_addr", searchExtent:"-106.7,25.8,-93.5,36.6"}));
  const c = j.candidates && j.candidates[0]; if(!c || c.score < 75) return null;
  return {lat:c.location.y, lng:c.location.x, label:c.attributes.Match_addr || c.address};
}
async function parseLocation(raw){
  const s = raw.trim(); if(!s) throw new Error("Enter an address, coordinates, a plus code or a map link.");
  let m = s.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || s.match(/[?&](?:q|ll|query|center)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i);
  if(m) return {lat:+m[1], lng:+m[2], kind:"Map pin"};
  if(/^https?:\/\//i.test(s)) throw new Error("That link doesn't carry coordinates. In Google Maps, drop a pin and copy the coordinates shown, or share the full link from the address bar.");
  const d = dms(s); if(d) return {...d, kind:"Coordinates"};
  m = s.match(/^\s*(-?\d{1,3}\.\d+)\s*[, ]\s*(-?\d{1,3}\.\d+)\s*$/);
  if(m){ let a=+m[1], b=+m[2]; if(Math.abs(a)>90) [a,b]=[b,a]; if(a>0 && b>0 && a<40) b=-b; return {lat:a, lng:b, kind:"Coordinates"}; }
  m = s.match(/\b([23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]{2,})\b/i);
  if(m){
    const code = m[1];
    if(code.indexOf("+") === 8) return {...olcDecode(code), kind:"Plus code"};
    const locality = s.replace(code,"").replace(/^[\s,]+|[\s,]+$/g,"");
    let ref = {lat:32.85, lng:-96.85};
    if(locality){ try{ const g = await geocode(locality + ", TX"); if(g) ref = g; }catch(e){} }
    return {...olcRecover(code, ref), kind:"Plus code"};
  }
  let g;
  try { g = await geocode(/\btx\b|texas/i.test(s) ? s : s + ", TX"); }
  catch(e){ throw new Error("The address search service didn't answer. Paste coordinates or a plus code instead, or try again in a minute."); }
  if(!g) throw new Error("We couldn't place that address. Add the city, or paste coordinates or a map link.");
  return {...g, kind:"Address"};
}
const inTexas = p => p.lat > 25.8 && p.lat < 36.6 && p.lng > -106.7 && p.lng < -93.5;

/* ===== Geometry (local feet around a center) ===== */
function proj(c){ const k = Math.cos(c.lat*Math.PI/180);
  return { f:([lng,lat]) => [(lng-c.lng)*Math.PI/180*R*k*FT, (lat-c.lat)*Math.PI/180*R*FT],
           i:([x,y]) => [c.lng + x/FT/R/k*180/Math.PI, c.lat + y/FT/R*180/Math.PI] }; }
function ringArea(r){ let a=0; for(let i=0;i<r.length;i++){ const [x1,y1]=r[i],[x2,y2]=r[(i+1)%r.length]; a+=x1*y2-x2*y1; } return a/2; }
function polyArea(rings){ return Math.abs(rings.reduce((s,r)=>s+ringArea(r),0)); }
function inRings(x,y,rings){ let inside=false;
  for(const r of rings) for(let i=0,j=r.length-1;i<r.length;j=i++){ const [xi,yi]=r[i],[xj,yj]=r[j];
    if((yi>y)!==(yj>y) && x<(xj-xi)*(y-yi)/(yj-yi)+xi) inside=!inside; }
  return inside; }
function bbox(rings){ let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity; for(const r of rings) for(const [x,y] of r){ if(x<x0)x0=x; if(y<y0)y0=y; if(x>x1)x1=x; if(y>y1)y1=y; } return [x0,y0,x1,y1]; }
function centroid(rings){ let A=0,cx=0,cy=0; for(const r of rings) for(let i=0;i<r.length;i++){ const [x1,y1]=r[i],[x2,y2]=r[(i+1)%r.length], f=x1*y2-x2*y1; A+=f; cx+=(x1+x2)*f; cy+=(y1+y2)*f; }
  if(Math.abs(A)<1e-9){ const b=bbox(rings); return [(b[0]+b[2])/2,(b[1]+b[3])/2]; } return [cx/(3*A), cy/(3*A)]; }
function interiorPoint(rings){ const c = centroid(rings); if(inRings(c[0],c[1],rings)) return c; const [x0,y0,x1,y1] = bbox(rings); let best = null, bd = Infinity;
  for(let i=1;i<24;i++) for(let j=1;j<24;j++){ const x = x0+(x1-x0)*i/24, y = y0+(y1-y0)*j/24; if(!inRings(x,y,rings)) continue; const d = Math.hypot(x-c[0], y-c[1]); if(d<bd){ bd=d; best=[x,y]; } }
  return best || c; }
function segDist(px,py,a,b){ const dx=b[0]-a[0], dy=b[1]-a[1], l=dx*dx+dy*dy||1; let t=((px-a[0])*dx+(py-a[1])*dy)/l; t=Math.max(0,Math.min(1,t)); return Math.hypot(px-a[0]-t*dx, py-a[1]-t*dy); }
function segsCross(a,b,c,d){ const o=(p,q,r)=>Math.sign((q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0])); return o(a,b,c)!==o(a,b,d) && o(c,d,a)!==o(c,d,b); }
function lineToPolyDist(path, rings){ // 0 when the line enters the polygon
  let best = Infinity;
  for(const p of path) if(inRings(p[0],p[1],rings)) return 0;
  for(let i=1;i<path.length;i++) for(const r of rings) for(let j=0;j<r.length;j++){
    const a=path[i-1], b=path[i], c=r[j], d=r[(j+1)%r.length];
    if(segsCross(a,b,c,d)) return 0;
    best=Math.min(best, segDist(a[0],a[1],c,d), segDist(b[0],b[1],c,d), segDist(c[0],c[1],a,b));
  }
  return best;
}
function simplifyRing(r, tol){ // Douglas-Peucker on an open ring
  if(r.length < 5) return r.slice();
  const keep = new Uint8Array(r.length); keep[0]=keep[r.length-1]=1;
  const st=[[0,r.length-1]];
  while(st.length){ const [a,b]=st.pop(); let md=0, mi=-1;
    for(let i=a+1;i<b;i++){ const d=segDist(r[i][0],r[i][1],r[a],r[b]); if(d>md){md=d;mi=i;} }
    if(md>tol && mi>0){ keep[mi]=1; st.push([a,mi],[mi,b]); } }
  return r.filter((_,i)=>keep[i]);
}
function sampleShare(rings, test, n=110){ // share of the polygon area where test(x,y) is true, by grid sampling
  const [x0,y0,x1,y1]=bbox(rings), dx=(x1-x0)/n, dy=(y1-y0)/n; let tot=0, hit=0;
  for(let i=0;i<n;i++) for(let j=0;j<n;j++){ const x=x0+(i+.5)*dx, y=y0+(j+.5)*dy; if(!inRings(x,y,rings)) continue; tot++; if(test(x,y)) hit++; }
  return tot ? hit/tot : 0;
}
const COMPASS = ["north","northeast","east","southeast","south","southwest","west","northwest"];
const compass = (dx,dy) => COMPASS[Math.round(((Math.atan2(dx,dy)*180/Math.PI)+360)%360/45)%8];

/* ===== Small TIFF reader for the 3DEP float elevation export ===== */
function parseTiff(buf){
  const dv = new DataView(buf), le = dv.getUint16(0) === 0x4949, off = dv.getUint32(4, le), n = dv.getUint16(off, le), T = {};
  const size = {1:1,2:1,3:2,4:4,11:4,12:8,16:8};
  for(let i=0;i<n;i++){
    const e = off+2+i*12, tag = dv.getUint16(e,le), type = dv.getUint16(e+2,le), cnt = dv.getUint32(e+4,le), sz = (size[type]||4)*cnt;
    const base = sz <= 4 ? e+8 : dv.getUint32(e+8,le), vals = [];
    for(let k=0;k<Math.min(cnt,4096);k++){ const p = base + k*(size[type]||4);
      vals.push(type===3?dv.getUint16(p,le):type===4||type===16?dv.getUint32(p,le):type===11?dv.getFloat32(p,le):type===12?dv.getFloat64(p,le):dv.getUint8(p)); }
    T[tag] = vals;
  }
  const W = T[256][0], H = T[257][0];
  if((T[259]||[1])[0] !== 1) throw new Error("compressed elevation tile");
  if((T[258]||[32])[0] !== 32) throw new Error("unexpected elevation format");
  const out = new Float32Array(W*H);
  if(T[322]){ const tw=T[322][0], th=T[323][0], offs=T[324], across=Math.ceil(W/tw);
    offs.forEach((o,k)=>{ const tx=(k%across)*tw, ty=Math.floor(k/across)*th;
      for(let y=0;y<th;y++){ const Y=ty+y; if(Y>=H) break; for(let x=0;x<tw;x++){ const X=tx+x; if(X<W) out[Y*W+X]=dv.getFloat32(o+(y*tw+x)*4,le); } } }); }
  else { const offs=T[273], rps=(T[278]||[H])[0];
    offs.forEach((o,k)=>{ for(let y=0;y<rps;y++){ const Y=k*rps+y; if(Y>=H) break; for(let x=0;x<W;x++) out[Y*W+x]=dv.getFloat32(o+(y*W+x)*4,le); } }); }
  return {W, H, data:out};
}

/* ===== Live lookups (each fails closed on its own) ===== */
function fmtAddr(t){ const m = String(t).replace(/(\d{5})\d{4}\s*$/,"$1").split(/\s*,\s*/).filter(Boolean); if(!m.length) return null;
  return m.map(x=>/^(TX|TEXAS)(\s+\d{5})?$/i.test(x) ? x.toUpperCase().replace("TEXAS","TX") : titleCase(x)).join(", "); }
function normParcel(r){
  const a = {}; for(const [k,v] of Object.entries(r.attributes||{})) a[k.toUpperCase()] = (v === "Null" || v === "") ? null : v;
  const rings = (r.geometry && r.geometry.rings) || [];
  return { oid:a.OBJECTID, propId:a.PROP_ID, county:a.COUNTY, legal:a.LEGAL_DESC, legalAcres:+a.LEGAL_AREA || null,
    situs:a.SITUS_ADDR ? fmtAddr(a.SITUS_ADDR) : null, source:a.SOURCE, taxYear:a.TAX_YEAR, ringsLL:rings };
}
async function fetchParcelAt(p){
  const d = 0.003, ext = [p.lng-d, p.lat-d, p.lng+d, p.lat+d].join(",");
  const j = await getJSON(CONFIG.parcels + "/identify?" + qs({geometry:p.lng+","+p.lat, geometryType:"esriGeometryPoint", sr:4326, layers:"all:0", tolerance:0,
    mapExtent:ext, imageDisplay:"600,600,96", returnGeometry:true, maxAllowableOffset:0.000002, f:"json"}));
  const r = (j.results||[])[0]; return r ? normParcel(r) : null;
}
async function fetchNeighbors(env, exceptOid){
  const j = await getJSON(CONFIG.parcels + "/identify?" + qs({geometry:env.join(","), geometryType:"esriGeometryEnvelope", sr:4326, layers:"all:0", tolerance:0,
    mapExtent:env.join(","), imageDisplay:"800,800,96", returnGeometry:true, maxAllowableOffset:0.000004, f:"json"}), {}, 20000);
  const seen = new Set(); return (j.results||[]).map(normParcel).filter(p => { if(p.oid === exceptOid || !p.ringsLL.length || seen.has(p.oid)) return false; seen.add(p.oid); return true; });
}
async function fetchFlood(envLL, ptLL){
  const base = CONFIG.fema + "/query?";
  const pt = await getJSON(base + qs({geometry:ptLL.join(","), geometryType:"esriGeometryPoint", inSR:4326, spatialRel:"esriSpatialRelIntersects", outFields:"FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE,DFIRM_ID", returnGeometry:false, f:"json"}));
  const g = await getJSON(base + qs({geometry:envLL.join(","), geometryType:"esriGeometryEnvelope", inSR:4326, spatialRel:"esriSpatialRelIntersects", outFields:"FLD_ZONE,ZONE_SUBTY,SFHA_TF",
    returnGeometry:true, outSR:4326, geometryPrecision:6, maxAllowableOffset:0.000005, f:"json"}), {}, 25000);
  const feats = (g.features||[]).filter(f=>f.geometry && f.geometry.rings);
  const a = pt.features && pt.features[0] && pt.features[0].attributes;
  return { pointZone: a ? zoneName(a) : null, panel: a && a.DFIRM_ID,
    polys: feats.map(f => ({zone:zoneName(f.attributes), sfha:f.attributes.SFHA_TF==="T", floodway:/FLOODWAY/i.test(f.attributes.ZONE_SUBTY||""), ringsLL:f.geometry.rings})) };
}
function zoneName(a){ if(!a) return null; if(/FLOODWAY/i.test(a.ZONE_SUBTY||"")) return "AE floodway"; if(/0\.2/.test(a.ZONE_SUBTY||"")) return "X (0.2% annual chance)"; if(a.FLD_ZONE==="X") return "X (minimal)"; return a.FLD_ZONE; }
async function fetchWetlands(envLL){
  const j = await getJSON(CONFIG.nwi + "/query?" + qs({geometry:envLL.join(","), geometryType:"esriGeometryEnvelope", inSR:4326, spatialRel:"esriSpatialRelIntersects", outFields:"ATTRIBUTE,WETLAND_TYPE",
    returnGeometry:true, outSR:4326, geometryPrecision:6, maxAllowableOffset:0.000005, resultRecordCount:400, f:"json"}), {}, 20000);
  return (j.features||[]).filter(f=>f.geometry&&f.geometry.rings).map(f=>({code:f.attributes.ATTRIBUTE, type:f.attributes.WETLAND_TYPE, ringsLL:f.geometry.rings}));
}
async function fetchWater(envLL){
  const j = await getJSON(CONFIG.hydro + "/identify?" + qs({geometry:envLL.join(","), geometryType:"esriGeometryEnvelope", sr:4326, layers:"all", tolerance:0, mapExtent:envLL.join(","),
    imageDisplay:"800,800,96", returnGeometry:true, maxAllowableOffset:0.000005, f:"json"}), {}, 20000);
  return (j.results||[]).map(r=>({layer:r.layerId, name:nul(r.attributes.GNIS_Name), paths:r.geometry&&r.geometry.paths, ringsLL:r.geometry&&r.geometry.rings})).filter(w=>w.paths||w.ringsLL);
}
async function fetchSoils(ringsLL){
  const polys = ringsLL.map(r => { let s = r.length > 160 ? r.filter((_,i)=>i%Math.ceil(r.length/160)===0) : r.slice(); if(s[0][0]!==s[s.length-1][0]||s[0][1]!==s[s.length-1][1]) s.push(s[0]); return "((" + s.map(p=>p[0].toFixed(6)+" "+p[1].toFixed(6)).join(",") + "))"; });
  const wkt = polys.length === 1 ? "POLYGON" + polys[0] : "MULTIPOLYGON(" + polys.join(",") + ")";
  const q = `~DeclareGeometry(@aoi)~
select @aoi = geometry::STGeomFromText('${wkt}', 4326).MakeValid()
select P.mukey, mu.musym, mu.muname, sum(P.mupolygongeo.STIntersection(@aoi).STArea()) as a,
 (select top 1 hydgrp from component c where c.mukey=P.mukey and c.majcompflag='Yes' and hydgrp is not null order by comppct_r desc) as hyd,
 (select top 1 drainagecl from component c where c.mukey=P.mukey and c.majcompflag='Yes' and drainagecl is not null order by comppct_r desc) as drn
from mupolygon P join mapunit mu on mu.mukey=P.mukey where P.mupolygongeo.STIntersects(@aoi)=1 group by P.mukey, mu.musym, mu.muname`;
  const j = await getJSON(CONFIG.sda, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({format:"JSON+COLUMNNAME", query:q})}, 25000);
  const rows = (j.Table||[]).slice(1); const tot = rows.reduce((s,r)=>s+(+r[3]||0),0) || 1;
  return rows.map(r=>({sym:r[1], name:r[2], share:(+r[3]||0)/tot, hyd:r[4], drain:r[5]})).sort((a,b)=>b.share-a.share);
}
async function fetchTerrain(site){
  const [x0,y0,x1,y1] = site.frame, w = x1-x0, h = y1-y0, big = Math.max(w,h);
  const nx = Math.max(24, Math.min(128, Math.round(128*w/big))), ny = Math.max(24, Math.min(128, Math.round(128*h/big)));
  const a = site.P.i([x0,y0]), b = site.P.i([x1,y1]);
  const url = CONFIG.dem + "/exportImage?" + qs({bbox:[a[0],a[1],b[0],b[1]].join(","), bboxSR:4326, imageSR:4326, size:nx+","+ny, format:"tiff", pixelType:"F32", noData:-9999,
    interpolation:"RSP_BilinearInterpolation", compression:"None", f:"image"});
  const ctl = new AbortController(); const t = setTimeout(()=>ctl.abort(), 25000);
  let buf; try { const r = await fetch(url, {signal:ctl.signal}); if(!r.ok) throw new Error("HTTP "+r.status); buf = await r.arrayBuffer(); } finally { clearTimeout(t); }
  const tif = parseTiff(buf), z = new Float32Array(tif.W*tif.H);
  let valid = 0; for(let i=0;i<z.length;i++){ const v = tif.data[i]; z[i] = (v < -1000 || v > 9000 || v === 0) ? NaN : v*FT; if(!isNaN(z[i])) valid++; }
  if(valid < z.length*0.5) throw new Error("no elevation coverage here");
  let lidar = null;
  try {
    const c = site.center, j = await getJSON(CONFIG.lidarIndex + "/query?" + qs({geometry:c.lng+","+c.lat, geometryType:"esriGeometryPoint", inSR:4326, spatialRel:"esriSpatialRelIntersects",
      outFields:"project,collect_start,collect_end,dem_gsd_meters,ql", returnGeometry:false, orderByFields:"collect_end DESC", f:"json"}), {}, 12000);
    const f = j.features && j.features[0] && j.features[0].attributes;
    if(f) lidar = {project:f.project, start:f.collect_start, end:f.collect_end, gsd:f.dem_gsd_meters, ql:f.ql};
  } catch(e) {}
  return {nx:tif.W, ny:tif.H, x0, ytop:y1, dx:w/tif.W, dy:h/tif.H, z, lidar};
}
async function fetchLines(c, mi){
  const d = mi*5280/FT/R*180/Math.PI, k = Math.cos(c.lat*Math.PI/180);
  const env = [c.lng-d/k, c.lat-d, c.lng+d/k, c.lat+d];
  const j = await getJSON(CONFIG.lines + "/query?" + qs({geometry:env.join(","), geometryType:"esriGeometryEnvelope", inSR:4326, spatialRel:"esriSpatialRelIntersects", outFields:"VOLTAGE,VOLT_CLASS,STATUS",
    returnGeometry:true, outSR:4326, geometryPrecision:6, maxAllowableOffset:0.00002, f:"json"}), {}, 20000);
  return (j.features||[]).filter(f=>f.geometry&&f.geometry.paths).map(f=>({kv:f.attributes.VOLTAGE>0?f.attributes.VOLTAGE:null, cls:f.attributes.VOLT_CLASS, status:f.attributes.STATUS, pathsLL:f.geometry.paths}));
}
async function fetchCity(p){
  const d = 0.01, ext=[p.lng-d,p.lat-d,p.lng+d,p.lat+d].join(",");
  const j = await getJSON(CONFIG.cities + "/identify?" + qs({geometry:p.lng+","+p.lat, geometryType:"esriGeometryPoint", sr:4326, layers:"all", tolerance:0, mapExtent:ext, imageDisplay:"400,400,96", returnGeometry:false, f:"json"}));
  const r = (j.results||[])[0]; return r ? {name:r.attributes.city_name, edited:r.attributes.last_edited_date} : {name:null};
}

/* ===== Record references from the appraisal legal description ===== */
function parseLegal(txt){
  const t = String(txt||"").toUpperCase().replace(/\s+/g," ").trim(), r = {};
  let m;
  if((m = t.match(/\b(?:LOT|LT)S?\s+([0-9A-Z&,\- ]{1,20}?)(?=\s+(?:BLK|BLOCK|&|$)|\s+[A-Z]{3,})/))) r.lot = m[1].trim();
  if((m = t.match(/\b(?:BLK|BLOCK)\s+([0-9A-Z\/\-]{1,8})/))) r.block = m[1];
  if((m = t.match(/\b(?:ABST?|ABSTRACT|A)[\s\-#]*(\d{1,5})\b/))) r.abstract = m[1];
  if((m = t.match(/\b(?:INT|INST|INSTR?|DOC|CC#?|CCF)[\s#:]*([0-9]{6,14}|[A-Z]?\d{3}-\d{5,7})/))) r.instrument = m[1];
  if((m = t.match(/\bVOL(?:UME)?\s*(\d{1,6})[\s,]*(?:PG|PAGE)S?\s*(\d{1,5})/))) r.volPage = "Vol. " + m[1] + ", Pg. " + m[2];
  if((m = t.match(/\b(?:CAB(?:INET)?|SLIDE|PLAT)\s+([A-Z0-9\-]+(?:\s*(?:SLIDE|PG)\s*[A-Z0-9\-]+)?)/))) r.plat = m[1];
  r.platted = !!(r.lot && r.block) || /\bADDN|ADDITION|SUBDIVISION|ESTATES|PHASE\b/.test(t);
  if((m = t.match(/^([A-Z0-9 '&\.\-]+?)\s+(?:BLK|BLOCK|LOT|LT|INST|PH|PHASE)\b/))) r.addition = m[1].replace(/\s+(ADDN|ADD)$/,"").trim();
  return r;
}

/* ===== Sample sites (illustrative, not real parcels) ===== */
function wave(x,y,base,ax,ay,amp){ return base + ax*x + ay*y + amp*Math.sin(x/900)*Math.cos(y/1300); }
const SAMPLES = [
  { id:"ind", label:"Industrial tract", area:"Southern Dallas County", type:"ind", county:"DALLAS", legal:"ABST 902 PG 120 TR 3 ACS 61.5", src:"Sample",
    ring:[[-760,-640],[760,-610],[740,590],[-300,620],[-330,700],[-790,660]],
    flood:[{zone:"AE", sfha:true, rings:[[[-1300,-1100],[-430,-1100],[-260,-300],[-420,300],[-620,1200],[-1300,1200]]]},
           {zone:"AE floodway", sfha:true, floodway:true, rings:[[[-1300,-1100],[-690,-1100],[-540,-300],[-700,300],[-880,1200],[-1300,1200]]]}],
    wet:[{code:"PFO1A", type:"Freshwater Forested/Shrub Wetland", rings:[[[-700,-300],[-520,-260],[-480,-40],[-640,40],[-760,-120]]]}],
    streams:[[[-760,-1100],[-620,-500],[-600,0],[-720,600],[-800,1200]]],
    terrain:(x,y)=>wave(x,y,452,0.0042,-0.0018,3.5) + Math.max(0,( -x-300))*0.004,
    soils:[{sym:"Hn",name:"Houston Black clay, 1 to 3 percent slopes",share:.58,hyd:"D",drain:"Moderately well drained"},{sym:"Fr",name:"Frio silty clay, occasionally flooded",share:.27,hyd:"C",drain:"Well drained"},{sym:"Ft",name:"Ferris clay, 5 to 12 percent slopes",share:.15,hyd:"D",drain:"Well drained"}],
    lines:[{kv:345, pathsFt:[[[2600,-5200],[2350,-1200],[2200,2400],[2050,6200]]]}], city:"Outside mapped city limits" },
  { id:"dc", label:"Large campus land", area:"North Texas, outside the core", type:"dc", county:"ELLIS", legal:"ABST 311 AND ABST 1042 TRS 1 & 4 ACS 312.4", src:"Sample",
    ring:[[-1900,-1500],[1750,-1560],[1820,620],[1320,1480],[-600,1560],[-1820,1180]],
    flood:[{zone:"A", sfha:true, rings:[[[300,-2400],[900,-2400],[1100,-600],[950,400],[1050,2400],[450,2400],[500,400],[620,-600]]]}],
    wet:[{code:"PUBHh", type:"Freshwater Pond", rings:[[[-1200,600],[-1000,560],[-950,760],[-1140,820]]]},
         {code:"R4SBC", type:"Riverine", rings:[[[560,-1600],[640,-1600],[760,0],[700,1500],[620,1500],[680,0]]]}],
    streams:[[[600,-2400],[700,-800],[720,200],[660,1400],[700,2400]]],
    terrain:(x,y)=>wave(x,y,512,-0.0035,0.0052,6) - Math.exp(-Math.pow((x-680)/260,2))*9,
    soils:[{sym:"HoB",name:"Houston Black clay, 1 to 3 percent slopes",share:.46,hyd:"D",drain:"Moderately well drained"},{sym:"AuC",name:"Austin silty clay, 3 to 5 percent slopes",share:.31,hyd:"C",drain:"Well drained"},{sym:"Tr",name:"Trinity clay, frequently flooded",share:.14,hyd:"D",drain:"Somewhat poorly drained"},{sym:"EdD",name:"Eddy gravelly clay loam, 3 to 8 percent slopes",share:.09,hyd:"D",drain:"Well drained"}],
    lines:[{kv:345, pathsFt:[[[-9000,2900],[-2000,2650],[3000,2500],[9000,2300]]]},{kv:138, pathsFt:[[[-3600,-9000],[-3300,-2600],[-3100,3000],[-2900,9000]]]}], city:"Outside mapped city limits" },
  { id:"retail", label:"Retail pad", area:"Collin County", type:"retail", county:"COLLIN", legal:"COMMERCIAL ADDN BLK A LOT 3 INT 2021-0098214", src:"Sample",
    ring:[[-280,-240],[280,-240],[280,242],[-280,242]],
    flood:[], wet:[], streams:[],
    terrain:(x,y)=>wave(x,y,640,0.006,0.0025,0.8),
    soils:[{sym:"AuB",name:"Austin-Urban land complex, 1 to 3 percent slopes",share:.82,hyd:"C",drain:"Well drained"},{sym:"HoB",name:"Houston Black clay, 1 to 3 percent slopes",share:.18,hyd:"D",drain:"Moderately well drained"}],
    lines:[{kv:138, pathsFt:[[[-9000,-5200],[-1000,-4800],[9000,-4500]]]}], city:"Inside mapped city limits (sample)" }
];

/* ===== State ===== */
let current = null, VIEW = "sheet", SKETCH = null, LIST = loadList();
const LAYERS = [["aerial","Aerial","#8a9aa5"],["contours","Lidar contours","#9a6b3c"],["flood","FEMA flood","#3a74b0"],["wet","Wetlands (NWI)","#2f8a6a"],["water","Streams","#3a9bd0"],["adj","Neighbors","#7c8790"],["power","Transmission","#c27a10"]];
const LAYER_ON = {aerial:false, contours:true, flood:true, wet:true, water:true, adj:true, power:true};

/* ===== Build a site object ===== */
function frameFor(rings){ const [x0,y0,x1,y1] = bbox(rings), w = x1-x0, h = y1-y0, s = Math.max(w,h), pad = Math.max(s*0.28, 180);
  const cx=(x0+x1)/2, cy=(y0+y1)/2, aspect = DW/DH; // drawing area aspect
  let fw = Math.max(w+2*pad, (h+2*pad)*aspect), fh = fw/aspect; return [cx-fw/2, cy-fh/2, cx+fw/2, cy+fh/2]; }
function newSite(o){
  const s = {id: Date.now().toString(36), layers:{}, neighbors:[], added:[], ...o};
  s.frame = frameFor(s.rings); s.areaSqft = polyArea(s.rings); s.acres = ac(s.areaSqft);
  s.refs = parseLegal(s.legal); return s;
}
function siteFromSample(sm){
  const center = {lat:32.6 + (sm.id==="dc"?-.2:sm.id==="retail"?.5:0), lng:-96.8};
  const P = proj(center), rings = [sm.ring];
  const s = newSite({sample:true, sampleId:sm.id, input:"sample:"+sm.id, title:sm.label, area:sm.area, center, P, rings, county:sm.county, legal:sm.legal, propId:null, situs:null, source:"Illustrative sample", taxYear:null, kind:"Sample"});
  const L = s.layers;
  const floodPolys = sm.flood.map(f=>({...f}));
  L.flood = {status:"ok", polys:floodPolys, pointZone:"X (minimal)", ...floodStats(s, floodPolys)};
  L.wet = {status:"ok", polys:sm.wet, ...wetStats(s, sm.wet)};
  L.water = {status:"ok", items:sm.streams.map(p=>({paths:[p], name:null})), crossing:sm.streams.some(p=>lineToPolyDist(p, s.rings)===0)};
  L.soils = {status:"ok", units:sm.soils};
  const g = synthGrid(s, sm.terrain); L.terrain = {status:"ok", grid:g, ...terrainStats(s, g)};
  const lines = sm.lines.map(l=>({kv:l.kv, paths:l.pathsFt})); L.power = {status:"ok", ...powerStats(s, lines)};
  L.juris = {status:"ok", city:null, text:sm.city};
  L.adj = {status:"na", note:"Neighbors are drawn on live sites."};
  L.aerial = {status:"na"};
  return s;
}
function synthGrid(s, fn){ const [x0,y0,x1,y1]=s.frame, nx=96, ny=Math.round(96*(y1-y0)/(x1-x0)), dx=(x1-x0)/nx, dy=(y1-y0)/ny, z=new Float32Array(nx*ny);
  for(let j=0;j<ny;j++) for(let i=0;i<nx;i++) z[j*nx+i]=fn(x0+(i+.5)*dx, y1-(j+.5)*dy);
  return {nx, ny, x0, ytop:y1, dx, dy, z, lidar:{project:"Illustrative surface", start:null, end:null, gsd:null}}; }

/* ===== Derived figures (all approximate) ===== */
function floodStats(s, polys){
  const sf = polys.filter(p=>p.sfha), fw = polys.filter(p=>p.floodway);
  const inSF = sampleShare(s.rings, (x,y)=>sf.some(p=>inRings(x,y,p.rings)));
  const inFW = fw.length ? sampleShare(s.rings, (x,y)=>fw.some(p=>inRings(x,y,p.rings))) : 0;
  const zones = [...new Set(polys.filter(p=>p.rings.some(r=>r.some(([x,y])=>inRings(x,y,s.rings))) || s.rings[0].some(([x,y])=>inRings(x,y,p.rings))).map(p=>p.zone))];
  return {shareSFHA:inSF, shareFloodway:inFW, zonesOnTract:zones};
}
function wetStats(s, polys){
  const share = polys.length ? sampleShare(s.rings, (x,y)=>polys.some(p=>inRings(x,y,p.rings))) : 0;
  const types = [...new Set(polys.filter(p=>p.rings.some(r=>r.some(([x,y])=>inRings(x,y,s.rings))) || s.rings[0].some(([x,y])=>inRings(x,y,p.rings))).map(p=>p.type))];
  return {share, typesOnTract:types, nearby:polys.length};
}
function gridAt(g, x, y){ const i = Math.floor((x-g.x0)/g.dx), j = Math.floor((g.ytop-y)/g.dy); if(i<0||j<0||i>=g.nx||j>=g.ny) return NaN; return g.z[j*g.nx+i]; }
function terrainStats(s, g){
  const pts = [], slopes = [];
  for(let j=1;j<g.ny-1;j++) for(let i=1;i<g.nx-1;i++){
    const x = g.x0+(i+.5)*g.dx, y = g.ytop-(j+.5)*g.dy; if(!inRings(x,y,s.rings)) continue;
    const z = g.z[j*g.nx+i]; if(isNaN(z)) continue;
    const zx = (g.z[j*g.nx+i+1]-g.z[j*g.nx+i-1])/(2*g.dx), zy = (g.z[(j-1)*g.nx+i]-g.z[(j+1)*g.nx+i])/(2*g.dy);
    pts.push([x,y,z]); if(isFinite(zx)&&isFinite(zy)) slopes.push(Math.hypot(zx,zy)*100);
  }
  if(pts.length < 6){ // small lot: fall back to every cell touching the frame center
    for(let j=0;j<g.ny;j++) for(let i=0;i<g.nx;i++){ const x=g.x0+(i+.5)*g.dx, y=g.ytop-(j+.5)*g.dy, z=g.z[j*g.nx+i]; if(!isNaN(z) && Math.hypot(x,y) < Math.sqrt(s.areaSqft)) pts.push([x,y,z]); }
  }
  if(!pts.length) return {ok:false};
  let mn=Infinity, mx=-Infinity, lo=null; for(const p of pts){ if(p[2]<mn){mn=p[2]; lo=p;} if(p[2]>mx) mx=p[2]; }
  // least-squares plane z = a x + b y + c
  let n=pts.length, sx=0,sy=0,sz=0,sxx=0,syy=0,sxy=0,sxz=0,syz=0;
  for(const [x,y,z] of pts){ sx+=x; sy+=y; sz+=z; sxx+=x*x; syy+=y*y; sxy+=x*y; sxz+=x*z; syz+=y*z; }
  const mxv=sx/n, myv=sy/n, mzv=sz/n, Cxx=sxx/n-mxv*mxv, Cyy=syy/n-myv*myv, Cxy=sxy/n-mxv*myv, Cxz=sxz/n-mxv*mzv, Cyz=syz/n-myv*mzv, D=Cxx*Cyy-Cxy*Cxy;
  const a = D ? (Cxz*Cyy-Cyz*Cxy)/D : 0, b = D ? (Cyz*Cxx-Cxz*Cxy)/D : 0, c = mzv - a*mxv - b*myv;
  let cut=0; for(const [x,y,z] of pts){ const r = z-(a*x+b*y+c); if(r>0) cut+=r; }
  const cutCY = cut * g.dx*g.dy / 27;
  slopes.sort((p,q)=>p-q);
  const mean = slopes.length ? slopes.reduce((t,v)=>t+v,0)/slopes.length : null;
  const over = t => slopes.length ? slopes.filter(v=>v>t).length/slopes.length : null;
  const [cx,cy] = centroid(s.rings);
  return { ok:true, min:mn, max:mx, relief:mx-mn, meanSlope:mean, p90:slopes.length?slopes[Math.floor(slopes.length*.9)]:null, over5:over(5), over10:over(10),
    planeSlope:Math.hypot(a,b)*100, fallDir:(Math.hypot(a,b)>0.0015 ? compass(-a,-b) : null), lowSide: lo ? compass(lo[0]-cx, lo[1]-cy) : null, balanceCY:cutCY, cellFt:Math.round((g.dx+g.dy)/2) };
}
function powerStats(s, lines){
  let best = null;
  for(const l of lines) for(const p of l.paths){ const d = lineToPolyDist(p, s.rings); if(!best || d < best.d) best = {d, kv:l.kv}; }
  const within = lines.filter(l=>l.paths.some(p=>lineToPolyDist(p, s.rings) <= (s.powerMi||CONFIG.powerRadiusMi)*5280));
  const kvs = [...new Set(within.map(l=>l.kv).filter(Boolean))].sort((a,b)=>b-a);
  return {lines, nearest:best && best.d <= (s.powerMi||CONFIG.powerRadiusMi)*5280 ? best : null, count:within.length, kvs};
}

/* ===== Run a screen ===== */
const STEPS = [["parcel","Appraisal parcel"],["flood","FEMA floodplain"],["wet","Wetlands (NWI)"],["water","Mapped streams"],["soils","Soils (SSURGO)"],["terrain","Terrain (USGS lidar)"],["power","Transmission lines"],["juris","Jurisdiction"]];
async function runLive(raw, opts={}){
  const p = await parseLocation(raw);
  if(!inTexas(p)) throw new Error("That point is outside Texas. This screen covers Texas parcels.");
  const center = {lat:p.lat, lng:p.lng}, P = proj(center);
  setStatus("parcel","wait");
  let parcel;
  try { parcel = await fetchParcelAt(center); }
  catch(e){ throw new Error("The statewide parcel service didn't answer, so nothing was drawn. Try again in a minute, use Sketch a tract, or call (469) 317-0250."); }
  if(!parcel || !parcel.ringsLL.length) throw Object.assign(new Error("No appraisal parcel was found at that point. It may be a road or water, or the county's parcels may not be in the statewide set. You can sketch the tract instead."), {sketchAt:center});
  const rings = parcel.ringsLL.map(r=>r.map(P.f));
  const c2 = P.i(centroid(rings)); const center2 = {lat:c2[1], lng:c2[0]}, P2 = proj(center2);
  const s = newSite({sample:false, input:raw, kind:p.kind, label:p.label, center:center2, P:P2, rings:parcel.ringsLL.map(r=>r.map(P2.f)), county:parcel.county, legal:parcel.legal, propId:parcel.propId,
    situs:parcel.situs, source:parcel.source, taxYear:parcel.taxYear, legalAcres:parcel.legalAcres, oid:parcel.oid, parcels:[parcel]});
  s.title = parcel.situs || (p.label && p.kind==="Address" ? p.label : (s.refs.addition ? s.refs.addition : "Parcel " + (parcel.propId||"")));
  s.area = (parcel.county ? titleCase(parcel.county) + " County" : "Texas");
  return s;
}
function siteFromSketch(ringFt, base){
  const P = base.P, ringLL = ringFt.map(P.i), c2 = P.i(centroid([ringFt])), center = {lat:c2[1], lng:c2[0]}, P2 = proj(center);
  const s = newSite({sample:false, sketch:true, input:"sketch", kind:"Sketched outline", center, P:P2, rings:[ringLL.map(P2.f)], county:base.county, legal:null, propId:null, situs:null, source:"Outline sketched on this page", parcels:[]});
  s.title = "Sketched tract"; s.area = base.area || "Texas"; s.sketchLL = ringLL; return s;
}
const yrs = (a,b) => { const y1 = a ? new Date(a).getUTCFullYear() : null, y2 = new Date(b).getUTCFullYear(); return y1 && y1 !== y2 ? y1 + "–" + y2 : String(y2); };
const titleCase = t => String(t||"").toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());

async function screenLayers(s, only){
  const L = s.layers, ringsLL = s.rings.map(r=>r.map(s.P.i));
  const [x0,y0,x1,y1] = s.frame, a = s.P.i([x0,y0]), b = s.P.i([x1,y1]), env = [a[0],a[1],b[0],b[1]];
  const c = s.center, toFt = rr => rr.map(r=>r.map(s.P.f));
  const job = async (key, fn) => { if(only && !only.includes(key)) return; setStatus(key,"wait"); L[key] = {status:"wait"}; renderReadout(s);
    try { L[key] = {status:"ok", ...(await fn())}; } catch(e){ L[key] = {status:"fail", err:String(e.message||e)}; }
    if(s !== current) return; setStatus(key, L[key].status); renderReadout(s); drawSheet(s); renderInsights(s); };
  const tasks = [
    job("flood", async()=>{ const f = await fetchFlood(env, [c.lng,c.lat]); const polys = f.polys.map(p=>({...p, rings:toFt(p.ringsLL)})); return {polys, pointZone:f.pointZone, panel:f.panel, ...floodStats(s, polys)}; }),
    job("wet", async()=>{ const w = await fetchWetlands(env); const polys = w.map(p=>({...p, rings:toFt(p.ringsLL)})); return {polys, ...wetStats(s, polys)}; }),
    job("water", async()=>{ const w = await fetchWater(env); const items = w.map(i=>({name:i.name, paths:i.paths?toFt(i.paths):null, rings:i.ringsLL?toFt(i.ringsLL):null}));
      const crossing = items.some(i=>(i.paths||[]).some(p=>lineToPolyDist(p, s.rings)===0) || (i.rings||[]).some(r=>r.some(([x,y])=>inRings(x,y,s.rings))));
      return {items, crossing, names:[...new Set(items.map(i=>i.name).filter(Boolean))]}; }),
    job("soils", async()=>({units: await fetchSoils(ringsLL)})),
    job("terrain", async()=>{ const g = await fetchTerrain(s); const st = terrainStats(s, g); if(!st.ok) throw new Error("no elevation cells on the tract"); return {grid:g, ...st}; }),
    job("power", async()=>{ s.powerMi = (TYPE==="dc" || s.acres >= 40) ? 5 : CONFIG.powerRadiusMi; const lines = (await fetchLines(c, s.powerMi)).map(l=>({kv:l.kv, status:l.status, paths:toFt(l.pathsLL)})); return powerStats(s, lines); }),
    job("juris", async()=>fetchCity(c)),
    job("adj", async()=>{ if(s.sketch) return {items:[]}; const pad = 0.15, w = b[0]-a[0], h = b[1]-a[1];
      const nb = await fetchNeighbors([a[0]+w*pad, a[1]+h*pad, b[0]-w*pad, b[1]-h*pad], s.oid);
      const ids = new Set(s.parcels.map(p=>p.oid));
      return {items: nb.filter(n=>!ids.has(n.oid)).slice(0,220).map(n=>({...n, rings:toFt(n.ringsLL)}))}; })
  ];
  await Promise.all(tasks);
}

/* ===== Status / readout ===== */
function stateOf(s, key){ if(key==="parcel") return "ok"; const l = s.layers[key]; return !l ? "wait" : l.status==="ok" ? "ok" : l.status==="wait" ? "wait" : l.status==="na" ? "off" : "na"; }
function readoutRow(k, label, value, sub, st){ return `<li><span class="st ${st}" aria-hidden="true"></span><div><div class="ro-k">${esc(label)}</div><div class="ro-v">${value}</div>${sub?`<div class="ro-s">${sub}</div>`:""}</div></li>`; }
function failText(l){ return l && l.status==="fail" ? "The public service didn't answer, so this layer is left off. Nothing was assumed." : "Loading…"; }
function renderReadout(s){
  const L = s.layers, rows = [];
  const parcelSub = s.sample ? "Illustrative sample, not a real parcel" : s.sketch ? "Your sketched outline" : `Appraisal record ${s.propId?("#"+esc(s.propId)):""} &middot; ${esc(titleCase(s.source||""))}${s.taxYear?(" "+esc(s.taxYear)):""}`;
  rows.push(readoutRow("parcel", s.added.length ? "Assemblage" : "Parcel", `${acTxt(s.acres)} acres <span class="opt" style="color:#93aab8">(GIS, approx.)</span>`, parcelSub + (s.legalAcres && !s.added.length ? ` &middot; ${fmt(s.legalAcres,2)} ac on the appraisal roll` : ""), "ok"));
  const f = L.flood; rows.push(readoutRow("flood","FEMA floodplain", f && f.status==="ok" ? (f.shareSFHA>0.005 ? `About ${fmt(f.shareSFHA*100,0)}% in the mapped 1% annual-chance floodplain` : "Outside the mapped 1% annual-chance floodplain") : esc(failText(f)),
    f && f.status==="ok" ? (f.shareSFHA>0.005 ? `Approximately ${fmt((1-f.shareSFHA)*100,0)}% of the tract is outside mapped floodplain${f.shareFloodway>0.005?`; about ${fmt(f.shareFloodway*100,0)}% in mapped floodway`:""}. ` : "") + "From an aligned FEMA map overlay, not an elevation survey." : "", stateOf(s,"flood")));
  const w = L.wet; rows.push(readoutRow("wet","Wetlands (NWI)", w && w.status==="ok" ? (w.share>0.002 ? `About ${fmt(w.share*100,1)}% mapped as wetland or water` : w.nearby ? "None mapped on the tract; some nearby" : "None mapped on or near the tract") : esc(failText(w)),
    w && w.status==="ok" && w.typesOnTract.length ? esc(w.typesOnTract.join(", ")) + ". A mapped indicator, not a delineation." : w && w.status==="ok" ? "A mapped indicator, not a delineation." : "", stateOf(s,"wet")));
  const wa = L.water; rows.push(readoutRow("water","Mapped streams", wa && wa.status==="ok" ? (wa.crossing ? "A mapped stream or water body touches the tract" : "None mapped across the tract") : esc(failText(wa)), wa && wa.status==="ok" && wa.names && wa.names.length ? esc(wa.names.slice(0,2).join(", ")) : "", stateOf(s,"water")));
  const so = L.soils; rows.push(readoutRow("soils","Soils (SSURGO)", so && so.status==="ok" ? (so.units.length ? esc(so.units[0].name.split(",")[0]) + ` <span class="opt" style="color:#93aab8">~${fmt(so.units[0].share*100,0)}%</span>` : "No soil map units returned") : esc(failText(so)),
    so && so.status==="ok" && so.units.length ? `${so.units.length} map unit${so.units.length>1?"s":""}. Hydrologic group ${esc(so.units[0].hyd||"n/a")}. A screening hint, not a geotechnical report.` : "", stateOf(s,"soils")));
  const t = L.terrain; rows.push(readoutRow("terrain","Terrain (public lidar)", t && t.status==="ok" ? `${fmt(t.relief,0)} ft of relief, average slope ~${fmt(t.meanSlope,1)}%` : esc(failText(t)),
    t && t.status==="ok" ? `${t.fallDir ? "Ground generally falls toward the " + t.fallDir + ". " : "Nearly level overall. "}Approximate, from USGS 3DEP. Not a design topo.` : "", stateOf(s,"terrain")));
  const pw = L.power; rows.push(readoutRow("power","Transmission lines", pw && pw.status==="ok" ? (pw.nearest ? (pw.nearest.d===0 ? "A mapped line crosses the tract" : `Nearest mapped line ~${fmt(pw.nearest.d/5280,1)} mi away`) : `None mapped within ${s.powerMi||CONFIG.powerRadiusMi} miles`) : esc(failText(pw)),
    pw && pw.status==="ok" && pw.nearest ? `${pw.nearest.kv ? fmt(pw.nearest.kv,0)+" kV class. " : ""}Proximity only. Says nothing about available capacity.` : pw && pw.status==="ok" ? "Proximity only." : "", stateOf(s,"power")));
  const j = L.juris; rows.push(readoutRow("juris","Jurisdiction", j && j.status==="ok" ? (j.text ? esc(j.text) : j.name ? "City of " + esc(j.name) : "Outside mapped city limits") : esc(failText(j)),
    j && j.status==="ok" ? (j.name ? "Zoning is set by the city. This is a mapped limit, not a zoning finding." : "Could still sit in a city's ETJ, which controls platting. Check with the county and nearby cities.") : "", stateOf(s,"juris")));
  $("#readout").innerHTML = rows.join("");
  const adjBox = $("#adjBox"), A = L.adj;
  adjBox.hidden = s.sample || s.sketch;
  if(!adjBox.hidden){
    $("#adjText").innerHTML = s.added.length ? `This screen covers ${s.parcels.length} appraisal parcels, about ${acTxt(s.acres)} acres combined. Click a highlighted parcel to drop it, or a neighbor to add it.`
      : A && A.status==="ok" ? `Click a neighboring parcel on the sheet to add it. Layers recompute for the combined outline. ${A.items.length} neighbors loaded.`
      : A && A.status==="fail" ? "Neighboring parcels didn't load, so assemblage is off for this site." : "Loading neighboring parcels…";
  }
}

/* ===== Sheet (SVG), laid out on ASC's 24x36 sheet template ===== */
const SW = 1200, SH = 800;                     // sheet, 1.5:1 like a 24x36 plot
const DX = 14, DY = 14, DW = 786, DH = 772;    // drawing area
const NX = 810, NW = 276;                      // notes column
const TX = 1092, TW = 100;                     // title strip
const SF = "IBM Plex Sans Condensed, Arial Narrow, sans-serif";
function sheetXform(s){ const [x0,y0,x1,y1] = s.frame, k = DW/(x1-x0); return { k, X:x=>DX+(x-x0)*k, Y:y=>DY+(y1-y)*k, inv:(px,py)=>[x0+(px-DX)/k, y1-(py-DY)/k] }; }
function pathOf(rings, T, close=true){ return rings.map(r=>r.map((p,i)=>(i?"L":"M")+T.X(p[0]).toFixed(1)+" "+T.Y(p[1]).toFixed(1)).join("")+(close?"Z":"")).join(""); }
function niceStep(span){ const raw=span/5, p=Math.pow(10,Math.floor(Math.log10(raw))); for(const m of [1,2,2.5,5,10]) if(m*p>=raw) return m*p; return 10*p; }
function frameRelief(g){ let mn=Infinity,mx=-Infinity; for(const v of g.z) if(!isNaN(v)){ if(v<mn)mn=v; if(v>mx)mx=v; } return mx-mn; }
function contourSegs(g, iv){ // marching squares, returns [[x1,y1,x2,y2,level],...]
  const out = [], Z=(i,j)=>g.z[j*g.nx+i];
  let mn=Infinity,mx=-Infinity; for(const v of g.z) if(!isNaN(v)){ if(v<mn)mn=v; if(v>mx)mx=v; }
  for(let lv=Math.ceil(mn/iv)*iv; lv<=mx; lv+=iv){
    for(let j=0;j<g.ny-1;j++) for(let i=0;i<g.nx-1;i++){
      const a=Z(i,j), b=Z(i+1,j), c=Z(i+1,j+1), d=Z(i,j+1); if(isNaN(a)||isNaN(b)||isNaN(c)||isNaN(d)) continue;
      const x=g.x0+(i+.5)*g.dx, y=g.ytop-(j+.5)*g.dy, pts=[];
      const e=(v1,v2,x1,y1,x2,y2)=>{ if((v1<lv)!==(v2<lv)){ const t=(lv-v1)/(v2-v1); pts.push([x1+(x2-x1)*t, y1+(y2-y1)*t]); } };
      e(a,b,x,y,x+g.dx,y); e(b,c,x+g.dx,y,x+g.dx,y-g.dy); e(c,d,x+g.dx,y-g.dy,x,y-g.dy); e(d,a,x,y-g.dy,x,y);
      if(pts.length>=2) out.push([pts[0][0],pts[0][1],pts[1][0],pts[1][1],lv]);
      if(pts.length===4) out.push([pts[2][0],pts[2][1],pts[3][0],pts[3][1],lv]);
    }
  }
  return out;
}
function wrapTxt(s, n){ const out=[]; let line=""; String(s).split(/\s+/).forEach(w=>{ if((line+" "+w).trim().length>n && line){ out.push(line); line=w; } else line=(line+" "+w).trim(); }); if(line) out.push(line); return out; }
const mdY = () => { const d = new Date(); return String(d.getMonth()+1).padStart(2,"0")+"/"+String(d.getDate()).padStart(2,"0")+"/"+d.getFullYear(); };
function screenNo(s){ const h = [...String(listKey(s))].reduce((a,c)=>(a*31 + c.charCodeAt(0))>>>0, 7); return "S" + String(new Date().getFullYear()).slice(2) + "-" + (h % 100000).toString().padStart(5,"0"); }
function sheetTitleLines(s){
  const r = s.refs || {}, j = s.layers.juris, city = j && j.status==="ok" && j.name ? "City of " + titleCase(j.name) + ", " : "";
  const cty = s.county ? titleCase(s.county) + " County, Texas" : "Texas";
  const rec = [r.lot && "Lot " + r.lot, r.block && "Block " + r.block, r.addition && titleCase(r.addition) + (r.platted && !/ADD/.test(r.addition) ? " Addition" : "")].filter(Boolean).join(", ");
  const abs = r.abstract ? "Abstract No. " + r.abstract : "";
  return ["PRELIMINARY SITE SCREEN", String(s.title||"Site").toUpperCase(), `BEING ${acTxt(s.acres)} ACRES ±`, rec || abs || (s.sample ? "ILLUSTRATIVE SAMPLE TRACT" : s.sketch ? "SKETCHED OUTLINE" : "APPRAISAL PARCEL"), city + cty].map(t=>t.length>58?t.slice(0,56)+"…":t);
}
function drawSheet(s){
  if(!s) return; const svg = $("#sheet"), T = sheetXform(s), L = s.layers, o = [];
  const [x0,y0,x1,y1] = s.frame, seen = s._seen || (s._seen = new Set());
  const fx = k => { if(seen.has(k)) return ""; seen.add(k); return ' class="fx"'; };
  o.push(`<defs>
    <clipPath id="cpDraw"><rect x="${DX}" y="${DY}" width="${DW}" height="${DH}"/></clipPath>
    <clipPath id="cpVic"><rect x="${NX+150}" y="${DY+4}" width="${NW-152}" height="112"/></clipPath>
    <pattern id="hFlood" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="#2f6aa8" stroke-width="1.1" stroke-opacity=".8"/></pattern>
    <pattern id="hWay" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><line x1="0" y1="0" x2="0" y2="5" stroke="#173f6e" stroke-width="1.3"/></pattern>
    <pattern id="hWet" width="12" height="10" patternUnits="userSpaceOnUse"><path d="M3 8h6M6 5v3M4 6l2 2 2-2" stroke="#2c7a5d" stroke-width=".9" fill="none"/></pattern>
    <filter id="gray"><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncR type="linear" slope="1.08"/><feFuncG type="linear" slope="1.08"/><feFuncB type="linear" slope="1.08"/></feComponentTransfer></filter>
  </defs>`);
  // paper and sheet border (rounded, heavy, like the plotted sheets)
  o.push(`<rect x="0" y="0" width="${SW}" height="${SH}" fill="#fff"/>`);
  o.push(`<g clip-path="url(#cpDraw)">`);
  const aerialOn = LAYER_ON.aerial && !s.sample;
  if(aerialOn){ const a = s.P.i([x0,y0]), b = s.P.i([x1,y1]);
    const url = CONFIG.imagery + "?" + qs({bbox:[a[0],a[1],b[0],b[1]].join(","), bboxSR:4326, imageSR:4326, size:"1180,1160", format:"jpg", f:"image"});
    o.push(`<image href="${esc(url)}" x="${DX}" y="${DY}" width="${DW}" height="${DH}" preserveAspectRatio="none" opacity=".62"/>`); }
  const ink = "#111", halo = "#fff";
  // contours: light index-and-intermediate pattern like a plotted topo
  const t = L.terrain;
  if(LAYER_ON.contours && t && t.status==="ok"){
    const fr = frameRelief(t.grid), iv = [1,2,5,10,20,50,100].find(v => fr/v <= 16) || 100, segs = contourSegs(t.grid, iv);
    const major = iv*5, minor = [], maj = [];
    for(const g of segs) (Math.abs(g[4]/major-Math.round(g[4]/major))<1e-6 ? maj : minor).push(`M${T.X(g[0]).toFixed(1)} ${T.Y(g[1]).toFixed(1)}L${T.X(g[2]).toFixed(1)} ${T.Y(g[3]).toFixed(1)}`);
    o.push(`<g${fx("contours")}><path d="${minor.join("")}" stroke="${aerialOn?"#fff":"#8c8c8c"}" stroke-width=".55" fill="none" opacity="${aerialOn?.55:.9}"/>`);
    o.push(`<path d="${maj.join("")}" stroke="${aerialOn?"#fff":"#555"}" stroke-width="1" fill="none" opacity="${aerialOn?.85:.95}"/></g>`);
    s._contourIv = iv;
  }
  // flood
  const f = L.flood;
  if(LAYER_ON.flood && f && f.status==="ok"){ o.push(`<g${fx("flood")}>`);
    for(const p of f.polys.filter(p=>p.sfha && !p.floodway)) o.push(`<path d="${pathOf(p.rings,T)}" fill="url(#hFlood)" fill-rule="evenodd" stroke="#2f6aa8" stroke-width="1" stroke-dasharray="10 3 2 3"/>`);
    for(const p of f.polys.filter(p=>p.floodway)) o.push(`<path d="${pathOf(p.rings,T)}" fill="url(#hWay)" fill-rule="evenodd" stroke="#173f6e" stroke-width="1"/>`);
    for(const p of f.polys.filter(p=>/0\.2/.test(p.zone||""))) o.push(`<path d="${pathOf(p.rings,T)}" fill="none" stroke="#2f6aa8" stroke-dasharray="3 3" stroke-width=".8"/>`);
    o.push(`</g>`); }
  const w = L.wet;
  if(LAYER_ON.wet && w && w.status==="ok"){ o.push(`<g${fx("wet")}>`); for(const p of w.polys) o.push(`<path d="${pathOf(p.rings,T)}" fill="url(#hWet)" fill-rule="evenodd" stroke="#2c7a5d" stroke-width=".9"/>`); o.push(`</g>`); }
  const wa = L.water;
  if(LAYER_ON.water && wa && wa.status==="ok"){ o.push(`<g${fx("water")}>`); for(const i of wa.items){
    if(i.paths) o.push(`<path d="${pathOf(i.paths,T,false)}" fill="none" stroke="#2a86c0" stroke-width="1.6"/>`);
    if(i.rings) o.push(`<path d="${pathOf(i.rings,T)}" fill="#2a86c0" fill-opacity=".18" stroke="#2a86c0" stroke-width=".9"/>`); } o.push(`</g>`); }
  // neighbors, labeled from the appraisal roll like adjoiner callouts
  const A = L.adj;
  if(LAYER_ON.adj && A && A.status==="ok"){ o.push(`<g${fx("adj")}>`);
    for(const n of A.items) o.push(`<path class="adjp" data-oid="${esc(n.oid)}" d="${pathOf(n.rings,T)}" fill="rgba(255,255,255,0.001)" stroke="${aerialOn?"#f2f2f2":"#6d6d6d"}" stroke-width=".7"/>`);
    const lab = A.items.map(n=>{ const b = bbox(n.rings), wpx = (b[2]-b[0])*T.k, hpx = (b[3]-b[1])*T.k; return {n, wpx, hpx}; }).filter(x=>x.wpx>90 && x.hpx>34 && x.n.legal).sort((a,b)=>b.wpx*b.hpx-a.wpx*a.hpx).slice(0,14);
    for(const {n, wpx} of lab){ const [cx,cy] = interiorPoint(n.rings), lines = wrapTxt(String(n.legal).toUpperCase(), Math.max(14, Math.min(34, Math.floor(wpx/5.2)))).slice(0,3);
      if(!inRings(cx,cy,n.rings)) continue;
      o.push(`<text x="${T.X(cx).toFixed(1)}" y="${(T.Y(cy)-(lines.length-1)*4.5).toFixed(1)}" font-family="${SF}" font-size="6.6" text-anchor="middle" fill="${aerialOn?"#fff":"#333"}" paint-order="stroke" stroke="${aerialOn?"#111":halo}" stroke-width="${aerialOn?2:2.4}" pointer-events="none">${lines.map((l,i)=>`<tspan x="${T.X(cx).toFixed(1)}" dy="${i?9:0}">${esc(l)}</tspan>`).join("")}</text>`); }
    o.push(`</g>`); }
  const pw = L.power;
  if(LAYER_ON.power && pw && pw.status==="ok"){ o.push(`<g${fx("power")}>`); for(const l of pw.lines) o.push(`<path d="${pathOf(l.paths,T,false)}" fill="none" stroke="#b2600b" stroke-width="1.6" stroke-dasharray="16 4 3 4"/>`); o.push(`</g>`); }
  // tract: pale tint and a heavy boundary-weight line, as on the plotted sheets
  o.push(`<path d="${pathOf(s.rings,T)}" fill="${aerialOn?"rgba(146,26,29,.16)":"rgba(208,49,45,.12)"}" fill-rule="evenodd" stroke="${aerialOn?"#fff":"#111"}" stroke-width="2.6" stroke-linejoin="round" class="tract"/>`);
  if(aerialOn) o.push(`<path d="${pathOf(s.rings,T)}" fill="none" stroke="#921A1D" stroke-width="1.2" pointer-events="none"/>`);
  if(s.added.length) for(const p of s.parcels) o.push(`<path class="adjp sel" data-oid="${esc(p.oid)}" d="${pathOf(p.ringsLL.map(r=>r.map(s.P.f)),T)}" fill="rgba(146,26,29,.001)" stroke="#921A1D" stroke-width=".9" stroke-dasharray="3 3"/>`);
  const [cx,cy] = interiorPoint(s.rings), lc = aerialOn ? "#fff" : ink, ls = aerialOn ? "#111" : halo;
  const lbl = [`${acTxt(s.acres)} ACRES ±`, `(${fmt(sig2(s.areaSqft),0)} SQ. FT. ±)`, s.sample ? "SAMPLE TRACT" : s.sketch ? "SKETCHED OUTLINE" : s.added.length ? "APPRAISAL PARCELS (COMBINED)" : "APPRAISAL PARCEL"];
  const r = s.refs || {}; if(r.lot || r.block) lbl.push([r.lot&&"LOT "+r.lot, r.block&&"BLOCK "+r.block].filter(Boolean).join(", ")); if(s.propId && !s.added.length) lbl.push("APPRAISAL ID " + s.propId);
  o.push(`<text x="${T.X(cx).toFixed(1)}" y="${(T.Y(cy)-lbl.length*5).toFixed(1)}" font-family="${SF}" text-anchor="middle" fill="${lc}" paint-order="stroke" stroke="${ls}" stroke-width="3" pointer-events="none">${lbl.map((l,i)=>`<tspan x="${T.X(cx).toFixed(1)}" dy="${i?12:0}" font-size="${i===0?12.5:8.6}" font-weight="${i===0?600:400}">${esc(l)}</tspan>`).join("")}</text>`);
  if(SKETCH && SKETCH.pts.length){ o.push(`<path d="${pathOf([SKETCH.pts],T,SKETCH.pts.length>2)}" fill="rgba(146,26,29,.12)" stroke="#921A1D" stroke-width="2" stroke-dasharray="6 3"/>`);
    for(const p of SKETCH.pts) o.push(`<circle cx="${T.X(p[0])}" cy="${T.Y(p[1])}" r="4" fill="#921A1D"/>`); }
  o.push(`<g transform="translate(${DX+DW/2} ${DY+DH/2}) rotate(-30)" font-family="${SF}" font-weight="600" text-anchor="middle" fill="${aerialOn?"#fff":"#921A1D"}" opacity="${aerialOn?.22:.09}" pointer-events="none"><text font-size="64" y="-12" letter-spacing="10">PRELIMINARY</text><text font-size="38" y="40" letter-spacing="12">NOT A SURVEY</text></g>`);
  o.push(`</g>`);
  o.push(notesColumn(s, T));
  o.push(titleStrip(s));
  o.push(`<rect x="5" y="5" width="${SW-10}" height="${SH-10}" rx="16" fill="none" stroke="#111" stroke-width="2.2"/>`);
  svg.innerHTML = `<title id="sheetTitle">Preliminary site screen sheet for ${esc(s.title||"site")}</title>` + o.join("");
}
function notesColumn(s, T){
  const o = [], L = s.layers, f = L.flood, t = L.terrain, w = L.wet, wa = L.water, so = L.soils, pw = L.power, j = L.juris;
  // vicinity map, north arrow and graphic scale at the top right, as on the plotted sheets
  const vx = NX+150, vy = DY+4, vw = NW-152, vh = 112;
  o.push(`<rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="#f4f4f4" stroke="#111" stroke-width=".8"/>`);
  o.push(`<g clip-path="url(#cpVic)">`);
  const half = Math.max(5200, Math.sqrt(s.areaSqft)*7), hy = half*vh/vw;
  if(!s.sample){ const a = s.P.i([-half,-hy]), b = s.P.i([half,hy]);
    const url = CONFIG.vicinity + "?" + qs({bbox:[a[0],a[1],b[0],b[1]].join(","), bboxSR:4326, imageSR:4326, size:Math.round(vw*3)+","+Math.round(vh*3), format:"png", f:"image"});
    o.push(`<image href="${esc(url)}" x="${vx}" y="${vy}" width="${vw}" height="${vh}" preserveAspectRatio="none" filter="url(#gray)"/>`); }
  else for(let i=1;i<6;i++) o.push(`<path d="M${vx} ${vy+i*vh/6+((i*37)%11)}L${vx+vw} ${vy+i*vh/6-((i*23)%9)}M${vx+i*vw/6} ${vy}L${vx+i*vw/6+((i*13)%7)} ${vy+vh}" stroke="#c9c9c9" stroke-width="${i===3?2:.8}"/>`);
  const vk = vw/(2*half), VX = x=>vx+vw/2+x*vk, VY = y=>vy+vh/2-y*vk;
  const vr = s.rings.map(r=>r.map((p,i)=>(i?"L":"M")+VX(p[0]).toFixed(1)+" "+VY(p[1]).toFixed(1)).join("")+"Z").join("");
  o.push(`<path d="${vr}" fill="#111" stroke="#111" stroke-width="1"/><circle cx="${VX(0)}" cy="${VY(0)}" r="7" fill="none" stroke="#111" stroke-width="1"/>`);
  o.push(`<text x="${VX(0)+10}" y="${VY(0)-8}" font-family="${SF}" font-size="11" font-weight="600" fill="#111" paint-order="stroke" stroke="#fff" stroke-width="3">SITE</text></g>`);
  o.push(`<text x="${vx+vw/2}" y="${vy+vh+11}" font-family="${SF}" font-size="8" text-anchor="middle" fill="#111" text-decoration="underline">VICINITY MAP</text><text x="${vx+vw/2}" y="${vy+vh+20}" font-family="${SF}" font-size="7" text-anchor="middle" fill="#111">NOT TO SCALE</text>`);
  const ax = vx+vw/2, ay = vy+vh+30;
  o.push(`<g transform="translate(${ax} ${ay})"><text y="7" text-anchor="middle" font-family="${SF}" font-size="11" font-weight="600" fill="#111">N</text><path d="M0 11L4 40 0 36 -4 40Z" fill="#111"/><line x1="0" y1="36" x2="0" y2="58" stroke="#111" stroke-width=".8"/><circle cy="44" r="4.5" fill="none" stroke="#111" stroke-width=".8"/></g>`);
  const [fx0,,fx1] = s.frame, sb = niceStep((fx1-fx0)/2.6), sbw = sb*T.k, sx = ax - sbw/2, sy = ay + 72;
  if(sbw < vw+20){ o.push(`<g font-family="${SF}" font-size="7" fill="#111"><rect x="${sx}" y="${sy}" width="${sbw/4}" height="4" fill="#111"/><rect x="${sx+sbw/4}" y="${sy}" width="${sbw/4}" height="4" fill="#fff" stroke="#111" stroke-width=".6"/><rect x="${sx+sbw/2}" y="${sy}" width="${sbw/2}" height="4" fill="#111"/>
    <text x="${sx}" y="${sy-3}" text-anchor="middle">0</text><text x="${sx+sbw/2}" y="${sy-3}" text-anchor="middle">${fmt(sb/2,0)}</text><text x="${sx+sbw}" y="${sy-3}" text-anchor="middle">${fmt(sb,0)}</text><text x="${sx+sbw+4}" y="${sy+4}">Feet</text>
    <text x="${ax}" y="${sy+14}" text-anchor="middle">GRAPHIC SCALE (APPROX.)</text></g>`); }
  // text blocks
  let y = DY + 8, colX = NX, colW = 140;
  const LH = 9.4, FS = 7.3;
  const head = h => { o.push(`<text x="${colX}" y="${y}" font-family="${SF}" font-size="8" font-weight="600" fill="#111" text-decoration="underline">${esc(h)}</text>`); y += 11; };
  const para = (txt, ind=0) => { const up = txt === txt.toUpperCase(), n = Math.floor((colW-ind)/(up?4.1:3.4)); for(const l of wrapTxt(txt, n)){ o.push(`<text x="${colX+ind}" y="${y}" font-family="${SF}" font-size="${FS}" fill="#1a1a1a">${esc(l)}</text>`); y += LH; } };
  const num = (k, txt) => { o.push(`<text x="${colX}" y="${y}" font-family="${SF}" font-size="${FS}" fill="#1a1a1a">${k}.</text>`); para(txt, 10); y += 2.5; };
  const widen = () => { if(y > DY + 222 && colW < NW){ colW = NW; } };
  head("RECORD INFORMATION (APPRAISAL ROLL)");
  if(s.sample) para("Illustrative sample tract. Shapes, figures and record data are examples only.");
  else if(s.sketch) para("Outline sketched on the Site Screen page. No appraisal record is attached to it.");
  else { para(s.legal ? String(s.legal) : "No legal description on the appraisal roll for this parcel.");
    y += 2; para([s.propId && "Appraisal ID " + s.propId, s.county && titleCase(s.county) + " County", s.taxYear && "Tax year " + s.taxYear].filter(Boolean).join(" · ")); }
  y += 6; widen();
  head("GENERAL NOTES"); widen();
  const lid = t && t.grid && t.grid.lidar;
  const gn = [
    "This sheet assembles public data. No field work was performed and nothing shown was located on the ground.",
    "Tract lines come from county appraisal mapping (TxGIO StratMap), drawn for tax purposes. They can be off by tens of feet and are not a boundary.",
    t && t.status==="ok" ? `Contours are generated from USGS 3DEP public lidar${lid&&lid.project&&!s.sample?` (${lid.project}${lid.end?", "+yrs(lid.start,lid.end):""})`:""} at a ${s._contourIv||"–"}-ft interval and are approximate. Not a design topographic survey.` : "Public lidar contours were not available for this sheet.",
    "Positions are geographic (WGS 84) from public map services. No survey datum, coordinate system or survey basis is established.",
    "Transmission lines (HIFLD) show proximity only. They say nothing about capacity, service, cost or timing."];
  gn.forEach((g,i)=>{ num(i+1, g); widen(); });
  y += 4; widen();
  head("FLOOD STATEMENT");
  if(f && f.status==="ok"){ const pin = f.shareSFHA, zones = f.zonesOnTract.length ? f.zonesOnTract.join(", ") : "X (minimal)";
    para(`According to the FEMA National Flood Hazard Layer${f.panel&&!s.sample?` (study ${f.panel})`:""}, queried ${today()}, ${pin>0.005?`approximately ${fmt(pin*100,0)}% of this tract lies within the mapped 1% annual-chance floodplain and approximately ${fmt((1-pin)*100,0)}% lies outside mapped floodplain`:`this tract lies outside the mapped 1% annual-chance floodplain`}. Zones touching the tract: ${zones}.${f.shareFloodway>0.005?` About ${fmt(f.shareFloodway*100,0)}% is in mapped floodway.`:""} Percentages are an approximation from an aligned FEMA map overlay, not an on-the-ground elevation survey. This statement does not imply that the property will or will not be free from flooding.`); }
  else para(f && f.status==="fail" ? "The FEMA service did not answer, so no flood statement is made." : "Loading FEMA flood data…");
  y += 6; widen();
  head("SITE DATA (APPROXIMATE, PUBLIC SOURCES)");
  const sd = [];
  if(t && t.status==="ok") sd.push(`Ground about ${fmt(t.min,0)} to ${fmt(t.max,0)} ft (${fmt(t.relief,0)} ft relief), average slope about ${fmt(t.meanSlope,1)}%${t.fallDir?`, falling generally ${t.fallDir}`:""}.`);
  if(w && w.status==="ok") sd.push(w.share>0.002 ? `About ${fmt(w.share*100,1)}% mapped as NWI wetland or water. Not a delineation.` : "No NWI wetland mapped on the tract.");
  if(wa && wa.status==="ok") sd.push(wa.crossing ? `Mapped stream or water body touches the tract${wa.names&&wa.names.length?` (${wa.names[0]})`:""}.` : "No mapped stream crosses the tract.");
  if(so && so.status==="ok" && so.units.length) sd.push(`Main soil: ${so.units[0].name.split(",")[0]} (~${fmt(so.units[0].share*100,0)}%, hydrologic group ${so.units[0].hyd||"n/a"}).`);
  if(pw && pw.status==="ok") sd.push(pw.nearest ? (pw.nearest.d===0 ? "A mapped transmission line crosses the tract." : `Nearest mapped transmission line about ${fmt(pw.nearest.d/5280,1)} mi.`) : `No transmission line mapped within ${s.powerMi||CONFIG.powerRadiusMi} mi.`);
  if(j && j.status==="ok") sd.push(j.text ? j.text : j.name ? `Inside mapped city limits of ${titleCase(j.name)}. Not a zoning finding.` : "Outside mapped city limits; an ETJ may still apply.");
  sd.forEach(x=>{ o.push(`<text x="${colX}" y="${y}" font-family="${SF}" font-size="${FS}" fill="#1a1a1a">•</text>`); para(x, 8); y += 1; widen(); });
  // legend and abbreviations share the last band, two columns
  y += 6; const ly0 = y; colW = 138;
  head("LEGEND");
  const leg = [["tract","SCREENED TRACT"],["adj","NEIGHBOR APPRAISAL PARCEL"],["flood","FEMA 1% ANNUAL-CHANCE"],["way","MAPPED FLOODWAY"],["wet","NWI WETLAND OR WATER"],["stream","MAPPED STREAM"],["major","LIDAR CONTOUR"],["power","TRANSMISSION (HIFLD)"]];
  for(const [k,l] of leg){ if(y > SH-40) break; const sx = colX, yy = y-3;
    o.push(k==="tract"?`<rect x="${sx}" y="${yy-4}" width="16" height="7" fill="rgba(208,49,45,.12)" stroke="#111" stroke-width="1.6"/>`:k==="adj"?`<line x1="${sx}" y1="${yy}" x2="${sx+16}" y2="${yy}" stroke="#6d6d6d" stroke-width=".8"/>`:k==="flood"?`<rect x="${sx}" y="${yy-4}" width="16" height="7" fill="url(#hFlood)" stroke="#2f6aa8" stroke-width=".8"/>`:k==="way"?`<rect x="${sx}" y="${yy-4}" width="16" height="7" fill="url(#hWay)" stroke="#173f6e" stroke-width=".8"/>`:k==="wet"?`<rect x="${sx}" y="${yy-4}" width="16" height="7" fill="url(#hWet)" stroke="#2c7a5d" stroke-width=".8"/>`:k==="stream"?`<line x1="${sx}" y1="${yy}" x2="${sx+16}" y2="${yy}" stroke="#2a86c0" stroke-width="1.6"/>`:k==="major"?`<line x1="${sx}" y1="${yy}" x2="${sx+16}" y2="${yy}" stroke="#555" stroke-width="1"/>`:`<line x1="${sx}" y1="${yy}" x2="${sx+16}" y2="${yy}" stroke="#b2600b" stroke-width="1.6" stroke-dasharray="7 2 2 2"/>`);
    o.push(`<text x="${sx+20}" y="${y}" font-family="${SF}" font-size="6.6" fill="#1a1a1a">= ${l}</text>`); y += 9.5; }
  y = ly0; colX = NX + 140; colW = 134;
  head("ABBREVIATIONS");
  for(const a of ["AC = ACRES","SQ. FT. = SQUARE FEET","NFHL = NATIONAL FLOOD HAZARD LAYER","NWI = NATIONAL WETLANDS INVENTORY","3DEP = USGS 3D ELEVATION PROGRAM","HIFLD = HOMELAND INFRASTRUCTURE FOUNDATION-LEVEL DATA","ETJ = EXTRATERRITORIAL JURISDICTION","± = APPROXIMATE"]){ if(y > SH-40) break; para(a); y += .8; }
  const src = s.sample ? "Illustrative sample." : "Sources: TxGIO, FEMA NFHL, USFWS NWI, USDA NRCS SSURGO, USGS 3DEP, HIFLD, Esri.";
  o.push(`<text x="${NX}" y="${SH-24}" font-family="${SF}" font-size="6.4" fill="#444">${esc(src)}</text>`);
  o.push(`<text x="${NX}" y="${SH-14}" font-family="${SF}" font-size="6.4" fill="#444">txasc · site screen · ${esc(screenNo(s))}</text><text x="${TX-8}" y="${SH-14}" text-anchor="end" font-family="${SF}" font-size="7" fill="#111">© ADAMS SURVEYING COMPANY ${new Date().getFullYear()}</text>`);
  return o.join("");
}
function titleStrip(s){
  const o = [], cx = TX + TW/2;
  o.push(`<line x1="${TX}" y1="5" x2="${TX}" y2="${SH-5}" stroke="#111" stroke-width="1.4"/>`);
  o.push(`<image href="img/sheet-logo.png" x="${cx-39}" y="20" width="78" height="${(78*950/510).toFixed(1)}"/>`);
  o.push(`<line x1="${TX}" y1="186" x2="${SW-5}" y2="186" stroke="#111" stroke-width="1.2"/>`);
  ["1475 Richardson Drive, Suite 255","Richardson, TX 75080","Ph: (469) 317-0250","www.txasc.com","surveytx@txasc.com"].forEach((l,i)=>o.push(`<text x="${cx}" y="${202+i*10.5}" text-anchor="middle" font-family="${SF}" font-size="${i===0?6.1:7}" fill="#111">${esc(l)}</text>`));
  o.push(`<line x1="${TX}" y1="258" x2="${SW-5}" y2="258" stroke="#111" stroke-width="1.2"/>`);
  const tl = sheetTitleLines(s), mid = 258 + (606-258)/2;
  o.push(`<g transform="translate(${cx} ${mid}) rotate(-90)" font-family="${SF}" text-anchor="middle" fill="#111">${tl.map((l,i)=>`<text y="${(i-(tl.length-1)/2)*14+4}" font-size="${i===0?11:10}" font-weight="${i===0?600:400}">${esc(l)}</text>`).join("")}</g>`);
  o.push(`<line x1="${TX}" y1="606" x2="${SW-5}" y2="606" stroke="#111" stroke-width="1.2"/>`);
  const rows = [["DRAWN BY","AUTO"],["CHECKED BY","NONE"],["DATE",mdY()]];
  rows.forEach(([k,v],i)=>{ const yy = 606 + i*13; o.push(`<line x1="${TX}" y1="${yy+13}" x2="${SW-5}" y2="${yy+13}" stroke="#111" stroke-width=".6"/><text x="${TX+5}" y="${yy+9.5}" font-family="${SF}" font-size="6.6" fill="#111">${k}</text><text x="${SW-9}" y="${yy+9.5}" text-anchor="end" font-family="${SF}" font-size="6.6" fill="#111">${v}</text>`); });
  o.push(`<line x1="${TX+52}" y1="606" x2="${TX+52}" y2="632" stroke="#111" stroke-width=".6"/>`);
  o.push(`<text x="${cx}" y="666" text-anchor="middle" font-family="${SF}" font-size="12.5" font-weight="700" fill="#d0312d" letter-spacing=".5">PRELIMINARY</text>`);
  wrapTxt("This document shall not be recorded for any purpose and shall not be used or viewed or relied upon as a final survey document.", 27).forEach((l,i)=>o.push(`<text x="${cx}" y="${677+i*7.4}" text-anchor="middle" font-family="${SF}" font-size="5.8" fill="#d0312d">${esc(l)}</text>`));
  o.push(`<text x="${cx}" y="${724}" text-anchor="middle" font-family="${SF}" font-size="8" font-weight="700" fill="#d0312d">NOT A SURVEY</text>`);
  o.push(`<line x1="${TX}" y1="760" x2="${SW-5}" y2="760" stroke="#111" stroke-width="1.2"/>`);
  o.push(`<text x="${cx}" y="774" text-anchor="middle" font-family="${SF}" font-size="7.6" fill="#111">SHEET 1 OF 1</text><text x="${cx}" y="787" text-anchor="middle" font-family="${SF}" font-size="7" fill="#111">SCREEN No. ${esc(screenNo(s))}</text>`);
  return o.join("");
}

/* ===== Terrain model (canvas, lazy) ===== */
let MODEL = {yaw:-0.7, pitch:0.85, drag:null, raf:0, auto:true};
function drawModel(){
  const s = current, cv = $("#model"); if(!cv || !s) return; const ctx = cv.getContext("2d"), W = cv.width, H = cv.height;
  ctx.fillStyle = "#0E1F2D"; ctx.fillRect(0,0,W,H);
  const t = s.layers.terrain;
  if(!t || t.status!=="ok"){ ctx.fillStyle="#a9bdc8"; ctx.font="16px IBM Plex Sans, sans-serif"; ctx.textAlign="center"; ctx.fillText(t && t.status==="wait" ? "Loading public lidar…" : "Public lidar isn't available for this site, so there is no terrain model.", W/2, H/2); $("#modelCap").textContent=""; return; }
  const g = t.grid, ex = 3, span = Math.max(g.nx*g.dx, g.ny*g.dy), sc = Math.min(W,H)*0.78/span;
  const cy0 = Math.cos(MODEL.yaw), sy0 = Math.sin(MODEL.yaw), cp = Math.cos(MODEL.pitch), sp = Math.sin(MODEL.pitch);
  const zmid = (t.min+t.max)/2, cx = g.x0 + g.nx*g.dx/2, cyy = g.ytop - g.ny*g.dy/2;
  const pr = (x,y,z) => { const X = x-cx, Y = y-cyy, Z = (z-zmid)*ex; const xr = X*cy0 - Y*sy0, yr = X*sy0 + Y*cy0; return [W/2 + xr*sc, H*0.56 - (yr*sp + Z*cp)*sc, -(yr*cp - Z*sp)]; };
  const step = Math.max(1, Math.round(Math.max(g.nx,g.ny)/80)), quads = [];
  const fl = s.layers.flood && s.layers.flood.status==="ok" ? s.layers.flood.polys.filter(p=>p.sfha) : [];
  const key = step + ":" + fl.length + ":" + s.rings.length + ":" + s.acres.toFixed(3);
  if(!s._mq || s._mq.key !== key){ const meta = [];
    for(let j=0;j<g.ny-step;j+=step) for(let i=0;i<g.nx-step;i+=step){
      const z = [g.z[j*g.nx+i], g.z[j*g.nx+i+step], g.z[(j+step)*g.nx+i+step], g.z[(j+step)*g.nx+i]]; if(z.some(isNaN)) continue;
      const xs = [g.x0+(i+.5)*g.dx, g.x0+(i+step+.5)*g.dx], ys = [g.ytop-(j+.5)*g.dy, g.ytop-(j+step+.5)*g.dy], mx = (xs[0]+xs[1])/2, my = (ys[0]+ys[1])/2;
      const dzx = (z[1]-z[0]+z[2]-z[3])/(2*step*g.dx), dzy = (z[0]-z[3]+z[1]-z[2])/(2*step*g.dy);
      const shade = Math.max(0.5, Math.min(1.1, 0.86 - (dzx*0.7 - dzy*0.55)*ex*2.2));
      meta.push({z, xs, ys, shade, inT:inRings(mx,my,s.rings), inF:fl.some(p=>inRings(mx,my,p.rings)), zr:((z[0]+z[2])/2 - t.min)/(t.relief||1)}); }
    s._mq = {key, meta}; }
  for(const m of s._mq.meta){ const {z,xs,ys} = m;
    const P = [pr(xs[0],ys[0],z[0]), pr(xs[1],ys[0],z[1]), pr(xs[1],ys[1],z[2]), pr(xs[0],ys[1],z[3])];
    quads.push({P, d:(P[0][2]+P[2][2])/2, shade:m.shade, inT:m.inT, inF:m.inF, zr:m.zr}); }
  quads.sort((a,b)=>a.d-b.d);
  for(const q of quads){ ctx.beginPath(); ctx.moveTo(q.P[0][0],q.P[0][1]); for(let k=1;k<4;k++) ctx.lineTo(q.P[k][0],q.P[k][1]); ctx.closePath();
    const base = q.inF ? (q.inT ? [150,182,214] : [92,124,160]) : q.inT ? [226,212,192] : [128,146,156], hi = q.inT ? [168,120,90] : [96,114,126], m = q.zr*0.3;
    const col = base.map((c,k)=>Math.round((c*(1-m)+hi[k]*m)*q.shade)); ctx.fillStyle = `rgb(${col})`; ctx.fill(); ctx.strokeStyle="rgba(14,31,45,.12)"; ctx.lineWidth=.5; ctx.stroke(); }
  // tract outline draped
  ctx.strokeStyle = "#ff5a5f"; ctx.lineWidth = 2.5; ctx.beginPath();
  for(const r of s.rings){ r.forEach((p,i)=>{ const z = gridAt(g,p[0],p[1]); const q = pr(p[0],p[1],isNaN(z)?t.min:z+0.5); i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]); }); ctx.closePath(); }
  ctx.stroke();
  $("#modelCap").textContent = `Public lidar surface (USGS 3DEP), vertical exaggerated 3×, ~${t.cellFt} ft cells${s.layers.flood&&s.layers.flood.status==="ok"&&s.layers.flood.shareSFHA>0.005?"; blue = FEMA mapped floodplain (approx.)":""}. Drag to turn. Approximate. Not a design topo.`;
}
function modelLoop(){ if(VIEW!=="model") return; if(MODEL.auto && !MODEL.drag) MODEL.yaw += 0.0035; drawModel(); MODEL.raf = requestAnimationFrame(modelLoop); }
function initModelInput(){ const cv = $("#model");
  cv.addEventListener("pointerdown", e=>{ MODEL.drag=[e.clientX,e.clientY,MODEL.yaw,MODEL.pitch]; MODEL.auto=false; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener("pointermove", e=>{ if(!MODEL.drag) return; MODEL.yaw = MODEL.drag[2] + (e.clientX-MODEL.drag[0])*0.008; MODEL.pitch = Math.max(0.35, Math.min(1.35, MODEL.drag[3] + (e.clientY-MODEL.drag[1])*0.006)); });
  cv.addEventListener("pointerup", ()=>{ MODEL.drag=null; }); }

/* ===== Brief ===== */
const SURVEYS = {
  alta:{name:"ALTA/NSPS Land Title Survey", key:"alta"},
  boundary:{name:"Boundary survey", key:"boundary"},
  topo:{name:"Topographic survey", key:"topo"},
  staking:{name:"Construction staking and control", key:"construction"},
  none:{name:"No survey yet", key:"unsure"}
};
function recommend(s){
  const big = s.acres >= 40, type = TYPE || (s.sample ? s.type : null), commercial = ["ind","dc","mf","retail"].includes(type), notes = [];
  let pri = null, add = null, why = "";
  if(STAGE==="early"){ pri = SURVEYS.none; why = "While a site is still on a list, the public record is enough to sort it. Order survey work when a site is kept and goes under option or contract."; add = commercial || big ? SURVEYS.alta : SURVEYS.boundary; }
  else if(STAGE==="option"){ pri = commercial || (big && type!=="land") ? SURVEYS.alta : SURVEYS.boundary; add = SURVEYS.topo;
    why = pri===SURVEYS.alta ? "During the option or contract period, the buyer, the lender and the title company usually want the boundary, improvements and recorded easements shown together. That is what an ALTA/NSPS survey does." : "During the option or contract period, a boundary survey settles where the lines and corners actually are before money goes hard."; }
  else if(STAGE==="design"){ pri = SURVEYS.topo; add = SURVEYS.boundary; why = "Design needs existing ground the civil engineer can grade to, tied to a located boundary. Public lidar is fine for screening and not for design."; }
  else if(STAGE==="sell"){ pri = commercial ? SURVEYS.alta : SURVEYS.boundary; add = null; why = "A current survey in the listing package answers the first diligence questions before a buyer asks them, and keeps closing on schedule."; }
  else if(STAGE==="finance"){ pri = commercial || big ? SURVEYS.alta : SURVEYS.boundary; add = null; why = "Lenders and title companies usually ask for a current survey they can rely on. For commercial loans that is typically ALTA/NSPS with the Table A items the lender lists."; }
  const L = s.layers;
  if(L.flood && L.flood.status==="ok" && L.flood.shareSFHA > 0.005) notes.push("FEMA's mapped floodplain crosses this tract. A survey can locate the floodplain line on the ground from the base flood elevation; the map overlay here is only approximate.");
  if(L.wet && L.wet.status==="ok" && L.wet.share > 0.002) notes.push("Mapped wetlands appear on the tract. An environmental consultant decides whether a delineation is needed; the survey can then locate the flagged limits.");
  if(L.terrain && L.terrain.status==="ok" && L.terrain.relief >= 15) notes.push(`About ${fmt(L.terrain.relief,0)} ft of relief means grading drives cost here, so design topography matters early.`);
  if(s.refs && s.refs.abstract && !s.refs.platted) notes.push("The appraisal record reads as unplatted abstract land. Boundaries come from deed calls, so plan for more record research and corner recovery than on a platted lot.");
  if(s.added.length) notes.push(`This is an assemblage of ${s.parcels.length} appraisal parcels. The common lines between them, and any gaps or overlaps in the deeds, are what a boundary survey resolves.`);
  if(big) notes.push("On a tract this size, flying the site while the crew ties the boundary puts the topography, the boundary and later construction layout on one consistent survey basis, from one visit.");
  return {pri, add, why, notes};
}
function powerContextHTML(s){
  const pw = s.layers.power; if(!pw || pw.status!=="ok") return "";
  const show = TYPE==="dc" || TYPE==="ind" || (s.sample && (s.type==="dc"||s.type==="ind")) || s.acres >= 40; if(!show) return "";
  const near = pw.nearest;
  return `<div class="b-card power"><h3>Power context, from public maps</h3>
    <p>${near ? (near.d===0 ? "A mapped transmission line crosses this tract" : `The nearest mapped transmission line is about ${fmt(near.d/5280,1)} miles away`) + (near.kv?` (${fmt(near.kv,0)} kV class)`:"") + "." : `No transmission line is mapped within ${s.powerMi||CONFIG.powerRadiusMi} miles.`} ${pw.count>1?`${pw.count} mapped lines fall within ${s.powerMi||CONFIG.powerRadiusMi} miles${pw.kvs.length?`, ${pw.kvs.map(k=>fmt(k,0)+" kV").join(", ")} classes`:""}.`:""}</p>
    <p>A nearby line is not capacity. Whether the grid can take a new load, when, and at what cost is answered by the transmission provider and ERCOT through the large-load interconnection process, not by a map. For large loads, PUCT rules require a study fee and financial security before a request is studied.</p>
    <p><a href="${CONFIG.ercotPlanning}" target="_blank" rel="noopener">ERCOT regional planning filings</a> &middot; <a href="${CONFIG.puctLargeLoad}" target="_blank" rel="noopener">PUCT large-load rule (16 TAC §25.194)</a></p>
    ${pw.nearest && pw.nearest.d < 300 ? "<p>A line this close usually means a recorded transmission easement on or next to the tract. Its width and restrictions come from the recorded instrument, located by survey.</p>" : ""}</div>`;
}
function renderBrief(s){
  const L = s.layers, rec = recommend(s), rows = [];
  const row = (k, finding, limit, src, st) => rows.push(`<tr><td class="k">${k}</td><td>${st==="ok"?finding:`<span class="na">Not loaded.</span> The public service didn't answer, so this layer is left off.`}<div class="limit">${limit}</div></td><td class="src">${src}</td></tr>`);
  const st = k => L[k] ? L[k].status : "wait";
  row("Parcel", `${acTxt(s.acres)} acres by GIS${s.legalAcres&&!s.added.length?`; ${fmt(s.legalAcres,2)} acres on the appraisal roll`:""}. ${s.legal?esc(s.legal):""}`, "An appraisal map, drawn for taxes. Lines can be off by tens of feet. Not a boundary.", s.sample?"Illustrative sample":esc(`TxGIO StratMap Land Parcels, from ${titleCase(s.source||"county appraisal district")}${s.taxYear?", tax year "+s.taxYear:""}`), "ok");
  const f = L.flood; row("Floodplain", f&&f.status==="ok"?`${f.shareSFHA>0.005?`About ${fmt(f.shareSFHA*100,0)}% inside the mapped 1% annual-chance floodplain; approximately ${fmt((1-f.shareSFHA)*100,0)}% outside mapped floodplain.`:"Outside the mapped 1% annual-chance floodplain."}${f.shareFloodway>0.005?` About ${fmt(f.shareFloodway*100,0)}% in mapped floodway.`:""} Zones touching the tract: ${f.zonesOnTract.length?esc(f.zonesOnTract.join(", ")):"X (minimal)"}.`:"",
    "Percentages are an approximation from an aligned FEMA map overlay, not an on-the-ground elevation survey.", s.sample?"Illustrative sample":`FEMA National Flood Hazard Layer, queried ${today()}${f&&f.panel?` (study ${esc(f.panel)})`:""}`, st("flood"));
  const w = L.wet; row("Wetlands", w&&w.status==="ok"?(w.share>0.002?`About ${fmt(w.share*100,1)}% of the tract is mapped as ${esc(w.typesOnTract.join(", ").toLowerCase()||"wetland or water")}.`:w.nearby?"None mapped on the tract. Mapped features nearby are drawn on the sheet.":"None mapped on or near the tract."):"",
    "The National Wetlands Inventory is drawn from aerial imagery. It is not a jurisdictional delineation.", s.sample?"Illustrative sample":"USFWS National Wetlands Inventory", st("wet"));
  const wa = L.water; row("Streams", wa&&wa.status==="ok"?(wa.crossing?`A mapped stream or water body touches the tract${wa.names&&wa.names.length?` (${esc(wa.names.slice(0,3).join(", "))})`:""}.`:"No mapped stream crosses the tract."):"", "Mapped centerlines at regional scale. Drainage easements and channels are located by survey.", s.sample?"Illustrative sample":"TxGIO / USGS National Hydrography Dataset", st("water"));
  const so = L.soils; row("Soils", so&&so.status==="ok"&&so.units.length?so.units.slice(0,4).map(u=>`${esc(u.name)} <span class="opt">(~${fmt(u.share*100,0)}%, hydrologic group ${esc(u.hyd||"n/a")}${u.drain?", "+esc(u.drain.toLowerCase()):""})</span>`).join("<br>"):so&&so.status==="ok"?"No soil map units returned.":"",
    "County-scale soil mapping. A screening hint for drainage and foundations, not a geotechnical report.", s.sample?"Illustrative sample":"USDA NRCS SSURGO via Soil Data Access", st("soils"));
  const t = L.terrain; const lid = t&&t.grid&&t.grid.lidar;
  row("Terrain", t&&t.status==="ok"?`Ground runs from about ${fmt(t.min,0)} to ${fmt(t.max,0)} ft (${fmt(t.relief,0)} ft of relief). Average slope about ${fmt(t.meanSlope,1)}%; about ${fmt((t.over5||0)*100,0)}% of the tract is steeper than 5%. ${t.fallDir?`Ground generally falls toward the ${t.fallDir}`:"Nearly level overall"}${t.lowSide?`, with the lowest ground on the ${t.lowSide} side`:""}. Rough earthwork to bring the tract to one plane following its natural fall: about ${fmt(sig2(t.balanceCY),0)} cubic yards each of cut and fill.`:"",
    "Approximate, from public lidar resampled to about " + (t&&t.cellFt?t.cellFt:"–") + "-ft cells. Not a design topo, and not bid quantities: no pavement section, shrink-swell, stripping or building pads.",
    s.sample?"Illustrative sample":`USGS 3DEP${lid&&lid.project?`; lidar project ${esc(lid.project)}`:""}${lid&&lid.end?`, collected ${esc(yrs(lid.start, lid.end))}`:""}${lid&&lid.gsd?`, ${esc(lid.gsd)} m DEM`:""}`, st("terrain"));
  const pw = L.power; row("Transmission", pw&&pw.status==="ok"?(pw.nearest?(pw.nearest.d===0?"A mapped transmission line crosses the tract.":`Nearest mapped line about ${fmt(pw.nearest.d/5280,1)} miles away`)+(pw.nearest.kv?`, ${fmt(pw.nearest.kv,0)} kV class.`:"."):`None mapped within ${s.powerMi||CONFIG.powerRadiusMi} miles.`):"",
    "Proximity from a national public map. It says nothing about available capacity, service, cost or timing.", s.sample?"Illustrative sample":"HIFLD Electric Power Transmission Lines (public dataset, last edited 2023)", st("power"));
  const j = L.juris; row("Jurisdiction", j&&j.status==="ok"?(j.text?esc(j.text):j.name?`Inside mapped city limits of ${esc(j.name)}. Zoning, platting and permits run through the city. <a href="https://www.google.com/search?q=${encodeURIComponent("City of "+j.name+" Texas zoning map")}" target="_blank" rel="noopener">Find the city's zoning map</a>.`:"Outside mapped city limits. A city's extraterritorial jurisdiction may still control platting; county rules apply to roads and drainage."):"",
    "A mapped city limit, not a zoning determination or a city verification letter.", s.sample?"Illustrative sample":`TxGIO / Comptroller city boundaries${j&&j.edited?`, edited ${esc(String(j.edited).split(" ")[0])}`:""}`, st("juris"));
  const refs = s.refs || {}, refList = [refs.addition&&`Addition: ${refs.addition}`, refs.lot&&`Lot ${refs.lot}`, refs.block&&`Block ${refs.block}`, refs.abstract&&`Abstract ${refs.abstract}`, refs.instrument&&`Instrument ${refs.instrument}`, refs.volPage, refs.plat&&`Plat ${refs.plat}`].filter(Boolean);
  const still = ["Where the boundary lines and corners actually are, and whether the deeds close and agree with the neighbors'",
    "Which recorded easements, setbacks and restrictions touch the tract, located on the ground",
    "Access: whether the frontage is public right-of-way and where the drives can go",
    "Existing ground for design, to design-grade accuracy, including the floodplain line from the base flood elevation",
    "Improvements, utilities and encroachments as they exist on the ground today"];
  const pid = s.layers.power;
  $("#brief").innerHTML = `
    <h3>The brief</h3>
    <table class="ctable"><thead><tr><th>Layer</th><th>What the public record shows</th><th>Source and date</th></tr></thead><tbody>${rows.join("")}</tbody></table>
    ${refList.length?`<div class="refs"><strong>Possible record references read from the appraisal description</strong> (unverified, not a title search): ${esc(refList.join(" · "))}</div>`:""}
    <div class="b-grid">
      <div class="b-card"><h3>What a licensed survey still has to answer</h3><ul class="ticks">${still.map(x=>`<li>${x}</li>`).join("")}</ul></div>
      <div class="b-card"><p class="eyebrow-dark">The survey that fits</p>
        <p class="rec-name">${esc(rec.pri.name)}${rec.add?` <span class="opt">then ${esc(rec.add.name.toLowerCase())}</span>`:""}</p>
        <p class="rec-why">${esc(rec.why)}</p>
        ${rec.notes.length?`<ul class="ticks">${rec.notes.map(n=>`<li>${esc(n)}</li>`).join("")}</ul>`:""}
        <p class="opt" style="margin-top:10px">A recommendation from the screen, not a requirement. Your lender, title company or engineer may ask for something different.</p></div>
      ${powerContextHTML(s)}
      <div class="b-card navy"><h3>If you keep this site</h3><p>The boundary or ALTA, the design topography, and later the construction control and progress flights can come from one licensed Texas crew. ASC flies the site while the crew ties the boundary, on the same visit.</p><p><a href="#packet">Ask for a proposal with the packet</a> or call <a href="tel:+14693170250">(469) 317-0250</a>.</p></div>
    </div>`;
  // proposal context
  $("#pfSite").textContent = `${s.sample?"Sample site":"Site"}: ${s.title}, ${s.area} · ${acTxt(s.acres)} ac (approx.)`;
  $("#altLink").href = CONFIG.quoteUrl + "?" + qs({type:rec.pri===SURVEYS.none ? (rec.add?rec.add.key:"unsure") : rec.pri.key, loc:s.sample ? "" : (s.situs || `${s.center.lat.toFixed(6)}, ${s.center.lng.toFixed(6)}`)}) + "#quote";
}

/* ===== Render a whole site ===== */
function renderSite(s){
  $("#results").hidden = false;
  $("#resKind").textContent = s.sample ? "Sample screen" : "Site screen";
  $("#resTitle").textContent = s.title;
  $("#resSub").innerHTML = `${s.sample?'<span class="tag sample">Illustrative sample</span>':s.sketch?'<span class="tag sketch">Sketched outline · live public data</span>':'<span class="tag live">Live public data</span>'}${esc(s.area)}${s.sample?"":" · "+s.center.lat.toFixed(5)+", "+s.center.lng.toFixed(5)}`;
  $("#layers").innerHTML = LAYERS.map(([k,l,c])=>`<button type="button" class="lyr" data-k="${k}" aria-pressed="${LAYER_ON[k]}" ${s.sample&&(k==="aerial"||k==="adj")?"disabled":""}><i style="background:${c}"></i>${l}</button>`).join("");
  $("#btnList").textContent = LIST.some(x=>x.key===listKey(s)) ? "On your short list" : "Add to short list";
  renderReadout(s); drawSheet(s); renderBrief(s); renderInsights(s); updPacketForm(); setView(VIEW);
}

/* ===== Main flow ===== */
let RUN = 0;
async function screen(raw, {quiet=false}={}){
  const my = ++RUN, t0 = performance.now(); note(null);
  const go = $("#go"), gl = go.querySelector("span"); go.disabled = true; gl.textContent = "Screening…";
  resetMonitor(); relock();
  try {
    const sm = /^sample:(\w+)$/.exec(raw.trim());
    let s;
    if(sm){ const d = SAMPLES.find(x=>x.id===sm[1]); if(!d) throw new Error("Unknown sample."); s = siteFromSample(d); if(!TYPE) setType(d.type, true); STEPS.forEach(([k])=>setStatus(k,"ok")); }
    else { guide("Finding the appraisal parcel at that point…", "busy"); setStatus("parcel","wait"); s = await runLive(raw); }
    if(my !== RUN) return null;
    current = s; hudCoord(s.center); if(!s.sample) setStatus("parcel","ok"); renderSite(s);
    if(!quiet) setTimeout(()=>$("#results").scrollIntoView({behavior:"smooth", block:"start"}), 80);
    if(!s.sample){
      guide(`Parcel found: ${acTxt(s.acres)} acres${s.county?` in ${titleCase(s.county)} County`:""}. Reading seven more public layers…`, "busy");
      safeReplace(null, "", shareURL(s)); $("#sheetWrap").classList.add("scanning");
      await screenLayers(s); $("#sheetWrap").classList.remove("scanning");
      if(s === current){ renderBrief(s); renderReadout(s); renderInsights(s);
        const failed = STEPS.filter(([k])=>s.layers[k] && s.layers[k].status==="fail").length;
        guide(`Screen complete in ${((performance.now()-t0)/1000).toFixed(0)} s.${failed?` ${failed} public service${failed>1?"s":""} didn't answer, so ${failed>1?"those layers are":"that layer is"} left off.`:""} The sheet and the read are below.`, "ok"); } }
    else { safeReplace(null, "", location.pathname + "?" + qs({loc:raw, ...(TYPE?{type:TYPE}:{}) , stage:STAGE})); guide("Sample opened. It is illustrative, so try a real site next.", "ok"); }
    return s;
  } catch(e){
    if(my !== RUN) return null;
    // fail closed: no stale exhibit from another site stays on screen
    current = null; $("#results").hidden = true; $("#sheetWrap").classList.remove("scanning"); resetMonitor();
    note(e.message || "Something went wrong."); guide("Nothing was drawn for that location. Try another format, or sketch the tract.");
    if(e.sketchAt) offerSketch(e.sketchAt);
    return null;
  } finally { if(my === RUN){ go.disabled = false; gl.textContent = "Screen this site"; } }
}
function relock(){ if(document.body.classList.contains("staff")) return; $("#briefWrap").classList.add("locked"); $("#reqForm").hidden = false; $("#reqDone").hidden = true; }
function note(msg){ const n = $("#notice"); if(msg){ n.textContent = msg; n.hidden = false; } else n.hidden = true; }
function offerSketch(center){
  const P = proj(center), half = 900, ring = [[-half,-half],[half,-half],[half,half],[-half,half]];
  const base = newSite({sample:false, sketch:true, input:"sketch", kind:"Sketch", center, P, rings:[ring.map(p=>[p[0]/50,p[1]/50])], county:null, legal:null, area:"Texas", parcels:[]});
  base.frame = [-half,-half*DH/DW,half,half*DH/DW]; base.title = "Sketch a tract here"; base.layers = {aerial:{status:"na"}};
  current = base; $("#results").hidden = false; renderSite(base); $("#brief").innerHTML = ""; $("#adjBox").hidden = true;
  $("#readout").innerHTML = '<li><span class="st na" aria-hidden="true"></span><div><div class="ro-k">No parcel at that point</div><div class="ro-v">Sketch the tract on the aerial</div><div class="ro-s">Click the corners on the sheet, then choose Screen this outline. Every layer runs on your outline.</div></div></li>';
  startSketch();
  $("#results").scrollIntoView({behavior:"smooth"});
}

/* ===== Sketch mode ===== */
function startSketch(){ if(!current) return; SKETCH = {pts:[], base:current}; LAYER_ON.aerial = true; $("#sheetWrap").classList.add("sketching"); $("#sketchBar").hidden = false; setView("sheet"); updSketch(); }
function endSketch(){ SKETCH = null; $("#sheetWrap").classList.remove("sketching"); $("#sketchBar").hidden = true; if(current) drawSheet(current); }
function updSketch(){ $("#sketchCount").textContent = SKETCH ? SKETCH.pts.length : 0; $("#sketchDone").disabled = !SKETCH || SKETCH.pts.length < 3; drawSheet(current); }
function svgPoint(e){ const svg = $("#sheet"), pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const p = pt.matrixTransform(svg.getScreenCTM().inverse()); return [p.x, p.y]; }
async function finishSketch(){
  const base = SKETCH.base, pts = SKETCH.pts.slice(); endSketch();
  if(ringArea(pts) < 0) pts.reverse();
  const s = siteFromSketch(pts, base); RUN++; current = s; renderSite(s);
  safeReplace(null, "", location.pathname + "?" + qs({sketch:s.sketchLL.map(p=>p[1].toFixed(6)+","+p[0].toFixed(6)).join(";"), ...(TYPE?{type:TYPE}:{}), stage:STAGE}));
  await screenLayers(s); if(s===current){ renderBrief(s); renderReadout(s); }
}

/* ===== Assemblage ===== */
async function toggleNeighbor(oid){
  const s = current; if(!s || s.sample || s.sketch) return;
  const inSet = s.parcels.find(p=>String(p.oid)===String(oid));
  if(inSet){ if(s.parcels.length===1) return; s.parcels = s.parcels.filter(p=>p!==inSet); s.added = s.added.filter(o=>String(o)!==String(oid)); }
  else { const n = (s.layers.adj && s.layers.adj.items || []).find(n=>String(n.oid)===String(oid)); if(!n) return; s.parcels.push(n); s.added.push(n.oid); s.layers.adj.items = s.layers.adj.items.filter(x=>x!==n); }
  await rebuildAssemblage(s);
}

async function restoreAssemblage(s, adds){
  let added = 0;
  for(const [lat,lng] of adds){ if(s !== current) return;
    try { const p = await fetchParcelAt({lat,lng}); if(p && !s.parcels.some(x=>String(x.oid)===String(p.oid))){ s.parcels.push(p); s.added.push(p.oid); added++; } } catch(e){} }
  if(!added || s !== current) return;
  if(s.layers.adj && s.layers.adj.items){ const ids = new Set(s.parcels.map(p=>String(p.oid))); s.layers.adj.items = s.layers.adj.items.filter(n=>!ids.has(String(n.oid))); }
  await rebuildAssemblage(s);
}
async function rebuildAssemblage(s){
  s.rings = s.parcels.flatMap(p=>p.ringsLL.map(r=>r.map(s.P.f))); s.areaSqft = polyArea(s.rings); s.acres = ac(s.areaSqft);
  s.title = s.parcels.length>1 ? `Assemblage of ${s.parcels.length} parcels` : (s.parcels[0].situs || "Parcel " + (s.parcels[0].propId||""));
  if(s.parcels.length===1){ s.legal = s.parcels[0].legal; s.propId = s.parcels[0].propId; s.added = []; } else { s.legal = null; s.propId = s.parcels.map(p=>p.propId).join(", "); }
  s.refs = s.parcels.length===1 ? parseLegal(s.legal) : {};
  const nb = bbox(s.rings), fr = s.frame; if(nb[0]<fr[0]||nb[1]<fr[1]||nb[2]>fr[2]||nb[3]>fr[3]) s.frame = frameFor(s.rings);
  renderSite(s); safeReplace(null, "", shareURL(s)); await screenLayers(s, ["flood","wet","water","soils","terrain","power"]); if(s===current){ renderBrief(s); renderReadout(s); }
}

/* ===== Share link ===== */
function shareURL(s){ const base = location.origin + location.pathname;
  if(s.sketch) return base + "?" + qs({sketch:s.sketchLL.map(p=>p[1].toFixed(6)+","+p[0].toFixed(6)).join(";"), ...(TYPE?{type:TYPE}:{}), stage:STAGE});
  const ip = p => { const P = proj(s.center), ll = P.i(interiorPoint(p.ringsLL.map(x=>x.map(P.f)))); return ll[1].toFixed(6)+","+ll[0].toFixed(6); };
  const moved = !s.sample && s.parcels && s.parcels.length && String(s.parcels[0].oid) !== String(s.oid);
  const loc = s.sample ? "sample:"+s.sampleId : moved ? ip(s.parcels[0]) : (s.kind==="Address" ? s.input : s.parcels && s.parcels.length ? ip(s.parcels[0]) : `${s.center.lat.toFixed(6)}, ${s.center.lng.toFixed(6)}`);
  const add = !s.sample && s.parcels && s.parcels.length > 1 ? s.parcels.slice(1).map(p=>{ const P = proj(s.center), r = p.ringsLL.map(x=>x.map(P.f)), ll = P.i(interiorPoint(r)); return ll[1].toFixed(6)+","+ll[0].toFixed(6); }).join(";") : null;
  return base + "?" + qs({loc, ...(add?{add}:{}), ...(TYPE?{type:TYPE}:{}), stage:STAGE}); }

/* ===== Short list (this browser only) ===== */
function loadList(){ try { return JSON.parse(localStorage.getItem("ascScreenList")||"[]"); } catch(e){ return []; } }
function saveList(){ try { localStorage.setItem("ascScreenList", JSON.stringify(LIST)); } catch(e){} renderList(); updPacketForm(); }
const listKey = s => s.sample ? "sample:"+s.sampleId : s.sketch ? "sketch:"+(s.sketchLL||[]).map(p=>p[1].toFixed(6)+","+p[0].toFixed(6)).join(";") : "p:"+s.parcels.map(p=>p.oid).sort().join("+");
function summary(s){ const L = s.layers, ok = k => L[k] && L[k].status==="ok";
  return { key:listKey(s), title:s.title, area:s.area, sample:!!s.sample, acres:+s.acres.toFixed(2),
    flood: ok("flood") ? +(L.flood.shareSFHA*100).toFixed(0) : null, floodway: ok("flood") ? +(L.flood.shareFloodway*100).toFixed(0) : null,
    wet: ok("wet") ? +(L.wet.share*100).toFixed(1) : null, stream: ok("water") ? L.water.crossing : null,
    relief: ok("terrain") ? +L.terrain.relief.toFixed(0) : null, slope: ok("terrain") ? +L.terrain.meanSlope.toFixed(1) : null,
    soil: ok("soils") && L.soils.units[0] ? L.soils.units[0].name.split(",")[0] : null,
    line: ok("power") ? (L.power.nearest ? +(L.power.nearest.d/5280).toFixed(1) : ">"+(s.powerMi||CONFIG.powerRadiusMi)) : null, kv: ok("power") && L.power.nearest ? L.power.nearest.kv : null,
    juris: ok("juris") ? (L.juris.text || (L.juris.name ? "City of "+L.juris.name : "Outside city limits")) : null,
    url: shareURL(s), date: new Date().toISOString().slice(0,10) }; }
function addCurrentToList(){ if(!current) return; const sum = summary(current); LIST = LIST.filter(x=>x.key!==sum.key); LIST.push(sum); saveList(); $("#btnList").textContent = "On your short list"; toast("Added to your short list"); }
function renderList(){
  const t = $("#slTable"), n = LIST.length; $("#navCount").hidden = !n; $("#navCount").textContent = n; $("#slEmpty").hidden = !!n;
  if(!n){ t.innerHTML = ""; return; }
  const v = (x, suf="") => x==null ? '<span class="opt">not loaded</span>' : esc(x)+suf;
  t.innerHTML = `<thead><tr><th>Site</th><th>Acres</th><th>In mapped 1% floodplain</th><th>Mapped wetland</th><th>Stream crosses</th><th>Relief / avg slope</th><th>Main soil</th><th>Nearest line</th><th>Jurisdiction</th><th></th></tr></thead><tbody>` +
    LIST.map((x,i)=>`<tr><td><a href="${esc(x.url)}">${esc(x.title)}</a><div class="opt">${esc(x.area)}${x.sample?" · sample":""}</div></td><td class="num">${acTxt(x.acres)}</td><td class="num">${v(x.flood,"%")}${x.floodway?` <span class="opt">(${x.floodway}% floodway)</span>`:""}</td><td class="num">${v(x.wet,"%")}</td><td>${x.stream==null?v(null):x.stream?"Yes":"No"}</td><td class="num">${x.relief==null?v(null):`${x.relief} ft / ${x.slope}%`}</td><td>${v(x.soil)}</td><td class="num">${x.line==null?v(null):`${esc(x.line)} mi${x.kv?` · ${x.kv} kV`:""}`}</td><td>${v(x.juris)}</td><td><button type="button" data-rm="${i}">Remove</button></td></tr>`).join("") + `</tbody>`;
}
/* ===== Packet request (the gate: contact details in, packet by email) ===== */
function updPacketForm(){ const n = LIST.length; $("#listOpt").hidden = !n; $("#listN").textContent = n; $("#pkListItem").hidden = !n; }
function unlockBrief(){ $("#briefWrap").classList.remove("locked"); }
async function submitRequest(e){
  e.preventDefault(); const f = e.target, err = $("#reqErr"); err.hidden = true;
  const d = Object.fromEntries(new FormData(f).entries());
  if(!d.name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email||"") || !d.role || !d.timing){ err.textContent = "Please add your name, a valid email, your role and timing. Company and phone are optional."; err.hidden = false; return; }
  const s = current, rec = s ? recommend(s) : null, L = s ? s.layers : {};
  const clip = (v,n) => v == null || v === "" ? null : String(v).slice(0,n);
  const siteRef = s ? (s.sample ? "sample:"+s.sampleId : s.sketch ? "sketch:"+s.sketchLL.map(p=>p[1].toFixed(6)+","+p[0].toFixed(6)).join(";") : (s.situs || s.input)) : null;
  const list = d.withList && LIST.length ? LIST.slice(-30).map(x=>({title:String(x.title).slice(0,120), url:String(x.url).slice(0,600), acres:x.acres})) : [];
  const packet = { v:1, link: s ? shareURL(s).slice(0,1500) : null, screen_no: s ? screenNo(s) : null, title: s ? String(s.title).slice(0,160) : null, stage:STAGE, type:TYPE, list };
  const row = { kind:"request", goal:(d.proposal?"packet+proposal:":"packet:")+STAGE, site_type:TYPE || (s&&s.sample?s.type:null), survey: rec ? (rec.pri===SURVEYS.none ? (rec.add?rec.add.key:"unsure") : rec.pri.key) : null,
    location: clip(siteRef, 400), lat: s ? +s.center.lat.toFixed(6) : null, lng: s ? +s.center.lng.toFixed(6) : null, acres: s ? +s.acres.toFixed(2) : null,
    flood_zones: L.flood && L.flood.status==="ok" ? clip(L.flood.zonesOnTract.join(", ") || "X", 200) : null, pct_outside_floodplain: L.flood && L.flood.status==="ok" ? +((1-L.flood.shareSFHA)*100).toFixed(1) : null,
    county: s ? clip(s.county,80) : null, legal: s ? clip(s.legal,1000) : null, prop_id: s ? clip(s.propId,80) : null, is_sample: !!(s && s.sample),
    name: d.name.slice(0,200), email: d.email.slice(0,320), phone: clip(d.phone,40), company: clip(d.company,200), note: clip(d.note,1000),
    role: clip(d.role,60), timing: clip(d.timing,60), wants_records: !!d.records, wants_proposal: !!d.proposal, packet };
  const dry = /[?&]dry=1/.test(location.search) || /^TEST\b/i.test(d.name);
  const btn = f.querySelector("button[type=submit]"); btn.disabled = true; btn.textContent = "Sending…";
  try {
    if(!dry){
      const r = await fetch(CONFIG.store.url + "/rest/v1/" + CONFIG.store.table, {method:"POST", headers:{"Content-Type":"application/json", apikey:CONFIG.store.key, Authorization:"Bearer "+CONFIG.store.key, Prefer:"return=minimal"}, body:JSON.stringify(row)});
      if(!r.ok) throw new Error("HTTP "+r.status);
    } else await sleep(500);
    f.hidden = true; $("#doneEmail").textContent = d.email; $("#doneH").textContent = s ? `The packet for ${s.title} is on the way.` : "Your request is in.";
    $("#reqDone").hidden = false; $("#reqDone").focus(); unlockBrief(); toast(dry ? "Test mode: nothing was sent." : "Packet requested.");
  } catch(ex){
    err.innerHTML = `The request didn't go through. Please email <a href="mailto:surveytx@txasc.com?subject=${encodeURIComponent("Site Screen packet: "+(s?s.title:"site"))}&body=${encodeURIComponent((s?shareURL(s)+"\n\n":"")+(d.note||""))}">surveytx@txasc.com</a> or call (469) 317-0250.`; err.hidden = false;
  } finally { btn.disabled = false; btn.textContent = "Email me the packet"; }
}

/* ===== Bulk ===== */
async function runBulk(){
  const lines = $("#bulkText").value.split(/\n+/).map(x=>x.trim()).filter(Boolean).slice(0,30); if(!lines.length) return;
  const st = $("#bulkStatus"), btn = $("#bulkGo"); btn.disabled = true; let ok = 0, bad = [];
  for(let i=0;i<lines.length;i++){
    st.textContent = `Screening ${i+1} of ${lines.length}…`;
    const s = await screen(lines[i], {quiet:true});
    if(s){ addCurrentToList(); ok++; } else bad.push(lines[i]);
    await sleep(300);
  }
  btn.disabled = false; st.textContent = `${ok} of ${lines.length} added to your short list.${bad.length?` Not found: ${bad.slice(0,3).join("; ")}${bad.length>3?"…":""}`:""}`;
  note(null); $("#shortlist").scrollIntoView({behavior:"smooth"});
}

/* ===== View switching ===== */
function setView(v){ VIEW = v; $("#tabSheet").setAttribute("aria-selected", String(v==="sheet")); $("#tabModel").setAttribute("aria-selected", String(v==="model"));
  $("#sheetWrap").hidden = v!=="sheet"; $("#modelWrap").hidden = v!=="model"; $("#layers").hidden = v!=="sheet";
  cancelAnimationFrame(MODEL.raf); if(v==="model"){ MODEL.auto = !matchMedia("(prefers-reduced-motion: reduce)").matches; modelLoop(); } }
function setType(k, silent){ TYPE = TYPE===k && !silent ? null : k; document.querySelectorAll("#types .chip").forEach(c=>c.setAttribute("aria-pressed", String(c.dataset.k===TYPE))); if(current && !silent) renderBrief(current); }
function setStage(k){ STAGE = k; document.querySelectorAll("#stages .chip").forEach(c=>c.setAttribute("aria-pressed", String(c.dataset.k===STAGE))); if(current) renderBrief(current); }

/* ===== Live layer monitor, guide line and insights ===== */
const MON_SRC = {parcel:"TxGIO",flood:"FEMA NFHL",wet:"USFWS NWI",water:"USGS NHD",soils:"NRCS SSURGO",terrain:"USGS 3DEP",power:"HIFLD",juris:"TxGIO"};
const MON_T = {};
function renderMonitor(){ $("#monList").innerHTML = STEPS.map(([k,l])=>`<li data-k="${k}"><span class="st idle" aria-hidden="true"></span><span>${esc(l)}<br><span class="src">${MON_SRC[k]}</span></span><span class="ms">standby</span></li>`).join(""); }
function setStatus(key, st){
  const li = document.querySelector(`#monList li[data-k="${key}"]`); if(!li) return;
  if(st==="wait") MON_T[key] = performance.now();
  const map = {wait:"wait", ok:"ok", fail:"na", na:"off"}, cls = map[st] || "idle";
  li.className = st==="ok" ? "ok" : st==="fail" ? "fail" : "";
  li.querySelector(".st").className = "st " + cls;
  li.querySelector(".ms").textContent = st==="wait" ? "reading" : st==="ok" ? ((performance.now()-(MON_T[key]||performance.now()))/1000).toFixed(1)+" s" : st==="fail" ? "no answer" : st==="na" ? "n/a" : "standby";
  const busy = document.querySelectorAll("#monList .st.wait").length, ms = $("#monState");
  ms.textContent = busy ? `Reading ${busy} layer${busy>1?"s":""}` : current ? "Screen complete" : "Standing by"; ms.classList.toggle("run", !!busy);
  const pl = $("#panelLive"); if(pl) pl.textContent = busy ? `Reading ${busy}` : "Live";
}
function resetMonitor(){ STEPS.forEach(([k])=>setStatus(k,"idle")); }
let GUIDE_T = 0;
function guide(msg, cls){ const g = $("#guide"); if(!g) return; clearInterval(GUIDE_T); g.className = "guide" + (cls?" "+cls:"");
  if(matchMedia("(prefers-reduced-motion: reduce)").matches || msg.includes("<")){ g.innerHTML = msg; return; }
  let i = 0; g.textContent = ""; GUIDE_T = setInterval(()=>{ i += 2; g.innerHTML = esc(msg.slice(0,i)) + (i < msg.length ? '<span class="caret"></span>' : ""); if(i >= msg.length) clearInterval(GUIDE_T); }, 14); }
function guessKind(v){ v = v.trim(); if(!v) return null;
  if(/^-?\d{1,2}\.\d+\s*,\s*-?\d{2,3}\.\d+$/.test(v)) return "Coordinates recognized. Press Enter to screen that point.";
  if(/[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{0,3}/i.test(v)) return "Plus code recognized. Press Enter to screen it.";
  if(/^https?:\/\//i.test(v)) return /@-?\d|[?&](q|ll)=-?\d|!3d/.test(v) ? "Map link recognized. The screen reads the pin from it." : "If that link carries a pin, the screen reads it. Coordinates work best.";
  if(/\d/.test(v) && v.length > 8) return "Looks like an address. The screen finds the parcel at that address.";
  if(v.length > 3) return "Add a street number or city, or paste coordinates, for the best match.";
  return null; }
function hudCoord(c){ const h = $("#hudCoord"); if(h && c) h.textContent = `Lat ${c.lat.toFixed(5)} · Lng ${c.lng.toFixed(5)}`; }
function floodSide(s){ const f = s.layers.flood; if(!f || f.status!=="ok" || f.shareSFHA <= 0.005) return null;
  const sf = f.polys.filter(p=>p.sfha), [x0,y0,x1,y1] = bbox(s.rings), n = 40; let sx=0, sy=0, k=0;
  for(let i=0;i<n;i++) for(let j=0;j<n;j++){ const x = x0+(i+.5)*(x1-x0)/n, y = y0+(j+.5)*(y1-y0)/n; if(inRings(x,y,s.rings) && sf.some(p=>inRings(x,y,p.rings))){ sx+=x; sy+=y; k++; } }
  if(!k || f.shareSFHA > 0.8) return null; const [cx,cy] = centroid(s.rings); const dx = sx/k-cx, dy = sy/k-cy;
  return Math.hypot(dx,dy) < Math.sqrt(s.areaSqft)*0.12 ? null : compass(dx,dy); }
function insights(s){
  const L = s.layers, out = [], ok = k => L[k] && L[k].status==="ok", type = TYPE || (s.sample ? s.type : null);
  if(ok("flood")){ const f = L.flood, side = floodSide(s);
    out.push(f.shareSFHA > 0.005 ? {c:"#5ab0ff", h:"Floodplain", p:`About ${fmt(f.shareSFHA*100,0)}% of the tract sits in FEMA's mapped 1% annual-chance floodplain${side?`, mostly on the ${side} side`:""}. Lenders and engineers will ask where that line falls on the ground, which only a survey tied to the base flood elevation can show.`}
      : {c:"#43c28a", h:"Floodplain", p:"Outside FEMA's mapped 1% annual-chance floodplain, based on an aligned map overlay. That is a map reading, not an elevation survey."}); }
  else out.push({wait:true, h:"Floodplain", p:"Reading FEMA's flood map…"});
  if(ok("terrain")){ const t = L.terrain;
    out.push({c:"#e0a33b", h:"Ground", p:`About ${fmt(t.relief,0)} ft of relief${t.fallDir?`, falling generally toward the ${t.fallDir}`:""}, with an average slope near ${fmt(t.meanSlope,1)}%. ${t.relief >= 15 ? "Grading will be a real cost line here, so design topography matters early." : t.meanSlope < 2 ? "Mostly gentle ground; drainage direction will shape the layout more than grading will." : "Moderate ground. Design topography settles pads and drainage."}`}); }
  else if(!L.terrain || L.terrain.status==="wait") out.push({wait:true, h:"Ground", p:"Reading public lidar…"});
  const wetOn = ok("wet") && L.wet.share > 0.002, strOn = ok("water") && L.water.crossing;
  if(wetOn || strOn) out.push({c:"#5fd3a8", h:"Water features", p:`${wetOn?`About ${fmt(L.wet.share*100,1)}% of the tract is mapped as wetland or water`:""}${wetOn&&strOn?", and a":strOn?"A":""}${strOn?` mapped stream touches the tract${L.water.names&&L.water.names.length?` (${L.water.names[0]})`:""}`:""}. An environmental consultant decides whether a delineation is needed; a survey then locates the limits.`});
  const r = s.refs || {};
  if(!s.sample && !s.sketch){ if(r.lot && r.block) out.push({c:"#ff6a5e", h:"Record", p:`Reads as a platted lot: Lot ${r.lot}, Block ${r.block}${r.addition?`, ${titleCase(r.addition)}`:""}. The recorded plat is where the boundary work starts.`});
    else if(r.abstract) out.push({c:"#ff6a5e", h:"Record", p:`Reads as unplatted acreage in Abstract ${r.abstract}. Lines come from deed calls, so plan for more record research and corner recovery than on a platted lot.`});
    if(s.added.length) out.push({c:"#ff6a5e", h:"Assemblage", p:`${s.parcels.length} appraisal parcels combined. The common lines, and any gaps or overlaps between the deeds, are what a boundary survey resolves.`}); }
  if(ok("power") && (type==="dc" || type==="ind" || s.acres >= 40)){ const n = L.power.nearest;
    out.push({c:"#f0b35a", h:"Transmission", p:`${n ? (n.d===0 ? "A mapped transmission line crosses the tract" : `The nearest mapped transmission line is about ${fmt(n.d/5280,1)} mi away`) + (n.kv?` (${fmt(n.kv,0)} kV class)`:"") : `No transmission line is mapped within ${s.powerMi||CONFIG.powerRadiusMi} mi`}. Proximity only; capacity is a utility and ERCOT question.`}); }
  return out.slice(0,4);
}
function renderInsights(s){
  const box = $("#insights"); if(!box || !s) return;
  const list = insights(s), have = [...box.children];
  list.forEach((x,i)=>{ const html = `<b>${esc(x.h)}</b><p>${esc(x.p)}</p>`, el = have[i];
    if(el && el.dataset.h === x.h + (x.wait?":w":"") ) return;
    const d = document.createElement("div"); d.className = "ins" + (x.wait?" wait":""); d.dataset.h = x.h + (x.wait?":w":""); if(x.c) d.style.setProperty("--c", x.c); d.style.animationDelay = (i*90)+"ms"; d.innerHTML = html;
    if(el) box.replaceChild(d, el); else box.appendChild(d); });
  while(box.children.length > list.length) box.lastChild.remove();
}
/* hero contours: a generated terrain, drawn in once */
function heroTopo(){
  const svg = $("#heroTopo"); if(!svg) return; const W = 1600, H = 900, nx = 96, ny = 54; svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const F = (x,y)=> 60*Math.sin(x/260+.6)*Math.cos(y/210) + 38*Math.sin((x+y)/170) + 26*Math.cos(x/90 - y/140) + 0.09*x - 0.05*y;
  const g = {nx, ny, x0:0, ytop:H, dx:W/nx, dy:H/ny, z:new Float32Array(nx*ny)};
  for(let j=0;j<ny;j++) for(let i=0;i<nx;i++) g.z[j*nx+i] = F((i+.5)*g.dx, H-(j+.5)*g.dy);
  const segs = contourSegs(g, 14), by = {};
  for(const s of segs){ (by[s[4]] = by[s[4]] || []).push(`M${s[0].toFixed(0)} ${(H-s[1]).toFixed(0)}L${s[2].toFixed(0)} ${(H-s[3]).toFixed(0)}`); }
  svg.innerHTML = Object.entries(by).map(([lv,d],i)=>`<path class="${Math.round(lv/14)%5===0?"maj ":""}draw" style="animation-delay:${(i%12)*120}ms" d="${d.join("")}"/>`).join("");
  svg.querySelectorAll("path").forEach(p=>{ try { p.style.setProperty("--len", Math.ceil(p.getTotalLength())); } catch(e){} });
}
/* cursor readout on the sheet */
function sheetHover(e){
  const hud = $("#cursorHud"), s = current; if(!s) return;
  const [px,py] = svgPoint(e); if(px<DX||px>DX+DW||py<DY||py>DY+DH){ hud.hidden = true; return; }
  const [x,y] = sheetXform(s).inv(px,py), ll = s.P.i([x,y]), t = s.layers.terrain, f = s.layers.flood;
  const z = t && t.status==="ok" ? gridAt(t.grid, x, y) : NaN;
  const inFlood = f && f.status==="ok" && f.polys.some(p=>p.sfha && inRings(x,y,p.rings));
  hud.innerHTML = `<b>${s.sample?"sample":ll[1].toFixed(5)+", "+ll[0].toFixed(5)}</b>${isFinite(z)?` · ~${fmt(z,0)} ft (lidar)`:""}${inFlood?" · mapped 1% floodplain":""}${inRings(x,y,s.rings)?" · on tract":""}`;
  const r = $("#sheetWrap").getBoundingClientRect(); hud.style.left = (e.clientX-r.left)+"px"; hud.style.top = (e.clientY-r.top)+"px"; hud.hidden = false;
}

/* ===== Wire up ===== */
function init(){
  $("#types").innerHTML = TYPES.map(([k,l])=>`<button type="button" class="chip" data-k="${k}" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>${l}</button>`).join("");
  $("#stages").innerHTML = STAGES.map(([k,l])=>`<button type="button" class="chip" data-k="${k}" aria-pressed="${k===STAGE}">${l}</button>`).join("");
  $("#samples").innerHTML = SAMPLES.map(s=>`<button type="button" class="linkbtn" data-s="${s.id}">${s.label}</button>`).join("");
  $("#types").addEventListener("click", e=>{ const b = e.target.closest(".chip"); if(b) setType(b.dataset.k); });
  $("#stages").addEventListener("click", e=>{ const b = e.target.closest(".chip"); if(b) setStage(b.dataset.k); });
  $("#samples").addEventListener("click", e=>{ const b = e.target.closest("[data-s]"); if(b){ $("#loc").value = ""; screen("sample:"+b.dataset.s); } });
  $("#console").addEventListener("submit", e=>{ e.preventDefault(); screen($("#loc").value); });
  $("#bulkToggle").addEventListener("click", ()=>{ const b = $("#bulk"); b.hidden = !b.hidden; if(!b.hidden) $("#bulkText").focus(); });
  $("#bulkGo").addEventListener("click", runBulk);
  $("#layers").addEventListener("click", e=>{ const b = e.target.closest(".lyr"); if(!b) return; const k = b.dataset.k; LAYER_ON[k] = !LAYER_ON[k]; b.setAttribute("aria-pressed", String(LAYER_ON[k])); drawSheet(current); });
  $("#tabSheet").addEventListener("click", ()=>setView("sheet")); $("#tabModel").addEventListener("click", ()=>setView("model"));
  $("#btnShare").addEventListener("click", async ()=>{ if(!current) return; const u = shareURL(current); try { await navigator.clipboard.writeText(u); toast("Link copied. It re-runs the screen with today's public data."); } catch(e){ prompt("Copy this link", u); } });
  $("#btnList").addEventListener("click", addCurrentToList);
  $("#slClear").addEventListener("click", ()=>{ LIST = []; saveList(); if(current) $("#btnList").textContent = "Add to short list"; });
  $("#slTable").addEventListener("click", e=>{ const b = e.target.closest("[data-rm]"); if(b){ LIST.splice(+b.dataset.rm,1); saveList(); } });
  $("#btnSketch").addEventListener("click", ()=>{ if(SKETCH) endSketch(); else startSketch(); });
  $("#sketchUndo").addEventListener("click", ()=>{ if(SKETCH){ SKETCH.pts.pop(); updSketch(); } });
  $("#sketchCancel").addEventListener("click", ()=>{ const wasProbe = current && current.title==="Sketch a tract here"; endSketch(); if(wasProbe){ $("#results").hidden = true; current = null; } });
  $("#sketchDone").addEventListener("click", finishSketch);
  $("#sheet").addEventListener("click", e=>{
    if(SKETCH){ const [px,py] = svgPoint(e); if(px<DX||px>DX+DW||py<DY||py>DY+DH) return; SKETCH.pts.push(sheetXform(SKETCH.base).inv(px,py)); updSketch(); return; }
    const p = e.target.closest(".adjp"); if(p) toggleNeighbor(p.dataset.oid);
  });
  $("#reqForm").addEventListener("submit", submitRequest);
  $("#again").addEventListener("click", ()=>{ $("#reqForm").reset(); $("#reqForm").hidden = false; $("#reqDone").hidden = true; $("#loc").focus(); window.scrollTo({top:0, behavior:"smooth"}); });
  initModelInput(); renderList(); renderMonitor(); heroTopo();
  const staff = /[?&]staff=1/.test(location.search); if(staff){ document.body.classList.add("staff"); unlockBrief(); }
  $("#loc").addEventListener("input", e=>{ const m = guessKind(e.target.value); if(m) guide(m); });
  $("#sheet").addEventListener("mousemove", sheetHover); $("#sheet").addEventListener("mouseleave", ()=>{ $("#cursorHud").hidden = true; });
  $("#sheetWrap").addEventListener("contextmenu", e=>{ if(!staff) e.preventDefault(); });
  const hdr = $("#hdr"), onScroll = ()=>hdr.classList.toggle("is-scrolled", scrollY > 40); addEventListener("scroll", onScroll, {passive:true}); onScroll();
  // deep links: ?loc=…&type=…&stage=…  or ?sketch=lat,lng;…
  const u = new URLSearchParams(location.search);
  if(u.get("type") && ICON[u.get("type")]) setType(u.get("type"), true);
  if(u.get("stage") && STAGES.some(s=>s[0]===u.get("stage"))) setStage(u.get("stage"));
  if(u.get("loc")){ $("#loc").value = /^sample:/.test(u.get("loc")) ? "" : u.get("loc");
    const adds = (u.get("add")||"").split(";").map(t=>t.split(",").map(Number)).filter(p=>p.length===2&&p.every(isFinite)).slice(0,25);
    screen(u.get("loc")).then(s=>{ if(s && adds.length) restoreAssemblage(s, adds); }); }
  else if(u.get("sketch")){ const pts = u.get("sketch").split(";").map(t=>t.split(",").map(Number)).filter(p=>p.length===2&&p.every(isFinite)).map(([la,lo])=>[lo,la]);
    if(pts.length>=3){ const c = {lat:pts.reduce((t,p)=>t+p[1],0)/pts.length, lng:pts.reduce((t,p)=>t+p[0],0)/pts.length}, P = proj(c);
      const base = {P, county:null, area:"Texas"}; const s = siteFromSketch(pts.map(P.f), base); current = s; renderSite(s); screenLayers(s).then(()=>{ if(s===current){ renderBrief(s); renderReadout(s); } }); } }
}
if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
