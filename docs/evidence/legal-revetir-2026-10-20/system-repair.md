# System fragment/reload repair added to legal delivery

The owner explicitly approved the narrow System navigation repair needed to unblock legal dev integration. No legal text, Accessibility, layout, provider settings or other application behavior changes are authorized by this addition.

The exact delta plan SHA-256 is `6ce6e1f79478679b1ed76595d97675e072525a245c518225ccd0c9111e7808f5`. Independent Spec `/root/delivery_spec_review` and Standards `/root/delivery_standards_review` approved it separately before implementation. Existing standalone Ticket470/PR471 is the bounded delivery path; the PR returned to draft during repair.

## Captured failure

[Diagnostic JSON](./system-reload-failure.json) preserves the bounded slow-CPU matrix using the canonical media-containment adapter and unchanged viewport/header assertions. At320px, attempt1 reproduces the canonical failure: ingredient scrollY4564 survives reload to#system-seal through DOMContentLoaded/load/pageshow. React eventually selectsSEAL but Coretop is-3564 and viewport intersection0 at the assertion timeout. The other five cases pass. Normal-latency standalone and focused canonical probes pass, so they do not dismiss the repeated original failures. The initial full-context trace experiment was stopped after discovering its manually started server lacked verification-only routes; its unrelated404 failures are invalid diagnostic setup, not application or gate outcomes. All original gate failures remain recorded in Ticket470.

## Repair and proof boundary

SystemCoreFlow already owns canonical Core hash selection. It now records one pending recognized anchor and positions its visible section after selection and page load in one animation frame. Current hash is rechecked, and queued work/load listeners are cancelled on hash change, manual selection or unmount. Existing section scroll margin clears the header. No focus, history, global scroll-restoration or carousel behavior changes.

The existing browser sequence and geometry thresholds are unchanged. Three focused component tests cover post-load/post-selection positioning without focus movement, stale hash/manual-selection/frame cancellation, and pre-load unmount cleanup. Before implementation two new positive assertions failed (10passed/2failed); after implementation all12tests pass. Full production verification, exact-head independent code reviews and CI remain required before merge; passing retries never count as clean proof.
