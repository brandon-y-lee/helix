import {
  buildReceiptedProductionArtifact,
  verifyReceiptedProductionArtifact,
  type NodeProductionVerificationAdapters,
} from "./production-verification";
import {
  createNodeProductionVerificationAdapters,
  readProductionVerificationEnvironment,
} from "./production-verification-node";

type CiOperation = "build" | "verify";

function readOperation(argv: string[], env: NodeJS.ProcessEnv): CiOperation {
  if (env.CI !== "true" || env.GITHUB_ACTIONS !== "true") {
    throw new Error(
      "Receipted production artifact commands are restricted to GitHub Actions.",
    );
  }
  if (argv.length !== 1 || (argv[0] !== "build" && argv[0] !== "verify")) {
    throw new Error(
      "Receipted production artifact command requires exactly one operation: build or verify.",
    );
  }
  return argv[0];
}

export async function runProductionVerificationCiCommand(input: {
  adapters?: NodeProductionVerificationAdapters;
  argv: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  log?: (message: string) => void;
  requestedPort?: string;
  signal?: AbortSignal;
}): Promise<void> {
  const operation = readOperation(input.argv, input.env);
  const adapters =
    input.adapters ??
    (await createNodeProductionVerificationAdapters(
      input.cwd,
      await readProductionVerificationEnvironment(input.cwd, input.env),
    ));
  const log = input.log ?? console.log;

  if (operation === "build") {
    const receipt = await buildReceiptedProductionArtifact(
      { signal: input.signal },
      adapters,
    );
    log(`Receipted production build passed for build ${receipt.buildId}.`);
    return;
  }

  const result = await verifyReceiptedProductionArtifact(
    { requestedPort: input.requestedPort, signal: input.signal },
    adapters,
  );
  log(
    `Receipted production verification passed for build ${result.buildId} at ${result.baseURL}.`,
  );
}
