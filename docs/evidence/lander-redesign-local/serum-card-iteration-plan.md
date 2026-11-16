# Super Serum section iteration — candidate 1

Goal source: user room message `Sentinel_dafb7bb74ee48191b2e7d56baf8d842c`,2026-11-10. Scope only existing landing hero-product section. Local preview/implementation/checkpoint only; no push/deploy/provider changes. Preserve other sections,2.5vw section rhythm, current campaign image, canonical product guard/destination and unrelated root legal edits.

Recovered the helper-initialized worktree at its exact existing path `/tmp/helix-lander-review`, branch `codex/plan-lander-redesign-local`, HEAD36e4df7, after temporary directory had been cleared. Existing Git metadata/index matched HEAD. Restored tracked files with git archive and existing .git pointer, without resetting/removing refs or history. Frozen worktree dependency install and existing .env.local symlink restored; no secrets printed/shared.

## User-directed independent changes

- Combine media and text into one rounded/clipped section, like actual Treat PDP outcome split: zero internal gap, section-level12px radius/overflow hidden/surface background, no inner-panel rounding. Keep desktop grid58fr/42fr, same outer gutters and section height. Mobile continues existing stack at900px, image above text; zero seam gap and one outer corner boundary.
- Align text block at bottom-left of the right panel (`justify-content:flex-end`, start alignment/left text). Replace custom padding clamp28px/3.5vw/56px and mobile override with shared `--pdp-panel-padding` (20–32px). At1440px comparison: current50.4px, Treat32px. Remove stale mobile400px text min-height; compact intrinsic stacked text with same padding token. Keep 24px internal gaps and existing Helix type/CTA pill treatment.
- Eyebrow is only `Super Serum`, styled as Smooche's white compact rounded badge with small decorative dot, adapted to Helix accent rather than copying another brand color. Manrope functional type; no added claim/availability badge. Decorative dot via CSS, no accessible text.
- Exact heading `One Step For Longevity`.
- Exact single description `A lightweight serum with PDRN, humectants, ...` (literal ASCII ellipsis). Remove the prior extra application paragraph. Do not expand/rewrite it.
- CTA visible/accessible text `Shop Now`; native canonical `/products/${product.slug}` link unchanged. Keep imagev3/source/alt and missing-product behavior.

Implementation files `components/home/HomeSuperSerumSpotlight.tsx`, scoped selectors in `app/home.css`, existing homepage test expectations. Update existing test for heading, exact description/eyebrow/CTA and preserved canonical destination/order/image. No new mirrored CSS unit tests. Run red/green existing homepage test, focused24tests, lint/typecheck/build, diff check/prepare and independent committed-code reviews.

## Reference and final verification dependency

Actual Treat PDP and current homepage inspected in Browser; current gap32.4px/padding50.4px versus Treat gap0/radius12px/overflow hidden/padding32px. Prior supplied Smooche color-changing-foundation reference was inspected in earlier work. Three NEW attachments identified by user_message_read, but this executor currently lacks Library retrieval/materialization actions:
- `libfile_bb433635bcf48191a0f62155e9759449`, `Screenshot 2026-11-09 at 11.24.11 PM.png`,1224184bytes.
- `libfile_c11f4f2503d08191bcbe4ba661162147`, `Screenshot 2026-11-09 at 11.41.56 PM.png`,861452bytes.
- `libfile_6578e2f3b62c8191ae0e79bb856cac4e`, `Screenshot 2026-11-09 at 11.43.56 PM.png`,469523bytes.

Proceed with the user's explicit independent section/copy instructions, then inspect actual new attachment pixels after supported transfer before claiming reference matching/completion. If they reveal a material implementation delta, return exact revised candidate to both reviewers. Do not scan local files for these Library-backed images or guess storage URLs. No transfer denied or attempted on this executor. Parent supported consumer-local materialization needed, as in prior tasks.

Final Browser check at1440×900,768×1024,390×844,320×568: one card with zero inner gap/outer-only rounding,58/42 desktop, bottom-left content with shared padding, exact supplied text, visible focus/native CTA route, full face/bottle framing, no overflow, existing2.5vw outside gaps. Confirm neighboring sections/PDP unchanged. Save desktop/mobile screenshots locally and report exact verification limits. No Library write required by this section request; do not initiate another upload action merely to bypass the previous technical blocker.
