import { runProductionVerificationCiCommand } from "./production-verification-ci-command";
import { runProductionVerificationCli } from "./production-verification-cli";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";

const candidateCwd = process.env.VERIFICATION_CANDIDATE_CWD
  ? resolve(process.env.VERIFICATION_CANDIDATE_CWD)
  : process.cwd();

runProductionVerificationCli(async (signal) => {
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
          attempts: retryCount === null ? null : retryCount + 1,
          outcome: "failed",
        }),
        { encoding: "utf8", mode: 0o600 },
      );
    }
    throw error;
  }
});
