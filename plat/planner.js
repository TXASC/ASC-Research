// Plat Planner: pure helpers (no DOM, no network), shared by the page and its Node tests.
// Calendar data, coverage, plat type, the dated path and the paperwork list.
(function (root) {
  "use strict";

  /* ---------- City of Dallas plat submittal calendar ----------
     Source: City of Dallas, "2026 Plat Submittal Calendar (public release)", Planning & Development.
     Columns: submittal window (Wednesday and Thursday, 4:30 PM cutoff), newspaper (Friday 9 AM), CPC meeting (Thursday 12:30 PM).
     Update yearly: add the next year's rows when the city publishes them. Until then, later dates are projected
     from the 2026 rhythm and labeled as projected on the page. */
  const DALLAS_2026 = [
    ["2025-12-17", "2025-12-26", "2026-01-15"],
    ["2026-01-07", "2026-01-16", "2026-02-05"],
    ["2026-01-21", "2026-01-30", "2026-02-19"],
    ["2026-02-04", "2026-02-13", "2026-03-05"],
    ["2026-02-25", "2026-03-06", "2026-03-26"],
    ["2026-03-11", "2026-03-20", "2026-04-09"],
    ["2026-03-25", "2026-04-03", "2026-04-23"],
    ["2026-04-08", "2026-04-17", "2026-05-07"],
    ["2026-04-22", "2026-05-01", "2026-05-21"],
    ["2026-05-13", "2026-05-22", "2026-06-11"],
    ["2026-05-27", "2026-06-05", "2026-06-25"],
    ["2026-06-24", "2026-07-02", "2026-07-23"],
    ["2026-07-08", "2026-07-17", "2026-08-06"],
    ["2026-07-22", "2026-07-31", "2026-08-20"],
    ["2026-08-05", "2026-08-14", "2026-09-03"],
    ["2026-08-19", "2026-08-28", "2026-09-17"],
    ["2026-09-09", "2026-09-18", "2026-10-08"],
    ["2026-09-23", "2026-10-02", "2026-10-22"],
    ["2026-10-07", "2026-10-16", "2026-11-05"],
    ["2026-10-21", "2026-10-30", "2026-11-19"],
    ["2026-11-04", "2026-11-13", "2026-12-03"],
    ["2026-11-18", "2026-11-26", "2026-12-17"],
  ];
  const DALLAS_PUBLISHED_THROUGH = "2026-12-17";

  const DAY = 864e5;
  const d = s => new Date(s + "T12:00:00Z");
  const iso = t => new Date(t).toISOString().slice(0, 10);
  const add = (s, n) => iso(d(s).getTime() + n * DAY);
  const diffDays = (a, b) => Math.round((d(b) - d(a)) / DAY);

  // nth Thursday of a month (UTC noon), n from 1
  function nthThursday(y, m, n) {
    const first = new Date(Date.UTC(y, m, 1, 12));
    const off = (4 - first.getUTCDay() + 7) % 7;
    return iso(Date.UTC(y, m, 1 + off + (n - 1) * 7, 12));
  }

  // Projected hearings after the published calendar: first and third Thursdays, January third only, July fourth only
  // (the 2026 calendar skipped the holiday weeks the same way). Submittal Wed/Thu 29/28 days before, newspaper 20 days before.
  function projectedRows(fromIso, toIso) {
    const out = []; const a = d(fromIso), b = d(toIso);
    for (let y = a.getUTCFullYear(); y <= b.getUTCFullYear(); y++) {
      for (let m = 0; m < 12; m++) {
        const ns = m === 0 ? [3] : m === 6 ? [4] : [1, 3];
        for (const n of ns) {
          const cpc = nthThursday(y, m, n);
          if (cpc > fromIso && cpc <= toIso) out.push([add(cpc, -29), add(cpc, -20), cpc]);
        }
      }
    }
    return out;
  }

  function dallasRows(untilIso) {
    const pub = DALLAS_2026.map(r => ({ submit: r[0], submit2: add(r[0], 1), paper: r[1], cpc: r[2], projected: false }));
    const proj = projectedRows(DALLAS_PUBLISHED_THROUGH, untilIso)
      .map(r => ({ submit: r[0], submit2: add(r[0], 1), paper: r[1], cpc: r[2], projected: true }));
    return pub.concat(proj);
  }

  // Upcoming hearings whose submittal window has not closed, from today.
  function upcoming(todayIso, n) {
    return dallasRows(add(todayIso, 400)).filter(r => r.submit2 >= todayIso).slice(0, n || 8);
  }

  // A planning target: the first hearing whose submittal window opens at least `prepDays` from today.
  function planningTarget(todayIso, prepDays) {
    const rows = upcoming(todayIso, 30);
    return rows.find(r => diffDays(todayIso, r.submit) >= prepDays) || rows[rows.length - 1] || null;
  }

  /* ---------- coverage ---------- */
  // Josh, Nov 24 2026: within about two hours of these cities. Straight-line radius stands in for drive time.
  const HUBS = [
    { name: "Dallas", lat: 32.7767, lng: -96.7970 },
    { name: "Austin", lat: 30.2672, lng: -97.7431 },
    { name: "Houston", lat: 29.7604, lng: -95.3698 },
    { name: "Waco", lat: 31.5493, lng: -97.1467 },
    { name: "Midland", lat: 31.9973, lng: -102.0779 },
    { name: "Sherman", lat: 33.6357, lng: -96.6089 },
  ];
  const RANGE_MILES = 115;
  function miles(a, b) {
    const R = 3958.8, r = x => x * Math.PI / 180;
    const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function nearestHub(p) {
    return HUBS.map(h => ({ hub: h.name, miles: miles(p, h) })).sort((a, b) => a.miles - b.miles)[0];
  }

  // Tier 1: a full city guide (Dallas for now). Tier 2: inside another city. Tier 3: outside city limits.
  const GUIDES = { DALLAS: "dallas" };
  function tierFor(city, p) {
    const near = nearestHub(p), inRange = near.miles <= RANGE_MILES;
    const key = city ? String(city).trim().toUpperCase() : "";
    if (key && GUIDES[key]) return { tier: 1, guide: GUIDES[key], inRange: true, near };
    if (key) return { tier: 2, guide: null, inRange, near };
    return { tier: 3, guide: null, inRange, near };
  }

  /* ---------- the land and the plat ---------- */
  // From the appraisal legal description: a lot and block in an addition reads as already platted;
  // an abstract or acreage tract reads as unplatted. Unknown when neither shows.
  function plattedFromLegal(legal) {
    const s = String(legal || "").toUpperCase();
    if (!s.trim()) return "unknown";
    if (/\b(LOT|LT|LOTS|BLK|BLOCK)\b/.test(s) || /\b(ADDN|ADDITION|SUBD|SUBDIVISION|ESTATES|PHASE|PH)\b/.test(s)) return "platted";
    if (/\b(ABST|ABS|ABSTRACT|A-?\d+|SURVEY|SVY|ACS|ACRES|TR|TRACT)\b/.test(s)) return "acreage";
    return "unknown";
  }

  const GOALS = [
    { id: "combine", label: "Combine lots or tracts into one", short: "Combine" },
    { id: "split", label: "Split into more lots", short: "Split" },
    { id: "line", label: "Move a line between lots", short: "Move a line" },
    { id: "first", label: "Plat raw land so it can be permitted", short: "First plat" },
    { id: "subdivide", label: "Subdivide with new streets or utilities", short: "Subdivide" },
    { id: "fix", label: "Correct a recorded plat", short: "Correct" },
    { id: "unsure", label: "Not sure yet", short: "Not sure" },
  ];

  // Plain-language plat type. Texas Local Government Code 212.0065 lets cities approve minor plats
  // (four or fewer lots, no new streets or utility extensions) and amending plats at staff level.
  function platType(goal, platted) {
    const p = platted === "platted", a = platted === "acreage";
    switch (goal) {
      case "fix": return { name: "Amending plat", why: "Fixes an error or makes a small change to a plat already on record, without replatting the whole thing." };
      case "line": return p ? { name: "Amending plat or replat", why: "Moving a line between platted lots is usually an amending plat; if lot count or a public easement changes, it becomes a replat." }
                              : { name: "Plat", why: "The land is not shown as a platted lot, so the new lines are set by a first plat." };
      case "combine": return p ? { name: "Replat", why: "The lots are already on a recorded plat, so a replat replaces that portion with one lot." }
                                 : { name: a ? "Plat (often a minor plat)" : "Plat or replat", why: "Combining tracts into one buildable lot of record is done with a plat. With four lots or fewer and no new streets, it can be a minor plat." };
      case "split": return p ? { name: "Replat", why: "Splitting a platted lot means replatting it into the new lots." }
                               : { name: "Plat (often a minor plat)", why: "Creating lots from an unplatted tract is a plat. Four lots or fewer with no new streets or utility extensions can be a minor plat." };
      case "first": return { name: "Plat (often a minor plat)", why: "Many cities will not issue a building permit on land that is not a platted lot. A first plat creates that lot." };
      case "subdivide": return { name: "Preliminary plat, then final plat", why: "New streets or utilities need a preliminary plat first, then engineering plans, then a final plat." };
      default: return { name: "We'll confirm the plat type", why: "Tell us what you want to build or change. The city's rules and the recorded history decide the type." };
    }
  }

  /* ---------- paperwork ---------- */
  // who: "you" = owner or buyer side, "asc" = ASC prepares, "city" = city or county. pull: ASC can pull it from public record.
  function paperwork(goal, platted, tier) {
    const replat = platted === "platted" && goal !== "first" && goal !== "subdivide";
    const L = [
      { id: "deed", who: "you", label: "Current recorded deed", note: "The deed that vests title in today's owner.", pull: true },
      { id: "title", who: "you", label: "Title commitment, title policy or tax certificate", note: "Shows who must sign and any liens or easements." },
      { id: "owners", who: "you", label: "Every owner of record, ready to sign", note: "Each owner signs the plat before a notary. Trusts, LLCs and estates sign through the person with authority." },
      { id: "lender", who: "you", label: "Lender sign-off, if the land has a mortgage", note: "Lenders usually sign a consent on the plat. Start this early, since lender sign-offs often take the longest." },
      { id: "zoning", who: "you", label: "Zoning for the property", note: "Lot size, frontage and setbacks come from zoning.", pull: true },
      { id: "plans", who: "you", label: "Site or engineering plans, if you have them", note: "Easements, drives and utility lines on the plat should match the plans." },
      { id: "trees", who: "you", label: "Tree survey, if the city asks for one", note: tier === 1 ? "Dallas lists one with preliminary plat submittals." : "Some cities ask for one with the first submittal." },
    ];
    if (replat) L.splice(5, 0, { id: "prior", who: "you", label: "Copy of the recorded plat being changed", note: "Dallas asks for certified copies of prior plats with a replat.", pull: true });
    L.push(
      { id: "survey", who: "asc", label: "Boundary survey and plat drawing", note: "Field work, record research and a plat drawn to the city's checklist." },
      { id: "monuments", who: "asc", label: "Corner monuments", note: "Set to the city's monument rules after approval, so the lots can be found on the ground." },
      { id: "comments", who: "asc", label: "Responses to review comments", note: "We answer each department's comments in writing and resubmit." },
      { id: "review", who: "city", label: "Review, notice and approval", note: tier === 1 ? "About a dozen Dallas divisions review a plat. Replats may need published notice." : "Departments review, then staff or the planning commission acts." },
      { id: "taxcert", who: "you", label: "Tax certificate and county filing fees at recording", note: "The county clerk will not record without a current tax certificate." },
    );
    return L;
  }

  /* ---------- the dated path ---------- */
  // Returns steps for the page. Dallas (tier 1) carries calendar dates; others carry the Texas sequence.
  function path(opts) {
    const { tier, goal, today, target } = opts;
    const prelim = goal === "subdivide";
    if (tier === 1 && target) {
      const comments = add(target.cpc, -13);
      return [
        { id: "gather", when: today, title: "Gather the owner paperwork", body: "Deed, title, every owner's signature plan and any lender. This is what most often holds a plat, so it starts on day one." },
        { id: "survey", when: null, span: "Planning estimate: about six weeks", title: "Survey and plat drawing", body: "Field work, record research and a plat drawn to the Dallas checklist, then a pre-application meeting with city staff to catch issues before filing." },
        { id: "submit", when: target.submit, when2: target.submit2, title: "Submittal window", body: (prelim ? "Preliminary plat applications are filed through DallasNow and accepted during submittal weeks. " : "Dallas accepts plat applications only on its published Wednesday and Thursday submittal dates. ") + "Cutoff is 4:30 PM. An incomplete application is returned, not held.", projected: target.projected },
        { id: "notice", when: target.paper, title: "Agenda notice published", body: "The case goes on the City Plan Commission agenda. Replats that need public notice are noticed on this schedule.", projected: target.projected },
        { id: "comments", when: comments, title: "Department comments due", body: "Each reviewing division returns comments about two weeks before the hearing. We answer them in writing.", projected: target.projected },
        { id: "cpc", when: target.cpc, title: "City Plan Commission", body: "Thursday, 12:30 PM. Under state law the city must approve, approve with conditions, or disapprove a complete application within 30 days of filing.", projected: target.projected },
        { id: "final", when: null, span: "After approval", title: prelim ? "Engineering plans, then final plat" : "Meet conditions and collect releases", body: prelim ? "Paving, drainage and utility plans are approved before the final plat. The preliminary plat stays valid for up to five years while work moves forward." : "Every department signs a written release. Four signed 24x36 prints, the tax certificate and the county filing fees go in with the final plat." },
        { id: "record", when: null, span: "The last step", title: "Recorded at the county", body: "The owner picks up the signed plat, files it with the county clerk and returns a recorded copy to the city. Building permits and certificates of occupancy follow the recorded plat." },
      ];
    }
    return [
      { id: "gather", when: today, title: "Gather the owner paperwork", body: "Deed, title, every owner's signature plan and any lender. This is what most often holds a plat, so it starts on day one." },
      { id: "survey", when: null, span: "Planning estimate: about six weeks", title: "Survey and plat drawing", body: tier === 3 ? "Field work, record research and a plat drawn to the county's subdivision rules, or the nearby city's if the land is in its extraterritorial jurisdiction." : "Field work, record research and a plat drawn to the city's checklist. We pull the city's submittal calendar when we start." },
      { id: "submit", when: null, span: "On the city's calendar", title: "File a complete application", body: "Cities publish the list of materials a complete application needs, and many accept plats only on set dates. A complete file starts the state review clock." },
      { id: "cpc", when: null, span: "Within 30 days of filing", title: tier === 3 ? "County or city action" : "Planning commission or staff action", body: "State law gives the reviewing body 30 days from a complete filing to approve, approve with conditions, or disapprove. Conditions get a written response, and the city then has 15 days to act on it." },
      { id: "record", when: null, span: "The last step", title: "Recorded at the county", body: "Signed by the city or county, filed with the county clerk with a tax certificate. Permits follow the recorded plat." },
    ];
  }

  // Short plain-language date, e.g. "Wed, Jan 6"
  function fmt(isoDate, withYear) {
    const t = d(isoDate);
    const o = { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" };
    if (withYear) o.year = "numeric";
    return t.toLocaleDateString("en-US", o);
  }

  const api = { DALLAS_2026, DALLAS_PUBLISHED_THROUGH, dallasRows, upcoming, planningTarget, projectedRows, nthThursday,
    HUBS, RANGE_MILES, miles, nearestHub, tierFor, plattedFromLegal, GOALS, platType, paperwork, path, fmt, add, diffDays };
  if (typeof module === "object" && module.exports) module.exports = api; else root.Planner = api;
})(typeof self !== "undefined" ? self : this);
