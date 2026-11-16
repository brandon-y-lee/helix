# Helix mobile service, account, and policy evidence

Observed 2026-09-10 on the existing local development server at `http://127.0.0.1:3100`, in the Codex in-app Browser. This is the bounded service-route contribution to the independent Helix design audit, not a claim to have audited Rhode or signed-in commerce.

## Method and limits

- All 16 routes below were actually opened at **390 × 844 mobile** and **1440 × 1000 desktop**. Full rendered DOM snapshots, text, heading/control rectangles, page widths/heights, and full-page screenshots were captured. Measurements are CSS pixels and rounded. The shared footer is included in page height.
- Representative screenshots were additionally inspected at viewport scale: FAQ landing and shipping section, contact, accessibility title, cookie table, cookie modal, rewards cards, account sign-in, and empty cart; desktop contact and sign-in were visually compared. Capturing every full-page screenshot is not equivalent to manually scrutinizing every pixel of every long page.
- Read `CONTEXT-MAP.md` and Brand & Platform, People & Access, Ordering & Payment, Rewards & Referrals, Service & Fulfillment, and Trust & Policy context docs. No application source, git state, accounts, catalog, remote data, forms, or payment state was changed. No forms were submitted, no credentials entered, and no purchases attempted.
- Public/guest states only. No authenticated account overview, orders, balances, populated carts, provider checkout, validation/submission errors, actual mobile keyboard, safe-area hardware, screen-reader session, zoom/reflow, reduced-motion, or 320/360/414/768 widths were tested here.
- The local Next development badge appears in screenshots. Initial navigation often captures cart loading before hydration. Follow-up inspection confirmed the empty cart at both sizes; this audit does **not** diagnose an indefinite cart-loading bug.

## Route coverage

Every row has both viewport captures and a complete rendered DOM snapshot in `outputs/mobile-audit/helix/services/route-measurements.json`.

| Route | Public state observed | Mobile / desktop total height | Layout evidence |
| --- | --- | ---: | --- |
| `/faq` | Eight categories, first question expanded in each | 8024 / 6846 | Desktop left category rail + question column becomes a stacked category list before all questions. Mobile category list y360–635; first category heading y681; first question starts about y800. |
| `/contact` | Support Intake unavailable; no form or verified support channel | 3989 / 3227 | Desktop hero + side status, then columns; mobile stacks hero, unavailable card, status card, nine inquiry types, three supporting cards. Inquiry types begins y985; helpful details y1931. |
| `/privacy` | Factual prelaunch summary, NOT IN EFFECT | 9166 / 6986 | Mobile two-line H1, long preamble, 13-item TOC, then cards. First substantive heading y1227. Desktop TOC sits to left of text column. |
| `/terms` | Factual prelaunch service boundary, NOT IN EFFECT | 5246 / 4511 | Mobile two-line title + preamble + seven-item TOC. First section y981. |
| `/privacy-choices` | Optional advertising/analytics inactive; no opt-out toggle | 3733 / 3609 | Three-line mobile title; four-item TOC and status/action card; first section y1280. Cookie notice and Privacy Policy controls remain available. |
| `/accessibility` | Commitment/target, no conformance claim, NOT IN EFFECT | 4003 / 3830 | Two-line mobile title nearly fills width; first section y908. Body remains readable. |
| `/cookie-policy` | Required/functional storage summary; optional categories inactive | 4404 / 4135 | Mobile TOC followed by a horizontally scrolling five-column table and prose sections. Table is 731px wide in a 352px viewport; first prose section y1774. |
| `/account/sign-in` | Empty email/password form | 2044 / 2312 | Mobile removes desktop image/story half but retains a tall white card. Title y305, inputs y374 and y445, action y517. |
| `/account/sign-up` | Empty first name/last name/email/password form | 2044 / 2312 | Title y237, four single-column fields, action y586. Desktop image + form split. |
| `/account/forgot-password` | Empty email form | 2044 / 2312 | Title y338, email y406, action y478; substantial empty lead-in. Desktop image + form split. |
| `/account/reset-password` | Expired/invalid reset link and recovery link | 2009 / 2312 | Centered status card; title y335; recovery action y489. No password entry state tested. |
| `/account/service-unavailable` | Temporary account verification failure message; session not cleared | 2009 / 2312 | Centered status card; mobile title occupies three lines starting y302. Retry control fits. |
| `/cart` | Initial loading, then verified empty cart | 2009 / 2312 | Mobile H1 y110; settled empty message and 50px-high Browse the System action; content min-height 844. Desktop same basic empty layout with wider margins. |
| `/checkout` | Sandbox-only explanatory page and Review cart link | 2009 / 2312 | Mobile 32px H1; factual sandbox notice/prose wraps and action y397. This is not Stripe-hosted checkout. |
| `/rewards` | Guest program description; no signed-in balance or ledger | 3514 / 2379 | Desktop two-column six-card grid becomes six stacked mobile cards. Intro lasts to about y500, Redemption Tiers y554, Referrals y1139, Your Points y1441. |
| `/mobile-audit-not-found` | Helix not-found message and collection link | 2009 / 2312 | Mobile H1 y110, explanatory text, 50px action y266; large empty remaining main area. |

## Blunt design findings

1. **The service experience mostly collapses desktop columns; it does not reprioritize mobile tasks.** FAQ makes a visitor pass eight category links before seeing an answer. Privacy spends almost 1.5 screens on title, truthful prelaunch context, and table of contents before the first section. Contact repeats its unavailable status before useful preparation content. Preserve the facts, but use a compact mobile introduction and collapsible section navigation. The status must remain prominent, not repeated as a sequence of equally weighted cards.
2. **The legal display scale is too aggressive for a utility page.** Shared mobile H1 is 66.3px with 55.7px line height; desktop H1 is 168px. Accessibility's first text line reaches x374, beyond its x372 content boundary but still within the 390px viewport. No actual viewport clipping was observed at this width. A mobile utility-heading scale around 40–48px with normal readable line height would release space and make the hierarchy less theatrical. Confirm final values against the separate Rhode evidence.
3. **The cookie table preserves desktop reading mechanics.** At 390px, only category, status, and part of examples are visible; purpose and optional status require horizontal scrolling. The container prevents document overflow, but the reader must pan a tall 806px table to assemble each row. A mobile labeled-row/card view can expose all five facts without sideways travel; keep equivalent table semantics and facts.
4. **Account forms fit, but the large empty card is wasted mobile space.** Sign-in's white card starts near y78 and extends to y828, while actual content begins at y305. The desktop image disappears appropriately, but its visual balance is replaced by blank space. Use compact top alignment and deliberate page padding on mobile while retaining the useful 16px input type and 54px input height. Do not change the authentication flow.
5. **Rewards reads like six equal information boxes.** Three redemption entries each repeat the numeric discount in two formats (`$5 off` and `$5.00`, etc.) and break each value onto separate lines. The mobile Redemption Tiers card consumes roughly 565px before Referrals. Compact rows could make the tier comparison immediate; put the guest account action near the top without altering eligibility, amounts, or program rules.
6. **Shared micro-controls need intentional touch sizing.** Mobile Menu is about 40×35px and Cart 37×35px. Form actions are about 43px high. Standalone legal TOC links are approximately 22px high, FAQ category rows 26px high. This is a design target finding, not a blanket WCAG failure: spacing exceptions and actual pointer conditions were not fully audited. Standardize principal interactive hit areas near 44px, preserving readable density for inline prose links.
7. **The footer remains substantial even in mobile accordion mode.** The shared footer adds about 1165px at 390px. It is already responsive, but the logo, unavailable social/review/method statuses, service panels, and four closed navigation accordions still make a long tail. Consolidation must retain factual status and access to policies; it must not invent live payments, ratings, shipping, or support.

## Interaction checks

- FAQ Shipping jump link worked, leaving the category region about 86px below the top so it cleared the fixed header. Native disclosure click expanded the destination answer; Enter collapsed it. The focused summary showed a visible 2px green outline. Question summary targets were approximately 352×68px or 352×91px, comfortably usable.
- Cookie notice opened as a 350×760px centered modal with 20px horizontal margin. It scrolled internally to reach Acknowledge notice and Done. Tab moved Close → Acknowledge notice → Done → Close; Escape closed it and restored focus to the footer Cookie notice trigger. No acknowledgement was submitted. Body-scroll locking was not conclusively verified, so do not infer a pass/fail from this audit.
- Sign-in's first keyboard stop exposed the visible Skip to main content link with a 2px outline. Form fields have accessible labels. Submission, validation, and native phone keyboard behavior remain untested.
- Measured document `scrollWidth` equaled viewport width on every route at both sizes. This rules out whole-document horizontal overflow in these observed states, not clipped descendants or other breakpoints.

## Evidence files

Full-page route screenshots use route names with slashes replaced by underscores and `-mobile.png` / `-desktop.png`. The FAQ and top-level policy filenames retain their plain names. Initial cart captures intentionally preserve the loading state; use `cart-mobile-final.png` and `cart-desktop-final.png` for the verified empty state.

- [FAQ mobile](../../outputs/mobile-audit/helix/services/faq-mobile.png)
- [Contact mobile](../../outputs/mobile-audit/helix/services/contact-mobile.png) and [desktop](../../outputs/mobile-audit/helix/services/contact-desktop.png)
- [Accessibility mobile](../../outputs/mobile-audit/helix/services/accessibility-mobile.png)
- [Cookie table mobile](../../outputs/mobile-audit/helix/services/cookie-policy-mobile.png)
- [Cookie notice mobile](../../outputs/mobile-audit/helix/services/cookie-notice-mobile.png)
- [Sign-in mobile](../../outputs/mobile-audit/helix/services/account_sign-in-mobile.png) and [desktop](../../outputs/mobile-audit/helix/services/account_sign-in-desktop.png)
- [Rewards mobile](../../outputs/mobile-audit/helix/services/rewards-mobile.png)
- [Verified empty cart mobile](../../outputs/mobile-audit/helix/services/cart-mobile-final.png)
- [Rendered route measurements and snapshots](../../outputs/mobile-audit/helix/services/route-measurements.json)

No implementation, automated tests, commits, pushes, remote mutations, or extra worktrees were performed by this supporting audit agent. The parent-created planning worktree was used throughout.
