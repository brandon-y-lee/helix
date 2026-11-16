import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertProductEditorDocumentStructure } from "../../lib/admin/catalog/validation";
import type { ProductEditorDocumentV4 } from "../../lib/admin/catalog/types";
import { CATALOG_MEDIA_BUCKET } from "../../lib/catalog/media-storage";
import { APPROVED_SUPABASE_PROJECT_REF } from "../../lib/supabase/project-safety";
import { createOpsClient } from "../db/supabase-ops";
import {
  assertCurrentMediaSnapshot,
  assertMediaIdentityManifest,
  buildMediaIdentityManifest,
  manifestDigest,
  verifyAndCopyMedia,
  type MediaIdentityManifest,
} from "./product-media-identity";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const OBJECT_PREFIX = `https://${APPROVED_SUPABASE_PROJECT_REF}.supabase.co/storage/v1/object/public/${CATALOG_MEDIA_BUCKET}/`;

type Command = "plan" | "copy" | "cutover" | "activate" | "verify";
type Snapshot = { document: ProductEditorDocumentV4; revision: number; activeDrafts: number };
type ObjectVersion = { id: string; version: string };
type OperationState = {
  operation: Record<string, unknown> | null;
  policy: { enabled: boolean; operationId: string | null; activatedAt: string | null };
};

export type MediaIdentityCommand =
  | { command: "plan"; operationId: string; actorId?: string }
  | {
      command: Exclude<Command, "plan">;
      manifestPath: string;
      expectedOperation: string;
      expectedFileDigest: string;
      state: "before" | "after";
      deploymentSha?: string;
    };

export interface MediaIdentityGateway {
  readSnapshots(): Promise<Snapshot[]>;
  readAdmin(actorId?: string): Promise<string>;
  readOperation(operationId: string): Promise<OperationState>;
  readObjectVersion(path: string): Promise<ObjectVersion>;
  copyObject(sourcePath: string, targetPath: string): Promise<void>;
  cutover(manifest: MediaIdentityManifest): Promise<Record<string, unknown>>;
  activate(operationId: string, actorId: string): Promise<Record<string, unknown>>;
}

export function parseMediaIdentityArgs(argv: string[]): MediaIdentityCommand {
  const command = argv[0];
  if (!["plan", "copy", "cutover", "activate", "verify"].includes(command)) {
    throw new Error("Expected an explicit command: plan, copy, cutover, activate, or verify.");
  }
  const options = new Map<string, string>();
  for (let index = 1; index < argv.length; index += 1) {
    const name = argv[index];
    if (options.has(name)) throw new Error(`Duplicate option: ${name}.`);
    if (name === "--current-writers-verified") {
      options.set(name, "true");
      continue;
    }
    const value = argv[++index];
    if (!name.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error("Options require an explicit name and value.");
    }
    options.set(name, value);
  }
  const allowed = command === "plan"
    ? ["--operation-id", "--actor-id"]
    : ["--manifest", "--expect-project", "--expect-operation", "--expect-manifest-sha256",
      ...(command === "verify" ? ["--state"] : []),
      ...(command === "activate" ? ["--deployment-sha", "--current-writers-verified"] : [])];
  for (const name of options.keys()) {
    if (!allowed.includes(name)) throw new Error(`Unsupported option for ${command}: ${name}.`);
  }
  if (command === "plan") {
    const operationId = options.get("--operation-id") ?? randomUUID();
    const actorId = options.get("--actor-id");
    if (!UUID.test(operationId) || (actorId !== undefined && !UUID.test(actorId))) {
      throw new Error("Operation and administrator identifiers must be lowercase UUIDs.");
    }
    return { command, operationId, actorId };
  }
  const manifestPath = options.get("--manifest") ?? "";
  const expectedOperation = options.get("--expect-operation") ?? "";
  const expectedFileDigest = options.get("--expect-manifest-sha256") ?? "";
  if (!isAbsolute(manifestPath) || options.get("--expect-project") !== APPROVED_SUPABASE_PROJECT_REF
    || !UUID.test(expectedOperation) || !SHA256.test(expectedFileDigest)) {
    throw new Error("Require --manifest with an absolute path, --expect-project erasogmsqpgiirovubjh, --expect-operation UUID, and --expect-manifest-sha256 SHA256.");
  }
  const state = options.get("--state") ?? "before";
  if (state !== "before" && state !== "after") throw new Error("--state must be before or after.");
  const deploymentSha = options.get("--deployment-sha");
  if (command === "activate" && (!/^[0-9a-f]{40}$/.test(deploymentSha ?? "")
    || options.get("--current-writers-verified") !== "true")) {
    throw new Error("Activation requires --deployment-sha with the verified full commit SHA and --current-writers-verified.");
  }
  return { command: command as Exclude<Command, "plan">, manifestPath, expectedOperation, expectedFileDigest, state, deploymentSha };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function providerFailure(operation: string): never {
  throw new Error(`${operation} failed; no provider payload was logged.`);
}

function rpcResult(operation: string, data: unknown): Record<string, unknown> {
  if (!record(data) || data.ok !== true || typeof data.operationId !== "string"
    || !UUID.test(data.operationId) || !["published", "activated", "no-op"].includes(String(data.outcome))) {
    providerFailure(operation);
  }
  const result: Record<string, unknown> = { ok: true, operationId: data.operationId, outcome: data.outcome };
  if (data.products !== undefined) {
    if (!Array.isArray(data.products)) providerFailure(operation);
    result.products = data.products.map((product: unknown) => {
      if (!record(product) || typeof product.productId !== "string" || !UUID.test(product.productId)
        || typeof product.revisionId !== "string" || !UUID.test(product.revisionId)
        || !Number.isSafeInteger(product.revision) || Number(product.revision) < 1) providerFailure(operation);
      return { productId: product.productId, revision: product.revision, revisionId: product.revisionId };
    });
  }
  if (data.associationCount !== undefined) {
    if (!Number.isSafeInteger(data.associationCount) || Number(data.associationCount) < 0) providerFailure(operation);
    result.associationCount = data.associationCount;
  }
  return result;
}

export function createMediaIdentityGateway(client: SupabaseClient): MediaIdentityGateway {
  return {
    async readSnapshots() {
      const productIds: string[] = [];
      for (let offset = 0; ; offset += 100) {
        const { data, error } = await client.from("products").select("id")
          .neq("catalog_status", "archived").order("id").range(offset, offset + 99);
        if (error || !data) providerFailure("Non-archived Product read");
        for (const row of data) {
          if (typeof row.id !== "string" || !UUID.test(row.id)) providerFailure("Non-archived Product read");
          productIds.push(row.id);
        }
        if (data.length < 100) break;
      }
      const snapshots: Snapshot[] = [];
      for (const productId of productIds) {
        const [document, revision, drafts] = await Promise.all([
          client.rpc("get_catalog_editor_document", { p_product_id: productId }),
          client.from("catalog_product_revisions").select("revision_number")
            .eq("product_id", productId).order("revision_number", { ascending: false }).limit(1).maybeSingle(),
          client.from("product_content_drafts").select("id", { count: "exact", head: true })
            .eq("product_id", productId).in("status", ["draft", "ready"]),
        ]);
        if (document.error || revision.error || drafts.error || drafts.count === null) {
          providerFailure("Current Catalog snapshot read");
        }
        const current = assertProductEditorDocumentStructure(document.data);
        const latestRevision = revision.data?.revision_number ?? 0;
        if (current.productId !== productId || !Number.isSafeInteger(latestRevision) || latestRevision < 0) {
          providerFailure("Current Catalog snapshot read");
        }
        snapshots.push({ document: current, revision: latestRevision, activeDrafts: drafts.count });
      }
      return snapshots;
    },
    async readAdmin(actorId) {
      let query = client.from("admin_memberships").select("user_id")
        .eq("active", true).eq("role", "admin");
      if (actorId) query = query.eq("user_id", actorId);
      const { data, error } = await query.limit(2);
      if (error) providerFailure("Administrator membership read");
      if (data?.length !== 1 || typeof data[0].user_id !== "string" || !UUID.test(data[0].user_id)
        || (actorId !== undefined && data[0].user_id !== actorId)) {
        throw new Error("Resolve exactly one active Catalog Administrator; supply --actor-id when planning if needed.");
      }
      return data[0].user_id;
    },
    async readOperation(operationId) {
      const { data, error } = await client.rpc("get_catalog_product_media_operation", { p_operation_id: operationId });
      if (error || !record(data) || !(data.operation === null || record(data.operation))
        || !record(data.policy) || typeof data.policy.enabled !== "boolean"
        || !(data.policy.operationId === null || typeof data.policy.operationId === "string")
        || !(data.policy.activatedAt === null || typeof data.policy.activatedAt === "string")) {
        providerFailure("Media operation state read");
      }
      const operation = data.operation === null ? null : rpcResult("Media operation state read", data.operation);
      if (operation !== null && operation.operationId !== operationId) providerFailure("Media operation state read");
      return { operation, policy: data.policy } as OperationState;
    },
    async readObjectVersion(path) {
      const { data, error } = await client.storage.from(CATALOG_MEDIA_BUCKET).info(path);
      if (error || !data || !UUID.test(data.id) || typeof data.version !== "string" || !data.version) {
        providerFailure("Storage object version read");
      }
      return { id: data.id, version: data.version };
    },
    async copyObject(sourcePath, targetPath) {
      const { error } = await client.storage.from(CATALOG_MEDIA_BUCKET).copy(sourcePath, targetPath);
      if (error) providerFailure("Storage copy");
    },
    async cutover(manifest) {
      const { data, error } = await client.rpc("cutover_catalog_product_media", { p_manifest: manifest });
      if (error) providerFailure("Product Media cutover");
      return rpcResult("Product Media cutover", data);
    },
    async activate(operationId, actorId) {
      const { data, error } = await client.rpc("activate_catalog_product_media_policy", {
        p_operation_id: operationId, p_actor_id: actorId,
      });
      if (error) providerFailure("Product Media policy activation");
      return rpcResult("Product Media policy activation", data);
    },
  };
}

async function storageVersions(manifest: MediaIdentityManifest, gateway: MediaIdentityGateway) {
  const versions = new Map<string, ObjectVersion>();
  for (const product of manifest.products) {
    for (const media of product.media) {
      for (const url of [media.sourceUrl, media.targetUrl]) {
        if (!url.startsWith(OBJECT_PREFIX)) throw new Error("Unexpected Product Media origin.");
        if (!versions.has(url)) versions.set(url, await gateway.readObjectVersion(url.slice(OBJECT_PREFIX.length)));
      }
    }
  }
  return versions;
}

export async function runMediaIdentityCommand(
  options: MediaIdentityCommand,
  gateway: MediaIdentityGateway,
  readManifest: (path: string) => Promise<string | Buffer> = (path) => readFile(path),
  runtime: Pick<Parameters<typeof verifyAndCopyMedia>[1], "fetchImpl" | "inspect"> = {},
) {
  if (options.command === "plan") {
    const actorId = await gateway.readAdmin(options.actorId);
    return buildMediaIdentityManifest({
      operationId: options.operationId, actorId, snapshots: await gateway.readSnapshots(), http: runtime.fetchImpl,
    });
  }
  const contents = await readManifest(options.manifestPath);
  if (createHash("sha256").update(contents).digest("hex") !== options.expectedFileDigest) {
    throw new Error("Manifest file SHA256 does not match the reviewed confirmation.");
  }
  let manifest: unknown;
  try { manifest = JSON.parse(contents.toString()); } catch { throw new Error("Manifest must contain valid JSON."); }
  assertMediaIdentityManifest(manifest);
  if (manifest.operationId !== options.expectedOperation || manifest.projectRef !== APPROVED_SUPABASE_PROJECT_REF) {
    throw new Error("Manifest operation or project does not match the reviewed confirmation.");
  }
  await gateway.readAdmin(manifest.actorId);
  const operationState = await gateway.readOperation(manifest.operationId);
  if (options.command === "copy" && operationState.operation !== null) {
    throw new Error("This media cutover is already recorded; use verify --state after. Repair requires a newly reviewed operation.");
  }
  const state = options.command === "verify" ? options.state
    : options.command === "activate" || operationState.operation !== null ? "after" : "before";
  if ((options.command === "activate" || (options.command === "verify" && state === "after"))
    && operationState.operation === null) {
    throw new Error("Post-cutover verification and activation require a completed media cutover.");
  }
  assertCurrentMediaSnapshot(manifest, await gateway.readSnapshots(), state);

  const versionsBefore = options.command === "cutover" ? await storageVersions(manifest, gateway) : null;
  const report = await verifyAndCopyMedia(manifest, {
    ...runtime,
    mode: options.command === "copy" ? "copy" : "verify",
    copyObject: (source, target) => gateway.copyObject(source, target),
  });
  let result: Record<string, unknown> | undefined;
  if (options.command === "cutover") {
    const versionsAfter = await storageVersions(manifest, gateway);
    for (const [url, before] of versionsBefore!) {
      const after = versionsAfter.get(url);
      if (before.id !== after?.id || before.version !== after.version) {
        throw new Error("Storage object changed during full-byte verification; repeat fresh preflight.");
      }
    }
    assertCurrentMediaSnapshot(manifest, await gateway.readSnapshots(), state);
    await gateway.readAdmin(manifest.actorId);
    result = await gateway.cutover({
      ...manifest,
      products: manifest.products.map((product) => ({
        ...product,
        media: product.media.map((media) => ({
          ...media,
          sourceObject: versionsAfter.get(media.sourceUrl)!,
          targetObject: versionsAfter.get(media.targetUrl)!,
        })),
      })),
    });
    assertCurrentMediaSnapshot(manifest, await gateway.readSnapshots(), "after");
  } else if (options.command === "activate") {
    assertCurrentMediaSnapshot(manifest, await gateway.readSnapshots(), "after");
    await gateway.readAdmin(manifest.actorId);
    result = await gateway.activate(manifest.operationId, manifest.actorId);
  } else {
    assertCurrentMediaSnapshot(manifest, await gateway.readSnapshots(), state);
  }
  const postflight = await gateway.readOperation(manifest.operationId);
  return {
    command: options.command,
    projectRef: manifest.projectRef,
    operationId: manifest.operationId,
    manifestFileSha256: options.expectedFileDigest,
    manifestSha256: manifestDigest(manifest),
    report,
    ...(result ? { result } : {}),
    ...(options.command === "activate" ? {
      deploymentSha: options.deploymentSha,
      deploymentEvidence: "Operator-confirmed UUID writers and Restore readiness; this command does not inspect the deployment.",
    } : {}),
    recordedOperation: postflight.operation,
    policy: postflight.policy,
    downstreamVerificationRequired: ["Product Search reconciliation", "Catalog cache reconciliation", "current consumer inspection"],
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  Promise.resolve().then(() => {
    const options = parseMediaIdentityArgs(process.argv.slice(2));
    return runMediaIdentityCommand(options, createMediaIdentityGateway(createOpsClient()));
  }).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Product Media operation failed.");
    process.exitCode = 1;
  });
}
