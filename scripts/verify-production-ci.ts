import { runProductionVerificationCiCommand } from "./production-verification-ci-command";
import { runProductionVerificationCli } from "./production-verification-cli";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import { BROWSER_VERIFICATION_PLAN } from "./browser-verification-plan";

const candidateCwd = process.env.VERIFICATION_CANDIDATE_CWD
  ? resolve(process.env.VERIFICATION_CANDIDATE_CWD)
  : process.cwd();

runProductionVerificationCli(async (signal) => {
  const startedAt = Date.now();
  const resultPath = process.env.VERIFICATION_BROWSER_RESULT_PATH;
  const argv = process.argv.slice(2);
  try {
    const result = await runProductionVerificationCiCommand({
      argv,
      cwd: candidateCwd,
      env: process.env,
      requestedPort: process.env.PORT,
      signal,
    });
    if (result.operation !== "verify" || !resultPath) return;
    await writeFile(
      resultPath,
      JSON.stringify({
        attempts: result.retries + 1,
        buildId: result.buildId,
        outcome: result.outcome,
        telemetry: {
          browserCaseExecutions: BROWSER_VERIFICATION_PLAN.journeys.length,
          buildReuse: "new",
          completePlanRuns: 1,
          failureClassification: result.retries > 0 ? "unstable" : "none",
          retries: result.retries,
          selectedCapabilities: ["complete-plan"],
          testTimeMs: Date.now() - startedAt,
        },
      }),
      { encoding: "utf8", mode: 0o600 },
    );
  } catch (error) {
    if (argv[0] === "verify" && resultPath) {
      const retryCount = typeof (error as { retryCount?: unknown })?.retryCount === "number"
        ? (error as { retryCount: number }).retryCount
        : null;
      await writeFile(
        resultPath,
        JSON.stringify({
          outcome: "failed",
          telemetry: {
            browserCaseExecutions:
              retryCount === null ? null : BROWSER_VERIFICATION_PLAN.journeys.length,
            buildReuse: retryCount === null ? null : "new",
            completePlanRuns: retryCount === null ? 0 : 1,
            failureClassification: "failed",
            retries: retryCount,
            selectedCapabilities: retryCount === null ? [] : ["complete-plan"],
            testTimeMs: retryCount === null ? null : Date.now() - startedAt,
          },
        }),
        { encoding: "utf8", mode: 0o600 },
      );
    }
    throw error;
  }
});
