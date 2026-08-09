---
status: proposed
---

# Integrate specs through a serialized dev line

Multi-ticket specs use one short-lived spec integration branch: each ticket reaches it through an independently reviewed ticket PR, and the completed spec reaches `dev` through one final PR. Every PR into `dev` uses one non-preemptive integration line so its candidate can be tested and merged while `dev` remains unchanged; urgent work takes the next waiting position without cancelling the active candidate. This deliberately trades ticket-by-ticket staging for one complete Chromium run per spec, clearer cross-ticket integration, and protection from concurrent agents repeatedly invalidating one another's browser results.

The proposed mechanics are defined in [`../agents/browser-verification.md`](../agents/browser-verification.md).

## Consequences

- Branch depth remains `dev → spec integration branch → ticket branch`; dependent ticket branches start from the updated spec branch after their blockers integrate.
- A ticket closes with `workflow:spec-integrated` when its PR enters the spec branch, which satisfies native issue dependencies; the parent spec remains open until the final spec PR enters `dev`.
- Standalone and urgent tickets target `dev` directly. Documentation, planning, and trivial PRs use the same integration line but receive proportional fast checks.
- A failed, timed-out, or changed active candidate releases the integration slot and returns to review. Successful protected-branch pushes do not repeat browser verification.
