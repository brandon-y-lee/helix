# Core and Beyond introduction spacing — local verification

Exact plan SHA `57a50c3aa8e54783768fc1f5f143548000852a3b3114dfd2db1b988eaf915934` independently APPROVED before implementation by Spec `/root/spec_review` and Standards `/root/standards_review`. Parent separately inspected supplied screenshot pixels and reported their context; no local Library-pixel inspection claim. Source change only `app/home.css`: add2.5vw to the existing2.5vw flow gap above the two introductions, replace inherited28–48px intro-bottom margin with2.5vw. All other section gaps/styles/content/behavior preserved; no JS changes or new mirrored styling tests.

## Actual rendered measurements

Measured previous visual-panel bottom→eyebrow paragraph top and description paragraph bottom→first product-card top, not merely computed gap declarations. BOTH Core and Beyond return the same values:

| Viewport | Above eyebrow (5vw total) | Description block→card (2.5vw) | Last-character em→card |
| --- | --- | --- | --- |
|1440×900|72px|36px|38.1484px|
|768×1024|38.3906px|19.1953px|21.1484px|
|390×844|19.5px|9.75px|11.7031px|
|320×568|16px|8px|9.9531px|

Subpixel rounding at768 is normal. The final column separately reports the unchanged font's normal lower leading beyond text character em bounds; it is not additional CSS section spacing or an exact glyph-ink measurement. Existing typography/line-height deliberately preserved. All unrelated adjacent section gaps remain2.5vw at every viewport; no horizontal overflow.

Baseline1440:36px above/48px below block;390:9.75px above/28px below. Thus no accidental7.5vw top total and no retained clamp below. Raw baseline/after measurements `/tmp/helix-carousel-intro-spacing/baseline.json`, `measurements.json`.

## Regression checks

- Existing homepage wiring, phased-description updates/live announcement, carousel focus/reflow/endpoints/vertical-scroll contracts: PASS3files/17tests. No test source changes.
- Lint PASS/no warnings or errors; typecheck PASS; production build PASS(exit0), existing unrelated admin CSS autoprefixer warning only. Diff whitespace PASS.
- Production Browser default descriptions at1440/768/390/320 measured above. At390, native keyboard Tab transitions to Super Serum and Peptide Eye Cream render the expected treatment/eye-area descriptions and retain19.5px upper/9.75px lower gaps. Mobile previous/next controls for both rails move index1→0→1; focus remains on Next product. Beyond pointer hover renders Balancing Prep description and preserves the paragraph gap. Initial locator-focus attempts retained prior preview state; native keyboard transitions verified actual behavior, with no app defect demonstrated or source change needed. Dynamic animation measurements can temporarily reserve old line height; static/default font-leading values above were separately measured after layout settled.
- Screenshots include preceding panel edge, eyebrow, text and first cards: `core-desktop.jpg`, `beyond-desktop.jpg`, `core-mobile.jpg`, `beyond-mobile.jpg` in the same evidence directory. Native pointer movement used documented Browser CDP; no page content/browser settings modified. Viewport reset.
- No full Vitest/integration gate or native touch dispatch claimed for this bounded CSS change. No push/deploy/Library writes. Production preview remains `http://127.0.0.1:3100/`, run `pnpm start --hostname 127.0.0.1 --port 3100` in `/tmp/helix-lander-review`.
