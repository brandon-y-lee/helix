import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  observedPlaywrightEfficiency,
  writeTrustedIntegrationEfficiency,
} from "@/scripts/github/integration-efficiency-command";

describe("trusted Integration efficiency record", () => {
  it("counts observed Playwright executions, retries, and result durations", () => {
    expect(observedPlaywrightEfficiency({
      suites: [{
        specs: [{ tests: [{ results: [
          { duration: 120, retry: 0 },
          { duration: 80, retry: 1 },
        ] }] }],
        suites: [{ specs: [{ tests: [{ results: [{ duration: 30, retry: 0 }] }] }] }],
      }],
    })).toEqual({ browserCaseExecutions: 3, retries: 1, testTimeMs: 230 });
  });

  it("ignores a candidate-precreated report when the trusted browser step never ran", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "mei-pelle-efficiency-spoof-"));
    const playwrightPath = resolve(directory, "candidate-playwright.json");
    const outputPath = resolve(directory, "trusted-result.json");
    await writeFile(playwrightPath, JSON.stringify({
      suites: [{ specs: [{ tests: [{ results: [{ duration: 999, retry: 99 }] }] }] }],
    }));
    try {
      await expect(writeTrustedIntegrationEfficiency({
        browserStepOutcome: "skipped",
        outputPath,
        playwrightPath,
      })).resolves.toMatchObject({
        browserCaseExecutions: null,
        buildReuse: null,
        completePlanRuns: 0,
        failureClassification: "failed",
        retries: null,
        selectedCapabilities: [],
        testTimeMs: null,
      });
      await expect(readFile(outputPath, "utf8")).resolves.not.toContain("999");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
