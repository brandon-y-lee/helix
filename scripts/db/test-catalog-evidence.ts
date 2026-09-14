import { deepStrictEqual, notStrictEqual, strictEqual, ok, throws } from "node:assert";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import {
  buildCatalogEvidenceQuery,
  catalogEvidenceReadTransaction,
  MEDIA_BOUNDARY_INSPECTION_QUERY,
} from "../catalog/catalog-evidence-query";
import { createCatalogEvidence, type CatalogEvidenceInput } from "../catalog/catalog-evidence";

const root = fileURLToPath(new URL("../../", import.meta.url));
const container = process.argv.find((arg) => arg.startsWith("--container="))?.slice(12);
if (!container || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/.test(container)) {
  throw new Error("Pass --container=<disposable local PostgreSQL 17 container>.");
}
const startedAt = new Date().toISOString();
const checkpoint = "supabase/tests/checkpoints/catalog-current-20260909042518.sql";
const identity = "supabase/migrations/20260914051153_catalog_restore_current_identity.sql";
const guidance = "supabase/migrations/20260914062650_catalog_reviewed_guidance.sql";
const media = "supabase/migrations/20260914062651_catalog_stable_media_boundary.sql";
const fixtures = "supabase/tests/catalog_identity.fixtures.sql";
const queryPath = "scripts/catalog/catalog-evidence-query.ts";
const artifactPaths = [checkpoint, identity, guidance, media, fixtures, queryPath,
  "scripts/catalog/catalog-evidence.ts", "lib/supabase/project-safety.ts", "scripts/db/test-catalog-evidence.ts"];
// Freeze every executable input, including this runner, before the first child
// process. Later execution and evidence hashing reuse these exact captured bytes.
const capturedFiles = new Map(artifactPaths.map((path) => [path, readFileSync(resolve(root, path), "utf8")]));
const read = (path: string): string => {
  const source = capturedFiles.get(path);
  if (source === undefined) throw new Error(`Uncaptured test input: ${path}`);
  return source;
};
const hash = (source: string) => createHash("sha256").update(source).digest("hex");
const queryBeforeMedia = buildCatalogEvidenceQuery(false);
const queryAfterMedia = buildCatalogEvidenceQuery(true);
const captureQuery = (present: boolean) => present ? queryAfterMedia : queryBeforeMedia;
const files = artifactPaths.map((path) => ({ path, sha256: hash(read(path)) }));
const executedSql: Array<{ sha256: string; bytes: number }> = [];
const recordSql = (input: string) => executedSql.push({ sha256: hash(input), bytes: Buffer.byteLength(input) });
const sourceRevision = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
strictEqual(sourceRevision.status, 0, "The current source revision must be readable");
function docker(args: string[], input?: string): string {
  if (input !== undefined) recordSql(input);
  const result = spawnSync("docker", args, {
    input, encoding: "utf8", timeout: 120_000, maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message || result.stderr || "Local PostgreSQL command failed.");
  }
  return result.stdout;
}
strictEqual(docker([
  "inspect", "--format", '{{index .Config.Labels "helix.task"}}', container,
]).trim(), "spec358-synthetic-sql", "Refusing an unlabelled database container");
const ports: unknown = JSON.parse(docker([
  "inspect", "--format", '{{json (index .NetworkSettings.Ports "5432/tcp")}}', container,
]));
ok(Array.isArray(ports) && ports.length > 0 && ports.every((port: unknown) =>
  port !== null && typeof port === "object" && "HostIp" in port && port.HostIp === "127.0.0.1"),
"Synthetic PostgreSQL must be bound only to IPv4 loopback");

const database = `helix_catalog_evidence_${randomBytes(8).toString("hex")}`;
const psql = ["exec", "-i", container, "psql", "-X", "-U", "postgres", "-d", database,
  "--quiet", "--no-align", "--tuples-only", "--set=ON_ERROR_STOP=1"];
const productId = "10000000-0000-4000-8000-000000000101";
const relatedId = "10000000-0000-4000-8000-000000000102";
const archivedId = "10000000-0000-4000-8000-000000000103";
const draftId = "10000000-0000-4000-8000-000000000601";
const revisionId = "10000000-0000-4000-8000-000000000501";
const actorId = "10000000-0000-4000-8000-000000000901";
const boundary = (present: boolean) => ({
  catalog_media_policy: present,
  catalog_media_operations: present,
  verified_media_copies: present,
});
const seed = `
select pg_temp.seed_catalog_identity('super-serum', 'Super Serum');
create schema supabase_migrations;
create table supabase_migrations.schema_migrations(version text primary key);
insert into supabase_migrations.schema_migrations values
 ('202606180001'),('202607130001'),('20260909042518'),('20260914051153'),('20260914062650');
create schema storage;
create table storage.objects(id uuid primary key, bucket_id text, name text, metadata jsonb, version text);
update public.products set catalog_status='draft' where id='${relatedId}';
insert into public.products(id,slug,display_name,swatch_from,swatch_to,product_type,
 sort_order,editorial_description,editorial_how_to_use,routine_group,routine_sort,catalog_status,status)
values('${archivedId}','synthetic-archived','Synthetic Archived','#eeeeee','#aaaaaa',
 'Serum',3,'Archived editorial facts.','Reviewed historical instructions.','core',30,'archived','coming_soon');
insert into public.product_variants(id,product_id,variant_key,label,price_cents,sort_order,archived_at)
values('10000000-0000-4000-8000-000000000202','${productId}','archived','Archived',1200,1,'2026-01-01Z');
insert into public.product_media(id,product_id,media_type,url,alt,width,height,role,sort_order)
values('10000000-0000-4000-8000-000000000303','${archivedId}','image',
 'https://example.invalid/archived-product.webp','Dormant historical Media',10,10,'gallery',0);
insert into public.product_relationships(product_id,related_product_id,relationship_type,sort_order,archived_at)
values('${productId}','${archivedId}','complete_the_routine',2,'2026-01-01Z');
begin;
insert into public.product_families(id,slug,display_name,system_step_name)
values('10000000-0000-4000-8000-000000000402','synthetic-draft-family','Draft Family','CLEANSE');
insert into public.product_family_memberships(family_id,product_id,option_label,sort_order,is_entry)
values('10000000-0000-4000-8000-000000000402','${relatedId}','Draft option',0,true);
commit;
insert into public.product_content_drafts(id,product_id,document,version,created_by,updated_by)
values('${draftId}','${productId}',public.get_catalog_editor_document('${productId}') ||
 '{"privateDraftMarker":"MUST_NOT_EXPORT_DRAFT_PAYLOAD"}',9007199254740993,'${actorId}','${actorId}');
insert into public.catalog_editor_audit_log(id,action,actor_id,product_id,metadata)
values('10000000-0000-4000-8000-000000000801','draft.saved','${actorId}','${productId}',
 '{"privateAuditMarker":"MUST_NOT_EXPORT_AUDIT_PAYLOAD"}');
`;

type Row = Record<string, unknown>;
type Capture = { metadata: Row; state: Record<string, Row> };
const readCapture = (present: boolean): Capture => JSON.parse(docker(psql,
  catalogEvidenceReadTransaction(captureQuery(present)),
).trim()) as Capture;
function captureDuringWriter(): Promise<string> {
  return new Promise((resolveCapture, reject) => {
    const child = spawn("docker", psql, { stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    let diagnostics = "";
    const timer = setTimeout(() => child.kill(), 15_000);
    child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { diagnostics += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (status) => {
      clearTimeout(timer);
      if (status === 0) resolveCapture(output);
      else reject(new Error(diagnostics || "Concurrent capture failed."));
    });
    const input = `begin read only; set local time zone 'UTC';
      /* CAPTURE_SNAPSHOT_PAUSE */
      with capture_pause as materialized (select pg_sleep(2) as slept)
      select captured.evidence from capture_pause cross join lateral (
        ${queryAfterMedia.replace(/;\s*$/, "")}
      ) captured where capture_pause.slept is not null;
      rollback;`;
    recordSql(input);
    child.stdin.end(input);
  });
}
const checks: string[] = [];
function check(name: string, assertion: () => void) {
  assertion();
  checks.push(name);
}
let created = false;
let proof: Record<string, unknown> | undefined;
try {
  docker(["exec", container, "createdb", "-U", "postgres", database]);
  created = true;
  const postgres = docker(psql, "show server_version;").trim();
  ok(postgres.startsWith("17."), "Catalog capture proof requires PostgreSQL 17");
  const roles = JSON.parse(docker(psql, "select jsonb_object_agg(rolname,rolbypassrls) from pg_roles where rolname in ('anon','authenticated','service_role');").trim());
  deepStrictEqual(roles, { anon: false, authenticated: false, service_role: true });
  docker(psql, [checkpoint, identity, guidance, fixtures].map(read).join("\n") + seed);
  deepStrictEqual(JSON.parse(docker(psql, catalogEvidenceReadTransaction(MEDIA_BOUNDARY_INSPECTION_QUERY)).trim()), boundary(false));
  const before = readCapture(false);
  check("historical twelve-digit and current fourteen-digit migration versions remain verbatim", () => {
    deepStrictEqual(before.state.migrationVersions,
      ["202606180001", "202607130001", "20260909042518", "20260914051153", "20260914062650"]);
  });
  check("read-only UTC statement snapshot and exact document-function chain are observed", () => {
    strictEqual(before.metadata.transactionReadOnly, "on");
    strictEqual(before.metadata.catalogReadsBypassRls, true);
    strictEqual(before.metadata.timezone, "UTC");
    strictEqual(before.metadata.isolationLevel, "read committed");
    ok(/^\d+:\d+:[\d,]*$/.test(before.metadata.snapshot as string));
    ok(Number.isFinite(Date.parse(before.metadata.capturedAt as string)));
    strictEqual(before.metadata.postgresVersion, postgres);
    deepStrictEqual(before.metadata.mediaRelations, [false, false, false]);
    strictEqual(Object.keys(before.state.documentFunctions).length, 3);
    for (const definition of Object.values(before.state.documentFunctions) as Row[]) {
      strictEqual(definition.volatility, "s");
      ok(/^[0-9a-f]{64}$/.test(definition.sha256 as string));
    }
    throws(() => docker(psql, "begin read only; update public.products set sort_order=sort_order; rollback;"),
      /cannot execute UPDATE in a read-only transaction/);
  });
  check("all Product statuses and complete current documents are captured", () => {
    deepStrictEqual(before.state.productStatuses, {
      [productId]: "active", [relatedId]: "draft", [archivedId]: "archived",
    });
    deepStrictEqual(Object.keys(before.state.documents).sort(), [productId, relatedId, archivedId].sort());
  });
  check("archived children and dormant Archived Product Media are retained", () => {
    strictEqual(Object.keys(before.state.archivedVariants).length, 1);
    strictEqual(Object.keys(before.state.archivedMedia).length, 1);
    strictEqual(Object.keys(before.state.archivedRelationships).length, 1);
    const archivedDocument = before.state.documents[archivedId] as Row;
    strictEqual((archivedDocument.media as unknown[]).length, 1);
  });
  check("global Families and System Steps include Draft Product structure", () => {
    strictEqual(Object.keys(before.state.families).length, 2);
    strictEqual(Object.keys(before.state.systemSteps).length, 7);
    strictEqual(Object.keys(before.state.memberships).length, 2);
    strictEqual(Object.keys(before.state.slugReservations).length, 3);
  });
  check("Draft versions remain exact strings and private payloads remain hashed", () => {
    strictEqual((before.state.drafts[draftId] as Row).version, "9007199254740993");
    ok(!JSON.stringify(before).includes("MUST_NOT_EXPORT"));
    ok(!JSON.stringify(before).includes(actorId), "Administrator identity must not escape hashed Draft/Audit/Revision rows");
  });
  check("current publication and immutable full-row history are recorded", () => {
    strictEqual((before.state.currentRevisions[productId] as Row).id, revisionId);
    strictEqual(before.state.currentRevisions[relatedId], null);
    const history = before.state.history;
    strictEqual(Object.keys(history.revisions as Row).length, 1);
    strictEqual(Object.keys(history.auditEntries as Row).length, 2);
    ok(/^[0-9a-f]{64}$/.test(((history.revisions as Row)[revisionId] as Row).sha256 as string));
  });
  check("capture identifies absent Media boundary", () => {
    deepStrictEqual(before.state.mediaBoundary, { present: false, policy: null });
  });
  check("preinspection distinguishes a partially installed Media boundary", () => {
    const partial = JSON.parse(docker(psql, `begin;
      create table private.catalog_media_policy(singleton boolean);
      ${MEDIA_BOUNDARY_INSPECTION_QUERY}
      rollback;`).trim());
    deepStrictEqual(partial, {
      catalog_media_policy: true, catalog_media_operations: false, verified_media_copies: false,
    });
  });
  docker(psql, read(media) + "\ninsert into supabase_migrations.schema_migrations values('20260914062651');");
  deepStrictEqual(JSON.parse(docker(psql, MEDIA_BOUNDARY_INSPECTION_QUERY).trim()), boundary(true));
  const after = readCapture(true);
  // These endpoint values exercise the production validator's exact-project
  // contract with local fixtures only. No provider endpoint is contacted.
  const provenance = {
    projectRef: "erasogmsqpgiirovubjh",
    endpoint: "https://erasogmsqpgiirovubjh.supabase.co",
    projectVerifiedAt: before.metadata.capturedAt as string,
    sourceCommit: sourceRevision.stdout.trim(),
    extractorSha256: hash(read(queryPath)),
  };
  check("actual SQL captures pass the production evidence validator", () => {
    const beforeEvidence = createCatalogEvidence(before as unknown as CatalogEvidenceInput, provenance, "before");
    const afterEvidence = createCatalogEvidence(after as unknown as CatalogEvidenceInput, provenance, "prepared");
    strictEqual(beforeEvidence.phase, "before");
    strictEqual(afterEvidence.phase, "prepared");
    deepStrictEqual(beforeEvidence.fingerprints.documents, afterEvidence.fingerprints.documents);
  });
  check("prepared Media policy is captured independently from unchanged Catalog", () => {
    strictEqual(after.state.mediaBoundary.present, true);
    strictEqual((after.state.mediaBoundary.policy as Row).enabled, false);
    deepStrictEqual(before.state.documents, after.state.documents);
    deepStrictEqual(before.state.drafts, after.state.drafts);
    deepStrictEqual(before.state.history, after.state.history);
    deepStrictEqual(after.metadata.mediaRelations, [true, true, true]);
  });
  check("capture reports a boundary change after an absent preinspection", () => {
    const changedBoundary = readCapture(false);
    deepStrictEqual(changedBoundary.metadata.mediaRelations, [true, true, true]);
    strictEqual(changedBoundary.state.mediaBoundary.present, false);
    throws(() => createCatalogEvidence(changedBoundary as unknown as CatalogEvidenceInput, provenance, "prepared"),
      /[Bb]oundary|[Pp]resence|[Mm]edia/);
  });
  const operationId = "10000000-0000-4000-8000-000000000701";
  docker(psql, `
    insert into private.catalog_media_operations(operation_id,manifest,result)
      values('${operationId}', '{"privateOperationMarker":"MUST_NOT_EXPORT_OPERATION_PAYLOAD"}', '{}');
    insert into private.verified_media_copies(product_id,source_url,target_url,sha256,byte_size,
      mime_type,width,height,source_object_id,source_object_version,target_object_id,target_object_version,operation_id)
    values('${productId}','https://example.invalid/source.webp','https://example.invalid/target.webp',
      repeat('a',64),123,'image/webp',100,100,
      '10000000-0000-4000-8000-000000000711','source-version',
      '10000000-0000-4000-8000-000000000712','target-version','${operationId}');`);
  const populated = readCapture(true);
  check("immutable Media operations and copy records use complete-row hashes", () => {
    createCatalogEvidence(populated as unknown as CatalogEvidenceInput, provenance, "prepared");
    const operations = populated.state.history.mediaOperations as Row;
    const copies = populated.state.history.mediaCopies as Row;
    strictEqual(Object.keys(operations).length, 1);
    strictEqual(Object.keys(copies).length, 1);
    const copy = Object.values(copies)[0] as Row;
    strictEqual(copy.productId, productId);
    strictEqual(copy.operationId, operationId);
    deepStrictEqual(JSON.parse(Object.keys(copies)[0]), [productId, copy.sourceUrl]);
    ok(!JSON.stringify(populated).includes("MUST_NOT_EXPORT"));
    const completeHashes = JSON.parse(docker(psql, `select jsonb_build_object(
      'operation', (select encode(sha256(convert_to(to_jsonb(row)::text,'UTF8')),'hex') from private.catalog_media_operations row),
      'copy', (select encode(sha256(convert_to(to_jsonb(row)::text,'UTF8')),'hex') from private.verified_media_copies row));`).trim());
    strictEqual((operations[operationId] as Row).sha256, completeHashes.operation);
    strictEqual(copy.sha256, completeHashes.copy);
  });
  const concurrent = captureDuringWriter();
  // Handle an early child failure while the observer waits; the original promise
  // remains rejected and is awaited below so a failure cannot pass silently.
  void concurrent.catch(() => {});
  // Observe the local reader executing its delayed statement before committing
  // an independent Product+Source edit. No production function is replaced.
  let observedSleep = false;
  try {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      observedSleep = docker(psql, `select exists(select 1 from pg_stat_activity
        where datname=current_database() and pid<>pg_backend_pid()
          and query like '%CAPTURE_SNAPSHOT_PAUSE%' and wait_event='PgSleep');`).trim() === "t";
      if (observedSleep) break;
      await delay(30);
    }
    ok(observedSleep, "Concurrent capture never established its statement snapshot");
    docker(psql, `begin;
      update public.products set editorial_description='Concurrent reviewed Product change' where id='${productId}';
      update public.product_sources set supplier_title='Concurrent reviewed Source change' where product_id='${productId}';
      commit;`);
  } catch (error) {
    await concurrent.catch(() => {});
    throw error;
  }
  const during = JSON.parse((await concurrent).trim()) as Capture;
  const fresh = readCapture(true);
  check("one capture excludes concurrent committed changes and the next sees both", () => {
    deepStrictEqual(during.state.documents, populated.state.documents);
    const document = fresh.state.documents[productId] as Row;
    strictEqual((document.product as Row).editorial_description, "Concurrent reviewed Product change");
    strictEqual((document.productSource as Row).supplier_title, "Concurrent reviewed Source change");
    notStrictEqual(during.metadata.snapshot, fresh.metadata.snapshot);
  });
  proof = {
    status: "passed", postgres, checks, sourceRevision: sourceRevision.stdout.trim(), startedAt,
    sourceState: "working-tree source bytes captured once before subprocess access and reused for execution and exact hashes",
    querySha256: {
      beforeMediaPreparation: hash(queryBeforeMedia),
      afterMediaPreparation: hash(queryAfterMedia),
    },
    files, executedSql,
    scope: "isolated synthetic Catalog; no provider data, customer tables, or outbound delivery",
  };
} finally {
  if (created) docker(["exec", container, "dropdb", "-U", "postgres", database]);
}
// Failed teardown throws before any successful evidence can reach stdout.
console.log(JSON.stringify({ ...proof, completedAt: new Date().toISOString(),
  teardown: { database, removed: true } }, null, 2));
