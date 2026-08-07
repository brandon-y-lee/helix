import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { parse } from "dotenv";
import {
  prepareProductionVerificationEnvironment,
  ProductionVerificationError,
  verifyFreshProductionArtifact,
  type ProductionVerificationAdapters,
} from "./production-verification";
import {
  acquireCheckoutLock,
  formatProductionVerificationDiagnostic,
  runOwnedCommand,
  spawnOwnedProcess,
  waitForExpectedBuild,
} from "./production-verification-node";


async function readEnvironment(cwd: string): Promise<NodeJS.ProcessEnv> {
  let local: Record<string, string> = {};
  try {
    local = parse(await readFile(resolve(cwd, ".env.local"), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  return prepareProductionVerificationEnvironment({
    ambient: process.env,
    local,
  });
}

function selectFreePort(host: string): Promise<number> {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.unref();
    server.once("error", rejectPort);
    server.listen({ host, port: 0, exclusive: true }, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        rejectPort(new Error("Production verification could not select a port."));
        return;
      }
      server.close((error) => {
        if (error) rejectPort(error);
        else resolvePort(address.port);
      });
    });
  });
}

function isPortAvailable(input: {
  host: string;
  port: number;
}): Promise<boolean> {
  return new Promise((resolveAvailability, rejectAvailability) => {
    const server = createServer();
    server.unref();
    server.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") resolveAvailability(false);
      else rejectAvailability(error);
    });
    server.listen({ ...input, exclusive: true }, () => {
      server.close((error) => {
        if (error) rejectAvailability(error);
        else resolveAvailability(true);
      });
    });
  });
}

async function createNodeAdapters(
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<ProductionVerificationAdapters> {
  const require = createRequire(import.meta.url);
  const nextCli = require.resolve("next/dist/bin/next");
  const playwrightCli = require.resolve("@playwright/test/cli");

  return {
    acquireLock: () => acquireCheckoutLock({ cwd }),
    now: Date.now,
    report: (diagnostic) => {
      console.log(formatProductionVerificationDiagnostic(diagnostic));
    },
    selectFreePort,
    isPortAvailable,
    build: async ({ signal }) => {
      await runOwnedCommand(
        {
          args: [nextCli, "build"],
          command: process.execPath,
          cwd,
          env,
          label: "Production build",
          signal,
        },
      );
      const buildId = (await readFile(resolve(cwd, ".next/BUILD_ID"), "utf8")).trim();
      if (!buildId) {
        throw new Error("Production build did not produce a Next.js build ID.");
      }
      return { buildId };
    },
    startServer: ({ host, port }) =>
      spawnOwnedProcess({
        args: [nextCli, "start", "--hostname", host, "--port", String(port)],
        command: process.execPath,
        cwd,
        env,
      }),
    waitForBuildIdentity: waitForExpectedBuild,
    runBrowserTests: ({ baseURL, signal }) =>
      runOwnedCommand(
        {
          args: [playwrightCli, "test"],
          command: process.execPath,
          cwd,
          env: {
            ...env,
            MEI_PELLE_VERIFICATION_ADAPTER: "1",
            MEI_PELLE_VERIFICATION_BASE_URL: baseURL,
            PLAYWRIGHT_HTML_OPEN: "never",
          },
          label: "Playwright browser tests",
          signal,
        },
      ),
  };
}

async function main(): Promise<void> {
  const cwd = process.cwd();
  const env = await readEnvironment(cwd);
  const adapters = await createNodeAdapters(cwd, env);
  const controller = new AbortController();
  const interrupt = (signal: NodeJS.Signals) => {
    controller.abort(new Error(`Production verification interrupted by ${signal}.`));
  };
  const onSigint = () => interrupt("SIGINT");
  const onSigterm = () => interrupt("SIGTERM");
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);

  try {
    const result = await verifyFreshProductionArtifact(
      { requestedPort: process.env.PORT, signal: controller.signal },
      adapters,
    );
    console.log(
      `Production verification passed for build ${result.buildId} at ${result.baseURL}.`,
    );
  } finally {
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Production verification failed.");
  if (error instanceof ProductionVerificationError && error.cleanupFailure) {
    console.error(`Cleanup also failed: ${error.cleanupFailure.message}`);
  }
  process.exitCode = 1;
});
