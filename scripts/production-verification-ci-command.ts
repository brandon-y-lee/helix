import {
  buildReceiptedProductionArtifact,
  verifyReceiptedProductionArtifact,
  type NodeProductionVerificationAdapters,
} from "./production-verification";
import {
  createNodeProductionVerificationAdapters,
  readProductionVerificationEnvironment,
} from "./production-verification-node";
import { BROWSER_VERIFICATION_PLAN } from "./browser-verification-plan";

type CiOperation = "build" | "verify";

function readOperation(argv: string[], env: NodeJS.ProcessEnv): {
  operation: CiOperation;
  routineChromium: boolean;
} {
  if (env.CI !== "true" || env.GITHUB_ACTIONS !== "true") {
    throw new Error(
      "Receipted production artifact commands are restricted to GitHub Actions.",
    );
  }
  const routineChromium =
    argv.length === 3 &&
    argv[0] === "verify" &&
    argv[1] === "--selection" &&
    argv[2] === "routine-chromium";
  if (
    !routineChromium &&
    (argv.length !== 1 || (argv[0] !== "build" && argv[0] !== "verify"))
  ) {
    throw new Error(
      "Receipted production artifact command requires exactly one operation: build or verify.",
    );
  }
  return { operation: argv[0] as CiOperation, routineChromium };
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
  const { operation, routineChromium } = readOperation(input.argv, input.env);
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
    {
      browserSelection: routineChromium
        ? {
            journeyIds: BROWSER_VERIFICATION_PLAN.journeys.map(({ id }) => id),
            projects: ["chromium"],
            retries: 0,
          }
        : undefined,
      requestedPort: input.requestedPort,
      signal: input.signal,
    },
    adapters,
  );
  log(
    `Receipted production verification passed for build ${result.buildId} at ${result.baseURL}.`,
  );
}
