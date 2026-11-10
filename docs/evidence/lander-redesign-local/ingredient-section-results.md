# Ingredient section — local results

User goal and exact copy are recorded in `ingredient-section-plan.md`, approved independently before implementation by `/root/spec_review` and `/root/standards_review`, both **approve**, no actionable findings, exact plan SHA256 `efa9ae009a7325be2a59a81c04e79b20512430e6e40c3bbd6633efae6b32c419`. Reference `libfile_f4c103a11dd4819194d61490af19ca68` was visually inspected by the parent; this executor's Library retrieval tools were unavailable. Actual index image pixels were inspected locally. No claim of local reference materialization.

Application candidate `886817ee720adea7381206ad1a44eabaa2fd9d29`, base `36d5000`. Changed only app/page.tsx, app/home.css, HomeIngredientPreview.tsx and existing homepage test expectations, plus bounded evidence. One surface/radius contains the left introduction/CTA and three right thumbnail rows. Static server-rendered named list replaces the former carousel so all three rows remain in normal page flow, including mobile. Row eyebrows/borders/shadows removed; images are exact existing index paths, square-cropped with reserved dimensions/decorative alt. Catalog presence/order and canonical index links are retained. All supplied text is exact. Canonical index definitions, other landing sections and shared carousel behavior are unchanged.

## Checks

- PASS: existing homepage suite11/11; lint with no ESLint warning/error; typecheck; production build exit0 in durable runtime; git diff whitespace and task prepare.
- PASS: Browser `/` at1440×900,768×1024,390×844,320×568. Desktop612.1px/612.1px columns; stacked at768px and below.12px common outer radius, zero row border/shadow, thumbnail sizes112/112/88/72px by viewport, all images loaded. No document or row horizontal overflow. Heading/body wrap naturally at320px. Three rows remain in document flow; tall mobile content scrolls vertically.
- PASS: exact heading/introduction/three descriptions verified in rendered desktop; visible2px focus on ingredient links, Tab order PDRN→Peptides→Niacinamide. Enter on Niacinamide navigated to `/system#system-ingredient-niacinamide`, actual System activeIngredient=niacinamide. Mobile Peptides focus outline visible. CTA unchanged.
- PASS: surrounding section gaps36px at1440,19.195px at768,9.75px at390,8px at320, matching2.5vw. Existing serum usage paragraph remains absent. Other section CSS not changed.
- PASS: refreshed persistent service root and all three ingredient assets HTTP200; PID45135 parent1, only127.0.0.1:3100 listening. Installed plist unchanged. Runtime source hashes match candidate886817e. Previous working runtime preserved under private AppSupport `site-rollback-20261110T100933Z`; regular0600 env and internal-only dependency links retained. No need to weaken security or replace the service definition.
- NOT RUN: full ticket/integration CI gates, logout/login, reboot, sleep/wake, quitting Codex. Prior controlled service-exit recovery remains recorded in persistent-preview verification; unchanged service config was not unnecessarily disrupted again for that test.

Machine observations: `ingredient-section-browser-checks.json` and `ingredient-section-runtime-checks.json`. Local desktop/mobile screenshots: `~/Library/Application Support/HelixPreview/screenshots/ingredients/{desktop,mobile-top,mobile-rows,narrow}.jpg`. Parent-inspected reference composition is the visual basis; no new claims were copied from Smooche.

## Handoff

Live URL http://127.0.0.1:3100/; runtime app checkpoint886817e. Existing service/management commands remain in persistent-preview-management.md. Editing the temporary source worktree does not hot-reload the durable production snapshot; refresh/build/restart after future changes. Leave service running. No push, merge, deployment, Library upload or provider mutation. Existing unrelated root legal work preserved. Library skill used only to determine available reference access; no relevant repo-local skill applied.
