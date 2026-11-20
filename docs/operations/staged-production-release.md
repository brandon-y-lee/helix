# Stage and release the production website

Vercel builds the merged `main` commit once with Production configuration. Keep the prior build serving `www.helixskin.us` until the owner promotes the verified candidate. [Vercel staged deployments](https://vercel.com/docs/deployments/promoting-a-deployment)

## Prepare the controller

With configuration authority, restrict each GitHub environment below to exactly `main` using a custom branch policy. Keep `main` protected. Bind the repository variable `HELIX_RELEASE_OPERATOR_ID` to the independently verified numeric GitHub user ID of the owner authorized to dispatch. Reruns must retain that operator identity.

| Location | Configuration |
| --- | --- |
| `helix-release-inspect` | `HELIX_RELEASE_VERCEL_READ_TOKEN` for read-only project, deployment and alias inspection. Provide `HELIX_RELEASE_BYPASS_TOKEN` if protected immutable URLs need it. |
| `helix-release-control` | Separate read and promotion/rollback Vercel credentials under `HELIX_RELEASE_VERCEL_READ_TOKEN` and `HELIX_RELEASE_VERCEL_CONTROL_TOKEN`. Set `HELIX_RELEASE_DB_HOST`, `HELIX_RELEASE_DB_CA` and `HELIX_RELEASE_DB_PASSWORD` for the dedicated controller login. Provide the read-only probe credential `HELIX_RELEASE_STATUS_TOKEN` and applicable bypass token. |
| `helix-db-production` | The reusable workflow takes its own target, CA and migration login here. After qualification, enable repository variables `HELIX_PRODUCTION_MIGRATIONS_ENABLED` and `HELIX_RELEASE_CONTROLLER_ENABLED`. [Forward database releases](../../supabase/releases/README.md) |
| Vercel Production | Set the matching server-only status token. For features requiring exact deployment authorization, configure the dedicated `HELIX_RELEASE_AUTHORIZATION_READ_KEY` and its independently verified SHA-256 pin for opaque keys. The application reads its authorization through an RPC. The controller login and Vercel control credential belong only in the protected action. |

Verify the parent project and its enrolled marker. Its independent owner provisions the restricted `helix_release_controller` LOGIN and installs the deployment registry and capability reader. Enrollment authorizes zero builds. [Environment and Catalog enrollment](environment-bindings.md) · [Deployment registry SQL](../../supabase/operations/release-bootstrap/enroll_deployment_authorization.sql) · [Capability reader SQL](../../supabase/operations/release-bootstrap/read_release_capabilities.sql)

## Check the hold before merging

For the first release, run Node 24 in a trusted checkout of the independently reviewed controller. Supply read credentials `GH_TOKEN` (repo/PR) and `HELIX_RELEASE_VERCEL_TOKEN` (project). Set `RELEASE_PR` to the open PR number, `RELEASE_CANDIDATE_SHA` to its exact **dev head**, and `GITHUB_REPOSITORY_ID` to `1280166759`.

```sh
node scripts/release/command.mjs premerge
```

Require passing release CI and authority for this merge. Stop if automatic domain assignment is on or unverified, the domain set has changed, or an alias job is active. Once the workflow exists on protected `main`, use separate branch-protection authority to require the GitHub Actions status `helix-production-domain-hold`. The workflow runs from the trusted base and reports on the exact dev PR head. [Premerge workflow](../../.github/workflows/premerge-production.yml)

## Freeze the evidence

Record the serving deployment ID and SHA. After the approved merge, record the Git-triggered Production build’s immutable ID and **merged main SHA**.

Set the protected `HELIX_RELEASE_EXPECTATIONS` variable consistently for both inspection and control. The packet contains `candidateId`, `candidateSha`, `previousId`, `previousSha`, UTC `observedAt` and `expiresAt`, `evidence`, and `observations`. Under `evidence`, set `authRouting`, `searchWriters`, `emailCallbacks`, `checkoutSettlement` and `rollbackCompatibility` to the lowercase SHA-256 digests of the corresponding retained, sanitized reports. Verify each report’s provenance and validity. Under `observations`, enter measured expected values, including the intended public product and its verified media URL, installed/absent packages, disabled capabilities and existing sandbox settlement posture. The example contains placeholders. [Observation format](../../scripts/release/catalog-observations.example.json)

Hash the exact approved packet bytes in a trusted local environment, for example with `shasum -a 256 release-packet.json`. Preserve whitespace when setting the protected variable. Keep credentials and customer records out of the packet, reports, inputs and logs.

## Run the release

Dispatch **Staged production release** from protected `main` with the release PR, both ID/SHA pairs and packet digest. Dispatches are serialized. [Staged release workflow](../../.github/workflows/staged-production.yml)

| Operation | Effect |
| --- | --- |
| `verify` | Checks the old application, calls the protected forward writer for the merged SHA, checks its `applied_sha`, and authorizes the candidate alongside the serving build. Verifies the old application against the expanded schema and probes the immutable candidate, including Catalog, bounded public media and capability states. Public traffic stays on the previous build. |
| `promote` | The operator’s final production action. Rechecks the exact release, probes and alias ownership, reserves one promotion, and switches the production domains. Verifies the new canonical site and apex redirect. |
| `rollback` | For an authorized restoration, verifies compatibility of the prior artifact, reserves the rollback, restores its alias assignment and verifies canonical behavior against the expanded database. |
| `cancel` | Withdraws a prepared candidate whose promotion has never been attempted. Leaves the serving and retained rollback builds authorized. |

Recovery and cancellation recheck the merged PR, matching source tree and stored release pair independently of expired Actions job logs. After a timeout, competing job or split aliases, keep the hold. Read the project with `rollbackInfo=true`, both public aliases, the dev alias and both deployments. Match the provider outcome to the reserved transition. A matching dispatch can acknowledge observed completion. If the exact promotion failed or was skipped and both domains and the project target still serve the prior build, `rollback` can close its reservation without changing any alias. Explicit rollback can also recover a terminal partial promotion within the approved pair. Unresolved reservations block another write. Preserve additive SQL and recheck the hold after recovery. [Vercel rollback behavior](https://vercel.com/docs/instant-rollback)

Ticket #563 adds the deterministic tied-order Catalog acceptance probe. Record the actual isolated-dev, staged and canonical results and the prior-build compatibility proof for the first Catalog release.
