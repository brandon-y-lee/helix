# Local prototype review record

Authority: local implementation/verification/checkpoint only. No remote publication, push, PR, merge, deployment, provider settings, real sends or payments. Full goal remains pending screenshot/model reference bytes. Local prototype path is explicit and is not normal Spec Ticket delivery.

## Independent planning

- Full candidate plan.md SHA bac22da55b0d71a3e1ec97f29461cabca3445ba28d6b6762f01760080511ef5a: Spec /root/spec_review revise (references missing, clarify local boundary); Standards /root/standards_review revise (motion controls, CSS scope, missing references). Resolved independently actionable concerns in bounded candidate; complete redesign remains blocked.
- Independent-layout-plan.md SHA 3d5cedfaa99ca82684f1f77f0bc198685913bcdcd590aa5e3a9ffb1fbf8dc5e0: Spec /root/spec_review approve; Standards /root/standards_review approve. Both explicitly approve unfinished local prototype only.
- Keyboard-delta.md initial SHA 9da22c572da85a7de07b64871e9658808ed9165e8486831d38523bd3fcd1c073: Spec revise to include Tab/focus and pointer movement activation; Standards approve with natural hover verification. Revised exact SHA cb2277470eadaafb9ba5f5b6e90b3f0961b1bfb120722cd4695949d0a90f92f6: both independent reviewers approve.

## TDD and checks so far

- Initial new tests reproduced missing pause control and wrong section order: 2 failures, 15 passing.
- New keyboard regression test reproduced layout-induced hover overriding keyboard selection: 1 failure.
- Implemented bounded behavior: focused suite 4 files, 23 tests PASS.
- Initial lint PASS. Initial typecheck FAIL due shared node_modules missing resend, @react-email/render and sharp; repaired worktree-only dependency installation with pnpm install --frozen-lockfile --ignore-scripts. Shared node_modules untouched.
- Initial full suite before dependency repair: 17 files failed, 237 passed, 1 skipped; 1 test failed, 2526 passed, 8 skipped; one worker timeout. Most failed suites lacked the three dependencies; GitHub workflow activation test timed out. Retest with complete locked worktree dependencies pending.
- git diff --check PASS.

## Browser observations

@Browser local / baseline and prototype inspected; live Rhode hero and lower values section inspected. Smooche page content read with web tool, no claims copied. No supplied attachment pixels have been inspected on this executor.

- 1440x900: no horizontal overflow; hero 12px radius, computed bottom margin 36px (=2.5vw); Plug media 863.0703px / copy 464.7344px = 1.857126 (65/35) with 12px radii. Top header inset into hero; revealed header stays at top.
- 390x844: no horizontal overflow; hero bottom margin 9.75px (=2.5vw), 12px radius; panels stack and controls/links remain accessible. Paused hero observed video.paused=true, motion-state=paused, accessible Play label. Core anchor navigated successfully.
- 320x568: no horizontal overflow; Plug and principles single columns 273px.
- 768x1024: no horizontal overflow; Plug single column 718.453px.
- Principles click + End after hydration: focus sustainability, active index2 and aria-pressed=true. Prior reproduced mismatch resolved; focused test covers reflow pointer-entry and restoring deliberate hover.
- Client-side / → /products/super-serum: canonical product route loaded, homepage island count0, header top0, no horizontal overflow. Existing PDP content, media, and purchasing controls rendered.
- Browser screenshots of desktop hero, Plug split, mobile hero and moved principles emitted in tool results. Transferable screenshot files not yet saved.

## Reference blocker

Library skill current c2/library and materialization guide read. Tool inventory has only Library create/replace/prepare_uploads/finalize_uploads; no list/search/read/prepare_materialize. user_message_read returned all five exact attachment IDs/names/sizes but no bytes or transfers. No image download attempted, no denial and no uncertain transfer. Helper sources library_file_transfer.py and library_hosted_apps.py fetched unchanged into /tmp/helix-lander-library-helpers, ready for supported transfer objects. Do not guess URLs or scan workspace for Library-backed targets.

## Reference completion update

Parent resolved materialization via supported Space flow. All five files at /Users/brandonlee/helix-landing-references verified with file and exact byte sizes, then all pixels inspected directly. Initial tooling blocker resolved; no transfer denial occurred.

Reference-completion-plan.md SHA3086681f42f3004e96d65d579c0262594b732f1f78ce153b966907d700f2bae1 independently approved by /root/spec_review and /root/standards_review before generation/implementation. Generated model is readable and optimized project-local; provenance in image-provenance.md.

Super Serum section now58/42 directly after Core; values now large Manrope statement with Our Values CTA and bottom selectors per supplied screenshot. 1440px computed serum columns770.125/557.68; values703.734/624.062. Mobile390, narrow320, tablet768: single column and no horizontal overflow. Generated image loaded with natural image width390 on mobile and806 desktop optimized rendition. Reduced-motion browser emulation: hero static, zero hero/plug videos, zero controls; emulation reset. Final mobile End test selected/focused Sustainability with aria-pressed=true.

Transferable screenshot evidence saved in /tmp/helix-lander-evidence/: serum-desktop.jpg, serum-mobile.jpg, values-desktop.jpg, values-mobile.jpg. Browser measurements and screenshots used public catalog content only; no account/customer screens or private data captured.

After dependency repair: lint and typecheck PASS. Previous complete serial suite PASS255 files/2725 tests, 1 file/8 tests pre-existing skips. Complete final suite rerunning after reference-completion changes. Standard4-worker full run failed2 unrelated tests by timeouts plus1 worker timeout; serial run resolved those without modifying tests or timeouts. No gate claimed for failed/default run.

Final complete serial Vitest: PASS255 files /2726 tests;1 file /8 tests skipped (existing catalog-restore-sql-service). Command pnpm exec vitest run --maxWorkers=1, duration210.31s. Final lint/typecheck/diff whitespace checks PASS. Skipped SQL proof is unchanged, outside this UI scope; no full integration gate claimed.
