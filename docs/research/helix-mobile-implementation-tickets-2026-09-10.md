# Helix mobile implementation Tickets

Status: approved by the user on September 10, 2026. These are local planning identifiers, **not GitHub issue numbers**; published issue numbers will be recorded separately. Parent: [Helix mobile design specification](./helix-mobile-design-spec-2026-09-10.md). Audit baseline: `8f30d0ec5745b94c17f630e70a75d25928741ae0`.

Approval covers the five required Tickets below as one Spec. After approval, publish the Spec and native child issues, record native dependencies, create the Spec Branch from exact current remote `dev`, and implement through the canonical Ticket/Spec review gates. No direct merge to `main`; no production promotion or remote catalog/configuration changes are included.

## Dependency map

```text
M1 Shared mobile shopping shell
 ├── M2 Home and product discovery
 ├── M3 Super Serum gallery and purchase
 │    └── M4 Super Serum product education
 └── M5 Editorial, service and account entry

All five integrated → fresh paired design review → Combined Spec Review
→ integration-gate → dev
```

M2, M3 and M5 may proceed independently after M1. M4 consumes M3's explicit pilot presentation boundary. Each Ticket includes its own tests and mobile/desktop evidence; there is no separate catch-all testing Ticket. Shared stylesheet edits must be coordinated in separate worktrees. Only the sole Spec Closer performs final integration with current `dev`.

## M1 — Make navigation, search, cart and footer usable as a mobile shopping shell

**Customer outcome:** A phone visitor can open shopping categories, search directly, inspect the cart and reach footer help without hidden controls, tiny targets or losing their place.

**Scope:** Spec sections 1 and 2; search behavior in section 3. Keep compact header at ≤920px; phone overlay/footer composition at ≤720px. Introduce visible mobile search/cart quantity, image-led collection links, mobile sort-sheet capability, a scrollable cart body with reachable summary/action, and visible two-column footer navigation. Repair mobile focus restoration. Retain existing desktop header/overlay appearance except shared accessibility fixes.

**Likely seams:** `components/shell/Header.tsx`, `SiteFooter.tsx`, `components/overlays/Sheet.tsx`, `components/search/SearchOverlay.tsx`, `SearchView.tsx`, `components/cart/CartDrawer.tsx`, `CartView.tsx`, `app/globals.css`. Keep the existing shared Sheet API unless a narrowly required extension improves all callers.

**Acceptance:**

- At 320, 390 and 430px, menu/search/cart controls do not overlap the centered wordmark and have visible cart count, accessible names and ≥44px targets.
- Menu reaches Shop/Core/Beyond/System/About/account/support; no new catalog request or static product fallback supplies its category imagery.
- Menu → Search → Escape, direct Search → Escape and Cart → Escape each return to a visible trigger with the original viewport restored. No simultaneous traps or background scroll leakage.
- Cart empty, loading, unavailable, populated and update-error states fit the dynamic viewport; totals/action remain reachable without concealing content. Use controlled fixtures for populated/cart-error states.
- Footer retains all current destinations, factual statuses and privacy controls; every group spans its intended column and long labels wrap at 320px.
- Desktop header, footer identities and non-pilot PDP bodies remain intact. Safe-area/keyboard limitations are documented if not device-tested.

**Verification:** Extend header/search/cart/Sheet tests only for changed behavior; update applicable `e2e/home-navbar.spec.ts`, `search.spec.ts`, `footer-support.spec.ts` and controlled cart journeys. Run Ticket Gate; save actual-media Browser screenshots of menu, search, cart and footer at 390 and desktop. Include focus and touch evidence, not only snapshots.

## M2 — Recompose the homepage and collections for mobile discovery

**Customer outcome:** A phone visitor can scan The Core, compare collection products and open Quick Buy without scrolling through three oversized Core cards or reading a cramped in-card form.

**Scope:** Spec section 3, excluding M1-owned search shell. Phone composition ≤720px; Core also uses a two-card-plus-preview rail at 721–900px, retaining its desktop three-column grid above 900px. Reuse the shared carousel for Core and ingredient preview, align Beyond/recommendation rails, repair hero crop/padding cascade, compact principles/Core-support modules, replace tall collection-card minima, set the mobile collection hero to 8:5 and move mobile Quick Buy/sort into the shared Sheet.

**Dependencies:** M1's shared mobile overlay behavior.

**Likely seams:** `app/page.tsx`, `components/home/*`, `components/product/ProductCard.tsx`, `ProductGrid.tsx`, `ProductCarousel.tsx`, `ShopBrowser.tsx`, `components/carousel/*`, `app/collections/[collection]/page.tsx`, `app/globals.css`. Share product data/purchase state; do not fork the catalog.

**Acceptance:**

- At 390px, Core and Beyond rails show one complete card plus a 36–52px next-card preview, with reachable all-product navigation and keyboard/gesture equivalents.
- Collection grid remains two columns with 16px outside/8px inter-card spacing. Current cards target approximately 290–320px height rather than fixed 360px, with real names/types/availability and ≥44px action targets. Long content may grow; nothing decision-critical is ellipsized away.
- Mobile collection hero is 8:5. Selected collection is visible in its horizontal navigation and sort keeps its semantic behavior/URL context.
- Quick Buy configuration, error, close, retry and successful Cart handoff work in a sheet on phones, preserving the initiating card focus and scroll. Desktop inline Quick Buy remains intact.
- Hero/principles/Core-support fixes remove documented shadowed overrides and empty minimum-height space without removing content or introducing duplicate video loads.
- Shared card/rail improvements appear in PDP recommendations, including non-pilot pages. Their primary/detail-body presentation does not change.

**Verification:** Extend product-card, carousel and homepage interaction tests as needed; deliberately revise mobile card/hero assertions in `e2e/storefront.spec.ts`, and affected `home-hero.spec.ts` / `discovery.spec.ts`. Keep desktop assertions. Run Ticket Gate and actual-media Browser review of the complete homepage, all three collections, Quick Buy and recommendation rails. Investigate the current skipped WebKit touch-close case; do not silently treat it as passed.

## M3 — Establish the Super Serum mobile pilot with gallery and purchase flow

**Customer outcome:** A visitor can swipe Super Serum media, understand its current availability and retain access to the appropriate action while reading the page.

**Scope:** Spec section 4, primary gallery/purchase and persistent mobile action; ≤820px only. Add an explicit Super Serum presentation boundary after canonical slug resolution. Preserve the already joined gallery/purchase card. Add bounded swipe/progression, compact purchase rhythm and the 64–76px-plus-safe-area sticky bar activated by the main CTA leaving above the viewport.

**Dependencies:** M1 for modal visibility/focus behavior and shared cart handoff.

**Likely seams:** `app/products/[slug]/page.tsx`, `components/product-detail/ProductDetail.tsx`, `ProductDetail.adapters.ts`, `PdpGalleryIsland.tsx`, `PdpPurchaseIsland.tsx`, `PdpPurchaseAccordions.tsx`, existing carousel gesture helper and `app/globals.css`.

**Acceptance:**

- Only canonical `super-serum` opts in; legacy aliases redirect to it. A non-pilot Core product, a non-Core product and desktop Super Serum retain their primary/detail layout.
- Gallery has one selected item; swipe is bounded, vertical scroll remains available, controls/keyboard work, inactive video pauses, and selection survives resize. Single-media and unavailable-media states remain honest.
- Current coming-soon state is complete and price-free; controlled purchasable/waitlist/pending/error states share one configuration/action state between main and sticky controls.
- Sticky appears only after the main CTA has passed above the viewport, hides when CTA returns/footer enters/a modal opens, and cannot conceal the last visible controls or error feedback. It does not enter keyboard order while hidden.
- Preserve current alias request-time rendering and content/offer cache architecture; do not add device-specific cache keys, catalog flags or provider mutations.

**Verification:** Extend gallery/purchase/accordion/waitlist tests at the interaction seams; add targeted browser geometry/state assertions, desktop and non-pilot preservation coverage. Run Ticket Gate and actual-media Browser review at 320/390/430/820/821 plus desktop, including short landscape and expanded accordion states.

## M4 — Recompose every Super Serum education module

**Customer outcome:** A phone visitor can understand the product, view outcomes, follow application, read ingredients and locate it in The Core without detached controls or duplicated large imagery.

**Scope:** Spec section 4 detail modules; ≤820px inside M3's pilot boundary. Recompose profile, outcomes, application 2+1 montage, ingredient media/disclosure, routine card and empty reviews. Retain the existing semantic section sequence and every supported fact. Recommendations consume M2's shared rail without a competing implementation.

**Dependencies:** M3's explicit pilot marker and state contract. No new dependency on M2 is required because this Ticket does not modify recommendations.

**Likely seams:** `PdpRoutineVideo.tsx`, `PdpProfileSplit.tsx`, `PdpOutcomeSplit.tsx`, `PdpApplicationCarousel.tsx`, `PdpIngredientsSplit.tsx`, `PdpCoreRoutineSection.tsx`, `ProductReviewsSection.tsx`, `ProductDetail.tsx`, `app/globals.css`.

**Acceptance:**

- Profile/outcomes/ingredients/routine use coherent media-plus-copy modules with 20px between modules and content-sized reading panels. No desktop min-height survives accidentally in the mobile pilot.
- Application shows two square images plus one wide image, then full-width active instruction and navigation; the separate large repeated portrait is absent on phones. Every step remains selectable and announced.
- Ingredient trigger follows the relevant copy, opens the complete INCI inline and restores focus on close/Escape without jumping to an offscreen upper panel. No content is clipped in a fixed-height inner scroller.
- Outcome and routine selectors remain close to their changed media/content, legible at 320px and keyboard-operable. Mobile transitions respect reduced motion.
- Current empty reviews render an honest compact state; tests retain nonempty review behavior without inventing live reviews or claims.
- Actual 720×1280 video uses the specified 9:16 mobile frame, explicit controls/retry and no distorted source. Desktop and non-pilot detail modules remain intact.

**Verification:** Extend existing outcome/application/ingredients/routine/video/reviews tests for new contracts; preserve state and a11y coverage instead of snapshotting implementation markup. Run Ticket Gate. Capture every pilot module, all selected/expanded states, full-page sequence, desktop and non-pilot comparisons with actual project media.

## M5 — Finish mobile editorial, service and account-entry layouts

**Customer outcome:** Visitors can read System/About and complete public support/account-navigation tasks without oversized desktop spacing, awkward sidebars or clipped fields.

**Scope:** Spec section 5 at ≤720px and narrowly required transition repairs. System/About composition, public support/FAQ/contact/policies, account entry/recovery/unavailable, rewards public states, cart/checkout page frames, not-found and canonical redirect destinations. Keep auth, form availability, service commitments and payment state unchanged.

**Dependencies:** M1's shell/footer and shared overlay layout.

**Likely seams:** `components/system/*`, `app/about/page.tsx`, `components/content/LegalDocumentLayout.tsx`, `FAQAccordion.tsx`, `components/account/*`, existing support/rewards/cart/checkout route components and their owned rules in `app/globals.css`. Preserve content modules unless customer-facing technical failure copy specifically needs correction.

**Acceptance:**

- System image/copy modules have deliberate mobile crops; About text/tonal modules use natural heights and readable type. Core step selection changes nearby content. Ingredient arrows retain browsing-only behavior; active-card Selected and detail-heading identity make explicit selection clear. Preserve keyboard and fragment navigation.
- FAQ category navigation and expanded answers fit 320px; anchors clear the fixed header. Policy navigation reflows above single-column reading content.
- Account forms are top-aligned in natural-height phone panels with 24–32px padding. Forms and errors remain usable with large text and short viewport/keyboard pressure. No hidden submit/recovery controls or decorative-image layout shifts.
- Contact, rewards, checkout and privacy pages retain truthful current status; no fake submission, fulfillment, eligibility or payment success is created for design parity.
- Redirect aliases and not-found recovery behave as before. Restricted private/operator surfaces are explicitly excluded; source inspection is not mislabeled as authenticated runtime validation.

**Verification:** Use existing account/support/privacy/editorial tests; add only changed interaction coverage. Update relevant `e2e/editorial.spec.ts`, `system-core-flow.spec.ts`, `footer-support.spec.ts` and commerce state views. Run Ticket Gate and inspect full representative routes plus every shared-layout variant at mobile and desktop.

## Completion record required for the Spec

Each fresh Rhode/Helix consultant pair records reviewed routes, sizes, states, evidence, remaining discrepancies and accepted deviations. Resolve blocking findings and repeat affected checks. Do not expand the five-Ticket boundary or change approved design decisions silently; obtain direction when new work changes the Spec.

The sole Spec Closer incorporates current `dev` additively, completes Combined Spec Review and passes `integration-gate` before regular-merging the Spec into `dev`. Report exact commits/check outcomes, remaining device limitations, screenshots, local run command and remote changes. User approval of this draft does not authorize production promotion.
