const BACKOFF_SECONDS = [60, 120, 240, 480, 960, 1920, 3600] as const;

export function paymentRetryDelaySeconds(attempt: number, options: {
  random?: () => number;
  retryAfterSeconds?: number;
} = {}): number {
  const index = Math.max(0, Math.min(6, Math.floor(attempt) - 1));
  const base = BACKOFF_SECONDS[Number.isFinite(index) ? index : 6];
  const random = (options.random ?? Math.random)();
  const jitter = Math.max(0, Math.min(1, Number.isFinite(random) ? random : 0));
  const delay = Math.min(3600, Math.ceil(base * (1 + jitter * 0.1)));
  const providerDelay = options.retryAfterSeconds;
  return providerDelay !== undefined && Number.isSafeInteger(providerDelay) && providerDelay > 0 && providerDelay <= 604800
    ? Math.max(delay, providerDelay) : delay;
}

/** Only bounded transport timing survives; never retain provider messages/headers. */
export function parseProviderRetryAfter(value: unknown, nowMs = Date.now()): number | undefined {
  if (typeof value !== "string" || value.length > 128) return undefined;
  const seconds = /^\d+$/.test(value.trim()) ? Number(value.trim())
    : Math.ceil((Date.parse(value) - nowMs) / 1000);
  return Number.isSafeInteger(seconds) && seconds > 0 && seconds <= 604800 ? seconds : undefined;
}
