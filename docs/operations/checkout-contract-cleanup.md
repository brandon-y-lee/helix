# Checkout contract cleanup — Spec #358, Ticket #365

Source delivery and environment apply have separate evidence. These migrations have been executed only in a disposable local PostgreSQL database. Application deployment and approved-project SQL apply remain pending. No Orders, Checkout Sessions, media, or provider settings were changed remotely.

## Required order

1. Confirm the target is `erasogmsqpgiirovubjh` and capture the schema-only output from `supabase/operations/checkout-contract-preflight.sql`. Confirm the current deployment calls `reserve_checkout_order_snapshot_v2` and the three-argument `fail_checkout_order_from_stripe` with the exact session ID. Read both deployed definitions when a hash differs; stop rather than overriding the guard.
2. Apply only `20260914051313_assign_current_order_numbers.sql` as compatible preparation through the approved migration mechanism. This replaces one new-number expression in the exact captured base reservation function, retains its ACL/execution mode, and does not update an Order row. The existing v2 wrapper remains authoritative for ownership, cart generations, locking, and replay. A repeat on the exact current body is a no-op.
3. Immediately before deploying the application without `/checkout/cancel`, run `pnpm exec tsx scripts/verify-checkout-cancellation.ts` with the approved Sandbox configuration. It requires the configured test key, checks the approved Stripe account, follows every list page, rejects live objects, and outputs aggregate evidence only. `status: ready` requires no old open Session, valid old recovery link, malformed URL, or unknown Session state. A blocked report requires waiting for natural expiry or separately authorized remediation, then a new complete inventory. The tool never expires Sessions. Prevent older application writers from issuing new old-route URLs after the inventory.
4. Deploy the reviewed application and verify the current Cart cancellation return, canonical Checkout, and session-qualified failure caller. Record environment, deployment identifier, exact source commit, provider inventory time, and health evidence on Spec #358.
5. Only after that deployment is verified, apply `20260914051315_retire_obsolete_checkout_failure.sql` in a transaction with `helix.checkout_verified_deployment_sha` set to its actual 40-character source SHA. This is an operator attestation to recorded deployment evidence, not an automated deployment lookup. Missing attestation fails closed. Use the approved migration mechanism with that setting in the same transaction; do not blindly apply every pending migration before deploying.
6. Repeat the read-only preflight. The obsolete `(uuid,text)` signature must be absent; `(uuid,text,text)` and v2 hashes, grants, and execution modes must match their prior state. The base reservation function must contain the HX generation expression. Record the applied migration identifiers, source SHA, exact postflight, cancellation inventory, and any pending items on Spec #358. Source tests and Ticket merge do not establish these environmental outcomes.

Both migrations use bounded lock/statement timeouts. Contraction uses the exact signature with `RESTRICT`, requires the expected no-op body and current failure body, and refuses routine-body callers or tracked dependencies. No cascading deletion or live Stripe operation is part of this work.

Recovery must keep a deployed application using the session-qualified RPC. An older application expecting the removed overload is not a supported rollback. Existing HX and historical MP numbers remain fixed during recovery; never rewrite them or recreate Orders. Prefer correcting the current contract forward. Catalog routing contraction has its own ordered rollout in the parent Spec.

## Captured preflight

Schema-only inspection on 2026-09-14 confirmed healthy approved project `erasogmsqpgiirovubjh`, PostgreSQL 17.6. The current schema checkpoint followed migration `20260909042518`.

| Routine | Body MD5 before preparation | Contract |
| --- | --- | --- |
| Base reservation | `30f02dbc8f6afe7c72ed66418be4059e` | Generates new MP numbers; remains called by v2 |
| v2 reservation | `8f352a94a3b073893616c18a202f5eec` | Unchanged generation/ownership/replay wrapper |
| Failure `(uuid,text)` | `9f4684bfd84df734cb8438b14aff0c16` | Returns false only; no routine callers or tracked dependents |
| Failure `(uuid,text,text)` | `2602b3199f78b3be24ebf2cb7242d622` | Unchanged exact-session failure handling |

All four were `SECURITY INVOKER`, fixed empty `search_path`, and ACL `{postgres=X/postgres,service_role=X/postgres}`. Browser roles had no execute grant. The source operation also scans routine bodies because PostgreSQL does not record every string-defined routine dependency. [PostgreSQL dependency documentation](https://www.postgresql.org/docs/17/ddl-depend.html).

The new read-only cancellation verifier completed at **2026-09-14T05:18:39.849Z**: approved Sandbox account, 15 Sessions, 0 open, 1 complete, 14 expired, 4 historical old cancellation paths, 0 blocking recovery links, 0 unknown Sessions, 0 malformed URLs. This is dated source-removal evidence and must be refreshed immediately before deployment. No Session identifiers, customer records, raw provider payloads, or credentials are retained in the report.

## Reproduce actual SQL evidence

Run `node scripts/db/test-checkout-contract.mjs helix-spec358-pg` with the local PostgreSQL 17 test container. The runner requires its `helix.task=spec358-synthetic-sql` label, creates a unique disposable database, and drops only that database on completion. It accepts no remote database URL and performs no provider operation. The test container used `public.ecr.aws/supabase/postgres:17.6.1.159`; it is separate from every application environment.

The checked-in checkpoint contains current commerce table columns/defaults/checks/keys/indexes/RLS/policies/grants and application commerce triggers, plus the exact captured reservation and failure bodies. Product, Variant, and System Step rows are synthetic input anchors with current columns/checks/keys. The unrelated Catalog publication/slug lifecycle triggers are outside this Checkout read seam; `auth.users` supplies an ID-only foreign-key anchor and `auth.uid()` a synthetic claim lookup. The guest cases do not invoke authentication services or account Rewards operations. This is a bounded current-schema Checkout checkpoint, not a complete Supabase installation, whole-history bootstrap, Catalog writer test, or Rewards proof. Existing authentication, Cart, Rewards, and webhook regression suites remain required.

The runner first executes the HX expectation against the original MP generator and requires it to fail. It then executes the real preparation and contraction SQL and tests:

- new HX creation through v2 → base, preserved MP replay, unchanged historical Order/Order Line snapshots, and retry behavior;
- overlapping same-intent and sibling-intent requests in separate PostgreSQL connections, yielding one Order per Cart generation;
- unchanged current function bodies/ACLs, denied browser execution, service execution, and fixed invoker/search-path behavior;
- stale, matching, repeated, and delayed-after-paid Stripe failures;
- refusal without deployment attestation, with a changed obsolete body, with a routine-body caller, or with a tracked view dependency;
- repeated migration no-ops.

The all-zero deployment SHA in this test runner is synthetic local test input only. Never use it as operational evidence.

Affected RPC types were generated with Supabase CLI 2.117.0 / postgres-meta 0.99.0 against the local target checkpoint. Only the generated `fail_checkout_order_from_stripe` entry was incorporated into the complete application types; unrelated schema entries were retained. The legacy overload assertion in the broader Cart SQL suite now requires its absence. The synthetic SKU is `FIXTURE-CLEANSE-200`; issued SKUs are untouched.

Focused Vitest covers the read-only cancellation inventory and existing Checkout/Cart behavior. `e2e/checkout-cancellation-routes.spec.ts` verifies the retired route is a true 404 and the current Cart return still requests cleanup; its cleanup response is intercepted, so it does not claim server ownership or payment mutation coverage. Run it in the final composed Chromium gate. The production build and full browser gate belong to Spec closure.
