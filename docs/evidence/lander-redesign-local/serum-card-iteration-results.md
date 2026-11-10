# Super Serum card iteration — local WIP

Goal message `Sentinel_dafb7bb74ee48191b2e7d56baf8d842c`. Independent plan SHA `1cbc8ad872225b8bbcfcb406611e5087b5a48cbae62ab03530f315fdf5e48dce`: Spec `/root/spec_review` APPROVE, Standards `/root/standards_review` APPROVE before implementation. Their approval is for explicit user-directed independent work; final attachment comparison remains pending supported materialization of the three new references. No full reference-fidelity completion claim.

Only implementation files changed: `components/home/HomeSuperSerumSpotlight.tsx`, section-scoped `app/home.css`, existing `tests/homepage-system-presets.test.tsx`. No image/product destination/order/guard or other section changes. Exact user text applied including ASCII ellipsis. Shared `--pdp-panel-padding` replaces custom oversized padding. Single outer12px rounded card, zero inside gap/inner radii; desktop58/42 retained. Text bottom-left; Smooche-style white compact eyebrow badge with Helix-colored decorative dot. No new efficacy language beyond user-supplied copy.

## Checks

- Recovered baseline homepage tests PASS11tests.
- Updated existing expectation before implementation: FAIL1/PASS10, missing new heading as expected. Green focused suite PASS4files/24tests. Missing-product heading assertion updated too, preserving meaningful guard coverage. No added mirrored styling test.
- Lint PASS/no warnings or errors. Typecheck PASS. Diff whitespace check PASS.
- Production build PASS(exit0); retained output `/tmp/helix-serum-card-iteration/build.log`, with existing unrelated admin CSS autoprefixer warning only. Production Browser recheck confirms exact text,58/42/zero gap and loaded image; desktop/mobile screenshots refreshed from retained build.
- Full Vitest/integration gate not rerun or claimed for this presentation/copy-only iteration.

Browser dev preview, `/` and native CTA to `/products/super-serum`:

| Viewport | Grid columns | Shared text padding | External gap before/after | Inside gap/seam | Overflow |
| --- | --- | --- | --- | --- | --- |
|1440×900|788.914/571.289px (58/42)|32px|36px|0px|None|
|768×1024|718.453px stacked|20px|19.1953px|0px|None|
|390×844|343px stacked|20px|9.75px|0px|None|
|320×568|273px stacked|20px|8px|0px|None|

All: image loaded, outer radius12px/inner radii0, content justify-content flex-end. CTA bottom/left inset matches32px desktop or20px mobile,2px keyboard focus outline stays safely inside card. Complete face/bottle framing inspected desktop/mobile/narrow. `Shop Now` native link navigates to canonical product. User copy exact in DOM. Other section source/styles untouched, surrounding2.5vw rhythm preserved. Initial back navigation showed development Router Cache's prior SSR copy; explicit reload rendered current text correctly. No production defect asserted.

Evidence `/tmp/helix-serum-card-iteration/`: desktop.jpg,mobile.jpg,narrow.jpg,measurements.json. Viewport override reset. Preview reopens at3100 after production build. Library skill loaded for attachment routing; no Library upload/retrieval writes attempted in this revision.

Independent committed-code review `b5122e336259d021adf23c9fd4e522ded2b92865` against36e4df7: Spec `/root/spec_review` APPROVE; Standards `/root/standards_review` APPROVE, no actionable findings. Both approvals cover independent local WIP only; they do not approve final new-attachment matching or integration. Prepare PASS. Production server running in Codex terminal on `http://127.0.0.1:3100/`; run `pnpm start --hostname 127.0.0.1 --port 3100` in the worktree. No push/deployment/remote provider changes; unrelated root legal edits preserved.

## Remaining reference dependency

New attachment pixels not yet accessible on this executor: `libfile_bb433635bcf48191a0f62155e9759449`, `libfile_c11f4f2503d08191bcbe4ba661162147`, `libfile_6578e2f3b62c8191ae0e79bb856cac4e`. Tool inventory has no Library read/search/list/prepare_materialize. This is capability absence, not access denial or transfer failure; no guessed URL or local Library-target scan. Need supported consumer-local transfer from parent, then actual pixel comparison and any material delta plan review. Current Treat PDP/current section were independently inspected in Browser.
