# Mei Pelle Data Practices Inventory

Date: 2026-06-25

This inventory reflects the repository implementation at inspection time. It is
not a final public legal review.

| Flow | Data collected | Purpose | Source | Storage/provider | Retention known? | Essential? | Consent required? | Access/correction/deletion | Browser exposure | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Supabase authentication | Email, password credential, auth session metadata | Sign up, sign in, password reset, session management | Account forms and auth callbacks | Supabase Auth, Supabase cookies | Provider-defined; not specified in repo | Yes for accounts | User action creates account | Account access/profile update available; deletion workflow unresolved | Session cookies exposed as needed by Supabase SSR/browser client | Active |
| Profile records | Optional first and last name, user id | Account dashboard profile | Account dashboard | Supabase `profiles` table | Until changed/removed; deletion workflow unresolved | No | User action | User can update names in account page | Not public | Active |
| Guest cart | High-entropy guest token cookie; server stores token hash | Maintain guest cart and merge after sign-in | Cart API/server actions | HttpOnly cookie `mei_pelle_guest_cart`; Supabase `carts` and `cart_items` | Cookie max age 60 days; guest cart expiration timestamp | Yes for guest cart | Essential site function | User can remove/clear cart items; token deletion only through merge/expiry currently | Raw token is HttpOnly; hash is server-side | Active |
| Authenticated cart | Product id, variant key, quantity, user id, cart status | Persist cart across sessions/devices | Cart UI/API | Supabase `carts` and `cart_items` | Not fully defined in repo | Yes for cart/account | User action | User can remove/clear cart items | Cart state returned to browser for UI | Active |
| Catalog and PDP reads | Product and variant catalog data | Storefront display, cart validation, search sync | Supabase catalog tables | Supabase, Next/Vercel cache | Cache revalidation configured for catalog reads | Yes | No | Public catalog only | Public storefront-safe data | Active |
| Algolia search | Search query and storefront-safe product hit data | Interactive search | Search overlay/page | Algolia lite client with public search key | Provider-defined; not specified in repo | No, but used for search | User submits/searches | Not exposed in app | Query sent from browser to Algolia | Active when env configured |
| Contact form | Name, email, inquiry type, subject, message in browser state | Local validation only | Contact page | Not transmitted or stored | Not applicable | No | User action | No server record exists | Values remain in browser until navigation/clear | Planned only |
| Newsletter updates | None | Footer updates placeholder | Footer | No provider/table/form submission | Not applicable | No | No collection | Not applicable | No email input rendered | Not configured |
| Cookie preferences | Essential-only acknowledgement value | Remember current cookie preference acknowledgement | Cookie Preferences dialog | Browser cookie `mei_pelle_cookie_preferences` | One year max-age | Yes for preference control | User action | Can resave preference | Cookie visible to browser | Implemented in this task |
| Analytics | None found | Not applicable | Not implemented | None | Not applicable | No | Not applicable | Not applicable | None | Not active |
| Advertising/pixels | None found | Not applicable | Not implemented | None | Not applicable | No | Not applicable | Not applicable | None | Not active |
| Payments/checkout | Stripe Checkout Session ID, PaymentIntent ID, sandbox payment status, order number, totals, tax/shipping amounts | Sandbox payment simulation and order finalization | Cart checkout route, Stripe webhook, success fallback | Supabase order/payment tables; Stripe sandbox | Retained as auditable sandbox transaction history | Yes for sandbox checkout | User action starts Checkout | Account users can view own orders; admin deletion/reconciliation unresolved | No card data exposed or stored by Mei Pelle | Active sandbox only |
| Shipping/orders/returns | Sandbox shipping/billing snapshots, customer email from Stripe, item snapshots, refund status | Sandbox order confirmation, history, refund/rewards reconciliation | Stripe Checkout and webhooks | Supabase orders/order_items/payment_attempts | Retained as auditable sandbox history | Yes for sandbox checkout | User action starts Checkout | Account users can view own orders; guest confirmation is narrowly scoped | Confirmation pages show limited order details | Active sandbox only |
| Rewards/referrals/private feedback | Loyalty balance, ledger entries, referral codes, referral attribution, private feedback rating/comments, reward status | Earn/redeem points, referrals, and private first-party feedback rewards | Account, rewards, checkout, webhook, private-feedback route | Supabase loyalty/referral/private_feedback tables | Retained as auditable rewards history | No | Account action and eligible paid sandbox order | Users can read own rewards state; direct writes are server-only | Own account/rewards UI only | Active |
| Trustpilot invitations | None sent from sandbox orders | Future neutral invitation boundary | Server provider boundary | No live Trustpilot API call in sandbox | Not applicable | No | Not active | Not applicable | Not exposed | Not configured |
| File uploads | None | Not available | Not implemented | None | Not applicable | No | Not applicable | Not applicable | None | Not implemented |
| CAPTCHA | None found | Not applicable | Not implemented | None | Not applicable | No | Not applicable | Not applicable | None | Not active |
| Web fonts | IP/device request metadata may be processed by font provider | Font delivery | Browser font requests | Google Fonts | Provider-defined; not specified in repo | Functional presentation | Launch/legal review needed | Provider controls | Browser requests fonts | Active |
| Hosting/server logs | Request metadata, route, status, technical logs | Hosting, security, debugging | Next/Vercel runtime | Vercel/Next infrastructure | Provider-defined; not specified in repo | Yes | Usually no for essential hosting | Provider/admin process needed | Limited to technical data | Active |

## Launch Review Needed

- Final privacy contact channel.
- Account deletion workflow.
- Provider retention windows.
- Whether Google Fonts should be self-hosted before launch.
- Whether analytics, marketing email, or support transport will be added.
- Final state privacy disclosures and request verification process.
