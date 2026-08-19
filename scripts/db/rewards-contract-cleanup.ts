export type CleanupAttempt = {
  label: string;
  run: () => Promise<void>;
};

export async function runCleanupAttempts(
  attempts: readonly CleanupAttempt[],
): Promise<void> {
  const failed: string[] = [];

  for (const attempt of attempts) {
    try {
      await attempt.run();
    } catch {
      failed.push(attempt.label);
    }
  }

  if (failed.length > 0) {
    throw new Error(`Remote cleanup failed for ${failed.join(", ")}.`);
  }
}
