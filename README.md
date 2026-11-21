# ASC Research

The public entry page for Adams Surveying's deed and plat research service.

Users sign in with their email and enter a property address. They get back the subject parcel, its adjoiners, the deeds and plats with official search links, and a downloadable research package.

This repository holds **only the static page**:
- The research itself runs on Adams Surveying's research computer.
- The page and that computer talk through a small Supabase project.
- Every database read and write is protected by row-level security.
- `config.js` holds only the publishable key, which is safe to publish.
- No secret key, research code or customer data is stored here.

## Site Screen preview (`/screen/`)

A free, preliminary public-record screen for Texas land: appraisal parcel and neighbors, FEMA floodplain, NWI wetlands, mapped streams, SSURGO soils, USGS 3DEP terrain, HIFLD transmission proximity and city limits, drawn on ASC's 24x36 sheet template (title strip, vicinity map, notes, flood statement, legend) with a terrain model, plain-language insights, a short list and bulk paste. Styled after the "Copy of TXASC" staging site.

- Static files only (`screen/index.html`, `screen.css`, `screen.js`, `img/`). Every lookup goes from the visitor's browser to the public service.
- Nothing downloads or prints from the public page. The full packet is requested with contact details and emailed by ASC. Requests insert into `snapshot_requests` (kind `request`, goal `packet:<stage>` or `packet+proposal:<stage>`, plus `company`, `note`, `wants_proposal` and a `packet` JSON with the share link and short list). `packet_status` defaults to `pending`. The anonymous role can insert but cannot read rows.
- Staff: open the share link from a request with `&staff=1` to unlock the brief and print the packet (11x17 landscape, sheet then brief). This is a front-end switch, not security; automatic sending needs a server-side function.
- `noindex,nofollow` until an ASC-domain launch is approved. Add `?dry=1` (or start the name with `TEST`) to walk the packet request without writing a row.
