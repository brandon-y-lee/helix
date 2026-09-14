import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstat, open, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { APPROVED_SUPABASE_PROJECT_REF } from "../../lib/supabase/project-safety";
import {
  assertCatalogEvidence, assertCatalogEvidencePlan, compareCatalogEvidence, createCatalogEvidence, parseCatalogEvidenceJson,
  type CatalogEvidenceInput, type EvidencePhase,
} from "./catalog-evidence";
import { buildCatalogEvidenceQuery, catalogEvidenceReadTransaction, MEDIA_BOUNDARY_INSPECTION_QUERY } from "./catalog-evidence-query";

type SourceProvenance = { sourceCommit: string; extractorSha256: string };
type Runtime = {
  env: NodeJS.ProcessEnv; fetchImpl?: typeof fetch; now?: () => Date;
  readProvenance?: () => Promise<SourceProvenance>;
};
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const EXTRACTOR_FILES = ["scripts/catalog/catalog-evidence.ts", "scripts/catalog/catalog-evidence-query.ts", "scripts/catalog/capture-catalog-evidence.ts", "lib/supabase/project-safety.ts"];
const PROJECT_URL = `https://${APPROVED_SUPABASE_PROJECT_REF}.supabase.co`;
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function fail(message: string): never { throw new Error(`Catalog evidence: ${message}`); }

function argumentsFor(argv: string[]): { command: string; flags: Record<string, string> } {
  const [command, ...arguments_] = argv;
  const allowed = command === "capture" ? ["phase", "output"] : command === "compare" ? ["before", "after", "plan"] : [];
  if (!allowed.length) fail("use capture --phase=before|prepared|postflight --output=/private/file.json or compare --before=/private/before.json --after=/private/after.json --plan=/private/plan.json.");
  const flags: Record<string, string> = {};
  for (const argument of arguments_) {
    const parsed = /^--([a-z]+)=(.+)$/.exec(argument);
    if (!parsed || !allowed.includes(parsed[1]) || Object.hasOwn(flags, parsed[1])) fail("unknown, missing, or duplicate command argument.");
    flags[parsed[1]] = parsed[2];
  }
  if (allowed.some((name) => !flags[name])) fail("all documented command arguments are required.");
  return { command, flags };
}

async function outputPath(path: string): Promise<string> {
  if (!isAbsolute(path)) fail("evidence output must use an absolute private path.");
  const directory = await realpath(dirname(path));
  const destination = join(directory, path.slice(path.lastIndexOf("/") + 1));
  try { await lstat(destination); fail("evidence output already exists; previous captures are never overwritten."); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  let insideRepository = false;
  try {
    insideRepository = execFileSync("git", ["-C", directory, "rev-parse", "--is-inside-work-tree"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() === "true";
  } catch { /* A private output directory does not need to be a Git repository. */ }
  if (insideRepository) fail("raw private Catalog evidence must be stored outside every Git worktree.");
  return destination;
}

async function readJson(path: string): Promise<unknown> {
  if (!isAbsolute(path)) fail("input artifacts require absolute paths.");
  const contents = await readFile(path, "utf8");
  return parseCatalogEvidenceJson(contents);
}
function singleRow(value: unknown, key: string): unknown {
  if (!Array.isArray(value) || value.length !== 1 || !record(value[0]) || !Object.hasOwn(value[0], key)) fail("query did not return exactly one complete evidence row.");
  return value[0][key];
}

async function readExtractorProvenance(): Promise<SourceProvenance> {
  const sourceCommit = execFileSync("git", ["-C", ROOT, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const files = await Promise.all(EXTRACTOR_FILES.map(async (path) => ({ path, bytes: await readFile(resolve(ROOT, path), "utf8") })));
  return { sourceCommit, extractorSha256: createHash("sha256").update(JSON.stringify(files)).digest("hex") };
}

export async function runCatalogEvidenceCommand(argv: string[], runtime: Runtime) {
  const { command, flags } = argumentsFor(argv);
  if (command === "compare") {
    const before = await readJson(flags.before); const after = await readJson(flags.after); const plan = await readJson(flags.plan);
    assertCatalogEvidence(before); assertCatalogEvidence(after); assertCatalogEvidencePlan(plan);
    return { ...compareCatalogEvidence(before, after, plan), operationalCompletionVerified: false };
  }

  const destination = await outputPath(flags.output);
  if (!["before", "prepared", "postflight"].includes(flags.phase)) fail("capture phase must be before, prepared, or postflight.");
  if (runtime.env.NEXT_PUBLIC_SUPABASE_URL?.trim() !== PROJECT_URL || !runtime.env.SUPABASE_ACCESS_TOKEN?.trim()) fail("the exact approved project URL and SUPABASE_ACCESS_TOKEN are required.");
  const readProvenance = runtime.readProvenance ?? readExtractorProvenance;
  const { sourceCommit, extractorSha256 } = await readProvenance();
  const fetchImpl = runtime.fetchImpl ?? fetch;
  const now = runtime.now ?? (() => new Date());
  async function request(suffix: string, query?: string): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchImpl(`https://api.supabase.com/v1/projects/${APPROVED_SUPABASE_PROJECT_REF}${suffix}`, {
        method: query === undefined ? "GET" : "POST",
        redirect: "error",
        headers: { Authorization: `Bearer ${runtime.env.SUPABASE_ACCESS_TOKEN!.trim()}`, "Content-Type": "application/json" },
        // The API's read_only role cannot execute the protected document RPC.
        // Use the authorized role with a database-enforced read-only transaction.
        ...(query === undefined ? {} : { body: JSON.stringify({ query: catalogEvidenceReadTransaction(query), read_only: false }) }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch { return fail("the approved-project read did not complete; no evidence was written."); }
    if (!response.ok) fail(`approved-project read failed (HTTP ${response.status}); provider payloads are withheld.`);
    return parseCatalogEvidenceJson(await response.text());
  }
  const project = await request("");
  if (!record(project) || project.ref !== APPROVED_SUPABASE_PROJECT_REF || project.status !== "ACTIVE_HEALTHY"
    || !record(project.database) || project.database.host !== `db.${APPROVED_SUPABASE_PROJECT_REF}.supabase.co`) fail("the provider did not confirm the exact healthy approved project and database host.");
  const projectVerifiedAt = now().toISOString();
  const media = singleRow(await request("/database/query", MEDIA_BOUNDARY_INSPECTION_QUERY), "media_boundary");
  if (!record(media) || Object.keys(media).length !== 3) fail("media-boundary inspection was incomplete.");
  const relationPresence = [media.catalog_media_policy, media.catalog_media_operations, media.verified_media_copies];
  if (relationPresence.some((value) => typeof value !== "boolean" || value !== relationPresence[0])) fail("media preparation is partially installed.");
  const mediaPresent = relationPresence[0] as boolean;
  if (flags.phase !== "before" && !mediaPresent) fail("prepared/postflight captures require the current media boundary; capture its absence as before-state.");
  const query = buildCatalogEvidenceQuery(mediaPresent);
  const raw = singleRow(await request("/database/query", query), "evidence");
  const evidence = createCatalogEvidence(raw as CatalogEvidenceInput, {
    projectRef: APPROVED_SUPABASE_PROJECT_REF, endpoint: PROJECT_URL, projectVerifiedAt, sourceCommit, extractorSha256,
  }, flags.phase as EvidencePhase);
  if (evidence.state.mediaBoundary.present !== mediaPresent) fail("the media installation changed during capture; repeat inspection.");
  const contents = `${JSON.stringify(evidence, null, 2)}\n`;
  if (Buffer.byteLength(contents) > 64 * 1024 * 1024) fail("capture exceeds the bounded 64 MiB artifact size.");
  const finalProvenance = await readProvenance();
  if (finalProvenance.sourceCommit !== sourceCommit || finalProvenance.extractorSha256 !== extractorSha256) fail("source or extractor changed during capture; repeat with stable source.");
  const file = await open(destination, "wx", 0o600);
  try { await file.writeFile(contents, "utf8"); await file.sync(); } finally { await file.close(); }
  return {
    ok: true, phase: evidence.phase, operationalCompletionVerified: false,
    output: destination, projectRef: APPROVED_SUPABASE_PROJECT_REF, capturedAt: evidence.metadata.capturedAt,
    products: Object.keys(evidence.state.documents).length,
    activeProducts: Object.values(evidence.state.productStatuses).filter((status) => status === "active").length,
    revisions: Object.keys(evidence.state.history.revisions).length,
    auditEntries: Object.keys(evidence.state.history.auditEntries).length,
    mediaBoundaryPresent: evidence.state.mediaBoundary.present,
    stateSha256: evidence.fingerprints.stateSha256, captureSha256: evidence.captureSha256, sourceCommit, extractorSha256,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  config({ path: resolve(process.cwd(), ".env.local"), quiet: true });
  runCatalogEvidenceCommand(process.argv.slice(2), { env: process.env })
    .then((report) => { console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1; })
    .catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Catalog evidence command failed."); process.exitCode = 1; });
}
