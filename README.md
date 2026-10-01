# ASC Research

The public entry page for Adams Surveying's deed and plat research service.

Users sign in with their email and enter a property address. They get back the subject parcel, its adjoiners, the deeds and plats with official search links, and a downloadable research package.

This repository holds **only the static page**:
- The research itself runs on Adams Surveying's research computer.
- The page and that computer talk through a small Supabase project.
- Every database read and write is protected by row-level security.
- `config.js` holds only the publishable key, which is safe to publish.
- No secret key, research code or customer data is stored here.
