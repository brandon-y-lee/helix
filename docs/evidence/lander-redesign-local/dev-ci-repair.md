# Landing integration CI repair

Initial exact-head run: [42810348523](https://github.com/brandon-y-lee/helix/actions/runs/42810348523), head `9c847f9a7e2b2ee4560f907e6949bd3965b159df`, base `cf50f39ac5b70b57f06b1b437538d1b9fdc7a7e6`.

Quality and receipted production build passed. Chromium: 186 passed, 6 failed, 1 flaky, 3 skipped. Integration gate failed and PR #480 returned to draft. Six failures comprised two stale principles presentation contracts, a retired ingredient carousel contract, a stale island palette contract, and two real 320px header centering failures (cart counts 0 and 198). Native touch regression passed. Existing shop Search test passed its retry after its first click timed out outside the viewport; this observation remains recorded rather than concealed.

Bounded repair: remove duplicate inner gutter only for homepage top navigation at widths up to 360px and fit the wordmark to the available symmetric grid. Keep strict header geometry assertions unchanged. Update existing discovery cases for the approved persistent color selection, one-second eased copy/image motion, reduced-motion immediacy, accessible active-only CTA, and static stacked linked ingredient thumbnails. Assert every gray island separately and preserve white grouping and System checks. No workflow, retries, timeouts or unrelated route changes.

Repair plan SHA256 `a61a6f0835b632b8f668fad7c673c84e21f1247bf98944b34457356c18e05cb7` was independently approved by Spec and Standards before editing. The Mac executor disconnected before the attempted local patch could read its first file. This repair is authored atomically from the known remote PR head through connected GitHub git-object tools. Original local work is untouched; further local execution and GUI checks are unavailable until reconnection. A fresh complete exact-head integration run is required before merge. Prior observations are not a claim that this repair has passed.

Refs #479
