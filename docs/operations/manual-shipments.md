# Manual shipment records

Ticket #491 / Spec #486 supplies inactive source only. No hosted schema/configuration changes, carrier calls, labels, real fulfillment or email sends are performed. This is not a delivery-event integration or review campaign trigger.

`/admin/shipments` requires the dedicated `fulfillment.manage` capability, currently assigned only to active administrators. The API verifies the session, origin, bounded JSON and application flag. Service-only database functions independently recheck active administrator membership, verified sandbox payment and the default-off database control. Catalog-only roles cannot read or mutate these records. `HELIX_MANUAL_SHIPMENTS_ENABLED=false` and `private.manual_shipment_control.enabled=false` are the installation defaults. Changing either requires separately approved activation; one switch alone is insufficient for writes. No public activation endpoint exists.

The console looks up an exact sandbox Order number, allocates remaining quantities and creates a preparing shipment. Status changes record the actor, prior/new state, revision, command and correction reason atomically with the update. Concurrent allocations lock the Order and cannot exceed its ordered quantities. Unknown outcomes retain the exact command for retry; a duplicate command with changed content conflicts. Cancelled records cannot be reopened. Cancellation releases quantities only when the record is still preparing and has never been dispatched. Ever-dispatched records retain their allocation, even when cancelled or corrected; replacement fulfillment is deliberately not implemented. Correcting a delivered record requires a reason. The current record and allocations cannot be edited directly by service-role clients.

Shipment history is private. Customer receipts use the existing ownership and Session checks before and after reading the narrow projection. They display only status, carrier/reference as text, item quantities and recorded timestamps. Operator identity and correction notes never reach customers. All current Orders are sandbox-only and the UI states that no goods will ship. Records are clearly labelled **Manually updated by helix. Not carrier-verified.** No shipping address or carrier URL is added. Existing simulated tracking remains separate. Disabling updates preserves historical reads.

A future 3PL integration requires a separate approved contract. Manual delivered status never grants verified-delivery eligibility, sends invitations, issues discounts, or establishes a public review badge. No speculative webhook, inbox, provider retry worker or reconciliation engine is included.

Local proof:
- `pnpm exec vitest run tests/manual-shipments.test.ts tests/manual-shipments-request.test.ts tests/manual-shipments-ui.test.tsx tests/admin-modules.test.ts tests/admin-capabilities.test.ts`
- `node scripts/db/test-manual-shipments.mjs helix-spec358-pg`
- `pnpm typecheck` and `pnpm lint`

The SQL runner accepts only a labelled local synthetic PostgreSQL 17 container and creates/drops its own uniquely named database. It exercises the actual payment-contract predecessor, authorization/grants, concurrent quantity allocation, command/revision conflicts, cancellation, correction audit and absence of private audit data from customer output. Full suite, production build and browser integration verification remain distinct required stages; local focused proof is not hosted activation evidence.

Carrier or tracking-reference typos may be corrected while keeping the current non-cancelled status. Delivered corrections require a reason. These corrections retain fulfillment timestamps and allocations, increment the revision, and are audited; an unchanged submission is rejected.
