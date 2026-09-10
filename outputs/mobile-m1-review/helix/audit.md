# Helix shared mobile shell — independent design review, iteration 2

Reviewed September 10, 2026 in `/private/tmp/helix-mobile-m1`, branch `codex/309-mobile-shopping-shell`, against the approved mobile specification and [fresh Rhode reference review](../rhode/audit.md). Application source was changing during the first part of this review; corrected states are distinguished below. This consultant changed no application files or remote state.

## Assessment

The new shell addresses the substantive Rhode comparison. Shopping categories are now useful destinations inside an image-led menu, Search is directly accessible, the cart quantity is visible, and footer navigation occupies a real two-column grid. This is substantially more usable than the previous narrow collapsed footer. Helix retains its own sparse imagery, wordmark and factual service disclosures. The desktop composition remains recognizable and does not inherit phone rearrangements.

**One confirmed keyboard defect was repaired after this review:** wrapping focus in a short modal could leave the newly focused control outside the visible scroll area. The source now allows native focus to reveal the target. Final acceptance needs the added browser geometry regression to pass; the resumed in-app Browser service was unavailable for an independent visual retest. A screenshot of the initial menu does not cover that interaction.

The full website is not yet mobile-complete. Home, collection, Treat education, System, About and utility-body composition remain the work of M2–M5. Those baseline discrepancies are not defects introduced by M1.

## Findings and corrections

| Priority | Finding | Evidence / disposition |
| --- | --- | --- |
| P2, source repaired; browser regression required | At 390 × 320, open Menu and press Shift+Tab from Close. DOM focus moved to Support at y631–682, but the panel remained at scrollTop0 and only y0–320 was visible. `handleKeyDown` wrapped with `focus({preventScroll:true})`, preventing the modal from revealing the target. | [Before-fix screenshot](./menu-short-keyboard-wrap-defect.png). Both wrapping branches now use native `.focus()`. The new `home-navbar.spec.ts` regression checks both targets fully inside the viewport and exact page-scroll restoration after closing. Independent native retest was blocked by the resumed Browser service outage. |
| P2, corrected in source during review | Empty Cart's Continue shopping action was 43px high. | Root applied the approved 48px phone minimum. Earlier [empty cart image](./cart-empty-390.png) and [short cart image](./cart-short-390x320.png) precede this correction. This audit did not recapture the corrected action before the Browser outage. |
| P2, corrected during review | Search Clear was 32px high; popular suggestions also lacked the approved phone control size. | Corrected Clear and suggestions measure44px. [Corrected queried Search](./search-serum-corrected-390.png); input remains52px with16px text. Desktop control appearance intentionally remains unchanged. |
| Visual follow-through, source repaired | Thin white Search/bag icons became faint against a light frame of the homepage video. The existing white campaign-header treatment already had text shadow, but that did not shade SVG strokes. | [Before-correction 320px campaign frame](./home-320.png). Root added a dark SVG drop shadow and tight cart-count text shadow only to the light campaign-header state. Source scope is appropriate; final actual-frame appearance was not recaptured after the Browser outage. |

Cookie's phone controls were corrected by root during the audit before this consultant measured them: Close44px; Acknowledge and Done48px. The panel now fits the dynamic viewport and scrolls internally. This was independently checked in ordinary and short viewports.

## Granular composition review

| Surface | Observed implementation | Comparison and judgement |
| --- | --- | --- |
| Header | Exactly64px outer height; inner bar63px plus border. At320/390/430 Menu, Search and Cart each44px high and at least44px wide. Wordmark center equals viewport center. At320 the wordmark spans108–212px and Search begins216px; the empty-count state fits with4px clearance. | Matches the approved64px adaptation of Rhode's roughly74px main navigation. No announcement was fabricated. Three-digit cart geometry needs the controlled test because all current public products are coming soon and this audit did not populate a real cart. |
| Compact/desktop boundary | Compact Menu/Search/bag at920; Menu hidden and desktop text navigation at921. Footer phone grid ends720; existing accordion presentation returns721–980; desktop four-column presentation visible1440. | Correct separate ownership boundaries. Header controls do not overlap at any measured width. Retained desktop links are exposed correctly. |
| Menu | Full viewport sheet;16px inset; current tiles about173×129px at390, a4:3 frame. Correct approved project images and crops. Shop, Core, Beyond, System, About, Search, Account and Support visible. Primary rows about50.6px tall. | A complete shopping surface rather than a plain sitemap. The extra duplicate Search entry is a useful secondary path, not a replacement for the new direct trigger. No invented products or promotions. |
| Search | Full390px surface with357px input inside the border/insets. Heading28px; Close44px; input52px and16px type. Non-sensitive `serum` query yields two image/name/type/status rows. Coming-soon status is explicit. | Good hierarchy; rows are more readable than forcing a miniature collection card. One query field and one active modal are present. Loading state appeared truthfully before results. Unavailable/retry states were source-reviewed, not triggered against the live provider. |
| Empty Cart | Full viewport, compact heading/Close, honest empty state and Continue shopping. No fake total, delivery offer or active-looking checkout. Fits390×320. | Correct adaptation; Rhode's empty Checkout cue is not copied. Populated, loading and update-error geometry needs controlled browser tests rather than inventing live contents. |
| Footer | At390 navigation spans358px, with two171px columns and16px gap. Navigate/Support then Legal/Account; link targets44px. At320 columns136px; longer labels wrap. Services follow navigation with three64px cards separated by12px. Factual social/review/payment disclosures and privacy/locale/copyright follow. | Approved four-group adaptation works. Footer is about1339px on390 rather than Rhode's1047px; the extra content and larger targets explain the height. Shortening by hiding facts or compressing links would be a regression. |
| Cookie | Inset358×812px panel at390×844,358×288px at390×320;16px outer margin. Close44px/actions48px. At short height, scrolling reveals both actions entirely. | Truthful content retained. Portal is outside inert background; only Cookie is exposed in the accessibility tree. No acknowledgement was submitted. |
| Desktop | Header64px with existing text nav and independent centered wordmark. Search/Cart remain520px side sheets at1440. Footer uses four navigation columns with services alongside; status content retains its existing placement. | No phone recomposition leaked into desktop. Open Menu resized into desktop remained one usable Sheet, then Escape returned to visible Search because Menu no longer exists in the desktop header. |

## Interaction evidence

- Menu opening focuses Close, locks body scrolling, and makes underlying header/main/footer inert. Menu→Search exposes one active Sheet; after the exit animation, Escape returns to the visible Search trigger.
- Direct Search from a scrolled homepage returned to visible Search at y9.5–53.5px with page scroll exactly6904.5px before and after. The header is revealed, avoiding Rhode's offscreen-return problem.
- Cart Escape returned to the visible Cart trigger. During exit, BODY can temporarily be active while the background stays locked/inert; the settled state releases the lock and restores the trigger. Intermediate animation frames were not mislabeled as lost-focus defects.
- Menu at390×320 scrolls to Support at y253–304px with page scroll unchanged and body lock retained. The keyboard-wrap failure above is distinct: manual scrolling works, but wrap does not reveal focus.
- Menu opened at390 then resized921 before Escape returned to desktop Search rather than the hidden Menu trigger.
- Cookie Escape returned to its visible footer trigger at y753–797px and restored page scroll7485px. At390×320 both bottom actions remained reachable by internal scrolling. Cookie never inherited an inert footer ancestor.

[Focus and geometry measurements](./focus-behavior.json), [header/footer breakpoint matrix](./header-footer-matrix.json).

## Coverage

Main consultant: homepage shell/menu/search/cart/footer/Cookie at390×844 and1440×1000; header/footer measurements at320,390,430,720,721,920,921 and1440; short menu/cart/Cookie390×320; resize with Menu open across compact/desktop boundary. Screenshots use actual project media, not test image fixtures.

Separate bounded cross-route subagent inspected `/collections/shop`, `/products/super-serum`, `/system`, `/about`, `/faq`, `/contact`, `/privacy` and `/account/sign-in` at390×844. All eight had64px headers,44px mobile controls,358px footer navigation, two171px columns, and zero document/body horizontal overflow. [Route report](./routes/audit.md), [route geometry](./routes/geometry.json). Shop and sign-in footer bottoms were also visually inspected.

This is desktop-browser viewport emulation. Native finger gestures, iOS keyboard, device safe-area behavior, screen reader announcements, text zoom, authenticated/private screens, populated cart and real checkout are not certified. No catalog, auth, payment, support or other remote mutation was performed. Query `serum` was public and non-sensitive. Development badges in screenshots are local preview chrome. Temporary viewport override reset after the main pass; any repair retest resets it again.

## Evidence index

- [Menu390](./menu-390.png), [short menu bottom](./menu-short-bottom-390x320.png), [menu resized to desktop](./menu-resized-desktop-1440.png)
- [Search initial390](./search-initial-390.png), [corrected results390](./search-serum-corrected-390.png), [desktop Search](./search-desktop-1440.png)
- [Empty Cart390, before48px correction](./cart-empty-390.png), [short Cart, before correction](./cart-short-390x320.png), [desktop Cart](./cart-desktop-1440.png)
- [Footer navigation390](./footer-navigation-390.png), [footer finish390](./footer-bottom-390.png), [desktop footer](./footer-desktop-bottom-1440.png)
- [Cookie initial390](./cookie-390.png), [Cookie bottom390](./cookie-bottom-390.png), [Cookie short bottom](./cookie-short-bottom-390x320.png)
- [Home320](./home-320.png), [Home390](./home-390.png), [Home430](./home-430.png), [Home desktop](./home-1440.png)

## Repair verification and remaining limits

On resumption, source inspection confirmed both keyboard-wrap branches call native `.focus()`, while outside-modal return focus retains `preventScroll` to preserve the reader's place. The new short-menu browser regression starts from a nonzero page scroll, wraps Close → Support with Shift+Tab, wraps Support → Close with Tab, requires both focused targets entirely in the viewport, closes the menu, and requires exact restoration of the original page scroll. A successful run is the remaining acceptance evidence for this specific defect.

The consultant attempted to resume independent visual verification twice. The Browser service failed to start, then reported that the in-app browser was unavailable. No successful viewport override was established during resumption; the earlier override had already been reset. The preview was released for the supported production verification workflow. No replacement tool or unsupported browser driver was used to imply a visual pass.

Remaining unverified refinements are the corrected empty-Cart action's rendered 48px size, Cookie's keyboard wrap after internal scrolling, and the icon shadow across bright campaign frames. Cookie's ordinary/short-panel geometry, 44/48px controls, internal scroll reachability and Escape focus restoration were visually verified before the interruption. The independent audit otherwise supports M1's composition; it is not a claim that all five implementation Tickets are complete.
