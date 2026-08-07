import { spawn, type ChildProcess } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { parse } from "dotenv";
import {
  prepareProductionVerificationEnvironment,
  verifyFreshProductionArtifact,
  type ProductionVerificationAdapters,
  type ProductionVerificationServer,
} from "./production-verification";

const IDENTITY_TIMEOUT_MS = 120_000;
const IDENTITY_POLL_MS = 250;

type CommandInput = {
  args: string[];
  command: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
};

function waitForExit(child: ChildProcess, label: string): Promise<void> {
  return new Promise((resolveExit, rejectExit) => {
    child.once("error", rejectExit);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolveExit();
        return;
      }
      rejectExit(
        new Error(
          `${label} failed${
            signal ? ` after signal ${signal}` : ` with exit code ${code ?? "unknown"}`
          }.`,
        ),
      );
    });
  });
}

function runCommand(input: CommandInput, label: string): Promise<void> {
  const child = spawn(input.command, input.args, {
    cwd: input.cwd,
    env: input.env,
    stdio: "inherit",
  });
  return waitForExit(child, label);
}

function waitForSpawn(child: ChildProcess): Promise<void> {
  return new Promise((resolveSpawn, rejectSpawn) => {
    child.once("spawn", resolveSpawn);
    child.once("error", rejectSpawn);
  });
}

async function stopServer(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;

  const exited = new Promise<void>((resolveExit) => {
    child.once("exit", () => resolveExit());
  });
  child.kill("SIGTERM");
  await exited;
}

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

async function waitForBuildIdentity(input: {
  baseURL: string;
  buildId: string;
}): Promise<void> {
  const identityURL = `${input.baseURL}/_next/static/${encodeURIComponent(
    input.buildId,
  )}/_buildManifest.js`;
  const deadline = Date.now() + IDENTITY_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(identityURL, {
        cache: "no-store",
        redirect: "manual",
      });
      await response.body?.cancel();
      if (response.status === 200) return;
      throw new Error(
        `Running server does not expose expected build ${input.buildId} (HTTP ${response.status}).`,
      );
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Running server")) {
        throw error;
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, IDENTITY_POLL_MS));
    }
  }

  throw new Error(
    `Production server did not expose build ${input.buildId} within 120 seconds.`,
  );
}

async function createNodeAdapters(
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<ProductionVerificationAdapters> {
  const require = createRequire(import.meta.url);
  const nextCli = require.resolve("next/dist/bin/next");
  const playwrightCli = require.resolve("@playwright/test/cli");

  return {
    selectFreePort,
    isPortAvailable,
    build: async () => {
      await runCommand(
        {
          args: [nextCli, "build"],
          command: process.execPath,
          cwd,
          env,
        },
        "Production build",
      );
      const buildId = (await readFile(resolve(cwd, ".next/BUILD_ID"), "utf8")).trim();
      if (!buildId) {
        throw new Error("Production build did not produce a Next.js build ID.");
      }
      return { buildId };
    },
    startServer: async ({ host, port }): Promise<ProductionVerificationServer> => {
      const child = spawn(
        process.execPath,
        [nextCli, "start", "--hostname", host, "--port", String(port)],
        { cwd, env, stdio: "inherit" },
      );
      await waitForSpawn(child);
      return { stop: () => stopServer(child) };
    },
    waitForBuildIdentity,
    runBrowserTests: ({ baseURL }) =>
      runCommand(
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
        },
        "Playwright browser tests",
      ),
  };
}

async function main(): Promise<void> {
  const cwd = process.cwd();
  const env = await readEnvironment(cwd);
  const adapters = await createNodeAdapters(cwd, env);
  const result = await verifyFreshProductionArtifact(
    { requestedPort: process.env.PORT },
    adapters,
  );
  console.log(
    `Production verification passed for build ${result.buildId} at ${result.baseURL}.`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Production verification failed.");
  process.exitCode = 1;
});
