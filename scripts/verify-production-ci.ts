import { runProductionVerificationCiCommand } from "./production-verification-ci-command";
import { runProductionVerificationCli } from "./production-verification-cli";
import { resolve } from "node:path";

const candidateCwd = process.env.VERIFICATION_CANDIDATE_CWD
  ? resolve(process.env.VERIFICATION_CANDIDATE_CWD)
  : process.cwd();

runProductionVerificationCli((signal) =>
  runProductionVerificationCiCommand({
    argv: process.argv.slice(2),
    cwd: candidateCwd,
    env: process.env,
    requestedPort: process.env.PORT,
    signal,
  }),
);
