# Principles section — local results

User goal:50:50 split, shared light-gray surface, original Helix uppercase selector treatment, Marcellus descriptions, individual contextual CTAs, longer Rhode-like fade and matching image movement. Plan candidate3 SHA256 `68ead79ed0f616d343a045a47f92200abee1bdd17971a3793e23b1c4421881fa` independently **approved** before code by `/root/spec_review` and `/root/standards_review`. Standards' planning finding—focus stranded in an inert outgoing CTA—was resolved by explicit focus transfer and a dedicated regression before approval. References are parent-inspected; live Rhode behavior and repository assets were inspected directly by this executor.

Base `bba7c99`, initial code7e86d40, corrected app candidate `ada10108e159e3f40bec48d34baf4c12921da16c`. Candidate7e86d40 inadvertently split a shared System/About CSS selector while adding anchor offsets. Both code reviewers identified it; correctionada1010 restored the original selector group exactly. The production preview was rebuilt at the corrected checkpoint and System was inspected before final handoff. No unresolved source finding is hidden by the initial green tests.

## Result and observed reference behavior

The existing two rounded panels now have equal width and left backgroundvar(--surface), matching the other islands. Description uses actual loaded Marcellus; selectors return to uppercase Manrope800 with0.12em tracking, readable gray inactive state, near-black active state and thin internal rules, no icons. Existing narrative copy is unchanged.

Each state has its own native link: Our mission→`/about#about-men-heading`; Our formulation→`/about#quality-heading`; Our approach→`/about#sustainability-heading`. Only active content is accessible/clickable; outgoing content is immediately inert/aria-hidden while its opacity fades. If its CTA holds focus, focus moves to the newly selected selector first. Pointer-induced focus does not select before a touch click; cancel/up/key input clear the guard.

Inspected [Rhode's live lander](https://www.rhodeskin.com/): actual intermediate text opacity and vertical image translation, computed1000ms ease for both, settled rail offset one frame height. Helix implements this observed1s crossfade and1s eased vertical rail; it replaces the unrelated old scroll-direction zoom. No complete secondary image-zoom timing was established, so no claim of reproducing all Rhode animation details. Raw observations separately distinguish a104s input-tool delay from actual1s CSS duration.

Existing project-controlled imagery is reused: Mission's original black-and-white portrait; Innovation's peptide molecular image; Sustainability's centella leaf. Images are decorative editorial context, not proof of efficacy or environmental claims. No new assets generated/changed and no other content claims added.

## Passed checks

- Existing homepage11/11 plus principles3/3 =14focused tests; lint no ESLint warnings/errors; typecheck; corrected durable production build exit0; diff whitespace and task prepare.
- Browser `/`1440×900: panels663.898/663.906px, shared#f5f5f7 background, actual `Marcellus, Marcellus Fallback, Georgia, serif`, uppercase800 selectors with1px internal rules. Keyboard focus visible.
- Actual mouse hover from focused Mission CTA selected Innovation and transferred focus to its selector. Sampled opacities0.991959/0.008041 and intermediate vertical offsets-6.224/-14.160/-25.464px; computed duration1s/ease. Settled Innovation offset-774px and Sustainability-1548px at774px frame/rail height. Rapid End→Home→End→ArrowUp settled correctly at Innovation/-774px, opacity0/1/0, only its CTA active.
- Keyboard arrow/Home/End and mobile click selection; stationary pointer did not override keyboard selection through768/390px reflow. Inactive panels carry both inert and aria-hidden. Reduced-motion emulation produced0s transitions and immediate selected frame/opacity, then was restored. Touch-emulation setting was also restored.
- Responsive768×1024,390×844,320×568: stacked rounded panels, natural copy/selector wrapping and no document horizontal overflow. All three images loaded when selected. Completed ingredient island remains three linked rows, correct title and36px gap to principles at1440px (2.5vw).
- Clicked all three actual CTA destinations. Heading tops79.8/79.8/80.2px, clear of~64px sticky header; scoped scroll-margin80px. About content/layout unchanged. System regression: editorial gutter24px, editorial maxmin(100%,1540px), width1425px, scroll-margin0, no overflow; original shared tokens retained.
- Persistent service serves correctedada1010: `/`, `/system`, `/about` and three image assets HTTP200; parentPID1, only127.0.0.1:3100 listener, unchanged installed plist, matching runtime/source hashes, private0700 state and regular0600 env, prior runtime retained. Service left running. No push/merge/deploy/provider/security-setting changes.

## Explicit limits

Native/physical touch scrolling remains **not verified**: this IAB connection rejects both Input.dispatchTouchEvent and Input.synthesizeScrollGesture as unsupported. It is a tool capability gap, not an application failure or approval denial. The touch pointer-focus/move/cancel-versus-tap regression passes, and handlers do not prevent native pan or capture the pointer, but those facts do not prove physical scrolling. A manual native-touch check remains outstanding.

Full ticket/integration gates, Codex quit, login/reboot and sleep/wake were not run or claimed. No fresh service-kill test was necessary because plist supervision is unchanged; prior recovery evidence remains separate. New source edits still require an explicit durable-snapshot refresh.

Evidence: principles-section-browser-checks.json, principles-section-runtime-checks.json and rhode-principles-motion-observations.json. Screenshots saved privately under `~/Library/Application Support/HelixPreview/screenshots/principles/`: desktop-mission.jpg, desktop-innovation.jpg, desktop-sustainability.jpg, mobile-mission.jpg, narrow-controls.jpg. Live preview http://127.0.0.1:3100/. Source worktree `/tmp/helix-lander-review`, branchcodex/plan-lander-redesign-local; runtime app checkpointada1010. Existing management/restart command `launchctl kickstart -k gui/501/com.helix.local-preview`. Library skill used for reference-access routing only; no available local skill applied. All unrelated root legal work preserved.
