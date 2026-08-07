import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  acquireCheckoutLock,
  createNodeProductionVerificationAdapters,
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

async function waitUntil(
  assertion: () => boolean,
  timeoutMs = process.platform === "win32" ? 10_000 : 3_000,
): Promise<void> {
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

const ORPHAN_PROCESS_SCRIPT = [
  "const { spawn } = require('node:child_process');",
  "const intermediate = Buffer.from(process.argv[2], 'base64').toString('utf8');",
  "spawn(process.execPath, ['-e', intermediate, process.argv[1]], { stdio: 'ignore' });",
].join(" ");

const ORPHAN_INTERMEDIATE_SCRIPT = Buffer.from(
  [
    "const { spawn } = require('node:child_process');",
    "const { writeFileSync } = require('node:fs');",
    "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
    "child.unref();",
    "writeFileSync(process.argv[1], JSON.stringify({ child: child.pid }));",
  ].join(" "),
  "utf8",
).toString("base64");

const lifecycleStdio = process.platform === "win32" ? "inherit" : "ignore";

describe("Production Verification Node Adapters", () => {
  it("stores only the build ID and commit SHA in the artifact receipt", async () => {
    const cwd = await mkdtemp(resolve(tmpdir(), "mei-pelle-artifact-receipt-"));
    const nextDirectory = resolve(cwd, ".next");
    const receipt = {
      buildId: "receipt-build",
      commitSha: "e".repeat(40),
    };

    try {
      await mkdir(nextDirectory, { recursive: true });
      const adapters = await createNodeProductionVerificationAdapters(cwd, {
        NODE_ENV: "production",
        PRIVATE_VALUE: "must-not-be-receipted",
      });

      await adapters.writeReceipt(receipt);
      const stored = await adapters.readReceipt();

      expect(stored).toBeDefined();
      expect(JSON.parse(stored!.contents)).toEqual(receipt);
      expect(Object.keys(JSON.parse(stored!.contents) as object)).toEqual([
        "buildId",
        "commitSha",
      ]);
      expect(stored!.contents).not.toContain("PRIVATE_VALUE");
      expect(stored!.contents).not.toContain("must-not-be-receipted");

      await adapters.removeReceipt();
      await expect(adapters.readReceipt()).resolves.toBeUndefined();
    } finally {
      await rm(cwd, { force: true, recursive: true });
    }
  });

  it(
    "starts and cleans up a complete owned process tree",
    async () => {
      const cwd = await mkdtemp(resolve(tmpdir(), "mei-pelle-process-tree-"));
      const pidFile = resolve(cwd, "pids.json");
      const owned = await spawnOwnedProcess({
        args: ["-e", PROCESS_TREE_SCRIPT, pidFile],
        command: process.execPath,
        cwd,
        env: process.env,
        stdio: lifecycleStdio,
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
    },
    20_000,
  );

  it(
    "interrupts an owned command and cleans up its process tree",
    async () => {
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
        stdio: lifecycleStdio,
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
    },
    20_000,
  );

  it("reports a child command exit reason", async () => {
    await expect(
      runOwnedCommand({
        args: ["-e", "process.exit(23)"],
        command: process.execPath,
        cwd: process.cwd(),
        env: process.env,
        label: "Lifecycle failure command",
        stdio: lifecycleStdio,
      }),
    ).rejects.toMatchObject({
      childExitReason: "exit code 23",
      message: "Lifecycle failure command failed after exit code 23.",
    });
  });

  it(
    "cleans up descendants after their root command exits",
    async () => {
      const cwd = await mkdtemp(resolve(tmpdir(), "mei-pelle-process-orphan-"));
      const pidFile = resolve(cwd, "pids.json");

      try {
        await runOwnedCommand({
          args: [
            "-e",
            ORPHAN_PROCESS_SCRIPT,
            pidFile,
            ORPHAN_INTERMEDIATE_SCRIPT,
          ],
          command: process.execPath,
          cwd,
          env: process.env,
          label: "Orphan cleanup command",
          stdio: lifecycleStdio,
        });
        const { child } = JSON.parse(await readFile(pidFile, "utf8")) as {
          child: number;
        };
        await waitUntil(() => !processIsAlive(child));
      } finally {
        await rm(cwd, { force: true, recursive: true });
      }
    },
    10_000,
  );

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

  it("gives descendants the full grace period after their root exits", async () => {
    const events: string[] = [];
    let running = true;

    await stopProcessTree(
      {
        exited: Promise.resolve(),
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

  it("force-stops a process tree when graceful shutdown cannot be requested", async () => {
    let running = true;
    const forceStop = vi.fn(async () => {
      running = false;
    });

    await stopProcessTree(
      {
        exited: new Promise(() => {}),
        forceStop,
        isRunning: () => running,
        requestStop: async () => {
          throw new Error("graceful shutdown unavailable");
        },
      },
      { wait: async () => {} },
    );

    expect(forceStop).toHaveBeenCalledOnce();
  });

  it("force-stops after the grace deadline when a shutdown request hangs", async () => {
    let running = true;
    const forceStop = vi.fn(async () => {
      running = false;
    });

    await stopProcessTree(
      {
        exited: new Promise(() => {}),
        forceStop,
        isRunning: () => running,
        requestStop: () => new Promise(() => {}),
      },
      { wait: async () => {} },
    );

    expect(forceStop).toHaveBeenCalledOnce();
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

  it("allows only one concurrent stale-lock recovery winner", async () => {
    const cwd = await mkdtemp(resolve(tmpdir(), "mei-pelle-stale-lock-race-"));
    const lockPath = resolve(cwd, ".mei-pelle-production-verification.lock");

    try {
      await writeFile(lockPath, "99999999:stale\n");
      const attempts = await Promise.allSettled(
        Array.from({ length: 8 }, () =>
          acquireCheckoutLock({ cwd, pid: process.pid }),
        ),
      );
      const winners = attempts.filter(
        (attempt): attempt is PromiseFulfilledResult<Awaited<ReturnType<typeof acquireCheckoutLock>>> =>
          attempt.status === "fulfilled",
      );
      expect(winners).toHaveLength(1);
      await winners[0].value.release();
    } finally {
      await rm(cwd, { force: true, recursive: true });
    }
  }, 20_000);

  it("stops readiness early when the server exits", async () => {
    const server: ProductionVerificationServer = {
      exited: Promise.resolve({ code: 17, reason: "exit code 17", signal: null }),
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
