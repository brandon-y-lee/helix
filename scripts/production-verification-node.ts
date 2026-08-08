import { execFile, spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  link,
  open,
  readFile,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { parse } from "dotenv";
import { BROWSER_VERIFICATION_PLAN } from "./browser-verification-plan";
import {
  prepareProductionVerificationEnvironment,
  ProductionVerificationChildError,
  ProductionVerificationCleanupError,
  ProductionVerificationError,
  type ProductionArtifactReceipt,
  type ProductionVerificationChildExit,
  type ProductionVerificationDiagnostic,
  type ProductionVerificationLock,
  type ProductionVerificationServer,
  type NodeProductionVerificationAdapters,
} from "./production-verification";

const CHECKOUT_LOCK_NAME = ".mei-pelle-production-verification.lock";
const CHECKOUT_LOCK_RECOVERY_NAME = `${CHECKOUT_LOCK_NAME}.recovery`;
const DEFAULT_CLEANUP_GRACE_MS = 5_000;
const READINESS_POLL_MS = 250;
const WINDOWS_CONTROL_TIMEOUT_MS = 2_000;
const PRODUCTION_ARTIFACT_RECEIPT_PATH = ".next/mei-pelle-artifact-receipt.json";
const WINDOWS_SUPERVISOR_PATH = resolve(
  process.cwd(),
  "scripts/production-verification-windows.ps1",
);
const execFileAsync = promisify(execFile);

export type OwnedProcess = ProductionVerificationServer & {
  pid: number;
};

export type OwnedCommandInput = {
  args: string[];
  command: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  label: string;
  signal?: AbortSignal;
  stdio?: "ignore" | "inherit";
};

type NodeProductionVerificationDependencies = {
  runCommand?: (input: OwnedCommandInput) => Promise<void>;
};

type ProcessTreeControl = {
  exited: Promise<void>;
  forceStop: () => Promise<void>;
  isRunning?: () => boolean;
  requestStop: () => Promise<void>;
};

type StopProcessTreeOptions = {
  gracePeriodMs?: number;
  wait?: (milliseconds: number) => Promise<void>;
};

const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));

export async function stopProcessTree(
  control: ProcessTreeControl,
  options: StopProcessTreeOptions = {},
): Promise<void> {
  let gracefulRequest: Promise<void>;
  try {
    gracefulRequest = control.requestStop().catch(() => {});
  } catch {
    gracefulRequest = Promise.resolve();
  }
  const gracePeriod = (options.wait ?? wait)(
    options.gracePeriodMs ?? DEFAULT_CLEANUP_GRACE_MS,
  );
  await Promise.race([gracefulRequest, gracePeriod]);
  const rootExitedDuringGrace = await Promise.race([
    control.exited.then(() => true),
    gracePeriod.then(() => false),
  ]);
  if (control.isRunning?.() === false) return;
  if (rootExitedDuringGrace && control.isRunning === undefined) return;

  await gracePeriod;
  if (control.isRunning?.() === false) return;

  await control.forceStop();
  if (control.isRunning?.() === true) {
    throw new Error("Production verification process tree remained alive after forced cleanup.");
  }
}

function childExitReason(code: number | null, signal: NodeJS.Signals | null): string {
  if (signal) return `signal ${signal}`;
  return `exit code ${code ?? "unknown"}`;
}

function waitForSpawn(child: ChildProcess): Promise<void> {
  return new Promise((resolveSpawn, rejectSpawn) => {
    child.once("spawn", resolveSpawn);
    child.once("error", rejectSpawn);
  });
}

function ignoreMissingProcess(error: unknown): void {
  const code = (error as NodeJS.ErrnoException).code;
  if (code !== "ESRCH") throw error;
}

function runTaskkill(pid: number, force: boolean): Promise<void> {
  return new Promise((resolveTaskkill, rejectTaskkill) => {
    let settled = false;
    const args = ["/pid", String(pid), "/t"];
    if (force) args.push("/f");
    const taskkill = spawn("taskkill", args, {
      stdio: "ignore",
      windowsHide: true,
    });
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      taskkill.kill("SIGKILL");
      rejectTaskkill(new Error("taskkill exceeded its 2-second control limit."));
    }, WINDOWS_CONTROL_TIMEOUT_MS);
    taskkill.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      rejectTaskkill(error);
    });
    taskkill.once("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code === 0 || code === 128) resolveTaskkill();
      else {
        rejectTaskkill(
          new Error(`taskkill failed with exit code ${code ?? "unknown"}.`),
        );
      }
    });
  });
}

function windowsJobPayload(input: {
  args: string[];
  command: string;
  controlPath: string;
  statusPath: string;
}): string {
  return Buffer.from(JSON.stringify(input), "utf8").toString("base64");
}

async function readWindowsTargetExit(
  statusPath: string,
  supervisor: ChildProcess,
  supervisorExited: Promise<ProductionVerificationChildExit>,
): Promise<ProductionVerificationChildExit> {
  while (true) {
    try {
      const rawCode = (await readFile(statusPath, "utf8")).trim();
      if (!/^\d+$/.test(rawCode)) {
        throw new Error("Windows verification supervisor wrote an invalid exit status.");
      }
      await unlink(statusPath);
      const code = Number(rawCode);
      return { code, reason: childExitReason(code, null), signal: null };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    if (supervisor.exitCode !== null || supervisor.signalCode !== null) {
      return supervisorExited;
    }
    await wait(25);
  }
}

export async function spawnOwnedProcess(
  input: Omit<OwnedCommandInput, "label" | "signal">,
): Promise<OwnedProcess> {
  const windows = process.platform === "win32";
  const controlPath = resolve(
    tmpdir(),
    `mei-pelle-verification-control-${process.pid}-${randomUUID()}`,
  );
  const statusPath = resolve(
    tmpdir(),
    `mei-pelle-verification-status-${process.pid}-${randomUUID()}`,
  );
  const child = spawn(
    windows ? "powershell.exe" : input.command,
    windows
      ? [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          WINDOWS_SUPERVISOR_PATH,
          "-Payload",
          windowsJobPayload({
            args: input.args,
            command: input.command,
            controlPath,
            statusPath,
          }),
        ]
      : input.args,
    {
      cwd: input.cwd,
      detached: !windows,
      env: input.env,
      stdio: windows
        ? [
            "pipe",
            input.stdio === "ignore" ? "ignore" : "inherit",
            input.stdio === "ignore" ? "ignore" : "inherit",
          ]
        : (input.stdio ?? "inherit"),
      windowsHide: true,
    },
  );
  const supervisorExited = new Promise<ProductionVerificationChildExit>((resolveExit) => {
    child.once("exit", (code, signal) => {
      resolveExit({ code, reason: childExitReason(code, signal), signal });
    });
  });
  await waitForSpawn(child);
  if (child.pid === undefined) {
    throw new Error("Production verification child process started without a PID.");
  }

  const pid = child.pid;
  const exited = windows
    ? readWindowsTargetExit(statusPath, child, supervisorExited)
    : supervisorExited;
  const ownedTreeExited = supervisorExited.then(() => undefined);
  const isRunning = () => {
    if (windows) return isProcessAlive(pid);
    try {
      process.kill(-pid, 0);
      return true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ESRCH") return false;
      if (code === "EPERM") return true;
      throw error;
    }
  };

  const waitForTreeExit = async (): Promise<void> => {
    const deadline = Date.now() + 1_000;
    while (isRunning() && Date.now() < deadline) await wait(25);
  };

  return {
    exited,
    pid,
    stop: async () => {
      try {
        await stopProcessTree({
          exited: ownedTreeExited,
          forceStop: async () => {
            if (windows) {
              if (isProcessAlive(pid)) {
                try {
                  await runTaskkill(pid, true);
                } catch (taskkillFailure) {
                  try {
                    process.kill(pid, "SIGKILL");
                  } catch (error) {
                    if (isProcessAlive(pid)) {
                      throw new Error(
                        `Windows force-stop failed: ${(taskkillFailure as Error).message}; ${(error as Error).message}`,
                      );
                    }
                  }
                }
              }
            } else if (isRunning()) {
              try {
                process.kill(-pid, "SIGKILL");
              } catch (error) {
                ignoreMissingProcess(error);
              }
            }
            await waitForTreeExit();
          },
          isRunning,
          requestStop: async () => {
            if (windows) {
              if (isProcessAlive(pid)) await writeFile(controlPath, "graceful\n");
            } else if (isRunning()) {
              try {
                process.kill(-pid, "SIGTERM");
              } catch (error) {
                ignoreMissingProcess(error);
              }
            }
          },
        });
      } finally {
        await Promise.all(
          [controlPath, statusPath].map(async (path) => {
            try {
              await unlink(path);
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
            }
          }),
        );
      }
    },
  };
}

export async function runOwnedCommand(input: OwnedCommandInput): Promise<void> {
  const child = await spawnOwnedProcess(input);
  let primaryFailure: Error | undefined;

  try {
    const exit = await Promise.race([child.exited, abortPromise(input.signal)]);
    if (exit.code !== 0 || exit.signal !== null) {
      primaryFailure = new ProductionVerificationChildError(
        `${input.label} failed after ${exit.reason}.`,
        exit.reason,
      );
    }
  } catch (error) {
    if (input.signal?.aborted) {
      const reason = input.signal.reason;
      primaryFailure = new ProductionVerificationChildError(
        reason instanceof Error ? reason.message : `${input.label} was interrupted.`,
        "interrupted",
        { cause: error },
      );
    } else {
      primaryFailure = error instanceof Error ? error : new Error(String(error));
    }
  }

  let cleanupFailure: Error | undefined;
  try {
    await child.stop();
  } catch (error) {
    cleanupFailure = error instanceof Error ? error : new Error(String(error));
  }

  if (primaryFailure) {
    if (primaryFailure instanceof ProductionVerificationChildError) {
      primaryFailure.cleanupFailure = cleanupFailure;
    }
    throw primaryFailure;
  }
  if (cleanupFailure) {
    throw new ProductionVerificationCleanupError(
      `${input.label} cleanup failed: ${cleanupFailure.message}`,
      cleanupFailure,
      { cause: cleanupFailure },
    );
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "EPERM";
  }
}

export async function acquireCheckoutLock(input: {
  cwd: string;
  pid?: number;
}): Promise<ProductionVerificationLock> {
  const lockPath = resolve(input.cwd, CHECKOUT_LOCK_NAME);
  const recoveryPath = resolve(input.cwd, CHECKOUT_LOCK_RECOVERY_NAME);
  const ownerPid = input.pid ?? process.pid;
  const ownerRecord = `${ownerPid}:${randomUUID()}\n`;
  let ownsRecovery = false;

  const asError = (error: unknown): Error =>
    error instanceof Error ? error : new Error(String(error));

  const attachCleanupFailures = (
    primary: unknown,
    cleanupFailures: unknown[],
  ): Error => {
    const primaryFailure = asError(primary);
    const inheritedCleanup =
      primary instanceof ProductionVerificationCleanupError
        ? primary.cleanupFailure
        : primary instanceof ProductionVerificationError
          ? primary.cleanupFailure
          : undefined;
    const failures = [
      ...(inheritedCleanup ? [inheritedCleanup] : []),
      ...cleanupFailures.map(asError),
    ];
    const cleanupFailure = new Error(
      failures.map((failure) => failure.message).join("; "),
      { cause: failures[0] },
    );
    if (primary instanceof ProductionVerificationCleanupError) {
      return new ProductionVerificationCleanupError(
        primary.message,
        cleanupFailure,
        { cause: primary },
      );
    }
    const failure =
      primary instanceof ProductionVerificationError
        ? primary
        : new ProductionVerificationError(
            "preflight",
            primaryFailure.message,
            undefined,
            { cause: primaryFailure },
          );
    failure.cleanupFailure = cleanupFailure;
    return failure;
  };

  const readRecord = async (path: string): Promise<string | undefined> => {
    try {
      return await readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  };

  const recordOwnerPid = (record: string): number | undefined => {
    const ownerMatch = /^(\d+)(?::|$)/.exec(record.trim());
    return ownerMatch ? Number(ownerMatch[1]) : undefined;
  };

  const writeExclusiveRecord = async (path: string): Promise<void> => {
    const candidatePath = `${path}.candidate-${ownerPid}-${randomUUID()}`;
    const handle = await open(candidatePath, "wx");
    let primaryFailure: unknown;
    try {
      await handle.writeFile(ownerRecord);
    } catch (error) {
      primaryFailure = error;
    }
    try {
      await handle.close();
    } catch (cleanupError) {
      if (primaryFailure === undefined) {
        const failure = asError(cleanupError);
        primaryFailure = new ProductionVerificationCleanupError(
          `Production verification lock candidate handle cleanup failed: ${failure.message}`,
          failure,
          { cause: failure },
        );
      } else {
        primaryFailure = attachCleanupFailures(primaryFailure, [cleanupError]);
      }
    }
    if (primaryFailure === undefined) {
      try {
        await link(candidatePath, path);
      } catch (error) {
        primaryFailure = error;
      }
    }
    try {
      await unlink(candidatePath);
    } catch (cleanupError) {
      if (primaryFailure !== undefined) {
        throw attachCleanupFailures(primaryFailure, [cleanupError]);
      }
      const failure = asError(cleanupError);
      throw new ProductionVerificationCleanupError(
        `Production verification lock candidate cleanup failed: ${failure.message}`,
        failure,
        { cause: failure },
      );
    }
    if (primaryFailure !== undefined) throw primaryFailure;
  };

  const releaseOwnerRecord = async () => {
    try {
      if ((await readFile(lockPath, "utf8")) === ownerRecord) {
        await unlink(lockPath);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  };

  const releaseRecovery = async () => {
    if (!ownsRecovery) return;
    try {
      if ((await readFile(recoveryPath, "utf8")) === ownerRecord) {
        await unlink(recoveryPath);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    ownsRecovery = false;
  };

  const stillOwnsRecovery = async (): Promise<boolean> => {
    if (!ownsRecovery) return false;
    if ((await readRecord(recoveryPath)) === ownerRecord) return true;
    ownsRecovery = false;
    return false;
  };

  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (!ownsRecovery) {
      const recoveryRecord = await readRecord(recoveryPath);
      if (recoveryRecord !== undefined) {
        const recoveryOwner = recordOwnerPid(recoveryRecord);
        if (recoveryOwner !== undefined && isProcessAlive(recoveryOwner)) {
          await wait(10);
          continue;
        }
        if ((await readRecord(recoveryPath)) === recoveryRecord) {
          try {
            await unlink(recoveryPath);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          }
        }
        continue;
      }
    }

    let acquiredOwnerRecord = false;
    try {
      await writeExclusiveRecord(lockPath);
      acquiredOwnerRecord = true;
      await releaseRecovery();

      return {
        release: releaseOwnerRecord,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        const cleanupFailures: unknown[] = [];
        if (!acquiredOwnerRecord) {
          acquiredOwnerRecord = (await readRecord(lockPath)) === ownerRecord;
        }
        if (acquiredOwnerRecord) {
          try {
            await releaseOwnerRecord();
          } catch (cleanupError) {
            cleanupFailures.push(cleanupError);
          }
        }
        try {
          await releaseRecovery();
        } catch (cleanupError) {
          cleanupFailures.push(cleanupError);
        }
        if (cleanupFailures.length > 0) {
          throw attachCleanupFailures(error, cleanupFailures);
        }
        throw error;
      }

      const existingRecord = await readRecord(lockPath);
      if (existingRecord === undefined) continue;
      const existingOwner = recordOwnerPid(existingRecord);

      if (existingOwner !== undefined && isProcessAlive(existingOwner)) {
        await releaseRecovery();
        throw new Error(
          `Production verification is already owned by live process ${existingOwner}.`,
        );
      }

      if (!ownsRecovery) {
        try {
          await writeExclusiveRecord(recoveryPath);
          ownsRecovery = true;
        } catch (recoveryError) {
          if ((recoveryError as NodeJS.ErrnoException).code !== "EEXIST") {
            ownsRecovery =
              (await readRecord(recoveryPath)) === ownerRecord;
            if (ownsRecovery) {
              try {
                await releaseRecovery();
              } catch (cleanupError) {
                throw attachCleanupFailures(recoveryError, [cleanupError]);
              }
            }
            throw recoveryError;
          }
          await wait(10);
        }
        continue;
      }

      if (!(await stillOwnsRecovery())) continue;
      if ((await readRecord(lockPath)) !== existingRecord) continue;
      try {
        await unlink(lockPath);
      } catch (unlinkError) {
        if ((unlinkError as NodeJS.ErrnoException).code !== "ENOENT") {
          throw unlinkError;
        }
      }
      if (!(await stillOwnsRecovery())) continue;
    }
  }

  await releaseRecovery();
  throw new Error("Production verification stale-lock recovery did not settle.");
}

function abortPromise(signal?: AbortSignal): Promise<never> {
  if (!signal) return new Promise(() => {});
  return new Promise((_, reject) => {
    const rejectForAbort = () => {
      const reason = signal.reason;
      reject(
        reason instanceof Error
          ? reason
          : new Error(
              typeof reason === "string" && reason.length > 0
                ? reason
                : "Production verification was interrupted.",
            ),
      );
    };
    if (signal.aborted) rejectForAbort();
    else signal.addEventListener("abort", rejectForAbort, { once: true });
  });
}

export async function waitForExpectedBuild(input: {
  baseURL: string;
  buildId: string;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  server: ProductionVerificationServer;
  signal?: AbortSignal;
  sleep?: (milliseconds: number) => Promise<void>;
  timeoutMs: number;
}): Promise<void> {
  const fetchIdentity = input.fetch ?? globalThis.fetch;
  const now = input.now ?? Date.now;
  const sleep = input.sleep ?? wait;
  const deadline = now() + input.timeoutMs;
  const serverExit = input.server.exited.then((exit) => {
    throw new ProductionVerificationChildError(
      "Production server exited before exposing the expected build.",
      exit.reason,
    );
  });
  const interrupted = abortPromise(input.signal);
  const identityURL = `${input.baseURL}/_next/static/${encodeURIComponent(
    input.buildId,
  )}/_buildManifest.js`;

  while (now() < deadline) {
    try {
      const response = await Promise.race([
        fetchIdentity(identityURL, { cache: "no-store", redirect: "manual" }),
        serverExit,
        interrupted,
      ]);
      await response.body?.cancel();
      if (response.status === 200) return;
      throw new Error(
        `Running server does not expose expected build ${input.buildId} (HTTP ${response.status}).`,
      );
    } catch (error) {
      if (
        error instanceof ProductionVerificationChildError ||
        (input.signal?.aborted ?? false) ||
        (error instanceof Error && error.message.startsWith("Running server"))
      ) {
        throw error;
      }
      await Promise.race([sleep(READINESS_POLL_MS), serverExit, interrupted]);
    }
  }

  throw new Error(
    `Production server did not expose build ${input.buildId} within ${input.timeoutMs / 1_000} seconds.`,
  );
}

function safeField(value: string): string {
  return value.replace(/[\r\n\t]+/g, " ").trim();
}

export function formatProductionVerificationDiagnostic(
  diagnostic: ProductionVerificationDiagnostic,
): string {
  return [
    "[production-verification]",
    `phase=${diagnostic.phase}`,
    `status=${diagnostic.status}`,
    `elapsed=${(diagnostic.elapsedMs / 1_000).toFixed(3)}s`,
    `port=${diagnostic.port ?? "unselected"}`,
    `expectedBuildId=${safeField(diagnostic.buildId ?? "unknown")}`,
    `childExit=${safeField(diagnostic.childExitReason ?? "none")}`,
  ].join(" ");
}

export async function readProductionVerificationEnvironment(
  cwd: string,
  ambient: Partial<NodeJS.ProcessEnv> = process.env,
): Promise<NodeJS.ProcessEnv> {
  let local: Record<string, string> = {};
  try {
    local = parse(await readFile(resolve(cwd, ".env.local"), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  return prepareProductionVerificationEnvironment({ ambient, local });
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

function isPortAvailable(input: { host: string; port: number }): Promise<boolean> {
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

async function readBuildArtifact(cwd: string): Promise<{
  buildId: string;
  modifiedAtMs: number;
}> {
  const buildIdPath = resolve(cwd, ".next/BUILD_ID");
  const [contents, metadata] = await Promise.all([
    readFile(buildIdPath, "utf8"),
    stat(buildIdPath),
  ]);
  const buildId = contents.trim();
  if (!buildId) {
    throw new Error("Production artifact does not contain a Next.js build ID.");
  }
  return { buildId, modifiedAtMs: metadata.mtimeMs };
}

async function readCurrentCommitSha(cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
    cwd,
    encoding: "utf8",
  });
  return String(stdout).trim();
}

export async function createNodeProductionVerificationAdapters(
  cwd: string,
  env: NodeJS.ProcessEnv,
  dependencies: NodeProductionVerificationDependencies = {},
): Promise<NodeProductionVerificationAdapters> {
  const require = createRequire(import.meta.url);
  const nextCli = require.resolve("next/dist/bin/next");
  const playwrightCli = require.resolve("@playwright/test/cli");
  const receiptPath = resolve(cwd, PRODUCTION_ARTIFACT_RECEIPT_PATH);
  const executeOwnedCommand = dependencies.runCommand ?? runOwnedCommand;

  return {
    acquireLock: () => acquireCheckoutLock({ cwd }),
    now: Date.now,
    report: (diagnostic) => {
      console.log(formatProductionVerificationDiagnostic(diagnostic));
    },
    selectFreePort,
    isPortAvailable,
    build: async ({ signal }) => {
      await executeOwnedCommand({
        args: [nextCli, "build"],
        command: process.execPath,
        cwd,
        env,
        label: "Production build",
        signal,
      });
      const { buildId } = await readBuildArtifact(cwd);
      return { buildId };
    },
    readArtifact: () => readBuildArtifact(cwd),
    readCommitSha: () => readCurrentCommitSha(cwd),
    readReceipt: async () => {
      try {
        const [contents, metadata] = await Promise.all([
          readFile(receiptPath, "utf8"),
          stat(receiptPath),
        ]);
        return { contents, modifiedAtMs: metadata.mtimeMs };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
        throw error;
      }
    },
    removeReceipt: async () => {
      try {
        await unlink(receiptPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    },
    writeReceipt: (receipt: ProductionArtifactReceipt) =>
      writeFile(receiptPath, `${JSON.stringify(receipt)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      }),
    startServer: ({ host, port }) =>
      spawnOwnedProcess({
        args: [nextCli, "start", "--hostname", host, "--port", String(port)],
        command: process.execPath,
        cwd,
        env,
      }),
    waitForBuildIdentity: waitForExpectedBuild,
    runBrowserTests: async ({ baseURL, selection, signal }) => {
      const runPlaywright = (
        project: "chromium" | "webkit" | undefined,
        journeyIds: readonly string[] | undefined,
      ) => {
        const testFiles = journeyIds?.map((journeyId) => {
          const journey = BROWSER_VERIFICATION_PLAN.journeys.find(
            (candidate) => candidate.id === journeyId,
          );
          if (!journey) {
            throw new Error(`Unknown browser journey "${journeyId}".`);
          }
          return journey.testFile;
        });
        return executeOwnedCommand({
          args: [
            playwrightCli,
            "test",
            ...(testFiles ?? []),
            ...(project ? ["--project", project] : []),
            ...(selection?.retries === undefined
              ? []
              : ["--retries", String(selection.retries)]),
          ],
          command: process.execPath,
          cwd,
          env: {
            ...env,
            MEI_PELLE_VERIFICATION_ADAPTER: "1",
            MEI_PELLE_VERIFICATION_BASE_URL: baseURL,
            MEI_PELLE_VERIFICATION_PROJECT: project ?? "",
            PLAYWRIGHT_HTML_OPEN: "never",
          },
          label: `Playwright${project ? ` ${project}` : ""} browser tests`,
          signal,
        });
      };

      if (!selection) {
        await runPlaywright(undefined, undefined);
        return;
      }
      if (selection.projects.includes("chromium")) {
        await runPlaywright("chromium", selection.journeyIds);
      }
      if (selection.projects.includes("webkit")) {
        await runPlaywright("webkit", selection.webkitJourneyIds);
      }
    },
  };
}
