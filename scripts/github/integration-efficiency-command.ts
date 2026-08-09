import { readFile, writeFile } from "node:fs/promises";

import type { VerificationEfficiencyTelemetry } from "./verification-orchestrator";

type PlaywrightResult = { duration?: unknown; retry?: unknown };
type PlaywrightTest = { results?: unknown };
type PlaywrightSpec = { tests?: unknown };
type PlaywrightSuite = { specs?: unknown; suites?: unknown };

export function observedPlaywrightEfficiency(report: unknown): {
  browserCaseExecutions: number;
  retries: number;
  testTimeMs: number;
} {
  let browserCaseExecutions = 0;
  let retries = 0;
  let testTimeMs = 0;
  const visitSuite = (suite: PlaywrightSuite) => {
    for (const spec of Array.isArray(suite.specs) ? suite.specs as PlaywrightSpec[] : []) {
      for (const test of Array.isArray(spec.tests) ? spec.tests as PlaywrightTest[] : []) {
        for (const result of Array.isArray(test.results) ? test.results as PlaywrightResult[] : []) {
          browserCaseExecutions += 1;
          if (typeof result.retry === "number" && result.retry > 0) retries += 1;
          if (typeof result.duration === "number" && result.duration >= 0) {
            testTimeMs += result.duration;
          }
        }
      }
    }
    for (const child of Array.isArray(suite.suites) ? suite.suites as PlaywrightSuite[] : []) {
      visitSuite(child);
    }
  };
  const root = report as { suites?: unknown };
  for (const suite of Array.isArray(root?.suites) ? root.suites as PlaywrightSuite[] : []) {
    visitSuite(suite);
  }
  return { browserCaseExecutions, retries, testTimeMs };
}

export async function writeTrustedIntegrationEfficiency(input: {
  browserStepOutcome: string;
  outputPath: string;
  playwrightPath: string;
}): Promise<VerificationEfficiencyTelemetry> {
  const ran = input.browserStepOutcome === "success" || input.browserStepOutcome === "failure";
  let observed: ReturnType<typeof observedPlaywrightEfficiency> | undefined;
  if (ran) {
    try {
      observed = observedPlaywrightEfficiency(
        JSON.parse(await readFile(input.playwrightPath, "utf8")),
      );
    } catch {
      observed = undefined;
    }
  }
  const telemetry: VerificationEfficiencyTelemetry = {
    browserCaseExecutions: observed?.browserCaseExecutions ?? null,
    buildReuse: observed && observed.browserCaseExecutions > 0 ? "new" : null,
    completePlanRuns: observed && observed.browserCaseExecutions > 0 ? 1 : 0,
    failureClassification:
      input.browserStepOutcome === "success"
        ? (observed?.retries ? "unstable" : "none")
        : "failed",
    retries: observed?.retries ?? null,
    selectedCapabilities:
      observed && observed.browserCaseExecutions > 0 ? ["complete-plan"] : [],
    testTimeMs: observed?.testTimeMs ?? null,
  };
  await writeFile(input.outputPath, `${JSON.stringify({ telemetry })}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  return telemetry;
}

async function main() {
  const outputPath = process.env.INTEGRATION_EFFICIENCY_OUTPUT_PATH;
  const playwrightPath = process.env.PLAYWRIGHT_JSON_OUTPUT_FILE;
  const browserStepOutcome = process.env.INTEGRATION_BROWSER_STEP_OUTCOME;
  if (!outputPath || !playwrightPath || !browserStepOutcome) {
    throw new Error("trusted Integration efficiency paths and browser outcome are required");
  }
  await writeTrustedIntegrationEfficiency({ browserStepOutcome, outputPath, playwrightPath });
}

if (process.argv[1]?.endsWith("integration-efficiency-command.ts")) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `integration-efficiency: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
