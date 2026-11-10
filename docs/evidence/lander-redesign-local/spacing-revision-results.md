# Spacing revision — local verification

Local-only correction after `a2db620`. The Super Serum model replacement is still pending; the current image remains the earlier rejected candidate and is not presented as a corrected identity match.

## Approved candidate

`spacing-revision-plan.md` SHA-256 `b1049a2beae5923846ce970601e00eb8d314cd1a7475497c5c79e970586ef830`: Spec reviewer `/root/spec_review` APPROVE; Standards reviewer `/root/standards_review` APPROVE before implementation. Scope is homepage CSS and bounded evidence only. No remote authority.

## Verification

Every adjacent direct section boundary, including hero → Core, uses the same 2.5vw gap. Last section → footer also matches. Outer gutters are independent.

| Viewport | Each section/footer gap | Outer gutter each side | Overflow |
| --- | --- | --- | --- |
| 1440 × 900 | 36px | 32.3984px | None |
| 768 × 1024 | 19.1953px (subpixel rounding of 19.2px) | 17.2734px | None |
| 390 × 844 | 9.75px | 16px | None |
| 320 × 568 | 8px | 16px | None |

Homepage ingredient top/bottom borders, principles row/label rules and adjacent footer top border all compute to 0px. Focus outlines remain 2px. The Treat PDP footer remains 1px, confirming route isolation.

Browser: keyboard ArrowDown selects and focuses Innovation with `aria-pressed=true`. Deliberate pointer click selects. Hero pause changes video.paused to true and exposes Play; Play resumes. Reduced-motion emulation removes hero video/control and leaves its poster. Temporary viewport and motion overrides reset afterward.

Native mobile drag was NOT RUN: IAB rejects `Input.dispatchTouchEvent` as unsupported. Touch emulation itself was restored immediately; no native drag executed. Existing pointer guards were inspected, but source inspection and ordinary clicks are not proof of touch scrolling or native tap behavior. No interaction defect was demonstrated and no behavior code changed.

Checks: focused Vitest PASS (4 files, 24 tests); lint PASS with no warnings/errors; typecheck PASS. Production build and committed-code reviews recorded below when complete. Full Vitest and integration gate not rerun for this CSS-only correction; no integration claim.

Raw measurements `/tmp/helix-lander-revision-evidence/spacing.json`. Desktop and mobile screenshots in that directory use `-v2.jpg` filenames; full-page previews still contain the pending model candidate. Browser observations used only public storefront content.

## Model blocker

Executor tool discovery has Library create/replace/upload actions but no read/search/list/prepare_materialize action. Therefore no transfer of the three new Library references was attempted here; this is capability absence, not an access denial or byte-transfer failure. Parent is retrieving the original prompt and supported consumer-local image files. Trusted CA bundle `/etc/ssl/cert.pem` remains available for that flow; certificate verification must remain enabled. Current Treat PDP outcome pixels were inspected in Browser and differ from the rejected homepage portrait. Repository provenance searches did not locate the original prompt; saved-chat search restrictions were respected.
