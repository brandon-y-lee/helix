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
    readBuildReuseInput: unexpected,
    readCommitSha: unexpected,
    readReceipt: unexpected,
    readReusableBuildReceipt: unexpected,
    removeReceipt: async () => {},
    removeReusableBuildReceipt: async () => {},
    report: () => {},
    runBrowserTests: unexpected,
    selectFreePort: unexpected,
    startServer: unexpected,
    waitForBuildIdentity: unexpected,
    writeReceipt: unexpected,
    writeReusableBuildReceipt: unexpected,
    ...overrides,
  };
}
