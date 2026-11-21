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

A free, preliminary public-record screen for Texas land: appraisal parcel and neighbors, FEMA floodplain, NWI wetlands, mapped streams, SSURGO soils, USGS 3DEP terrain, HIFLD transmission proximity and city limits, drawn on one disclaimed sheet with a terrain model, a printable brief, a short list, bulk paste and a proposal request.

- Static files only (`screen/index.html`, `screen.css`, `screen.js`, `img/`). Every lookup goes from the visitor's browser to the public service.
- Proposal requests insert into `snapshot_requests` (kind `request`, goal `screen:<stage>`). The anonymous role can insert but cannot read rows.
- `noindex,nofollow` until an ASC-domain launch is approved. Add `?dry=1` (or start the name with `TEST`) to walk the proposal flow without writing a row.
