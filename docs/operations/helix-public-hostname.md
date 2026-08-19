# Helix public hostname

Inventory captured on 2026-08-18 for the staging cutover tracked by #178 and
specified by #175.

## Canonical staging origin

The stable public origin is `https://helixskin.vercel.app`. Application code
must not use a generated Vercel deployment hostname as a public URL fallback.
Local development continues to use an HTTP loopback origin.

The fresh Vercel preflight found `helixskin.vercel.app` valid but initially
assigned to Production. The domain assignment was then changed to the intended
Preview branch `dev`. The resulting non-secret configuration is:

- Team: `Brandon's projects`
- Project: `helix`
- Project ID: `prj_N9nyPL9SixJHOROIovS8PDQ9aKny`
- Connected repository: `brandon-y-lee/mei-pelle`
- Domain: `helixskin.vercel.app`, valid and assigned to Preview branch `dev`
- Preview environment variable for branch `dev`:
  `NEXT_PUBLIC_SITE_URL=https://helixskin.vercel.app`

The controlled hostname resolved to the expected storefront after assignment.
No production deployment was promoted and no live payment configuration was
changed during this cutover.

## Application consumers

`lib/site-url.ts` owns and enforces the canonical deployed origin. Generated
deployment hostnames and stale deployed environment values cannot override it;
only HTTP loopback origins are configurable in local development. Its
consumers include:

- Supabase Auth confirmation and password-recovery redirects in
  `app/account/actions.ts`
- Stripe Checkout return URL construction through `lib/checkout/origin.ts`
- `robots.txt` and sitemap URL generation
- the root metadata base inherited by public routes, including product detail,
  support, privacy, legal, and accessibility routes
- product-detail structured data

`lib/admin/catalog/validation.ts` separately reads `NEXT_PUBLIC_SITE_URL` as
an allowed origin for project-controlled product media. It therefore receives
the branch-scoped canonical value in the `dev` Preview deployment.

## Supabase Auth configuration

The approved non-production Supabase project is `erasogmsqpgiirovubjh`. A
read-only dashboard preflight on 2026-08-19 found the Site URL still set to
`http://localhost:3000` with an empty redirect allowlist. Ticket #181 updated
the hosted Auth configuration to:

- Site URL: `https://helixskin.vercel.app`
- Redirect URL: `https://helixskin.vercel.app/auth/callback`
- Redirect URL: `https://helixskin.vercel.app/auth/confirm`
- Local redirect URL: `http://localhost:3000/auth/callback`
- Local redirect URL: `http://localhost:3000/auth/confirm`

The Site URL and all four exact redirect URLs were visibly re-read after the
update. No wildcard redirect, generated deployment hostname, Auth provider,
template, account, or session setting was changed.

## Catalog webhook follow-on

Seven active public-catalog database webhook triggers were observed in the
approved Supabase project. They cover `products`, `product_variants`,
`product_media`, `product_pdp_content`, `product_slug_routes`,
`product_families`, and `product_family_memberships`. At inventory time they
targeted:

`https://mei-pelle.vercel.app/api/webhooks/supabase/catalog-search-sync`

The intended staging destination for the later webhook cutover ticket is:

`https://helixskin.vercel.app/api/webhooks/supabase/catalog-search-sync`

No database trigger or catalog webhook was changed in #178.

## Stripe follow-on

The intended sandbox webhook destination for a later payment configuration
ticket is:

`https://helixskin.vercel.app/api/webhooks/stripe`

Stripe environment keys were not visible in the Vercel project environment
variable inventory. No Stripe endpoint, key, event, or live-mode setting was
created or changed in #178.
