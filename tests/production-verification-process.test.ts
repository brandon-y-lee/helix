import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  acquireCheckoutLock,
  formatProductionVerificationDiagnostic,
  runOwnedCommand,
  spawnOwnedProcess,
  stopProcessTree,
  waitForExpectedBuild,
} from "@/scripts/production-verification-node";
import type {
  ProductionVerificationDiagnostic,
  ProductionVerificationServer,
} from "@/scripts/production-verification";

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function waitUntil(assertion: () => boolean, timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (assertion()) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
  throw new Error("Timed out waiting for process state.");
}

const PROCESS_TREE_SCRIPT = [
  "const { spawn } = require('node:child_process');",
  "const { writeFileSync } = require('node:fs');",
  "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
  "writeFileSync(process.argv[1], JSON.stringify({ parent: process.pid, child: child.pid }));",
  "setInterval(() => {}, 1000);",
].join(" ");

describe("Production Verification Node Adapters", () => {
  it("starts and cleans up a complete owned process tree", async () => {
    const cwd = await mkdtemp(resolve(tmpdir(), "mei-pelle-process-tree-"));
    const pidFile = resolve(cwd, "pids.json");
    const owned = await spawnOwnedProcess({
      args: ["-e", PROCESS_TREE_SCRIPT, pidFile],
      command: process.execPath,
      cwd,
      env: process.env,
      stdio: "ignore",
    });

    try {
      await waitUntil(() => existsSync(pidFile));
      const pids = JSON.parse(await readFile(pidFile, "utf8")) as {
        child: number;
        parent: number;
      };
      expect(processIsAlive(pids.parent)).toBe(true);
      expect(processIsAlive(pids.child)).toBe(true);

      await owned.stop();
      await waitUntil(
        () => !processIsAlive(pids.parent) && !processIsAlive(pids.child),
      );
    } finally {
      await owned.stop();
      await rm(cwd, { force: true, recursive: true });
    }
  });

  it("interrupts an owned command and cleans up its process tree", async () => {
    const cwd = await mkdtemp(resolve(tmpdir(), "mei-pelle-process-interrupt-"));
    const pidFile = resolve(cwd, "pids.json");
    const controller = new AbortController();
    const command = runOwnedCommand({
      args: ["-e", PROCESS_TREE_SCRIPT, pidFile],
      command: process.execPath,
      cwd,
      env: process.env,
      label: "Lifecycle smoke command",
      signal: controller.signal,
      stdio: "ignore",
    });

    try {
      await waitUntil(() => {
        try {
          return processIsAlive(
            (JSON.parse(readFileSync(pidFile, "utf8")) as {
              parent: number;
            }).parent,
          );
        } catch {
          return false;
        }
      });
      const pids = JSON.parse(await readFile(pidFile, "utf8")) as {
        child: number;
        parent: number;
      };
      controller.abort(new Error("Lifecycle smoke interruption."));

      await expect(command).rejects.toMatchObject({
        childExitReason: "interrupted",
        message: "Lifecycle smoke interruption.",
      });
      await waitUntil(
        () => !processIsAlive(pids.parent) && !processIsAlive(pids.child),
      );
    } finally {
      controller.abort(new Error("Test cleanup interruption."));
      await command.catch(() => {});
      await rm(cwd, { force: true, recursive: true });
    }
  });

  it("reports a child command exit reason", async () => {
    await expect(
      runOwnedCommand({
        args: ["-e", "process.exit(23)"],
        command: process.execPath,
        cwd: process.cwd(),
        env: process.env,
        label: "Lifecycle failure command",
        stdio: "ignore",
      }),
    ).rejects.toMatchObject({
      childExitReason: "exit code 23",
      message: "Lifecycle failure command failed after exit code 23.",
    });
  });

  it("requests graceful shutdown and does not force a process that exits", async () => {
    let resolveExit!: () => void;
    const exited = new Promise<void>((resolve) => {
      resolveExit = resolve;
    });
    const requestStop = vi.fn(async () => resolveExit());
    const forceStop = vi.fn(async () => {});

    await stopProcessTree({ exited, forceStop, requestStop });

    expect(requestStop).toHaveBeenCalledOnce();
    expect(forceStop).not.toHaveBeenCalled();
  });

  it("waits five seconds before force-stopping a process tree", async () => {
    const events: string[] = [];
    let running = true;

    await stopProcessTree(
      {
        exited: new Promise<void>(() => {}),
        forceStop: async () => {
          events.push("force");
          running = false;
        },
        isRunning: () => running,
        requestStop: async () => {
          events.push("graceful");
        },
      },
      {
        wait: async (milliseconds) => {
          events.push(`wait:${milliseconds}`);
        },
      },
    );

    expect(events).toEqual(["graceful", "wait:5000", "force"]);
  });

  it("fails cleanup when a force-stopped process tree remains alive", async () => {
    await expect(
      stopProcessTree(
        {
          exited: new Promise<void>(() => {}),
          forceStop: async () => {},
          isRunning: () => true,
          requestStop: async () => {},
        },
        { wait: async () => {} },
      ),
    ).rejects.toThrow("process tree remained alive after forced cleanup");
  });

  it("blocks a second lock owned by a live process", async () => {
    const cwd = await mkdtemp(resolve(tmpdir(), "mei-pelle-live-lock-"));

    try {
      const first = await acquireCheckoutLock({ cwd, pid: process.pid });
      await expect(
        acquireCheckoutLock({ cwd, pid: process.pid + 1 }),
      ).rejects.toThrow(`already owned by live process ${process.pid}`);
      await first.release();
    } finally {
      await rm(cwd, { force: true, recursive: true });
    }
  });

  it("recovers a stale lock without deleting a replacement owner", async () => {
    const cwd = resolve(
      tmpdir(),
      `mei-pelle-stale-lock-${process.pid}-${Date.now()}`,
    );
    await mkdir(cwd, { recursive: true });
    const lockPath = resolve(cwd, ".mei-pelle-production-verification.lock");

    try {
      await writeFile(lockPath, "99999999\n");
      const lock = await acquireCheckoutLock({ cwd, pid: process.pid });
      expect(await readFile(lockPath, "utf8")).toMatch(
        new RegExp(`^${process.pid}:[0-9a-f-]+\\n$`),
      );

      await writeFile(lockPath, "42424242\n");
      await lock.release();
      expect(await readFile(lockPath, "utf8")).toBe("42424242\n");
    } finally {
      await rm(cwd, { force: true, recursive: true });
    }
  });

  it("stops readiness early when the server exits", async () => {
    const server: ProductionVerificationServer = {
      exited: Promise.resolve({ reason: "exit code 17" }),
      stop: async () => {},
    };

    await expect(
      waitForExpectedBuild({
        baseURL: "http://127.0.0.1:43123",
        buildId: "expected-build",
        fetch: async () => {
          throw new TypeError("not ready");
        },
        now: () => 0,
        server,
        sleep: () => new Promise(() => {}),
        timeoutMs: 120_000,
      }),
    ).rejects.toMatchObject({
      childExitReason: "exit code 17",
      message: expect.stringContaining("exited before exposing the expected build"),
    });
  });

  it("accepts only the expected build asset", async () => {
    const server: ProductionVerificationServer = {
      exited: new Promise(() => {}),
      stop: async () => {},
    };
    const requested: string[] = [];

    await waitForExpectedBuild({
      baseURL: "http://127.0.0.1:43123",
      buildId: "build with spaces",
      fetch: async (input) => {
        requested.push(String(input));
        return new Response("ready", { status: 200 });
      },
      server,
      timeoutMs: 120_000,
    });

    expect(requested).toEqual([
      "http://127.0.0.1:43123/_next/static/build%20with%20spaces/_buildManifest.js",
    ]);
  });

  it("rejects a responding server with the wrong build identity", async () => {
    const server: ProductionVerificationServer = {
      exited: new Promise(() => {}),
      stop: async () => {},
    };

    await expect(
      waitForExpectedBuild({
        baseURL: "http://127.0.0.1:43123",
        buildId: "expected-build",
        fetch: async () => new Response("wrong", { status: 404 }),
        server,
        timeoutMs: 120_000,
      }),
    ).rejects.toThrow(
      "Running server does not expose expected build expected-build (HTTP 404).",
    );
  });

  it("times readiness out at the configured limit", async () => {
    let now = 0;
    const server: ProductionVerificationServer = {
      exited: new Promise(() => {}),
      stop: async () => {},
    };

    await expect(
      waitForExpectedBuild({
        baseURL: "http://127.0.0.1:43124",
        buildId: "timeout-build",
        fetch: async () => {
          throw new TypeError("not ready");
        },
        now: () => now,
        server,
        sleep: async () => {
          now += 250;
        },
        timeoutMs: 500,
      }),
    ).rejects.toThrow("within 0.5 seconds");
  });

  it("formats diagnostics without environment-derived values", () => {
    const diagnostic: ProductionVerificationDiagnostic = {
      buildId: "build-safe",
      childExitReason: "signal SIGTERM",
      elapsedMs: 1_250,
      phase: "cleanup",
      port: 43_125,
      status: "failed",
    };

    const output = formatProductionVerificationDiagnostic(diagnostic);

    expect(output).toBe(
      "[production-verification] phase=cleanup status=failed elapsed=1.250s port=43125 expectedBuildId=build-safe childExit=signal SIGTERM",
    );
    expect(output).not.toContain("https://private.example.test");
  });
});
