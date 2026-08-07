import { spawn, type ChildProcess, type StdioOptions } from "node:child_process";
import { randomUUID } from "node:crypto";
import { open, readFile, readdir, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import {
  ProductionVerificationChildError,
  type ProductionVerificationChildExit,
  type ProductionVerificationDiagnostic,
  type ProductionVerificationLock,
  type ProductionVerificationServer,
} from "./production-verification";

const CHECKOUT_LOCK_NAME = ".mei-pelle-production-verification.lock";
const CHECKOUT_LOCK_RECOVERY_PREFIX = `${CHECKOUT_LOCK_NAME}.recovery-`;
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
  try {
    await control.requestStop();
  } catch {
    // A failed graceful request must not prevent the force-stop fallback.
  }
  const gracePeriod = (options.wait ?? wait)(
    options.gracePeriodMs ?? DEFAULT_CLEANUP_GRACE_MS,
  );
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

function captureCommand(command: string, args: string[]): Promise<string> {
  return new Promise((resolveOutput, rejectOutput) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    });
    let output = "";
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      output += chunk;
    });
    child.once("error", rejectOutput);
    child.once("exit", (code) => {
      if (code === 0) resolveOutput(output);
      else {
        rejectOutput(
          new Error(`${command} failed with exit code ${code ?? "unknown"}.`),
        );
      }
    });
  });
}

async function listWindowsDescendants(rootPid: number): Promise<number[]> {
  const script = [
    `$rootPid = ${rootPid}`,
    "$all = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId)",
    "$pending = @($rootPid)",
    "$found = @()",
    "while ($pending.Count -gt 0) {",
    "  $parent = $pending[0]",
    "  if ($pending.Count -eq 1) { $pending = @() } else { $pending = @($pending[1..($pending.Count - 1)]) }",
    "  $children = @($all | Where-Object { $_.ParentProcessId -eq $parent })",
    "  foreach ($child in $children) { $found += [int]$child.ProcessId; $pending += [int]$child.ProcessId }",
    "}",
    "[Console]::Out.Write(($found -join ','))",
  ].join("; ");
  const output = await captureCommand("powershell.exe", [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    script,
  ]);
  return output
    .trim()
    .split(",")
    .filter((value) => /^\d+$/.test(value))
    .map(Number);
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
  const exited = new Promise<ProductionVerificationChildExit>((resolveExit) => {
    child.once("exit", (code, signal) => {
      resolveExit({ code, reason: childExitReason(code, signal), signal });
    });
  });
  await waitForSpawn(child);
  if (child.pid === undefined) {
    throw new Error("Production verification child process started without a PID.");
  }

  const pid = child.pid;
  const exitedWithoutReason = exited.then(() => undefined);
  const knownWindowsPids = new Set([pid]);
  const refreshWindowsTree = async () => {
    for (const descendant of await listWindowsDescendants(pid)) {
      knownWindowsPids.add(descendant);
    }
  };
  const isRunning = () => {
    if (windows) {
      return [...knownWindowsPids].some((ownedPid) => isProcessAlive(ownedPid));
    }
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
          if (windows) {
            await refreshWindowsTree();
            for (const ownedPid of [...knownWindowsPids].reverse()) {
              if (isProcessAlive(ownedPid)) await runTaskkill(ownedPid, true);
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
            await refreshWindowsTree();
            for (const ownedPid of [...knownWindowsPids].reverse()) {
              if (isProcessAlive(ownedPid)) await runTaskkill(ownedPid, false);
            }
          } else if (isRunning()) {
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
  if (cleanupFailure) throw cleanupFailure;
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
  let recoveryPath: string | undefined;

  const releaseOwnerRecord = async () => {
    try {
      if ((await readFile(lockPath, "utf8")) === ownerRecord) {
        await unlink(lockPath);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  };

  const removeRecoveryMarker = async () => {
    if (!recoveryPath) return;
    try {
      await unlink(recoveryPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    recoveryPath = undefined;
  };

  const waitForRecoveryMarkers = async () => {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const markers = (await readdir(input.cwd)).filter((entry) =>
        entry.startsWith(CHECKOUT_LOCK_RECOVERY_PREFIX),
      );
      let liveMarkers = 0;
      for (const marker of markers) {
        const markerPath = resolve(input.cwd, marker);
        try {
          const markerOwner = (await readFile(markerPath, "utf8")).trim();
          const ownerMatch = /^(\d+)(?::|$)/.exec(markerOwner);
          if (ownerMatch && isProcessAlive(Number(ownerMatch[1]))) {
            liveMarkers += 1;
          } else {
            await unlink(markerPath);
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
      if (liveMarkers === 0) return;
      await wait(10);
    }
    throw new Error("Production verification stale-lock recovery did not settle.");
  };

  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const handle = await open(lockPath, "wx");
      try {
        await handle.writeFile(ownerRecord);
      } finally {
        await handle.close();
      }

      await removeRecoveryMarker();
      try {
        await waitForRecoveryMarkers();
      } catch (error) {
        await releaseOwnerRecord();
        throw error;
      }
      if ((await readFile(lockPath, "utf8")) !== ownerRecord) continue;

      return {
        release: releaseOwnerRecord,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        await removeRecoveryMarker();
        throw error;
      }

      if (!recoveryPath) {
        recoveryPath = resolve(
          input.cwd,
          `${CHECKOUT_LOCK_RECOVERY_PREFIX}${ownerPid}-${randomUUID()}`,
        );
        const recoveryHandle = await open(recoveryPath, "wx");
        try {
          await recoveryHandle.writeFile(ownerRecord);
        } finally {
          await recoveryHandle.close();
        }
      }

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
        await removeRecoveryMarker();
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

  await removeRecoveryMarker();
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
