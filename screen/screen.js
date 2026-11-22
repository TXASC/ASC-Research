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
  roads: ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"],
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
const TYPES = [["ind","Industrial"],["dc","Large campus"],["mf","Multifamily"],["retail","Retail or commercial"],["sf","Residential lot"],["land","Land or master-planned"]];
const STAGES = [["early","Just looking"],["option","Buying it"],["design","Designing or building on it"],["sell","Selling it"],["finance","Financing it"]];
let TYPE = null, STAGE = "early";
// test mode: read once, so it survives the address bar rewriting the query; it never goes into share links
const DRY = /[?&]dry=1/.test(location.search);

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
// Texas outline (US Census cartographic boundary, simplified to ~1 km). The coast and rivers are coarse at this
// scale, so a point within ~3 km of the line is let through and the statewide parcel lookup decides.
const TX_OUTLINE = [[[-103.004,36.501],[-100,36.5],[-100,34.561],[-99.928,34.577],[-99.709,34.387],[-99.601,34.374],[-99.58,34.416],[-99.519,34.415],[-99.44,34.374],[-99.397,34.378],[-99.382,34.457],[-99.318,34.408],[-99.26,34.404],[-99.275,34.385],[-99.21,34.337],[-99.192,34.216],[-99.128,34.219],[-99.12,34.202],[-99.077,34.211],[-99.045,34.198],[-98.988,34.221],[-98.919,34.182],[-98.765,34.136],[-98.69,34.133],[-98.647,34.165],[-98.571,34.145],[-98.485,34.062],[-98.413,34.085],[-98.403,34.123],[-98.363,34.157],[-98.169,34.114],[-98.108,34.154],[-98.094,34.111],[-98.123,34.081],[-98.087,34.003],[-98.019,33.994],[-97.972,34.006],[-97.947,33.989],[-97.972,33.937],[-97.954,33.938],[-97.968,33.882],[-97.879,33.85],[-97.835,33.858],[-97.688,33.987],[-97.656,33.989],[-97.588,33.953],[-97.599,33.918],[-97.559,33.897],[-97.502,33.92],[-97.459,33.904],[-97.462,33.849],[-97.444,33.824],[-97.372,33.819],[-97.333,33.874],[-97.301,33.88],[-97.254,33.864],[-97.247,33.9],[-97.211,33.916],[-97.179,33.892],[-97.171,33.836],[-97.207,33.81],[-97.164,33.729],[-97.125,33.717],[-97.085,33.744],[-97.096,33.799],[-97.049,33.818],[-97.089,33.854],[-97.042,33.837],[-96.985,33.886],[-96.996,33.949],[-96.974,33.936],[-96.924,33.959],[-96.906,33.95],[-96.884,33.868],[-96.852,33.847],[-96.83,33.875],[-96.784,33.863],[-96.769,33.827],[-96.705,33.835],[-96.676,33.909],[-96.586,33.895],[-96.629,33.845],[-96.572,33.819],[-96.533,33.823],[-96.504,33.774],[-96.428,33.779],[-96.364,33.692],[-96.321,33.695],[-96.296,33.764],[-96.227,33.748],[-96.177,33.76],[-96.149,33.837],[-96.098,33.831],[-96.102,33.848],[-96.048,33.837],[-95.94,33.861],[-95.937,33.887],[-95.833,33.835],[-95.8,33.861],[-95.754,33.854],[-95.757,33.892],[-95.685,33.89],[-95.599,33.934],[-95.563,33.932],[-95.538,33.88],[-95.294,33.875],[-95.255,33.903],[-95.23,33.961],[-95.133,33.937],[-95.05,33.864],[-94.971,33.862],[-94.946,33.813],[-94.871,33.746],[-94.774,33.755],[-94.709,33.687],[-94.648,33.688],[-94.645,33.668],[-94.587,33.679],[-94.519,33.617],[-94.458,33.645],[-94.458,33.599],[-94.418,33.577],[-94.386,33.582],[-94.393,33.551],[-94.357,33.544],[-94.34,33.567],[-94.311,33.551],[-94.3,33.576],[-94.225,33.553],[-94.185,33.593],[-94.142,33.578],[-94.124,33.552],[-94.103,33.57],[-94.045,33.551],[-94.042,31.992],[-94.013,31.982],[-93.973,31.92],[-93.909,31.893],[-93.876,31.822],[-93.823,31.775],[-93.83,31.746],[-93.801,31.698],[-93.826,31.661],[-93.815,31.623],[-93.841,31.599],[-93.787,31.527],[-93.74,31.522],[-93.729,31.492],[-93.751,31.469],[-93.701,31.438],[-93.704,31.411],[-93.675,31.398],[-93.665,31.356],[-93.686,31.31],[-93.643,31.27],[-93.622,31.271],[-93.6,31.174],[-93.532,31.185],[-93.553,31.097],[-93.525,31.07],[-93.518,31.024],[-93.564,31.006],[-93.568,30.978],[-93.525,30.93],[-93.557,30.911],[-93.568,30.879],[-93.553,30.825],[-93.618,30.742],[-93.629,30.68],[-93.672,30.658],[-93.679,30.6],[-93.729,30.574],[-93.74,30.539],[-93.715,30.519],[-93.697,30.441],[-93.744,30.397],[-93.765,30.333],[-93.708,30.289],[-93.704,30.243],[-93.722,30.21],[-93.69,30.142],[-93.733,30.082],[-93.701,30.065],[-93.79,29.988],[-93.815,29.921],[-93.93,29.797],[-93.837,29.679],[-94.002,29.681],[-94.135,29.647],[-94.594,29.468],[-94.695,29.416],[-94.731,29.369],[-94.785,29.375],[-94.673,29.477],[-94.594,29.492],[-94.566,29.532],[-94.533,29.518],[-94.494,29.525],[-94.548,29.572],[-94.742,29.526],[-94.77,29.548],[-94.709,29.625],[-94.695,29.694],[-94.695,29.758],[-94.738,29.762],[-94.756,29.782],[-94.817,29.757],[-94.853,29.722],[-94.867,29.679],[-94.921,29.658],[-94.943,29.698],[-95.007,29.659],[-95.014,29.629],[-94.982,29.601],[-95.018,29.558],[-94.982,29.511],[-94.91,29.497],[-94.932,29.45],[-94.892,29.433],[-94.892,29.308],[-94.921,29.282],[-94.953,29.29],[-95.1,29.174],[-95.111,29.196],[-95.158,29.189],[-95.165,29.113],[-95.144,29.091],[-94.878,29.286],[-94.824,29.306],[-94.824,29.345],[-94.731,29.332],[-95.111,29.089],[-95.384,28.866],[-95.438,28.859],[-95.811,28.665],[-96.22,28.492],[-96.342,28.418],[-96.443,28.318],[-96.719,28.164],[-96.888,28.031],[-97.003,27.908],[-97.211,27.596],[-97.297,27.427],[-97.372,27.153],[-97.376,26.972],[-97.347,26.796],[-97.197,26.306],[-97.157,26.083],[-97.182,26.123],[-97.2,26.249],[-97.283,26.542],[-97.369,26.556],[-97.304,26.579],[-97.39,26.801],[-97.401,27.115],[-97.362,27.352],[-97.304,27.507],[-97.121,27.799],[-97.128,27.839],[-97.082,27.913],[-97.017,27.946],[-96.92,28.094],[-96.82,28.144],[-96.791,28.189],[-96.734,28.191],[-96.608,28.281],[-96.525,28.323],[-96.439,28.343],[-96.454,28.38],[-96.421,28.405],[-96.454,28.418],[-96.622,28.319],[-96.683,28.315],[-96.705,28.349],[-96.705,28.4],[-96.769,28.411],[-96.791,28.384],[-96.791,28.312],[-96.809,28.29],[-96.787,28.255],[-96.802,28.224],[-96.935,28.124],[-97.028,28.149],[-97.039,28.186],[-97.154,28.133],[-97.215,28.076],[-97.139,28.057],[-97.053,28.106],[-97.024,28.042],[-97.186,27.831],[-97.229,27.829],[-97.25,27.876],[-97.326,27.868],[-97.34,27.883],[-97.455,27.874],[-97.494,27.884],[-97.516,27.851],[-97.473,27.824],[-97.38,27.838],[-97.394,27.783],[-97.369,27.742],[-97.254,27.697],[-97.322,27.571],[-97.412,27.321],[-97.484,27.298],[-97.509,27.275],[-97.548,27.291],[-97.498,27.309],[-97.487,27.359],[-97.516,27.362],[-97.642,27.271],[-97.627,27.243],[-97.541,27.23],[-97.423,27.264],[-97.466,26.809],[-97.48,26.807],[-97.444,26.609],[-97.416,26.553],[-97.412,26.481],[-97.38,26.48],[-97.279,26.271],[-97.311,26.23],[-97.297,26.201],[-97.301,26.148],[-97.272,26.086],[-97.2,26.077],[-97.197,26.047],[-97.154,26.062],[-97.146,25.953],[-97.229,25.959],[-97.276,25.952],[-97.276,25.936],[-97.351,25.925],[-97.372,25.84],[-97.444,25.85],[-97.469,25.884],[-97.523,25.887],[-97.545,25.934],[-97.584,25.938],[-97.649,26.022],[-97.76,26.032],[-97.8,26.06],[-97.861,26.053],[-97.886,26.066],[-97.968,26.052],[-97.983,26.067],[-98.029,26.066],[-98.04,26.041],[-98.076,26.068],[-98.148,26.056],[-98.176,26.075],[-98.198,26.056],[-98.248,26.073],[-98.277,26.099],[-98.266,26.12],[-98.324,26.121],[-98.334,26.159],[-98.388,26.158],[-98.464,26.223],[-98.496,26.213],[-98.586,26.255],[-98.654,26.236],[-98.754,26.325],[-98.79,26.332],[-98.797,26.36],[-98.826,26.37],[-98.891,26.358],[-98.966,26.398],[-99.009,26.395],[-99.038,26.413],[-99.081,26.396],[-99.113,26.434],[-99.092,26.477],[-99.128,26.525],[-99.167,26.536],[-99.21,26.724],[-99.239,26.746],[-99.268,26.843],[-99.329,26.88],[-99.321,26.907],[-99.368,26.929],[-99.393,26.961],[-99.375,26.978],[-99.415,27.017],[-99.447,27.023],[-99.451,27.068],[-99.429,27.095],[-99.44,27.151],[-99.426,27.176],[-99.44,27.25],[-99.497,27.272],[-99.494,27.303],[-99.537,27.313],[-99.504,27.339],[-99.487,27.413],[-99.497,27.439],[-99.483,27.491],[-99.53,27.499],[-99.512,27.565],[-99.555,27.614],[-99.58,27.602],[-99.605,27.642],[-99.637,27.626],[-99.67,27.66],[-99.705,27.655],[-99.77,27.732],[-99.802,27.742],[-99.813,27.774],[-99.842,27.766],[-99.878,27.799],[-99.878,27.842],[-99.903,27.864],[-99.892,27.9],[-99.939,27.941],[-99.932,27.981],[-99.993,27.995],[-100.018,28.065],[-100.054,28.084],[-100.082,28.144],[-100.208,28.19],[-100.222,28.235],[-100.247,28.234],[-100.294,28.284],[-100.287,28.317],[-100.348,28.403],[-100.337,28.443],[-100.37,28.477],[-100.337,28.502],[-100.38,28.511],[-100.413,28.552],[-100.398,28.585],[-100.448,28.609],[-100.445,28.638],[-100.499,28.662],[-100.513,28.705],[-100.506,28.741],[-100.535,28.763],[-100.549,28.826],[-100.571,28.827],[-100.603,28.902],[-100.632,28.903],[-100.653,28.943],[-100.649,29.009],[-100.675,29.1],[-100.775,29.174],[-100.764,29.186],[-100.797,29.247],[-100.879,29.282],[-100.886,29.308],[-100.947,29.347],[-101.012,29.369],[-101.059,29.459],[-101.152,29.477],[-101.174,29.515],[-101.256,29.521],[-101.252,29.625],[-101.27,29.63],[-101.292,29.572],[-101.313,29.595],[-101.306,29.641],[-101.367,29.664],[-101.414,29.757],[-101.443,29.753],[-101.475,29.781],[-101.522,29.759],[-101.547,29.797],[-101.576,29.774],[-101.708,29.763],[-101.777,29.79],[-101.798,29.783],[-101.852,29.802],[-101.931,29.79],[-101.974,29.81],[-102.035,29.804],[-102.049,29.785],[-102.143,29.803],[-102.182,29.846],[-102.229,29.844],[-102.301,29.878],[-102.351,29.863],[-102.387,29.767],[-102.509,29.784],[-102.541,29.752],[-102.566,29.761],[-102.645,29.734],[-102.67,29.742],[-102.699,29.696],[-102.692,29.676],[-102.738,29.642],[-102.738,29.599],[-102.764,29.599],[-102.771,29.548],[-102.81,29.522],[-102.807,29.494],[-102.832,29.444],[-102.825,29.4],[-102.843,29.358],[-102.878,29.354],[-102.907,29.26],[-102.871,29.241],[-102.889,29.209],[-102.954,29.176],[-102.99,29.183],[-103.015,29.125],[-103.101,29.058],[-103.115,28.985],[-103.28,28.982],[-103.331,29.022],[-103.428,29.042],[-103.525,29.138],[-103.611,29.166],[-103.647,29.159],[-103.726,29.192],[-103.79,29.258],[-104.038,29.32],[-104.106,29.373],[-104.145,29.383],[-104.214,29.453],[-104.214,29.473],[-104.264,29.514],[-104.339,29.52],[-104.508,29.639],[-104.54,29.676],[-104.565,29.771],[-104.68,29.924],[-104.68,29.975],[-104.705,30.024],[-104.684,30.086],[-104.687,30.18],[-104.713,30.238],[-104.752,30.264],[-104.763,30.302],[-104.809,30.335],[-104.813,30.361],[-104.86,30.39],[-104.853,30.418],[-104.899,30.57],[-104.924,30.605],[-104.967,30.608],[-105.007,30.686],[-105.061,30.686],[-105.111,30.743],[-105.154,30.752],[-105.219,30.802],[-105.262,30.798],[-105.287,30.822],[-105.398,30.856],[-105.398,30.889],[-105.556,30.991],[-105.603,31.082],[-105.743,31.165],[-105.775,31.167],[-105.782,31.198],[-105.868,31.289],[-105.94,31.319],[-105.954,31.365],[-106.005,31.393],[-106.08,31.399],[-106.206,31.466],[-106.382,31.732],[-106.45,31.765],[-106.489,31.748],[-106.547,31.807],[-106.604,31.825],[-106.601,31.844],[-106.636,31.866],[-106.647,31.899],[-106.622,31.914],[-106.618,32.001],[-103.065,32.001],[-103.065,33.042],[-103.044,33.946],[-103.044,36.501]]];
function txEdgeKm(p){ const R = TX_OUTLINE[0], k = Math.cos(p.lat*Math.PI/180); let m = Infinity;
  for(let i=0;i<R.length;i++){ const a = R[i], b = R[(i+1)%R.length]; m = Math.min(m, segDist(p.lng*k, p.lat, [a[0]*k,a[1]], [b[0]*k,b[1]])); } return m*111.2; }
const inTexasOutline = p => TX_OUTLINE.some(r=>inRings(p.lng, p.lat, [r]));
const inTexas = p => inTexasOutline(p) || txEdgeKm(p) < 3;

/* ===== Geometry (local feet around a center) ===== */
function proj(c){ const k = Math.cos(c.lat*Math.PI/180);
  return { f:([lng,lat]) => [(lng-c.lng)*Math.PI/180*R*k*FT, (lat-c.lat)*Math.PI/180*R*FT],
           i:([x,y]) => [c.lng + x/FT/R/k*180/Math.PI, c.lat + y/FT/R*180/Math.PI] }; }
// pixel size whose aspect matches the bbox in degrees; ArcGIS export widens a mismatched bbox to keep pixels square, which shifts an image stretched into our frame
function degSize(a, b, long){ const w = Math.abs(b[0]-a[0]), h = Math.abs(b[1]-a[1]); return w >= h ? [long, Math.max(1, Math.round(long*h/w))] : [Math.max(1, Math.round(long*w/h)), long]; }
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
// a tract can be one parcel or several (an assemblage); overlapping parcels are counted once
const partsOf = s => s.parts && s.parts.length ? s.parts : [s.rings];
function inTract(s, x, y){ return partsOf(s).some(rs=>inRings(x,y,rs)); }
function tractShare(s, test, n=110){ const [x0,y0,x1,y1]=bbox(s.rings), dx=(x1-x0)/n, dy=(y1-y0)/n; let tot=0, hit=0;
  for(let i=0;i<n;i++) for(let j=0;j<n;j++){ const x=x0+(i+.5)*dx, y=y0+(j+.5)*dy; if(!inTract(s,x,y)) continue; tot++; if(test(x,y)) hit++; }
  return tot ? hit/tot : 0; }
function tractArea(s){ const parts = partsOf(s); if(parts.length < 2) return polyArea(s.rings);
  const [x0,y0,x1,y1] = bbox(s.rings), n = 320, dx = (x1-x0)/n, dy = (y1-y0)/n; let hit = 0;
  for(let i=0;i<n;i++) for(let j=0;j<n;j++) if(inTract(s, x0+(i+.5)*dx, y0+(j+.5)*dy)) hit++;
  return hit*dx*dy; }
function bboxHit(a, b){ return a[0]<=b[2] && b[0]<=a[2] && a[1]<=b[3] && b[1]<=a[3]; }
function ringsIntersect(A, B){ // true when two polygons overlap or touch: a vertex inside the other, or edges crossing
  if(!bboxHit(bbox(A), bbox(B))) return false;
  for(const r of A) for(const [x,y] of r) if(inRings(x,y,B)) return true;
  for(const r of B) for(const [x,y] of r) if(inRings(x,y,A)) return true;
  for(const ra of A) for(let i=0;i<ra.length;i++){ const a=ra[i], b=ra[(i+1)%ra.length];
    for(const rb of B) for(let j=0;j<rb.length;j++) if(segsCross(a,b,rb[j],rb[(j+1)%rb.length])) return true; }
  return false; }
const touchesTract = (s, rings) => partsOf(s).some(pr=>ringsIntersect(pr, rings));
const lineToTract = (s, path) => Math.min(...partsOf(s).map(pr=>lineToPolyDist(path, pr)));
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
  // FIRM panel and its effective date (layer 3), best effort: the zone read does not depend on it
  let firm = null; try { const fp = await getJSON(CONFIG.fema.replace(/\/\d+$/,"/3") + "/query?" + qs({geometry:ptLL.join(","), geometryType:"esriGeometryPoint", inSR:4326, spatialRel:"esriSpatialRelIntersects", outFields:"FIRM_PAN,EFF_DATE", returnGeometry:false, f:"json"}), {}, 12000);
    const fa = fp.features && fp.features[0] && fp.features[0].attributes; if(fa) firm = {no:fa.FIRM_PAN||null, effMs:fa.EFF_DATE||null, eff:fa.EFF_DATE ? new Date(fa.EFF_DATE).toLocaleDateString("en-US",{year:"numeric",month:"short",day:"numeric",timeZone:"UTC"}) : null}; } catch(_){}
  return { pointZone: a ? zoneName(a) : null, panel: a && a.DFIRM_ID, firm,
    polys: feats.map(f => ({zone:zoneName(f.attributes), sfha:f.attributes.SFHA_TF==="T", floodway:/FLOODWAY/i.test(f.attributes.ZONE_SUBTY||""), ringsLL:f.geometry.rings})) };
}
function floodFlags(f){ if(!f || f.status!=="ok") return []; const out = [];
  if((f.zonesOnTract||[]).some(z=>/^V/.test(z))) out.push("Coastal high-hazard area (FEMA V zone) mapped on the tract: wave action, with stricter building rules.");
  const yrsOld = f.firm && f.firm.effMs ? (Date.now() - f.firm.effMs)/3.156e10 : null;
  if(yrsOld && yrsOld >= 10) out.push(`This FEMA map took effect in ${new Date(f.firm.effMs).getUTCFullYear()}, about ${Math.floor(yrsOld)} years ago. Development and newer studies since then may not be reflected.`);
  return out; }
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
  const a = site.P.i([x0,y0]), b = site.P.i([x1,y1]), [nx, ny] = degSize(a, b, 128).map(v=>Math.max(24, v));
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
async function fetchRoads(envLL, n){ // public road centerlines from OpenStreetMap; private and no-access ways left out
  const [w,s0,e,nn] = envLL, q = `[out:json][timeout:20];way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|road|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"]["access"!~"^(private|no)$"](${s0},${w},${nn},${e});out geom tags;`;
  const url = CONFIG.roads[(n||0) % CONFIG.roads.length] + "?data=" + encodeURIComponent(q);
  const j = await getJSON(url, {}, 22000);
  return (j.elements||[]).filter(x=>x.geometry && x.geometry.length>1).map(x=>({name:x.tags && (x.tags.name || x.tags.ref) || null, kind:x.tags && x.tags.highway, pathLL:x.geometry.map(g=>[g.lon,g.lat])})); }
const ROAD_TOUCH_FT = 100; // a centerline this close to the tract line usually means the tract fronts the road
function roadStats(s, roads){ let best = null;
  for(const r of roads){ const d = lineToTract(s, r.path); if(!best || d < best.d) best = {d, name:r.name, kind:r.kind}; }
  const touching = roads.filter(r=>lineToTract(s, r.path) <= ROAD_TOUCH_FT);
  return {roads, touches:touching.length>0, names:[...new Set(touching.map(r=>r.name).filter(Boolean))].slice(0,3), nearest:best}; }
function roadText(r, short){ if(r.touches) return short ? "Yes" + (r.names.length ? ` (${r.names[0]})` : "") : `A mapped public road runs along or into the tract${r.names.length?` (${r.names.join(", ")})`:""}`;
  const near = r.nearest ? (r.nearest.d < 1320 ? `about ${fmt(sig2(r.nearest.d),0)} ft` : `about ${fmt(r.nearest.d/5280,1)} mi`) : null;
  return short ? "No" + (near ? ` (${near})` : "") : `No mapped public road touches the tract${near?`; the nearest is ${near} away${r.nearest.name?` (${r.nearest.name})`:""}`:""}. It may be landlocked or reached by an easement`; }
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
const LAYERS = [["ghost","Faded aerial","#b9c3ca"],["aerial","Full aerial","#8a9aa5"],["contours","Lidar contours","#9a6b3c"],["flood","FEMA flood","#3a74b0"],["wet","Wetlands (NWI)","#2f8a6a"],["water","Streams","#3a9bd0"],["road","Roads (OSM)","#8c99a3"],["adj","Neighbors","#7c8790"],["power","Transmission","#c27a10"]];
const LAYER_ON = {ghost:true, aerial:false, contours:true, flood:true, wet:true, water:true, road:true, adj:true, power:true};

/* ===== Build a site object ===== */
function frameFor(rings){ const [x0,y0,x1,y1] = bbox(rings), w = x1-x0, h = y1-y0, s = Math.max(w,h), pad = Math.max(s*0.28, 180);
  const cx=(x0+x1)/2, cy=(y0+y1)/2, aspect = DW/DH; // drawing area aspect
  let fw = Math.max(w+2*pad, (h+2*pad)*aspect), fh = fw/aspect; return [cx-fw/2, cy-fh/2, cx+fw/2, cy+fh/2]; }
function newSite(o){
  const s = {id: Date.now().toString(36), layers:{}, neighbors:[], added:[], ...o};
  s.frame = frameFor(s.rings); s.areaSqft = tractArea(s); s.acres = ac(s.areaSqft);
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
  L.water = {status:"ok", ...waterStats(s, sm.streams.map(p=>({paths:[p], name:null})))};
  L.soils = {status:"ok", units:sm.soils};
  const g = synthGrid(s, sm.terrain); L.terrain = {status:"ok", grid:g, ...terrainStats(s, g)};
  const lines = sm.lines.map(l=>({kv:l.kv, paths:l.pathsFt})); L.power = {status:"ok", ...powerStats(s, lines)};
  L.juris = {status:"ok", city:null, text:sm.city};
  L.road = {status:"ok", touches:true, names:[], roads:[], nearest:null};
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
  const inSF = tractShare(s, (x,y)=>sf.some(p=>inRings(x,y,p.rings)));
  const inFW = fw.length ? tractShare(s, (x,y)=>fw.some(p=>inRings(x,y,p.rings))) : 0;
  const zones = [...new Set(polys.filter(p=>touchesTract(s, p.rings)).map(p=>p.zone))];
  return {shareSFHA:inSF, shareFloodway:inFW, zonesOnTract:zones};
}
function wetStats(s, polys){
  const share = polys.length ? tractShare(s, (x,y)=>polys.some(p=>inRings(x,y,p.rings))) : 0;
  const types = [...new Set(polys.filter(p=>touchesTract(s, p.rings)).map(p=>p.type))];
  return {share, typesOnTract:types, nearby:polys.length};
}
function waterText(wa){ const nm = wa.names && wa.names.length ? ` (${wa.names.slice(0,2).join(", ")})` : "";
  if(wa.share > 0.9) return `A mapped lake or river covers nearly all of the tract${nm}`;
  if(wa.share > 0.02) return `About ${fmt(wa.share*100,0)}% of the tract is under a mapped lake or river${nm}`;
  return wa.crossing ? `A mapped stream or water body touches the tract${nm}` : "No mapped stream or water body touches the tract"; }
function waterStats(s, items){ // streams by centerline; lakes and rivers by polygon, so a water body that covers or crosses the tract counts
  const hit = items.filter(i=>(i.paths||[]).some(p=>lineToTract(s, p)===0) || (i.rings && touchesTract(s, i.rings)));
  const bodies = items.filter(i=>i.rings && i.rings.length);
  const share = bodies.length ? tractShare(s, (x,y)=>bodies.some(b=>inRings(x,y,b.rings)), 80) : 0;
  return {items, crossing:hit.length>0, share, names:[...new Set(hit.map(i=>i.name).filter(Boolean))], nearNames:[...new Set(items.map(i=>i.name).filter(Boolean))]}; }
function gridAt(g, x, y){ const i = Math.floor((x-g.x0)/g.dx), j = Math.floor((g.ytop-y)/g.dy); if(i<0||j<0||i>=g.nx||j>=g.ny) return NaN; return g.z[j*g.nx+i]; }
function terrainStats(s, g){
  const pts = [], slopes = [];
  for(let j=1;j<g.ny-1;j++) for(let i=1;i<g.nx-1;i++){
    const x = g.x0+(i+.5)*g.dx, y = g.ytop-(j+.5)*g.dy; if(!inTract(s,x,y)) continue;
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
function lineDistText(d, short){ if(d <= 60) return short ? "Crosses or touches the tract" : "A mapped transmission line crosses or touches this tract";
  if(d < 1320) return short ? `About ${fmt(sig2(d),0)} ft away` : `Nearest mapped transmission line about ${fmt(sig2(d),0)} ft from the tract`;
  return short ? `About ${fmt(d/5280,1)} mi away` : `Nearest mapped transmission line about ${fmt(d/5280,1)} mi from the tract`; }
function powerStats(s, lines){
  let best = null;
  for(const l of lines) for(const p of l.paths){ const d = lineToTract(s, p); if(!best || d < best.d) best = {d, kv:l.kv}; }
  const within = lines.filter(l=>l.paths.some(p=>lineToTract(s, p) <= (s.powerMi||CONFIG.powerRadiusMi)*5280));
  const kvs = [...new Set(within.map(l=>l.kv).filter(Boolean))].sort((a,b)=>b-a);
  return {lines, nearest:best && best.d <= (s.powerMi||CONFIG.powerRadiusMi)*5280 ? best : null, count:within.length, kvs};
}

/* ===== Run a screen ===== */
const STEPS = [["parcel","Appraisal parcel"],["flood","FEMA floodplain"],["wet","Wetlands (NWI)"],["water","Mapped streams"],["soils","Soils (SSURGO)"],["terrain","Terrain (USGS lidar)"],["power","Transmission lines"],["juris","Jurisdiction"],["road","Road frontage (OSM)"]];
async function runLive(raw, opts={}){
  const p = await parseLocation(raw);
  if(!inTexas(p)) throw Object.assign(new Error("That point is outside Texas. This screen covers Texas land only."), {outside:true});
  const center = {lat:p.lat, lng:p.lng}, P = proj(center);
  setStatus("parcel","wait");
  let parcel;
  try { parcel = await fetchParcelAt(center); }
  catch(e){ throw new Error("The statewide parcel service didn't answer, so nothing was drawn. Try again in a minute, use Sketch a tract, or call (469) 317-0250."); }
  if(!parcel || !parcel.ringsLL.length){
    if(!inTexasOutline(center)) throw Object.assign(new Error("That point is outside Texas, or offshore. This screen covers Texas land only."), {outside:true});
    let wet = []; try { const d = 0.0004; wet = await fetchWetlands([center.lng-d, center.lat-d, center.lng+d, center.lat+d]); } catch(_){}
    const deep = wet.find(w=>/Lake|Deepwater|Riverine/i.test(w.type||"") && inRings(center.lng, center.lat, w.ringsLL));
    if(deep) throw Object.assign(new Error(`That point is open water (${deep.type.toLowerCase()} on the National Wetlands Inventory). This screen covers land. Move the pin onto the shore, or pick a nearby parcel below.`), {water:true, center});
    return siteFromPin(center, raw, p.kind); }
  const rings = parcel.ringsLL.map(r=>r.map(P.f));
  const c2 = P.i(centroid(rings)); const center2 = {lat:c2[1], lng:c2[0]}, P2 = proj(center2);
  const s = newSite({sample:false, input:raw, kind:p.kind, label:p.label, center:center2, P:P2, rings:parcel.ringsLL.map(r=>r.map(P2.f)), county:parcel.county, legal:parcel.legal, propId:parcel.propId,
    situs:parcel.situs, source:parcel.source, taxYear:parcel.taxYear, legalAcres:parcel.legalAcres, oid:parcel.oid, parcels:[parcel]});
  s.title = parcel.situs || (p.label && p.kind==="Address" ? p.label : (s.refs.addition ? s.refs.addition : "Parcel " + (parcel.propId||"")));
  s.area = (parcel.county ? titleCase(parcel.county) + " County" : "Texas");
  return s;
}
/* acreage by source: the outline we drew, the roll figure in the statewide feed, and the county record we did not read */
function acreage(s){
  if(s.sample || s.pin) return {rows:[], gap:null};
  const rows = [[s.sketch ? "Your outline (GIS)" : "Drawn outline (GIS)", s.acres]];
  const feed = s.sketch ? null : s.parcels && s.parcels.length > 1 ? (s.parcels.every(p=>p.legalAcres) ? s.parcels.reduce((t,p)=>t+p.legalAcres,0) : null) : s.legalAcres;
  if(feed) rows.push(["Roll acreage in the statewide parcel feed (TxGIO)", feed]);
  if(s.parent) rows.push(["Parent parcel, drawn (GIS)", s.parent.acres]);
  let gap = null;
  if(feed){ const d = Math.abs(s.acres-feed), r = d/Math.max(s.acres, feed);
    if(feed > s.acres*1.5) gap = `The appraisal account lists about ${acTxt(feed)} acres, more than this ${acTxt(s.acres)}-acre outline. The account may include other tracts. Figures on this screen apply to the outline only.`;
    else if(s.acres > feed*1.5) gap = `This outline draws about ${acTxt(s.acres)} acres, more than the ${acTxt(feed)} acres on the roll. Confirm which figure fits the tract you mean.`;
    else if(r > 0.03 && d >= 0.1) gap = `The figures differ by about ${fmt(r*100,0)}% (${acTxt(d)} ac). Confirm acreage from the deed or a survey before scoping work.`; }
  return {rows, gap}; }
const acreLine = s => { const a = acreage(s); return a.rows.map(([l,v])=>`${l}: ${acTxt(v)} ac`).join(" · ") + (a.rows.length ? ` · ${s.county ? titleCase(s.county)+" County" : "County"} appraisal district record: not read by this screen` : ""); };

/* a pin that misses every parcel still gets a partial screen: the point layers, read for a small circle around the pin */
const PIN_R = 300;
function siteFromPin(center, raw, kind){
  const P = proj(center), ring = Array.from({length:48}, (_,i)=>[Math.cos(i/48*2*Math.PI)*PIN_R, Math.sin(i/48*2*Math.PI)*PIN_R]);
  const s = newSite({sample:false, pin:true, input:raw, kind, center, P, rings:[ring], county:null, legal:null, propId:null, situs:null, source:"No parcel matched", parcels:[], oid:null});
  s.title = "No parcel at this pin"; s.area = "Texas"; return s; }
function siteFromSketch(ringFt, base){
  const P = base.P, ringLL = ringFt.map(P.i), c2 = P.i(centroid([ringFt])), center = {lat:c2[1], lng:c2[0]}, P2 = proj(center);
  const s = newSite({sample:false, sketch:true, input:"sketch", kind:"Sketched outline", center, P:P2, rings:[ringLL.map(P2.f)], county:base.county, legal:null, propId:null, situs:null, source:"Outline sketched on this page", parcels:[]});
  s.title = "Sketched tract"; s.area = base.area || "Texas"; s.sketchLL = ringLL;
  if(!base.sample && !base.pin && base.parcels && base.parcels.length) s.parent = {propId:base.propId, situs:base.situs, acres:base.acres, title:base.title, legal:base.legal};
  s.confirm = "part"; return s;
}
const yrs = (a,b) => { const y1 = a ? new Date(a).getUTCFullYear() : null, y2 = new Date(b).getUTCFullYear(); return y1 && y1 !== y2 ? y1 + "–" + y2 : String(y2); };
const titleCase = t => String(t||"").toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());

async function screenLayers(s, only){
  const L = s.layers, ringsLL = s.rings.map(r=>r.map(s.P.i));
  const [x0,y0,x1,y1] = s.frame, a = s.P.i([x0,y0]), b = s.P.i([x1,y1]), env = [a[0],a[1],b[0],b[1]];
  const c = s.center, toFt = rr => rr.map(r=>r.map(s.P.f));
  const job = async (key, fn) => { if(only && !only.includes(key)) return; setStatus(key,"wait"); L[key] = {status:"wait"}; renderReadout(s);
    for(let n = 0; ; n++){ try { const r = await fn(n); L[key] = {...r, status:r._status||"ok"}; break; }
      catch(e){ const msg = String(e.message||e), final = /no elevation cells/.test(msg);
        if(final || n >= 2 || s !== current){ L[key] = {status:"fail", err:msg}; break; }
        await new Promise(r=>setTimeout(r, 800 * 2**n + Math.random()*500)); } }
    if(s !== current) return; setStatus(key, L[key].status==="none" ? "na" : L[key].status); renderReadout(s); drawSheet(s); renderInsights(s); if(key==="adj") renderMatch(s); };
  const tasks = [
    job("flood", async()=>{ const f = await fetchFlood(env, [c.lng,c.lat]); const polys = f.polys.map(p=>({...p, rings:toFt(p.ringsLL)}));
      // an empty answer means no FEMA map here, which is not the same as outside the floodplain
      if(!polys.length && !f.pointZone) return {_status:"none", polys:[], noneText:"FEMA returned no flood map for this area. Unmapped is not the same as outside the floodplain.", firm:f.firm};
      return {polys, pointZone:f.pointZone, panel:f.panel, firm:f.firm, ...floodStats(s, polys)}; }),
    job("wet", async()=>{ const w = await fetchWetlands(env); const polys = w.map(p=>({...p, rings:toFt(p.ringsLL)})); return {polys, ...wetStats(s, polys)}; }),
    job("water", async()=>{ const w = await fetchWater(env); const items = w.map(i=>({name:i.name, paths:i.paths?toFt(i.paths):null, rings:i.ringsLL?toFt(i.ringsLL):null}));
      return waterStats(s, items); }),
    job("soils", async()=>({units: await fetchSoils(ringsLL)})),
    job("terrain", async()=>{ const g = await fetchTerrain(s); const st = terrainStats(s, g); if(!st.ok) throw new Error("no elevation cells on the tract"); return {grid:g, ...st}; }),
    job("power", async()=>{ s.powerMi = (TYPE==="dc" || s.acres >= 40) ? 5 : CONFIG.powerRadiusMi; const lines = (await fetchLines(c, s.powerMi)).map(l=>({kv:l.kv, status:l.status, paths:toFt(l.pathsLL)})); return powerStats(s, lines); }),
    job("juris", async()=>fetchCity(c)),
    job("road", async(n)=>{ const r = await fetchRoads(env, n); return roadStats(s, r.map(x=>({...x, path:x.pathLL.map(s.P.f)}))); }),
    job("adj", async()=>{ if(s.sketch) return {items:[]}; const pad = 0.15, w = b[0]-a[0], h = b[1]-a[1];
      const nb = await fetchNeighbors([a[0]+w*pad, a[1]+h*pad, b[0]-w*pad, b[1]-h*pad], s.oid);
      const ids = new Set(s.parcels.map(p=>p.oid));
      return {items: nb.filter(n=>!ids.has(n.oid)).slice(0,220).map(n=>({...n, rings:toFt(n.ringsLL)}))}; })
  ];
  await Promise.all(tasks);
}

/* ===== Status / readout ===== */
function stateOf(s, key){ if(key==="parcel") return "ok"; const l = s.layers[key]; return !l ? "wait" : l.status==="ok" ? "ok" : l.status==="wait" ? "wait" : l.status==="na" || l.status==="none" ? "off" : "na"; }
const RO_META = {parcel:["pen","TxGIO StratMap","#ff6a5e"],flood:["wave","FEMA NFHL","#5ab0ff"],wet:["drop","USFWS NWI","#5fd3a8"],water:["drop","USGS NHD","#4fb6e8"],soils:["layers","NRCS SSURGO","#c9a36b"],terrain:["contour","USGS 3DEP","#e0a33b"],power:["bolt","HIFLD","#f0b35a"],juris:["sheet","TxGIO","#b9a7ff"],road:["road","OpenStreetMap","#9fb3c2"]};
let RO_S = null; const RO_PREV = {};
function roMeter(k){ const s = RO_S; if(!s) return null; const L = s.layers, ok = x => L[x] && L[x].status==="ok";
  if(k==="flood" && ok("flood")) return {v:L.flood.shareSFHA, lab:`${fmt(L.flood.shareSFHA*100,0)}% in mapped 1%`};
  if(k==="wet" && ok("wet")) return {v:L.wet.share, lab:`${fmt(L.wet.share*100,1)}% mapped`};
  if(k==="soils" && ok("soils") && L.soils.units[0]) return {v:L.soils.units[0].share, lab:`main unit ~${fmt(L.soils.units[0].share*100,0)}%`};
  if(k==="terrain" && ok("terrain")) return {v:Math.min(1,(L.terrain.meanSlope||0)/10), lab:`avg slope ${fmt(L.terrain.meanSlope,1)}% of a 10% scale`};
  return null; }
/* each record row carries a small plat-style thumbnail drawn from that layer's own data on this tract */
function roThumb(k, st){
  const s = RO_S; if(!s || !s.rings || !s.rings.length) return "";
  s._th = s._th || {}; const L = s.layers, key = [k, st, L[k] ? L[k].status : "", s.rings.length, s.rings.reduce((t,r)=>t+r.length,0), Math.round(s.areaSqft||0), s.added ? s.added.length : 0].join("|");
  if(s._th[key]) return s._th[key];
  const N = 52, [x0,y0,x1,y1] = bbox(s.rings), span = Math.max(x1-x0, y1-y0) * (k==="power" ? 4 : 1.7) || 600, cx = (x0+x1)/2, cy = (y0+y1)/2;
  const X = x => ((x-cx)/span + .5) * N, Y = y => (.5 - (y-cy)/span) * N;
  const P = (rings, close=true) => rings.map(r=>r.map((q,i)=>(i?"L":"M")+X(q[0]).toFixed(1)+" "+Y(q[1]).toFixed(1)).join("")+(close?"Z":"")).join("");
  const c = (RO_META[k]||[])[2] || "#9aabb9", ok = L[k] && L[k].status==="ok", id = "th"+k+s.id, o = [];
  o.push(`<defs><clipPath id="${id}"><rect width="${N}" height="${N}" rx="9"/></clipPath><pattern id="${id}h" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V4" stroke="${c}" stroke-width="1.2" opacity=".8"/></pattern></defs>`);
  o.push(`<g clip-path="url(#${id})"><rect width="${N}" height="${N}" fill="#0b1219"/><path d="M13 0V${N}M26 0V${N}M39 0V${N}M0 13H${N}M0 26H${N}M0 39H${N}" stroke="rgba(255,255,255,.05)"/>`);
  let tractFill = "rgba(255,255,255,.06)";
  if(ok && k==="flood") for(const p of L.flood.polys.filter(p=>p.sfha)) o.push(`<path d="${P(p.rings)}" fill="url(#${id}h)" fill-rule="evenodd" stroke="${c}" stroke-width=".8"/>`);
  if(ok && k==="wet") for(const p of L.wet.polys) o.push(`<path d="${P(p.rings)}" fill="url(#${id}h)" fill-rule="evenodd" stroke="${c}" stroke-width=".8"/>`);
  if(ok && k==="water") for(const i of L.water.items){ if(i.paths) o.push(`<path d="${P(i.paths,false)}" fill="none" stroke="${c}" stroke-width="1.6"/>`); if(i.rings) o.push(`<path d="${P(i.rings)}" fill="${c}" fill-opacity=".3"/>`); }
  if(ok && k==="road") for(const r of L.road.roads) o.push(`<path d="${P([r.path],false)}" fill="none" stroke="${c}" stroke-width="1.6"/>`);
  if(ok && k==="power") for(const l of L.power.lines) o.push(`<path d="${P(l.paths,false)}" fill="none" stroke="${c}" stroke-width="1.4" stroke-dasharray="5 2 1 2"/>`);
  if(ok && k==="terrain" && L.terrain.grid){ const g = L.terrain.grid, fr = frameRelief(g), iv = [1,2,5,10,20,50,100].find(v => fr/v <= 9) || 100;
    const d = contourSegs(g, iv).map(q=>`M${X(q[0]).toFixed(1)} ${Y(q[1]).toFixed(1)}L${X(q[2]).toFixed(1)} ${Y(q[3]).toFixed(1)}`).join(""); o.push(`<path d="${d}" stroke="${c}" stroke-width=".7" fill="none" opacity=".9"/>`); }
  if(ok && k==="soils") tractFill = `url(#${id}h)`;
  if(ok && k==="flood" && L.flood.shareSFHA <= 0.005) tractFill = "rgba(67,194,138,.18)";
  o.push(`<path d="${P(s.rings)}" fill="${k==="parcel"?"rgba(208,49,45,.28)":tractFill}" fill-rule="evenodd" stroke="#fff" stroke-width="1.3" stroke-linejoin="round"/>`);
  if(k==="parcel") for(const r of s.rings) for(const q of r.slice(0,-1).slice(0,40)) o.push(`<circle cx="${X(q[0]).toFixed(1)}" cy="${Y(q[1]).toFixed(1)}" r="1.3" fill="#ff8a7f"/>`);
  if(k==="juris" && ok){ const nm = (L.juris.name || "ETJ").replace(/^city of /i,"").slice(0,4).toUpperCase(); o.push(`<rect x="3" y="3" width="${N-6}" height="${N-6}" rx="6" fill="none" stroke="${c}" stroke-dasharray="3 2" opacity=".8"/><text x="${N/2}" y="${N-6}" text-anchor="middle" font-family="IBM Plex Mono,monospace" font-size="7" fill="${c}">${esc(nm)}</text>`); }
  if(st==="wait") o.push(`<rect class="th-scan" x="-20" y="0" width="16" height="${N}" fill="${c}" opacity=".25"/>`);
  o.push(`<path d="M${N-9} 5l2 4h-4z" fill="rgba(255,255,255,.5)"/></g>`);
  return s._th[key] = `<svg class="ro-th" viewBox="0 0 ${N} ${N}" width="${N}" height="${N}" aria-hidden="true">${o.join("")}</svg>`;
}
function readoutRow(k, label, value, sub, st){
  const [ico, src, c] = RO_META[k] || ["sheet","",""], m = roMeter(k), sig = value + "|" + st, fresh = RO_PREV[k] !== undefined && RO_PREV[k] !== sig && st==="ok"; RO_PREV[k] = sig;
  return `<li class="ro ${st}${fresh?" fresh":""}" style="--c:${c}"><span class="ro-ico" aria-hidden="true">${roThumb(k, st) || `<svg viewBox="0 0 24 24">${WF_ICO[ico]}</svg>`}<span class="st ${st}"></span></span><div class="ro-body"><div class="ro-k">${esc(label)}<span class="ro-src">${esc(src)}</span></div><div class="ro-v">${value}</div>${m?`<div class="ro-m" title="${esc(m.lab)}"><i style="width:${Math.max(2,Math.round(m.v*100))}%"></i></div>`:""}${sub?`<div class="ro-s">${sub}</div>`:""}</div></li>`; }
function failText(l){ return !l || l.status==="wait" ? "Still loading…" : l.status==="none" ? (l.noneText || "Nothing mapped here.") : l.status==="fail" ? "Not available. The public service didn't answer, so this layer is left off. Nothing was assumed." : ""; }
async function retryMissing(){ const s = current; if(!s) return; const keys = STEPS.map(x=>x[0]).filter(k=>k!=="parcel" && s.layers[k] && s.layers[k].status==="fail");
  if(s.layers.adj && s.layers.adj.status==="fail") keys.push("adj"); if(!keys.length) return; toast("Asking the public services again…");
  await screenLayers(s, keys); if(s===current){ renderBrief(s); renderReadout(s); renderInsights(s); } }
function renderRetry(s){ const b = $("#retryBox"); if(!b) return; const miss = STEPS.filter(([k])=>k!=="parcel" && s.layers[k] && s.layers[k].status==="fail");
  b.hidden = !miss.length || s.sample; if(miss.length) $("#retryTxt").textContent = `${miss.length===1?"One public service":miss.length+" public services"} didn't answer: ${miss.map(x=>x[1]).join(", ")}.`; }
function renderReadout(s){
  RO_S = s; renderRetry(s); const L = s.layers, rows = [];
  const parcelSub = s.sample ? "Illustrative sample, not a real parcel" : s.pin ? `Layers are read for ${PIN_R} ft around your pin. Pick a parcel or sketch the tract for a full screen.` : s.sketch ? (s.parent ? `Your outline, part of appraisal parcel ${esc(s.parent.propId||"")}` : "Your sketched outline") : `Appraisal record ${s.propId?("#"+esc(s.propId)):""} &middot; ${esc(titleCase(s.source||""))}${s.taxYear?(" "+esc(s.taxYear)):""}`;
  rows.push(readoutRow("parcel", s.pin ? "No parcel matched" : s.added.length ? "Assemblage" : "Parcel", s.pin ? "Partial screen around the pin" : `${acTxt(s.acres)} acres <span class="opt">(drawn, approx.)</span>`, parcelSub + (acreage(s).rows.length > 1 ? " &middot; " + esc(acreage(s).rows.slice(1).map(([l,v])=>`${l.replace(/ \(.*\)$/,"")}: ${acTxt(v)} ac`).join(" · ")) : "") + (acreage(s).gap ? `<span class="ro-gap">${esc(acreage(s).gap)}</span>` : ""), s.pin ? "off" : "ok"));
  const f = L.flood; rows.push(readoutRow("flood","FEMA floodplain", f && f.status==="ok" ? (f.shareSFHA>0.005 ? `About ${fmt(f.shareSFHA*100,0)}% in the mapped 1% annual-chance floodplain` : "Outside the mapped 1% annual-chance floodplain") : esc(failText(f)),
    f && f.status==="ok" ? (f.shareSFHA>0.005 ? `Approximately ${fmt((1-f.shareSFHA)*100,0)}% of the tract is outside mapped floodplain${f.shareFloodway>0.005?`; about ${fmt(f.shareFloodway*100,0)}% in mapped floodway`:""}. ` : "") + "From an aligned FEMA map overlay, not an elevation survey." + (f.firm && f.firm.eff && !s.sample ? ` FEMA map effective ${f.firm.eff}.` : "") + floodFlags(f).map(x=>`<span class="ro-gap">${esc(x)}</span>`).join("") : "", stateOf(s,"flood")));
  const w = L.wet; rows.push(readoutRow("wet","Wetlands (NWI)", w && w.status==="ok" ? (w.share>0.002 ? `About ${fmt(w.share*100,1)}% mapped as wetland or water` : w.nearby ? "None mapped on the tract; some nearby" : "None mapped on or near the tract") : esc(failText(w)),
    w && w.status==="ok" && w.typesOnTract.length ? esc(w.typesOnTract.join(", ")) + ". A mapped indicator, not a delineation." : w && w.status==="ok" ? "A mapped indicator, not a delineation." : "", stateOf(s,"wet")));
  const wa = L.water; rows.push(readoutRow("water","Streams and water bodies", wa && wa.status==="ok" ? esc(waterText({...wa, names:[]})) : esc(failText(wa)), wa && wa.status==="ok" && wa.names && wa.names.length ? esc(wa.names.slice(0,2).join(", ")) : "", stateOf(s,"water")));
  const so = L.soils; rows.push(readoutRow("soils","Soils (SSURGO)", so && so.status==="ok" ? (so.units.length ? esc(mainSoil(so.units)) : "No soil map units returned") : esc(failText(so)),
    so && so.status==="ok" && so.units.length ? `${so.units.length} map unit${so.units.length>1?"s":""}. Hydrologic group ${esc(so.units[0].hyd||"n/a")}. A screening hint, not a geotechnical report.` : "", stateOf(s,"soils")));
  const t = L.terrain; rows.push(readoutRow("terrain","Terrain (public lidar)", t && t.status==="ok" ? `${fmt(t.relief,0)} ft of relief, average slope ~${fmt(t.meanSlope,1)}%` : esc(failText(t)),
    t && t.status==="ok" ? `${t.fallDir ? "Ground generally falls toward the " + t.fallDir + ". " : "Nearly level overall. "}Approximate, from USGS 3DEP. Not a design topo.` : "", stateOf(s,"terrain")));
  const pw = L.power; rows.push(readoutRow("power","Transmission lines", pw && pw.status==="ok" ? (pw.nearest ? lineDistText(pw.nearest.d) : `None mapped within ${s.powerMi||CONFIG.powerRadiusMi} miles`) : esc(failText(pw)),
    pw && pw.status==="ok" && pw.nearest ? `${pw.nearest.kv ? fmt(pw.nearest.kv,0)+" kV class. " : ""}Proximity only. Says nothing about available capacity.` : pw && pw.status==="ok" ? "Proximity only." : "", stateOf(s,"power")));
  const j = L.juris; rows.push(readoutRow("juris","Jurisdiction", j && j.status==="ok" ? (j.text ? esc(j.text) : j.name ? "City of " + esc(j.name) : "Outside mapped city limits") : esc(failText(j)),
    j && j.status==="ok" ? (j.name ? "Zoning is set by the city. This is a mapped limit, not a zoning finding." : "Could still sit in a city's ETJ, which controls platting. Check with the county and nearby cities.") : "", stateOf(s,"juris")));
  const rd = L.road; rows.push(readoutRow("road","Road frontage", rd && rd.status==="ok" ? esc(roadText(rd)) : esc(failText(rd)),
    rd && rd.status==="ok" ? "From OpenStreetMap road lines. A mapped road is not legal access; frontage, right-of-way and easements are confirmed by title and survey." : "", stateOf(s,"road")));
  $("#readout").innerHTML = rows.join("");
  const adjBox = $("#adjBox"), A = L.adj;
  adjBox.hidden = s.sample || s.sketch || s.pin;
  if(!adjBox.hidden){
    $("#adjText").innerHTML = s.added.length ? `This screen covers ${s.parcels.length} appraisal parcels, about ${acTxt(s.acres)} acres combined. Click a highlighted parcel to drop it, or a neighbor to add it.`
      : A && A.status==="ok" ? `Click a neighboring parcel on the sheet to add it. Layers recompute for the combined outline.`
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
  return ["PRELIMINARY SITE SCREEN", String(s.title||"Site").toUpperCase(), (s.pin ? `NO PARCEL MATCHED · ${PIN_R}-FT RADIUS AT PIN` : `BEING ${acTxt(s.acres)} ACRES ±`), rec || abs || (s.sample ? "ILLUSTRATIVE SAMPLE TRACT" : s.pin ? "PARTIAL SCREEN, NOT A PARCEL" : s.sketch ? "SKETCHED OUTLINE" : "APPRAISAL PARCEL"), city + cty].map(t=>t.length>58?t.slice(0,56)+"…":t);
}
function drawSheet(s){
  if(!s) return; const svg = $("#sheet"), T = sheetXform(s), L = s.layers, o = [];
  const [x0,y0,x1,y1] = s.frame, seen = s._seen || (s._seen = new Set());
  const fx = k => { if(seen.has(k)) return ""; seen.add(k); return ' class="fx"'; };
  o.push(`<defs><filter id="fGhost"><feColorMatrix type="saturate" values="0.15"/></filter>
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
  const ghostOn = LAYER_ON.ghost && !aerialOn && !s.sample;
  if(aerialOn || ghostOn){ const a = s.P.i([x0,y0]), b = s.P.i([x1,y1]);
    const url = CONFIG.imagery + "?" + qs({bbox:[a[0],a[1],b[0],b[1]].join(","), bboxSR:4326, imageSR:4326, size:degSize(a,b,1400).join(","), format:"jpg", f:"image"});
    o.push(aerialOn ? `<image href="${esc(url)}" x="${DX}" y="${DY}" width="${DW}" height="${DH}" preserveAspectRatio="none" opacity=".62"/>`
      : `<image href="${esc(url)}" x="${DX}" y="${DY}" width="${DW}" height="${DH}" preserveAspectRatio="none" opacity=".3" filter="url(#fGhost)"/>`); }
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
  const rd = L.road;
  if(LAYER_ON.road && rd && rd.status==="ok" && rd.roads.length){ o.push(`<g${fx("road")}>`); for(const r of rd.roads) o.push(`<path d="${pathOf([r.path],T,false)}" fill="none" stroke="${aerialOn?"#f4d58d":"#8c99a3"}" stroke-width="1.1" stroke-dasharray="10 3" pointer-events="none"/>`); o.push(`</g>`); }
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
  const probe = !!s.pin;
  if(probe){ o.push(`<path d="${pathOf(s.rings,T)}" fill="rgba(208,49,45,.05)" stroke="#921A1D" stroke-width="1.4" stroke-dasharray="5 4" pointer-events="none"/>`); const px = T.X(0), py = T.Y(0); o.push(`<path d="M${px-9} ${py}H${px+9}M${px} ${py-9}V${py+9}" stroke="#921A1D" stroke-width="1.6"/><circle cx="${px}" cy="${py}" r="3.2" fill="none" stroke="#921A1D" stroke-width="1.2"/>`); }
  if(!probe) o.push(`<path d="${pathOf(s.rings,T)}" fill="${aerialOn?"rgba(146,26,29,.16)":"rgba(208,49,45,.12)"}" fill-rule="evenodd" stroke="${aerialOn?"#fff":"#111"}" stroke-width="2.6" stroke-linejoin="round" class="tract"/>`);
  if(aerialOn && !probe) o.push(`<path d="${pathOf(s.rings,T)}" fill="none" stroke="#921A1D" stroke-width="1.2" pointer-events="none"/>`);
  if(s.added.length) for(const p of s.parcels) o.push(`<path class="adjp sel" data-oid="${esc(p.oid)}" d="${pathOf(p.ringsLL.map(r=>r.map(s.P.f)),T)}" fill="rgba(146,26,29,.001)" stroke="#921A1D" stroke-width=".9" stroke-dasharray="3 3"/>`);
  { const [cx,cy] = interiorPoint(s.rings), lc = aerialOn ? "#fff" : ink, ls = aerialOn ? "#111" : halo;
  const lbl = s.pin ? ["AREA READ AROUND YOUR PIN", `${PIN_R}-FT RADIUS · NOT A PARCEL`] : [`${acTxt(s.acres)} ACRES ±`, `(${fmt(sig2(s.areaSqft),0)} SQ. FT. ±)`, s.sample ? "SAMPLE TRACT" : s.sketch ? "SKETCHED OUTLINE" : s.added.length ? "APPRAISAL PARCELS (COMBINED)" : "APPRAISAL PARCEL"];
  const r = s.refs || {}; if(r.lot || r.block) lbl.push([r.lot&&"LOT "+r.lot, r.block&&"BLOCK "+r.block].filter(Boolean).join(", ")); if(s.propId && !s.added.length) lbl.push("APPRAISAL ID " + s.propId);
  o.push(`<text x="${T.X(cx).toFixed(1)}" y="${(T.Y(cy)-lbl.length*5).toFixed(1)}" font-family="${SF}" text-anchor="middle" fill="${lc}" paint-order="stroke" stroke="${ls}" stroke-width="3" pointer-events="none">${lbl.map((l,i)=>`<tspan x="${T.X(cx).toFixed(1)}" dy="${i?12:0}" font-size="${i===0?12.5:8.6}" font-weight="${i===0?600:400}">${esc(l)}</tspan>`).join("")}</text>`); }
  if(SKETCH && SKETCH.pts.length){ o.push(`<path d="${pathOf([SKETCH.pts],T,SKETCH.pts.length>2)}" fill="rgba(146,26,29,.12)" stroke="#921A1D" stroke-width="2" stroke-dasharray="6 3"/>`);
    for(const p of SKETCH.pts) o.push(`<circle cx="${T.X(p[0])}" cy="${T.Y(p[1])}" r="4" fill="#921A1D"/>`); }
  o.push(`<g transform="translate(${DX+DW/2} ${DY+DH/2}) rotate(-30)" font-family="${SF}" font-weight="600" text-anchor="middle" fill="${aerialOn?"#fff":"#921A1D"}" opacity="${aerialOn?.22:.09}" pointer-events="none"><text font-size="64" y="-12" letter-spacing="10">PRELIMINARY</text><text font-size="38" y="40" letter-spacing="12">NOT A SURVEY</text></g>`);
  o.push(`<g pointer-events="none"><rect x="${DX+8}" y="${DY+8}" width="318" height="17" rx="2" fill="#fff" stroke="#921A1D" stroke-width=".8"/><text x="${DX+16}" y="${DY+20}" font-family="${SF}" font-size="8.6" font-weight="600" fill="#921A1D" letter-spacing=".6">PRELIMINARY PUBLIC-RECORD SCREEN · NOT A SURVEY · ${esc(today().toUpperCase())}</text></g>`);
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
    const url = CONFIG.vicinity + "?" + qs({bbox:[a[0],a[1],b[0],b[1]].join(","), bboxSR:4326, imageSR:4326, size:degSize(a,b,Math.round(Math.max(vw,vh)*3)).join(","), format:"png", f:"image"});
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
  else if(s.pin) para(`No appraisal parcel was found at the pin (${s.center.lat.toFixed(6)}, ${s.center.lng.toFixed(6)}). Layers were read for a ${PIN_R}-ft radius around it. This is not a tract.`);
  else if(s.sketch) para(s.parent ? `Outline sketched on the Site Screen page, part of appraisal parcel ${s.parent.propId||""} (${acTxt(s.parent.acres)} ac drawn). No record is attached to the outline itself.` : "Outline sketched on the Site Screen page. No appraisal record is attached to it.");
  else { para(s.legal ? String(s.legal) : "No legal description on the appraisal roll for this parcel.");
    y += 2; para([s.propId && "Appraisal ID " + s.propId, s.county && titleCase(s.county) + " County", s.taxYear && "Tax year " + s.taxYear].filter(Boolean).join(" · ")); }
  if(!s.sample && !s.pin){ const a = acreage(s); y += 2; para("ACREAGE BY SOURCE: " + a.rows.map(([l,v])=>`${l} ${acTxt(v)} ac`).join("; ") + "; county appraisal record not read."); if(a.gap){ y += 1; para("NOTE: " + a.gap); } }
  y += 6; widen();
  head("GENERAL NOTES"); widen();
  const lid = t && t.grid && t.grid.lidar;
  const gn = [
    "This sheet assembles public data. No field work was performed and nothing shown was located on the ground.",
    "Tract lines come from county appraisal mapping (TxGIO StratMap), drawn for tax purposes. They can be off by tens of feet and are not a boundary.",
    t && t.status==="ok" ? `Contours are generated from USGS 3DEP public lidar${lid&&lid.project&&!s.sample?` (${lid.project}${lid.end?", "+yrs(lid.start,lid.end):""})`:""} at a ${s._contourIv||"–"}-ft interval and are approximate. Not a design topographic survey.` : t && t.status==="wait" ? "Public lidar was still loading when this sheet was drawn." : "Public lidar was not available for this sheet.",
    "Positions are geographic (WGS 84) from public map services. No survey datum, coordinate system or survey basis is established.",
    "Transmission lines (HIFLD) show proximity only. They say nothing about capacity, service, cost or timing."];
  gn.forEach((g,i)=>{ num(i+1, g); widen(); });
  y += 4; widen();
  head("FLOOD STATEMENT");
  if(f && f.status==="ok"){ const pin = f.shareSFHA, zones = f.zonesOnTract.length ? f.zonesOnTract.join(", ") : "X (minimal)";
    para(`According to the FEMA National Flood Hazard Layer${f.panel&&!s.sample?` (study ${f.panel}${f.firm&&f.firm.no?`, FIRM panel ${f.firm.no}`:""}${f.firm&&f.firm.eff?`, effective ${f.firm.eff}`:""})`:""}, queried ${today()}, ${pin>0.005?`approximately ${fmt(pin*100,0)}% of this tract lies within the mapped 1% annual-chance floodplain and approximately ${fmt((1-pin)*100,0)}% lies outside mapped floodplain`:`this tract lies outside the mapped 1% annual-chance floodplain`}. Zones touching the tract: ${zones}.${f.shareFloodway>0.005?` About ${fmt(f.shareFloodway*100,0)}% is in mapped floodway.`:""} Percentages are an approximation from an aligned FEMA map overlay, not an on-the-ground elevation survey. This statement does not imply that the property will or will not be free from flooding.`); for(const x of floodFlags(f)) para(x); }
  else para(f && f.status==="none" ? "FEMA returned no flood map for this area. Unmapped is not the same as outside the floodplain; no flood statement is made." : f && f.status==="fail" ? "The FEMA service did not answer, so no flood statement is made." : "FEMA flood data was still loading when this sheet was drawn; no flood statement is made.");
  y += 6; widen();
  head("SITE DATA (APPROXIMATE, PUBLIC SOURCES)");
  const sd = [];
  if(t && t.status==="ok") sd.push(`Ground about ${fmt(t.min,0)} to ${fmt(t.max,0)} ft (${fmt(t.relief,0)} ft relief), average slope about ${fmt(t.meanSlope,1)}%${t.fallDir?`, falling generally ${t.fallDir}`:""}.`);
  if(w && w.status==="ok") sd.push(w.share>0.002 ? `About ${fmt(w.share*100,1)}% mapped as NWI wetland or water. Not a delineation.` : "No NWI wetland mapped on the tract.");
  if(wa && wa.status==="ok") sd.push(waterText(wa) + ".");
  if(so && so.status==="ok" && so.units.length) sd.push(`Main soil: ${so.units[0].name.split(",")[0]} (~${fmt(so.units[0].share*100,0)}%, hydrologic group ${so.units[0].hyd||"n/a"}).`);
  if(pw && pw.status==="ok") sd.push(pw.nearest ? lineDistText(pw.nearest.d) + "." : `No transmission line mapped within ${s.powerMi||CONFIG.powerRadiusMi} mi.`);
  const rd = L.road; if(rd && rd.status==="ok") sd.push(roadText(rd) + ". Access not verified.");
  if(j && j.status==="ok") sd.push(j.text ? j.text : j.name ? `Inside mapped city limits of ${titleCase(j.name)}. Not a zoning finding.` : "Outside mapped city limits; an ETJ may still apply.");
  if(!s.sample){ const miss = STEPS.filter(([k])=>k!=="parcel" && L[k] && L[k].status==="fail").map(x=>x[1]), wait = STEPS.filter(([k])=>k!=="parcel" && (!L[k] || L[k].status==="wait")).map(x=>x[1]);
    if(miss.length) sd.push(`Not available when drawn: ${miss.join(", ")}. Nothing was assumed for these.`); if(wait.length) sd.push(`Still loading when drawn: ${wait.join(", ")}.`); }
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
      meta.push({z, xs, ys, shade, inT:inTract(s,mx,my), inF:fl.some(p=>inRings(mx,my,p.rings)), zr:((z[0]+z[2])/2 - t.min)/(t.relief||1)}); }
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
  none:{name:"Compare first, survey when the site moves forward", key:"unsure"}
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
    <p>${near ? lineDistText(near.d) + (near.kv?` (${fmt(near.kv,0)} kV class)`:"") + "." : `No transmission line is mapped within ${s.powerMi||CONFIG.powerRadiusMi} miles.`} ${pw.count>1?`${pw.count} mapped lines fall within ${s.powerMi||CONFIG.powerRadiusMi} miles${pw.kvs.length?`, ${pw.kvs.map(k=>fmt(k,0)+" kV").join(", ")} classes`:""}.`:""}</p>
    <p>A nearby line is not capacity. Whether the grid can take a new load, when, and at what cost is answered by the transmission provider and ERCOT through the large-load interconnection process, not by a map. For large loads, PUCT rules require a study fee and financial security before a request is studied.</p>
    <p><a href="${CONFIG.ercotPlanning}" target="_blank" rel="noopener">ERCOT regional planning filings</a> &middot; <a href="${CONFIG.puctLargeLoad}" target="_blank" rel="noopener">PUCT large-load rule (16 TAC §25.194)</a></p>
    ${pw.nearest && pw.nearest.d < 300 ? "<p>A line this close usually means a recorded transmission easement on or next to the tract. Its width and restrictions come from the recorded instrument, located by survey.</p>" : ""}</div>`;
}
const KEYOF = {Parcel:"parcel", Floodplain:"flood", Wetlands:"wet", Streams:"water", Soils:"soils", Terrain:"terrain", Transmission:"power", Jurisdiction:"juris", "Road access":"road"};
function renderBrief(s){ if(s===current) setTimeout(updRec, 0);
  const L = s.layers, rec = recommend(s), rows = [];
  const row = (k, finding, limit, src, st) => rows.push(`<tr><td class="k">${k}</td><td>${st==="ok"?finding:`<span class="na">${st==="wait"?"Loading.":st==="none"?"Nothing mapped.":"Not available."}</span> ${esc(failText(L[KEYOF[k]]))}`}<div class="limit">${limit}</div></td><td class="src">${src}</td></tr>`);
  const st = k => L[k] ? L[k].status : "wait";
  row("Parcel", s.pin ? `No appraisal parcel at the pin (${s.center.lat.toFixed(6)}, ${s.center.lng.toFixed(6)}). The layers below were read for ${PIN_R} ft around it; they describe that circle, not a tract.` : `${s.sample?acTxt(s.acres)+" acres (illustrative)":esc(acreLine(s))}.${acreage(s).gap?` <b>${esc(acreage(s).gap)}</b>`:""} ${s.legal?esc(s.legal):""}${s.parent?` Outline is part of appraisal parcel ${esc(s.parent.propId||"")}.`:""}`, "An appraisal map, drawn for taxes. Lines can be off by tens of feet. Not a boundary. Acreage by source; the county appraisal district's own record was not read.", s.sample?"Illustrative sample":esc(s.pin?"TxGIO StratMap Land Parcels (no match)":`TxGIO StratMap Land Parcels, from ${titleCase(s.source||"county appraisal district")}${s.taxYear?", tax year "+s.taxYear:""}`), "ok");
  const f = L.flood; row("Floodplain", f&&f.status==="ok"?`${f.shareSFHA>0.005?`About ${fmt(f.shareSFHA*100,0)}% inside the mapped 1% annual-chance floodplain; approximately ${fmt((1-f.shareSFHA)*100,0)}% outside mapped floodplain.`:"Outside the mapped 1% annual-chance floodplain."}${f.shareFloodway>0.005?` About ${fmt(f.shareFloodway*100,0)}% in mapped floodway.`:""} Zones touching the tract: ${f.zonesOnTract.length?esc(f.zonesOnTract.join(", ")):"X (minimal)"}.${floodFlags(f).map(x=>` <b>${esc(x)}</b>`).join("")}`:"",
    "Percentages are an approximation from an aligned FEMA map overlay, not an on-the-ground elevation survey.", s.sample?"Illustrative sample":`FEMA National Flood Hazard Layer, queried ${today()}${f&&f.panel?` (study ${esc(f.panel)})`:""}`, st("flood"));
  const w = L.wet; row("Wetlands", w&&w.status==="ok"?(w.share>0.002?`About ${fmt(w.share*100,1)}% of the tract is mapped as ${esc(w.typesOnTract.join(", ").toLowerCase()||"wetland or water")}.`:w.nearby?"None mapped on the tract. Mapped features nearby are drawn on the sheet.":"None mapped on or near the tract."):"",
    "The National Wetlands Inventory is drawn from aerial imagery. It is not a jurisdictional delineation.", s.sample?"Illustrative sample":"USFWS National Wetlands Inventory", st("wet"));
  const wa = L.water; row("Streams", wa&&wa.status==="ok"?esc(waterText(wa))+".":"", "Mapped centerlines at regional scale. Drainage easements and channels are located by survey.", s.sample?"Illustrative sample":"TxGIO / USGS National Hydrography Dataset", st("water"));
  const so = L.soils; row("Soils", so&&so.status==="ok"&&so.units.length?so.units.slice(0,4).map(u=>`${esc(u.name)} <span class="opt">(~${fmt(u.share*100,0)}%, hydrologic group ${esc(u.hyd||"n/a")}${u.drain?", "+esc(u.drain.toLowerCase()):""})</span>`).join("<br>"):so&&so.status==="ok"?"No soil map units returned.":"",
    "County-scale soil mapping. A screening hint for drainage and foundations, not a geotechnical report.", s.sample?"Illustrative sample":"USDA NRCS SSURGO via Soil Data Access", st("soils"));
  const t = L.terrain; const lid = t&&t.grid&&t.grid.lidar;
  row("Terrain", t&&t.status==="ok"?`Ground runs from about ${fmt(t.min,0)} to ${fmt(t.max,0)} ft (${fmt(t.relief,0)} ft of relief). Average slope about ${fmt(t.meanSlope,1)}%; about ${fmt((t.over5||0)*100,0)}% of the tract is steeper than 5%. ${t.fallDir?`Ground generally falls toward the ${t.fallDir}`:"Nearly level overall"}${t.lowSide?`, with the lowest ground on the ${t.lowSide} side`:""}. Rough earthwork to bring the tract to one plane following its natural fall: about ${fmt(sig2(t.balanceCY),0)} cubic yards each of cut and fill.`:"",
    "Approximate, from public lidar resampled to about " + (t&&t.cellFt?t.cellFt:"–") + "-ft cells. Not a design topo, and not bid quantities: no pavement section, shrink-swell, stripping or building pads.",
    s.sample?"Illustrative sample":`USGS 3DEP${lid&&lid.project?`; lidar project ${esc(lid.project)}`:""}${lid&&lid.end?`, collected ${esc(yrs(lid.start, lid.end))}`:""}${lid&&lid.gsd?`, ${esc(lid.gsd)} m DEM`:""}`, st("terrain"));
  const pw = L.power; row("Transmission", pw&&pw.status==="ok"?(pw.nearest?lineDistText(pw.nearest.d)+(pw.nearest.kv?`, ${fmt(pw.nearest.kv,0)} kV class.`:"."):`None mapped within ${s.powerMi||CONFIG.powerRadiusMi} miles.`):"",
    "Proximity from a national public map. It says nothing about available capacity, service, cost or timing.", s.sample?"Illustrative sample":"HIFLD Electric Power Transmission Lines (public dataset, last edited 2023)", st("power"));
  const j = L.juris; row("Jurisdiction", j&&j.status==="ok"?(j.text?esc(j.text):j.name?`Inside mapped city limits of ${esc(j.name)}. Zoning, platting and permits run through the city. <a href="https://www.google.com/search?q=${encodeURIComponent("City of "+j.name+" Texas zoning map")}" target="_blank" rel="noopener">Find the city's zoning map</a>.`:"Outside mapped city limits. A city's extraterritorial jurisdiction may still control platting; county rules apply to roads and drainage."):"",
    "A mapped city limit, not a zoning determination or a city verification letter.", s.sample?"Illustrative sample":`TxGIO / Comptroller city boundaries${j&&j.edited?`, edited ${esc(String(j.edited).split(" ")[0])}`:""}`, st("juris"));
  const rd = L.road; row("Road access", rd&&rd.status==="ok"?esc(roadText(rd))+".":"", "OpenStreetMap road centerlines within about 100 ft of the tract line. A mapped road is not legal access: frontage, right-of-way and access easements are confirmed by title and survey. Access is not verified by this screen.", s.sample?"Illustrative sample":"OpenStreetMap contributors (ODbL), queried " + today(), st("road"));
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
  $("#pfSite").textContent = s.pin ? `Pin at ${s.center.lat.toFixed(5)}, ${s.center.lng.toFixed(5)}: no parcel matched. Pick a parcel or sketch the tract above for a full screen, or describe it in the note.`
    : `${s.sample?"Sample site":"Site"}: ${s.title}, ${s.area}${s.propId&&!s.sketch?` · Appraisal ID ${s.propId}`:""} · ${s.sample?acTxt(s.acres)+" ac (illustrative)":acreLine(s)}`;
  const gp = $("#pfGap"); if(gp){ const g = acreage(s).gap; gp.hidden = !g; gp.textContent = g ? "Acreage check: " + g : ""; }
  $("#tractSet").hidden = !!s.sample;
  $("#altLink").href = CONFIG.quoteUrl + "?" + qs({type:rec.pri===SURVEYS.none ? (rec.add?rec.add.key:"unsure") : rec.pri.key, loc:s.sample ? "" : (s.situs || `${s.center.lat.toFixed(6)}, ${s.center.lng.toFixed(6)}`)}) + "#quote";
}

/* ===== Render a whole site ===== */
function renderSite(s){
  $("#results").hidden = false;
  $("#resKind").textContent = s.sample ? "Sample screen" : "Site screen";
  $("#resTitle").textContent = s.title;
  $("#resSub").innerHTML = `${s.sample?'<span class="tag sample">Illustrative sample</span>':s.pin?'<span class="tag sketch">No parcel matched · partial screen</span>':s.sketch?'<span class="tag sketch">Sketched outline · live public data</span>':'<span class="tag live">Live public data</span>'}${esc(s.area)}${s.sample?"":" · "+s.center.lat.toFixed(5)+", "+s.center.lng.toFixed(5)}`;
  $("#layers").innerHTML = LAYERS.map(([k,l,c])=>`<button type="button" class="lyr" data-k="${k}" aria-pressed="${LAYER_ON[k]}" ${s.sample&&(k==="aerial"||k==="ghost"||k==="adj")?"disabled":""}><i style="background:${c}"></i>${l}</button>`).join("");
  $("#btnList").textContent = LIST.some(x=>x.key===listKey(s)) ? "On your short list" : "Add to short list";
  renderReadout(s); drawSheet(s); renderBrief(s); renderInsights(s); renderMatch(s); updPacketForm(); setView(VIEW); renderWorkflow();
}

/* ===== "Is this the tract you mean?" ===== */
const CONFIRM_TXT = {whole:"Yes, the whole parcel", more:"More than this parcel", part:"Only part of it", unsure:"Not sure yet"};
const normAddr = t => String(t||"").toUpperCase().replace(/,.*$/,"").replace(/\b(STREET|ST|ROAD|RD|DRIVE|DR|AVENUE|AVE|BOULEVARD|BLVD|PARKWAY|PKWY|LANE|LN|HIGHWAY|HWY)\b/g,"").replace(/[^A-Z0-9]/g,"");
function renderMatch(s){
  const box = $("#matchBox"); if(!box) return; if(!s || s.sample){ box.hidden = true; return; } box.hidden = false;
  const entered = s.sketch ? (s.parent ? `An outline drawn inside ${s.parent.title}` : "An outline drawn on the sheet") : s.input;
  let matched, note = "";
  if(s.pin) matched = `<b>No appraisal parcel at this point.</b> The layers below are read for ${PIN_R} ft around the pin, which is not a tract.`;
  else if(s.sketch) matched = `<b>Your outline, about ${acTxt(s.acres)} acres.</b>${s.parent ? ` Part of appraisal parcel ${esc(s.parent.propId||"")}${s.parent.situs?` (${esc(s.parent.situs)})`:""}, ${acTxt(s.parent.acres)} acres drawn.` : ""}`;
  else if(s.parcels.length > 1) matched = `<b>${s.parcels.length} appraisal parcels combined, about ${acTxt(s.acres)} acres.</b> IDs ${esc(s.parcels.map(p=>p.propId).filter(Boolean).join(", "))}${s.county?` · ${esc(titleCase(s.county))} County`:""}`;
  else { matched = `<b>${esc(s.situs || "No address on the appraisal roll")}</b> · Appraisal ID ${esc(s.propId||"–")}${s.county?` · ${esc(titleCase(s.county))} County`:""}${s.legal?`<br><span class="opt">${esc(String(s.legal).slice(0,140))}</span>`:""}`;
    if(s.kind === "Address" && s.situs && normAddr(s.situs) !== normAddr(s.input)) note = "The appraisal roll lists this parcel under a different address than the one you entered. Parcels often carry more than one address. Make sure it is the tract you mean."; }
  const a = acreage(s), acr = a.rows.length ? `<div class="m-acres">${a.rows.map(([l,v])=>`<span><i>${esc(l)}</i><b>${acTxt(v)} ac</b></span>`).join("")}<span><i>${esc(s.county?titleCase(s.county)+" County":"County")} appraisal record</i><b class="opt">not read here</b></span></div>${a.gap?`<p class="m-gap">${esc(a.gap)}</p>`:""}` : "";
  const picks = (s.pin || s._showPicks) && s.layers.adj && s.layers.adj.status==="ok" ? pickItems(s.layers.adj.items, s.P) : "";
  const q = s.pin ? `<div class="m-q"><span>Pick the parcel you mean, or outline the tract.</span><div class="m-btns"><button type="button" class="btn btn-line btn-sm" data-m="sketch">Sketch the tract</button></div></div>`
    : `<div class="m-q"><span>Is this the tract you mean?</span><div class="m-btns">${["whole","more","part","not"].map(k=>`<button type="button" class="btn btn-sm ${s.confirm===k?"btn-red":"btn-line"}" data-m="${k}" aria-pressed="${s.confirm===k}">${k==="not"?"Not this one":CONFIRM_TXT[k]}</button>`).join("")}</div></div>`;
  box.innerHTML = `<div class="m-row"><div class="m-cell"><p class="m-k">You entered</p><p>${esc(entered)}</p></div><div class="m-cell"><p class="m-k">We matched</p><p>${matched}</p></div></div>${note?`<p class="m-note">${esc(note)}</p>`:""}${acr}${s.sketch?"":q}${s.pin && s.layers.adj && s.layers.adj.status==="wait" ? '<p class="opt">Finding the closest parcels…</p>' : ""}${picks?`<div class="picks"><p class="m-k">Closest appraisal parcels</p>${picks}</div>`:""}`;
  syncTractField(s); }
function syncTractField(s){ const f = $("#reqForm"); if(!f || !f.elements.tract) return; const v = s && (s.sketch ? "part" : s.parcels && s.parcels.length > 1 && !s.confirm ? "more" : s.confirm);
  for(const r of f.querySelectorAll('input[name="tract"]')) r.checked = !!v && r.value === v; }
function onMatch(k){ const s = current; if(!s) return;
  if(k==="sketch"){ $("#btnSketch").click(); $("#sheetWrap").scrollIntoView({behavior:"smooth", block:"center"}); return; }
  if(k==="not"){ s._showPicks = true; s.confirm = null; renderMatch(s); if(s.layers.adj && s.layers.adj.status!=="ok") toast("Neighboring parcels are still loading"); return; }
  s.confirm = k; s._showPicks = false; renderMatch(s);
  if(k==="more"){ toast("Click the neighboring parcels on the sheet to add them"); $("#sheetWrap").scrollIntoView({behavior:"smooth", block:"center"}); }
  if(k==="part"){ toast("Click the corners of the part you mean, then Screen this outline"); startSketch(); $("#sheetWrap").scrollIntoView({behavior:"smooth", block:"center"}); } }

/* ===== Main flow ===== */
let RUN = 0;
function waitWorklist(ms=9000){ return new Promise(res=>{ const t0 = performance.now(); (function chk(){ if(WF_SHOWN >= WF.length || performance.now()-t0 > ms) return res(); setTimeout(chk, 150); })(); }); }
async function screen(raw, {quiet=false}={}){
  const my = ++RUN, t0 = performance.now(); note(null); $("#noticePicks").hidden = true;
  const go = $("#go"), gl = go.querySelector("span"); go.disabled = true; gl.textContent = "Screening…";
  // the box and the address bar always name the site being screened, even if this screen fails
  if(!/^sample:/.test(raw.trim())){ $("#loc").value = raw; safeReplace(null, "", location.pathname + "?" + qs({loc:raw, ...(TYPE?{type:TYPE}:{}), stage:STAGE})); }
  resetMonitor(); relock();
  try {
    const sm = /^sample:(\w+)$/.exec(raw.trim());
    let s;
    if(sm){ const d = SAMPLES.find(x=>x.id===sm[1]); if(!d) throw new Error("Unknown sample."); s = siteFromSample(d); if(!TYPE) setType(d.type, true); STEPS.forEach(([k])=>setStatus(k,"ok")); }
    else { guide("Finding the appraisal parcel at that point…", "busy"); setStatus("parcel","wait"); s = await runLive(raw); }
    if(my !== RUN) return null;
    current = s; hudCoord(s.center); if(!s.sample) setStatus("parcel", s.pin ? "na" : "ok"); renderSite(s);
    if(!quiet) setTimeout(()=>$("#results").scrollIntoView({behavior:"smooth", block:"start"}), 80);
    if(!s.sample){
      guide(s.pin ? "No appraisal parcel at that point. Reading the public layers around the pin and the closest parcels…" : `Parcel found: ${acTxt(s.acres)} acres${s.county?` in ${titleCase(s.county)} County`:""}. Reading the public layers…`, "busy");
      safeReplace(null, "", shareURL(s)); $("#sheetWrap").classList.add("scanning");
      await screenLayers(s); $("#sheetWrap").classList.remove("scanning");
      if(s === current){ renderBrief(s); renderReadout(s); renderInsights(s); renderMatch(s);
        await waitWorklist(); if(s !== current) return s;
        const failed = STEPS.filter(([k])=>s.layers[k] && s.layers[k].status==="fail").length;
        const tail = failed ? ` ${failed} public service${failed>1?"s":""} didn't answer, so ${failed>1?"those layers are":"that layer is"} left off.` : "";
        guide(s.pin ? `Partial screen done in ${((performance.now()-t0)/1000).toFixed(0)} s: no parcel matched, so the layers were read around the pin.${tail} Pick a nearby parcel or sketch the tract below.`
          : `Screen complete in ${((performance.now()-t0)/1000).toFixed(0)} s.${tail} Check the match below, then the sheet and the read.`, "ok"); } }
    else { safeReplace(null, "", location.pathname + "?" + qs({loc:raw, ...(TYPE?{type:TYPE}:{}) , stage:STAGE})); guide("Sample opened. It is illustrative, so try a real site next.", "ok"); }
    return s;
  } catch(e){
    if(my !== RUN) return null;
    // fail closed: no stale exhibit from another site stays on screen
    current = null; $("#results").hidden = true; $("#sheetWrap").classList.remove("scanning"); resetMonitor();
    note(e.message || "Something went wrong."); guide(e.outside ? "Nothing was screened: the point is outside Texas." : "Nothing was drawn for that location. Try another format, or paste coordinates.");
    if(e.water && e.center) noticePicks(e.center, my);
    return null;
  } finally { if(my === RUN){ go.disabled = false; gl.textContent = "Screen this site"; } }
}
/* the closest real parcels to a point, deduplicated, as one-click picks */
function pickItems(items, P, n=4){ const seen = new Set();
  return items.map(it=>{ const rings = it.rings || it.ringsLL.map(r=>r.map(P.f)), [cx,cy] = interiorPoint(rings); return {it, cx, cy, d:Math.max(0, Math.hypot(cx,cy)), ac:polyArea(rings)/SQFT_AC}; })
    .filter(x=>x.ac>=0.05 && x.d<=2640).sort((a,b)=>a.d-b.d).filter(x=>{ const k = [x.it.situs||x.it.legal||x.it.propId||"", x.ac.toFixed(2)].join("|"); if(seen.has(k)) return false; seen.add(k); return true; }).slice(0,n)
    .map(({it,cx,cy,d,ac})=>{ const [lng,lat] = P.i([cx,cy]); const what = it.situs || (it.legal ? titleCase(String(it.legal)).slice(0,48) : "Appraisal parcel");
      return `<button type="button" class="pick" data-ll="${lat.toFixed(6)}, ${lng.toFixed(6)}"><b>${esc(acTxt(ac))} ac</b> <span>${esc(what)}${it.propId?` · ID ${esc(it.propId)}`:""}</span> <i>${d<30?"at the pin":fmt(sig2(d),0)+" ft away"}</i></button>`; }).join(""); }
async function noticePicks(center, my){ const P = proj(center), d = 900, a = P.i([-d,-d]), b = P.i([d,d]);
  let nb; try { nb = await fetchNeighbors([a[0],a[1],b[0],b[1]], null); } catch(_){ return; } if(my !== RUN) return;
  const html = pickItems(nb, P); if(!html) return; const box = $("#noticePicks"); box.innerHTML = `<p>Closest parcels to that point:</p>${html}`; box.hidden = false; }
function prefillContact(){ try { const c = JSON.parse(sessionStorage.getItem("asc_contact")||"null"); if(!c) return; const f = $("#reqForm"); for(const [k,v] of Object.entries(c)) if(f.elements[k] && !f.elements[k].value) f.elements[k].value = v; } catch(_){} }
function relock(){ if(document.body.classList.contains("staff")) return; document.body.classList.remove("unlocked"); $("#briefWrap").classList.add("locked"); $("#reqForm").hidden = false; $("#reqDone").hidden = true; prefillContact(); }
function note(msg){ const n = $("#notice"); if(msg){ n.textContent = msg; n.hidden = false; } else n.hidden = true; }
/* ===== Sketch mode ===== */
function startSketch(){ if(!current) return; SKETCH = {pts:[], base:current}; LAYER_ON.aerial = true; $("#sheetWrap").classList.add("sketching"); $("#sketchBar").hidden = false; setView("sheet"); updSketch(); }
function endSketch(){ SKETCH = null; $("#sheetWrap").classList.remove("sketching"); $("#sketchBar").hidden = true; if(current) drawSheet(current); }
function updSketch(){ const n = SKETCH ? SKETCH.pts.length : 0; $("#sketchCount").textContent = n + (n >= 3 ? ` · about ${acTxt(Math.abs(ringArea(SKETCH.pts))/SQFT_AC)} ac` : ""); $("#sketchDone").disabled = !SKETCH || SKETCH.pts.length < 3; drawSheet(current); }
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
  if(s.pin){ const n = (s.layers.adj && s.layers.adj.items || []).find(n=>String(n.oid)===String(oid)); if(n){ const [lng,lat] = s.P.i(interiorPoint(n.rings)); const ll = `${lat.toFixed(6)}, ${lng.toFixed(6)}`; $("#loc").value = ll; screen(ll); } return; }
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
  s._th = {}; s.parts = s.parcels.map(p=>p.ringsLL.map(r=>r.map(s.P.f))); s.rings = s.parts.flat(); s.areaSqft = tractArea(s); s.acres = ac(s.areaSqft);
  s.title = s.parcels.length>1 ? `Assemblage of ${s.parcels.length} parcels` : (s.parcels[0].situs || "Parcel " + (s.parcels[0].propId||""));
  if(s.parcels.length===1){ s.legal = s.parcels[0].legal; s.propId = s.parcels[0].propId; s.added = []; } else { s.legal = null; s.propId = s.parcels.map(p=>p.propId).join(", "); }
  s.refs = s.parcels.length===1 ? parseLegal(s.legal) : {};
  const nb = bbox(s.rings), fr = s.frame; if(nb[0]<fr[0]||nb[1]<fr[1]||nb[2]>fr[2]||nb[3]>fr[3]) s.frame = frameFor(s.rings);
  // figures from the old outline must not linger while the new one is read
  const redo = ["flood","wet","water","soils","terrain","power","road"]; for(const k of redo){ s.layers[k] = {status:"wait"}; LST[k] = "wait"; }
  s.confirm = s.parcels.length > 1 ? "more" : null; s._showPicks = false;
  renderSite(s); safeReplace(null, "", shareURL(s)); await screenLayers(s, redo); if(s===current){ renderBrief(s); renderReadout(s); renderInsights(s); renderMatch(s); }
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
const listKey = s => s.sample ? "sample:"+s.sampleId : s.pin ? `pin:${s.center.lat.toFixed(6)},${s.center.lng.toFixed(6)}` : s.sketch ? "sketch:"+(s.sketchLL||[]).map(p=>p[1].toFixed(6)+","+p[0].toFixed(6)).join(";") : "p:"+s.parcels.map(p=>p.oid).sort().join("+");
function mainSoil(units){ if(!units || !units.length) return null; const nm = u => u.name.split(",")[0];
  if(/^urban land/i.test(units[0].name)){ const nx = units.find(u=>!/^urban land/i.test(u.name)); return nx ? `${nm(nx)} (~${fmt(nx.share*100,0)}%; rest mapped as urban land)` : "Mapped as urban land only"; }
  return `${nm(units[0])} (~${fmt(units[0].share*100,0)}%)`; }
function summary(s){ const L = s.layers, ok = k => L[k] && L[k].status==="ok", st = {};
  for(const [k] of STEPS) if(k!=="parcel") st[k] = L[k] ? L[k].status : "wait";
  return { v:2, key:listKey(s), title:s.title, area:s.area, sample:!!s.sample, pin:!!s.pin, entered: s.sample ? null : s.sketch ? "sketched outline" : s.input, propId: s.propId || null,
    acres: s.pin ? null : +s.acres.toFixed(2), feed: s.sample || s.pin ? null : ((acreage(s).rows.find(r=>/^Roll acreage/.test(r[0])) || [])[1] || null), gap: !!acreage(s).gap, st,
    flood: ok("flood") ? +(L.flood.shareSFHA*100).toFixed(0) : null, floodway: ok("flood") ? +(L.flood.shareFloodway*100).toFixed(0) : null,
    vzone: ok("flood") && (L.flood.zonesOnTract||[]).some(z=>/^V/.test(z)), femaYear: ok("flood") && L.flood.firm && L.flood.firm.effMs ? new Date(L.flood.firm.effMs).getUTCFullYear() : null,
    wet: ok("wet") ? +(L.wet.share*100).toFixed(1) : null, stream: ok("water") ? (L.water.share > 0.02 ? `${fmt(L.water.share*100,0)}% under water` : L.water.crossing ? "Yes" : "No") : null,
    road: ok("road") ? roadText(L.road, true) : null,
    relief: ok("terrain") ? +L.terrain.relief.toFixed(0) : null, slope: ok("terrain") ? +L.terrain.meanSlope.toFixed(1) : null,
    soil: ok("soils") ? mainSoil(L.soils.units) : null,
    line: ok("power") ? (L.power.nearest ? lineDistText(L.power.nearest.d, true) : `None within ${s.powerMi||CONFIG.powerRadiusMi} mi`) : null, kv: ok("power") && L.power.nearest ? L.power.nearest.kv : null,
    juris: ok("juris") ? (L.juris.text || (L.juris.name ? "City of "+L.juris.name : "Outside city limits")) : null,
    url: shareURL(s), date: new Date().toISOString().slice(0,10) }; }
function addCurrentToList(){ if(!current) return; if(!current.sample && STEPS.some(([k])=>k!=="parcel" && (!current.layers[k] || current.layers[k].status==="wait"))){ toast("Wait for the screen to finish, then add it"); return; } const sum = summary(current); LIST = LIST.filter(x=>x.key!==sum.key); LIST.push(sum); saveList(); $("#btnList").textContent = "On your short list"; toast("Added to your short list"); }
function renderList(){
  const t = $("#slTable"), n = LIST.length; $("#navCount").hidden = !n; $("#navCount").textContent = n; $("#slEmpty").hidden = !!n; $("#slNote").hidden = !n;
  if(!n){ t.innerHTML = ""; return; }
  // a cell says why it is empty: not read (the service didn't answer), not mapped, or simply absent on an older entry
  const c = (x, k, val) => { const st = x.st && x.st[k]; if(st === "fail") return '<span class="opt">not read · rescreen</span>'; if(st === "none") return '<span class="opt">not mapped</span>'; return val == null ? '<span class="opt">–</span>' : val; };
  t.innerHTML = `<thead><tr><th>Site</th><th>Acres</th><th>In mapped 1% floodplain</th><th>Mapped wetland</th><th>Stream or water</th><th>Mapped road frontage</th><th>Relief / avg slope</th><th>Soil</th><th>Nearest line</th><th>Jurisdiction</th><th></th></tr></thead><tbody>` +
    LIST.map((x,i)=>`<tr><td><a href="${esc(x.url)}">${esc(x.title)}</a><div class="opt">${esc(x.area)}${x.sample?" · sample":""}${x.propId?` · ID ${esc(x.propId)}`:""}</div>${x.entered && x.entered !== x.title ? `<div class="opt">You entered: ${esc(x.entered)}</div>` : ""}</td>
      <td class="num">${x.pin ? '<span class="opt">no parcel</span>' : acTxt(x.acres)}${x.feed ? `<div class="opt">roll ${acTxt(x.feed)}</div>` : ""}${x.gap ? '<div class="flag">check acreage</div>' : ""}</td>
      <td class="num">${c(x,"flood", x.flood==null?null:`${x.flood}%${x.floodway?` <span class="opt">(${x.floodway}% floodway)</span>`:""}`)}${x.vzone?'<div class="flag">coastal V zone</div>':""}${x.femaYear && new Date().getFullYear()-x.femaYear >= 10 ? `<div class="opt">map from ${x.femaYear}</div>` : ""}</td>
      <td class="num">${c(x,"wet", x.wet==null?null:x.wet+"%")}</td><td>${c(x,"water", x.stream==null?null:(x.stream===true?"Yes":x.stream===false?"No":esc(x.stream)))}</td>
      <td>${c(x,"road", x.road==null?null:esc(x.road))}</td>
      <td class="num">${c(x,"terrain", x.relief==null?null:`${x.relief} ft / ${x.slope}%`)}</td><td>${c(x,"soils", x.soil==null?null:esc(x.soil))}</td>
      <td class="num">${c(x,"power", x.line==null?null:`${esc(typeof x.line==="number"?x.line+" mi":x.line)}${x.kv?` · ${x.kv} kV`:""}`)}</td><td>${c(x,"juris", x.juris==null?null:esc(x.juris))}</td><td><button type="button" data-rm="${i}">Remove</button></td></tr>`).join("") + `</tbody>`;
}
/* ===== Packet request (the gate: contact details in, packet by email) ===== */
function updPacketForm(){ updRec(); const n = LIST.length; $("#listOpt").hidden = !n; $("#listN").textContent = n; $("#pkListItem").hidden = !n; }
function unlockBrief(){ $("#briefWrap").classList.remove("locked"); document.body.classList.add("unlocked"); }
async function submitRequest(e){
  e.preventDefault(); const f = e.target, err = $("#reqErr"); err.hidden = true;
  const d = Object.fromEntries(new FormData(f).entries());
  if(!d.name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email||"") || !d.role || !d.timing){ err.textContent = "Please add your name, a valid email, your role and timing. Company and phone are optional."; err.hidden = false; return; }
  if(current && !current.sample && !d.tract){ err.textContent = "Please tell us whether this is the tract you mean, so nobody scopes the wrong land."; err.hidden = false; $("#tractSet").scrollIntoView({behavior:"smooth", block:"center"}); return; }
  d.proposal = d.want === "proposal";
  const s = current, rec = s ? recommend(s) : null, L = s ? s.layers : {};
  const clip = (v,n) => v == null || v === "" ? null : String(v).slice(0,n);
  const siteRef = s ? (s.sample ? "sample:"+s.sampleId : s.pin ? `pin (no parcel): ${s.center.lat.toFixed(6)}, ${s.center.lng.toFixed(6)}` : s.sketch ? "sketch:"+s.sketchLL.map(p=>p[1].toFixed(6)+","+p[0].toFixed(6)).join(";") : (s.situs || s.input)) : null;
  const list = d.withList && LIST.length ? LIST.slice(-30).map(x=>({title:String(x.title).slice(0,120), url:String(x.url).slice(0,600), acres:x.acres})) : [];
  const packet = { v:1, link: s ? shareURL(s).slice(0,1500) : null, screen_no: s ? screenNo(s) : null, title: s ? String(s.title).slice(0,160) : null, stage:STAGE, type:TYPE, list,
    failed_layers: s && !s.sample ? Object.keys(L).filter(k=>L[k] && L[k].status==="fail") : [], unmapped_layers: s && !s.sample ? Object.keys(L).filter(k=>L[k] && L[k].status==="none") : [],
    fema_effective: L.flood && L.flood.firm ? L.flood.firm.eff : null,
    entered: s ? clip(s.input, 300) : null, matched: s ? clip(s.pin ? "no parcel at pin" : s.sketch ? "sketched outline" : s.situs || s.title, 300) : null, tract_confirm: d.tract || null,
    parent: s && s.parent ? {prop_id:s.parent.propId, acres:+s.parent.acres.toFixed(2)} : null,
    acreage: s ? acreage(s).rows.map(([l,v])=>({source:l, acres:+v.toFixed(3)})) : [], acreage_gap: s ? acreage(s).gap : null,
    road_touch: L.road && L.road.status==="ok" ? L.road.touches : null, access_verified: false };
  const row = { kind:"request", goal:(d.proposal?"packet+proposal:":"packet:")+STAGE, site_type:TYPE || (s&&s.sample?s.type:null), survey: rec ? (rec.pri===SURVEYS.none ? (rec.add?rec.add.key:"unsure") : rec.pri.key) : null,
    location: clip(siteRef, 400), lat: s ? +s.center.lat.toFixed(6) : null, lng: s ? +s.center.lng.toFixed(6) : null, acres: s && !s.pin ? +s.acres.toFixed(2) : null,
    flood_zones: L.flood && L.flood.status==="ok" ? clip(L.flood.zonesOnTract.join(", ") || "X", 200) : null, pct_outside_floodplain: L.flood && L.flood.status==="ok" ? +((1-L.flood.shareSFHA)*100).toFixed(1) : null,
    county: s ? clip(s.county,80) : null, legal: s ? clip(s.legal,1000) : null, prop_id: s ? clip(s.propId,80) : null, is_sample: !!(s && s.sample),
    name: d.name.slice(0,200), email: d.email.slice(0,320), phone: clip(d.phone,40), company: clip(d.company,200), note: clip(d.note,1000),
    role: clip(d.role,60), timing: clip(d.timing,60), wants_records: !!d.records, wants_proposal: !!d.proposal, packet };
  const dry = DRY || /^TEST\b/i.test(d.name);
  const btn = f.querySelector("button[type=submit]"); btn.disabled = true; btn.textContent = "Opening…";
  try {
    if(!dry){
      const r = await fetch(CONFIG.store.url + "/rest/v1/" + CONFIG.store.table, {method:"POST", headers:{"Content-Type":"application/json", apikey:CONFIG.store.key, Authorization:"Bearer "+CONFIG.store.key, Prefer:"return=minimal"}, body:JSON.stringify(row)});
      if(!r.ok) throw new Error("HTTP "+r.status);
    } else await sleep(500);
    try { sessionStorage.setItem("asc_contact", JSON.stringify({name:d.name, email:d.email, company:d.company||"", phone:d.phone||"", role:d.role, timing:d.timing})); } catch(_){}
    f.hidden = true; $("#doneEmail").textContent = d.email; $("#doneH").textContent = s ? `The packet for ${s.title} is open below.` : "Your request is in.";
    $("#reqDone").hidden = false; $("#reqDone").focus(); unlockBrief(); toast(dry ? "Test mode: nothing was sent." : "Packet unlocked.");
  } catch(ex){
    err.innerHTML = `The request didn't go through. Please email <a href="mailto:surveytx@txasc.com?subject=${encodeURIComponent("Site Screen packet: "+(s?s.title:"site"))}&body=${encodeURIComponent((s?shareURL(s)+"\n\n":"")+(d.note||""))}">surveytx@txasc.com</a> or call (469) 317-0250.`; err.hidden = false;
  } finally { btn.disabled = false; updWant(); }
}

function updWant(){ const f = $("#reqForm"), w = f && f.elements.want ? f.elements.want.value : "packet"; const b = $("#reqGo"); if(b) b.textContent = w === "proposal" ? "Open my packet and request a proposal" : "Open my packet"; }
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
const art = n => /^[AEIOU]/i.test(n) ? "an" : "a";
function updRec(){ const el = $("#pfRec"), hd = $("#resRec"); if(!el) return; if(!current || current.pin || current.sketch && !current.layers.flood){ el.hidden = true; if(hd) hd.hidden = true; return; }
  const r = recommend(current); el.hidden = false;
  const add = r.add ? r.add.name.toLowerCase().replace("alta/nsps","ALTA/NSPS") : null;
  el.innerHTML = r.pri===SURVEYS.none ? `<b>Our read:</b> the public record is enough to compare sites at this stage; this screen cannot tell you what a survey would find. ${esc(r.why)}${add?` When it moves forward, plan on ${art(add)} ${esc(add)}.`:""}`
    : `<b>Our read:</b> start with ${art(r.pri.name)} ${esc(r.pri.name)}${add?`, then ${art(add)} ${esc(add)}`:""}. ${esc(r.why)}`;
  if(hd){ hd.hidden = false; hd.innerHTML = (r.pri===SURVEYS.none ? `<b>Our read:</b> fine for comparing sites${add?`; plan on ${art(add)} ${esc(add)} when it moves forward`:""}.`
    : `<b>Our read:</b> start with ${art(r.pri.name)} ${esc(r.pri.name)}${add?`, then ${art(add)} ${esc(add)}`:""}.`) + ` <a href="#packet">Ask us what to verify next</a>`; } }
function setType(k, silent){ TYPE = TYPE===k && !silent ? null : k; document.querySelectorAll("#types .chip").forEach(c=>c.setAttribute("aria-pressed", String(c.dataset.k===TYPE))); if(current && !silent) renderBrief(current); updRec(); }
function setStage(k){ STAGE = k; document.querySelectorAll("#stages .chip").forEach(c=>c.setAttribute("aria-pressed", String(c.dataset.k===STAGE))); if(current) renderBrief(current); updRec(); }

/* ===== Surveyor's worklist: the layer jobs told as the steps a surveyor takes ===== */
const WF_ICO = {
  search:'<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/><path class="a" d="M8 10.5h5"/>',
  pen:'<path d="M4 20l1-4L16 5l3 3L8 19z"/><path class="a" d="M3 21h9"/>',
  wave:'<path class="a" d="M2 15c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0"/><path d="M2 10c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0"/>',
  drop:'<path d="M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11z"/><path class="a" d="M9 15a3 3 0 0 0 3 3"/>',
  layers:'<path d="M12 3l9 5-9 5-9-5z"/><path class="a" d="M3 13l9 5 9-5"/>',
  contour:'<path d="M3 17c3-5 6-7 9-7s6 2 9 7"/><path class="a" d="M6 17c2-3 4-4 6-4s4 1 6 4"/><path d="M3 20h18"/>',
  bolt:'<path d="M13 2L5 13h6l-1 9 8-12h-6z"/>',
  road:'<path d="M8 3L5 21M16 3l3 18"/><path class="a" d="M12 4v3M12 10v3M12 16v3"/>',
  sheet:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M16 4v16"/><path class="a" d="M6 15l3-5 3 3 2-3"/>'
};
const WF = [
  {id:"rec",   t:"Researching the record",       d:"Appraisal roll and legal description", keys:["parcel"], ico:"search"},
  {id:"sketch",t:"Preparing the tract sketch",   d:"Outline from county appraisal mapping", keys:["parcel"], ico:"pen"},
  {id:"flood", t:"Checking the flood map",       d:"FEMA National Flood Hazard Layer",      keys:["flood"],  ico:"wave"},
  {id:"water", t:"Tracing water and wetlands",   d:"USFWS NWI and USGS NHD",                keys:["wet","water"], ico:"drop"},
  {id:"soils", t:"Reading the soils",            d:"NRCS SSURGO",                           keys:["soils"],  ico:"layers"},
  {id:"topo",  t:"Gathering the topo",           d:"USGS 3DEP public lidar",                keys:["terrain"],ico:"contour"},
  {id:"power", t:"Checking roads, power and city limits",d:"OpenStreetMap roads, HIFLD lines, TxGIO city limits", keys:["road","power","juris"], ico:"bolt"},
  {id:"exhibit",t:"Drafting the exhibit",        d:"Laying it out on the ASC sheet",        keys:"all",      ico:"sheet"}
];
const LST = {}, MON_T = {}, WF_T = {};
/* a sketched outline has no appraisal record: once its layers start, the record steps count as done */
function lst(k){ const v = LST[k] || "idle"; if(k==="parcel" && v==="idle" && current && current.sketch && STEPS.some(([x])=>x!=="parcel" && LST[x] && LST[x]!=="idle")) return "ok"; return v; }
function wfState(step){
  const keys = step.keys === "all" ? STEPS.map(x=>x[0]) : step.keys, st = keys.map(lst);
  if(step.keys === "all"){ if(st.every(x=>x==="idle")) return "idle"; return st.some(x=>x==="wait"||x==="idle") ? (lst("parcel")==="ok"?"wait":"idle") : "ok"; }
  if(st.some(x=>x==="wait")) return "wait"; if(st.every(x=>x==="idle")) return "idle";
  if(st.every(x=>x==="ok"||x==="na")) return "ok"; return st.some(x=>x==="ok"||x==="na") ? "part" : "fail";
}
const WF_SRC_NAME = {road:"road map", wet:"wetlands map", water:"stream map", power:"transmission map", juris:"city limits map"};
function wfDetail(step, s){
  if(!s) return step.d;
  if(Array.isArray(step.keys) && step.keys.length > 1){ const miss = step.keys.filter(k=>lst(k)==="fail").map(k=>WF_SRC_NAME[k]||k);
    if(miss.length){ const rest = wfDetail0(step, s); return (rest && rest !== step.d ? rest + " · " : "") + miss.join(", ") + " did not answer"; } }
  return wfDetail0(step, s); }
function wfDetail0(step, s){ const L = s.layers, ok = k => L[k] && L[k].status==="ok", r = s.refs || {};
  switch(step.id){
    case "rec": return s.sample ? "Illustrative sample record" : s.pin ? "No appraisal parcel at the pin" : s.sketch ? "Sketched outline, no record attached" : [s.propId && "ID " + s.propId, r.abstract && "Abstract " + r.abstract, r.lot && "Lot " + r.lot, r.block && "Block " + r.block].filter(Boolean).slice(0,3).join(" · ") || (s.county ? titleCase(s.county) + " County roll" : step.d);
    case "sketch": return s.pin ? `${PIN_R}-ft circle around the pin` : `${acTxt(s.acres)} acres ± · ${s.rings.reduce((t,x)=>t+x.length,0)} vertices`;
    case "flood": return ok("flood") ? (L.flood.shareSFHA>0.005 ? `~${fmt(L.flood.shareSFHA*100,0)}% in mapped 1% floodplain` : "Outside mapped 1% floodplain") + (L.flood.panel && !s.sample ? ` · ${L.flood.panel}` : "") + (L.flood.firm && L.flood.firm.eff && !s.sample ? ` · map effective ${L.flood.firm.eff}` : "") : step.d;
    case "water": return ok("wet") || ok("water") ? [ok("wet") ? (L.wet.share>0.002 ? `~${fmt(L.wet.share*100,1)}% mapped wetland` : "No mapped wetland on tract") : null, ok("water") ? (L.water.crossing ? "stream touches tract" : "no mapped stream across") : null].filter(Boolean).join(" · ") : step.d;
    case "soils": return ok("soils") && L.soils.units[0] ? `${L.soils.units[0].name.split(",")[0]} · group ${L.soils.units[0].hyd||"n/a"}` : step.d;
    case "topo": return ok("terrain") ? `${fmt(L.terrain.min,0)}–${fmt(L.terrain.max,0)} ft · ${s._contourIv||"–"}-ft contours` : step.d;
    case "power": return [ok("power") ? (L.power.nearest ? lineDistText(L.power.nearest.d, true).toLowerCase() : "no line nearby") : null, ok("juris") ? (L.juris.name ? titleCase(L.juris.name) : L.juris.text || "outside city limits") : null, ok("road") ? (L.road.touches ? "road frontage mapped" : "no mapped road frontage") : null].filter(Boolean).join(" · ") || step.d;
    case "exhibit": return wfState(step)==="ok" ? `Sheet 1 of 1 · ${screenNo(s)}` : step.d;
  }
  return step.d;
}
function wfHTML(step, s, compact, st){
  st = st || wfState(step); const t = WF_T[step.id];
  const ms = st==="wait" ? "on it" : st==="ok" ? (t && +t >= 0.2 ? t + " s" : "done") : st==="part" ? "partial" : st==="fail" ? "no answer" : "queued";
  return `<li class="wf ${st}" data-id="${step.id}"><span class="wf-ico" aria-hidden="true"><svg viewBox="0 0 24 24">${WF_ICO[step.ico]}</svg></span>
    <span class="wf-txt"><span class="wf-t">${esc(step.t)}</span>${compact?"":`<span class="wf-d">${esc(st==="idle"||st==="wait"?step.d:wfDetail(step, s))}</span>`}</span><span class="wf-ms">${ms}</span></li>`;
}
/* the worklist plays in order, one step at a time, so it reads like a surveyor working down the list */
let WF_SHOWN = 0, WF_TICK = 0;
function wfShown(i){ const real = wfState(WF[i]); if(i < WF_SHOWN) return real; if(i === WF_SHOWN && WF.some(w=>wfState(w)!=="idle")) return "wait"; return "idle"; }
function wfAdvance(){ WF_TICK = 0; if(WF_SHOWN >= WF.length) return; const r = wfState(WF[WF_SHOWN]);
  if(r === "ok" || r === "part" || r === "fail"){ WF_SHOWN++; paintWorkflow(); }
  if(WF_SHOWN < WF.length && WF.some(w=>wfState(w)!=="idle")) WF_TICK = setTimeout(wfAdvance, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 520); }
function renderWorkflow(){
  WF.forEach(w=>{ const st = wfState(w); if(st==="wait" && !WF_T["_"+w.id]) WF_T["_"+w.id] = performance.now(); if((st==="ok"||st==="part") && WF_T["_"+w.id] && !WF_T[w.id]) WF_T[w.id] = ((performance.now()-WF_T["_"+w.id])/1000).toFixed(1); });
  paintWorkflow(); if(!WF_TICK) WF_TICK = setTimeout(wfAdvance, 260); }
function paintWorkflow(){
  const s = current, sts = WF.map((w,i)=>wfShown(i)), done = sts.filter(x=>x==="ok"||x==="part"||x==="fail").length, busy = sts.some(x=>x==="wait");
  const row = (w,i,c) => wfHTML(w, s, c, sts[i]);
  const m = $("#monList"); if(m) m.innerHTML = WF.map((w,i)=>row(w,i,false)).join("");
  const strip = $("#wfStrip"); if(strip) strip.innerHTML = WF.map((w,i)=>row(w,i,true)).join("");
  const pct = Math.round(done/WF.length*100); document.querySelectorAll(".wf-bar i").forEach(b=>b.style.width = pct+"%");
  renderPanelHead();
  const ms = $("#monState"); if(ms){ ms.textContent = busy ? `Working · ${done} of ${WF.length}` : done===WF.length ? "Exhibit drafted" : "Standing by"; ms.classList.toggle("run", busy); }
  const ws = $("#wfState"); if(ws) ws.textContent = busy ? `Step ${Math.min(done+1, WF.length)} of ${WF.length} · ${WF[Math.min(done, WF.length-1)].t}` : done===WF.length ? "Worked up · sheet drafted" : "";
}
function renderMonitor(){ renderWorkflow(); }
function setStatus(key, st){
  LST[key] = st === "fail" ? "fail" : st;
  if(st==="wait") MON_T[key] = performance.now();
  renderWorkflow(); renderPanelHead();
}
function resetMonitor(){ STEPS.forEach(([k])=>{ LST[k] = "idle"; }); Object.keys(WF_T).forEach(k=>delete WF_T[k]); WF_SHOWN = 0; clearTimeout(WF_TICK); WF_TICK = 0; renderWorkflow(); renderPanelHead(); }
function renderPanelHead(){
  const pl = $("#panelLive"); if(!pl) return; const n = STEPS.length, ok = STEPS.filter(([k])=>LST[k]==="ok"||LST[k]==="na").length, busy = STEPS.some(([k])=>LST[k]==="wait") || (WF_SHOWN < WF.length && STEPS.some(([k])=>LST[k] && LST[k]!=="idle"));
  pl.textContent = busy ? `Reading · ${ok}/${n}` : `${ok}/${n} layers read`; pl.classList.toggle("busy", busy);
}

/* ===== Guide line and insights ===== */
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
  for(let i=0;i<n;i++) for(let j=0;j<n;j++){ const x = x0+(i+.5)*(x1-x0)/n, y = y0+(j+.5)*(y1-y0)/n; if(inTract(s,x,y) && sf.some(p=>inRings(x,y,p.rings))){ sx+=x; sy+=y; k++; } }
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
  if(!s.sample && !s.sketch && !s.pin){ if(r.lot && r.block) out.push({c:"#ff6a5e", h:"Record", p:`Reads as a platted lot: Lot ${r.lot}, Block ${r.block}${r.addition?`, ${titleCase(r.addition)}`:""}. The recorded plat is where the boundary work starts.`});
    else if(r.abstract) out.push({c:"#ff6a5e", h:"Record", p:`Reads as unplatted acreage in Abstract ${r.abstract}. Lines come from deed calls, so plan for more record research and corner recovery than on a platted lot.`});
    if(s.added.length) out.push({c:"#ff6a5e", h:"Assemblage", p:`${s.parcels.length} appraisal parcels combined. The common lines, and any gaps or overlaps between the deeds, are what a boundary survey resolves.`}); }
  if(ok("power") && (type==="dc" || type==="ind" || s.acres >= 40)){ const n = L.power.nearest;
    out.push({c:"#f0b35a", h:"Transmission", p:`${n ? lineDistText(n.d) + (n.kv?` (${fmt(n.kv,0)} kV class)`:"") : `No transmission line is mapped within ${s.powerMi||CONFIG.powerRadiusMi} mi`}. Proximity only; capacity is a utility and ERCOT question.`}); }
  return out.slice(0,4);
}
/* motion cards: each theme gets a quiet b-roll loop under its text (a drawn motif stands in until the clip loads) */
const INS_THEME = {"Floodplain":"flood","Ground":"ground","Water features":"water","Record":"record","Assemblage":"record","Transmission":"power"};
const INS_CLIP = {flood:"img/clips/flood.mp4", ground:"img/clips/ground.mp4", water:"img/clips/water.mp4", power:"img/clips/power.mp4"}; /* records.mp4 joins when the file-room footage is picked */
function insMedia(th){
  const m = document.createElement("div"); m.className = "ins-media"; m.setAttribute("aria-hidden","true");
  m.innerHTML = `<div class="ins-motif m-${th}"></div>`;
  const src = INS_CLIP[th], still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if(src){ const v = document.createElement("video"); v.muted = true; v.playsInline = true; v.setAttribute("muted",""); v.setAttribute("playsinline","");
    v.addEventListener("error", ()=>v.remove());
    if(still){ v.preload = "auto"; v.addEventListener("loadeddata", ()=>{ v.currentTime = Math.min(1.5, (v.duration||2)/2); }, {once:true}); v.addEventListener("seeked", ()=>m.classList.add("has-clip"), {once:true}); }
    else { v.loop = true; v.autoplay = true; v.preload = "metadata"; v.addEventListener("playing", ()=>m.classList.add("has-clip"), {once:true}); }
    v.src = src; m.prepend(v); }
  return m; }
function renderInsights(s){
  const box = $("#insights"); if(!box || !s) return; if(s.layers && !s.layers.flood && s.sketch){ box.innerHTML = ""; return; }
  const list = insights(s), have = [...box.children];
  list.forEach((x,i)=>{ const el = have[i], key = x.h + (x.wait?":w:":":") + x.p, th = INS_THEME[x.h] || "record";
    if(el && el.dataset.h === key) return;
    if(el && el.dataset.th === th){ el.dataset.h = key; el.className = "ins" + (x.wait?" wait":""); if(x.c) el.style.setProperty("--c", x.c);
      const body = el.querySelector(".ins-body"); body.innerHTML = `<b>${esc(x.h)}</b><p>${esc(x.p)}</p>`; body.classList.remove("swap"); void body.offsetWidth; body.classList.add("swap"); return; }
    const d = document.createElement("div"); d.className = "ins" + (x.wait?" wait":""); d.dataset.h = key; d.dataset.th = th; if(x.c) d.style.setProperty("--c", x.c); d.style.animationDelay = (i*90)+"ms";
    d.appendChild(insMedia(th)); const body = document.createElement("div"); body.className = "ins-body"; body.innerHTML = `<b>${esc(x.h)}</b><p>${esc(x.p)}</p>`; d.appendChild(body);
    if(el) box.replaceChild(d, el); else box.appendChild(d); });
  while(box.children.length > list.length) box.lastChild.remove();
}
/* hero reel: project-showcase aerials, played through slowly and cross-faded, one after another */
const HERO_REEL = ["img/reel/1.mp4","img/reel/2.mp4","img/reel/3.mp4"];
function heroReel(){
  const box = $("#heroReel"); if(!box || !HERO_REEL.length || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  let i = 0; const mk = () => { const v = document.createElement("video"); v.muted = true; v.playsInline = true; v.preload = "auto"; v.setAttribute("muted",""); v.setAttribute("playsinline",""); box.appendChild(v); return v; };
  const A = mk(), B = mk(); let cur = A;
  const play = (v, src) => { v.src = src; v.addEventListener("loadedmetadata", ()=>{ v.playbackRate = 0.6; }, {once:true}); return v.play().catch(()=>{}); };
  const next = () => { const nxt = cur===A ? B : A; i = (i+1) % HERO_REEL.length; play(nxt, HERO_REEL[i]).then(()=>{ nxt.classList.add("on"); cur.classList.remove("on"); const old = cur; cur = nxt; setTimeout(()=>old.pause(), 2600); }); };
  A.addEventListener("timeupdate", ()=>{ if(cur===A && A.duration && A.currentTime > A.duration - 1.6 && !A._x){ A._x = 1; next(); } });
  B.addEventListener("timeupdate", ()=>{ if(cur===B && B.duration && B.currentTime > B.duration - 1.6 && !B._x){ B._x = 1; next(); } });
  [A,B].forEach(v=>v.addEventListener("play", ()=>{ v._x = 0; }));
  play(A, HERO_REEL[0]).then(()=>A.classList.add("on"));
  if(HERO_REEL.length === 1){ A.loop = true; }
  document.addEventListener("visibilitychange", ()=>{ if(document.hidden) cur.pause(); else cur.play().catch(()=>{}); });
}
/* cursor readout on the sheet */
function sheetHover(e){
  const hud = $("#cursorHud"), s = current; if(!s) return;
  const [px,py] = svgPoint(e); if(px<DX||px>DX+DW||py<DY||py>DY+DH){ hud.hidden = true; return; }
  const [x,y] = sheetXform(s).inv(px,py), ll = s.P.i([x,y]), t = s.layers.terrain, f = s.layers.flood;
  const z = t && t.status==="ok" ? gridAt(t.grid, x, y) : NaN;
  const inFlood = f && f.status==="ok" && f.polys.some(p=>p.sfha && inRings(x,y,p.rings));
  hud.innerHTML = `<b>${s.sample?"sample":ll[1].toFixed(5)+", "+ll[0].toFixed(5)}</b>${isFinite(z)?` · ~${fmt(z,0)} ft (lidar)`:""}${inFlood?" · mapped 1% floodplain":""}${inTract(s,x,y)?" · on tract":""}`;
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
  $("#layers").addEventListener("click", e=>{ const b = e.target.closest(".lyr"); if(!b) return; const k = b.dataset.k; LAYER_ON[k] = !LAYER_ON[k]; if(LAYER_ON[k] && (k==="aerial"||k==="ghost")) LAYER_ON[k==="aerial"?"ghost":"aerial"] = false; document.querySelectorAll("#layers .lyr").forEach(x=>x.setAttribute("aria-pressed", String(!!LAYER_ON[x.dataset.k]))); drawSheet(current); });
  $("#tabSheet").addEventListener("click", ()=>setView("sheet")); $("#tabModel").addEventListener("click", ()=>setView("model"));
  $("#btnRetry").addEventListener("click", retryMissing);
  $("#btnSavePdf").addEventListener("click", ()=>{ if(current){ setView("sheet"); drawSheet(current); } window.print(); });
  $("#btnShare").addEventListener("click", async ()=>{ if(!current) return; const u = shareURL(current); try { await navigator.clipboard.writeText(u); toast("Link copied. It re-runs the screen with today's public data."); } catch(e){ prompt("Copy this link", u); } });
  $("#btnList").addEventListener("click", addCurrentToList);
  $("#slClear").addEventListener("click", ()=>{ LIST = []; saveList(); if(current) $("#btnList").textContent = "Add to short list"; });
  $("#slTable").addEventListener("click", e=>{ const b = e.target.closest("[data-rm]"); if(b){ LIST.splice(+b.dataset.rm,1); saveList(); } });
  $("#btnSketch").addEventListener("click", ()=>{ if(SKETCH) endSketch(); else startSketch(); });
  $("#sketchUndo").addEventListener("click", ()=>{ if(SKETCH){ SKETCH.pts.pop(); updSketch(); } });
  $("#sketchCancel").addEventListener("click", ()=>endSketch());
  $("#sketchDone").addEventListener("click", finishSketch);
  $("#sheet").addEventListener("click", e=>{
    if(SKETCH){ const [px,py] = svgPoint(e); if(px<DX||px>DX+DW||py<DY||py>DY+DH) return; SKETCH.pts.push(sheetXform(SKETCH.base).inv(px,py)); updSketch(); return; }
    const p = e.target.closest(".adjp"); if(p) toggleNeighbor(p.dataset.oid);
  });
  document.addEventListener("click", e=>{ const b = e.target.closest(".pick"); if(!b) return; if(SKETCH) endSketch(); screen(b.dataset.ll); });
  $("#matchBox").addEventListener("click", e=>{ const b = e.target.closest("[data-m]"); if(b) onMatch(b.dataset.m); });
  $("#btnProposal").addEventListener("click", ()=>{ const r = $('#reqForm input[name="want"][value="proposal"]'); if(r){ r.checked = true; updWant(); } });
  $("#reqForm").addEventListener("change", e=>{ if(e.target.name === "want") updWant(); if(e.target.name === "tract" && current){ current.confirm = e.target.value; renderMatch(current); } });
  if(DRY) document.body.classList.add("dry");
  $("#reqForm").addEventListener("submit", submitRequest);
  $("#again").addEventListener("click", ()=>{ $("#reqForm").reset(); $("#reqForm").hidden = false; $("#reqDone").hidden = true; $("#loc").focus(); window.scrollTo({top:0, behavior:"smooth"}); });
  initModelInput(); renderList(); renderMonitor(); heroReel();
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
