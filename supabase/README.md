# Request alerts (not deployed)

When a visitor sends a request from a tool page (Site Screen, Plat Planner, and the ALTA and Boundary pages
to come), the page inserts a row into `snapshot_requests` (anon can insert, never read). This adds an email
alert to ASC for each real request. Alerts go to surveytx@txasc.com unless `ALERT_TO` says otherwise.
No Podio: Podio is being replaced, so email is the only route for now.

1. Pick a mail service (written for Resend; any service with an HTTP API works) and verify a sender address.
2. `supabase functions deploy packet-alert --no-verify-jwt`
3. `supabase secrets set RESEND_API_KEY=... ALERT_FROM=... HOOK_SECRET=...` (and `ALERT_TO=...` to change the inbox)
4. Fill in and apply `migrations/packet_alert_trigger.sql`.
5. Test: a row whose name starts with TEST writes nothing from the page and sends no email. A real request
   should reach the inbox within a minute. Add the sender to the inbox's safe senders so it doesn't land in Junk.

Nothing here runs until these steps are done with Josh's go-ahead.
