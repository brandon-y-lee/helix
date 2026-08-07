import { runProductionVerificationCiCommand } from "./production-verification-ci-command";
import { runProductionVerificationCli } from "./production-verification-cli";

runProductionVerificationCli((signal) =>
  runProductionVerificationCiCommand({
    argv: process.argv.slice(2),
    cwd: process.cwd(),
    env: process.env,
    requestedPort: process.env.PORT,
    signal,
  }),
);
