# Helix mobile UX audit — iteration 1

Audit date: September 9–10, 2026. Baseline: `8f30d0e`, isolated worktree `/private/tmp/helix-mobile-parity-plan`. Local site: `http://127.0.0.1:3100`. Independent Helix design consultant with three source-only assistants; Rhode reference audited by a separate consultant. This is research, not implemented application behavior.

## Verdict

Helix already has responsive rules, a joined mobile PDP gallery/purchase panel, useful native disclosure semantics, accessible carousel controls, and truthful commerce/service states. Its problem is inconsistent mobile composition: desktop text/image pairs become separate long chapters, control rows lose reading width, and some global components inherit incompatible desktop alignment or focus behavior. Overall scroll length alone is not a defect; repeated imagery, control-to-result separation, forced blank space and illegible controls are the actionable issues.

The full PDP pilot is the canonical Product `/products/super-serum`. Select it by exact canonical identity (currently `super-serum`), not the TREAT System Step, display text, array order, or all Core products. No stable database Product ID was retrieved. Shared shell and product-discovery changes may affect all Products; other PDP detail compositions remain outside scope.

## Evidence and coverage

Sources: rendered local site at 390×844, source at the baseline above, and [Rhode's independent audit](./rhode-mobile-desktop-audit-2026-09-10.md). Source-only assistants covered home/discovery/shell, the entire Treat PDP, and all editorial/service/account route families. The root audit additionally reproduced focus, footer and INCI defects. The [service runtime supplement](./helix-mobile-service-evidence-2026-09-10.md) covers 16 public service/account/cart/checkout routes at390×844 and1440×1000, with route-specific states, dimensions and screenshots. Initial cart loading settled to an empty cart at both widths; no indefinite-loading defect was found. No real account, private order, live payment, catalog mutation or authenticated Admin was inspected.

Own visual coverage: full homepage mobile through footer; desktop home first viewport at1280×720; Treat initial gallery and all module geometry. The [editorial runtime supplement](./helix-mobile-editorial-evidence-2026-09-10.md) completes System and About at390×844 and1440×1000, including Core selection and ingredient browse/selection. Root supplied additional Treat mobile step1/step2 and desktop primary/application/ingredients captures, plus Shop mobile/desktop screenshots and geometry. These were independently inspected by this consultant; remaining states are explicitly limited below. Screenshots are local review artifacts in `outputs/mobile-audit/helix/` and `outputs/mobile-audit/helix/services/`; browser width testing does not by itself emulate touch hardware or an on-screen keyboard. No claim of a real-device touch or keyboard audit is made.

## Measured current layout at 390×844

The main document is 390px wide on home and Treat; no document horizontal overflow was observed there. Storefront panels have 16px gutters and 358px width. Header is 62px high.

| Home module | Height | Interpretation |
| --- | ---: | --- |
| Opening video | 844px | Intentional immersive chapter; mobile crop/safe-area cascade is wrong. |
| The Core | 1630px | Three full-width 358×447.5px cards stacked; a rail can preserve discovery while reducing repeated vertical framing. |
| Principles | 1190px | Large minimum-height copy panel followed by portrait; repeated blank space separates selected principle and its control. |
| Plug and Play | 1115px | Separate tall media/copy plus accidental generic section padding. |
| Beyond The Core | 643px | Existing useful horizontal rail; one card plus preview. |
| Ingredient preview | 1019px | Oversized heading plus all three separate stacked cards. |
| Closing invitation | 549px | Intentional image chapter; judge its composition, not length alone. |
| Footer | 1165px | Large wordmark, service/status blocks before shrunken navigation. |

Home total document height was approximately 8154px. This is descriptive evidence, not a maximum-height target.

| Treat module | Document start | Height |
| --- | ---: | ---: |
| Joined primary gallery/purchase | y62 | 920px |
| Routine video | y998 | 448px |
| Profile | y1462 | 1036px |
| Outcomes | y2506 | 607px |
| Application | y3121 | 969px |
| Ingredients | y4098 | 925px |
| Core routine | y5031 | 862px |
| Zero-review summary | y5909 | 285px |
| Recommendations | y6210 | 426px |

Treat total document height was approximately 7817px including footer. Current routine foreground video is 720×1280 (native 9:16), rendered approximately 356×446 with `object-fit:contain` inside a 4:5 frame plus blurred background. A native 9:16 mobile frame should deliberately grow to approximately 358×636px; making every section shorter would be the wrong objective.

## Confirmed defects and priority

| Severity | Finding | Evidence / implementation seam |
| --- | --- | --- |
| High | Mobile menu → Search → Escape leaves focus on BODY. The menu opener unmounts and code attempts to restore focus to hidden desktop Search. | Root runtime reproduced at 390×844. `components/shell/Header.tsx:92`, `:274`, `:280`; hidden utility CSS `app/globals.css:3251`. Restore to visible initiating/equivalent control. |
| High | Footer mobile groups shrink to 81px while their frame is 358px. Services measure310px. Accordion rows do not use available width. | Root DOM measurement; own screenshot `footer-mobile.png`. Desktop `align-items:start` at `app/globals.css:248` survives mobile flex column at `:9467`. |
| High | Full Ingredients trigger changes preceding story panel and jumps the reader upward. | Root runtime: click at scrollY4220 moved to3730.5, a489.5px upward jump, focusing Close. `PdpIngredientsSplit.tsx:44`, `:73`, `:105`, `:139`; mobile rules `globals.css:8421`. Place disclosure and trigger together in reading order. |
| Medium | Mobile hero crop and safe-area overrides are shadowed by later equal-specificity base rules. | Mobile rules `globals.css:3288`, `:3344`, `:3348` lose to `:3451`, `:3487`; display-secondary mobile rule also loses to later `:3418`. |
| Medium | Plug and Play inherits unintended64px top/bottom section padding. | `.home-section` at `globals.css:10688` overrides `.home-section--core-support` at `:10187`; principles resets itself, support does not. |
| Medium | Gallery looks navigable but lacks touch swipe. | `PdpGalleryIsland.tsx:115`, `:124`, `:142`, `:188`: thumbnails support click/hover; no swipe/drag handler. Source fact; real touch gesture still requires implementation validation. |

## Shared shell and discovery

Header becomes MENU /104px centered wordmark /CART below920px, hiding direct Search/Account and visible cart quantity;62px tall below620px (`Header.tsx:196`, `:214`, `globals.css:3251`, `:3273`, `:3336`). Current hide-on-down/reveal-on-up behavior and overlay visibility are intentional and should remain (`Header.tsx:14`, `:26`, `:180`; CSS`:2459`). Menu is a five-link text sheet, not a mobile discovery composition (`Header.tsx:260`; CSS`:2675`, `:2876`, `:3382`). Direct Search, visible quantity and category-level imagery are justified design changes, while adding unapproved promotions is not.

Home Core becomes three single-column cards below900px (`HomeCoreShowcase.tsx:56`; CSS`:3645`, `:10539`); Beyond uses1.12 visible cards below720px (`ProductCarousel.tsx:148`; CSS`:9807`, `:10522`, `:10720`). Use one shared carousel seam, preserve catalog order/media overrides, and keep vertical gesture intent. Principles mobile min-heights alone consume roughly1080px at844px height (`globals.css:9703`, `:10058`, `:10544`). Ingredient preview has a66.3px heading at390px plus all three cards (`app/page.tsx:154`; CSS`:10389`, `:10704`).

Collection grid retains two columns below1020px and360px card minimum below620px: approximately175×360px at390px, versus natural4:5 media geometry (`globals.css:6310`, `:6397`, `:6419`, `:6439`, `:8254`, `:8638`). Product type is ellipsized while name/price compete. Compact collection cards need a distinct mobile presentation from large editorial rails. Sort retains a small floating dropdown and22px Close (`ShopBrowser.tsx:315`; CSS`:715`, `:799`, `:853`, `:875`).

Quick Buy remains inside the card with82% max height, overflow hidden,10.56px detail copy,26px close and34px CTA (`globals.css:6494`, `:8132–8221`). Current unavailable Products prevent meaningful live purchase testing; inspect controlled purchasable states later. Touch CTA is keyed to `(hover:none)`, not viewport width (`:8075`), so desktop pointer viewport snapshots cannot establish phone visibility. Search has truthful loading/error/empty states, but unconfigured copy exposes environment setup language (`SearchView.tsx:121`); customer-facing unavailable copy should replace that if reachable. Cart currently scrolls summary with items (`CartView.tsx:113`, `:228`; CSS`:2850`, `:3386`); a bottom action region needs short-screen and long-cart verification.

Preserve shared Sheet focus trap, Escape, body lock and reduced motion (`Sheet.tsx:37`, `:284`), cached server catalog reads and project-controlled media.

## Treat PDP detailed findings

The mobile gallery and purchase are already joined below820px through gap0 and outside corner radii (`globals.css:8301`). Do not describe joining them as new work. Gallery4:5 with overlay52–64px thumbnails (`:8324`, `:8511`) is a valid starting point. Preserve the primary data/purchase seam and improve gesture/progress affordances.

Profile stacks copy first and a separate4:5 image (`globals.css:4540`, `:8360`, `:8388`). At≤620 all four facts become label-above-value rows with70px minima and15px vertical padding (`:4595`, `:8702`), inflating a1036px module. Media-first joined composition and compact facts are justified.

Outcomes stacks4:3 media above labels/headline/controls (`PdpOutcomeSplit.tsx:151`, `:210`; CSS`:8394`). Controls each have64px minima/39.2px labels and1.5s image transition (`:4647`, `:4707`, `:8771`). The image can be above the current view when controls are selected. Keep controls close to their effect; preserve arrows/Home/End and announcements.

Application wastes scarce width:358px panel minus40px padding,54px arrow,18px gap,44px step number and12px gap leaves about190px for32px instructions. Three thumbnails and then a separate447.5px portrait create repeated imagery (`PdpApplicationCarousel.tsx:82`, `:134`, `:164`, `:177`; CSS`:4834`, `:4905`, `:8729`). A2+1 montage followed by full-width instruction removes the repeated portrait while preserving all steps.

Ingredients is925px before expanded INCI and has the reproduced disclosure jump above. Source confirmed trigger in lower texture panel replacing upper story. Mobile DOM should become texture → education → trigger → expanded full list; preserve focus/Escape/state across responsive transitions.

Core routine keeps280px diagram and92px selector row before a separate4:3 image,862px total. Product labels shrink to9.28px and ellipsize (`PdpCoreRoutineSection.tsx:92`, `:99`, `:141`, `:169`; CSS`:4486`, `:8667`). One selected-step card with readable controls is preferable.

Persistent purchase is measured123.6875px high at390px, x16/w358/bottom844 in coming-soon state; Rhode's measured bar is72px. It starts after the entire primary block passes y0, so expanded purchase accordions delay it, and stops when any footer appears (`PdpPurchaseIsland.tsx:125`, `:151`, `:333`; `ProductDetail.tsx:241`; CSS`:8806`). A compact64–76px bar plus safe area is justified. Keep authority and pending/error states shared; desktop/non-pilot timing unchanged.

Treat has no current reviews. Default lookup has no canonical super-serum record (`lib/catalog/product-reviews.ts:286`; `ProductDetail.tsx:135`) yet renders a285px score-like empty summary. Replace only the empty visual treatment with a compact truthful message; never add fabricated social proof.

Pilot opt-in belongs at route shell `app/products/[slug]/page.tsx:130` and separate recommendation section`:139`, with targeted presentation props only where markup must change. Do not fork catalog content, copy the entire PDP, or broaden `getCorePdpPresentation` eligibility (`lib/content/core-pdp.ts:113`, `:129`).

## Editorial and service source findings

System: Core mobile card has640–820px minimum height,330px central row, three small tabs reserving86px for arrows,9.28px descriptions and38px arrows (`globals.css:10609–10618`, `:10990–10994`, `:11012–11042`). Intentional skincare copy+image minima total at least780px and copy retains42px side padding (`:7276–7299`, `:10634–10644`). Beyond uses two nested columns with235px body floor (`:7466–7479`, `:11056`, `:11073`). Existing78vw ingredient rail is a strength (`:11064–11065`); preserve roving keyboard/touch selection.

About stacks nine desktop sections. Eight mandatory72px inter-section gaps, two420px cultural cards,340px decorative formula block,500px operating panel and420px closing panel add repeated blank space (`app/about/page.tsx:27–179`; `globals.css:8543–8551`, `:8889`, `:8918`, `:8030–8041`, `:7810–7820`). Natural text height, compact principles and deliberate image chapters are needed, not indiscriminate shorter content.

FAQ and legal convert sticky side navigation to a full vertical list before content below980px. At390px utility titles are66.3px. FAQ has8 categories/36 questions, first answer in every group open by default (`FAQAccordion.tsx:34`); privacy13-entry TOC delays reading. Legal TOC/template is shared (`LegalDocumentLayout.tsx:15–55`; CSS`:9568–9580`, `:9606–9608`). Cookie table intentionally has720px minimum inside local horizontal scrolling, not document overflow (`:9169–9179`). Compress navigation/status presentation while preserving all policy facts and anchors.

Contact has no form or verified support destination (`app/contact/page.tsx:37–47`); legal docs are non-operative prelaunch information (`content/legal/types.ts:18–23`). Never import Rhode's live channels, commitments or payment badges. Cookie notice has focus/Escape handling but no body-scroll lock;100vh max-height and nested insets need mobile keyboard/small-screen testing (`CookieAcknowledgementDialog.tsx:24–67`; CSS`:8932–8998`).

Account access correctly removes desktop image below820px (`AccountAccessLayout`; CSS`:8284–8294`). Runtime shows Sign-in title at y305 and Forgot title at y338 because the form remains centered in a large empty card. Root checked Create Account at320×568:32px heading and240px input widths fit; no document overflow. The source nowrap concern was not reproduced with current text and remains only a large-text/keyboard regression check (`globals.css:2930–2950`). Logged-out rewards repeats private-account-oriented empty sections; maintain truthful boundaries. Checkout is sandbox introduction; unverified success is not payment success. No private state was fabricated.

Canonical aliases: `/method`→`/system`; `/support`→`/faq`; shipping paths→`/faq#shipping`; return/refund paths→`/faq#returns`; `/privacy-policy`→`/privacy`; `/terms-of-service`→`/terms`; signed-out `/account`→sign-in. Treat aliases as the same page, not extra missing layouts.

## Verification and acceptance implications

- Retain zero document overflow at320/390/430px, explicit tablet boundaries720/721,820/821,920/921, and desktop1440px. Browser-width checks do not substitute for touch-capability or keyboard-height tests.
- Every control must keep a44px effective target where the design calls for it; do not shrink to Rhode's smallest targets.
- Verify gallery vertical-vs-horizontal gesture intent, selected step/media adjacency, expanded INCI reading/focus continuity, search restoration, footer width, sticky activation/footer/overlay boundaries, long text and error messages.
- Existing E2E asserts exact mobile type and hero ratio (`e2e/storefront.spec.ts:448+`); intentionally update affected assertions rather than preserving obsolete geometry or globally relaxing checks.
- Preserve main desktop composition and all non-pilot PDP body layouts. Keep cached server data, authentication, cart and price authority, native semantics, reduced motion and unavailable states.
- No tests were run or added for this research-only change. No application files, remote catalog, database, payment or GitHub state were changed by this consultant.

## Work and evidence status

Skills: research. Source assistants: `source_home_discovery`, `source_pdp`, `source_editorial_service`. Runtime collaborator: root `mobile_service_visual_audit`. Parent owns canonical planning and approval gates. This completed iteration-1 record combines independent source analysis, direct visual inspection, root runtime reproductions, and explicitly attributed supporting audits. Bounded route and interaction evidence follows below.

## Rhode correspondence and intentional Helix differences

| Relationship | Rhode observed | Helix diagnosis / decision |
| --- | --- | --- |
| Initial purchase card | Gallery and purchase joined; narrow next-image preview and progress track | Helix already joins the pair. Change gallery navigation/progression, not an already-correct seam. |
| Video |358×636 native9:16 module | Helix has genuine720×1280 source; native portrait frame is supported, even though it is taller than the current4:5 module. |
| Profile | Image first, then facts | Helix copy-first plus separate portrait needs mobile reorder. Keep all facts; compact rows are a Helix decision, not a claim Rhode never stacks labels. |
| Application |2+1 montage, instruction; desktop extra portrait removed | Helix repeats3 thumbnails and a large portrait while squeezing instructions into190px. Adopt montage/instruction relationship. |
| Ingredients | Image then copy; disclosure at bottom | Helix trigger changes content above and jumps489.5px. Adopt reading order, retain better inline accessibility rather than copying Rhode's failed Escape behavior. |
| Outcomes | Image above three choices in coherent unit | Helix's basic order already matches; reduce avoidable label/spacing and interaction distance, not every image height. |
| Routine | Active step and controls nearby | Helix's862px stacked diagram/image plus9px labels does not read as one coherent mobile selection. |
| Collection |~175×289px compact cards | Helix~175×360px narrow cards need a compact type/media/CTA layout. Preserve a larger44–48px action target than Rhode's28.6px control. |
| Footer | Visible link columns | Helix's hidden81px accordion groups obscure navigation; use full-width two-column groups with all destinations. No copied newsletter, social/payment claims or live support. |
| FAQ | Desktop sidebar becomes horizontal category pills | Helix retains a vertical8-category preamble. Rail with explicit anchors can improve access without hiding answers. |
| Login | Tall centered card with blank space | Rhode's empty space is not a requirement. Helix should use deliberate phone form placement. |

Rhode's menu Escape failure, INCI Escape failure, and very small secondary targets are specifically excluded from the design target. Its clinical/community results, philanthropic modules, packaging promises, founder imagery and live commerce facts have no corresponding authorized Helix data and are not to be fabricated.

## Confirmed service runtime findings

All16 service supplement routes had document scrollWidth equal to viewport width at390 and1440. This is a bounded pass, not proof for all text/input states. FAQ category links occupy y360–635 and first question begins abouty800; Privacy's first substantive section beginsy1227 after its thirteen-entry contents list. Cookie table is731px inside a352px scroll region; it is contained, but forces horizontal reading across five columns. Contact's unavailable state is repeated before useful preparation guidance. Account inputs are310×54px with16px type at390, a strength to preserve.

FAQ anchor navigation cleared the fixed header by about86px; native Enter disclosure and visible focus worked. Cookie modal measured350×760px, required internal scroll to reach bottom controls, trapped Tab and restored focus on Escape. No acknowledgement was submitted; body-scroll lock remains unverified. Empty cart settled correctly at both widths. Private dashboard, populated cart, submissions/errors, actual mobile keyboard, screen reader and safe-area hardware were excluded.

## Screenshot index and interrupted-session limit

Direct Helix consultant screenshot evidence:

- [Home principles](../../outputs/mobile-audit/helix/home-mobile-principles.png): oversized text/control chapter before portrait.
- [Home Beyond rail](../../outputs/mobile-audit/helix/home-mobile-beyond.png): existing one-card-plus-preview pattern.
- [Footer](../../outputs/mobile-audit/helix/footer-mobile.png): large wordmark/service modules and narrow accordion groups.
- [Treat initial joined card](../../outputs/mobile-audit/helix/treat-mobile-top.png): real Super Serum media, joined purchase surface, coming-soon action.

The consultant's IAB session became unavailable after a turn interruption. A fresh recovery helper also failed to obtain IAB, so it created no evidence. Remaining selected-state/desktop captures were transferred to the root and its already-working helper. Source analysis and earlier rendered observations were retained rather than falsely described as new screenshots. The final combined coverage is provided by the linked supplements and root captures; no application implementation is implied.

## System interaction follow-up

The service/editorial helper observed at390px that Next Ingredient centered Peptides while the detail panel continued to show PDRN until the card was explicitly selected. Source confirms this is an intentional existing browsing-versus-selection contract: `SystemIngredientCarousel.tsx:111–119` updates `centeredIndex` for rail arrows and both centered/active state only for card selection. `tests/system-ingredient-carousel.test.tsx:190` explicitly asserts endpoint browsing does not change the selected ingredient. This is not an accidental state bug. It is a mobile design deficiency when one dominant visible card sits above another ingredient's information. The approved draft direction preserves the existing browsing-versus-selection contract and makes selected state unmistakable. Do not silently make mobile arrows commit selection. A Selected label on the active card, explicit selected-ingredient heading above detail, and View details affordance on unselected cards should prevent the one-card mobile rail from falsely implying its unselected image controls the content below; exact implementation must preserve existing keyboard and hash behavior.

Editorial helper also measured System mobile hero782px, Core750px, intentional885px, Beyond/targeted993px and ingredients1182px; total5917px. Core bottom product tabs were69px wide and visibly truncated current names, with38px arrows. About mobile total8783px and contained no image/video DOM nodes; its current material is authored text and gradients. Do not prescribe invented photographic panels for that route. Full mobile/desktop geometry and screenshots are in the [editorial supplement](./helix-mobile-editorial-evidence-2026-09-10.md). Both routes had zero document-level horizontal overflow at390 and1440. System total was5917px mobile/5967px desktop, proving that the issue is composition rather than simply a longer document. About was8783px mobile/8538px desktop; culture section1394px and standards1176px are the clearest cumulative reading-weight examples.

## Design-spec assessment

The [design specification](./helix-mobile-design-spec-2026-09-10.md) correctly scopes all detailed PDP changes to canonical Super Serum and preserves the already joined primary card. Its substantive adaptations are supported by the evidence: explicit mobile gallery navigation, native portrait video, image-first profile, control/media proximity, a2+1 application montage, locally expanding INCI, readable Core navigation, compact empty reviews, smaller persistent action, useful mobile discovery rails and consistent shared navigation. It does not incorrectly require every module to become shorter or copy Rhode's brand/content/accessibility defects.

Final wording refinements were incorporated: mobile account forms use natural height/top alignment; About is described as existing text/tonal modules; the education Ticket states the chosen9:16 video ratio; System preserves its intentional browse/select contract with active-card and selected-detail labels. No blocking design assumption remains in the draft based on the completed source and runtime evidence. The final root Treat/collection and desktop-home captures are incorporated below. They are not permission to start implementation before repository planning approval.

## Root capture review — application

The [current mobile application screenshot](../../outputs/mobile-audit/helix/treat-mobile-application-step1-root.png) visually confirms the source-derived width problem: instruction01 wraps into a narrow, large-type column, with the small step number to its left and arrow consuming the lower-right space; a separate enlarged product portrait begins immediately afterward. This is the strongest single before-state example of why mobile requires recomposition rather than smaller fonts. The overlaid coming-soon purchase panel further reduces the visible reading area. The proposed montage followed by a full-width instruction directly addresses the reproduced composition.

## Root capture review — collection and desktop comparison

The [Shop mobile screenshot](../../outputs/mobile-audit/helix/shop-mobile-root.png) and [desktop screenshot](../../outputs/mobile-audit/helix/shop-desktop-root.png) confirm the responsive shift from three broad cards to two narrow cards. At390×844, every one of the seven cards measured175×360px; document width remained390px. Sort trigger measured about113×32px. The hero section including its vertical space measured286px; visible image remains a broad editorial crop, now much taller relative to the narrow screen. Source-described compact-grid redesign is justified by actual geometry, not inferred from media rules alone. See [recorded collection geometry](../../outputs/mobile-audit/helix/shop-mobile-geometry-root.json).

The viewport screenshots show the first collection row rather than a full manual review of every grid pixel. Inactive Quick Buy descendants appear in the geometry export because it queried DOM boxes; their measurements are not evidence of an opened or operable Quick Buy state. Current Products are coming soon/waitlist, so controlled purchasable-state verification remains necessary during implementation.

The [desktop application](../../outputs/mobile-audit/helix/treat-desktop-application-root.png) is a spacious two-pane composition: three thumbnails and a wide instruction block at left, large selected image at right. The [mobile second application step](../../outputs/mobile-audit/helix/treat-mobile-application-step2-root.png) visibly changes instruction number/copy and the following selected portrait, but keeps the narrow instruction column. This confirms the interaction works while its mobile presentation remains weak. Step2 is not merely a differently cropped screenshot of step1.

The [desktop ingredients/routine boundary](../../outputs/mobile-audit/helix/treat-desktop-ingredients-root.png) confirms the intentional desktop vertical heading and side-by-side texture composition; the full-list trigger is at the top-right of the image. The existing mobile stack carries that trigger into a later panel, explaining the reproduced upward jump. Preserve the desktop composition while moving the mobile trigger into the content reading flow. [Desktop Treat primary](../../outputs/mobile-audit/helix/treat-desktop-top-root.png) is available as the preserved large-screen reference.

## Final Treat desktop geometry and selected-state limits

Root measured desktop1440×1000 modules at approximately1375px content width: routine video774px high, profile720px, outcomes662px, application691px, ingredients576px, Core routine720px, reviews359px. Compare with the390px table above: application grows to969px because desktop halves stack and narrow copy wraps; ingredients grows to925px; profile to1036px. The remedy is specific reordering, control placement and removal of repeated imagery, not an arbitrary whole-page height cap.

The [outcome controls screenshot](../../outputs/mobile-audit/helix/treat-mobile-outcome-controls-root.png) demonstrates current large word controls, selected media and the persistent purchase overlay. It does not establish a successful smooths-selection state; the misleading original filename was corrected. Root verified application step2's settled instruction and updated image. Root also verified the collection sort opens six options and Escape restores focus to visible Sort: Featured; [sort screenshot](../../outputs/mobile-audit/helix/shop-mobile-sort-root.png). The card sizes on desktop were approximately435.7×544.7px in three columns.

One attempted root full-page screenshot had stitching duplication and was discarded. Retained viewport screenshots and DOM geometry are authoritative. No artificial full-page composite is represented as an accurate browser capture.

## Final collection variants and home desktop comparison

Root rendered Core and Beyond at both390×844 and1440×1000. Core contained three Products; Beyond contained four. Neither mobile collection widened the390px document. This consultant directly inspected both mobile captures, confirming selected category state, truthful product count, two-column framing and the same tall-card geometry. Evidence: [Core mobile](../../outputs/mobile-audit/helix/core-mobile-root.png), [Core desktop](../../outputs/mobile-audit/helix/core-desktop-root.png), [Beyond mobile](../../outputs/mobile-audit/helix/beyond-mobile-root.png), [Beyond desktop](../../outputs/mobile-audit/helix/beyond-desktop-root.png). These are layout/state observations; no product was purchased or waitlist submitted.

Desktop home at1440×1000 measured: hero1000px, Core888px, principles1120px, Plug and Play821px, Beyond888px, ingredient preview713px and closing700px. See [desktop section geometry](../../outputs/mobile-audit/helix/home-desktop-geometry-root.json). Independently inspected [Core screenshot](../../outputs/mobile-audit/helix/home-desktop-core-root.png), [principles screenshot](../../outputs/mobile-audit/helix/home-desktop-principles-root.png), and [support screenshot](../../outputs/mobile-audit/helix/home-desktop-support-root.png) show the baseline composition: broad three-card Core grid; split principles copy/portrait;65:35 Plug and Play image/text. Mobile stacks these structures, often retaining large display/spacing assumptions. The mobile Core1630px versus desktop888px and mobile ingredient1019px versus desktop713px follow from that compositional choice, not a runtime performance defect.

Root inspected the remaining desktop home modules and saved their geometry; extra viewport captures may be present in the evidence directory. This report does not invent filenames or claim every possible state was exercised. The chosen primary principle state, coming-soon Product state and default collection sort are representative current states.

## Completion and remaining verification boundary

The iteration-1 design audit is complete enough to specify implementation: all public customer route families have source coverage, all major canonical layout families have actual mobile/desktop evidence, and key mobile defects have reproduced measurements. Alias pages inherit their canonical destination; account/payment/private/operator states remain explicitly bounded. The draft resolves the observed design problems without an unsupported catalog, commerce, brand or content change.

This was not a release certification. Real iOS/Android touch/keyboard/safe-area behavior, screen readers, populated carts, purchasable Quick Buy, all outcomes/routine selections, submission/errors, every resize transition, unverified checkout-success/cancel UI and private account data have not all been runtime-tested. Source-only or untested states are not reported as passes. The specified implementation matrix and focused tests must cover these when changes are made. No application source implementation, automated test run, commit, push, remote mutation or deployment was performed by this consultant.
