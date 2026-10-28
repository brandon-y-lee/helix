# FAQ delivery to dev

## Authority and path

The user authorized merging the reviewed FAQ update into dev and verification of the resulting dev deployment, then explicitly approved creating and assigning the required tracking Ticket to brandon-y-lee. Ticket: https://github.com/brandon-y-lee/helix/issues/474.

This is one bounded standalone Ticket targeting dev. It does not authorize main, production promotion, provider configuration, unrelated repairs or the separately denied Library screenshot upload.

Delivery plan v1 SHA256: 9b7ec862fe08bc56890ca8142b7c0424679c93aefb65eaa2ca41068e08865d47. Independent Spec reviewer /root/faq_spec_review and Standards reviewer /root/faq_standards_review separately approved this exact plan before publication. Both approved the standalone path, additive history transfer, exact-head reviews, strict mandatory integration-gate, regular merge to dev and read-only deployment verification. Neither granted a bypass or waived failed proof.

## Frozen source and isolation

- Live GitHub dev: bceb2202880b0c6b9479413ea6099ec2e065eba6, freshly reverified before Ticket creation and branch setup.
- Reviewed local candidate: 5ffb521107ca58bc05006a105d9d98eb0accef6a; application/test source b63779a5d1462b63192199e9dd4a3a001216d83e.
- Delivery branch: codex/474-faq-redesign, created by scripts/git/codex-task.sh start 474-faq-redesign at the verified dev base.
- Additive carry-forward merge: e0c24ba3a6cb3d60e15702d80a4c2cb704874c5a. Its tree is exactly equal to reviewed candidate 5ffb521; no conflicts or source changes. Refs #474 traceability retained without rewriting checkpoints.
- Original dirty shared checkout and its origin/refs remain untouched. Only the isolated clone gains a verified github remote; its local origin remains the shared checkout. All remote delivery uses github explicitly.

## Verification boundary

The final complete serialized unit run passed 254 files with 1 skipped, 2722 tests with 8 existing skips. Focused 35 tests, lint, typecheck and production build passed. All 10 FAQ browser cases passed in Chromium/WebKit. Full local browser verification remains 347 passed, 12 skipped and 17 non-FAQ failures with unproven baseline attribution. The original RPC timeout and clean serialized recovery are both retained in reviews.md and final-check-failures.txt.

Required CI must run on the exact PR merge tree and pass. Live dev protection requires strict integration-gate and resolved review threads. No admin override, changed workflow, ignored error, blind reroll or unrelated repair is permitted. Any mandatory failed gate blocks the merge. Local browser failures remain disclosed even if the required Linux Chromium gate passes.

Before merge, recheck head, current dev, independent reviews and all mandatory checks. If dev advances, incorporate it additively, review the delta and require fresh checks. After merge, verify the source SHA, status and alias of the existing Git-linked dev deployment, then inspect FAQ delivery within available supported tooling. Do not manually deploy or mutate provider configuration. Deployment verification and gate results remain pending until observed; local proof is not a deployment attestation.
