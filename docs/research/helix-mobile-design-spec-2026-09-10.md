# Helix mobile design specification

Status: approved by the user on September 10, 2026. Approval covers the shared understanding, this specification and the five-Ticket breakdown. Implementation proceeds through the canonical Spec/Ticket workflow; production promotion remains separately authorized.

Baseline: `8f30d0ec5745b94c17f630e70a75d25928741ae0` on `dev`. Audit date: September 9–10, 2026 (Los Angeles / UTC). Local reference: `http://127.0.0.1:3100`. Rhode is a live, campaign-dependent reference, not a frozen design system.

## Shared understanding

Helix needs deliberate mobile composition across its customer-facing website. Rhode supplies the reference for responsive layout, visual hierarchy, media proportions, product discovery, and control placement. Helix keeps its wordmark, Marcellus/Manrope typography, palette, approved copy, project-controlled imagery, product identity, and server-authoritative commerce.

The detailed PDP pilot is **Super Serum**, currently `/products/super-serum`, representing TREAT in The Core. Other PDPs receive shared header/menu/cart/footer and shared recommendation-card/rail changes only. Their gallery, editorial panels, application, ingredients, routine, reviews, and purchase layout remain outside the pilot. Do not identify the pilot using the TREAT role, display text, an array position, or a legacy product slug.

Scope includes the homepage; Shop, Core, and Beyond The Core collections; search; shared header/menu/cart/footer; the full Super Serum PDP; System and About; support, FAQ and policy pages; public account entry/recovery and existing cart/checkout views. Redirect aliases inherit their canonical destination. Private account data, operator/Admin screens, provider-hosted payment pages, and new service functionality are outside the design scope.

The desktop composition remains the baseline. Mobile changes must not recompose desktop routes. Necessary shared accessibility fixes may affect all viewport sizes, and must be recorded separately from mobile visual changes.

## Evidence and interpretation

- [Rhode mobile/desktop audit](./rhode-mobile-desktop-audit-2026-09-10.md): primary-source visual observations, routes, measurements and screenshots.
- [Helix mobile audit](./helix-mobile-audit-2026-09-10.md): current rendered state, source-level explanation, severity and coverage limits.
- [Implementation ticket draft](./helix-mobile-implementation-tickets-2026-09-10.md): bounded delivery slices and dependencies; not yet GitHub issues.

Observed dimensions describe the audited content at the stated viewport. The target dimensions below are Helix design decisions, not claims that Rhode uses identical values. Content must be allowed to grow with text size, localization, error messages and approved catalog changes; size targets never justify clipping or hiding meaningful content.

### Decision summary at 390 × 844

| Surface | Current Helix | Rhode reference | Proposed change |
| --- | --- | --- | --- |
| Collection cards | Approximately 175 × 360px | Approximately 175 × 289px | Content-sized compact cards, approximately 290–320px tall with larger tap targets. |
| Treat application | Approximately 969px; thumbnails, narrow instructions, then large portrait | Approximately 616px; 2+1 image montage and instruction | One montage and full-width instruction; remove repeated large portrait. |
| Treat ingredients | Approximately 925px; copy first, trigger over later texture | Approximately 734px; texture first, trigger after copy | Image-first module with inline full list adjacent to its trigger. |
| Persistent purchase | Measured approximately 124px high | Measured 72px high | Compact 64–76px bar plus safe area. |
| Footer navigation | Four collapsed groups measuring only 81px wide in a 358px frame | Three visible link columns | Four Helix groups in a two-column grid with readable, usable links. |
| Search close | Menu → Search → Escape leaves focus on the document body | Search is directly reachable in the header | Direct mobile search and visible-trigger focus restoration. |

## 1. Responsive foundations

Rhode uses a 16px outer gutter at 390px, giving a 358px panel. A further 16px panel inset produces 326px of reading width. Helix already uses a 16px storefront gutter on phones; retain that strength and remove inconsistent nested spacing.

| Contract | Proposed Helix treatment |
| --- | --- |
| Phone composition | New home, collection, service and footer composition applies at `max-width: 720px`. The Core rail also replaces the existing stacked layout through 900px, showing two cards plus a preview at 721–900px. Above those boundaries, preserve existing tablet/desktop grids. |
| PDP pilot | New Super Serum composition applies at `max-width: 820px`, matching the existing PDP stacking breakpoint. Desktop begins at 821px for this pilot. |
| Shared navigation | Keep the existing compact-navigation threshold at 920px; improve the same mobile menu/search/cart controls throughout this range. |
| Gutters | 16px outer gutters at phone widths. Inside a contained PDP/editorial card use 16px padding; ordinary reading pages may use 20px where consistent with their shared layout. Avoid three nested gutter layers. |
| Vertical rhythm | 20px between distinct contained PDP modules; 0px seam between media and copy belonging to one module. Home/editorial section padding normally 32–48px, with larger full-bleed campaign panels intentional and separately reviewed. |
| Corners | Retain Helix's 12px PDP radius. Round the outside of a combined module, not every stacked half. |
| Type | Preserve Marcellus display and Manrope functional text. Phone major headings 36–44px, subordinate editorial headings 28–36px, body 16px/1.5, labels 12–14px. Product-card names 14–16px and visible availability/CTA text at least 12px. Long copy grows naturally. |
| Controls | Primary CTA at least 48px tall; icon/select/tab controls have a 44px effective target. Keep text and icons visually quiet. Rhode's approximately 29px collection CTA and 24px layout toggles are reference flaws, not target sizes. |
| CSS ownership | Amend the relevant component rules and consolidate their winning mobile overrides. Do not add another broad final stylesheet patch that silently changes unrelated `.pdp-*`, `.home-section`, `.product-card` or `.container` rules. |

## 2. Shared navigation, overlays and footer

### Header and mobile menu

Replace the mobile MENU / wordmark / text-only CART arrangement with a 64px-high bar: menu at the left, the existing centered Helix Wordmark, and visible search plus cart controls on the right. Preserve an accessible and visibly updated cart quantity. Keep the wordmark centered independently of count length; all controls fit at 320px without overlap. Use native buttons with accessible names for icon controls. The existing overlay-on-home and scroll hide/reveal behavior remains, including visible header when an overlay is open. Do not add Rhode's announcement bar without an approved Helix announcement.

The menu should support shopping directly: primary Shop link; two compact image-led category tiles linking to Core and Beyond The Core; then System and About, account access and support. Core uses `/media/home/plug-and-play-poster.webp` at `50% 50%`; Beyond uses `/media/home/final-cta-poster.webp` at `40% 50%`. Both use a 4:3 image frame with visible category labels below. These project-controlled editorial images illustrate collection links, not static product records; do not label either portrait as a product result. Do not introduce hardcoded products, a second catalog request or an invented promotional campaign. The menu remains a single shared Sheet with one focus trap and an explicit close control.

Search opens directly from the visible header trigger, removing the need for a menu round trip. Closing search returns focus to whichever visible trigger opened it; opening from the menu returns to a visible menu/header control after that menu is closed. Verify this with keyboard and with the current mobile breakpoint active. Do not claim focus restoration because `.focus()` was called on a `display:none` desktop element.

### Overlay composition

On phones, menu and search occupy the available dynamic viewport; cart is a full-width side sheet with a compact top bar. The cart body scrolls while the current total and checkout action remain in a bottom action region. When item count, validation messages or the keyboard reduce available height, the action region must remain reachable and must not conceal the final cart row. Include safe-area bottom padding. Menu, search, sort, cart, cookie and waitlist sheets must not overlap active traps.

Mobile product sorting uses the shared Sheet as a compact bottom sheet with a clear heading, current selection and full-width options; preserve the existing desktop presentation. Do not keep the 22px close control inside a small floating desktop dropdown on phones.

### Footer

Rhode keeps useful navigation visible in columns beneath its wordmark/newsletter. Helix currently places service/status modules before four collapsed link groups. Keep the Helix Wordmark, then make Navigate/Support and Legal/Account a two-column, two-row navigation grid on phones. Use a single semantic navigation source where practical; do not expose duplicate mobile/desktop link trees simultaneously. At 320px links wrap and retain usable tap areas.

Follow navigation with compact service links and the existing factual review/social/checkout-status disclosures, then privacy choices, locale and copyright. Do not turn unpublished social channels or sandbox payment categories into active-looking trust badges. Preserve every existing destination and privacy control. Do not add a newsletter form, payment logo, shipping offer or social link merely to resemble Rhode. Footer groups must fill the available width, rather than inheriting `align-items:start` shrink-to-content behavior.

## 3. Home and discovery

### Homepage

| Existing module | Mobile redesign | Preserve |
| --- | --- | --- |
| Opening campaign video | Keep the immersive first screen. Repair the mobile crop and bottom-safe-area rules currently shadowed by later base declarations. Use explicit mobile focal positions and 48px CTAs with readable labels; verify the initial image before video readiness. | Current media, two destinations, poster/error/reduced-motion behavior and desktop composition. |
| The Core | Replace three large vertically stacked product cards with a horizontal rail showing one complete card and a 36–52px next-card preview at 390px. At 721–900px show two cards plus a preview; above 900px retain the three-column grid. Use the existing shared carousel, 12–16px gaps, visible navigation and a useful current/total announcement. All three products remain directly reachable. | Desktop three-column presentation, canonical order and product data. |
| Three principles | Remove the viewport-based minimum heights from mobile copy and portrait. Use a 40–44px display heading, compact 48px selector rows, and content-sized selected copy close to its controls. Keep one intentional portrait at approximately 4:5; do not create empty rows to match desktop panel height. | Every principle, current selection behavior, project image and reduced motion. |
| Plug and Play / Core support | Remove the accidental generic 64px padding around the module. Recompose as one joined media/copy unit, with a mobile crop and a natural-height text panel. Use a 36–40px title without the desktop right-aligned three-line arrangement. | Authored meaning, destination and approved imagery. |
| Beyond The Core | Keep the existing horizontal rail. Align card spacing, next-card preview, controls and typography with The Core. Controls must not cover important product details. | Canonical products, selection/drag behavior, statuses and desktop rail. |
| Ingredient preview | Replace the three tall stacked preview cards with a compact horizontal educational rail, one card plus visible next-card preview; retain a short intro and System CTA. Reading and selecting an ingredient must not require hover. | All ingredient links/content; no new ingredient claims. |
| Closing campaign | Keep a single image-led closing invitation, with natural copy height and one full-width primary action up to a comfortable maximum. Remove only empty minimum-height padding unsupported by the composition. | Campaign image and desktop treatment. |

The Core, Beyond The Core and ingredient rails must scroll vertically with the page on a vertical gesture; horizontal selection must not trap ordinary reading. Their content must be accessible with keyboard controls and without gestures. Audit the whole homepage after the changes: reduced height is a result of better composition, not a standalone acceptance criterion.

Keep one Core product-card tree across the grid/rail transition, including its existing per-product default-image overrides. Extend the carousel's small presentation API if needed to pass those overrides through; do not substitute different product media simply because a card moves into the shared rail.

### Collections and product cards

At 390px Rhode renders approximately 175 × 289px collection cards; current Helix cards are approximately 175 × 360px. Keep Helix's two-column shopping grid at phone widths, 16px outer gutters and 8px column gaps. Replace the inherited 360px card minimum with content-aware mobile card geometry. Aim for approximately 290–320px total height at 390px with current short product names, while preserving a 44–48px primary action. Cards may grow for longer names or error/availability content.

Separate compact collection cards from large editorial carousel cards. Preserve full product names, a readable product type and truthful availability. Place price beside or inside the primary action when a real offer exists; avoid repeating it in three competing positions. Coming-soon or waitlist cards must not show invented prices. Do not enforce a single-line product-type ellipsis when it hides the differentiating product description.

Use the collection hero at an 8:5 ratio on phones (approximately 224px high inside 358px width); retain its desktop ratio. Keep collection navigation on one horizontally scrollable row with the selected category brought into view, then a compact count/sort row. Retain ordinary navigable collection URLs and sorting semantics.

For purchasable products, phone Quick Buy opens a shared sheet rather than squeezing education, variants, errors and the final action inside a 175px card. The sheet shows product identity, short governed product details, configuration and the final server-backed action. Closing restores the original card trigger and viewport. A successful add can transition to Cart through the established shared overlay behavior, with no second background trap. Unavailable products retain their current appropriate destination/action.

### Search

Keep instant search, popular suggestions, result images and server-approved product links. Use a full-width input with a visible close/back affordance and clear loading, empty, unavailable and retry states. Result rows may stay horizontal rather than mimicking collection cards; keep images proportionate and text readable at 320px. Replace any reachable environment-setup instructions with factual customer-facing search-unavailable copy. Do not change Algolia configuration, indexes or search authority.

## 4. Super Serum PDP pilot

### Primary gallery and purchase

Helix already joins the stacked gallery and purchase panel below 820px. Retain that structure. The needed changes are a swipable gallery, clearer progression, intentional product framing and a more compact lower-page experience—not rebuilding the existing joined seam.

Use a 4:5 gallery frame with a 12–20px next-image preview when there are multiple media items. Keep the bottle, label and cap legible and uncropped in the product shot; project-controlled editorial media may have an explicit mobile focal crop. Replace the large overlay thumbnail row on phones with a slim progress indicator and accessible previous/next or directly selectable pagination targets. The visible marks can be small while their effective targets remain 44px. Desktop thumbnails stay as they are.

Gallery navigation is bounded, not infinitely looping. A horizontal swipe changes at most one item; vertical gestures retain page scroll. Arrow keys and labeled controls provide equivalent navigation. Selection persists across viewport changes, videos pause when they cease to be active, and inactive media cannot receive keyboard focus. A single-media product has no misleading swipe affordance. Preserve loading and unavailable-media treatment.

Within the purchase panel use 16px insets, a 36–40px product heading, 16px product type/body, clearly grouped real variants/availability, one 48px main action, and approximately 48–52px accordion rows. Keep the current content order, server-authoritative availability and error messaging. The audited product is coming soon; the pilot must look complete in that state and must not manufacture a purchasable offer. Purchasable and waitlist states are verified using controlled tests.

### Persistent mobile action

Replace the mobile two-row product-thumbnail/name/button panel with a compact action bar. When there is a purchasable offer with multiple configurations, show the current configuration selector beside the CTA. For a single configuration or coming-soon/waitlist state, show one full-width action with the appropriate accessible product identity. Height target is 64–76px plus the device safe-area inset, instead of the measured approximately 124px in the current coming-soon state.

The pilot bar activates once the main purchase button has passed above the viewport, and hides when that button returns, when the footer enters the viewport, or while another modal Sheet is active. Long expanded purchase accordions no longer delay access to the action. The bar shares selected configuration and pending/error/waitlist state with the main control, and introduces no new commerce authority. Hidden buttons leave keyboard navigation. Reserve enough scroll clearance that the bar never prevents access to the final control or sentence of a section; test short landscape screens.

Desktop and non-pilot PDP sticky timing/layout retain their existing behavior. Error feedback must remain visible/announced near the action that initiated it; a failure cannot be reported only in the offscreen primary panel. When Cart/Waitlist closes, return to the initiating sticky control if its normal visibility conditions still apply. Otherwise use a visible equivalent product action; if none is in the viewport, reveal the shared header and focus its Cart control without scrolling the reader away. Cart remains present at both compact and desktop widths; Menu may be used only while it is visible. Never return focus to an `aria-hidden`, inert, unmounted or offscreen control.

### Detail modules

| Module | Rhode mobile reference | Super Serum target |
| --- | --- | --- |
| Routine video | Portrait 9:16 video module after purchase. | Use a 9:16 frame, approximately 358 × 636px at 390px. The actual Super Serum foreground video is 720 × 1280 but currently contained inside a 4:5 frame with blurred fill; the new frame displays its native composition. This module deliberately grows while other modules lose redundant space. Keep explicit play, native controls and retry. Do not add a second video stream or require background playback. |
| Product profile | Media first, then statement and compact facts in one card. | Move the profile image above the copy on phones; use a near-square frame, a 32–36px heading and compact fact rows. Keep label/value columns where they fit, stacking only long values. Join the image and copy without an 8px inter-panel seam. |
| Outcomes | Selected media and associated benefit choices in one joined module. | Keep a near-square selected image with the three controls directly beneath it. Reduce repeated product-label/headline spacing; put all three readable 44–52px benefit controls close enough to observe the changed image in a normal 390 × 844 viewport. Preserve all states, arrow/Home/End access and announcements. Use a short 200–300ms mobile transition, disabled for reduced motion. |
| Application | Two square images plus one wide image above the active numbered instruction; approximately 616px total in the reference. | Recompose existing step imagery into the same 2+1 montage: two equal square cells, then a full-width 2:1 cell, with 12px gaps. Follow with the step label, number and 24–28px instruction using the full reading width. Put next/previous controls below or alongside the final line without permanently subtracting a 54px side column. Do not repeat a separate 4:5 active portrait below. Preserve all three selectable steps and active-state indication. |
| Ingredients | Texture image first, explanation second; full-list control follows the copy. | Use a 4:3 texture frame above content-sized ingredient education. Place the full-INCI trigger after the text it belongs to. Expand the complete list inline in the same reading flow on phones, with a clearly labeled close control and focus restoration. Opening must not replace content hundreds of pixels above the trigger or jump to an unrelated panel. No internal fixed-height text scroller. |
| The Core routine | One selected routine step at a time with nearby step navigation. | Use one joined selected-step card with a 140–180px texture/diagram region, readable step/product title, concise existing facts and three 44–48px selectors. Place any retained editorial image above the copy in the same card; avoid repeating a large adjacent desktop diagram and then a second detached image. Preserve Cleanse/Treat/Seal selection and links. Never shorten product names to illegible 9px labels. |
| Reviews | Real summary/reviews plus sorting and pagination. | For the current zero-review state, use one compact factual message without a giant dash, empty-star score panel or fake rating. Preserve existing nonempty review behavior and links when real data exists. Do not add Rhode's consumer studies, community results or packaging claims. |
| Recommendations | One product card plus a visible next-card preview. | Reuse the same large-card rail and interaction contract as home. These shared rail improvements also apply to recommendation rails on other PDPs; their detail modules remain unchanged. |

Retain Helix's existing semantic detail sequence: video → profile → outcomes → application → ingredients → routine → reviews → recommendations. Rhode places ingredients before application and contains additional results/packaging modules. This spec adopts its mobile composition while retaining Helix's content architecture. Do not use CSS visual reordering of focusable whole sections to create a reading/tab-order mismatch, or duplicate entire sections for different devices.

The pilot ingredients DOM order is texture → ingredient education → full-list trigger → expanded INCI. Education remains visible on mobile when INCI expands. The list grows below its trigger, with no focus/scroll jump to an earlier panel; close/Escape returns to that trigger. This requires a targeted markup/state change, not CSS order alone. Preserve expanded state and a visible focused element when resizing across 820/821px; desktop can retain its existing replacement-panel appearance using the same disclosure state.

## 5. System, About and service routes

System and About remain editorial journeys with their existing content. Remove inherited desktop minimum heights only where they produce empty mobile space; use 32–48px section padding, 36–44px leading headings, and 16px body text. Full-screen opening campaign images can remain intentional. Verify crops at 320, 390 and 430px and show the subject rather than merely centering the source image.

System's Core-step and ingredient selectors must sit immediately beside/above the content they update. A tap must not update an image far above the current viewport. Keep all existing keyboard and URL-fragment behavior. About currently uses text and decorative color fields, rather than Rhode's photographic founder modules; recompose those existing materials without inventing new portraits or turning text-only city/standards panels into supposed image modules.

| Editorial module | Mobile decision |
| --- | --- |
| System opening | Retain the intentional viewport-led campaign image and mobile `60% 50%` focal point; use a legible 24–28px centered title. Do not impose utility-page sizing on this image chapter. |
| System Core flow | Remove the 640–820px panel floor and 330px central-row minimum. Use a content-sized card with a 180–240px central visual, then a full-width three-step selector row. Remove the 86px arrow reservation from that row; put ≥44px previous/next controls on their own edge/row. Product labels may wrap to two lines at 14–16px; no 9px descriptors. |
| System intentional skincare | Replace copy/image minimum heights with one joined image-first unit, 4:5 image, 16–20px copy insets and natural paragraph height. Remove the inherited 42px lateral copy padding on phones. |
| System Beyond | Retain two columns where their copy fits; use natural card-body height instead of a 235px minimum. At 320px permit one column if required to preserve readable names and ≥44px actions. Remove redundant nested padding rather than shrinking copy. |
| System ingredients | Preserve the existing approximately 78vw rail and controlled media. Keep the existing distinction between browsing the rail and explicitly selecting an ingredient. Add a visible Selected label to the active card and a “Selected ingredient: [name]” heading immediately above its detail; give unselected cards a clear “View details” affordance. Previous/next rail controls browse without changing detail. Use a 28–32px heading, 16px copy and compact subhead spacing. All ingredient anchors and keyboard selection remain valid. |
| About hero and opening | Reduce the mobile 92px hero top padding to 40–48px and set heading to 36–44px. Keep both CTAs and the complete origin text; use 32–48px gaps between subsequent sections rather than eight mandatory 72px gaps. |
| About Seoul/Los Angeles | Two content-sized tonal cards, each with city label, 32–36px heading, immediate body and list. Remove the 420px card minimum and bottom-pushing `margin-top:auto`; no empty gap between heading and its explanation. |
| About men's statement and standards | Keep the statement and numbered principles as readable one-column blocks. Use 28–36px headings and 16px supporting text, with 20–24px between principles. No large decorative spacer is needed between text blocks. |
| About formula and operating discipline | Reduce the decorative FORMULA/FACTS/FUNCTION block from 340px to a compact 100–140px band before the substantive copy. Remove the operating-discipline 500px minimum; retain its complete heading, explanation and list. |
| About System promises and closing | Replace three 140px minimum promise cards with content-sized rows. Retain one closing invitation with naturally sized copy and two accessible CTAs; remove the 420px floor when it creates empty space. |

These are phone changes at ≤720px. At 721–820px, preserve the existing stacked editorial structure while ensuring controls meet their touch targets and long labels fit; do not silently apply the full phone typography above the approved boundary.

| Route family | Required mobile treatment |
| --- | --- |
| Support and FAQ | Compact 36–44px title/intro; one horizontally scrollable category row above readable answers, replacing the eight-link vertical preamble. Bring the selected category into view. Keep existing answer-open defaults and native disclosures; headings have at least 48px targets. Anchored categories clear the fixed header. Full answers remain visible and selectable. |
| Contact | Present the actual service availability first. Use one-column fields only where intake exists; do not manufacture a working form, published address or response-time promise. |
| Shipping, returns, privacy, terms, accessibility and cookie/privacy choices | Shared readable page frame, 36–44px title, compact publication-status text and paragraph/list spacing. Legal contents use a closed native disclosure on phones; desktop keeps its sidebar. Generate both from the same link model, exposing only one navigation tree at a time. Cookie tables remain a clearly labeled, keyboard-reachable contained scroll region with a visible scroll cue; never widen the document. Preserve approved wording, link destinations and consent behavior. |
| Account sign-in, sign-up and password recovery | Keep the existing phone form-first layout and hidden decorative side image. Top-align the form with 24–32px panel padding and natural panel height; remove viewport-height centering that puts Sign-in and Forgot headings at y305/y338. Ensure fields/buttons fit 320px, input text remains 16px, validation is readable, and the keyboard does not obscure the submit/recovery controls. No auth behavior changes. |
| Cart and checkout pages | Single-column item and summary flow with visible total/action. Remove desktop-sized blank space; preserve transactional/error/loading states. Empty cart and unavailable checkout are valid design states. No payment submission is needed to review layout. |
| Rewards and account-unavailable states | Keep authenticated boundaries and factual unavailable/eligibility copy. Improve mobile spacing and action placement only. Private histories, balances, orders and fulfillment data require controlled fixtures or an authorized test account for later layout validation. |
| Not-found and redirect aliases | Not-found offers readable recovery navigation. Each alias retains its redirect and resolves to the redesigned canonical surface; do not create duplicate page designs for redirects. |

These pages should use shared layout rules and components, with focused exceptions only when their content requires them. Authenticated data and operator/Admin interfaces are coverage exclusions, not silently passed screens.

## Delivery and validation contracts

Use shared components for shared behavior. Scope Super Serum presentation at the server-rendered PDP boundary after canonical slug resolution, and pass an explicit presentation option only to islands whose interaction or markup needs it. Prefer the existing canonical identity constant or a small named predicate for `super-serum`; do not introduce new catalog facts or a remote flag solely for this experiment. Canonical alias redirects must still reach the opted-in page.

Use CSS for reflow. Avoid parallel hidden mobile/desktop copies of purchase controls, videos or stateful panels. Keep one selected gallery item, one selected product configuration, one cart action and one active disclosure state across resizing. If a genuinely different control surface is needed on mobile, share the underlying state and ensure inactive controls are neither exposed to assistive technology nor keyboard focus.

Preserve public catalog cache projections, SSR/cookie authentication, server validation, truthful offer/waitlist states, and the existing media fallback behavior. Preserve the PDP route's existing request-time alias resolution and `force-dynamic` declaration; keep content/offer cache boundaries intact and never add viewport/device to canonical data cache keys. No schema, catalog, Algolia index, payment, customer or hosted configuration changes belong to this spec. Do not import Rhode photography, product text, consumer-study statistics, reviews, certifications, charitable claims or recycling commitments.

### Viewport matrix

| Purpose | CSS viewport | Input/state |
| --- | --- | --- |
| Small phone | 320 × 568 | touch and keyboard; long text; expanded panels |
| Compact phone | 375 × 812 | touch; top, middle and footer |
| Primary design reference | 390 × 844 | touch, default and reduced motion |
| Large phone | 430 × 932 | touch; same content and ordering |
| Phone landscape inside pilot | 812 × 375 | touch; compact sticky/keyboard/overlay height pressure |
| Wide landscape transition | 844 × 390 | touch; verify behavior outside the ≤820px pilot boundary |
| Breakpoint boundary | 620/621, 720/721, 820/821, 900/901, 920/921 widths | verify each retained responsive boundary; remove obsolete conflicting overrides |
| Tablet | 768 × 1024 and 1024 × 768 | touch; coherent transition without clipped controls |
| Desktop preservation | 1440 × 1000 | fine pointer and keyboard; original layout |

Run local visual inspection in the Codex in-app Browser. A narrow desktop viewport does not establish touch behavior: also verify a coarse pointer or an actual touch-capable browser/device. Browser resizing does not establish iOS keyboard or safe-area behavior; disclose device checks that cannot be performed.

### Acceptance shared by every slice

1. No document-level horizontal overflow at the matrix widths. Deliberate horizontal product/media rails remain contained and visibly discoverable.
2. Every visible control has a meaningful accessible name and visible focus. Interactive targets are at least 44 × 44 CSS pixels where practical, with no overlapping hit areas. Text inputs use at least 16px text. Primary reading copy is 16px with approximately 1.45–1.6 line-height; compact metadata may use 12–14px without truncating decision-critical information.
3. Menu, search, cart, sort, waitlist and ingredient disclosures remain keyboard-operable. Verify Escape, focus trap where modal, return to a **visible** trigger, scroll restoration, inert background, and body-scroll locking. Do not test a hidden desktop trigger as successful mobile focus restoration.
4. Overlays fit the dynamic viewport, reserve safe-area space, and keep close and primary actions reachable when content grows or the keyboard opens. Nested scrolling is confined to intentional overlays, not ordinary editorial copy.
5. Media has reserved geometry and intentional focal points; all images remain project-controlled. Mobile image `sizes` describe the rendered slot. Do not load duplicate hidden video streams or require autoplay to understand content. Reduced motion preserves the information and control state.
6. No invented offers, review averages, testimonials, service promises or readiness claims. Review-empty, unavailable, waitlist, cart-loading/error, and empty-search states are useful and visually complete.
7. Preserve desktop comparisons and at least one non-pilot Core PDP plus one non-Core PDP. Pilot-specific selectors must not change their detail-body layout.
8. Each implementation pass is reviewed by a fresh Rhode design consultant and a separate fresh Helix design consultant. They inspect complete affected mobile routes and interactions, compare against desktop, document discrepancies with evidence, and distinguish accepted differences from unresolved defects. A passed typecheck or screenshot of the first fold is not design approval.
9. Resize with Quick Buy open across 720/721px and with INCI, sticky-origin Cart or Waitlist open across 820/821px and 920/921px. Preserve selection/disclosure state, expose only one active surface, release or establish the appropriate focus trap and restore focus to a visible equivalent. Opening an overlay must not become a route change or a duplicate purchase during resize.

### Test and integration policy

Extend existing interaction tests only where behavior changes: gallery gesture/selection, menu-to-search focus restoration, mobile quick-buy presentation, disclosure focus, application/routine navigation, and sticky purchase state. Reuse the current cart fixtures for controlled commerce tests; do not mutate live remote data to populate a screenshot.

Update obsolete mobile geometry assertions deliberately, including affected assertions in `e2e/storefront.spec.ts`; retain equivalent checks for desktop and non-pilot PDPs. Do not replace them with looser generic visibility checks. Add browser geometry assertions for specified layout relationships, overflow, controls/media proximity and sticky/overlay boundaries. Do not add tests that simply search CSS text for a new rule.

Each Ticket uses the repository's `ticket-gate` (frozen install, lint, typecheck, complete Vitest). The completed Spec receives Combined Spec Review and `integration-gate` (those checks plus one retained production build and complete Chromium verification). Run browser verification through `pnpm e2e` / `pnpm verify:production`; direct Playwright invocation is not the supported project workflow. Routine E2E uses small product-media fixtures, so it verifies geometry and interaction, not real asset quality or crop. Actual project media needs separate Browser inspection under ADR-0002. Record native WebKit/iOS checks separately when available.

The research phase made no push, merge or deployment. The user has now approved the shared understanding, specification and Ticket breakdown required by `docs/agents/engineering-workflow.md`. Production promotion remains a separate approval even after implementation passes.

## Planning handoff record (before approval)

- Starting checkout: detached `ca88cde`, with existing untracked `outputs/` preserved. Research used current local `dev` at `8f30d0ec5745b94c17f630e70a75d25928741ae0` in isolated worktree `/private/tmp/helix-mobile-parity-plan`, branch `codex/plan-rhode-mobile-parity`, established through the task helper. No application source was edited.
- Deliverables: this specification, the five-Ticket breakdown, independent Rhode/Helix audits and their service/editorial supplements in `docs/research/`; local PNG/JSON evidence in `outputs/mobile-audit/`. The linked reports distinguish rendered observations, source findings and untested states.
- Skill and reviewers: research skill; separate `rhode_design_consultant` and `helix_design_consultant`, with source assistants; `mobile_service_visual_audit` for 18 service/editorial routes at mobile and desktop; `mobile_spec_review` for independent implementation-contract review. Root reproduced critical interactions and supplemented Treat, collection and desktop-home evidence.
- Local validation: `pnpm dev --hostname 127.0.0.1 --port 3100` starts the preview from this worktree. In-app Browser checks used actual project media, mainly 390×844 and 1440×1000, with narrower reference checks recorded in the audits. No real-device touch, iOS keyboard, authenticated private data or populated commerce state was certified.
- Checks: `git diff --check` exited 0; a separate validator checked all seven new Markdown files for trailing whitespace and local relative-link targets, with no failures. No application tests were added or run because this phase changes research/planning artifacts only. Implementation tests and gates remain required by the Tickets.
- Repository/remote state: no commit was created; final commit hash is not applicable. No issue, PR, push, merge, deployment, catalog, database, search-index or payment mutation occurred. The preview dependency/environment symlinks are local-only and must not be included in a future commit.
- Next gate: approve the shared understanding, this specification and the five-Ticket breakdown, then publish and deliver them through the repository's canonical Spec/Ticket workflow. This approval package is ready for review; implementation remains pending.
