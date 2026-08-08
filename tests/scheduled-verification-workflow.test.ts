import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

type Workflow = {
  concurrency?: { "cancel-in-progress"?: boolean; group?: string };
  jobs: Record<string, {
    "runs-on": string;
    steps: Array<{ name?: string; run?: string }>;
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
    expect(scheduled.jobs["complete-webkit"]!["runs-on"]).toBe("ubuntu-latest");
    expect(steps.some((step) => step.run === "pnpm exec playwright install --with-deps webkit")).toBe(true);
    expect(steps.some((step) => step.run === "pnpm verify:scheduled -- --lane webkit")).toBe(true);
  });

  it("runs Windows lifecycle evidence only for relevant pull requests, schedule, or manual dispatch", () => {
    const windows = workflow("verification-lifecycle-windows.yml");
    const pullRequest = windows.on.pull_request as {
      branches: string[];
      paths: string[];
    };

    expect(windows.on.schedule).toEqual([{ cron: "41 7 * * 1" }]);
    expect(windows.on.workflow_dispatch).toBeNull();
    expect(pullRequest.branches).toEqual(["dev", "main"]);
    expect(pullRequest.paths).toEqual(expect.arrayContaining([
      ".github/workflows/**",
      "scripts/github/**",
      "scripts/production-verification*",
      "tests/production-verification*",
      "package.json",
      "pnpm-lock.yaml",
    ]));
    expect(pullRequest.paths).not.toEqual(expect.arrayContaining(["app/**", "components/**", "docs/**"]));
    expect(windows.permissions).toEqual({ contents: "read" });
    expect(windows.jobs["verification-lifecycle-windows"]!["runs-on"]).toBe("windows-latest");
    expect(
      windows.jobs["verification-lifecycle-windows"]!.steps.some(
        (step) => step.run === "pnpm verification:lifecycle:windows",
      ),
    ).toBe(true);
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
  });
});
