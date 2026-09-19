import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

type PaymentDeadline = {
  deadlineAtMs: number;
  now?: () => number;
};
type DeadlineScope = {
  deadlineAtMs: number;
  now: () => number;
  signal: AbortSignal;
};

const scopes = new AsyncLocalStorage<DeadlineScope>();

export class PaymentDeadlineExceededError extends Error {
  // PostgREST recognizes this standard abort code and skips its own retry sleep.
  readonly code = "ABORT_ERR";

  constructor() {
    super("Payment processing reached its execution deadline.");
    this.name = "PaymentDeadlineExceededError";
  }
}

export function isPaymentDeadlineError(error: unknown): error is PaymentDeadlineExceededError {
  return error instanceof PaymentDeadlineExceededError;
}

export function getPaymentDeadlineRemainingMs(): number {
  const scope = scopes.getStore();
  if (!scope) return Infinity;
  return scope.signal.aborted ? 0 : Math.max(0, scope.deadlineAtMs - scope.now());
}

/** All work, including response consumption, must be awaited inside the scope. */
export async function withPaymentDeadline<T>(
  deadline: PaymentDeadline,
  operation: () => Promise<T>,
): Promise<T> {
  const now = deadline.now ?? (() => performance.now());
  const startedAtMs = now();
  const requestedMs = deadline.deadlineAtMs - startedAtMs;
  if (!Number.isFinite(requestedMs)) throw new Error("A finite payment deadline is required.");
  const parent = scopes.getStore();
  const remainingMs = Math.min(requestedMs, getPaymentDeadlineRemainingMs());
  if (remainingMs <= 0) throw new PaymentDeadlineExceededError();
  const controller = new AbortController();
  const signal = parent ? AbortSignal.any([parent.signal, controller.signal]) : controller.signal;
  const timeout = setTimeout(() => controller.abort(new PaymentDeadlineExceededError()), remainingMs);
  const scope = { deadlineAtMs: startedAtMs + remainingMs, now, signal };
  try {
    const result = await scopes.run(scope, operation);
    if (signal.aborted || now() >= scope.deadlineAtMs) throw new PaymentDeadlineExceededError();
    return result;
  } catch (error) {
    // Provider SDKs can translate an aborted read into an error result or their
    // own exception. The worker must still recognize its exhausted budget.
    if (signal.aborted || now() >= scope.deadlineAtMs) throw new PaymentDeadlineExceededError();
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/** The scope signal survives response headers, unlike per-request SDK timers. */
export const paymentDeadlineFetch: typeof fetch = async (input, init) => {
  const scope = scopes.getStore();
  if (!scope) return globalThis.fetch(input, init);
  if (getPaymentDeadlineRemainingMs() <= 0) throw new PaymentDeadlineExceededError();
  const upstream = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  const signal = upstream ? AbortSignal.any([upstream, scope.signal]) : scope.signal;
  return globalThis.fetch(input, { ...init, signal });
};
