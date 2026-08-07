export type ProductionVerificationServer = {
  exited: Promise<ProductionVerificationChildExit>;
  stop: () => Promise<void>;
};

export type ProductionVerificationChildExit = {
  code: number | null;
  reason: string;
  signal: NodeJS.Signals | null;
};

export type ProductionVerificationLock = {
  release: () => Promise<void>;
};

export type ProductionVerificationPhase =
  | "preflight"
  | "production-build"
  | "artifact-validation"
  | "server-start-and-identity"
  | "browser-test"
  | "cleanup";

export type ProductionVerificationDiagnostic = {
  phase: ProductionVerificationPhase;
  status: "started" | "passed" | "failed";
  elapsedMs: number;
  port?: number;
  buildId?: string;
  childExitReason?: string;
};

export type ProductionVerificationAdapters = {
  acquireLock: () => Promise<ProductionVerificationLock>;
  selectFreePort: (host: string) => Promise<number>;
  isPortAvailable: (input: { host: string; port: number }) => Promise<boolean>;
  build: (input: { signal?: AbortSignal }) => Promise<{ buildId: string }>;
  startServer: (input: {
    host: string;
    port: number;
  }) => Promise<ProductionVerificationServer>;
  waitForBuildIdentity: (input: {
    baseURL: string;
    buildId: string;
    server: ProductionVerificationServer;
    signal?: AbortSignal;
    timeoutMs: number;
  }) => Promise<void>;
  runBrowserTests: (input: {
    baseURL: string;
    signal?: AbortSignal;
  }) => Promise<void>;
  now: () => number;
  report: (diagnostic: ProductionVerificationDiagnostic) => void;
};

export type ProductionArtifactReceipt = {
  buildId: string;
  commitSha: string;
};

export type ReceiptedProductionVerificationAdapters =
  ProductionVerificationAdapters & {
    readArtifact: () => Promise<{ buildId: string; modifiedAtMs: number }>;
    readCommitSha: () => Promise<string>;
    readReceipt: () => Promise<{
      contents: string;
      modifiedAtMs: number;
    } | undefined>;
    removeReceipt: () => Promise<void>;
    writeReceipt: (receipt: ProductionArtifactReceipt) => Promise<void>;
  };

export type ProductionVerificationResult = {
  baseURL: string;
  buildId: string;
  port: number;
};

export type ProductionVerificationInput = {
  readinessTimeoutMs?: number;
  requestedPort?: string;
  signal?: AbortSignal;
};

const LOOPBACK_HOST = "127.0.0.1";
const DEFAULT_READINESS_TIMEOUT_MS = 120_000;
const LOCAL_SERVER_APPLICATION_KEYS = new Set([
  "ALGOLIA_ADMIN_API_KEY",
  "ALGOLIA_APP_ID",
  "ALGOLIA_INDEX_NAME",
  "ALGOLIA_WRITE_API_KEY",
  "ALLOW_PRODUCTION_SEARCH_REINDEX",
  "CHECKOUT_ENABLED",
  "CHECKOUT_MODE",
  "SEARCH_BACKFILL_ENVIRONMENT",
  "STRIPE_AUTOMATIC_TAX_ENABLED",
  "STRIPE_REFERRAL_15_COUPON_ID",
  "STRIPE_REWARD_200_COUPON_ID",
  "STRIPE_REWARD_400_COUPON_ID",
  "STRIPE_REWARD_600_COUPON_ID",
  "STRIPE_SECRET_KEY",
  "STRIPE_STANDARD_SHIPPING_RATE_ID",
  "STRIPE_WEBHOOK_SECRET",
  "SUPABASE_CATALOG_WEBHOOK_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
]);
const FIXED_BROWSER_TEST_ENVIRONMENT = {
  NEXT_PUBLIC_ALGOLIA_APP_ID: "testappid",
  NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY: "test-search-only-key",
  NEXT_PUBLIC_ALGOLIA_INDEX_NAME: "mei_pelle_products",
  SUPABASE_CATALOG_WEBHOOK_SECRET: "e2e-test-secret",
} as const;
const DEFAULT_PROCESS_CONTROL_ENVIRONMENT = {
  CI: "",
  MEI_PELLE_VERIFICATION_ADAPTER: "",
  MEI_PELLE_VERIFICATION_BASE_URL: "",
  PLAYWRIGHT_HTML_OPEN: "",
  PORT: "",
} as const;

export function prepareProductionVerificationEnvironment(input: {
  ambient: Partial<NodeJS.ProcessEnv>;
  local: Record<string, string>;
}): NodeJS.ProcessEnv {
  const localApplicationEnvironment: Record<string, string> = {};
  const blockedLocalEnvironment: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.local)) {
    if (key.startsWith("NEXT_PUBLIC_") || LOCAL_SERVER_APPLICATION_KEYS.has(key)) {
      localApplicationEnvironment[key] = value;
    } else {
      // Next scans .env.local itself. An owned empty value prevents a rejected
      // local process control from being reintroduced inside child processes.
      blockedLocalEnvironment[key] = "";
    }
  }

  return {
    ...blockedLocalEnvironment,
    ...localApplicationEnvironment,
    ...DEFAULT_PROCESS_CONTROL_ENVIRONMENT,
    ...input.ambient,
    ...FIXED_BROWSER_TEST_ENVIRONMENT,
    NODE_ENV: input.ambient.NODE_ENV ?? "production",
  };
}

export class ProductionVerificationError extends Error {
  cleanupFailure?: Error;

  constructor(
    readonly phase: ProductionVerificationPhase,
    message: string,
    readonly childExitReason?: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ProductionVerificationError";
  }
}

export class ProductionVerificationChildError extends Error {
  cleanupFailure?: Error;

  constructor(
    message: string,
    readonly childExitReason: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ProductionVerificationChildError";
  }
}

export class ProductionVerificationCleanupError extends Error {
  constructor(
    message: string,
    readonly cleanupFailure: Error,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ProductionVerificationCleanupError";
  }
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function childExitReason(error: unknown): string | undefined {
  if (
    error instanceof ProductionVerificationChildError ||
    error instanceof ProductionVerificationError
  ) {
    return error.childExitReason;
  }
  return undefined;
}

function interruptionError(signal?: AbortSignal): Error | undefined {
  if (!signal?.aborted) return undefined;
  const reason = signal.reason;
  if (reason instanceof Error) return reason;
  if (typeof reason === "string" && reason.length > 0) return new Error(reason);
  return new Error("Production verification was interrupted.");
}

function isCommitSha(value: string): boolean {
  return /^[0-9a-f]{40}$/i.test(value);
}

async function readValidatedProductionArtifact(
  adapters: Pick<
    ReceiptedProductionVerificationAdapters,
    "readArtifact" | "readCommitSha" | "readReceipt"
  >,
): Promise<{ buildId: string }> {
  const storedReceipt = await adapters.readReceipt();
  if (!storedReceipt) {
    throw new Error("Production artifact receipt is missing.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(storedReceipt.contents);
  } catch {
    throw new Error("Production artifact receipt is malformed.");
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed) ||
    Object.keys(parsed).sort().join(",") !== "buildId,commitSha"
  ) {
    throw new Error("Production artifact receipt is malformed.");
  }
  const receipt = parsed as Partial<ProductionArtifactReceipt>;
  if (
    typeof receipt.buildId !== "string" ||
    receipt.buildId.length === 0 ||
    typeof receipt.commitSha !== "string" ||
    !isCommitSha(receipt.commitSha)
  ) {
    throw new Error("Production artifact receipt is malformed.");
  }

  const [artifact, commitSha] = await Promise.all([
    adapters.readArtifact(),
    adapters.readCommitSha(),
  ]);
  if (storedReceipt.modifiedAtMs < artifact.modifiedAtMs) {
    throw new Error("Production artifact receipt is stale.");
  }
  if (receipt.buildId !== artifact.buildId) {
    throw new Error(
      "Production artifact receipt build ID does not match the current artifact.",
    );
  }
  if (receipt.commitSha !== commitSha) {
    throw new Error(
      "Production artifact receipt commit SHA does not match the current checkout.",
    );
  }

  return { buildId: artifact.buildId };
}

export async function buildReceiptedProductionArtifact(
  input: Pick<ProductionVerificationInput, "signal">,
  adapters: Pick<
    ReceiptedProductionVerificationAdapters,
    | "acquireLock"
    | "build"
    | "now"
    | "readCommitSha"
    | "removeReceipt"
    | "report"
    | "writeReceipt"
  >,
): Promise<ProductionArtifactReceipt> {
  const startedAt = adapters.now();
  let buildId: string | undefined;
  let lock: ProductionVerificationLock | undefined;
  let result: ProductionArtifactReceipt | undefined;
  let primaryFailure: ProductionVerificationError | undefined;
  const report = (
    phase: ProductionVerificationPhase,
    status: ProductionVerificationDiagnostic["status"],
    failure?: unknown,
  ): void => {
    adapters.report({
      buildId,
      childExitReason: childExitReason(failure),
      elapsedMs: Math.max(0, adapters.now() - startedAt),
      phase,
      status,
    });
  };

  try {
    report("preflight", "started");
    lock = await adapters.acquireLock();
    report("preflight", "passed");

    report("production-build", "started");
    await adapters.removeReceipt();
    ({ buildId } = await adapters.build({ signal: input.signal }));
    const commitSha = await adapters.readCommitSha();
    if (!isCommitSha(commitSha)) {
      throw new Error("Production verification could not resolve the current commit SHA.");
    }
    result = { buildId, commitSha };
    await adapters.writeReceipt(result);
    report("production-build", "passed");
  } catch (error) {
    const phase: ProductionVerificationPhase = lock
      ? "production-build"
      : "preflight";
    const cause = asError(error);
    primaryFailure = new ProductionVerificationError(
      phase,
      cause.message,
      childExitReason(error),
      { cause },
    );
    if (error instanceof ProductionVerificationChildError) {
      primaryFailure.cleanupFailure = error.cleanupFailure;
    }
    report(phase, "failed", primaryFailure);
  } finally {
    if (lock) {
      report("cleanup", "started");
      const cleanupFailures: Error[] = primaryFailure?.cleanupFailure
        ? [primaryFailure.cleanupFailure]
        : [];
      try {
        await lock.release();
      } catch (error) {
        cleanupFailures.push(asError(error));
      }
      if (cleanupFailures.length > 0) {
        const cleanupFailure = new Error(
          cleanupFailures.map((failure) => failure.message).join("; "),
          { cause: cleanupFailures[0] },
        );
        report("cleanup", "failed", cleanupFailure);
        if (primaryFailure) {
          primaryFailure.cleanupFailure = cleanupFailure;
        } else {
          primaryFailure = new ProductionVerificationError(
            "cleanup",
            cleanupFailure.message,
            undefined,
            { cause: cleanupFailure },
          );
        }
      } else {
        report("cleanup", "passed");
      }
    }
  }

  if (primaryFailure) throw primaryFailure;
  return result!;
}

async function verifyProductionArtifact(
  input: ProductionVerificationInput,
  adapters: ProductionVerificationAdapters,
  artifactPhase: "artifact-validation" | "production-build",
): Promise<ProductionVerificationResult> {
  const startedAt = adapters.now();
  let port: number | undefined;
  let buildId: string | undefined;
  let lock: ProductionVerificationLock | undefined;
  let server: ProductionVerificationServer | undefined;
  let result: ProductionVerificationResult | undefined;
  let primaryFailure: ProductionVerificationError | undefined;

  const report = (
    phase: ProductionVerificationPhase,
    status: ProductionVerificationDiagnostic["status"],
    failure?: unknown,
  ): void => {
    adapters.report({
      buildId,
      childExitReason: childExitReason(failure),
      elapsedMs: Math.max(0, adapters.now() - startedAt),
      phase,
      port,
      status,
    });
  };

  const runPhase = async <T>(
    phase: Exclude<ProductionVerificationPhase, "cleanup">,
    action: () => Promise<T>,
  ): Promise<T> => {
    report(phase, "started");
    try {
      const interruption = interruptionError(input.signal);
      if (interruption) throw interruption;
      const value = await action();
      report(phase, "passed");
      return value;
    } catch (error) {
      if (error instanceof ProductionVerificationCleanupError) {
        report(phase, "passed");
        throw error;
      }
      const cause = asError(error);
      const failure = new ProductionVerificationError(
        phase,
        cause.message,
        childExitReason(error),
        { cause },
      );
      if (error instanceof ProductionVerificationChildError) {
        failure.cleanupFailure = error.cleanupFailure;
      }
      report(phase, "failed", failure);
      throw failure;
    }
  };

  try {
    await runPhase("preflight", async () => {
      lock = await adapters.acquireLock();
      const requestedPort = input.requestedPort;
      const parsedPort =
        requestedPort === undefined ? undefined : Number(requestedPort);
      if (
        requestedPort !== undefined &&
        (requestedPort.trim() === "" ||
          !/^\d+$/.test(requestedPort) ||
          !Number.isInteger(parsedPort) ||
          parsedPort! < 1 ||
          parsedPort! > 65_535)
      ) {
        throw new Error(
          "Production verification requires PORT to be an integer from 1 through 65535.",
        );
      }

      if (
        parsedPort !== undefined &&
        !(await adapters.isPortAvailable({ host: LOOPBACK_HOST, port: parsedPort }))
      ) {
        throw new Error(
          `Production verification cannot use occupied PORT ${parsedPort}.`,
        );
      }
      port = parsedPort ?? (await adapters.selectFreePort(LOOPBACK_HOST));
    });

    await runPhase(artifactPhase, async () => {
      ({ buildId } = await adapters.build({ signal: input.signal }));
    });

    const baseURL = `http://${LOOPBACK_HOST}:${port!}`;
    await runPhase("server-start-and-identity", async () => {
      server = await adapters.startServer({ host: LOOPBACK_HOST, port: port! });
      await adapters.waitForBuildIdentity({
        baseURL,
        buildId: buildId!,
        server,
        signal: input.signal,
        timeoutMs: input.readinessTimeoutMs ?? DEFAULT_READINESS_TIMEOUT_MS,
      });
    });

    await runPhase("browser-test", () =>
      adapters.runBrowserTests({ baseURL, signal: input.signal }),
    );
    result = { baseURL, buildId: buildId!, port: port! };
  } catch (error) {
    if (error instanceof ProductionVerificationCleanupError) {
      primaryFailure = new ProductionVerificationError(
        "cleanup",
        error.message,
        undefined,
        { cause: error },
      );
      primaryFailure.cleanupFailure = error.cleanupFailure;
    } else {
      primaryFailure =
        error instanceof ProductionVerificationError
          ? error
          : new ProductionVerificationError(
              "preflight",
              asError(error).message,
              undefined,
              { cause: error },
            );
    }
  } finally {
    if (lock) {
      report("cleanup", "started");
      const cleanupFailures: Error[] = primaryFailure?.cleanupFailure
        ? [primaryFailure.cleanupFailure]
        : [];
      try {
        await server?.stop();
      } catch (error) {
        cleanupFailures.push(asError(error));
      }
      try {
        await lock.release();
      } catch (error) {
        cleanupFailures.push(asError(error));
      }

      if (cleanupFailures.length > 0) {
        const cleanupFailure = new Error(
          cleanupFailures.map((failure) => failure.message).join("; "),
          { cause: cleanupFailures[0] },
        );
        report("cleanup", "failed", cleanupFailure);
        if (primaryFailure) {
          primaryFailure.cleanupFailure = cleanupFailure;
        } else {
          primaryFailure = new ProductionVerificationError(
            "cleanup",
            cleanupFailure.message,
            childExitReason(cleanupFailure),
            { cause: cleanupFailure },
          );
        }
      } else {
        report("cleanup", "passed");
      }
    }
  }

  if (primaryFailure) throw primaryFailure;
  return result!;
}

export function verifyFreshProductionArtifact(
  input: ProductionVerificationInput,
  adapters: ProductionVerificationAdapters,
): Promise<ProductionVerificationResult> {
  return verifyProductionArtifact(input, adapters, "production-build");
}

export function verifyReceiptedProductionArtifact(
  input: ProductionVerificationInput,
  adapters: ReceiptedProductionVerificationAdapters,
): Promise<ProductionVerificationResult> {
  return verifyProductionArtifact(
    input,
    {
      ...adapters,
      build: () => readValidatedProductionArtifact(adapters),
    },
    "artifact-validation",
  );
}
