import { spawn, type ChildProcess, type StdioOptions } from "node:child_process";
import { randomUUID } from "node:crypto";
import { open, readFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import {
  ProductionVerificationChildError,
  type ProductionVerificationDiagnostic,
  type ProductionVerificationLock,
  type ProductionVerificationServer,
} from "./production-verification";

const CHECKOUT_LOCK_NAME = ".mei-pelle-production-verification.lock";
const DEFAULT_CLEANUP_GRACE_MS = 5_000;
const READINESS_POLL_MS = 250;

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
  stdio?: StdioOptions;
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
  await control.requestStop();
  const exitedGracefully = await Promise.race([
    control.exited.then(() => true),
    (options.wait ?? wait)(
      options.gracePeriodMs ?? DEFAULT_CLEANUP_GRACE_MS,
    ).then(() => false),
  ]);
  if (
    control.isRunning?.() === false ||
    (exitedGracefully && control.isRunning?.() !== true)
  ) {
    return;
  }

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
    const args = ["/pid", String(pid), "/t"];
    if (force) args.push("/f");
    const taskkill = spawn("taskkill", args, {
      stdio: "ignore",
      windowsHide: true,
    });
    taskkill.once("error", rejectTaskkill);
    taskkill.once("exit", (code) => {
      if (code === 0 || code === 128) resolveTaskkill();
      else rejectTaskkill(new Error(`taskkill failed with exit code ${code ?? "unknown"}.`));
    });
  });
}

export async function spawnOwnedProcess(
  input: Omit<OwnedCommandInput, "label" | "signal">,
): Promise<OwnedProcess> {
  const windows = process.platform === "win32";
  const child = spawn(input.command, input.args, {
    cwd: input.cwd,
    detached: !windows,
    env: input.env,
    stdio: input.stdio ?? "inherit",
    windowsHide: true,
  });
  const exited = new Promise<{ reason: string }>((resolveExit) => {
    child.once("exit", (code, signal) => {
      resolveExit({ reason: childExitReason(code, signal) });
    });
  });
  await waitForSpawn(child);
  if (child.pid === undefined) {
    throw new Error("Production verification child process started without a PID.");
  }

  const pid = child.pid;
  const exitedWithoutReason = exited.then(() => undefined);
  const isRunning = () => {
    if (windows) return child.exitCode === null && child.signalCode === null;
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
    stop: () =>
      stopProcessTree({
        exited: exitedWithoutReason,
        forceStop: async () => {
          if (!isRunning()) return;
          if (windows) await runTaskkill(pid, true);
          else {
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
          if (!isRunning()) return;
          if (windows) await runTaskkill(pid, false);
          else {
            try {
              process.kill(-pid, "SIGTERM");
            } catch (error) {
              ignoreMissingProcess(error);
            }
          }
        },
      }),
  };
}

export async function runOwnedCommand(input: OwnedCommandInput): Promise<void> {
  const child = await spawnOwnedProcess(input);
  const interrupted = abortPromise(input.signal).then(() => undefined);

  try {
    const outcome = await Promise.race([
      child.exited.then((exit) => ({ kind: "exit" as const, exit })),
      interrupted.then(() => ({ kind: "abort" as const })),
    ]);
    if (outcome.kind === "abort") {
      await child.stop();
      throw new ProductionVerificationChildError(
        `${input.label} was interrupted.`,
        "interrupted",
      );
    }
    await child.stop();
    if (outcome.exit.reason !== "exit code 0") {
      throw new ProductionVerificationChildError(
        `${input.label} failed after ${outcome.exit.reason}.`,
        outcome.exit.reason,
      );
    }
  } catch (error) {
    if (input.signal?.aborted && child.pid) {
      await child.stop();
      const reason = input.signal.reason;
      throw new ProductionVerificationChildError(
        reason instanceof Error ? reason.message : `${input.label} was interrupted.`,
        "interrupted",
        { cause: error },
      );
    }
    throw error;
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
  const ownerPid = input.pid ?? process.pid;
  const ownerRecord = `${ownerPid}:${randomUUID()}\n`;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const handle = await open(lockPath, "wx");
      try {
        await handle.writeFile(ownerRecord);
      } finally {
        await handle.close();
      }

      return {
        release: async () => {
          let currentOwner: string;
          try {
            currentOwner = await readFile(lockPath, "utf8");
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
            throw error;
          }
          if (currentOwner !== ownerRecord) return;
          await unlink(lockPath);
        },
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;

      let existingOwner: number | undefined;
      try {
        const rawOwner = (await readFile(lockPath, "utf8")).trim();
        const ownerMatch = /^(\d+)(?::|$)/.exec(rawOwner);
        if (ownerMatch) existingOwner = Number(ownerMatch[1]);
      } catch (readError) {
        if ((readError as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw readError;
      }

      if (existingOwner !== undefined && isProcessAlive(existingOwner)) {
        throw new Error(
          `Production verification is already owned by live process ${existingOwner}.`,
        );
      }

      try {
        await unlink(lockPath);
      } catch (unlinkError) {
        if ((unlinkError as NodeJS.ErrnoException).code !== "ENOENT") {
          throw unlinkError;
        }
      }
    }
  }

  throw new Error("Production verification could not acquire the checkout lock.");
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
