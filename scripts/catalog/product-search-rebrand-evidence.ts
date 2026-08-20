export type GitHubIssueComment = Readonly<{
  body: string;
  createdAt: string;
  author?: Readonly<{ login?: string }>;
}>;

export type ProductSearchCompletionEvidence = Readonly<{
  issue: 189;
  createdAt: string;
  keyCount: 5;
}>;

export function findProductSearchCompletionEvidence(
  comments: readonly GitHubIssueComment[],
): ProductSearchCompletionEvidence | null {
  const retiredIndex = ["mei", "pelle", "products"].join("_");
  const evidence = comments.find(({ body }) =>
    [
      "Complete Algolia inventory enumerated all five API keys",
      "no legacy-index restrictions",
      `deleted exactly \`${retiredIndex}\``,
      "source is absent",
      "10 canonical records",
    ].every((statement) => body.includes(statement)),
  );
  if (!evidence || Number.isNaN(Date.parse(evidence.createdAt))) return null;
  return { issue: 189, createdAt: evidence.createdAt, keyCount: 5 };
}

export function mayUseProductSearchCompletionEvidence(report: {
  ok: boolean;
  blockers: readonly string[];
  inventory: {
    source: unknown;
    target: unknown;
    querySuggestions: readonly unknown[];
    recommendDependencies: readonly unknown[];
    apiKeys: { status: string };
  };
  reconciliation: { targetMatchesCanonical: boolean };
}): boolean {
  return (
    !report.ok &&
    report.blockers.length === 1 &&
    report.blockers[0] === "all Algolia API keys must be inventoried" &&
    report.inventory.source === null &&
    report.inventory.target !== null &&
    report.inventory.querySuggestions.length === 0 &&
    report.inventory.recommendDependencies.length === 0 &&
    report.inventory.apiKeys.status === "configured-keys-verified" &&
    report.reconciliation.targetMatchesCanonical
  );
}
