// Request alert: emails ASC when a visitor sends a request from any public tool page
// (Site Screen, Plat Planner, and the ALTA and Boundary pages to come).
// NOT DEPLOYED. Needs Josh's go-ahead and a mail service key. Alerts go to surveytx@txasc.com by default.
//
// Secrets (set with `supabase secrets set`, never committed):
//   RESEND_API_KEY  - mail service key (Resend). Swap sendMail() for another service if ASC prefers.
//   ALERT_TO        - where alerts go; defaults to surveytx@txasc.com
//   ALERT_FROM      - verified sender, e.g. "ASC Website <requests@txasc.com>"
//   HOOK_SECRET     - shared secret the database trigger sends in x-hook-secret
//
// The visitor never sees this function: the page only inserts a row, and the
// database calls this function with the new row. Rows whose name starts with TEST are skipped.

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const PAGE_NAME: Record<string, string> = { screen: "Site Screen", plat: "Plat Planner", alta: "ALTA order", boundary: "Boundary request" };

export function buildAlert(r: any) {
  const p = r.packet ?? {};
  const page = PAGE_NAME[p.page ?? "screen"] ?? "Website request";
  const rec = p.record ?? {};
  const failed = (p.failed_layers ?? []).join(", ");
  const rows: [string, unknown][] = [
    ["Name", r.name], ["Company", r.company], ["Email", r.email], ["Phone", r.phone],
    ["I'm a", p.client_type ?? r.role], ["Timing", r.timing], ["Stage", p.stage], ["Site type", r.site_type], ["Goal", r.goal],
    ["Wants a proposal", r.wants_proposal ? "Yes" : r.wants_proposal === false ? "No" : null],
    ["Location", r.location], ["County", r.county], ["Acres (GIS, approx.)", r.acres],
    ["Legal description (appraisal record)", rec.legal], ["Deed reference", rec.deed ? `${rec.deed}${rec.deed_date ? ", dated " + rec.deed_date : ""}` : null],
    ["Deed source", rec.deed_source ? `${rec.deed_source}${rec.appraisal_year ? ", appraisal year " + rec.appraisal_year : ""}` : null],
    ["City plat record (reference only)", rec.plat],
    ["Tract confirmed as", p.tract_confirm], ["Partner link", p.partner],
    ["Outside mapped floodplain (approx.)", r.pct_outside_floodplain == null ? null : r.pct_outside_floodplain + "%"],
    ["FEMA map effective", p.fema_effective], ["Layers that did not answer", p.page === "screen" || !p.page ? (failed || "None") : null],
    ["Our read", r.survey], ["Screen no.", p.screen_no], ["Note", r.note],
  ];
  const html = `<p>A ${esc(page)} request came in from the website.${p.link ? ` Their screen is at <a href="${esc(p.link)}">${esc(p.link)}</a>.` : ""}</p>
<table cellpadding="4" style="border-collapse:collapse;font:14px Arial">${rows.filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `<tr><td style="color:#555;vertical-align:top">${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</table>
${(p.list ?? []).length ? `<p>Short list:</p><ul>${p.list.map((x: any) => `<li><a href="${esc(x.url)}">${esc(x.title)}</a> (${esc(x.acres)} ac)</li>`).join("")}</ul>` : ""}
<p style="color:#777;font:12px Arial">Reply to this email to answer the client directly.</p>`;
  const subject = `${page}: ${r.name ?? "website visitor"}${r.company ? ", " + r.company : ""}${r.wants_proposal ? " (wants a proposal)" : ""}`;
  return { subject, html };
}

async function sendMail(to: string, replyTo: string | null, subject: string, html: string) {
  return await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: Deno.env.get("ALERT_FROM"), to: [to], ...(replyTo ? { reply_to: replyTo } : {}), subject, html }),
  });
}

if (typeof Deno !== "undefined" && Deno.serve) Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method", { status: 405 });
  if (req.headers.get("x-hook-secret") !== Deno.env.get("HOOK_SECRET")) return new Response("forbidden", { status: 403 });
  const { record: r } = await req.json();
  if (!r || r.kind !== "request") return new Response("skip");
  if (/^TEST\b/i.test(r.name ?? "")) return new Response("test row, no alert");
  const { subject, html } = buildAlert(r);
  const res = await sendMail(Deno.env.get("ALERT_TO") || "surveytx@txasc.com", r.email || null, subject, html);
  return new Response(res.ok ? "sent" : "mail error " + res.status, { status: res.ok ? 200 : 502 });
});
