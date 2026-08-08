import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

import {
  WINDOWS_LIFECYCLE_PATH_PATTERNS,
  type ScheduledVerificationFailure,
} from "@/scripts/github/verification-orchestrator";
import {
  createScheduledFallbackFailure,
  createScheduledSetupFailure,
  scheduledSetupFailureIssueBody,
} from "@/scripts/github/record-scheduled-verification-setup-failure.mjs";
import { createRuntimeIdentity } from "@/scripts/github/scheduled-verification-runtime.mjs";
import { recordScheduledVerificationFailure } from "@/scripts/github/scheduled-verification-issue.mjs";
import { windowsLifecycleVitestInvocation } from "@/scripts/github/run-windows-lifecycle-verification";

type Workflow = {
  concurrency?: { "cancel-in-progress"?: boolean; group?: string };
  jobs: Record<string, {
    "runs-on": string;
    steps: Array<{ if?: string; name?: string; run?: string; with?: Record<string, unknown> }>;
  }>;
  on: Record<string, unknown>;
  permissions: Record<string, string>;
};

function workflow(name: string): Workflow {
  return parse(
    readFileSync(resolve(process.cwd(), `.github/workflows/${name}`), "utf8"),
  ) as Workflow;
}

describe("proportional scheduled verification workflow adapters", () => {
  it("delegates daily and manual WebKit runs to one scheduled command and plan", () => {
    const scheduled = workflow("scheduled-browser-verification.yml");
    const steps = scheduled.jobs["complete-webkit"]!.steps;

    expect(scheduled.on).toEqual({
      schedule: [{ cron: "17 7 * * *" }],
      workflow_dispatch: null,
    });
    expect(scheduled.concurrency).toEqual({
      group: "scheduled-browser-verification",
      "cancel-in-progress": false,
    });
    expect(scheduled.permissions).toEqual({ contents: "read", issues: "write" });
    expect(scheduled.jobs["complete-webkit"]!["runs-on"]).toBe("macos-latest");
    expect(steps[0]).toMatchObject({
      name: "Checkout failure recorder",
      with: expect.objectContaining({
        "sparse-checkout": expect.stringContaining(
          "scripts/github/record-scheduled-verification-setup-failure.mjs",
        ),
      }),
    });
    expect(steps.some((step) => step.run === "pnpm exec playwright install webkit")).toBe(true);
    expect(steps.some((step) => step.run === "pnpm verify:scheduled -- --lane webkit")).toBe(true);
    expect(steps).toEqual(expect.arrayContaining([
      expect.objectContaining({
        if: "${{ failure() && env.SCHEDULED_VERIFICATION_ISSUE_RECONCILED != '1' }}",
        run: "node scripts/github/record-scheduled-verification-setup-failure.mjs",
      }),
    ]));
  });

  it("runs Windows lifecycle evidence only for relevant pull requests, schedule, or manual dispatch", () => {
    const windows = workflow("verification-lifecycle-windows.yml");
    const pullRequest = windows.on.pull_request as { branches: string[]; paths?: string[] };

    expect(windows.on.schedule).toEqual([{ cron: "41 7 * * 1" }]);
    expect(windows.on.workflow_dispatch).toBeNull();
    expect(pullRequest.branches).toEqual(["dev", "main", "codex/spec-*"]);
    expect(pullRequest.paths).toBeUndefined();
    expect(windows.permissions).toEqual({ contents: "read" });
    expect(windows.jobs["classify-windows-lifecycle"]!["runs-on"]).toBe("ubuntu-latest");
    expect(windows.jobs["verification-lifecycle-windows"]!["runs-on"]).toBe("windows-latest");
    expect(
      windows.jobs["verification-lifecycle-windows"]!.steps.some(
        (step) => step.run === "pnpm verification:lifecycle:windows",
      ),
    ).toBe(true);
    expect(windows.jobs["verification-lifecycle-gate"]).toBeDefined();
  });

  it("requires complete Chromium and WebKit evidence only for verification-system pull requests", () => {
    const browser = workflow("verification-system-browser.yml");
    const pullRequest = browser.on.pull_request as { branches: string[]; paths: string[] };
    const steps = browser.jobs["complete-browser-evidence"]!.steps;

    expect(pullRequest).toEqual({
      branches: ["dev", "main"],
      paths: [...WINDOWS_LIFECYCLE_PATH_PATTERNS],
    });
    expect(browser.permissions).toEqual({ contents: "read" });
    expect(browser.jobs["complete-browser-evidence"]!["runs-on"]).toBe("macos-latest");
    expect(steps).toEqual(expect.arrayContaining([
      expect.objectContaining({ run: "pnpm exec playwright install chromium webkit" }),
      expect.objectContaining({ run: 'pnpm verify:affected -- --base "origin/${{ github.base_ref }}"' }),
    ]));
  });

  it("builds setup-failure state with the same versioned runtime identities", () => {
    const runtimeIdentity = createRuntimeIdentity({
      commitSha: "0123456789abcdef0123456789abcdef01234567",
      environment: { NEXT_PUBLIC_SUPABASE_URL: "https://catalog.example" },
      nodeVersion: "v24.0.0",
    });
    const changedRuntimeIdentity = createRuntimeIdentity({
      commitSha: "0123456789abcdef0123456789abcdef01234567",
      environment: { NEXT_PUBLIC_SUPABASE_URL: "https://other.example" },
      nodeVersion: "v24.0.0",
    });
    const failure = createScheduledSetupFailure({
      browserVersion: "1.55.1",
      planSource: "plan-source",
      runtimeIdentity,
    });

    expect(failure).toMatchObject({
      kind: "setup-failed",
      summary: "Scheduled verification setup failed before complete WebKit evidence could run.",
    });
    expect(failure.identity.runtimeFingerprint).not.toBe(
      createScheduledSetupFailure({
        browserVersion: "1.55.1",
        planSource: "plan-source",
        runtimeIdentity: changedRuntimeIdentity,
      }).identity.runtimeFingerprint,
    );
    expect(
      scheduledSetupFailureIssueBody(
        failure,
        "https://github.com/brandon-y-lee/mei-pelle/actions/runs/123",
      ),
    ).toContain("mei-pelle:scheduled-webkit-state");
  });

  it("reconciles classified evidence failures through the shared operational orchestrator", async () => {
    const setupFailure = createScheduledSetupFailure({
      browserVersion: "1.55.1",
      planSource: "plan-source",
      runtimeIdentity: "runtime-identity",
    });
    const failure = createScheduledFallbackFailure({
      classifiedEvidence: {
        identity: setupFailure.identity,
        outcome: "passed",
      },
    });
    const updates: unknown[] = [];
    const issueNumber = await recordScheduledVerificationFailure({
      async findActive() {
        return { ...failure, number: 154 };
      },
      async create() {
        throw new Error("an active reconciliation failure must be reused");
      },
      async update(number: number, nextFailure: ScheduledVerificationFailure) {
        updates.push({ number, failure: nextFailure });
      },
      async close() {},
    }, failure);

    expect(issueNumber).toBe(154);
    expect(failure).toMatchObject({
      kind: "reconciliation-failed",
      summary: "Operational issue reconciliation failed after complete WebKit verification passed.",
    });
    expect(createScheduledFallbackFailure({
      classifiedEvidence: {
        failureKind: "browser-failed",
        identity: setupFailure.identity,
        outcome: "failed",
      },
    })).toMatchObject({
      kind: "browser-failed",
      summary: "Complete WebKit verification failed for current dev and Catalog facts.",
    });
    expect(updates).toEqual([{ number: 154, failure }]);
  });

  it("keeps Windows and Product Media outside required pull-request CI", () => {
    const ci = workflow("ci.yml");
    const productMedia = workflow("active-product-media-verification.yml");

    expect(ci.jobs["verification-lifecycle-windows"]).toBeUndefined();
    expect(productMedia.on).toEqual({
      schedule: [{ cron: "0 0 * * *" }],
      workflow_dispatch: null,
    });
    expect(
      productMedia.jobs.verify!.steps.some(
        (step) => step.run?.includes("pnpm verify:product-media -- --json") === true,
      ),
    ).toBe(true);
  });

  it("exposes thin command adapters for both lifecycle lanes", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };

    expect(packageJson.scripts["verify:scheduled"]).toBe(
      "tsx scripts/github/run-scheduled-browser-verification.ts",
    );
    expect(packageJson.scripts["verification:lifecycle:windows"]).toBe(
      "tsx scripts/github/run-windows-lifecycle-verification.ts",
    );
    expect(windowsLifecycleVitestInvocation()).toEqual({
      command: process.execPath,
      args: [
        expect.stringMatching(/vitest[\\/]vitest\.mjs$/),
        "run",
        "tests/production-verification.test.ts",
        "tests/production-verification-process.test.ts",
      ],
    });
  });
});
