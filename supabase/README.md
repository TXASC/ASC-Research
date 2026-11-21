# Site Screen packet alert (not deployed)

When a visitor opens their packet, the page inserts a row into `snapshot_requests`
(anon can insert, never read). This adds an email alert to ASC for each request.

1. Pick a mail service (written for Resend; any service with an HTTP API works) and verify a sender address.
2. `supabase functions deploy packet-alert --no-verify-jwt`
3. `supabase secrets set RESEND_API_KEY=... ALERT_TO=... ALERT_FROM=... HOOK_SECRET=...`
4. Fill in and apply `migrations/packet_alert_trigger.sql`.
5. Test with a row whose name does not start with TEST (TEST rows are skipped by the page and by the function).

Nothing here runs until these steps are done with Josh's go-ahead.
