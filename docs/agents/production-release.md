# Exact Production promotion and rollback

Mei Pelle releases Production through two repository-owned, manually dispatched
workflows. `Production Promotion` plans or executes one release. `Production
Rollback` restores the deployment recorded by that release before creating
reconciliation work. Neither workflow builds a deployment.

## Authorization boundary

A successful Staged Production Verification run is evidence, not authorization.
Before authorizing a release, the Operator must inspect its generated deployment
URL and record all of these facts from the staged receipt and a preauthorization
`Production Promotion` plan:

- exact `dev` and current `main` commits;
- staged Vercel deployment ID and inspection URL;
- signed Production Receipt attestation and source workflow run;
- Runtime, non-secret configuration, Catalog, browser-plan, Chromium, and WebKit
  identities;
- the matching ready `dev → main` pull request and its successful required checks;
- successful source checks; and
- clear scheduled WebKit failure state.

Dispatch `Production Promotion` with `operation: plan`, the staged run ID,
attestation ID, deployment ID, and the exact URL that was inspected. The plan
creates or reuses the matching ready `dev → main` pull request and waits for its
required checks. It does not merge or mutate a branch, domain, or deployment.
Its summary prints the complete candidate and one challenge bound to the
canonical plan fingerprint.

Only after inspecting that summary may the Operator separately dispatch
`operation: promote` with the same inputs and copy the challenge exactly into
`authorization`. A workflow label, environment approval, actor choice, timeout,
old challenge, or approximate phrase is not authorization. Any changed branch,
receipt, deployment, Catalog, check, inspection, or scheduled-failure fact
changes the plan and rejects the old challenge.

## Promotion behavior

The authorized workflow re-verifies the signed receipt and immutable deployment,
then:

1. re-reads exact `dev` and `main` identities;
2. revalidates the authorized ready `dev → main` pull request and its required checks;
3. uses GitHub's exact-head regular merge;
4. proves the merge commit tree matches the authorized `dev` tree and therefore
   retains the receipted Runtime Fingerprint;
5. records the currently served known-good Vercel deployment;
6. calls `vercel promote <staged-deployment-id>` and never `vercel deploy`;
7. verifies the Production domain now resolves to that exact deployment; and
8. uploads a 90-day audit recording the prior and promoted deployments, merge,
   receipt, Runtime Fingerprint, time, and `rebuild: false`.

Do not dispatch this workflow merely to test it. A real dispatch can merge
`dev` into `main` and assign Production domains.

## Rollback-first recovery

When the promoted Production deployment is unhealthy, dispatch `Production
Rollback` with the exact promotion attempt run ID containing its success or
recovery audit and a factual reason. The
workflow downloads that run's audit, including an audit retained after provider
substitution, and fails closed unless the currently served deployment is the
recorded observed deployment. It then calls
`vercel rollback <previous-deployment-id>`, verifies that exact known-good
deployment is served, and only afterward creates a reconciliation ticket. The
ticket is never labeled `workflow:urgent` automatically; only the user may
approve that classification.

Reconciliation aligns the restored deployment, `main`, and `dev` through
additive commits and pull requests. It does not rebuild during rollback and
never amends, resets, force-pushes, or otherwise rewrites Git history. If a
provider command times out, the served deployment remains authoritative. If it
differs from the intended deployment, use the retained recovery audit to restore
the prior deployment; do not substitute another deployment or rerun a mutable
branch target.
