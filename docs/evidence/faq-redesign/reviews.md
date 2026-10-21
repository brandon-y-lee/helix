# Local review record
Baseline: bceb2202880b0c6b9479413ea6099ec2e065eba6. Goal/authority and exact candidate in plan.md. Local implementation, checks, commits and preview only; no remote writes.

Plan v1 SHA256 955c4e7575cf614e4dc5eb8f50f9dfead42271fb80b14414c3b0ebfd141b9bb3: Spec /root/faq_spec_review approved; Standards /root/faq_standards_review requested explicit mobile header+rail clearance and native/no-JS state/focus recovery. Resolved by v2 clarification.

Plan v2 SHA256 9f100541ff3918f4f43c61a1a4fdbc68d7038c36974fd5a2181954a75a283eef: separately approved by Spec /root/faq_spec_review and Standards /root/faq_standards_review before implementation. Both approve scoped local work; final exact-commit review still required.

Isolation: local shared-object clone /tmp/helix-faq-source, dev fast-forwarded to exact approved baseline; task helper start plan-faq-redesign created isolated printed worktree. Original repository refs/edits untouched.

Commit98288ac: prepare passed. Spec reviewer requested FAQ-scoped open-icon transform override; Standards requested the same icon fix, active pill reveal on resize/font completion, clear inert after native closing so browser find remains possible, and disambiguate new mobile test locator. Fixes prepared locally; next commit requires delta review. FAQ and System content/style sources remain unchanged except FAQ presentation.

Initial verification: frozen dependency install succeeded (initial sandbox DNS-limited attempt failed, retried with network permission). Focused30 tests passed; lint/typecheck passed after missing dependencies installed. Complete Vitest254files passed/1skipped;2722tests passed/8skipped (existing skips). AA text contrast5.17:1. First production verifier build passed; browser350passed/12skipped/14failed: two new FAQ locator errors (one each browser), plus12 failures in unrelated WebKit cases. Not a passed full browser gate. Exact log retained at /tmp/helix-faq-evidence/production-first.log. New FAQ redesign4tests passed on Chromium and WebKit. No integration or remote gates claimed.

Delta: image source-size hint now accounts for tall cover crop on phones (180vh), without changing System CSS/image geometry; first preview showed unnecessarily low-resolution image from narrow-width hint. Measured style contract remains identical. Fixed icon inheritance, native search eligibility and rail reveal as requested. Tests now check open-icon transform, settled native content not inert, active late-category reveal on phone resize, and intended first-summary clearance.
