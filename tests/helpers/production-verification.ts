import type { NodeProductionVerificationAdapters } from "@/scripts/production-verification";

export function makeProductionVerificationAdapters(
  overrides: Partial<NodeProductionVerificationAdapters>,
): NodeProductionVerificationAdapters {
  const unexpected = async (): Promise<never> => {
    throw new Error("Unexpected production-verification adapter call.");
  };

  return {
    acquireLock: async () => ({ release: async () => {} }),
    build: unexpected,
    isPortAvailable: unexpected,
    now: () => 0,
    readArtifact: unexpected,
    readCommitSha: unexpected,
    readReceipt: unexpected,
    removeReceipt: async () => {},
    report: () => {},
    runBrowserTests: unexpected,
    selectFreePort: unexpected,
    startServer: unexpected,
    waitForBuildIdentity: unexpected,
    writeReceipt: unexpected,
    ...overrides,
  };
}
