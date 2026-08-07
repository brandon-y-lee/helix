import {
  buildReceiptedProductionArtifact,
  ProductionVerificationError,
  verifyReceiptedProductionArtifact,
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

async function main(): Promise<void> {
  const operation = readOperation(process.argv.slice(2), process.env);
  const cwd = process.cwd();
  const env = await readProductionVerificationEnvironment(cwd);
  const adapters = await createNodeProductionVerificationAdapters(cwd, env);
  const controller = new AbortController();
  const interrupt = (signal: NodeJS.Signals) => {
    controller.abort(new Error(`Production verification interrupted by ${signal}.`));
  };
  const onSigint = () => interrupt("SIGINT");
  const onSigterm = () => interrupt("SIGTERM");
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);

  try {
    if (operation === "build") {
      const receipt = await buildReceiptedProductionArtifact(
        { signal: controller.signal },
        adapters,
      );
      console.log(`Receipted production build passed for build ${receipt.buildId}.`);
      return;
    }

    const result = await verifyReceiptedProductionArtifact(
      { requestedPort: process.env.PORT, signal: controller.signal },
      adapters,
    );
    console.log(
      `Receipted production verification passed for build ${result.buildId} at ${result.baseURL}.`,
    );
  } finally {
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Production verification failed.",
  );
  if (error instanceof ProductionVerificationError && error.cleanupFailure) {
    console.error(`Cleanup also failed: ${error.cleanupFailure.message}`);
  }
  process.exitCode = 1;
});
