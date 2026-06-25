# Mei Pelle Rename Audit

Date: 2026-06-25

Customer-facing brand language has moved from `Mei-Pelle` / `MEI-PELLE` to
`Mei Pelle` / `MEI PELLE`.

The filename keeps `mei-pelle` as a stable technical identifier.

## Updated Customer-Facing Surfaces

- global wordmark text and accessible label
- footer wordmark, copyright, newsletter note, and links
- page metadata and Open Graph site names
- About, Method, FAQ, Contact, cart, Checkout, account, rewards, legal, and
  support content
- product catalog display copy, alt text, SEO titles, and tests
- visible tests and e2e expectations

The navbar change is text-only. No navbar layout, scroll, sheet, cart drawer,
focus-return, mobile menu, or behavior code was modified.

## Preserved Technical Identifiers

The following remain intentionally hyphenated or underscored:

- repository directory: `/Users/brandonlee/Desktop/mei-pelle`
- package name: `mei-pelle`
- Supabase storage bucket: `mei-pelle-catalog`
- guest cart cookie: `mei_pelle_guest_cart`
- Algolia index examples: `mei_pelle_products`
- catalog source filenames such as `leaders-mei-pelle-source.ts`
- migration filenames and historical migration comments
- deterministic UUID seeds and backup paths used by scripts
- media asset URLs such as `/media/home/mei-pelle-hero.mp4`
- referral hash salt `:mei-pelle-referral`

These values are infrastructure, migration, URL, cookie, cache, or compatibility
identifiers and should not be renamed without a dedicated migration plan.

## Remaining Historical References

Historical docs and migrations may mention the old display form when describing
past implementation decisions or stable technical filenames. They are not
customer-facing runtime UI. Current architecture docs should use `Mei Pelle`.

## Verification Searches

Customer-facing runtime paths were searched for:

- `Mei-Pelle`
- `MEI-PELLE`
- `Mei‑Pelle`
- `MEI‑PELLE`
- `Mei–Pelle`

The remaining lowercase `mei-pelle` matches are classified as technical
identifiers unless a future audit identifies a runtime display leak.
