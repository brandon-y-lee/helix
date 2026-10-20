# Revetir legal source and layout capture

Captured on 2026-10-20 UTC from the current public pages:

- https://revetir.com/us/privacy-policy
- https://revetir.com/us/terms-conditions
- https://revetir.com/us/customer-care/accessibility

The owner authorized complete copying. No source text was summarized or rewritten. No remote state was changed. Capture used read-only curl followed by isolated Playwright Chromium 1.55.1. The in-app browser (`iab`) was unavailable; user Chrome was not used. All six rendered captures returned HTTP 200.

## Deliverables and source authority

For each slug (`privacy-policy`, `terms-conditions`, `accessibility`):

- `*.response.html`: complete original HTTP response, including embedded CSS and application scripts.
- `*.article.html`: article subtree extracted from the original response. This retains Cloudflare's original obfuscated email markup.
- **`*.rendered.article.html`: complete hydrated article subtree. Use this for implementation; email addresses have been decoded by the live page.**
- `*.article.txt`: complete rendered article text with natural paragraph boundaries.
- `*.structure.json`: complete ordered heading and rendered-link inventory, with paragraph and list-item counts.
- `*-desktop.measurements.json`, `*-mobile.measurements.json`: actual element rectangles and computed styles, including every heading, paragraph, section, list, list item, and link.
- `manifest.json`: file checksums, capture provenance and completeness counts.

Rendered text includes all source legal sections. Privacy has 12 headings (one h1, ten h2, one h3), 23 paragraphs and 23 list items. Terms has 59 headings (one h1, 27 h2, 28 h3, three h4), 68 paragraphs and 11 list items. Accessibility has three headings (one h1 and two h2), four paragraphs and three list items. Terms' four email references become plain text after hydration; they are retained in the rendered HTML/text even though they are no longer anchors.

Screenshots are outside Git at `/tmp/helix-legal-artifacts/source/`: each slug has `-desktop-top.png`, `-desktop-full.png`, `-mobile-top.png`, `-mobile-full.png`. Top images were visually inspected. Full-page images capture the whole article and footer. Viewports were desktop **1440 × 1000** and mobile **390 × 844**, device scale factor 1.

## Shared source shell

The source uses Satoshi (`"Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif` fallback). Header height is 64px at both measured sizes. Main begins at y=64. White background, black headings. Desktop has text navigation to either side of a centered REVETIR wordmark; mobile has menu/search and account/bag icons. No article sidebar, table of contents, cards, dividers, or article background tint appears on these pages.

`.content-container` is `width:100%;max-width:1440px;margin-inline:auto;padding-inline:24px`. Thus at widths above 1440 the container centers with an additional outer gutter. The responsive `md` breakpoint is 768px.

## Privacy and terms layout

These two pages use the same single reading column. Outer content padding is 32px top/bottom and 24px left/right. The inner column is `max-width:896px;margin-inline:auto`.

| Property | Desktop 1440 | Mobile 390 |
| --- | --- | --- |
| Article left edge | 272px | 24px |
| Article width | 896px | 342px |
| h1 top | 96px | 96px |
| h1 font / line height / weight | 32 / 48 / 700 | 32 / 48 / 700 |
| h1 bottom margin | 32px | 32px |
| h2 font / line height / weight | 24 / 32 / 600 | 24 / 32 / 600 |
| h2 bottom margin | 16px | 16px |
| h3 font / line height / weight | 20 / 28 / 600 | 20 / 28 / 600 |
| h3 bottom margin | 12px | 12px |
| Body font / line height / weight | 14 / 20 / 400 | 14 / 20 / 400 |
| Body color | rgb(75,85,99) | rgb(75,85,99) |

Font and spacing do not shrink on mobile; the column narrows and natural wrapping increases height. Sections typically have 32px bottom margin; body paragraphs within sections have 16px bottom margin; opening/date/publication paragraphs use 32px bottom margin. Lists have 16px left margin; privacy list rows have 8px inter-item spacing. Bold labels remain inline inside body/list text. Privacy email links are blue (`rgb(37,99,235)`) without underline. Terms policy links inherit body color and are underlined.

Privacy begins h1 → date (`Last updated September 11, 2026`) → operator/summary paragraph → ten substantive h2 sections, with California privacy rights as an h3. Terms begins h1 → US-applicability paragraph → h2 `REVETIR Terms and Conditions` → date (`Last updated: October 2026`) → publication paragraph → numbered sections and subsections. It includes separate `SERVICES CONDITIONS` and `PURCHASE CONDITIONS` and `GENERAL` grouping headings. Preserve actual heading order and numbering from the structure inventory, including all 27 h2, 28 h3, and three h4 headings.

| Full document height | Desktop | Mobile |
| --- | --- | --- |
| Privacy | 4065px | 7723px |
| Terms | 10011px | 19001px |

These heights include the source shell/footer and depend on the source font. They are evidence, not target fixed heights.

## Accessibility layout

Accessibility has a separate editorial layout: an eyebrow `Accessibility`, then the entire opening commitment sentence as the h1, followed by two modest body sections. The reading block is left aligned inside the shared content container, max-width 768px; there is no centered 896px column.

| Property | Desktop 1440 | Mobile 390 |
| --- | --- | --- |
| Reading left edge / width | 24px / 768px | 24px / 342px |
| Content top padding | 56px | 40px |
| Content bottom padding | 96px | 64px |
| Eyebrow top | 120px | 104px |
| Eyebrow font / line / tracking | 10 / 15 / 1.6px | 10 / 15 / 1.6px |
| h1 top | 151px | 135px |
| h1 font / line / weight / tracking | 32 / 48 / 500 / -0.8px | 32 / 48 / 500 / -0.8px |
| h1 block height | 192px (4 lines) | 432px (9 lines) |
| h1 top margin | 16px | 16px |
| Header bottom padding | 40px | 32px |
| First h2 top | 383px | 599px |
| h2 font / line / weight / tracking | 16 / 24 / 600 / -0.16px | same |
| Body font / line | 15 / 24.75 | 14 / 23.1 |
| Section vertical padding | 24px; first top 0 | 20px; first top 0 |
| h2-to-body gap | 12px | 12px |
| List left padding / row spacing | 20px / 8px | same |
| Paragraph/list inter-block spacing | 16px | 16px |
| Document height | 1052px | 1576px |

The body computed color is black (the source `text-black/68` class has no effective color rule in this captured CSS). Eyebrow is black at 50% opacity. Source email and `← CUSTOMER CARE` links are black and underlined, with 4px underline offset. The bottom action is 10px uppercase, 0.8px letter spacing, in a nav with 16px vertical padding. The section scroll offset is 112px (`scroll-mt-28`).

## Baseline Helix evidence

Before app edits, the existing Helix `/privacy`, `/terms`, `/accessibility` pages were captured from `http://127.0.0.1:3036`, desktop 1440 × 1000 and mobile 390 × 844. All returned HTTP 200. Artifacts are `/tmp/helix-legal-artifacts/baseline/{privacy,terms,accessibility}-{desktop,mobile}-{top,full}.png` and adjacent computed measurements. Full document heights were privacy 8050/9648px, terms 4538/4732px, accessibility 3858/3768px (desktop/mobile). The preview and captures used the legal worktree, without touching the shared contact worktree or port 3018.

No application files, commits, pushes, merges, deployments, or provider writes were made by this source/layout capture task. No suites/builds were run; verification was source completeness plus actual desktop/mobile browser rendering.

Completeness verification: raw-response article text and hydrated article text matched exactly after whitespace normalization and replacement of Cloudflare email placeholders with their decoded address: privacy 12,006; terms 29,913; accessibility 890 normalized characters. Heading, paragraph and list-item counts were also retained.

Terms h4 subheads (`14.1.1`, `14.2.1`, `14.4.1`) use 18px / 28px, weight 600, with 8px bottom margin. Full computed values are retained in the terms measurements.
