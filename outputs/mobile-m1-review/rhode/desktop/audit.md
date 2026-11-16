# Rhode desktop shell — fresh iteration 2 reference

Read-only live inspection on 10 September 2026 in the Codex in-app Browser, 1440 × 1000. This bounded helper covers the home shell, desktop search, empty cart, full footer, Shop first fold and Peptide Glazing Fluid first fold. No cart, customer, form, or checkout mutation was performed. The temporary viewport override was reset.

## Findings

- **The approved reference remains stable.** The home campaign still features Alexandra Leclerc. After initialization, the outer frame is 32.4 px on each side and 1375.2 px wide. The main desktop navigation is 89.8 px high within a 122.2 px header wrapper. Shop/About/Futures sit left, the wordmark is centered, and Search/Account/Cart sit right. Home has transparent navigation over its hero; Shop and PDP use the pale filled navigation. The shell hides on downward movement, so it must be considered jointly with focus restoration.
- **Search remains a 680.4 px right-side drawer**, filling viewport height at x759.6. The dark backdrop covers the rest. It contains a centered title, full-width input, text suggestions, divider, and thumbnail/name result rows. Opening locks body scrolling and focuses Close rather than the search field. The Close visual/control rectangle is only 16 × 16 px. Escape closes and returns focus to Search. During the test, after a small downward page movement, that restored Search element remained in the hidden header at y−108, so successful DOM focus restoration did not ensure visible focus. This is a flaw to avoid copying, not a new requirement for Helix.
- **Empty Cart has the same 680.4 px full-height right drawer** and locks body scrolling. The empty message and shipping meter are at the top, with a very large blank middle; recommendation, subtotal, explanatory line, and checkout action sit at the bottom. Close is about21.6 ×21.6 px. Escape closed the drawer and settled focus on BODY. Thus this pass strengthens the earlier audit's uncertainty: reliable cart-trigger focus restoration was not demonstrated. No empty checkout or recommendation action was pressed.
- **Desktop footer remains about974 px high.** A full-width wordmark occupies about451 px; the content row is444 px; the centered locale row is79 px. In the content row, the newsletter occupies512.7 px on the left with a vertical rule. The right862.5 px combines three visible navigation columns with a support column; the navigation subregion is520.2 px. Support, opt-outs, copyright, and payment mark remain in the rightmost column. Helix should preserve its own factual destinations/content rather than importing these services.
- **Shop still uses a wide hero, one centered category-pill row, and three product columns.** The measured hero section was1375.2 ×474.8 px in this pass; the earlier audit recorded approximately450 px. That small difference does not imply a changed composition. The first product cards remain about432 px wide with40 px horizontal gaps. Sort is left and count/layout toggles right. Desktop shell and collection behavior continue to support the approved mobile-specific redesign.
- **Serum PDP still has the850 px main module**, with left media and right purchase pane. The dominant visible image is726.25 ×760 px, roughly53% of the1375.2 px frame. Title remains57.6/57.6 px in one line; purchase content occupies the right column with separate size pills, full-width action, and disclosure rows. The subsequent landscape video remains about1375 ×774 px. The observed first fold agrees with the initial reference.

## Limits

Desktop Shop menu hover was not established through the supported controls. Keyboard ArrowDown while focused on Shop did not expose it; the initial accessibility Expand action navigated to Shop rather than presenting the menu. Those attempts are not sufficient to characterize mouse-hover behavior. Do not claim a new menu defect from them. No physical pointer hover, screen reader, touch, virtual keyboard, populated cart, or checkout validation was performed in this helper.

## Evidence

- [Search](./search.png)
- [Empty cart](./cart-empty.png)
- [Footer](./footer.png)
- [Shop first fold](./shop-top.png)
- [Serum first fold](./pdp-top.png)

Primary pages: [Home](https://www.rhodeskin.com/), [Shop](https://www.rhodeskin.com/collections/shop), [Peptide Glazing Fluid](https://www.rhodeskin.com/products/peptide-glazing-fluid).
