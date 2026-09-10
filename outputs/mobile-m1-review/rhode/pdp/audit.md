# Rhode mobile PDP — iteration 2 reference

Fresh independent inspection of [Peptide Glazing Fluid](https://www.rhodeskin.com/products/peptide-glazing-fluid) at 390 × 844 in the in-app Browser. The page resolved to the big 1.7 oz variant. Inspected the entire gallery-to-footer sequence visually through overlapping viewport screenshots, supplemented by read-only DOM geometry. No cart changes, forms, purchases, review votes, or other submissions. Viewport override reset afterward.

## Verdict

The original responsive composition is stable. No change invalidates the approved Helix approach. The useful transfer is a coherent image/content card, explicit mobile order and compact contextual controls. Do not imitate Rhode’s small secondary controls or incomplete keyboard/focus behavior.

## Current geometry

All principal module widths are 358 px with 16 px outside gutters. Document width equals viewport width, 390 px.

| Module | Observed height (px) | Composition |
|---|---:|---|
| Gallery and purchase | 1151.66 | Portrait gallery/next-image glimpse, title, descriptive purchase content, size row, full-width CTA, three disclosure rows |
| Video | 636.44 | 358 px-wide portrait 9:16 presentation |
| Profile | 847.81 | Bottle image above heading and four stacked fact rows |
| Outcomes | 691.09 | Image above three prominent outcome words |
| Results | 927.28 | Before/after image above evidence/caveat and full-width selector rows |
| Ingredients | 733.54 | Texture image, explanation, full-list trigger at bottom |
| Application step 1 | 616 | Two square images and one wide image, then instruction and next control |
| Application step 2 | 553 | Same montage, shorter instruction; natural height reduces |
| Application step 3 | 585 | Same montage, longer instruction; natural height expands |
| Product comparison | 1045.45 | Image, nearby three-selector row, selected product detail |
| Routine | 720.80 | Lifestyle image, heading/copy, small texture callout, five numbered selectors |
| Packaging | 720 | Heading/copy, annotated graphic, full-width bottom recycling action |
| Reviews | 1573.44 | Rating/filter, stacked content and reviewer attributes; two loaded reviews |
| Recommendations | 468 | One card plus clear next-card peek |
| Footer | 1047.02 | Wordmark, newsletter, three visible link columns, support/privacy/payment/region/copyright |

The ingredient texture image now measures **358 × 314.03 px**, whereas the initial report approximated its visible image area as 358 × 282. This fresh settled image measurement is authoritative for this pass. Whole ingredient module height remains 733.54. Treat’s approved 4:3 image is an adaptation rather than an exact Rhode ratio.

The mobile sticky purchase bar remains **390 × 72 px**, at x=0/y=772 in the 844 px viewport. It displays two adjacent controls and omits product-name/thumbnail bulk. It appears after the purchase region, remains present throughout education/reviews, then loses its sticky class and moves below the viewport when the footer enters. At the observed transition the footer begins y=340.49 and the purchase bar is already below y=844. No purchase control was activated.

## Interaction checks

- **Full ingredients:** opened the bottom trigger. The texture image stays visible; the normal explanation card is replaced by the full INCI presentation. Scroll remained 4540.5 in this opening. Focus remained on the original trigger. Escape did not close it. Explicit Close did close it; after the close target disappeared, subsequent state showed document focus. Helix should retain its planned accessible inline disclosure, visible close target, Escape behavior and focus restoration rather than copy this defect.
- **Application:** inspected the initial instruction, activated Next twice and verified instructions 2 and 3. All three use the same 2+1 montage, without the additional desktop portrait. The changing instruction height changes whole-module height from 616 to 553 to 585 px. A fixed total height would copy an arbitrary state and introduce empty area or clipping. Transition screenshots may show moving text; settled screenshots and final geometry are the evidence for layout.
- **Routine:** inspected Cleanse then selected 03 Glaze. The large lifestyle image and small formula texture/name update together. The selected 03 control is visibly highlighted and exposed as checked. Overall height remains about 720.8 px. All five selectors remain in one row.
- **Footer:** visually confirmed sticky bar removal and all three visible navigation columns. No collapsed mobile footer accordions.

## Evidence

`metrics.json` records final DOM geometry, with application step 3 and routine Glaze selected. `full-step3-glaze.png` captures the complete page in that state. Viewport screenshots cover top, purchase, video, profile, outcomes, results, ingredient top/closed/open, application steps 1/2/3, comparison, routine Cleanse/Glaze, packaging, reviews, recommendations, footer start and footer bottom. The full sequence was inspected in overlapping viewport captures rather than relying solely on a compressed full-page image.

Limits: viewport emulation, no physical touch or virtual-keyboard testing, no screen reader, no authenticated or populated-commerce states. No claim of successful finger swiping. Existing source report remains the desktop comparison; a separate iteration-2 agent is independently checking desktop.
