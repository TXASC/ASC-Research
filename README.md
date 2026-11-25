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
- Engine notes (Nov 25): Dallas legal and deed references come from the current Dallas CAD roll (City of Dallas tax account points, Legal1-4), each shown with its source, appraisal year and deed date; the 2019 DallasTaxParcels layer is no longer read. Dallas plat references come from the City of Dallas plat parcels layer, labeled reference only. Address searches check the city and house number against the appraisal roll and move to the parcel the roll lists at that address. Map reads retry dropped requests and switch to a form POST. Stacked condo records collapse to one neighbor. Tests: `node --test tests/screen-engine.test.js`.
- `noindex,nofollow` until an ASC-domain launch is approved. Add `?dry=1` (or start the name with `TEST`) to walk the packet request without writing a row.

## Plat Planner preview (`/plat/`)

A free plat and replat planner. The visitor enters a location and a plain-language goal (combine, split, move a line, first plat, subdivide, correct). The page reads city limits and the appraisal record, picks the likely plat type (platted lot vs. acreage tract from the legal description), and lays out the path:

- **Tier 1 (City of Dallas):** dated steps from the city's 2026 Plat Submittal Calendar (submittal window, agenda notice, comments due, City Plan Commission), with a target-hearing picker. Dates after 12/17/2026 are projected from the 2026 rhythm and labeled "Projected" until the city publishes its next calendar. Add the new rows to `DALLAS_2026` in `plat/planner.js` each year.
- **Tier 2 (another city):** the Texas plat sequence and the Chapter 212 30-day / 15-day clock.
- **Tier 3 (outside city limits):** county or ETJ path.
- Coverage: within ~115 straight-line miles of Dallas, Austin, Houston, Waco, Midland or Sherman; farther out still accepts a request.
- "What to gather" checklist (owner side / ASC / city) with have / need help / you pull it marks, and a "Start my plat" request that inserts into `snapshot_requests` (kind `request`, goal `plat:<goal>`, site_type `plat`, timing = target CPC date, `packet` JSON with city, tier, plat type, target and checklist marks).
- `?demo=1` uses a sample Dallas lot with no lookups; `?dry=1` (or a name starting TEST) sends nothing. `noindex,nofollow`.
- Pure logic lives in `plat/planner.js` (tests: `node --test tests/planner.test.js`).
