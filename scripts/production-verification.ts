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
const LOCAL_PROCESS_CONTROL_KEYS = new Set([
  "CI",
  "MEI_PELLE_VERIFICATION_ADAPTER",
  "MEI_PELLE_VERIFICATION_BASE_URL",
  "NODE_ENV",
  "PLAYWRIGHT_HTML_OPEN",
  "PORT",
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
  const localApplicationEnvironment = Object.fromEntries(
    Object.entries(input.local).filter(
      ([key]) => !LOCAL_PROCESS_CONTROL_KEYS.has(key),
    ),
  );

  return {
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
