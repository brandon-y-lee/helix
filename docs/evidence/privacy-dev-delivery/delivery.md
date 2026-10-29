# Privacy delivery to dev

## Authority and reviewed boundary

Ticket: https://github.com/brandon-y-lee/helix/issues/476. After being told the privacy/cookie updates were local, the user requested, “Ok let's merge to dev for now.” Authority covers this bounded standalone Ticket, push/PR, regular merge to dev and the resulting Git-linked dev deployment. It excludes main/production promotion, provider activation/configuration, new agreements, paid plans, campaigns, imports and screenshot uploads. Separate Treat work and the dirty primary checkout are preserved.

Delivery plan SHA256474cfca98ed644ee906be804866bd41c18542b2c1694b096928be24d199ff383 received separate approve verdicts from Spec reviewer /root/spec_review and Standards reviewer /root/standards_review. Previous revision required effective deployment-environment inspection and complete public-evidence sanitization; both are incorporated. Original source and plans were independently reviewed locally; no reviewer authored implementation.

## Source mapping and privacy

Reviewed original application source ab9ce502fc70b6bf7150be1fe7b1bf068ffc843f; complete local candidate0fbb3f5857b80fc391e56e57873edf682d35c930. Original base830a3975154b4554bf2d7dbdba713eb2c4d96a46. All original local branches/checkpoints and the first unpublished delivery attempt72611e1 remain intact and local; their private administrative evidence ancestry is not included in publishable history. Historical local evidence is omitted entirely, replaced by this new scoped record and delivery plan. No provider account identities, setup contacts, administrative identifiers or institutional sign-in trace is copied.

Fresh helper-start branch codex/476-privacy-choices-dev in an isolated worktree uses Ticket476 with no parent Spec. Current devcc57227 was incorporated additively without moving the primary checkout. The complete reviewed source/test/dependency diff was carried as a three-way patch, preserving current FAQ presentation, approved hero and skincare/30-day returns work. Thirty-six original non-document paths remain byte-identical. Composition differences are limited to content/support/faq.ts, e2e/mobile-services.spec.ts, tests/footer-support.test.tsx, tests/legal-policy-parity.test.tsx and tests/mobile-services.test.tsx. The only conflict was footer test imports: retain current FAQPage and new CookiePolicyPage, remove unused former imports. No assertions were dropped to resolve it.

The first combined quality attempt passed lint, then typecheck failed TS6133 for unused PANEL_GRAY, expectGrayPanels and expectAnchorBelowHeader in e2e/mobile-services.spec.ts. Vitest did not start. Remove those unused imports/helper and its Locator type import; all executable assertions remain. This failure is retained rather than attributed to baseline. The transport then disconnected before diagnostics could be inspected; no push/PR/merge had occurred.

## Collection preflight

Read-only Chrome inspection of the Helix project's Vercel Environment Variables found no NEXT_PUBLIC_HELIX_ variables in either Project or Shared with All Environments and All Types selected, covering all four optional tracking enable flags and applicable branch/shared values. No secret values were revealed and no provider configuration changed. Repository configuration defaults remain false with identifiers/origin unconfigured. Local testing uses only existing public catalog/Search configuration and explicit false tracking flags. The guarded synthetic verification fixture is unavailable on Vercel. Stop if effective collection configuration changes before deployment.

## Required proof and delivery status

Fresh combined-source frozen install, lint, typecheck, complete Vitest, production build/full Chromium, exact committed-candidate Spec/Standards review, strict integration-gate and deployed identity/UI checks are required before completion. Original-source proof does not substitute for combined proof. Do not weaken assertions, reduce coverage, bypass required checks, blindly reroll failures, manually deploy or change provider settings.

Final results, review verdicts and PR/check/deployment links will be recorded when observed. Development deployment must retain no optional provider collection before consent and with live flags disabled. Saved-choice verification uses disposable state; user privacy settings and unrelated processes remain unchanged.

## Combined candidate verification

Application candidate cee8962243edf78505af0f8376bd2b07bae94267 against incorporated devcc57227: independently approved by Spec /root/spec_review and Standards /root/standards_review. Both confirmed the private checkpoint ancestries are excluded, no administrative/contact/institutional traces occur in new public evidence, and the unused-helper cleanup removed no assertions. No remaining actionable findings.

- Frozen install: passed.
- pnpm lint: passed, no ESLint warnings/errors; existing next-lint deprecation notice only.
- pnpm typecheck: passed after the recorded TS6133 cleanup.
- pnpm exec vitest run --maxWorkers=2: passed, 259 files passed, 2735 tests passed, 8 existing SQL service cases skipped because the opt-in local SQL environment is unconfigured. Complete selection/assertions retained.
- CI=true pnpm verify:production: passed, fresh build PExU2bYHnXopIWgV7TfBw, complete Chromium189 passed/3 existing catalog-data conditional skips,192 total. Build identity verified; owned server cleanup passed; exit0. All privacy/consent/legal/current FAQ cases passed. No real measurement events sent; verification substitutes are local-only.
- git diff --check and unpublished-history exclusion checks: passed.

Logs remain local: /tmp/helix-privacy-public-{install,lint,typecheck,vitest,production}.log. Existing CSS autoprefixer and duplicate libvips Objective-C build/runtime warnings were observed, with no assertion or verification failure. The earlier TS6133 failure remains recorded above; it is resolved by this complete current-source run. PR: https://github.com/brandon-y-lee/helix/pull/477. The PR remains draft until final evidence review, then strict integration-gate must pass on the final current merge tree. Remote merge and deployed checks are still pending at this evidence checkpoint.
