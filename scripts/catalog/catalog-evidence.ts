import { createHash } from "node:crypto";
import { APPROVED_SUPABASE_PROJECT_REF } from "../../lib/supabase/project-safety";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Row = { [key: string]: Json };
type Rows = Record<string, Row>;
export type CatalogEvidenceInput = {
  metadata: {
    capturedAt: string; postgresVersion: string; transactionReadOnly: string;
    isolationLevel: string; snapshot: string; timezone: string; mediaRelations: boolean[]; catalogReadsBypassRls: boolean;
  };
  state: {
    productStatuses: Record<string, string>; documents: Rows;
    systemSteps: Rows; families: Rows; memberships: Rows; slugReservations: Rows;
    archivedVariants: Rows; archivedMedia: Rows; archivedRelationships: Rows; drafts: Rows;
    currentRevisions: Record<string, Row | null>;
    history: { revisions: Rows; auditEntries: Rows; mediaOperations: Rows; mediaCopies: Rows };
    mediaBoundary: { present: boolean; policy: Row | null };
    migrationVersions: string[]; documentFunctions: Rows;
  };
};
export type CatalogEvidenceProvenance = {
  projectRef: string; endpoint: string; projectVerifiedAt: string;
  sourceCommit: string; extractorSha256: string;
};
export type EvidencePhase = "before" | "prepared" | "postflight";
type Fingerprints = {
  stateSha256: string; sections: Record<string, string>;
  documents: Record<string, { sha256: string; sections: Record<string, string> }>;
};
export type CatalogEvidence = CatalogEvidenceInput & {
  formatVersion: 1; phase: EvidencePhase; provenance: CatalogEvidenceProvenance;
  fingerprints: Fingerprints; captureSha256: string;
};
type Presence = { exists: false } | { exists: true; value: Json };
export type CatalogEvidenceChange = { path: string; before: Presence; after: Presence };
export type CatalogEvidencePlan = {
  version: 1; beforeCaptureSha256: string; changes: CatalogEvidenceChange[];
};

function fail(message: string): never { throw new Error(`Catalog evidence: ${message}`); }
function exactDecimal(source: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(source);
  if (!match) return fail("JSON numeric precision cannot be verified.");
  const fraction = match[3] ?? "";
  const digits = `${match[2]}${fraction}`.replace(/^0+/, "");
  if (!digits) return "0";
  const trimmed = digits.replace(/0+$/, "");
  const exponent = BigInt(match[4] ?? "0") - BigInt(fraction.length) + BigInt(digits.length - trimmed.length);
  return `${match[1]}${trimmed}e${exponent}`;
}

/** Node 24 supplies original numeric tokens; fail rather than hash rounded JSONB. */
export function parseCatalogEvidenceJson(text: string): unknown {
  if (Buffer.byteLength(text) > 64 * 1024 * 1024) fail("artifact exceeds the bounded 64 MiB capture size.");
  type Parse = (text: string, reviver: (key: string, value: unknown, context?: { source?: string }) => unknown) => unknown;
  try {
    return (JSON.parse as Parse)(text, (_key, value, context) => {
      if (typeof value === "number" && (!context?.source || !Number.isFinite(value)
        || (Number.isInteger(value) && !Number.isSafeInteger(value))
        || exactDecimal(context.source) !== exactDecimal(String(value)))) fail("JSON numeric precision would be lost; no evidence can be certified.");
      return value;
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Catalog evidence:")) throw error;
    return fail("artifact is not valid JSON.");
  }
}
function canonical(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value) && (Number.isSafeInteger(value) || !Number.isInteger(value))) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return fail("only lossless JSON values are supported.");
}
export function catalogEvidenceDigest(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
function sectionHashes(value: object): Record<string, string> {
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, catalogEvidenceDigest(child)]));
}
function equal(a: unknown, b: unknown): boolean { return canonical(a) === canonical(b); }

const SHA256 = /^[a-f0-9]{64}$/;
const DOCUMENT_SECTIONS = ["schemaVersion", "productId", "product", "productPdpContent", "productSource", "variants", "media", "relationships", "productFamily"];
const DOCUMENT_FUNCTIONS = ["public.get_catalog_editor_document(uuid)", "private.catalog_editor_document_v4(uuid)", "private.catalog_editor_product_family(uuid)"];
const STATE_SECTIONS = ["productStatuses", "documents", "systemSteps", "families", "memberships", "slugReservations", "archivedVariants", "archivedMedia", "archivedRelationships", "drafts", "currentRevisions", "history", "mediaBoundary", "migrationVersions", "documentFunctions"];
function object(value: unknown): value is Row { return value !== null && typeof value === "object" && !Array.isArray(value); }
function keys(value: object, expected: string[], subject: string): void {
  if (!equal(Object.keys(value).sort(), [...expected].sort())) fail(`${subject} has missing or unknown sections.`);
}
function date(value: unknown): value is string { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
function rows(value: unknown, subject: string): asserts value is Rows {
  if (!object(value) || Object.values(value).some((row) => !object(row))) fail(`${subject} must contain complete keyed rows.`);
}
function validateInput(input: CatalogEvidenceInput): void {
  if (!object(input) || !object(input.metadata) || !object(input.state)) fail("capture shape is incomplete.");
  keys(input, ["metadata", "state"], "capture");
  const { state, metadata } = input;
  keys(state, STATE_SECTIONS, "Catalog");
  if (!date(metadata.capturedAt) || !/^17\./.test(metadata.postgresVersion)
    || metadata.transactionReadOnly !== "on" || metadata.timezone !== "UTC" || metadata.catalogReadsBypassRls !== true
    || !["read committed", "repeatable read", "serializable"].includes(metadata.isolationLevel)
    || typeof metadata.snapshot !== "string" || !metadata.snapshot) fail("capture requires a UTC, read-only PostgreSQL 17 snapshot.");
  if (!Array.isArray(metadata.mediaRelations) || metadata.mediaRelations.length !== 3
    || metadata.mediaRelations.some((present) => typeof present !== "boolean" || present !== metadata.mediaRelations[0])) fail("media preparation is partially installed.");
  for (const name of ["documents", "systemSteps", "families", "memberships", "slugReservations", "archivedVariants", "archivedMedia", "archivedRelationships", "drafts", "documentFunctions"] as const) rows(state[name], name);
  if (!object(state.productStatuses) || Object.keys(state.productStatuses).length === 0
    || Object.values(state.productStatuses).some((status) => !["active", "draft", "archived"].includes(status))) fail("the full Product status inventory is required.");
  keys(state.documents, Object.keys(state.productStatuses), "Product documents");
  for (const [id, document] of Object.entries(state.documents)) {
    keys(document, DOCUMENT_SECTIONS, `Product ${id}`);
    if (document.schemaVersion !== 4 || document.productId !== id || !object(document.product)
      || document.product.id !== id || document.product.catalog_status !== state.productStatuses[id]
      || !Array.isArray(document.variants) || !Array.isArray(document.media) || !Array.isArray(document.relationships)
      || !(document.productPdpContent === null || object(document.productPdpContent))
      || !(document.productSource === null || object(document.productSource))
      || !(document.productFamily === null || object(document.productFamily))) fail(`Product ${id} is not a complete current-format document.`);
  }
  keys(state.documentFunctions, DOCUMENT_FUNCTIONS, "document function provenance");
  if (Object.values(state.documentFunctions).some((row) => row.volatility !== "s" || typeof row.sha256 !== "string" || !SHA256.test(row.sha256))) fail("current-document functions must be verified STABLE readers.");
  if (!Array.isArray(state.migrationVersions) || !state.migrationVersions.length
    // The applied June/July ledger contains twelve-digit identifiers. Preserve
    // them verbatim alongside later fourteen-digit timestamps.
    || state.migrationVersions.some((version) => typeof version !== "string" || !/^\d{12}(?:\d{2})?$/.test(version))
    || !equal(state.migrationVersions, [...new Set(state.migrationVersions)].sort())) fail("the complete ordered migration boundary is required.");
  if (!object(state.history)) fail("Catalog history is required.");
  keys(state.history, ["revisions", "auditEntries", "mediaOperations", "mediaCopies"], "history");
  for (const [name, entries] of Object.entries({ ...state.history, drafts: state.drafts })) {
    rows(entries, name);
    if (Object.values(entries).some((row) => typeof row.sha256 !== "string" || !SHA256.test(row.sha256))) fail(`${name} requires SQL hashes of complete rows.`);
  }
  for (const row of Object.values(state.history.revisions)) {
    if (typeof row.productId !== "string" || !Object.hasOwn(state.productStatuses, row.productId)
      || !Number.isSafeInteger(row.revisionNumber) || (row.revisionNumber as number) < 1
      || ![1, 2, 3, 4].includes(row.schemaVersion as number)) fail("Published Revision identity is invalid.");
  }
  if (!object(state.currentRevisions)) fail("current revisions are required.");
  keys(state.currentRevisions, Object.keys(state.documents), "current revisions");
  for (const productId of Object.keys(state.documents)) {
    const revisions = Object.entries(state.history.revisions).filter(([, row]) => row.productId === productId)
      .sort((a, b) => (a[1].revisionNumber as number) - (b[1].revisionNumber as number));
    const numbers = revisions.map(([, row]) => row.revisionNumber);
    if (new Set(numbers).size !== numbers.length) fail(`Product ${productId} has duplicate revision numbers.`);
    const latest = revisions.at(-1);
    const expected = latest ? { id: latest[0], revisionNumber: latest[1].revisionNumber, sha256: latest[1].sha256 } : null;
    if (!equal(state.currentRevisions[productId], expected)) fail(`Product ${productId} has incomplete or inconsistent current revision evidence.`);
  }
  if (!object(state.mediaBoundary) || state.mediaBoundary.present !== metadata.mediaRelations[0]
    || (state.mediaBoundary.present ? !object(state.mediaBoundary.policy) : state.mediaBoundary.policy !== null)
    || (!state.mediaBoundary.present && (Object.keys(state.history.mediaCopies).length || Object.keys(state.history.mediaOperations).length))) fail("media-boundary presence and evidence are inconsistent.");
  canonical(input);
}

export function createCatalogEvidence(
  input: CatalogEvidenceInput,
  provenance: CatalogEvidenceProvenance,
  phase: EvidencePhase,
): CatalogEvidence {
  validateInput(input);
  if (provenance.projectRef !== APPROVED_SUPABASE_PROJECT_REF || provenance.endpoint !== `https://${APPROVED_SUPABASE_PROJECT_REF}.supabase.co`) {
    fail("the exact approved project endpoint is required.");
  }
  if (!date(provenance.projectVerifiedAt) || !/^[a-f0-9]{40}$/.test(provenance.sourceCommit)
    || !SHA256.test(provenance.extractorSha256) || !["before", "prepared", "postflight"].includes(phase)) fail("source, extractor, phase, and verified project provenance are required.");
  const fingerprints: Fingerprints = {
    stateSha256: catalogEvidenceDigest(input.state),
    sections: sectionHashes(input.state),
    documents: Object.fromEntries(Object.entries(input.state.documents).map(([id, document]) => [id, {
      sha256: catalogEvidenceDigest(document), sections: sectionHashes(document),
    }])),
  };
  const evidence = { formatVersion: 1 as const, phase, provenance, ...input, fingerprints };
  return { ...evidence, captureSha256: catalogEvidenceDigest(evidence) };
}

export function assertCatalogEvidence(value: unknown): asserts value is CatalogEvidence {
  if (!object(value) || value.formatVersion !== 1 || !object(value.provenance)) fail("unsupported evidence artifact.");
  keys(value, ["formatVersion", "phase", "provenance", "metadata", "state", "fingerprints", "captureSha256"], "evidence artifact");
  const artifact = value as unknown as CatalogEvidence;
  const reconstructed = createCatalogEvidence({ metadata: artifact.metadata, state: artifact.state }, artifact.provenance, artifact.phase);
  if (!equal(artifact, reconstructed)) fail("artifact integrity verification failed.");
}

export function assertCatalogEvidencePlan(value: unknown): asserts value is CatalogEvidencePlan {
  if (!object(value) || value.version !== 1 || typeof value.beforeCaptureSha256 !== "string"
    || !SHA256.test(value.beforeCaptureSha256) || !Array.isArray(value.changes)) fail("invalid declared-change plan.");
  keys(value, ["version", "beforeCaptureSha256", "changes"], "change plan");
  const seen = new Set<string>();
  for (const change of value.changes) {
    if (!object(change) || typeof change.path !== "string" || !/^\/(?:[^~]|~[01])+$/.test(change.path) || change.path.includes("*")
      || seen.has(change.path)) fail("declared changes require unique, exact JSON Pointer paths.");
    keys(change, ["path", "before", "after"], "declared change");
    seen.add(change.path);
    for (const side of [change.before, change.after]) {
      if (!object(side) || typeof side.exists !== "boolean") fail("declared changes must distinguish absence from null.");
      keys(side, side.exists ? ["exists", "value"] : ["exists"], "declared value");
    }
  }
  canonical(value);
}

function differences(before: Json, after: Json, path = ""): CatalogEvidenceChange[] {
  if (equal(before, after)) return [];
  if (before !== null && after !== null && typeof before === "object" && typeof after === "object"
    && Array.isArray(before) === Array.isArray(after)) {
    return [...new Set([...Object.keys(before), ...Object.keys(after)])].sort().flatMap((key) => {
      const childPath = `${path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`;
      const a = before as Record<string, Json>; const b = after as Record<string, Json>;
      if (!Object.hasOwn(a, key)) return [{ path: childPath, before: { exists: false as const }, after: { exists: true as const, value: b[key] } }];
      if (!Object.hasOwn(b, key)) return [{ path: childPath, before: { exists: true as const, value: a[key] }, after: { exists: false as const } }];
      return differences(a[key], b[key], childPath);
    });
  }
  return [{ path, before: { exists: true, value: before }, after: { exists: true, value: after } }];
}

export function compareCatalogEvidence(before: CatalogEvidence, after: CatalogEvidence, plan: CatalogEvidencePlan) {
  assertCatalogEvidence(before); assertCatalogEvidence(after); assertCatalogEvidencePlan(plan);
  const changes = differences(before.state as unknown as Json, after.state as unknown as Json);
  const unexpectedPaths = changes.filter((change) => !plan.changes.some((expected) => equal(change, expected))).map(({ path }) => path);
  const unobservedPaths = plan.changes.filter((expected) => !changes.some((change) => equal(change, expected))).map(({ path }) => path);
  const violations: string[] = [];
  if (plan.version !== 1 || plan.beforeCaptureSha256 !== before.captureSha256) violations.push("The plan is not bound to this before capture.");
  if (before.provenance.projectRef !== after.provenance.projectRef || before.provenance.endpoint !== after.provenance.endpoint
    || before.provenance.extractorSha256 !== after.provenance.extractorSha256) violations.push("Captures must use the same verified endpoint and extractor.");
  if (Date.parse(after.metadata.capturedAt) < Date.parse(before.metadata.capturedAt)) violations.push("The after capture predates its before capture.");
  if (!equal(before.state.productStatuses, after.state.productStatuses)) violations.push("The exact Product identity and lifecycle inventory must be preserved.");
  const preserved = (a: Rows, b: Rows, label: string) => {
    for (const [id, row] of Object.entries(a)) {
      if (!Object.hasOwn(b, id) || !equal(row, b[id])) violations.push(`Preserved ${label} row ${id} changed or disappeared.`);
    }
  };
  for (const section of ["revisions", "auditEntries", "mediaOperations", "mediaCopies"] as const) {
    preserved(before.state.history[section], after.state.history[section], `history/${section}`);
  }
  for (const section of ["archivedVariants", "archivedMedia", "archivedRelationships"] as const) preserved(before.state[section], after.state[section], section);
  for (const [id, status] of Object.entries(before.state.productStatuses)) {
    if (status === "archived" && !equal(before.state.documents[id], after.state.documents[id])) violations.push(`Archived Product ${id} changed.`);
    const previous = Object.values(before.state.history.revisions).filter((row) => row.productId === id).map((row) => row.revisionNumber as number);
    const appended = Object.entries(after.state.history.revisions).filter(([key, row]) => row.productId === id && !Object.hasOwn(before.state.history.revisions, key))
      .map(([, row]) => row.revisionNumber as number).sort((a, b) => a - b);
    const last = Math.max(0, ...previous);
    if (appended.some((number, index) => number !== last + index + 1)) violations.push(`Product ${id} appended nonsequential Published Revisions.`);
  }
  return {
    ok: !unexpectedPaths.length && !unobservedPaths.length && !violations.length,
    beforeCaptureSha256: before.captureSha256, afterCaptureSha256: after.captureSha256,
    changedPaths: changes.map(({ path }) => path), unexpectedPaths, unobservedPaths, violations,
  };
}
