# Manual shipment records

An active administrator with `fulfillment.manage` can look up a paid Order by its exact Order number at `/admin/shipments`. Use the canonical storefront for live Orders and the protected development storefront for Helix business-sandbox rehearsals. The console uses the merchant and database bound to that deployment. The historical personal sandbox retains its original shipment records and controls.

## Record a dispatch

1. Find the Order and verify its recorded ship-to name and physical address. The business operator view reads the shipping address captured at settlement. Billing details stay private.
2. Allocate the parcel's item quantities and save a preparing shipment. The database locks the Order and checks remaining quantities. A new parcel or dispatch requires a verified paid Order with consumed stock and zero recorded refunds.
3. Once the parcel leaves, record dispatch and enter the carrier and tracking reference when available. Record delivery when confirmed. Helix records these events manually. The console does not buy a label, notify a carrier or send email. Business-sandbox entries are simulations and do not authorize shipping goods.
4. If saving returns an uncertain result, use **Retry exact update**. The console retains the command ID and content. A changed command or stale revision conflicts. Corrections to a delivered record require a reason. Cancelling a preparing parcel that has never dispatched releases its quantities. Previously dispatched quantities remain allocated.

Stopping new Checkout Sessions preserves work on previously paid Orders. The application requires `HELIX_MANUAL_SHIPMENTS_ENABLED=true` for operator writes. Business writes additionally verify the serving origin, deployment, operator membership, merchant, payment and stock reservation. An existing dispatched parcel can still be marked delivered after a refund. The original personal sandbox separately requires its `private.manual_shipment_control` switch. Hosted activation remains a separate operator decision.

## Customer receipts

Business receipts show a parcel after its first recorded dispatch. The signed-in owner or a guest with the issuing Session's unexpired receipt capability can see the state, carrier, tracking reference, item quantities and recorded timestamps. Ownership is checked again after the shipment read. The view excludes recipient names, addresses, provider identifiers, operator identity and correction notes. A refund preserves the history of parcels already dispatched. Development receipts identify the shipment as simulated.

The historical sandbox keeps its existing private receipt flow and separate demo tracking. Manual delivery records do not establish carrier verification, award rewards or trigger review invitations.

## Local checks

- `pnpm exec vitest run --maxWorkers=1 tests/manual-shipments.test.ts tests/manual-shipments-server.test.ts tests/manual-shipments-request.test.ts tests/manual-shipments-ui.test.tsx tests/live-checkout-receipts.test.ts tests/order-confirmation-state.test.tsx tests/checkout-receipt-access.test.ts`
- `node scripts/db/test-manual-shipments.mjs helix-spec358-pg` exercises historical authorization, allocation, correction and retry on a labelled synthetic PostgreSQL 17 container.
- The business forward-migration rehearsal covers the scoped stock and fulfillment database functions. Run the repository's full type, lint, build and browser gates separately.
