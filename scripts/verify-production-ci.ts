import { runProductionVerificationCiCommand } from "./production-verification-ci-command";
import { runProductionVerificationCli } from "./production-verification-cli";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";

const candidateCwd = process.env.VERIFICATION_CANDIDATE_CWD
  ? resolve(process.env.VERIFICATION_CANDIDATE_CWD)
  : process.cwd();

runProductionVerificationCli(async (signal) => {
  const result = await runProductionVerificationCiCommand({
    argv: process.argv.slice(2),
    cwd: candidateCwd,
    env: process.env,
    requestedPort: process.env.PORT,
    signal,
  });
  if (result.operation === "verify" && process.env.VERIFICATION_BROWSER_RESULT_PATH) {
    await writeFile(
      process.env.VERIFICATION_BROWSER_RESULT_PATH,
      JSON.stringify({
        attempts: result.retries + 1,
        buildId: result.buildId,
        outcome: result.outcome,
      }),
      { encoding: "utf8", mode: 0o600 },
    );
  }
});
