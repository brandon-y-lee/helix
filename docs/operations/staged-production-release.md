# Publish Helix with Vercel

1. Merge the feature into `dev`. Test it on the [protected dev site](https://helix-git-codex-558-verified-e87038-brandons-projects-5060bad5.vercel.app/collections/shop). Its Vercel deployment should show the same commit as GitHub `dev`. The preview uses the development Supabase branch and the development search index.
2. Merge the reviewed `dev` branch into `main` through a release pull request. Vercel creates a **Production** deployment and holds the customer domains. In GitHub, check that **Forward database migrations** actually passed the migration job for that main commit. Open the new Production deployment from Vercel and review the feature there with production data.
3. Select that exact deployment in Vercel and click **Promote**. Confirm the previewed change works on the [public site](https://www.helixskin.us). Vercel assigns the customer domains to the reviewed build. [Vercel staged promotions](https://vercel.com/docs/deployments/promoting-a-deployment)

The development Preview and the held `main` deployment have different database and search settings. The Production deployment in step 2 is the build to promote. Keep automatic assignment of custom Production domains turned off in Vercel. The older `helixskin.vercel.app` hostname still receives callbacks issued by its existing deployment.

## Database changes and rollback

The protected GitHub workflow applies reviewed forward migrations on each environment using its own database login. A failed, skipped, or superseded run leaves that commit unready for promotion. Fix the cause and rerun against the current commit. When a change affects an existing database contract, check the affected behavior on the serving site after migration. Use additive changes that support the serving build and the retained rollback build. Defer incompatible cleanup until those builds have left the rollback window. [Forward migration contract](../../supabase/releases/README.md)

If a public release breaks, use **Instant Rollback** in Vercel and select the last working Production deployment. Recheck the customer domains and the affected feature. The expanded database stays in place. Any provider that has already accepted an order or email still needs its original callback and settlement handling. [Vercel Instant Rollback](https://vercel.com/docs/instant-rollback)

## Switching from the former release controller

Disable the old GitHub production release dispatcher and its `HELIX_RELEASE_CONTROLLER_ENABLED` switch during cutover. Check in Vercel that automatic custom-domain assignment is off before merging. The retired premerge reporter used a short-lived integration token. Keep the historical Supabase release records and compatibility RPC for older immutable builds.

After the new trusted workflow is on protected `main`, confirm its dedicated parent login and pending manifest, enable `HELIX_PRODUCTION_MIGRATIONS_ENABLED` for the automatic production runner, and rerun the current main-push job if it previously ran with the switch off. Verify the completed migration step and the staged deployment refer to the same commit. Development uses its existing `HELIX_DEV_MIGRATIONS_ENABLED` switch and child-only credentials.
