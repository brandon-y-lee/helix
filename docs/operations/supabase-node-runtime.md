# Supabase Node runtime

The Catalog, admin, database operations, and admin bootstrap clients use the
native WebSocket provided by Node 24. The supported runtime is recorded in
`package.json` and `.nvmrc`; CI reads `.nvmrc`. There is no application-owned
WebSocket transport package or override. Provider-owned transitive dependencies
remain managed by the lockfile.

The clients retain their existing auth configuration, approved-project checks,
and credential boundaries. Admin requests still use the bounded fetch wrapper.
Do not remove these controls as part of transport maintenance.

## Deployment verification

Before deploying this runtime assumption, record the exact Vercel deployment,
source commit, and observed Node version from its build/runtime evidence. Vercel
documents that the Node `engines` setting in the package controls builds and
functions, overriding the project setting. A source setting or local test alone
does not establish the version of an already deployed application.

For Ticket #367, local Node v24.19.0 and installed Supabase JS 2.108.2 selected
native WebSocket without connecting to a provider. Constructor tests cover
Catalog/admin credential separation, missing configuration, operations project
rejection, bounded admin timeout, and bootstrap initialization without a user
selector. The frozen dependency update removes only direct `ws` and `@types/ws`;
it does not upgrade the SDK.

Actual deployment evidence remains pending. This Ticket includes no manual
Vercel deployment or provider configuration change. Normal Git-linked previews
may build the branch; record their actual runtime evidence separately. The
Spec's integration gate retains the production build and browser verification.

References:

- [Supabase native WebSocket runtime contract](https://supabase.com/changelog/37869-change-in-realtime-js-affecting-node-js-22)
- [Vercel Node version selection and verification](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
