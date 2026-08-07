import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import globalSetup from "@/e2e/global-setup";

describe("Production Verification Commands", () => {
  it("routes both supported commands through the same trusted runner", async () => {
    const packageJson = JSON.parse(
      await readFile(resolve(process.cwd(), "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };

    expect(packageJson.scripts.e2e).toBe("tsx scripts/verify-production.ts");
    expect(packageJson.scripts["verify:production"]).toBe(
      packageJson.scripts.e2e,
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
  });

  it("rejects direct Playwright use with supported-command guidance", () => {
    const require = createRequire(import.meta.url);
    const playwrightCli = require.resolve("@playwright/test/cli");
    const environment = { ...process.env };
    delete environment.MEI_PELLE_VERIFICATION_ADAPTER;
    delete environment.MEI_PELLE_VERIFICATION_BASE_URL;

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
      resolve(tmpdir(), "mei-pelle-global-setup-"),
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
