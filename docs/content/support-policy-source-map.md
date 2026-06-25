# Support and Policy Source Map

Last updated: June 24, 2026

This document records the reference audit used for Mei Pelle support, FAQ,
shipping, returns, contact, footer, and legal-policy content. It is a source
map, not copy guidance. Mei Pelle copy must remain original, stack-specific,
and aligned with implemented functionality.

## References Reviewed

| Source | Pages inspected | Useful pattern | Mei Pelle decision |
| --- | --- | --- | --- |
| Rhode Skin | `https://www.rhodeskin.com/pages/faq`, `https://www.rhodeskin.com/products/pocket-bronze-bake` | A single FAQ hub with category anchors for offers, products, shipping, orders, returns, and contact; footer routes legal and support links together. | Use one canonical `/faq` with anchored categories for products, accounts, orders, shipping, returns, rewards, contact, and policies. Do not copy Rhode naming, claims, brand voice, free-shipping threshold, imagery, product identity, or trade dress. |
| EMStore | `https://emstore.com/pages/customer-service` | Customer-service hub combines account, product, shipping, return, rewards, contact, wholesale, and order-status education. Chrome inspection was blocked by LavaMoat scuttling; fetched HTML was used for text-structure review. | Use the hub pattern and broad topic coverage. Do not copy EMStore phone/email/address, rewards mechanics, brand claims, shipping prices, return fees, or manufacturer references. |
| Leaders Cosmetics USA | `https://www.leaderscosmeticsusa.com/pages/shipping-and-handling`, `https://www.leaderscosmeticsusa.com/pages/return-and-exchanges`, `https://www.leaderscosmeticsusa.com/pages/contact-us`, `https://www.leaderscosmeticsusa.com/pages/royalty-rewards`, `https://www.leaderscosmeticsusa.com/` | Clear footer customer-service group; free U.S. ground shipping over `$50`; U.S.-only shipping; 2 to 5 business-day processing; tracking update window; 30-day returns; damaged-item contact window; rewards page only when a rewards system exists. | Adopt the requested Mei Pelle `$50+` standard shipping threshold as a shared constant. Keep shipping/returns in `/faq` anchors. Add a real `/rewards` page now that account-backed points, referrals, and private feedback exist. |

## Final Mei Pelle Content Rules

- Canonical support hub is `/faq`.
- Footer Support links are FAQ, Contact, Shipping (`/faq#shipping`), and Returns & Refunds (`/faq#returns`).
- Footer Legal links are Privacy (`/privacy`), Terms (`/terms`), and Accessibility (`/accessibility`).
- Cookie Policy and Your Privacy Choices remain available as utility links, not primary legal group links.
- A standalone Rewards footer link may appear because a rewards, referral, and private-feedback engine now exists.
- Contact page omits a form because no verified support email, ticketing provider, or message transport is configured.
- Customer-facing copy must not present checkout, payment, fulfillment, order support, or rewards features that do not exist.
- Public pages should avoid internal status language such as "development storefront", "demo", "test store", or "placeholder".

## Policy Constants

- Free standard shipping threshold: `$50+`
- Shared threshold source: `FREE_STANDARD_SHIPPING_THRESHOLD_CENTS = 5000`
- Qualification helper: `qualifiesForFreeStandardShipping(subtotalCents)`
- Planned shipping destination: United States
- Planned order processing: 2 to 5 business days
- Planned standard transit estimate: 3 to 10 business days after carrier pickup
- Planned tracking update window: 24 to 48 hours after carrier acceptance
- Planned return window: 30 days from delivery for eligible items
- Planned damaged, missing, or incorrect item report window: 7 days from delivery
- Planned refund processing estimate: 1 to 2 weeks after approved return receipt and inspection

## Known Launch Blockers

- Publish and verify a public support destination before enabling message submission.
- Publish and verify a privacy request intake channel before relying on customer-submitted privacy requests.
- Review legal policies with counsel before public launch, checkout, order support, shipping, returns, rewards, marketing email, analytics, or advertising technology are enabled.
- Do not enable checkout, payment, fulfillment, live orders, or rewards UI until the underlying systems exist.
