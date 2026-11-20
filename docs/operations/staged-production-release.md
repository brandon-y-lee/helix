# Stage and release the production website

Vercel builds the merged `main` commit once with Production configuration. Keep the prior build serving `www.helixskin.us` until the owner promotes the verified candidate. [Vercel staged deployments](https://vercel.com/docs/deployments/promoting-a-deployment)

## Prepare the controller

With configuration authority, restrict each GitHub environment below to exactly `main` using a custom branch policy. Keep `main` protected. Bind the repository variable `HELIX_RELEASE_OPERATOR_ID` to the independently verified numeric GitHub user ID of the owner authorized to dispatch. Reruns must retain that operator identity.

| Location | Configuration |
| --- | --- |
| `helix-release-inspect` | `HELIX_RELEASE_VERCEL_READ_TOKEN` for read-only project, deployment and alias inspection. Set the reusable environment variable `HELIX_RELEASE_PROFILE` and the server-only `HELIX_RELEASE_STATUS_TOKEN` for reading an equipped prior deployment. Provide `HELIX_RELEASE_BYPASS_TOKEN` if protected immutable URLs need it. |
| `helix-release-control` | Separate read and promotion/rollback Vercel credentials under `HELIX_RELEASE_VERCEL_READ_TOKEN` and `HELIX_RELEASE_VERCEL_CONTROL_TOKEN`. Set `HELIX_RELEASE_DB_HOST`, `HELIX_RELEASE_DB_CA` and `HELIX_RELEASE_DB_PASSWORD` for the dedicated controller login. Provide the read-only probe credential `HELIX_RELEASE_STATUS_TOKEN` and applicable bypass token. |
| `helix-db-production` | The reusable workflow takes its own target, CA and migration login here. After qualification, enable repository variables `HELIX_PRODUCTION_MIGRATIONS_ENABLED` and `HELIX_RELEASE_CONTROLLER_ENABLED`. [Forward database releases](../../supabase/releases/README.md) |
| Vercel Production | Set the matching server-only status token. The application reads its exact build authorization through a one-boolean RPC using its existing target-validated public Supabase key. The controller login and Vercel control credential belong only in the protected action. |

Verify the parent project and its enrolled marker. Its independent owner provisions the restricted `helix_release_controller` LOGIN and installs the deployment registry and capability reader. Enrollment authorizes zero builds. [Environment and Catalog enrollment](environment-bindings.md) · [Deployment registry SQL](../../supabase/operations/release-bootstrap/enroll_deployment_authorization.sql) · [Capability reader SQL](../../supabase/operations/release-bootstrap/read_release_capabilities.sql)

## Check the hold before merging

For the first release, run Node 24 in a trusted checkout of the independently reviewed controller. Supply read credentials `GH_TOKEN` (repo/PR) and `HELIX_RELEASE_VERCEL_TOKEN` (project). Set `RELEASE_PR` to the open PR number, `RELEASE_CANDIDATE_SHA` to its exact **dev head**, and `GITHUB_REPOSITORY_ID` to `1280166759`.

```sh
node scripts/release/command.mjs premerge
```

Require passing release CI and authority for this merge. Stop if automatic domain assignment is on or unverified, the domain set has changed, or an alias job is active. The controller pins the three currently reviewed Vercel domain bindings. A continuity cutover that moves `dev` to another hostname requires a reviewed inventory update before this check can pass. Once the workflow exists on protected `main`, use separate branch-protection authority to require the GitHub Actions status `helix-production-domain-hold`. The workflow runs from the trusted base and reports on the exact dev PR head. [Premerge workflow](../../.github/workflows/premerge-production.yml)

## Qualify the production profile

Configure `HELIX_RELEASE_PROFILE` in `helix-release-inspect` once the capability owners have approved its contents. Keep the profile in that environment. The example uses synthetic dates, fingerprints, evidence hashes, and media. Replace them with measurements from the approved production environment. [Profile example](../../scripts/release/catalog-profile.example.json)

* In `observations`, specify the expected public product, governed image, capabilities, database package and control states, and sandbox Checkout GET admission results separately for canonical and immutable origins. The Catalog trial keeps new customer-facing side effects disabled. Record the SHA-256 fingerprints of the exact production Algolia write key and Supabase Catalog webhook secret in `searchCredentials`. The protected reader compares these with hashes of the credentials the deployment uses. A disabled writer has a null write-key fingerprint.
* In `previous`, enter the prior controller-equipped build's independently expected observation object. Set it to `"same"` only after confirming that the approved candidate and prior states match. A previous build must remain compatible with the expanded schema. The workflow reads its authenticated effective state and runs public probes before and after expansion and after rollback.
* The first release can reference the existing public build in `legacyPrevious`. Include that exact ID and SHA, the older build's expected observations and fresh dated independent evidence under `observation`. The old build predates the status API. Its probes check the serving Catalog, real product media, auth, cart, checkout and absent new routes. The exception is restricted to the identity in the example. Set `legacyPrevious` to `null` when that artifact leaves the rollback window.
* Each authority under `evidence` records its observation and expiry as UTC ISO timestamps with milliseconds and the lowercase SHA-256 of its retained sanitized report. The Auth owner verifies project identity, return origins and redirect settings. The Search owner qualifies the exact write key's Algolia app, allowed indexes and ACLs, plus the parent database webhook's destination and configured credential. Verify the two corresponding fingerprints from those independent records. The email owner qualifies existing signed callback routes and generation/signers. The Checkout owner verifies the recorded sandbox account, callback destination and settlement eligibility. Keep original secrets and customer records in their authorized systems.
* Reuse valid observations across releases. Requalify the relevant evidence when a binding or intended capability changes or before an authority's evidence expires. During each dispatch the controller discovers the two immutable ID/SHA pairs and binds them to the exact profile bytes with SHA-256. Subsequent protected jobs verify the frozen packet, deployment identities and validity windows before acting.

## Run the release

From protected `main`, dispatch **Staged production release** with two inputs. Set `operation` to one of the choices below and `selector` to the reviewed release PR number or exact Vercel deployment ID. The controller stops if the merged SHA has multiple eligible builds. The controller verifies the GitHub source and current Vercel state. Dispatches run serially. [Staged release workflow](../../.github/workflows/staged-production.yml)

| Operation | Effect |
| --- | --- |
| `verify` | Checks the old application, calls the protected forward writer for the merged SHA, requires a matching `applied_sha`, and authorizes the candidate alongside the serving build. Verifies the old application against the expanded schema and probes the immutable candidate, including Catalog, bounded public media and capability states. Public traffic stays on the previous build. |
| `promote` | One operator dispatch runs all release checks and switches traffic. The optional `verify` dispatch can run earlier. Promotion runs the forward database gate and rechecks the exact release, probes and alias ownership, reserves one promotion, and switches the production domains. Verifies the new canonical site and apex redirect. |
| `rollback` | For an authorized restoration, verifies compatibility of the prior artifact, reserves the rollback, restores its alias assignment and verifies canonical behavior against the expanded database. |
| `cancel` | Withdraws a prepared candidate whose promotion has never been attempted. Leaves the serving and retained rollback builds authorized. |

Recovery and cancellation recheck the merged PR, matching source tree and stored release pair independently of expired Actions job logs. After a timeout, competing job or split aliases, keep the hold. Read the project with `rollbackInfo=true`, both public aliases, the dev alias and both deployments. Match the provider outcome to the reserved transition. A matching dispatch can acknowledge observed completion. If the exact promotion failed or was skipped and both domains and the project target still serve the prior build, `rollback` can close its reservation without changing any alias. Explicit rollback can also recover a terminal partial promotion within the approved pair. If a rollback itself failed or was skipped, dispatch `rollback` with the same selector after confirming the previous artifact is healthy. The controller reserves that exact terminal Vercel request timestamp once and checks it again before resubmission. Pending, missing and ambiguous outcomes keep the reservation held. Preserve additive SQL and recheck the hold after recovery. [Vercel rollback behavior](https://vercel.com/docs/instant-rollback)

The release check compares every rendered shop card with an independent anonymous database read. It checks active products in ascending display order with product ID as the tie-breaker and excludes non-entry family members. The previous legacy build may display equal-ranked products in either order. The check uses the same target-specific public key and fingerprint as the scheduled production media check. Keep the development, staged and canonical results with their exact deployment IDs, and record prior-build compatibility across the migration. [Public media verification](../../.github/workflows/active-product-media-verification.yml)
