# Rhode About Structure Audit

Date: 2026-06-19

## Access Status

Direct Chrome inspection of `https://www.rhodeskin.com/pages/about-us` was requested for this task, but the Codex Chrome browser policy blocked access to the Rhode domain and explicitly prohibited using another browser surface as a workaround. No Rhode source code, copy, assets, founder language, imagery, advisors, CSS, product identity, or trade dress were copied.

Safe inputs used instead:

- Existing local layout audit: `docs/design/rhode-layout-audit.md`.
- User-provided structural checklist for a long About page.
- Existing Mei Pelle visual system and product presentation contract.

## Existing Local Layout Takeaways

The prior local Rhode layout audit measured home, collection, and PDP surfaces across `1920x1080`, `1440x900`, `1024x768`, `768x1024`, `390x844`, and `360x800`.

Reusable structural observations for Mei Pelle:

- Use an inset wide editorial frame instead of a narrow 1200px marketing-page container.
- Alternate dense text with large visual fields so the page breathes over a long scroll.
- Keep media and text blocks stable with defined heights and aspect ratios.
- Let desktop sections feel tall and immersive; reduce into stacked mobile bands without horizontal page overflow.
- Use deep footer transition as part of the editorial rhythm.
- Use large display typography sparingly for true section statements.
- Preserve a centered wordmark/header system across editorial routes.

## About-Page Rhythm Applied To Mei Pelle

Because direct About inspection was blocked, this implementation avoids any exact sequence matching. The About route uses an original progression:

1. Cinematic Seoul / Los Angeles hero.
2. Short opening narrative.
3. Two-part cultural split module.
4. Men-focused positioning section.
5. Large numbered standard statements.
6. Formula philosophy section.
7. Sustainability-as-operating-discipline section.
8. Three-promise brand system.
9. Closing CTA.

## Measurement Targets For Local Validation

The completed Mei Pelle pages should be validated at:

- `1920x1080`
- `1440x900`
- `1024x768`
- `768x1024`
- `390x844`
- `360x800`

Checks:

- No page-level horizontal overflow.
- Header remains readable and centered.
- Method and About are visually distinct.
- About uses large alternating narrative modules rather than product-manual sections.
- Method uses ordered, scan-friendly modules rather than brand-origin storytelling.
