import { describe, expect, it } from "vitest";

import {
  createRepositoryAdapter,
  toIntegrationCandidate,
  type CommandAdapter,
} from "@/scripts/github/run-integration-coordinator";

function pullRequestFact(overrides: Record<string, unknown> = {}) {
  return {
    number: 52,
    baseRefName: "dev",
    headRefOid: "a".repeat(40),
    isDraft: false,
    mergeable: "MERGEABLE",
    createdAt: "2026-08-08T07:00:00.000Z",
    updatedAt: "2026-08-08T08:00:00.000Z",
    body: "## Workflow path\n\n- Path: normal ticket\n- Fast-path proof: N/A\n",
    labels: [{ name: "workflow:integration-queued" }],
    files: [{ path: ".github/workflows/dev-integration.yml" }],
    statusCheckRollup: [
      { name: "ci", status: "COMPLETED", conclusion: "SUCCESS" },
    ],
    ...overrides,
  };
}

describe("GitHub Integration Coordinator adapter", () => {
  it("fails closed to verification-system work from current pull-request facts", () => {
    const candidate = toIntegrationCandidate(pullRequestFact());

    expect(candidate).toEqual({
      number: 52,
      target: "dev",
      headSha: "a".repeat(40),
      readyAt: "2026-08-08T07:00:00.000Z",
      workClass: "verification-system",
      changedFiles: [".github/workflows/dev-integration.yml"],
      riskAreas: ["provider", "cross-cutting"],
      labels: ["workflow:integration-queued"],
      ready: true,
    });
  });

  it("keeps review handoffs out of the ready queue", () => {
    const candidate = toIntegrationCandidate(
      pullRequestFact({ labels: [{ name: "workflow:review" }] }),
    );

    expect(candidate.ready).toBe(false);
  });

  it("requires exact changed-path proof for a trivial fast path", () => {
    const candidate = toIntegrationCandidate(
      pullRequestFact({
        body: [
          "## Workflow path",
          "",
          "- Path: trivial",
          "- Fast-path proof: `docs/operator-guide.md`, `README.md`",
        ].join("\n"),
        files: [{ path: "README.md" }, { path: "docs/operator-guide.md" }],
      }),
    );

    expect(candidate.fastPathProof).toEqual(["README.md", "docs/operator-guide.md"]);
  });

  it("uses the latest ready-for-review event instead of mutable PR updates", async () => {
    const commands: CommandAdapter = {
      async run(_command, args) {
        const joined = args.join(" ");
        if (joined.includes("git/ref/heads/dev")) {
          return { stdout: `${"d".repeat(40)}\n`, stderr: "", status: 0 };
        }
        if (args[0] === "pr" && args[1] === "list") {
          return {
            stdout: JSON.stringify([pullRequestFact({ labels: [] })]),
            stderr: "",
            status: 0,
          };
        }
        if (args[0] === "api" && args[1] === "graphql") {
          return {
            stdout: JSON.stringify({
              data: {
                repository: {
                  pullRequests: {
                    nodes: [{
                      number: 52,
                      createdAt: "2026-08-08T07:00:00.000Z",
                      timelineItems: {
                        nodes: [{
                          __typename: "ReadyForReviewEvent",
                          createdAt: "2026-08-08T07:30:00.000Z",
                        }],
                      },
                    }],
                  },
                },
              },
            }),
            stderr: "",
            status: 0,
          };
        }
        throw new Error(`unexpected command: ${joined}`);
      },
    };

    const snapshot = await createRepositoryAdapter("owner/repo", commands).read();

    expect(snapshot.candidates[0]?.readyAt).toBe("2026-08-08T07:30:00.000Z");
  });

  it("compensates a changed-input claim so no false active owner remains", async () => {
    let readCount = 0;
    const edits: string[][] = [];
    const commands: CommandAdapter = {
      async run(_command, args) {
        const joined = args.join(" ");
        if (joined.includes("git/ref/heads/dev")) {
          return { stdout: `${"d".repeat(40)}\n`, stderr: "", status: 0 };
        }
        if (args[0] === "pr" && args[1] === "list") {
          readCount += 1;
          return {
            stdout: JSON.stringify([
              pullRequestFact({
                headRefOid: (readCount === 1 ? "a" : "b").repeat(40),
                labels: [
                  { name: readCount === 1 ? "workflow:integration-queued" : "workflow:integration-active" },
                ],
              }),
            ]),
            stderr: "",
            status: 0,
          };
        }
        if (args[0] === "api" && args[1] === "graphql") {
          return {
            stdout: JSON.stringify({
              data: {
                repository: {
                  pullRequests: {
                    nodes: [{
                      number: 52,
                      createdAt: "2026-08-08T07:00:00.000Z",
                      timelineItems: { nodes: [] },
                    }],
                  },
                },
              },
            }),
            stderr: "",
            status: 0,
          };
        }
        if (args[0] === "issue" && args[1] === "edit") {
          edits.push(args);
          return { stdout: "", stderr: "", status: 0 };
        }
        throw new Error(`unexpected command: ${joined}`);
      },
    };
    const repository = createRepositoryAdapter("owner/repo", commands);

    await expect(
      repository.claim({ number: 52, baseSha: "d".repeat(40), headSha: "a".repeat(40) }),
    ).resolves.toBe(false);

    expect(edits).toHaveLength(2);
    expect(edits[1]).toEqual(expect.arrayContaining([
      "--add-label",
      "workflow:review",
      "--remove-label",
      "workflow:integration-active",
    ]));
  });
});
