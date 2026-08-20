import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FORMER_BRAND_NAME,
  FORMER_BRAND_PATTERN,
  FORMER_REPOSITORY,
} from "@/tests/helpers/former-identifiers";

const projectRoot = process.cwd();

function readProjectFile(path: string): string {
  return readFileSync(resolve(projectRoot, path), "utf8");
}

describe("helix repository and deployment identity", () => {
  it("uses the helix package and GitHub repository identity", () => {
    const manifest = JSON.parse(readProjectFile("package.json")) as {
      name: string;
      scripts: Record<string, string>;
    };
    const workflowBootstrap = readProjectFile(
      "scripts/github/bootstrap-workflow.mjs",
    );

    expect(manifest.name).toBe("helix");
    expect(manifest.scripts["github:workflow:plan"]).toContain(
      "--repo brandon-y-lee/helix",
    );
    expect(manifest.scripts["github:workflow:verify"]).toContain(
      "verify --repo brandon-y-lee/helix",
    );
    expect(manifest.scripts["github:workflow:apply"]).toContain(
      "--repo brandon-y-lee/helix",
    );
    expect(workflowBootstrap).toContain(
      'const EXPECTED_REPOSITORY = "brandon-y-lee/helix";',
    );
    expect(`${JSON.stringify(manifest)}\n${workflowBootstrap}`).not.toContain(
      FORMER_REPOSITORY,
    );
  });

  it("uses helix names for the operator environment contract", () => {
    const adminBootstrap = readProjectFile("scripts/admin-bootstrap.ts");
    const environmentExample = readProjectFile(".env.example");
    const contract = `${adminBootstrap}\n${environmentExample}`;

    for (const name of [
      "HELIX_ADMIN_USER_ID",
      "HELIX_ADMIN_EMAIL",
      "HELIX_ADMIN_ROLE",
    ]) {
      expect(contract).toContain(name);
    }
    expect(contract).not.toMatch(
      new RegExp(
        `${FORMER_BRAND_PATTERN.source}_ADMIN_(?:USER_ID|EMAIL|ROLE)`,
        "i",
      ),
    );
  });

  it("uses helix names for local workflow and verification artifacts", () => {
    const toolingContract = [
      ".gitignore",
      "playwright.config.ts",
      "scripts/git/codex-task.sh",
      "scripts/production-verification-node.ts",
      "scripts/production-verification.ts",
      "test-support/storefront-snapshot-artifact.ts",
    ]
      .map(readProjectFile)
      .join("\n");

    for (const identity of [
      ".helix-codex-task",
      "helix-task-",
      ".helix-production-verification.lock",
      ".next/helix-artifact-receipt.json",
      "HELIX_VERIFICATION_ADAPTER",
      "HELIX_VERIFICATION_BASE_URL",
      "HELIX_STOREFRONT_SNAPSHOT_PATH",
    ]) {
      expect(toolingContract).toContain(identity);
    }
    expect(toolingContract).not.toMatch(FORMER_BRAND_PATTERN);
  });

  it("documents the current helix repository and platform identity", () => {
    const currentPlatformDocs = [
      "README.md",
      "AGENTS.md",
      "docs/agents/domain.md",
      "docs/agents/engineering-workflow.md",
    ]
      .map(readProjectFile)
      .join("\n");
    const gitWorkflow = readProjectFile("docs/git-workflow.md");
    const hostnameRunbook = readProjectFile(
      "docs/operations/helix-public-hostname.md",
    );

    expect(readProjectFile("README.md")).toMatch(/^# helix$/m);
    expect(currentPlatformDocs).not.toContain(FORMER_BRAND_NAME);
    expect(gitWorkflow).toContain("--confirm-repo brandon-y-lee/helix");
    expect(hostnameRunbook).toContain(
      "Connected repository: `brandon-y-lee/helix`",
    );
  });
});
