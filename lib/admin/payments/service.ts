import "server-only";

import { ADMIN_CAPABILITIES, requireAdminCapability } from "@/lib/admin/capabilities";
import { CatalogAdminError } from "@/lib/admin/catalog/errors";
import { CHECKOUT_ENVIRONMENT, STRIPE_SANDBOX_ACCOUNT_ID } from "@/lib/checkout/config";
import { readPaymentOperations, replayPaymentEvent, type PaymentReplayResult } from "@/lib/payments/inbox";
import { PaymentOperationsError } from "@/lib/admin/payments/errors";
import { parsePaymentReplayInput } from "@/lib/admin/payments/input";
import { presentPaymentOperations } from "@/lib/admin/payments/presentation";
import type { PaymentOperationsView } from "@/lib/admin/payments/types";

export async function getPaymentOperations(): Promise<PaymentOperationsView> {
  const access = await requireAdminCapability(ADMIN_CAPABILITIES.paymentsManage);
  try {
    const operations = await readPaymentOperations({ actorId: access.userId });
    if (
      operations.accountId !== STRIPE_SANDBOX_ACCOUNT_ID ||
      operations.environment !== CHECKOUT_ENVIRONMENT
    ) throw new PaymentOperationsError("operations_unavailable", 503);
    return presentPaymentOperations(operations);
  } catch {
    throw new PaymentOperationsError("operations_unavailable", 503);
  }
}

export async function replayPaymentOperation(input: unknown): Promise<PaymentReplayResult> {
  const access = await requireAdminCapability(ADMIN_CAPABILITIES.paymentsManage);
  const command = parsePaymentReplayInput(input);
  let result: PaymentReplayResult;
  try {
    result = await replayPaymentEvent({ ...command, actorId: access.userId });
  } catch {
    throw new PaymentOperationsError("operations_unavailable", 503);
  }
  if (result.status === "denied") {
    throw new CatalogAdminError("capability_required", "Payment operations access is required.", 403);
  }
  if (["conflict", "ineligible", "dry_run_required"].includes(result.status)) {
    throw new PaymentOperationsError("replay_conflict", 409);
  }
  if (
    !["eligible", "applied", "duplicate"].includes(result.status) ||
    result.itemId !== command.itemId ||
    !Number.isSafeInteger(result.version) || (result.version as number) < 1 ||
    (command.dryRun && (result.status !== "eligible" || result.version !== command.expectedVersion)) ||
    (!command.dryRun && (result.status === "eligible" || result.version !== command.expectedVersion + 1))
  ) throw new PaymentOperationsError("operations_unavailable", 503);
  return { status: result.status, itemId: result.itemId, version: result.version };
}
