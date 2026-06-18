# Rhode Layout Audit

Measured on 2026-06-18 in the in-app browser. Scope was layout observation only for:

- https://www.rhodeskin.com/
- https://www.rhodeskin.com/collections/shop
- https://www.rhodeskin.com/products/pocket-bronze-bake

No source code, assets, product names, claims, or brand copy were copied. Measurements are rounded CSS pixels from live rendered DOM at 1920x1080, 1440x900, 1024x768, 768x1024, 390x844, and 360x800.

## Global Frame

The site uses an inset "full bleed" frame rather than true edge-to-edge content. The main content and fixed header share the same left/right inset.

| Viewport | Measured gutter | Content width | Notes |
| --- | ---: | ---: | --- |
| 1920x1080 | 43.2 | 1818.6 | About 2.25vw side inset. |
| 1440x900 | 32.4 | 1360.2 | Same proportional inset. |
| 1024x768 | 23.0 | 962.9 | Same proportional inset. |
| 768x1024 | 17.3 | 718.5 | Same proportional inset. |
| 390x844 | 16.0 | 343.0 | Fixed phone gutter. |
| 360x800 | 16.0 | 313.0 | Fixed phone gutter. |

Header geometry:

| Page / Viewport | Header box | Initial top | After ~600px scroll |
| --- | ---: | ---: | --- |
| Home 1920 | 1818.6 x 134.6 | y 40 | y -152.6, top style ~4.6px |
| Home 1440 | 1360.2 x 122.2 | y 40 | y -149.2, top style ~4.5px |
| Home 1024 | 962.9 x 106.2 | y 48 | y -137.9, top style ~5.5px |
| Home 768 | 721.0 x 75.0 | y 66 | y -143.2, top style ~7.5px |
| Mobile 390 | 343.0 x 73.9 to 89.9 | y 73 | y about -91 to -141 |
| Mobile 360 | 313.0 x 73.7 to 89.7 | y 73 | y about -88 to -140 |

The header is fixed. It retreats upward on scroll instead of occupying document flow, so the movement does not push content around.

## Home Page

Hero and first product rail:

| Viewport | Hero box | Hero ratio | Product rail card | Rail viewport / scroll width |
| --- | ---: | ---: | ---: | ---: |
| 1920x1080 | 1818.6 x 993.6 | 1.8 | 579.7 x 702.4 | 1818.6 / 16071 |
| 1440x900 | 1360.2 x 810.0 | 1.7 | 426.7 x 517.0 | 1360.2 / 12093 |
| 1024x768 | 962.9 x 576.0 | 1.7 | 345.8 x 419.0 | 962.9 / 9990 |
| 768x1024 | 718.5 x 960.0 | 0.7 | 300.9 x 364.6 | 718.5 / 8323 |
| 390x844 | 343.0 x 487.5 | 0.7 | 282.5 x 440.0 | 343.0 / 7845 |
| 360x800 | 313.0 x 450.0 | 0.7 | 257.5 x 440.0 | 313.0 / 7195 |

Observations:

- The home hero is an inset full-viewport-style media block, not a full browser-width block.
- Desktop hero media is 16:9-ish and object-fit cover, centered. At 1440 and 1024 it crops slightly compared with the natural 16:9 source. Mobile swaps to portrait media around 0.7 to 0.8 ratio and stays centered.
- The first product module is a single horizontal rail. Cards remain in one row; overflow is hidden in the measured container. The rail width is far larger than the viewport and likely advanced by drag/buttons.
- Rail cards are portrait. Desktop/tablet cards are about 0.8 ratio; phone cards are narrower, about 0.6 ratio, with a fixed 440px height.

Home section rhythm:

| Viewport | Hero | First rail | Following media/text blocks | Footer depth |
| --- | ---: | ---: | ---: | ---: |
| 1440x900 | 810.0 | 517.0 | 641.1, 709.6, 741.9, 761.0 | 959.4 |
| 768x1024 | 960.0 | 364.6 | 1115.3, 783.1, 391.9, 1176.8 | 946.2 |
| 390x844 | 487.5 | 440.0 | 532.4, 373.9, 289.0, 561.8 | 1039.8 |

Split behavior:

- Desktop split modules commonly use 50/50 grids. Example at 1440: a 1360.2 x 709.6 module has two 661.1px children with a 38px gap.
- Tablet keeps some 50/50 grids but converts many media groups into horizontal rails.
- Phone widths mostly turn split media modules into 100%-width horizontal rails rather than vertical stacks.

## Collection Page

Top banner media:

| Viewport | Banner media box | Ratio | Object fit |
| --- | ---: | ---: | --- |
| 1920x1080 | 1818.6 x 627.9 | 2.9 | cover |
| 1440x900 | 1360.2 x 469.6 | 2.9 | cover |
| 1024x768 | 962.9 x 332.5 | 2.9 | cover |
| 768x1024 | 718.5 x 525.9 | 1.4 | cover |
| 390x844 | 343.0 x 251.1 | 1.4 | cover |
| 360x800 | 313.0 x 229.1 | 1.4 | cover |

Product grid:

| Viewport | Grid pattern observed | Card box | Approx gaps |
| --- | --- | ---: | --- |
| 1920x1080 | 3 columns, alternating 3/2 rows | 569.9 x 690.6 | 54px column, 33px row |
| 1440x900 | 3 columns, alternating 3/2 rows | 426.7 x 517.1 | 40px column, 25px row |
| 1024x768 | 3 columns, alternating 3/2 rows | 302.6 x 440.0 | 28px column, 18px row |
| 768x1024 | 2 columns with staggered 2/1 rows | 349.3 x 423.3 | 20px column, 14px row |
| 390x844 | 2 columns with staggered 2/1 rows | 167.3 x 289.0 | 8px column, 8px row |
| 360x800 | 2 columns with staggered 2/1 rows | 152.5 x 289.0 | 8px column, 8px row |

Observations:

- The collection grid contains 43 measured product-card articles.
- Cards use image-as-card geometry: the visible article and media share the same box, with object-fit cover.
- Desktop and 1024 stay at three columns. Tablet and phone use two columns.
- The measured pattern alternates complete rows and missing-cell/staggered rows. This appears intentional, not a load shift.
- On phone, image height stays 289px while width changes from 167.3px to 152.5px, making the 360px viewport cards visibly slimmer.

Collection page depth:

| Viewport | Page scroll height | Product grid starts | Footer top | Footer depth |
| --- | ---: | ---: | ---: | ---: |
| 1920x1080 | 13797 | 960.4 | 12642.8 | 1154.6 |
| 1440x900 | 10484 | 761.4 | 9524.5 | 959.4 |
| 1024x768 | 9000 | 609.6 | 8024.2 | 976.3 |
| 768x1024 | 12298 | 776.5 | 11351.9 | 946.2 |
| 390x844 | 8753 | 499.1 | 7713.8 | 1039.8 |
| 360x800 | 8757 | 476.8 | 7687.3 | 1069.7 |

## Product Detail Page

Top PDP module:

| Viewport | Top section | Visible media | Purchase/info panel | Form box |
| --- | ---: | ---: | ---: | ---: |
| 1440x900 | 1360.2 x 765.0 | 718.0 x 684.0 | x 808.5, w 541.1 | 541.1 x 80.2 |
| 1024x768 | 962.9 x 652.8 | 499.6 x 583.7 | x 580.6, w 362.3 | 362.3 x 78.9 |
| 390x844 | 343.0 x 1840.6 | 322.4 x 439.7 | stacked, x 32, w 311.0 | 311.0 x 98.6 |
| 360x800 | 313.0 x 1848.5 | 294.2 x 401.3 | stacked, x 32, w 281.0 | 281.0 x 98.5 |

PDP proportions:

- At 1440, the media viewport is about 53% of content width and the purchase panel is about 40%, with roughly 58px between visible media and panel.
- At 1024, media is about 52% and the panel is about 38%, again with about 58px separation.
- At phone widths, the media carousel sits above the purchase panel. The first slide is slightly narrower than the viewport, leaving a sliver of the next slide visible.

Sticky behavior:

- No product-info sticky element was measured in the first PDP section. The purchase panel parent computed as static.
- Scroll probe at 1440: form y moved from 721.2 to 123.7 after scrollY 597.5.
- Scroll probe at 1024: form y moved from 702.1 to 127.6 after scrollY 574.5.
- Scroll probe at 390: form y moved from 1168.0 to 570.5 after scrollY 597.5.
- The only sticky/fixed behavior observed in the PDP top area was the global header hiding upward on scroll.

PDP media carousel:

| Viewport | Media container | Scroll width | Slide behavior |
| --- | ---: | ---: | --- |
| 1920x1080 | 1818.6 x 918.0 | 9223 | Horizontal, overflow hidden |
| 1440x900 | 1360.2 x 765.0 | 6928 | Horizontal, overflow hidden |
| 1024x768 | 962.9 x 652.8 | 4943 | Horizontal, overflow hidden |
| 768x1024 | 718.5 x 921.1 | 3565 | Horizontal, first slide plus overflow |
| 390x844 | 343.0 x 439.7 | 1710 | Horizontal, partial next slide visible |
| 360x800 | 313.0 x 401.3 | 1562 | Horizontal, partial next slide visible |

Related product rail:

| Viewport | Card count | Card box |
| --- | ---: | ---: |
| 1920x1080 | 12 | 579.7 x 702.4 |
| 1440x900 | 12 | 426.7 x 517.0 |
| 1024x768 | 12 | 345.8 x 419.0 |
| 768x1024 | 12 | 300.9 x 364.6 |
| 390x844 | 12 | 282.5 x 440.0 |
| 360x800 | 12 | 257.5 x 440.0 |

## Motion And Layout Stability

Common motion values observed:

- 0.7s `all` with `cubic-bezier(0.76, 0, 0.24, 1)` across many interactive/header elements.
- 0.7s paired `background-color, opacity` with the same cubic easing on mobile controls.
- 0.3s `opacity` with `ease-out`.
- 0.5s `right` with `ease`.
- 0.35s `margin-left` with `cubic-bezier(0.19, 1, 0.22, 1)`.

Layout shift notes:

- The browser scope did not expose usable layout-shift performance entries, so no numeric CLS was recorded.
- Manual scroll checks showed the fixed header moving out of view without pushing document content.
- Major media and card boxes had stable dimensions after the initial 2.5s settle wait.
- The page root did not show meaningful horizontal overflow; large rails hide overflow inside their own containers.
- The collection grid's alternating row counts are part of the rendered grid pattern, not a late-loading shift in the measured pass.

## Useful Takeaways For Mei-Pelle

- Use an inset full-bleed frame: proportional desktop gutters around 2.25vw, then fixed 16px phone gutters.
- Treat homepage and PDP media as framed immersive blocks, not edge-to-edge browser bleeds.
- Keep product cards image-forward with stable aspect ratios and no text-driven card height changes.
- Use horizontal rails for hero-adjacent product discovery and related products.
- Use a 3-column desktop collection grid, 2-column tablet/mobile grid, and preserve small phone gaps.
- PDP can use desktop media/info side-by-side, but mobile should stack a horizontal media carousel above the purchase panel.
- Footer is intentionally deep: about 950-1150px depending viewport.
