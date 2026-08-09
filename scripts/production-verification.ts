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

export type ProductionVerificationLifecycleAdapters = {
  acquireLock: () => Promise<ProductionVerificationLock>;
  selectFreePort: (host: string) => Promise<number>;
  isPortAvailable: (input: { host: string; port: number }) => Promise<boolean>;
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
    selection?: ProductionVerificationBrowserSelection;
    signal?: AbortSignal;
  }) => Promise<{ retries: number } | void>;
  now: () => number;
  report: (diagnostic: ProductionVerificationDiagnostic) => void;
};

export type ProductionVerificationAdapters =
  ProductionVerificationLifecycleAdapters & {
    build: (input: { signal?: AbortSignal }) => Promise<{ buildId: string }>;
  };

export type ProductionArtifactReceipt = {
  buildId: string;
  commitSha: string;
};

export type ProductionArtifactReceiptAdapters = {
  readArtifact: () => Promise<{ buildId: string; modifiedAtMs: number }>;
  readCommitSha: () => Promise<string>;
  readReceipt: () => Promise<{
    contents: string;
    modifiedAtMs: number;
  } | undefined>;
  removeReceipt: () => Promise<void>;
  writeReceipt: (receipt: ProductionArtifactReceipt) => Promise<void>;
};

export type ReceiptedProductionVerificationAdapters =
  ProductionVerificationLifecycleAdapters &
    Pick<
      ProductionArtifactReceiptAdapters,
      "readArtifact" | "readCommitSha" | "readReceipt"
    >;

export type NodeProductionVerificationAdapters = ProductionVerificationAdapters &
  ProductionArtifactReceiptAdapters &
  ReusableProductionBuildAdapters;

export const PRODUCTION_BUILD_REUSE_CATEGORIES = [
  "runtime-source",
  "dependencies",
  "environment",
  "browser-configuration",
  "verification-plan",
  "tests",
] as const;

export type ProductionBuildReuseCategory =
  (typeof PRODUCTION_BUILD_REUSE_CATEGORIES)[number];

export type ProductionBuildReuseInput = {
  categories: Record<ProductionBuildReuseCategory, string>;
  worktreeId: string;
};

export type ReusableProductionBuildReceipt = ProductionBuildReuseInput & {
  buildId: string;
  version: 1;
};

export type ReusableProductionBuildAdapters = {
  readBuildReuseInput: () => Promise<ProductionBuildReuseInput>;
  readReusableBuildReceipt: () => Promise<{
    contents: string;
    modifiedAtMs: number;
  } | undefined>;
  removeReusableBuildReceipt: () => Promise<void>;
  writeReusableBuildReceipt: (
    receipt: ReusableProductionBuildReceipt,
  ) => Promise<void>;
};

export type ProductionVerificationResult = {
  baseURL: string;
  buildId: string;
  port: number;
  retries?: number;
};

export type ReusableProductionVerificationResult =
  ProductionVerificationResult & {
    invalidationReason: string;
    reuseStatus: "new" | "reused";
  };

export type ProductionVerificationInput = {
  browserSelection?: ProductionVerificationBrowserSelection;
  readinessTimeoutMs?: number;
  requestedPort?: string;
  signal?: AbortSignal;
};

export type ProductionVerificationBrowserSelection = {
  journeyIds: readonly string[];
  projects: readonly ("chromium" | "webkit")[];
  retries?: number;
  webkitJourneyIds?: readonly string[];
};

const LOOPBACK_HOST = "127.0.0.1";
const DEFAULT_READINESS_TIMEOUT_MS = 120_000;
export const PRODUCTION_BUILD_NON_SECRET_ENVIRONMENT_KEYS: ReadonlySet<string> =
  new Set([
    "ALGOLIA_APP_ID",
    "ALGOLIA_INDEX_NAME",
    "ALLOW_PRODUCTION_SEARCH_REINDEX",
    "CHECKOUT_ENABLED",
    "CHECKOUT_MODE",
    "CI",
    "NODE_ENV",
    "SEARCH_BACKFILL_ENVIRONMENT",
    "STRIPE_AUTOMATIC_TAX_ENABLED",
    "STRIPE_REFERRAL_15_COUPON_ID",
    "STRIPE_REWARD_200_COUPON_ID",
    "STRIPE_REWARD_400_COUPON_ID",
    "STRIPE_REWARD_600_COUPON_ID",
    "STRIPE_STANDARD_SHIPPING_RATE_ID",
    "VERCEL_ENV",
    "VERCEL_URL",
  ]);

const LOCAL_SERVER_SECRET_ENVIRONMENT_KEYS = new Set([
  "ALGOLIA_ADMIN_API_KEY",
  "ALGOLIA_WRITE_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "SUPABASE_CATALOG_WEBHOOK_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
]);
const LOCAL_SERVER_APPLICATION_KEYS = new Set([
  ...PRODUCTION_BUILD_NON_SECRET_ENVIRONMENT_KEYS,
  ...LOCAL_SERVER_SECRET_ENVIRONMENT_KEYS,
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
  invalidationReason?: string;
  retryCount?: number;
  reuseStatus?: "new" | "reused";

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

type ProductionVerificationExecution = {
  buildId?: string;
  port?: number;
  server?: ProductionVerificationServer;
};

type ProductionVerificationRunAdapters = Pick<
  ProductionVerificationLifecycleAdapters,
  "acquireLock" | "now" | "report"
>;

async function executeProductionVerification<T>(
  input: Pick<ProductionVerificationInput, "signal">,
  adapters: ProductionVerificationRunAdapters,
  preflight: (execution: ProductionVerificationExecution) => Promise<void>,
  operation: (
    execution: ProductionVerificationExecution,
    runPhase: <V>(
      phase: Exclude<ProductionVerificationPhase, "cleanup" | "preflight">,
      action: () => Promise<V>,
    ) => Promise<V>,
  ) => Promise<T>,
): Promise<T> {
  const startedAt = adapters.now();
  const execution: ProductionVerificationExecution = {};
  let lock: ProductionVerificationLock | undefined;
  let result: T | undefined;
  let primaryFailure: ProductionVerificationError | undefined;

  const report = (
    phase: ProductionVerificationPhase,
    status: ProductionVerificationDiagnostic["status"],
    failure?: unknown,
  ): void => {
    adapters.report({
      buildId: execution.buildId,
      childExitReason: childExitReason(failure),
      elapsedMs: Math.max(0, adapters.now() - startedAt),
      phase,
      port: execution.port,
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
      const retryCount = (error as { retryCount?: unknown }).retryCount;
      if (typeof retryCount === "number") failure.retryCount = retryCount;
      if (
        error instanceof ProductionVerificationChildError ||
        error instanceof ProductionVerificationError
      ) {
        failure.cleanupFailure = error.cleanupFailure;
      }
      report(phase, "failed", failure);
      throw failure;
    }
  };

  try {
    await runPhase("preflight", async () => {
      lock = await adapters.acquireLock();
      await preflight(execution);
    });
    result = await operation(execution, runPhase);
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
    if (lock || primaryFailure?.cleanupFailure) {
      report("cleanup", "started");
      const cleanupFailures: Error[] = primaryFailure?.cleanupFailure
        ? [primaryFailure.cleanupFailure]
        : [];
      try {
        await execution.server?.stop();
      } catch (error) {
        cleanupFailures.push(asError(error));
      }
      try {
        await lock?.release();
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

export function buildReceiptedProductionArtifact(
  input: Pick<ProductionVerificationInput, "signal">,
  adapters: Pick<
    ProductionVerificationAdapters,
    "acquireLock" | "build" | "now" | "report"
  > &
    Pick<
      ProductionArtifactReceiptAdapters,
      "readCommitSha" | "removeReceipt" | "writeReceipt"
    >,
): Promise<ProductionArtifactReceipt> {
  return executeProductionVerification(
    input,
    adapters,
    async () => {},
    (execution, runPhase) =>
      runPhase("production-build", async () => {
        await adapters.removeReceipt();
        const { buildId } = await adapters.build({ signal: input.signal });
        execution.buildId = buildId;
        const commitSha = await adapters.readCommitSha();
        if (!isCommitSha(commitSha)) {
          throw new Error(
            "Production verification could not resolve the current commit SHA.",
          );
        }
        const receipt = { buildId, commitSha };
        await adapters.writeReceipt(receipt);
        return receipt;
      }),
  );
}

async function verifyProductionArtifact(
  input: ProductionVerificationInput,
  adapters: ProductionVerificationLifecycleAdapters,
  prepareArtifact: (
    runPhase: <T>(
      phase: "artifact-validation" | "production-build",
      action: () => Promise<T>,
    ) => Promise<T>,
    setBuildId: (buildId: string) => void,
  ) => Promise<{ buildId: string }>,
): Promise<ProductionVerificationResult> {
  return executeProductionVerification(
    input,
    adapters,
    async (execution) => {
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
      execution.port =
        parsedPort ?? (await adapters.selectFreePort(LOOPBACK_HOST));
    },
    async (execution, runPhase) => {
      const artifact = await prepareArtifact(
        runPhase,
        (buildId) => {
          execution.buildId = buildId;
        },
      );
      execution.buildId = artifact.buildId;
      const baseURL = `http://${LOOPBACK_HOST}:${execution.port!}`;
      await runPhase("server-start-and-identity", async () => {
        execution.server = await adapters.startServer({
          host: LOOPBACK_HOST,
          port: execution.port!,
        });
        await adapters.waitForBuildIdentity({
          baseURL,
          buildId: execution.buildId!,
          server: execution.server,
          signal: input.signal,
          timeoutMs: input.readinessTimeoutMs ?? DEFAULT_READINESS_TIMEOUT_MS,
        });
      });
      const browserResult = await runPhase("browser-test", () =>
        adapters.runBrowserTests({
          baseURL,
          selection: input.browserSelection,
          signal: input.signal,
        }),
      );
      return {
        baseURL,
        buildId: execution.buildId!,
        port: execution.port!,
        ...(browserResult ? { retries: browserResult.retries } : {}),
      };
    },
  );
}

export function verifyFreshProductionArtifact(
  input: ProductionVerificationInput,
  adapters: ProductionVerificationAdapters,
): Promise<ProductionVerificationResult> {
  return verifyProductionArtifact(input, adapters, (runPhase, setBuildId) =>
    runPhase("production-build", async () => {
      const artifact = await adapters.build({ signal: input.signal });
      setBuildId(artifact.buildId);
      return artifact;
    }),
  );
}

export function verifyReceiptedProductionArtifact(
  input: ProductionVerificationInput,
  adapters: ReceiptedProductionVerificationAdapters,
): Promise<ProductionVerificationResult> {
  return verifyProductionArtifact(
    input,
    adapters,
    (runPhase, setBuildId) =>
      runPhase("artifact-validation", async () => {
        const artifact = await readValidatedProductionArtifact(adapters);
        setBuildId(artifact.buildId);
        return artifact;
      }),
  );
}

function parseReusableProductionBuildReceipt(
  storedReceipt: { contents: string; modifiedAtMs: number },
): ReusableProductionBuildReceipt | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(storedReceipt.contents);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return undefined;
  }
  if (
    Object.keys(parsed).sort().join(",") !==
    "buildId,categories,version,worktreeId"
  ) {
    return undefined;
  }
  const receipt = parsed as Partial<ReusableProductionBuildReceipt>;
  if (
    receipt.version !== 1 ||
    typeof receipt.buildId !== "string" ||
    receipt.buildId.length === 0 ||
    typeof receipt.worktreeId !== "string" ||
    receipt.worktreeId.length === 0 ||
    typeof receipt.categories !== "object" ||
    receipt.categories === null
  ) {
    return undefined;
  }
  if (
    Object.keys(receipt.categories).sort().join(",") !==
    [...PRODUCTION_BUILD_REUSE_CATEGORIES].sort().join(",")
  ) {
    return undefined;
  }
  if (
    PRODUCTION_BUILD_REUSE_CATEGORIES.some(
      (category) => typeof receipt.categories![category] !== "string",
    )
  ) {
    return undefined;
  }
  return receipt as ReusableProductionBuildReceipt;
}

function productionBuildReuseInputsMatch(
  left: ProductionBuildReuseInput,
  right: ProductionBuildReuseInput,
): boolean {
  return (
    left.worktreeId === right.worktreeId &&
    PRODUCTION_BUILD_REUSE_CATEGORIES.every(
      (category) => left.categories[category] === right.categories[category],
    )
  );
}

export async function verifyReusableProductionArtifact(
  input: ProductionVerificationInput,
  adapters: NodeProductionVerificationAdapters,
): Promise<ReusableProductionVerificationResult> {
  let reuseStatus: ReusableProductionVerificationResult["reuseStatus"] = "new";
  let invalidationReason = "no receipt";
  let reuseDecisionMade = false;
  try {
    const result = await verifyProductionArtifact(input, adapters, async (
      runPhase,
      setBuildId,
    ) => {
      const currentInput = await adapters.readBuildReuseInput();
      const storedReceipt = await adapters.readReusableBuildReceipt();
      reuseDecisionMade = true;
      const receipt = storedReceipt
        ? parseReusableProductionBuildReceipt(storedReceipt)
        : undefined;

      if (storedReceipt && !receipt) invalidationReason = "receipt malformed";
      if (receipt) {
        const artifact = await adapters.readArtifact().catch(() => undefined);
        const changedCategory = PRODUCTION_BUILD_REUSE_CATEGORIES.find(
          (category) =>
            receipt.categories[category] !== currentInput.categories[category],
        );
        if (
          artifact &&
          storedReceipt!.modifiedAtMs >= artifact.modifiedAtMs &&
          receipt.buildId === artifact.buildId &&
          receipt.worktreeId === currentInput.worktreeId &&
          changedCategory === undefined
        ) {
          reuseStatus = "reused";
          invalidationReason = "inputs match";
          return runPhase("artifact-validation", async () => {
            setBuildId(artifact.buildId);
            return { buildId: artifact.buildId };
          });
        }
        if (!artifact) invalidationReason = "artifact missing";
        else if (storedReceipt!.modifiedAtMs < artifact.modifiedAtMs) {
          invalidationReason = "receipt stale";
        } else if (receipt.buildId !== artifact.buildId) {
          invalidationReason = "artifact identity changed";
        } else if (receipt.worktreeId !== currentInput.worktreeId) {
          invalidationReason = "worktree identity changed";
        } else if (changedCategory) {
          invalidationReason = `${changedCategory} changed`;
        }
      }

      return runPhase("production-build", async () => {
        await adapters.removeReusableBuildReceipt();
        const artifact = await adapters.build({ signal: input.signal });
        setBuildId(artifact.buildId);
        const completedInput = await adapters.readBuildReuseInput();
        if (!productionBuildReuseInputsMatch(currentInput, completedInput)) {
          throw new Error(
            "Production build inputs changed while the build was running.",
          );
        }
        await adapters.writeReusableBuildReceipt({
          ...completedInput,
          buildId: artifact.buildId,
          version: 1,
        });
        return artifact;
      });
    });

    return { ...result, invalidationReason, reuseStatus };
  } catch (error) {
    if (error instanceof ProductionVerificationError && reuseDecisionMade) {
      error.invalidationReason = invalidationReason;
      error.reuseStatus = reuseStatus;
    }
    throw error;
  }
}
