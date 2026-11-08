# Landing-page local review handoff

Implemented and independently reviewed locally. Runtime source reviewed at b8e3c473ca3c06332e3b5979cf5bd1b4bb7ae9e2 against base 830a3975154b4554bf2d7dbdba713eb2c4d96a46. Branch codex/plan-lander-redesign-local; worktree /tmp/helix-lander-review. This is the explicitly requested local preview path, not normal Spec Ticket delivery or integration. No push, issue publication, PR, merge, deployment, provider configuration, live payment or real send occurred.

## Result

- Retained hero loop/poster and links; inset 12px rounded island, smaller editorial headline, exactly 2.5vw exterior bottom margin, readable overlay navigation and accessible manual playback control.
- Added canonical-presence-guarded Super Serum section directly after Core carousel: generated model image 58%, restrained product copy 42%, native Discover Super Serum link. Current canonical PDP education supports the copy; no price/social-proof/efficacy-time claims invented.
- Restyled Plug and Play as rounded islands, retained 65/35 desktop split, existing content, video and anchor; stacks on mobile.
- Moved three-principles section after ingredients, last before footer; matched supplied Rhode statement/values-pill/lower-selectors composition. Retained portrait, hover/touch/focus/key operation and fixed reflow-induced keyboard hover override, including native keyboard/assistive click activation.
- Removed rendered Invest in your skin final loop. Reusable media code/assets preserved.
- Ingredient section is byte-identical to base; shared product cards/carousels, cart, offer and purchase contracts untouched.

## Verification

| Check | Outcome |
| --- | --- |
| pnpm lint | PASS, no ESLint warnings/errors |
| pnpm typecheck | PASS after isolated locked-dependency installation |
| pnpm exec vitest run --maxWorkers=1 | PASS — 255 files  / 2726 tests; 1 file / 8 tests skipped, unchanged catalog-restore-sql-service; final run 238.41s |
| pnpm build | PASS exit0, retained final source; includes lint/type validity; existing unrelated admin CSS autoprefixer warning |
| git diff --check | PASS |
| codex-task prepare | PASS on reviewed runtime source; repeated for final evidence commit |
| Independent Spec review | APPROVE 9f55ce8, APPROVE f7ae9c5 delta, APPROVE b8e3c47 delta |
| Independent Standards review | Prior P2 findings resolved; APPROVE b8e3c47 correction |
| Browser / | PASS desktop 1440×900, mobile 390×844, narrow 320×568, tablet 768×1024; no horizontal overflow, loaded generated image and responsive crops, native links and principles controls |
| Browser reduced motion | PASS static hero, zero hero/plug video elements, zero motion controls; emulation reset |
| Retained production browser | PASS fresh tab desktop/mobile /→/products/super-serum→/; no console errors, homepage CSS absent on PDP |
| Full Integration Gate / complete production browser suite | NOT RUN; no integration or remote delivery authorized |

The original default 4-worker full run failed unrelated catalog-editor/GitHub-workflow timeouts plus a worker timeout under contention. Serial full suites passed without increasing timeouts or changing those tests. Initial shared node_modules lacked resend, @react-email/render and sharp; isolated frozen installation resolved it without modifying shared dependencies. Initial sandbox build failed Google Fonts DNS; network-enabled local build passed. One result-capture wrapper used zsh's read-only status name; corrected direct build command confirmed exit0.

A browser tab reused across dev/build server switches emitted webpack module errors on navigation; hard reload recovered, and a fresh production tab passed repeated desktop/mobile native-link navigation with zero console errors. No code defect was reproduced in the fresh production environment.

## Browser measurements

- Hero 12px radius; bottom margin 36px at 1440 and 9.75px at 390, exactly 2.5vw.
- Desktop Plug widths 863.0703/464.7344 ratio 1.857126≈65/35. Serum 770.125/557.68≈58/42. Values 703.734/624.062≈53/47.
- Final mobile hero control: media layer auto, scrim 1, button 3; white text on rgba(17,19,18,.72); 64×44px; hit testing at center returns button; paused=true after activation. Screenshot verifies readable text. Top scrim 66% through 88px gives worst-white-video navigation contrast ≈6.18:1.
- Final keyboard End selection: Sustainability focused and pressed=true. Regression also proves keyboard/assistive native click cannot yield to layout-induced pointer entry; deliberate movement restores hover.

## Assets and evidence

All five supplied references were materialized by the parent through supported transfer with Library identity metadata, verified readable at /Users/brandonlee/helix-landing-references and inspected at actual pixels. Tool-availability blocker resolved; no download denied or guessed URL used. Exact IDs and layout mapping are in reference-completion-plan.md.

Project image public/media/home/super-serum-editorial-v1.webp: 1448×1086, 129,816 bytes, SHA-256 352a276652a7b6ae902315f97f7888dcefd17aa896de80ffea7189251c3b52a3. Built-in Image original preserved at /Users/brandonlee/Desktop/helix/generated_images/exec-e01eaf1b-ad89-4b41-a9bb-6e9742352cdf.png. Exact prompt/input IDs/provenance in image-provenance.md. Generated output has actual readable local bytes; no image-transfer blocker remains.

Screenshots at /tmp/helix-lander-evidence/: hero-desktop.jpg, hero-mobile.jpg, serum-desktop.jpg, serum-mobile.jpg, values-desktop.jpg, values-mobile.jpg. Hero and serum screenshots refreshed against retained production build; values composition captured during local development with identical layout source. All images contain public catalog content only.

Skills used: current Library router/materialization guide for supplied images and transfer handling; imagegen for model generation. No matching repository-local skills existed. Independent reviewer identities: /root/spec_review and /root/standards_review.

## Preview

http://127.0.0.1:3100 is running the retained production build in exec session 29483; Browser deliverable tab 4. Restart from worktree with pnpm start --hostname 127.0.0.1 --port 3100. For editing use pnpm dev --hostname 127.0.0.1 --port 3100 after stopping production server. Shared checkout's pre-existing legal changes preserved; only the explicitly generated original PNG was added there by Image. No requested implementation blockers remain. Remote integration remains outside scope.
