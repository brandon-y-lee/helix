import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  migrationStatement,
  recordedFile,
  validateReleaseSources,
} from "./forward-migrations.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const directory = "supabase/operations/production-marketing/";
const version = "20261121090054_install_direct_production_marketing";
// Exact function bodies from the unused, already-enrolled 20261121081630 release.
const priorInstall =
  "41146d8040d2f8bd7a8c5eeb8a46a58e3f19aeffa7d279b83f839f72f23c23e1";
const priorShape =
  "b965079a02401de5d87a5782c7093cf64895e5bf3b4a24c0cd536dd6ad32658f";
const consentFile =
  "supabase/migrations/20261117090000_production_marketing_consent.sql";
const packages = [
  consentFile,
  ...["delivery", "events", "direct-welcome"].map(
    (name) => directory + name + ".sql",
  ),
];
const predecessors = [
  "20261120131137_bind_catalog_media_to_environment",
  "20261120141910_index_stable_catalog_product_order",
  "20261121073052_extend_checkout_environment",
  "20261121073053_install_live_checkout_contract",
  "20261121075612_extend_business_checkout_environment",
  "20261121075613_install_first_order_checkout",
];
const targets = {
  development: {
    writer: "helix_dev_migration_writer",
    ref: "zyfkunnpnlmgvrojmrbg",
  },
  production: {
    writer: "helix_prod_migration_writer",
    ref: "erasogmsqpgiirovubjh",
  },
};
const sha = (value) => createHash("sha256").update(value).digest("hex");
const read = (base, path) =>
  new TextDecoder("utf-8", { ignoreBOM: true, fatal: true }).decode(
    readFileSync(join(base, path)),
  );
const file = (path) => read(root, path);
const unusedNativePredecessor = {
  cold: sha("[]"),
  consent: "a4d8cd48ff4ad02f12db0f97b4e1dcedfef769a776d6cac2fa4bdc2f02a93d30",
};
const shapeName = "private.helix_welcome_release_shape";
const installName = "private.install_helix_welcome_release";

function prerequisiteSources(base) {
  const sources = [],
    sidecars = [],
    digests = [];
  for (const name of predecessors) {
    const sql = read(base, "supabase/migrations/" + name + ".sql");
    const sidecar = read(base, "supabase/releases/" + name + ".json");
    sources.push([name + ".sql", sql]);
    sidecars.push([name + ".sql", JSON.parse(sidecar)]);
    digests.push([name + ".json", sha(sidecar), sha(sql)]);
  }
  // Catalog + Checkout through the two independently reviewed #592 operations.
  assert.equal(
    sha(JSON.stringify(digests)),
    "ba1bdcb3447aa79ef8493f326e6cb390656e7411d6fed4a3f4f88ab7d731a291",
    "Unreviewed release predecessor",
  );
  return validateReleaseSources(sources, sidecars);
}

function closedPackage(path, index) {
  const sql = file(path);
  assert.doesNotMatch(sql, /[\u0000\r\uFEFF]/);
  // All four canonical files have exactly one outer transaction. Execute only
  // these reviewed bytes in the provider migration's own ledger transaction.
  const match = /^(?:--[^\n]*\n)*BEGIN;\n([\s\S]*)\nCOMMIT;\n?$/.exec(sql);
  assert.ok(
    match && !/^\s*(?:BEGIN|COMMIT|ROLLBACK);\s*$/im.test(match[1]),
    "Unexpected transaction wrapper: " + path,
  );
  const tag = "$helix_package_" + index + "$";
  assert.ok(
    [tag, "$welcome_capability$", "$enroll$"].every(
      (delimiter) => !sql.includes(delimiter),
    ),
    "Package contains a reserved release delimiter: " + path,
  );
  return "EXECUTE " + tag + match[1] + tag + ";";
}

function routineProof(
  name,
  body,
  writer,
  {
    language = "plpgsql",
    returns = "void",
    definer = true,
    config = "ARRAY['search_path=pg_catalog, pg_temp','lock_timeout=3s']",
  } = {},
) {
  return `EXISTS (SELECT FROM pg_catalog.pg_proc p WHERE p.oid=pg_catalog.to_regprocedure('${name}()')
    AND p.proowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='postgres')
    AND p.proowner=(SELECT relowner FROM pg_catalog.pg_class WHERE oid=pg_catalog.to_regclass('private.helix_environment'))
    AND p.prosecdef=${definer} AND p.prolang=(SELECT oid FROM pg_catalog.pg_language WHERE lanname='${language}')
    AND p.prokind='f' AND NOT p.proretset AND NOT p.proleakproof AND NOT p.proisstrict
    AND p.proparallel='u' AND p.prosqlbody IS NULL
    AND p.prorettype='pg_catalog.${returns}'::pg_catalog.regtype AND p.provolatile='${definer ? "v" : "s"}'
    AND p.proconfig=${config}
    AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex')='${body}'
    AND EXISTS (SELECT FROM pg_catalog.aclexplode(p.proacl) a WHERE a.grantee=${writer}
      AND a.grantor=p.proowner AND a.privilege_type='EXECUTE' AND NOT a.is_grantable)
    AND NOT EXISTS (SELECT FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
      WHERE a.grantee<>p.proowner AND (a.grantee<>${writer} OR a.grantor<>p.proowner OR a.is_grantable)))`;
}

function historyGuard(previous, complete) {
  const records = previous
    .map((row) => {
      const staged = recordedFile(row).slice(0, -4);
      return `('${staged.slice(0, 14)}','${staged.slice(15)}','${sha(JSON.stringify([migrationStatement(row.sql)]))}')`;
    })
    .join(",\n      ");
  return `
  SELECT array_agg(version ORDER BY version) INTO versions FROM supabase_migrations.schema_migrations WHERE version>='20261120000000';
  IF cardinality(versions) IS NULL OR cardinality(versions) ${complete ? "<>6" : "NOT BETWEEN 2 AND 6"}
    OR versions IS DISTINCT FROM (ARRAY[${predecessors.map((name) => "'" + name.slice(0, 14) + "'").join(",")}])[1:cardinality(versions)]
    OR EXISTS (SELECT FROM (VALUES ${records}) expected(version,name,digest)
      JOIN supabase_migrations.schema_migrations h USING(version) WHERE h.name IS DISTINCT FROM expected.name
        OR encode(sha256(convert_to(to_jsonb(h.statements)::text,'UTF8')),'hex') IS DISTINCT FROM expected.digest)
    THEN RAISE EXCEPTION 'Unexpected authentic release history before marketing'; END IF;`;
}

const marker = `
  SELECT e.environment,e.project_ref INTO STRICT target_env,target_ref FROM ONLY private.helix_environment e
    JOIN pg_class c ON e.tableoid=c.oid WHERE e.singleton AND c.relkind='r' AND c.relrowsecurity
      AND c.relowner='postgres'::regrole AND c.oid='private.helix_environment'::regclass
      AND (e.environment,e.project_ref) IN (('development','zyfkunnpnlmgvrojmrbg'),('production','erasogmsqpgiirovubjh'));
  writer := (CASE target_env WHEN 'production' THEN 'helix_prod_migration_writer' ELSE 'helix_dev_migration_writer' END)::regrole;
  IF NOT EXISTS (SELECT FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
    WHERE t.tgrelid='private.helix_environment'::regclass AND t.tgname='keep_helix_environment_identity'
      AND t.tgenabled='O' AND t.tgtype=58 AND p.oid='private.keep_helix_environment_identity()'::regprocedure
      AND p.proowner='postgres'::regrole AND p.proconfig=ARRAY['search_path=""']
      AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='MARKER_SHA') THEN
    RAISE EXCEPTION 'Immutable environment marker required'; END IF;
  IF (SELECT count(*) FROM pg_attribute a WHERE a.attrelid=to_regclass('public.admin_memberships') AND NOT a.attisdropped
    AND (a.attname,a.atttypid) IN (('user_id','uuid'::regtype),('role','text'::regtype),('active','boolean'::regtype)))<>3
    THEN RAISE EXCEPTION 'Required application administration contract missing'; END IF;`;

function trustedMarker() {
  const definition = file(
    "supabase/operations/release-bootstrap/20261120131122_helix_environment_identity.sql",
  );
  const [, body] =
    /create function private\.keep_helix_environment_identity\(\)[\s\S]*?as \$\$([\s\S]*?)\$\$;/.exec(
      definition,
    );
  return marker.replace("MARKER_SHA", sha(body));
}

const declarations =
  "target_env text; target_ref text; writer oid; versions text[]; shape text;";
const shapeOptions = {
  language: "sql",
  returns: "text",
  definer: false,
  config: "ARRAY['search_path=pg_catalog, pg_temp']",
};

function generationState(shapes) {
  return `
  shape := ${shapeName}();
  IF target_env='development' AND shape='${shapes.consent}' THEN
    LOCK TABLE private.production_marketing_controls IN ACCESS EXCLUSIVE MODE;
    IF NOT EXISTS (SELECT FROM ONLY private.production_marketing_controls WHERE singleton AND NOT enrollment_enabled AND NOT dispatch_enabled)
      THEN RAISE EXCEPTION 'An inactive original consent store is required'; END IF;
  ELSIF target_env<>'production' OR shape<>'${shapes.cold}' THEN
    RAISE EXCEPTION 'Unknown marketing predecessor or target'; END IF;`;
}

// Render only the ordinary forward stream in this checkout.
export function renderWelcomeRelease({ environment }) {
  assert.ok(
    Object.hasOwn(targets, environment),
    "Expected development or production",
  );
  const target = targets[environment];
  const previous = prerequisiteSources(root);
  const shapes = JSON.parse(file(directory + "release-shapes.json"));
  for (const digest of Object.values(shapes))
    assert.match(digest, /^[0-9a-f]{64}$/);
  const shapeBody = "\n" + file(directory + "release-shape.sql");
  assert.ok(
    !shapeBody.includes("$welcome_shape$") && !shapeBody.includes("$enroll$"),
  );
  const shapeProof = (writer) =>
    routineProof(shapeName, sha(shapeBody), writer, shapeOptions);
  const writerGuard = file(directory + "release-writer.sql");
  const prestate = generationState(shapes);
  // The previously reviewed verifier normally runs as the direct writer. In
  // this fixed owner capability session_user is still that authenticated writer.
  const checkoutProof = previous
    .at(-1)
    .verify.replaceAll(
      "current_user::pg_catalog.regrole",
      "session_user::pg_catalog.regrole",
    );
  const steps = packages.map(closedPackage);
  const body = `
DECLARE ${declarations}
BEGIN
  IF current_user<>'postgres' THEN RAISE EXCEPTION 'Marketing package owner mismatch'; END IF;
  ${trustedMarker()}
  IF session_user::regrole<>writer OR current_setting('role') NOT IN ('none',session_user) THEN
    RAISE EXCEPTION 'Direct target migration login required'; END IF;
  ${writerGuard}
  ${historyGuard(previous, true)}
  IF (${checkoutProof}) IS NOT TRUE THEN RAISE EXCEPTION 'First-order Checkout contract drifted'; END IF;
  IF NOT ${shapeProof("writer")} THEN RAISE EXCEPTION 'Unqualified marketing catalog reader'; END IF;
  ${prestate}
  IF target_env='production' THEN ${steps[0]} END IF;
  ${steps.slice(1).join("\n  ")}
  IF ${shapeName}() IS DISTINCT FROM '${shapes.expanded}' OR NOT EXISTS (
    SELECT FROM ONLY private.production_marketing_controls WHERE singleton AND NOT enrollment_enabled AND NOT dispatch_enabled
      AND NOT status_enabled AND NOT events_enabled AND daily_limit=0 AND monthly_limit=0
      AND confirmation_worker_binding_hash IS NULL AND delivery_contract_text IS NULL
  ) OR NOT EXISTS (
    SELECT FROM ONLY private.production_marketing_direct_policy q
    JOIN ONLY private.production_marketing_direct_lookup_key k USING(singleton)
    WHERE q.singleton AND q.revision=0 AND q.topic_default IS NULL
      AND q.baseline_evidence_sha256 IS NULL AND q.intake_evidence_sha256 IS NULL
      AND q.lookup_key_hash=sha256(k.secret)
  ) OR to_regnamespace('helix_welcome_worker') IS NOT NULL OR to_regrole('helix_native_welcome_worker') IS NOT NULL
  THEN RAISE EXCEPTION 'Expected exact unqualified marketing contract'; END IF;
END
`;
  const installProof = (writer) => routineProof(installName, sha(body), writer);
  const migration = `DO $migration$
BEGIN
  IF current_user<>session_user OR NOT ${installProof("session_user::pg_catalog.regrole")}
    THEN RAISE EXCEPTION 'Unqualified marketing deployment capability'; END IF;
  PERFORM ${installName}();
END
$migration$;
`;
  const manifest = {
    sourceSha256: sha(migration),
    verify: `SELECT CASE WHEN current_user=session_user
    AND ${installProof("current_user::pg_catalog.regrole")}
    AND ${shapeProof("current_user::pg_catalog.regrole")} THEN ${shapeName}()='${shapes.expanded}' ELSE false END AS applied`,
  };
  const proofOfCheckoutEnrollment = previous
    .slice(2)
    .map((row) => {
      const m =
        /p\.oid = '([a-z_.]+)\(\)'[\s\S]*?convert_to\(p\.prosrc,'UTF8'\)\),'hex'\) =\s*'([0-9a-f]{64})'/.exec(
          row.sql,
        );
      assert.ok(m, "Unknown Checkout fixed operation source");
      return routineProof(m[1], m[2], "writer");
    })
    .join("\n    AND ");
  const ownerSql = `BEGIN;
SET LOCAL search_path=pg_catalog,pg_temp;
SET LOCAL lock_timeout='3s';
DO $enroll$
DECLARE ${declarations}
BEGIN
  IF current_user<>session_user OR current_user<>'postgres' THEN RAISE EXCEPTION 'Original authenticated owner required'; END IF;
  -- Serialize enrollment with protected CLI pushes. The marker lock also waits
  -- for direct old capability calls which already read the authenticated target.
  PERFORM pg_advisory_xact_lock(2107275624,561);
  LOCK TABLE ONLY private.helix_environment IN ACCESS EXCLUSIVE MODE;
  ${trustedMarker()}
  IF target_env<>'${environment}' OR target_ref<>'${target.ref}' OR writer<>'${target.writer}'::regrole
    THEN RAISE EXCEPTION 'Externally verified target mismatch'; END IF;
  ${writerGuard}
  ${historyGuard(previous, false)}
  IF NOT (${proofOfCheckoutEnrollment}) THEN RAISE EXCEPTION 'Checkout owner enrollment required'; END IF;
  IF to_regnamespace('helix_welcome_worker') IS NOT NULL OR to_regrole('helix_native_welcome_worker') IS NOT NULL THEN
    RAISE EXCEPTION 'An existing native welcome installation requires its own forward release'; END IF;
  -- A lost enrollment acknowledgment may be retried only on the same unchanged, unused pair.
  IF ${installProof("writer")} AND ${shapeProof("writer")} THEN
    ${prestate}
    RETURN;
  END IF;
  IF NOT (${routineProof(installName, priorInstall, "writer")}
    AND ${routineProof(shapeName, priorShape, "writer", shapeOptions)}) THEN
    RAISE EXCEPTION 'Expected the exact previously enrolled unused marketing capability and reader'; END IF;
  ${generationState(unusedNativePredecessor)}
CREATE OR REPLACE FUNCTION ${shapeName}() RETURNS text LANGUAGE sql STABLE SECURITY INVOKER
  SET search_path=pg_catalog,pg_temp AS $welcome_shape$${shapeBody}$welcome_shape$;
REVOKE ALL ON FUNCTION ${shapeName}() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION ${shapeName}() TO ${target.writer};
CREATE OR REPLACE FUNCTION ${installName}() RETURNS void LANGUAGE plpgsql SECURITY DEFINER
  SET search_path=pg_catalog,pg_temp SET lock_timeout='3s' AS $welcome_capability$${body}$welcome_capability$;
REVOKE ALL ON FUNCTION ${installName}() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION ${installName}() TO ${target.writer};
  IF NOT (${installProof("writer")} AND ${shapeProof("writer")}) THEN RAISE EXCEPTION 'Unexpected marketing capability or grants'; END IF;
  ${prestate}
  ${historyGuard(previous, false)}
END
$enroll$;
COMMIT;
`;
  return { ownerSql, migration, manifest };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [mode, environment] = process.argv.slice(2);
  assert.ok(
    (mode === "--owner" && process.argv.length === 4) ||
      (["--check", "--write"].includes(mode) && process.argv.length === 3),
    "Use --check, --write, or --owner development|production",
  );
  const release = renderWelcomeRelease({
    environment: environment ?? "development",
  });
  const output = [
    [join(root, "supabase/migrations", version + ".sql"), release.migration],
    [
      join(root, "supabase/releases", version + ".json"),
      JSON.stringify(release.manifest, null, 2) + "\n",
    ],
  ];
  for (const [path, body] of output) {
    if (mode === "--write") writeFileSync(path, body);
    else
      assert.equal(
        readFileSync(path, "utf8"),
        body,
        "Generated release differs from approved package",
      );
  }
  if (mode === "--owner") process.stdout.write(release.ownerSql);
}
