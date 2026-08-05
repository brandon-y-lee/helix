const NETWORK_ERROR_CODES = new Set([
  "ABORT_ERR",
  "ECONNREFUSED",
  "ECONNRESET",
  "EAI_AGAIN",
  "ENETUNREACH",
  "ENOTFOUND",
  "ETIMEDOUT",
]);

const NETWORK_ERROR_NAMES = new Set([
  "AbortError",
  "AuthRetryableFetchError",
  "SupabaseRequestTimeoutError",
  "SupabaseUnavailableError",
  "TimeoutError",
]);

const NETWORK_MESSAGE_PATTERNS = [
  /\bfetch failed\b/i,
  /\bnetwork(?: request)? failed\b/i,
  /\bnetworkerror\b/i,
  /\brequest timed out\b/i,
  /\btimeout\b/i,
];

const SUPABASE_REQUEST_TIMEOUT_MS = 4_500;

type ErrorRecord = {
  name: string;
  message: string;
  code: string | null;
};

export type SupabaseNetworkErrorDetails = {
  errorClass: string;
  causeCode: string | null;
};

export class SupabaseRequestTimeoutError extends Error {
  readonly code = "ETIMEDOUT";

  constructor(
    readonly timeoutMs: number,
    options?: ErrorOptions,
  ) {
    super(`Supabase request timed out after ${timeoutMs}ms.`, options);
    // PostgREST does not retry aborted requests, which keeps this timeout
    // bounded to one network attempt.
    this.name = "AbortError";
  }
}

export class SupabaseTransportAbortError extends Error {
  readonly code = "SUPABASE_NETWORK_UNAVAILABLE";

  constructor(options?: ErrorOptions) {
    super("Supabase network request failed.", options);
    // PostgREST never retries abort-class failures. The original cause remains
    // attached so classification and logs retain ENOTFOUND/EAI_AGAIN/etc.
    this.name = "AbortError";
  }
}

export class SupabaseUnavailableError extends Error {
  readonly code = "SUPABASE_SERVICE_UNAVAILABLE";
  readonly causeCode: string | null;
  readonly operation: string;

  constructor(operation: string, cause: unknown) {
    const details = inspectSupabaseNetworkError(cause);
    super("Supabase is temporarily unavailable.", { cause });
    this.name = "SupabaseUnavailableError";
    this.operation = operation;
    this.causeCode = details?.causeCode ?? null;
  }
}

function errorChain(error: unknown): ErrorRecord[] {
  const records: ErrorRecord[] = [];
  const seen = new Set<unknown>();
  let current = error;

  for (let depth = 0; depth < 8 && current && !seen.has(current); depth += 1) {
    seen.add(current);
    if (typeof current === "object") {
      const value = current as {
        cause?: unknown;
        code?: unknown;
        errno?: unknown;
        message?: unknown;
        name?: unknown;
      };
      const codeValue = value.code ?? value.errno;
      records.push({
        name: typeof value.name === "string" ? value.name : "Error",
        message: typeof value.message === "string" ? value.message : "",
        code:
          typeof codeValue === "string" || typeof codeValue === "number"
            ? String(codeValue).toUpperCase()
            : null,
      });
      current = value.cause;
      continue;
    }

    records.push({
      name: typeof current,
      message: String(current),
      code: null,
    });
    break;
  }

  return records;
}

export function inspectSupabaseNetworkError(
  error: unknown,
): SupabaseNetworkErrorDetails | null {
  const records = errorChain(error);
  const nestedCauseCode =
    records.find(
      (record) => record.code && NETWORK_ERROR_CODES.has(record.code),
    )?.code ?? null;

  for (const record of records) {
    if (
      (record.code && NETWORK_ERROR_CODES.has(record.code)) ||
      NETWORK_ERROR_NAMES.has(record.name) ||
      NETWORK_MESSAGE_PATTERNS.some((pattern) => pattern.test(record.message))
    ) {
      return {
        errorClass: record.name,
        causeCode: nestedCauseCode ?? record.code,
      };
    }
  }

  return null;
}

export function isSupabaseNetworkError(error: unknown): boolean {
  return inspectSupabaseNetworkError(error) !== null;
}

export function toSupabaseUnavailableError(
  error: unknown,
  operation: string,
): SupabaseUnavailableError {
  if (error instanceof SupabaseUnavailableError) return error;
  return new SupabaseUnavailableError(operation, error);
}

export function createSupabaseFetch({
  fetchImplementation,
  timeoutMs = SUPABASE_REQUEST_TIMEOUT_MS,
}: {
  fetchImplementation?: typeof fetch;
  timeoutMs?: number;
} = {}): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const upstreamSignal = init?.signal;
    let timedOut = false;

    const abortFromUpstream = () => {
      controller.abort(upstreamSignal?.reason);
    };

    if (upstreamSignal?.aborted) {
      abortFromUpstream();
    } else {
      upstreamSignal?.addEventListener("abort", abortFromUpstream, {
        once: true,
      });
    }

    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const request = fetchImplementation ?? globalThis.fetch;
      return await request(input, {
        ...init,
        signal: controller.signal,
      });
    } catch (error) {
      if (timedOut) {
        throw new SupabaseRequestTimeoutError(timeoutMs, { cause: error });
      }
      if (isSupabaseNetworkError(error)) {
        throw new SupabaseTransportAbortError({ cause: error });
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
      upstreamSignal?.removeEventListener("abort", abortFromUpstream);
    }
  };
}

function configuredSupabaseHostname(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
  } catch {
    return "unconfigured";
  }
}

export function logSupabaseUnavailable(
  error: unknown,
  context: {
    operation: string;
    route: string;
    runtime: "middleware" | "nodejs";
    requestId?: string | null;
    elapsedMs?: number;
  },
) {
  const details = inspectSupabaseNetworkError(error);
  const normalized =
    error instanceof SupabaseUnavailableError
      ? error
      : toSupabaseUnavailableError(error, context.operation);

  console.error(
    "[supabase_unavailable]",
    JSON.stringify({
      operation: context.operation,
      route: context.route,
      runtime: context.runtime,
      errorClass: details?.errorClass ?? normalized.name,
      causeCode: details?.causeCode ?? normalized.causeCode,
      hostname: configuredSupabaseHostname(),
      elapsedMs: Math.max(0, Math.round(context.elapsedMs ?? 0)),
      requestId: context.requestId ?? null,
    }),
  );
}
