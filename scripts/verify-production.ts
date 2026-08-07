import { verifyFreshProductionArtifact } from "./production-verification";
import { runProductionVerificationCli } from "./production-verification-cli";
import {
  createNodeProductionVerificationAdapters,
  readProductionVerificationEnvironment,
} from "./production-verification-node";

runProductionVerificationCli(async (signal) => {
  const cwd = process.cwd();
  const env = await readProductionVerificationEnvironment(cwd);
  const adapters = await createNodeProductionVerificationAdapters(cwd, env);
  const result = await verifyFreshProductionArtifact(
    { requestedPort: process.env.PORT, signal },
    adapters,
  );
  console.log(
    `Production verification passed for build ${result.buildId} at ${result.baseURL}.`,
  );
});
