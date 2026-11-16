# Helix System and About mobile editorial supplement

Observed 2026-09-10 on `http://127.0.0.1:3100` in the Codex in-app Browser at **390 × 844** and **1440 × 1000**. This supplements the service-route audit and leaves Treat/collection comparison to the lead Helix consultant. Both routes were actually rendered, measured, and captured at both sizes. Skincare and Brand & Platform domain language was consulted. No source, remote state, forms, commerce, or git state was changed.

## Section geometry

All coordinates below are document positions in CSS pixels, rounded. Each entry is **top / height**. The JSON evidence also contains full rendered DOM snapshots, heading sizes, controls, media dimensions, and complete visible text.

| System section | Mobile top / height | Desktop top / height |
| --- | ---: | ---: |
| Hero | 62 / 782 | 64 / 936 |
| The Core | 844 / 750 | 1000 / 774 |
| Intentional skincare | 1610 / 885 | 1806 / 760 |
| Targeted steps | 2511 / 993 | 2598 / 822 |
| Research-backed ingredients | 3520 / 1182 | 3453 / 1143 |
| Full document, including footer | 5917 | 5967 |

| About section | Mobile top / height | Desktop top / height |
| --- | ---: | ---: |
| Two cities hero | 62 / 601 | 110 / 1039 |
| Origin principles | 735 / 600 | 1195 / 402 |
| Seoul / Los Angeles cultures | 1407 / 1394 | 1727 / 945 |
| Why men | 2873 / 499 | 2801 / 350 |
| The standard | 3444 / 1176 | 3281 / 1166 |
| Formula philosophy | 4691 / 941 | 4576 / 717 |
| Operating discipline | 5704 / 625 | 5423 / 500 |
| Prepare, treat, preserve | 6401 / 674 | 6052 / 490 |
| Closing call to action | 7148 / 420 | 6671 / 495 |
| Full document, including footer | 8783 | 8538 |

Both routes had `documentElement.scrollWidth` equal to their viewport width. There was no whole-document horizontal overflow in these states.

## System: what changes and what still fails mobile hierarchy

- **The image-led presentation survives.** Desktop hero is a landscape crop; mobile becomes a tall portrait crop with an 18px centered sentence, down from 24px. It is an image, not a video. The first viewport is entirely atmospheric: The Core begins at y844. The initial desktop hero capture preceded image completion; the final full-page screenshot was replaced after the image was verified loaded. Do not report a missing hero image.
- **Core selector is the clearest mobile defect.** Desktop gives three product tabs enough width for complete names and separates arrow controls at the right. Mobile crams the same three tabs plus both arrows into a 312px-wide strip. Each tab is roughly 69×67px; visible product names become `Biotic Re…`, `Super Se…`, and `Ceramid…`. This truncates the exact product names needed to choose a step. Core previous/next buttons are 38×38px. Use compact step labels with a full active product name or move navigation to its own row; preserve the three-step selector and clear selected state.
- **The Core slide itself is nearly desktop height.** A 750px mobile section contrasts with 774px desktop, putting a large gap between headline/CTA and selector. Its CTA is a useful 45px high. Reduce section height based on content and mobile image crop so the relationship among image, product, CTA, and next-step controls can be read without scanning a full screen.
- **Intentional skincare is a padded desktop half stacked above its image.** Desktop is a 760px two-column text/image section; mobile becomes 885px with the text area about 523px tall and the image about 374px. The short heading and paragraph float in generous blank space. Use content-driven text padding and a separately specified mobile image aspect ratio.
- **Targeted steps correctly becomes a 2×2 grid**, from four desktop cards in one row. Each mobile card is about 153×390px; product headings are 18.4px and sometimes wrap two lines, while status remains at the bottom. Full-card product links provide a large target. The soft blurred/gradient-looking media treatment is visibly present for the unreleased products; this audit did not establish whether it is a deliberate asset choice, so it is not labeled a load failure. Two-column names and statuses remain readable at 390px, but 390px-tall cards make a lengthy section.
- **Ingredient interaction has ambiguous mobile association.** Cards shrink from a multi-card desktop rail to one dominant 304×380px mobile card. Clicking **Next ingredient** moved the visible card from PDRN to Peptides while the detail panel below remained PDRN. Clicking the Peptides card then correctly updated the selected tab, detail heading, facts, product links, and live-status text. These are separate browse and select actions, not a data bug. With one card visible, the mismatch is misleading: make the selection relationship explicit, or synchronize selected detail with the dominant card as a separately specified behavior change. The arrow is 40×40px; product chips under detail are 30px high and 11.2px text.
- The mobile detail panel itself is readable: selected title 32px, then labeled identity, mechanism, relevance, and product links. It occupies about 590px for PDRN. Preserve this factual hierarchy and do not compress ingredient copy into inaccessible tiny type.

## About: the mobile problem is cumulative reading weight

- **About uses a text-and-gradient composition throughout.** No `img` or `video` elements were present in the rendered main content; inspected sections show typography, gradient panels, rules, lists, and buttons. Its visual language is unlike the photo-led System. The parent should compare this against the separate Rhode editorial evidence before deciding on assets or scope.
- The mobile hero scales from a very large 172.8px desktop H1 to 58.5px, wraps to three lines, and stacks two 50px-high CTAs. It fits at 390px. The hero is 601px tall, with useful navigation visible in the first viewport.
- **The two-culture section is almost 1.7 mobile viewports on its own.** Two side-by-side desktop culture cards stack. Their 62.4px mobile subheadings each occupy three lines; the cards repeat the surrounding origin message through paragraph + five-item lists. Reduce mobile display scale and use a clearer shared structure so a visitor can compare Seoul and Los Angeles without a long scroll between them. Do not add unsupported factual claims.
- **The five standards retain desktop list weight.** The mobile section is 1176px, essentially the same absolute height as desktop's 1166px. Numbers become their own row above headings and paragraph copy; each rule reads like a separate miniature manifesto. Compact number/heading rows and smaller vertical intervals can preserve every principle while reducing scrolling.
- Formula philosophy stacks a decorative gradient panel before the heading and five-point list, reaching 941px. Operating discipline adds 625px, and the three oversized statement cards in Prepare/Treat/Preserve add another 674px. These adjacent sections carry similar rhetorical weight. A mobile composition needs shorter inter-section gaps, content-height cards, and varied emphasis rather than shrinking the whole desktop hierarchy proportionally.
- Primary CTAs remain 50px tall and fit the viewport. The closing text visibly reads `ascension., DELIBERATELY.`; punctuation is an existing copy issue, not a mobile clipping problem. The final section repeats System/shop routes already offered in the hero.

## Verification and scope limits

The mobile pass scrolled through all System sections and the major About sections, captured full-page screenshots for both routes/sizes, and inspected viewport screenshots at the hero, Core, intentional image/text boundary, targeted cards, ingredient rail/detail, culture cards, Why men, standards, formula/operating sections, and closing sections. Core Next correctly switched CLEANSE to TREAT and its product CTA. Ingredient Next and explicit card selection were inspected as described above.

This is a bounded visual audit, not an end-to-end interaction certification. Actual touch dragging/swiping, every Core/ingredient tab, keyboard arrow navigation, every product link destination, other breakpoints, reduced motion, image/network failure, and screen-reader behavior were not tested. Full-page screenshot capture is not a claim that every pixel of every desktop section received manual review. No implementation tests or commits were performed.

## Evidence

- [System mobile full page](../../outputs/mobile-audit/helix/editorial/system-mobile.png) and [desktop full page](../../outputs/mobile-audit/helix/editorial/system-desktop.png)
- [Core mobile selector](../../outputs/mobile-audit/helix/editorial/system-mobile-core.png) and [desktop selector](../../outputs/mobile-audit/helix/editorial/system-desktop-core.png)
- [Core TREAT selected](../../outputs/mobile-audit/helix/editorial/system-mobile-core-treat.png)
- [Targeted cards mobile](../../outputs/mobile-audit/helix/editorial/system-mobile-targeted.png)
- [Ingredient browse/detail mismatch](../../outputs/mobile-audit/helix/editorial/system-mobile-ingredients.png)
- [About mobile full page](../../outputs/mobile-audit/helix/editorial/about-mobile.png) and [desktop full page](../../outputs/mobile-audit/helix/editorial/about-desktop.png)
- [About culture mobile](../../outputs/mobile-audit/helix/editorial/about-mobile-body-1.png), [Why men](../../outputs/mobile-audit/helix/editorial/about-mobile-body-2.png), [standards](../../outputs/mobile-audit/helix/editorial/about-mobile-body-3.png), [operating discipline](../../outputs/mobile-audit/helix/editorial/about-mobile-body-4.png), [closing sections](../../outputs/mobile-audit/helix/editorial/about-mobile-final-sections.png)
- [Complete section measurements and rendered snapshots](../../outputs/mobile-audit/helix/editorial/section-measurements.json)
