import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import globalSetup from "@/e2e/global-setup";
import { executeProductionVerificationCli } from "@/scripts/production-verification-cli";
import { runProductionVerificationCiCommand } from "@/scripts/production-verification-ci-command";
import type { ProductionVerificationDiagnostic } from "@/scripts/production-verification";
import { makeProductionVerificationAdapters as makeCiAdapters } from "@/tests/helpers/production-verification";

const ciEnvironment: NodeJS.ProcessEnv = {
  ...process.env,
  CI: "true",
  GITHUB_ACTIONS: "true",
};

function quietCliRuntime(errors: string[]) {
  return {
    error: (message: string) => errors.push(message),
    off: () => {},
    once: () => {},
  };
}

describe("Production Verification Commands", () => {
  it("routes both supported commands through the same trusted runner", async () => {
    const packageJson = JSON.parse(
      await readFile(resolve(process.cwd(), "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };

    expect(packageJson.scripts.e2e).toBe("tsx scripts/verify-production.ts");
    expect(packageJson.scripts["verify:production"]).toBe(
      packageJson.scripts.e2e,
    );
    expect(
      Object.keys(packageJson.scripts).filter((name) => name.includes("prebuilt")),
    ).toEqual([]);
    expect(packageJson.scripts["verify:production:ci"]).toBeUndefined();
  });

  it("keeps receipted artifact commands restricted to GitHub Actions", () => {
    const environment = { ...process.env };
    delete environment.CI;
    delete environment.GITHUB_ACTIONS;

    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/verify-production-ci.ts", "verify"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: environment,
      },
    );

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      "Receipted production artifact commands are restricted to GitHub Actions.",
    );
  });

  it("builds and verifies the same receipted artifact in separate Ubuntu steps", async () => {
    const workflow = await readFile(
      resolve(process.cwd(), ".github/workflows/ci.yml"),
      "utf8",
    );

    expect(workflow).toContain("- name: Build receipted production artifact");
    expect(workflow).toContain(
      "run: pnpm tsx scripts/verify-production-ci.ts build",
    );
    expect(workflow).toContain("- name: Verify receipted production artifact");
    expect(workflow).toContain(
      "run: pnpm tsx scripts/verify-production-ci.ts verify",
    );
    expect(workflow).not.toContain("- name: Production build and E2E tests");
  });

  it("returns success for a valid receipt through the CI command", async () => {
    const commitSha = "f".repeat(40);
    const diagnostics: ProductionVerificationDiagnostic[] = [];
    const errors: string[] = [];
    const output: string[] = [];
    let stopped = false;
    const adapters = makeCiAdapters({
      readArtifact: async () => ({
        buildId: "command-build",
        modifiedAtMs: 100,
      }),
      readCommitSha: async () => commitSha,
      readReceipt: async () => ({
        contents: JSON.stringify({ buildId: "command-build", commitSha }),
        modifiedAtMs: 101,
      }),
      report: (diagnostic) => diagnostics.push(diagnostic),
      runBrowserTests: async () => {},
      selectFreePort: async () => 43_123,
      startServer: async () => ({
        exited: new Promise(() => {}),
        stop: async () => {
          stopped = true;
        },
      }),
      waitForBuildIdentity: async () => {},
    });

    const exitCode = await executeProductionVerificationCli(
      (signal) =>
        runProductionVerificationCiCommand({
          adapters,
          argv: ["verify"],
          cwd: process.cwd(),
          env: ciEnvironment,
          log: (message) => output.push(message),
          signal,
        }),
      quietCliRuntime(errors),
    );

    expect(exitCode).toBe(0);
    expect(errors).toEqual([]);
    expect(output).toEqual([
      "Receipted production verification passed for build command-build at http://127.0.0.1:43123.",
    ]);
    expect(stopped).toBe(true);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ phase: "artifact-validation", status: "passed" }),
    );
  });

  it.each([
    ["missing", undefined, "Production artifact receipt is missing."],
    [
      "malformed",
      { contents: "{not-json", modifiedAtMs: 101 },
      "Production artifact receipt is malformed.",
    ],
    [
      "stale",
      {
        contents: JSON.stringify({
          buildId: "command-build",
          commitSha: "a".repeat(40),
        }),
        modifiedAtMs: 99,
      },
      "Production artifact receipt is stale.",
    ],
    [
      "for a substituted build",
      {
        contents: JSON.stringify({
          buildId: "other-build",
          commitSha: "a".repeat(40),
        }),
        modifiedAtMs: 101,
      },
      "Production artifact receipt build ID does not match the current artifact.",
    ],
    [
      "for another commit",
      {
        contents: JSON.stringify({
          buildId: "command-build",
          commitSha: "b".repeat(40),
        }),
        modifiedAtMs: 101,
      },
      "Production artifact receipt commit SHA does not match the current checkout.",
    ],
  ])("returns failure for a %s receipt through the CI command", async (
    _name,
    receipt,
    expectedMessage,
  ) => {
    const diagnostics: ProductionVerificationDiagnostic[] = [];
    const errors: string[] = [];
    const adapters = makeCiAdapters({
      readArtifact: async () => ({
        buildId: "command-build",
        modifiedAtMs: 100,
      }),
      readCommitSha: async () => "a".repeat(40),
      readReceipt: async () => receipt,
      report: (diagnostic) => diagnostics.push(diagnostic),
      selectFreePort: async () => 43_124,
    });

    const exitCode = await executeProductionVerificationCli(
      (signal) =>
        runProductionVerificationCiCommand({
          adapters,
          argv: ["verify"],
          cwd: process.cwd(),
          env: ciEnvironment,
          signal,
        }),
      quietCliRuntime(errors),
    );

    expect(exitCode).toBe(1);
    expect(errors).toContain(expectedMessage);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ phase: "artifact-validation", status: "failed" }),
    );
  });

  it("keeps a lightweight Windows lifecycle contract in CI", async () => {
    const workflow = await readFile(
      resolve(process.cwd(), ".github/workflows/ci.yml"),
      "utf8",
    );

    expect(workflow).toContain("verification-lifecycle-windows:");
    expect(workflow).toContain("runs-on: windows-latest");
    expect(workflow).toContain(
      "pnpm vitest run tests/production-verification.test.ts tests/production-verification-process.test.ts",
    );

    const windowsRunner = await readFile(
      resolve(process.cwd(), "scripts/production-verification-windows.ps1"),
      "utf8",
    );
    expect(windowsRunner).toContain("CREATE_SUSPENDED");
    expect(windowsRunner).toContain("AssignProcessToJobObject");
    expect(windowsRunner).toContain("JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE");
    expect(windowsRunner).toContain("ownerStream.ReadByte()");
    expect(windowsRunner).toContain("ManualResetEvent");

    const nodeAdapter = await readFile(
      resolve(process.cwd(), "scripts/production-verification-node.ts"),
      "utf8",
    );
    expect(nodeAdapter).toContain("args: input.args");
    expect(nodeAdapter).toContain("command: input.command");
    expect(nodeAdapter).not.toContain("windowsJobPayload({\n            ...input");
  });

  it("rejects direct Playwright use with supported-command guidance", () => {
    const require = createRequire(import.meta.url);
    const playwrightCli = require.resolve("@playwright/test/cli");
    const environment = { ...process.env };
    delete environment.HELIX_VERIFICATION_ADAPTER;
    delete environment.HELIX_VERIFICATION_BASE_URL;

    const result = spawnSync(process.execPath, [playwrightCli, "test", "--list"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: environment,
    });

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      "Run pnpm e2e or pnpm verify:production",
    );
  });

  it("requires global setup to inherit the runner-prepared environment", async () => {
    const originalDirectory = process.cwd();
    const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const originalAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const temporaryDirectory = await mkdtemp(
      resolve(tmpdir(), "helix-global-setup-"),
    );

    try {
      await writeFile(
        resolve(temporaryDirectory, ".env.local"),
        "NEXT_PUBLIC_SUPABASE_URL=https://wrong.example.test\n" +
          "NEXT_PUBLIC_SUPABASE_ANON_KEY=local-only-key\n",
      );
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      process.chdir(temporaryDirectory);

      await expect(globalSetup()).rejects.toThrow(
        "e2e: missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY",
      );
    } finally {
      process.chdir(originalDirectory);
      if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
      if (originalAnonKey === undefined) {
        delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      } else {
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey;
      }
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  it("does not disclose environment-derived URLs in Catalog errors", async () => {
    const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const originalAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://private-value.example.test";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

    try {
      const error = await globalSetup().catch((cause: unknown) => cause);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain(
        "e2e: refusing unapproved Supabase project",
      );
      expect((error as Error).message).not.toContain(
        "private-value.example.test",
      );
    } finally {
      if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
      if (originalAnonKey === undefined) {
        delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      } else {
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey;
      }
    }
  });

  it("rejects an approved-project-looking URL outside Supabase", async () => {
    const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const originalAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL =
      "https://erasogmsqpgiirovubjh.supabase.co.evil.example";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    const fetchMock = vi.spyOn(globalThis, "fetch");

    try {
      await expect(globalSetup()).rejects.toThrow(
        /e2e: refusing unapproved Supabase project.*hostname must exactly match/,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      fetchMock.mockRestore();
      if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
      if (originalAnonKey === undefined) {
        delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      } else {
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey;
      }
    }
  });

  it("does not disclose raw provider payloads in Catalog errors", async () => {
    const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const originalAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL =
      "https://erasogmsqpgiirovubjh.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("raw-private-provider-payload", { status: 500 }));

    try {
      const error = await globalSetup().catch((cause: unknown) => cause);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain(
        "e2e: catalog query failed (HTTP 500)",
      );
      expect((error as Error).message).not.toContain(
        "raw-private-provider-payload",
      );
    } finally {
      fetchMock.mockRestore();
      if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
      if (originalAnonKey === undefined) {
        delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      } else {
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey;
      }
    }
  });
});
