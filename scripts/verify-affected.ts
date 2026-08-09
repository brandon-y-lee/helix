import {
  readAffectedBrowserVerificationChangedFiles,
  runAffectedBrowserVerificationCommand,
} from "./affected-browser-verification";
import { runProductionVerificationCli } from "./production-verification-cli";
import {
  createNodeProductionVerificationAdapters,
  readProductionVerificationEnvironment,
} from "./production-verification-node";

runProductionVerificationCli(async (signal) => {
  const cwd = process.cwd();
  const env = await readProductionVerificationEnvironment(cwd);
  const productionAdapters = await createNodeProductionVerificationAdapters(
    cwd,
    env,
  );
  const result = await runAffectedBrowserVerificationCommand({
    adapters: {
      ...productionAdapters,
      readChangedFiles: (baseRef) =>
        readAffectedBrowserVerificationChangedFiles(cwd, baseRef),
    },
    argv: process.argv.slice(2),
    env: process.env,
    log: (message) => console.log(`[affected-verification] ${message}`),
    signal,
  });
  console.log(
    `Affected browser verification passed for build ${result.buildId} against ${result.baseRef} with ${result.fingerprint}.`,
  );
});
