import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
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
  // A cold hosted Windows runner can spend more than ten seconds compiling the
  // PowerShell job-object supervisor before it starts the owned target.
  timeoutMs = process.platform === "win32" ? 20_000 : 3_000,
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
  it("runs selected Chromium and WebKit journeys as sequential passes", async () => {
    const commands: Array<{
      args: string[];
      env: NodeJS.ProcessEnv;
      gid?: number;
      uid?: number;
    }> = [];
    const adapters = await createNodeProductionVerificationAdapters(
      process.cwd(),
      {
        GITHUB_ACTIONS: "true",
        NODE_ENV: "test",
        VERIFICATION_BROWSER_GID: "2101",
        VERIFICATION_BROWSER_HOME: "/home/verifier-candidate",
        VERIFICATION_BROWSER_UID: "2100",
        VERIFICATION_SERVER_CWD: "/tmp/mei-pelle-server-runtime",
        VERIFICATION_SERVER_GID: "2201",
        VERIFICATION_SERVER_HOME: "/home/verifier-server",
        VERIFICATION_SERVER_UID: "2200",
      },
      {
        runCommand: async ({ args, env, gid, uid }) => {
          commands.push({ args, env, gid, uid });
          await writeFile(
            env.PLAYWRIGHT_JSON_OUTPUT_FILE!,
            JSON.stringify({ suites: [] }),
          );
        },
      },
    );

    await adapters.runBrowserTests({
      baseURL: "http://127.0.0.1:43138",
      selection: {
        journeyIds: ["header-search", "homepage-hero"],
        projects: ["chromium", "webkit"],
        webkitJourneyIds: ["homepage-hero"],
      },
    });

    expect(commands).toHaveLength(2);
    expect(commands[0]!.args).toEqual(
      expect.arrayContaining([
        "test",
        "e2e/search.spec.ts",
        "e2e/home-hero.spec.ts",
        "--project",
        "chromium",
      ]),
    );
    expect(commands[1]!.args).toEqual([
      commands[0]!.args[0],
      "test",
      "e2e/home-hero.spec.ts",
      "--project",
      "webkit",
      "--reporter",
      "html,json",
    ]);
    expect(
      commands.map(({ env }) => env.MEI_PELLE_VERIFICATION_BASE_URL),
    ).toEqual([
      "http://127.0.0.1:43138",
      "http://127.0.0.1:43138",
    ]);
    expect(commands.map(({ gid, uid }) => ({ gid, uid }))).toEqual([
      { gid: 2101, uid: 2100 },
      { gid: 2101, uid: 2100 },
    ]);
    expect(commands.map(({ env }) => env.HOME)).toEqual([
      "/home/verifier-candidate",
      "/home/verifier-candidate",
    ]);
  });

  it("reports retry executions observed by the supported browser adapter", async () => {
    const adapters = await createNodeProductionVerificationAdapters(
      process.cwd(),
      { NODE_ENV: "test" },
      {
        runCommand: async ({ env }) => {
          const reportPath = env.PLAYWRIGHT_JSON_OUTPUT_FILE;
          if (!reportPath) throw new Error("Expected a JSON telemetry report path.");
          await writeFile(
            reportPath,
            JSON.stringify({
              suites: [
                {
                  specs: [
                    {
                      tests: [
                        {
                          results: [{ retry: 0 }, { retry: 1 }],
                        },
                      ],
                    },
                  ],
                },
              ],
            }),
          );
        },
      },
    );

    await expect(
      adapters.runBrowserTests({
        baseURL: "http://127.0.0.1:43139",
        selection: {
          journeyIds: ["header-search"],
          projects: ["chromium"],
        },
      }),
    ).resolves.toEqual({ retries: 1 });
  });

  it("runs the server and candidate browser under separate isolated identities", async () => {
    let serverInput:
      | { cwd: string; env: NodeJS.ProcessEnv; gid?: number; uid?: number }
      | undefined;
    const adapters = await createNodeProductionVerificationAdapters(
      process.cwd(),
      {
        NODE_ENV: "test",
        VERIFICATION_BROWSER_GID: "2101",
        VERIFICATION_BROWSER_HOME: "/home/verifier-candidate",
        VERIFICATION_BROWSER_UID: "2100",
        VERIFICATION_SERVER_CWD: "/tmp/mei-pelle-server-runtime",
        VERIFICATION_SERVER_GID: "2201",
        VERIFICATION_SERVER_HOME: "/home/verifier-server",
        VERIFICATION_SERVER_UID: "2200",
      },
      {
        spawnProcess: async ({ cwd, env, gid, uid }) => {
          serverInput = { cwd, env, gid, uid };
          return {
            exited: new Promise(() => {}),
            pid: 123,
            stop: async () => {},
          };
        },
      },
    );

    await adapters.startServer({ host: "127.0.0.1", port: 43_142 });

    expect(serverInput).toEqual({
      cwd: "/tmp/mei-pelle-server-runtime",
      env: expect.objectContaining({ HOME: "/home/verifier-server" }),
      gid: 2201,
      uid: 2200,
    });
  });

  it("fails closed when an isolated process identity is incomplete", async () => {
    await expect(
      createNodeProductionVerificationAdapters(process.cwd(), {
        NODE_ENV: "test",
        VERIFICATION_BROWSER_UID: "2100",
      }),
    ).rejects.toThrow(
      "Isolated production verification requires complete browser and server process identities.",
    );
  });

  it("retains structured timing telemetry when the caller supplies an artifact path", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "mei-pelle-retained-telemetry-"));
    const reportPath = resolve(directory, "playwright-telemetry.json");
    try {
      const adapters = await createNodeProductionVerificationAdapters(
        process.cwd(),
        { NODE_ENV: "test", PLAYWRIGHT_JSON_OUTPUT_FILE: reportPath },
        {
          runCommand: async ({ env }) => {
            expect(env.PLAYWRIGHT_JSON_OUTPUT_FILE).toBe(reportPath);
            await writeFile(reportPath, JSON.stringify({ suites: [] }));
          },
        },
      );

      await adapters.runBrowserTests({ baseURL: "http://127.0.0.1:43141" });
      await expect(readFile(reportPath, "utf8")).resolves.toContain('"suites"');
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("preserves observed retries on a failed browser pass", async () => {
    const adapters = await createNodeProductionVerificationAdapters(
      process.cwd(),
      { NODE_ENV: "test" },
      {
        runCommand: async ({ env }) => {
          await writeFile(
            env.PLAYWRIGHT_JSON_OUTPUT_FILE!,
            JSON.stringify({
              suites: [
                {
                  specs: [
                    {
                      tests: [{ results: [{ retry: 0 }, { retry: 1 }] }],
                    },
                  ],
                },
              ],
            }),
          );
          throw new Error("Playwright failed after retries.");
        },
      },
    );

    await expect(
      adapters.runBrowserTests({
        baseURL: "http://127.0.0.1:43140",
        selection: {
          journeyIds: ["header-search"],
          projects: ["chromium"],
        },
      }),
    ).rejects.toMatchObject({
      message: "Playwright failed after retries.",
      retryCount: 1,
    });
  });

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

  it("publishes the worktree-scoped reusable receipt atomically", async () => {
    const cwd = await mkdtemp(resolve(tmpdir(), "mei-pelle-local-receipt-"));
    const nextDirectory = resolve(cwd, ".next");
    const receipt = {
      buildId: "local-build",
      categories: {
        "browser-configuration": "sha256:browser",
        dependencies: "sha256:dependencies",
        environment: "sha256:environment",
        "runtime-source": "sha256:runtime",
        tests: "sha256:tests",
        "verification-plan": "sha256:plan",
      },
      version: 1 as const,
      worktreeId: "sha256:worktree",
    };

    try {
      await mkdir(nextDirectory, { recursive: true });
      const adapters = await createNodeProductionVerificationAdapters(cwd, {
        NODE_ENV: "production",
        PRIVATE_API_SECRET: "must-not-be-receipted",
      });

      await adapters.writeReusableBuildReceipt(receipt);
      const stored = await adapters.readReusableBuildReceipt();

      expect(JSON.parse(stored!.contents)).toEqual(receipt);
      expect(stored!.contents).not.toContain("must-not-be-receipted");
      expect(await readdir(nextDirectory)).toEqual([
        "mei-pelle-local-build-receipt.json",
      ]);
    } finally {
      await rm(cwd, { force: true, recursive: true });
    }
  });

  it("fingerprints every local production-build reuse input without storing secrets", async () => {
    const cwd = await mkdtemp(resolve(tmpdir(), "mei-pelle-build-reuse-inputs-"));
    const files = {
      "app/page.tsx": "export default function Page() { return null; }\n",
      "hooks/use-feature.ts": "export const enabled = true;\n",
      "next.config.ts": "export default {};\n",
      "package.json": '{"name":"reuse-fixture"}\n',
      "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
      "playwright.config.ts": "export default {};\n",
      "scripts/browser-verification-plan.ts": "export const version = 1;\n",
      "tests/example.test.ts": "export const testCase = true;\n",
      "vitest.config.ts": "export default {};\n",
    };

    try {
      for (const [path, contents] of Object.entries(files)) {
        const destination = resolve(cwd, path);
        await mkdir(resolve(destination, ".."), { recursive: true });
        await writeFile(destination, contents);
      }
      const git = (...args: string[]) =>
        spawnSync("git", args, { cwd, encoding: "utf8" });
      git("init", "--quiet");
      git("add", ".");

      const nonSecretEnvironment = {
        ALGOLIA_APP_ID: "algolia-app",
        ALGOLIA_INDEX_NAME: "products",
        ALLOW_PRODUCTION_SEARCH_REINDEX: "false",
        CHECKOUT_ENABLED: "true",
        CHECKOUT_MODE: "test",
        CI: "",
        NODE_ENV: "production" as const,
        NEXT_PUBLIC_SITE_ORIGIN: "https://mei-pelle.example.test",
        SEARCH_BACKFILL_ENVIRONMENT: "preview",
        STRIPE_AUTOMATIC_TAX_ENABLED: "true",
        STRIPE_REFERRAL_15_COUPON_ID: "coupon-referral",
        STRIPE_REWARD_200_COUPON_ID: "coupon-200",
        STRIPE_REWARD_400_COUPON_ID: "coupon-400",
        STRIPE_REWARD_600_COUPON_ID: "coupon-600",
        STRIPE_STANDARD_SHIPPING_RATE_ID: "shr_standard",
        VERCEL_ENV: "preview",
        VERCEL_URL: "mei-pelle.example.test",
      };
      const adapters = await createNodeProductionVerificationAdapters(cwd, {
        ...nonSecretEnvironment,
        PRIVATE_API_SECRET: "must-not-be-receipted",
      });
      const baseline = await adapters.readBuildReuseInput();

      const cases = [
        ["app/page.tsx", "runtime-source"],
        ["hooks/use-feature.ts", "runtime-source"],
        ["next.config.ts", "browser-configuration"],
        ["package.json", "dependencies"],
        ["pnpm-lock.yaml", "dependencies"],
        ["playwright.config.ts", "browser-configuration"],
        ["scripts/browser-verification-plan.ts", "verification-plan"],
        ["tests/example.test.ts", "tests"],
        ["vitest.config.ts", "tests"],
      ] as const;
      for (const [path, category] of cases) {
        await writeFile(resolve(cwd, path), `${files[path]}// changed\n`);
        const changed = await adapters.readBuildReuseInput();
        expect(changed.categories[category]).not.toBe(
          baseline.categories[category],
        );
        await writeFile(resolve(cwd, path), files[path]);
      }

      for (const key of Object.keys(nonSecretEnvironment)) {
        const environmentChanged = await createNodeProductionVerificationAdapters(
          cwd,
          {
            ...nonSecretEnvironment,
            [key]: `${nonSecretEnvironment[key as keyof typeof nonSecretEnvironment]}-changed`,
          PRIVATE_API_SECRET: "a-different-secret",
          },
        );
        const changedInput = await environmentChanged.readBuildReuseInput();
        expect(changedInput.categories.environment, key).not.toBe(
          baseline.categories.environment,
        );
        expect(changedInput.worktreeId).toBe(baseline.worktreeId);
      }
      expect(JSON.stringify(baseline)).not.toContain("must-not-be-receipted");
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
        await rm(cwd, {
          force: true,
          maxRetries: process.platform === "win32" ? 5 : 0,
          recursive: true,
          retryDelay: 100,
        });
      }
    },
    process.platform === "win32" ? 35_000 : 20_000,
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

  it("allows only one concurrent fresh-lock winner", async () => {
    const cwd = await mkdtemp(resolve(tmpdir(), "mei-pelle-fresh-lock-race-"));

    try {
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
