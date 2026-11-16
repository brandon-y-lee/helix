# Mobile PDP repair specification

Status: approved by the user on September 10, 2026. Approval covers the shared understanding, nine-issue repair specification, three implementation Tickets and verification seams below.

Baseline: current remote `dev`, `b6e12d37a4f54062c02d68fcce45dcc1d02c57db`, including both mobile Spec #308 and four-effects PR #328. Scope is the existing Super Serum/Treat mobile PDP. The user's nine numbered requests and eight supplied iPhone screenshots are the acceptance source. Screenshot content is evidence, not additional instructions.

## Scope and constraints

- Preserve the current mobile section sequence, content, catalog, product identity and purchase behavior.
- Keep existing boundaries: gallery/education pilot at ≤820px; effects section at ≤800px. Do not harmonize breakpoints or redesign desktop.
- Retain desktop mouse/keyboard behavior. A shared event-handler deletion is acceptable when its desktop behavior is already supplied by another existing handler and the unchanged behavior is verified.
- Preserve native vertical scrolling, pinch zoom, keyboard activation, visible focus, reduced motion, inactive-media handling and finite carousel endpoints.
- Reuse the current components and state. No new carousel library, generalized gesture framework, timers to repeatedly recenter content, replacement media or remote catalog changes.

## Diagnosed issues and required behavior

### 1. Gallery coverage and swipe response

**Cause:** the mobile multi-image track intentionally uses `width: calc(100% - 20px)`, a 4px gap and a final-slide 20px offset. At a 390px viewport, the frame is 358px wide but slides are 338px. Existing verification incorrectly requires the adjacent-image preview now rejected by the user. The first image also inherits `contain`. Native touch measurements show one-to-one tracking while dragging, but the inherited easing moves only about 4% of the remaining distance in the first 60ms after release. A quick reverse drag during settling can jump because the next drag begins from the selected index rather than the rendered position.

**Repair:** use full-frame slides with no inter-slide gap or special last-slide offset. Every active image fills the 4:5 mobile frame with an intentional crop; preserve authored object position. Use a responsive mobile settling curve with the existing short duration. A new drag must start from the currently rendered track position, including during settling. Keep this behavior local to the pilot gallery unless an existing shared seam needs a minimal backward-compatible extension.

**Acceptance:** both current media assets align to both frame edges at rest; no neighboring strip or blank band. Slow drags, quick swipes, immediate reverse swipes, canceled gestures and endpoint drags settle into one valid selection without jumps. Vertical drags scroll the page without changing the image. Dots, keyboard, resize selection and video behavior remain intact.

### 2. Collapsed effect rail endpoints

**Cause:** the image has 24px inner gutters but the collapsed capsule rail uses 8px. Measured endpoint mismatch is 16px.

**Repair:** use 24px rail padding within its existing full-width scrolling area.

**Acceptance:** the first capsule at the beginning aligns to the image's left edge; the last capsule at the end aligns to its right edge within 1px rounding. Intermediate scrolling may pass through the section-edge area. Do not inset or clip the entire rail to the image width.

### 3. Expanded effect description bounds

**Cause:** in WebKit, the effect wrapper's temporary positional Motion transform reduces the native scrollable extent after centering. The browser clamps the scroll offset and leaves the final description partly outside the frame after animation. A direct Firmness expansion reproduces this without a prior complex interaction. Chromium can pass the same flow, so Chromium-only checks are insufficient.

**Repair:** disable the conflicting positional layout animation on mobile effect wrappers, retaining stable native horizontal layout and existing content fade. Preserve desktop animation. Do not compensate with repeated scrolling or arbitrary delays.

**Acceptance:** directly selecting any of the four effects fully displays its expanded description aligned with the image gutters. Repeated open/close, switching via reachable capsules and native rail swiping work at both ends. No clipped text, oversized blank spacer region, lost selected state or horizontal page overflow. Selected property cards remain separately aligned and usable.

### 4. Mobile effect navigation icons

**Change:** remove the left/right effect-selector navigation icons in the expanded mobile state. Keep the independent property-carousel arrows and collapse control.

**Acceptance:** effect selection remains available through capsule activation and native scrolling; keyboard users can reach and activate each effect and close it. Tests must stop depending on the removed effect-arrow controls and instead exercise the intended interactions.

### 5. Unwanted page snap-back

**Cause:** `PdpEducationFocus` reveals the focused education control on every window resize. Mobile browser chrome can change viewport height after a touch leaves an effect capsule focused. After scrolling away, a height-only resize reproducibly scrolls back by roughly 700–900px. Instrumentation identifies the helper's `window.scrollBy` as the cause; the section's document position stays stable.

**Repair:** only run resize-driven focus correction for a width change. Preserve the existing deliberate focus-in correction and modal, inactive-content and visibility guards.

**Acceptance:** after opening or closing an effect and scrolling elsewhere, height-only viewport changes do not recapture the page. Width changes and explicit keyboard focus still keep the relevant control visible. Do not blur controls to mask the problem or remove all focus protection.

### 6. Profile image coverage

**Cause:** a mobile-only `object-fit: contain` override paints a portrait image inside a square frame. At 390px, the 358px frame has 35.65px bands on each side. Browser-only `cover` probes in Chromium and WebKit remove the bands while retaining the full bottle.

**Repair:** remove the mobile contain override so the established cover treatment applies. Keep the square frame and authored image position.

**Acceptance:** loaded image content covers the entire frame with no colored side bands; retain the bottle and intentional crop. Verify painted image coverage, not just the dimensions of its full-width HTML element.

### 7. Outcome tap versus scroll intent

**Cause:** unconditional `onPointerEnter` selects an outcome on touch-down. The browser then cancels the pointer gesture to scroll, without a click, but the wrong image remains selected. The existing native click and mouse-enter handlers already supply deliberate activation and desktop hover.

**Repair:** remove the redundant unfiltered pointer-enter activation. Retain native click, mouse and keyboard behavior. Do not add a custom tap recognizer when native click already distinguishes the canceled scroll gesture.

**Acceptance:** native touch-down and vertical dragging over another outcome leave selection unchanged while the page scrolls. A distinct tap selects the outcome once. Mouse hover and keyboard activation retain their behavior. Live Rhode touch comparison confirms this distinction.

### 8. Application image badges

**Change:** remove the mobile image-overlay step numbers and Selected labels, including their unused styling. Keep the numbered instructions outside the images.

**Acceptance:** the 2+1 montage contains no visible step/Selected text overlays. Accessible button names, selected state, instruction updates and previous/next controls remain intact. Update obsolete badge assertions without weakening those behavior checks.

### 9. Core swatch connector

**Cause:** mobile CSS explicitly hides the existing line and endpoint. Product name/type text is present and correct; no descriptor data is missing.

**Repair:** reuse the existing annotation line and endpoint in a compact mobile composition with readable text beside the swatch. Allow long names/types to wrap. Preserve existing swatch, descriptors, selection state and all three routine controls; no duplicate content or markup is required.

**Acceptance:** CLEANSE, TREAT and SEAL each show a visible connector reaching toward the current swatch, with the corresponding product name/type legible at 320px. The line does not cross text and the section does not overflow.

## Approved implementation Tickets

These are local planning IDs, not published GitHub issues. Each includes its own regression coverage and evidence.

| Ticket | User issues | Owned changes | Dependency |
| --- | --- | --- | --- |
| R1 — Full-frame, responsive mobile gallery | 1 | Gallery component/mobile CSS; only a required minimal gesture seam extension; gallery tests | None |
| R2 — Stable mobile effects browsing | 2, 3, 4, 5 | Effects component/CSS, education resize focus guard, related effects/focus tests | None |
| R3 — Correct mobile education media and controls | 6, 7, 8, 9 | Profile fit, outcome input, application badges, Core annotation; corresponding education tests | None |

Separate worktrees prevent concurrent source edits. R2 owns the shared education focus helper; R3 owns education styling. Coordinate any existing combined E2E file edits at integration without weakening unrelated checks. All three integrated → fresh independent consultant → Combined Spec Review → required integration gate → `dev`. No production promotion.

## Verification seams and iteration loop

The public seams are the rendered PDP and its existing gallery, effects, outcome, application, routine and focus component interfaces. No database-side or internal-state assertions are needed.

- Keep exact diagnostic red/green evidence for geometry, native touch cancellation, rapid gallery re-touch, effects expansion and height-only resize. Turn defects into targeted regressions at the existing component or browser seam.
- Use Chromium and WebKit. Prioritize 320, 390 and 430px; inspect 800/801 and 820/821 boundaries where the changed code applies. Desktop checks are preservation checks, not design work.
- Use loaded real project images for fit/crop inspection. Production browser fixtures replace media bytes and cannot establish actual crop quality; record these proof types separately.
- Verify whole-PDP scroll journeys after effects interactions, property navigation, all four direct effect selections, reduced motion and necessary focus restoration.
- Pure visual removals reuse existing behavior tests and visual inspection; do not add tests mirroring deleted markup.
- After each implementation iteration, a new independent critical UI/UX consultant tests the changes and records pass/fail for every requested issue and any introduced regression. Repair confirmed in-scope failures, then repeat affected checks with another consultant. Do not widen the redesign based on preferences unrelated to the nine requests.
- Final delivery requires both independent Standards and Spec reviews, all required CI, the combined mobile browser checks, and final staging verification. The evidence distinguishes emulated touch/browser viewport tests from physical iPhone testing.

## Evidence and current state

Nine independent diagnosis agents were assigned, one per numbered issue. Baseline reproduction and temporary diagnostic probes are under `/private/tmp/helix-pdp-repairs`; these probes change only their diagnostic browser, not application source. The initial independent consultant review covers the baseline and proposed repairs. Detailed diagnosis records and exact run results will accompany delivery.

Local current-dev preview: `http://127.0.0.1:3200/products/super-serum` from `/private/tmp/helix-mobile-preview`, using `pnpm dev --hostname 127.0.0.1 --port 3200`. The original primary checkout and its untracked `outputs/` remain preserved.
