import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import example from "../scripts/release/catalog-profile.example.json";
import { run } from "../scripts/release/command.mjs";
import { bindProtectedValues, inspectionProfile } from "./fixtures/inspection-release-profile";

const sha256 = (raw: string) => createHash("sha256").update(raw, "utf8").digest("hex");
const candidate = { id: "dpl_candidate", sha: "b".repeat(40), url: "https://candidate.vercel.app" };
const original = { id: example.legacyPrevious.deploymentId, sha: example.legacyPrevious.sha, url: "https://original.vercel.app" };
let previous = original;
let serving: "previous" | "candidate";
const pair = () => ({ previousId: previous.id, previousSha: previous.sha,
  candidateId: candidate.id, candidateSha: candidate.sha });
let recoveredPair: ReturnType<typeof pair>;
const source = { mergedSha: async () => candidate.sha, releasePrForCommit: async () => 580,
  verifyPr: vi.fn(), assertMainHead: vi.fn() };
const inspect = async () => ({ candidate, previous, serving });
const vercel = { assertHeldProject: vi.fn(), candidateForSha: async () => candidate,
  discoverPrevious: async () => previous, inspect, inspectRecovery: inspect,
  promote: vi.fn(() => { serving = "candidate"; }), rollback: vi.fn() };
const writer = {
  admit: vi.fn<(op: string, release: ReturnType<typeof pair>, limited: boolean) => boolean>(),
  change: vi.fn(() => true), recorded: vi.fn(() => recoveredPair),
};
const probe = vi.fn();
const migrate = vi.fn(() => candidate.sha);

vi.mock("../scripts/release/github.mjs", () => ({ createReleaseSource: () => source }));
vi.mock("../scripts/release/vercel.mjs", () => ({ createVercelRelease: () => vercel }));
vi.mock("../scripts/release/writer.mjs", () => ({
  withReleaseWriter: (_env: unknown, handler: (registry: typeof writer) => unknown) => handler(writer),
}));
vi.mock("../scripts/release/observations.mjs", async importOriginal => ({
  ...await importOriginal<typeof import("../scripts/release/observations.mjs")>(),
  verifyReleaseObservations: (...args: unknown[]) => probe(...args),
}));

let directory: string;
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-20T02:00:00.000Z"));
  previous = original;
  serving = "previous";
  recoveredPair = pair();
  writer.admit.mockReturnValue(true);
  directory = mkdtempSync(join(tmpdir(), "helix-release-test-"));
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(directory, { force: true, recursive: true });
});

async function stageCommand(command: string, env: NodeJS.ProcessEnv) {
  const outputPath = join(directory, "job-output");
  writeFileSync(outputPath, "");
  await run(command, { ...env, GITHUB_OUTPUT: outputPath });
  return Object.fromEntries(readFileSync(outputPath, "utf8").trim().split("\n")
    .filter(Boolean).map(line => line.split("=")));
}

async function resolve(operation: string, profile: object) {
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test", RELEASE_OPERATION: operation, RELEASE_SELECTOR: "580", GITHUB_REPOSITORY_ID: "1280166759",
    GITHUB_SHA: candidate.sha };
  const output = await stageCommand("resolve", { ...env, HELIX_RELEASE_PROFILE: JSON.stringify(profile) });
  return { ...env, RELEASE_CONTEXT: output.context, RELEASE_CONTEXT_SHA256: output.context_sha256 };
}

async function admit(env: NodeJS.ProcessEnv) {
  const output = await stageCommand("admit", env);
  expect(output.admission_sha256).toBe(sha256(output.admission));
  return { ...env, RELEASE_ADMISSION_SHA256: output.admission_sha256 };
}

async function dispatch(operation: string, profile: object) {
  const env = await admit(await resolve(operation, profile));
  const applied = operation === "verify" || operation === "promote" ? migrate() : undefined;
  await run("execute", { ...env, RELEASE_APPLIED_SHA: applied });
}

function workflowBlock(source: string, heading: string) {
  const lines = source.split("\n");
  const start = lines.indexOf(heading);
  if (start < 0) throw new Error("Missing workflow heading " + heading.trim());
  const indent = heading.search(/\S/);
  const end = lines.findIndex((line, index) => index > start && /\S/.test(line) && line.search(/\S/) <= indent);
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n").trimEnd();
}

const writerCredentials = ["HELIX_MIGRATION_TARGET", "HELIX_MIGRATION_PASSWORD", "HELIX_MIGRATION_CA"];
const forwardWorkflow = readFileSync(".github/workflows/forward-migrations.yml", "utf8");
const writerJob = workflowBlock(forwardWorkflow, "  migrate:");
const applyStep = workflowBlock(writerJob, "      - name: Apply and verify the selected forward migrations");

it("passes exactly the named environment credentials to the reusable writer and preserves direct dev pushes", () => {
  const staged = readFileSync(".github/workflows/staged-production.yml", "utf8");
  const caller = workflowBlock(staged, "  migrate:");
  expect(caller).toContain("uses: ./.github/workflows/forward-migrations.yml");
  const bindings = writerCredentials.map(name => name + ": ${{ secrets." + name + " }}");
  expect(workflowBlock(caller, "    secrets:").split("\n").map(line => line.trim()).sort()).toEqual([...bindings].sort());
  const call = workflowBlock(forwardWorkflow, "  workflow_call:");
  const declarations = workflowBlock(call, "    secrets:");
  expect(declarations.match(/^      \S+:$/gm)?.map(line => line.trim().slice(0, -1)).sort()).toEqual([...writerCredentials].sort());
  for (const name of writerCredentials) {
    expect(workflowBlock(declarations, "      " + name + ":").trim()).toBe("required: true");
  }
  const stepEnv = workflowBlock(applyStep, "        env:").split("\n").map(line => line.trim());
  expect(stepEnv).toEqual(expect.arrayContaining(bindings));
  expect(writerJob).toContain("environment: ${{ needs.admit.outputs.environment }}");
  expect(workflowBlock(forwardWorkflow, "  push:").trim()).toBe("branches: [dev]");
});

it("stops before launching the writer when any protected credential is empty", () => {
  const script = workflowBlock(applyStep, "        run: |");
  const values = Object.fromEntries(writerCredentials.map(name => [name, "synthetic-private-" + name]));
  function execute(inputs: Record<string, string>) {
    return spawnSync("bash", ["-c", "node() { echo writer-invoked; }\n" + script], {
      encoding: "utf8",
      env: { ...inputs, NODE_ENV: "test", TARGET: "production", GITHUB_SHA: candidate.sha, GITHUB_OUTPUT: join(directory, "output") },
    });
  }
  for (const name of writerCredentials) {
    const result = execute({ ...values, [name]: "" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(name);
    expect(result.stdout + result.stderr).not.toMatch(/writer-invoked|synthetic-private-/);
  }
  const ready = execute(values);
  expect(ready.status).toBe(0);
  expect(ready.stdout.trim()).toBe("writer-invoked");
});

it("requires protected registry admission before the forward migration and execution", () => {
  const workflow = readFileSync(".github/workflows/staged-production.yml", "utf8");
  const jobs = workflow.split(/^  (?=[\w-]+:$)/m);
  const registry = jobs.find(job => job.includes("node scripts/release/command.mjs admit"));
  expect(registry).toBeDefined();
  const guard = registry!.split(":")[0];
  expect(registry).toContain("environment: helix-release-control");
  expect(registry).not.toContain("HELIX_RELEASE_VERCEL_CONTROL_TOKEN");
  const migration = jobs.find(job => job.startsWith("migrate:"));
  expect(migration?.match(/^    needs: (.+)$/m)?.[1]).toContain(guard);
  expect(migration).toContain("needs." + guard + ".outputs.admission_sha256 != ''");
  const reusable = readFileSync(".github/workflows/forward-migrations.yml", "utf8");
  for (const field of ["admission", "admission_sha256"]) {
    expect(registry).toContain(field + ": ${{ steps.admit.outputs." + field + " }}");
    expect(migration).toContain("release_" + field + ": ${{ needs." + guard + ".outputs." + field + " }}");
    expect(reusable).toContain("HELIX_RELEASE_" + field.toUpperCase() + ": ${{ inputs.release_" + field + " }}");
  }
  const execution = jobs.find(job => job.startsWith("release:"));
  expect(execution).toContain("needs." + guard + ".outputs.admission_sha256");
  expect(execution).toContain("RELEASE_ADMISSION_SHA256");
});

describe("protected staged release command", () => {
  it("binds the earliest verified evidence expiry to the exact protected dispatch and packet", async () => {
    const profile = inspectionProfile();
    const deadline = "2026-11-20T02:03:12.340Z";
    profile.legacyPrevious.protectedValues.expiresAt = deadline;
    bindProtectedValues(profile.legacyPrevious);
    const env = await resolve("verify", profile);
    const { packet } = JSON.parse(Buffer.from(env.RELEASE_CONTEXT, "base64url").toString("utf8"));
    const output = await stageCommand("admit", env);
    expect(output.admission_sha256).toBe(sha256(output.admission));
    expect(JSON.parse(output.admission)).toEqual({
      version: 1, operation: "verify", candidateSha: candidate.sha,
      contextSha256: env.RELEASE_CONTEXT_SHA256, packetSha256: sha256(packet.raw), expiresAt: deadline,
    });
  });

  it("rejects an extended deadline, a different valid packet receipt, and expiry while queued", async () => {
    const profile = inspectionProfile();
    const env = await resolve("verify", profile);
    const first = await stageCommand("admit", env);
    const moreTime = "2026-11-20T03:30:00.000Z";
    const forged = { ...JSON.parse(first.admission), expiresAt: moreTime };
    await expect(run("execute", { ...env, RELEASE_APPLIED_SHA: candidate.sha,
      RELEASE_ADMISSION_SHA256: sha256(JSON.stringify(forged)) })).rejects.toThrow();

    profile.legacyPrevious.protectedValues.expiresAt = moreTime;
    bindProtectedValues(profile.legacyPrevious);
    const other = await admit(await resolve("verify", profile));
    await expect(run("execute", { ...env, RELEASE_APPLIED_SHA: candidate.sha,
      RELEASE_ADMISSION_SHA256: other.RELEASE_ADMISSION_SHA256 })).rejects.toThrow();

    vi.spyOn(Date, "now").mockReturnValue(Date.parse(JSON.parse(first.admission).expiresAt));
    await expect(run("execute", { ...env, RELEASE_APPLIED_SHA: candidate.sha,
      RELEASE_ADMISSION_SHA256: first.admission_sha256 })).rejects.toThrow(/expired/);
    expect(writer.admit).toHaveBeenCalledTimes(2);
    expect(writer.change).not.toHaveBeenCalled();
    expect(vercel.promote).not.toHaveBeenCalled();
  });

  it("stops an inspection candidate carrying a webhook signer before admitting the pair", async () => {
    const profile = inspectionProfile();
    const searchCredentials = { ...profile.observations.searchCredentials,
      webhookSecretSha256: example.observations.searchCredentials.webhookSecretSha256 };
    await expect(dispatch("verify", { ...profile, observations: { ...profile.observations, searchCredentials } }))
      .rejects.toThrow(/search|signer|webhook|credential/i);
    expect(probe).not.toHaveBeenCalled();
    expect(writer.admit).not.toHaveBeenCalled();
    expect(migrate).not.toHaveBeenCalled();
  });

  it("checks the serving original before and after migration and the fully observed candidate on its immutable URL", async () => {
    await dispatch("verify", inspectionProfile());
    expect(probe.mock.calls.map(([arg]) => [arg.phase, arg.origin, arg.deploymentId, arg.inspectionOnly])).toEqual([
      ["previous", "https://www.helixskin.us", original.id, true],
      ["previous", "https://www.helixskin.us", original.id, true],
      ["staged", candidate.url, candidate.id, undefined],
    ]);
    expect(probe.mock.invocationCallOrder[0]).toBeLessThan(migrate.mock.invocationCallOrder[0]);
    expect(probe.mock.invocationCallOrder[1]).toBeGreaterThan(migrate.mock.invocationCallOrder[0]);
    expect(writer.admit.mock.calls).toEqual([["verify", pair(), true], ["verify", pair(), true]]);
    expect(writer.change).toHaveBeenCalledWith("prepare", pair(), undefined);
    expect(vercel.promote).not.toHaveBeenCalled();
    expect(vercel.rollback).not.toHaveBeenCalled();
  });

  it("stops full-profile substitutions before migration or traffic changes, including after cancellation", async () => {
    // Native PostgreSQL tests exercise persistence. Here the registry rejects every
    // attempt to use the held pair under a full profile across independent jobs.
    writer.admit.mockImplementation((_operation, release, limited) => release.candidateId === candidate.id && limited);
    const limited = inspectionProfile();
    await dispatch("verify", limited);
    await expect(dispatch("promote", example)).rejects.toThrow();
    await dispatch("cancel", limited);
    for (const operation of ["verify", "promote", "rollback"]) {
      await expect(dispatch(operation, example)).rejects.toThrow();
      expect(writer.admit).toHaveBeenLastCalledWith(operation, pair(), false);
    }
    expect(writer.recorded).toHaveBeenCalledWith({ sha: candidate.sha });
    expect(migrate).toHaveBeenCalledTimes(1);
    expect(writer.change.mock.calls).toEqual([["prepare", pair(), undefined], ["cancel", pair(), undefined]]);
    expect(vercel.promote).not.toHaveBeenCalled();
    expect(vercel.rollback).not.toHaveBeenCalled();
  });

  it.each(["promote", "rollback"])("rejects limited %s before protected admission", async operation => {
    await expect(dispatch(operation, inspectionProfile())).rejects.toThrow();
    expect(writer.admit).not.toHaveBeenCalled();
    expect(migrate).not.toHaveBeenCalled();
    expect(writer.change).not.toHaveBeenCalled();
  });

  it("stops a tampered or expired resolved profile before registry admission", async () => {
    const env = await resolve("verify", inspectionProfile());
    await expect(admit({ ...env, RELEASE_CONTEXT_SHA256: "0".repeat(64) })).rejects.toThrow();
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-20T02:11:00.000Z"));
    await expect(admit(env)).rejects.toThrow(/expired/);
    expect(writer.admit).not.toHaveBeenCalled();
    expect(writer.change).not.toHaveBeenCalled();
  });

  it("rejects a changed admission receipt or a different recovered pair with the same selected commit", async () => {
    const env = await admit(await resolve("cancel", example));
    await expect(run("execute", { ...env, RELEASE_ADMISSION_SHA256: "0".repeat(64) })).rejects.toThrow();
    recoveredPair = { ...pair(), candidateId: "dpl_another" };
    await expect(run("execute", env)).rejects.toThrow();
    expect(writer.admit).toHaveBeenCalledTimes(1);
    expect(writer.recorded).toHaveBeenCalledTimes(3);
    expect(writer.change).not.toHaveBeenCalled();
    expect(vercel.rollback).not.toHaveBeenCalled();
  });

  it("promotes a fully qualified ordinary pair after verification and forward migration", async () => {
    previous = { id: "dpl_modern", sha: "a".repeat(40), url: "https://modern.vercel.app" };
    await dispatch("promote", { ...example, legacyPrevious: null });
    expect(writer.admit.mock.calls).toEqual([["promote", pair(), false], ["promote", pair(), false]]);
    expect(migrate).toHaveBeenCalledOnce();
    expect(vercel.promote).toHaveBeenCalledWith(pair());
    expect(probe.mock.calls.map(([arg]) => arg.phase)).toEqual(["previous", "previous", "staged", "canonical"]);
  });
});
