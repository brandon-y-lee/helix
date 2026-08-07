import { ProductionVerificationError } from "./production-verification";

type ProductionVerificationCliRuntime = {
  error: (message: string) => void;
  off: (event: "SIGINT" | "SIGTERM", listener: () => void) => unknown;
  once: (event: "SIGINT" | "SIGTERM", listener: () => void) => unknown;
};

export async function executeProductionVerificationCli(
  operation: (signal: AbortSignal) => Promise<void>,
  runtime: ProductionVerificationCliRuntime = {
    error: (message) => console.error(message),
    off: (event, listener) => process.off(event, listener),
    once: (event, listener) => process.once(event, listener),
  },
): Promise<0 | 1> {
  const controller = new AbortController();
  const interrupt = (signal: NodeJS.Signals) => {
    controller.abort(new Error(`Production verification interrupted by ${signal}.`));
  };
  const onSigint = () => interrupt("SIGINT");
  const onSigterm = () => interrupt("SIGTERM");
  runtime.once("SIGINT", onSigint);
  runtime.once("SIGTERM", onSigterm);

  try {
    await operation(controller.signal);
    return 0;
  } catch (error) {
    runtime.error(
      error instanceof Error ? error.message : "Production verification failed.",
    );
    if (error instanceof ProductionVerificationError && error.cleanupFailure) {
      runtime.error(`Cleanup also failed: ${error.cleanupFailure.message}`);
    }
    return 1;
  } finally {
    runtime.off("SIGINT", onSigint);
    runtime.off("SIGTERM", onSigterm);
  }
}

export function runProductionVerificationCli(
  operation: (signal: AbortSignal) => Promise<void>,
): void {
  void executeProductionVerificationCli(operation).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
