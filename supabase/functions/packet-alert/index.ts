// Site Screen packet alert: emails ASC when someone requests a packet.
// NOT DEPLOYED. Needs Josh's yes, a mail service key and the alert address.
//
// Secrets (set with `supabase secrets set`, never committed):
//   RESEND_API_KEY  - mail service key (Resend; swap the fetch below for another service)
//   ALERT_TO        - where alerts go (an ASC inbox Josh chooses)
//   ALERT_FROM      - verified sender, e.g. "Site Screen <screen@yourdomain>"
//   HOOK_SECRET     - shared secret the database trigger sends in x-hook-secret
//
// The visitor never sees this function: the page only inserts a row, and the
// database calls this function with the new row.

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method", { status: 405 });
  if (req.headers.get("x-hook-secret") !== Deno.env.get("HOOK_SECRET")) return new Response("forbidden", { status: 403 });

  const { record: r } = await req.json();
  if (!r || r.kind !== "request") return new Response("skip");
  if (/^TEST\b/i.test(r.name ?? "")) return new Response("test row, no alert");

  const p = r.packet ?? {};
  const failed = (p.failed_layers ?? []).join(", ");
  const rows: [string, unknown][] = [
    ["Name", r.name], ["Company", r.company], ["Email", r.email], ["Phone", r.phone],
    ["Role", r.role], ["Timing", r.timing], ["Stage", p.stage], ["Site type", r.site_type],
    ["Wants a proposal", r.wants_proposal ? "Yes" : "No"], ["Wants records", r.wants_records ? "Yes" : "No"],
    ["Location", r.location], ["County", r.county], ["Acres (GIS, approx.)", r.acres],
    ["Outside mapped floodplain (approx.)", r.pct_outside_floodplain == null ? null : r.pct_outside_floodplain + "%"],
    ["FEMA map effective", p.fema_effective], ["Layers that did not answer", failed || "None"],
    ["Our read", r.survey], ["Screen no.", p.screen_no], ["Note", r.note],
  ];
  const html = `<p>A Site Screen packet was opened. Their screen is at <a href="${esc(p.link)}">${esc(p.link)}</a>.</p>
<table cellpadding="4" style="border-collapse:collapse;font:14px Arial">${rows.filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `<tr><td style="color:#555">${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</table>
${(p.list ?? []).length ? `<p>Short list:</p><ul>${p.list.map((x: any) => `<li><a href="${esc(x.url)}">${esc(x.title)}</a> (${esc(x.acres)} ac)</li>`).join("")}</ul>` : ""}`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("ALERT_FROM"), to: [Deno.env.get("ALERT_TO")], reply_to: r.email,
      subject: `Site Screen packet: ${r.name}${r.company ? ", " + r.company : ""}${r.wants_proposal ? " (wants a proposal)" : ""}`,
      html,
    }),
  });
  return new Response(res.ok ? "sent" : "mail error " + res.status, { status: res.ok ? 200 : 502 });
});
