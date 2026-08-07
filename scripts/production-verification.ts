export type ProductionVerificationServer = {
  stop: () => Promise<void>;
};

export type ProductionVerificationAdapters = {
  selectFreePort: (host: string) => Promise<number>;
  isPortAvailable: (input: { host: string; port: number }) => Promise<boolean>;
  build: () => Promise<{ buildId: string }>;
  startServer: (input: {
    host: string;
    port: number;
  }) => Promise<ProductionVerificationServer>;
  waitForBuildIdentity: (input: {
    baseURL: string;
    buildId: string;
  }) => Promise<void>;
  runBrowserTests: (input: { baseURL: string }) => Promise<void>;
};

export type ProductionVerificationResult = {
  baseURL: string;
  buildId: string;
  port: number;
};

export type ProductionVerificationInput = {
  requestedPort?: string;
};

const LOOPBACK_HOST = "127.0.0.1";
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

export async function verifyFreshProductionArtifact(
  input: ProductionVerificationInput,
  adapters: ProductionVerificationAdapters,
): Promise<ProductionVerificationResult> {
  const requestedPort = input.requestedPort;
  const parsedPort = requestedPort === undefined ? undefined : Number(requestedPort);
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

  const port = parsedPort ?? (await adapters.selectFreePort(LOOPBACK_HOST));
  const { buildId } = await adapters.build();
  const baseURL = `http://${LOOPBACK_HOST}:${port}`;
  const server = await adapters.startServer({ host: LOOPBACK_HOST, port });

  try {
    await adapters.waitForBuildIdentity({ baseURL, buildId });
    await adapters.runBrowserTests({ baseURL });
  } finally {
    await server.stop();
  }

  return { baseURL, buildId, port };
}
