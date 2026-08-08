## Workflow path

- Path: <!-- spec ticket | standalone ticket | completed spec | urgent ticket | planning | documentation | trivial -->
- Base: <!-- codex/spec-<spec>-<slug> for a future spec ticket; dev otherwise -->
- Refs: <!-- #implementation-ticket for normal/urgent; N/A for planning/trivial -->
- Spec: <!-- #parent-spec for normal ticket; N/A for urgent/planning/trivial -->
- Urgency: <!-- user-approved workflow:urgent | not urgent; automation never decides -->
- Fast-path proof: <!-- exact non-runtime changed paths, or N/A -->

## What changed

<!-- Describe the complete user-visible or operational slice. -->

## Verification

- [ ] Proportional local checks passed: <!-- exact commands -->
- [ ] `code-review` passed after all findings were resolved or explicitly accepted
- [ ] The branch contains current `dev`, or affected checks and review were repeated after updating it
- [ ] A spec ticket is a flat sibling from its current protected spec branch and has passing `ci` plus `affected-browser-verification`
- [ ] The Integration Line work class, risk, and fast-path declarations are complete and fail closed

### Code-review outcome

- Standards: <!-- finding count and worst finding, or pass -->
- Spec: <!-- finding count and worst finding, or pass -->

## Scope and follow-up

<!-- State whether scope stayed within the approved path. Link approved follow-up tickets. -->
