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
