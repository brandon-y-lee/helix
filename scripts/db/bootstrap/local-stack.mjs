import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  mkdtempSync,
  mkdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const archiveHash = (bytes) => createHash("sha256").update(bytes).digest("hex");

const snapshotAccessSql = `
BEGIN READ ONLY;
SET LOCAL search_path=pg_catalog;
WITH objects(kind, name, owner, acl, body_hash) AS (
  SELECT 'database', 'database', datdba, coalesce(datacl,acldefault('d',datdba)), NULL::text
    FROM pg_database WHERE datname=current_database()
  UNION ALL SELECT 'schema',nspname,nspowner,coalesce(nspacl,acldefault('n',nspowner)),NULL
    FROM pg_namespace WHERE nspname !~ '^pg_'
  UNION ALL SELECT 'routine','graphql',proowner,coalesce(proacl,acldefault('f',proowner)),
    encode(sha256(convert_to(pg_get_functiondef(oid),'UTF8')),'hex')
    FROM pg_proc WHERE oid=to_regprocedure('graphql_public.graphql(text,text,jsonb,jsonb)')
), states AS (
  SELECT kind,name,jsonb_strip_nulls(jsonb_build_object('owner',pg_get_userbyid(owner),
    'bodyHash',body_hash,'grants',(SELECT coalesce(jsonb_agg(entry ORDER BY entry::text COLLATE "C"),'[]'::jsonb)
      FROM (SELECT jsonb_build_array(pg_get_userbyid(g.grantor),
        CASE g.grantee WHEN 0 THEN 'PUBLIC' ELSE pg_get_userbyid(g.grantee) END,
        g.privilege_type,g.is_grantable) AS entry FROM aclexplode(acl) g) entries))) AS state
  FROM objects
)
SELECT jsonb_build_object('sourceDatabaseAcl',(SELECT state FROM states WHERE kind='database'),
  'managedSchemaAcls',(SELECT jsonb_object_agg(name,state) FROM states WHERE kind='schema'),
  'graphqlWrapper',(SELECT state FROM states WHERE kind='routine'));
ROLLBACK;`;

// pg_dump stores ACL differences from the platform's initialization privileges.
// The two GraphQL namespace grants are original platform grants on this pinned
// image. A template0 database omits them even after a complete pg_restore.
const providerOwner = "supabase_admin";
const consumerRoles = ["anon", "authenticated", "service_role"];
const graphSchemaGrants = [
  [providerOwner, providerOwner, "CREATE", false],
  [providerOwner, providerOwner, "USAGE", false],
  [providerOwner, "postgres", "USAGE", true],
  ...consumerRoles.map((role) => [providerOwner, role, "USAGE", false]),
];
const databaseGrants = [
  ...["PUBLIC", "postgres", "dashboard_user"].flatMap((role) =>
    ["CONNECT", "TEMPORARY"].map((privilege) => [
      "postgres",
      role,
      privilege,
      false,
    ]),
  ),
  ...[
    "postgres",
    "dashboard_user",
    "supabase_etl_admin",
    "supabase_storage_admin",
  ].map((role) => ["postgres", role, "CREATE", false]),
];
const orderedGrants = (grants) =>
  grants.map((grant) => JSON.stringify(grant)).sort();

function checkBackupAccess({
  sourceDatabaseAcl,
  managedSchemaAcls,
  graphqlWrapper,
}) {
  assert.equal(
    sourceDatabaseAcl.owner,
    "postgres",
    "Unexpected test database owner",
  );
  assert.deepEqual(
    orderedGrants(sourceDatabaseAcl.grants),
    orderedGrants(databaseGrants),
    "Unreviewed database ACL",
  );
  for (const name of ["graphql", "graphql_public"]) {
    assert.equal(managedSchemaAcls[name].owner, providerOwner);
    assert.deepEqual(
      orderedGrants(managedSchemaAcls[name].grants),
      orderedGrants(graphSchemaGrants),
      "Unreviewed GraphQL schema ACL",
    );
  }
  assert.equal(graphqlWrapper.owner, providerOwner);
  assert.equal(
    graphqlWrapper.bodyHash,
    "62b09c65abb4755df514ce62bd736c05446d2644943b584ae2513334f44dbd08",
  );
  assert.deepEqual(
    orderedGrants(graphqlWrapper.grants),
    orderedGrants(
      ["PUBLIC", providerOwner, "postgres", ...consumerRoles].map((role) => [
        providerOwner,
        role,
        "EXECUTE",
        false,
      ]),
    ),
    "Unreviewed GraphQL wrapper ACL",
  );
}

export function localStack() {
  const nonce = randomBytes(6).toString("hex");
  const directory = realpathSync(
    mkdtempSync(path.join(tmpdir(), "helix-bootstrap-")),
  );
  const project = path.join(directory, "project");
  const state = path.join(directory, "cli-state");
  const migrations = path.join(project, "supabase", "migrations");
  mkdirSync(migrations, { recursive: true, mode: 0o700 });
  mkdirSync(state, { mode: 0o700 });
  const cliPath = process.env.SUPABASE_CLI || "supabase";
  const socket =
    process.env.DOCKER_HOST ||
    spawnSync(
      "docker",
      ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"],
      {
        encoding: "utf8",
      },
    ).stdout?.trim();
  assert.match(
    socket ?? "",
    /^unix:\/\/\/[^\n]+$/,
    "A local Docker Unix socket is required.",
  );
  const env = {
    PATH: process.env.PATH,
    SUPABASE_HOME: state,
    SUPABASE_NO_KEYRING: "1",
    DO_NOT_TRACK: "1",
    SUPABASE_TELEMETRY_DISABLED: "1",
    DOCKER_HOST: socket,
    DOCKER_CONFIG: directory,
  };
  writeFileSync(
    path.join(project, "supabase/config.toml"),
    [
      'project_id = "helix-bootstrap-' + nonce + '"',
      "[api]",
      "enabled = true",
      "auto_expose_new_tables = false",
      "[db]",
      "major_version = 17",
      "[db.migrations]",
      "enabled = false",
      "[db.seed]",
      "enabled = false",
      "[auth]",
      "enabled = true",
      'site_url = "http://127.0.0.1:3000"',
      "[storage]",
      "enabled = true",
      "[realtime]",
      "enabled = false",
      "[studio]",
      "enabled = false",
      "[analytics]",
      "enabled = false",
      "[edge_runtime]",
      "enabled = false",
      "[experimental]",
      "stack = true",
      "[local.services.default]",
      'version = "bundled"',
      "[local.services.database]",
      'version = "17.12.0.000-r0"',
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
  let stackId, container;
  const step = (exe, args, input, mayFail = false) => {
    const result = spawnSync(exe, args, {
      input,
      cwd: project,
      env,
      timeout: 300_000,
      maxBuffer: 128 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    });
    if (result.error) throw result.error;
    if (result.status !== 0 && !mayFail) {
      // Raw CLI/status output can include locally issued keys. Only report bounded diagnostics.
      const diagnostic = result.stderr
        .toString()
        .split("\n")
        .filter((l) =>
          /^(?:ERROR:|FATAL:|Error:|error:|psql:|pg_restore: error:)/.test(l),
        )
        .slice(0, 2)
        .join(" ")
        .replace(
          /(?:https?:\/\/|postgres(?:ql)?:\/\/)\S+|eyJ[\w.-]+|(?:sb_secret_|sb_publishable_)\S+/g,
          "[redacted]",
        );
      throw Error(
        exe +
          " " +
          (exe === "docker" ? args[0] : "local command") +
          " failed (" +
          result.status +
          ") " +
          diagnostic.slice(0, 450),
      );
    }
    return result;
  };
  const docker = (args, input, mayFail) => step("docker", args, input, mayFail);
  const cli = (...args) =>
    step(cliPath, [
      "--workdir",
      project,
      "--output-format",
      "json",
      ...args,
    ]).stdout.toString();
  const owned = () =>
    JSON.parse(cli("stack", "list")).stacks.filter(
      (s) => s.project_root === project && s.runtime === "docker",
    );
  const exec = (args, input, mayFail) => {
    assert.match(container ?? "", /^[0-9a-f]{64}$/);
    return docker(["exec", "-i", container, ...args], input, mayFail);
  };
  const sql = (database, query, mayFail = false) =>
    exec(
      [
        "/opt/postgres/bin/psql",
        "-h",
        "/tmp",
        "-U",
        "supabase_admin",
        "-d",
        database,
        "-X",
        "-Atq",
        "-v",
        "ON_ERROR_STOP=1",
        "-f",
        "-",
      ],
      query,
      mayFail,
    );
  const testDatabase = (name) => {
    assert.match(
      name,
      new RegExp(
        "^helix_bootstrap_(?:fresh_a|fresh_b|prefix|restore)_" + nonce + "$",
      ),
    );
  };
  const snapshotAccess = (name) =>
    JSON.parse(sql(name, snapshotAccessSql).stdout.toString());
  const backup = (source) => {
    if (source !== "postgres") testDatabase(source);
    const access = snapshotAccess(source);
    checkBackupAccess(access);
    const archive = exec([
      "/opt/postgres/bin/pg_dump",
      "-h",
      "/tmp",
      "-U",
      "supabase_admin",
      "--format=custom",
      source,
    ]).stdout;
    assert.deepEqual(
      snapshotAccess(source),
      access,
      "Access changed during the local backup",
    );
    return {
      archive,
      manifest: { archiveSha256: archiveHash(archive), ...access },
    };
  };
  const restore = ({ archive, manifest }, name) => {
    testDatabase(name);
    assert.equal(
      archive.subarray(0, 5).toString(),
      "PGDMP",
      "Expected a real PostgreSQL backup",
    );
    assert.equal(
      archiveHash(archive),
      manifest.archiveSha256,
      "Backup manifest belongs to another archive",
    );
    checkBackupAccess(manifest);
    exec([
      "/opt/postgres/bin/createdb",
      "-h",
      "/tmp",
      "-U",
      "supabase_admin",
      "-T",
      "template0",
      "-O",
      "postgres",
      name,
    ]);
    exec(
      [
        "/opt/postgres/bin/pg_restore",
        "-h",
        "/tmp",
        "-U",
        "supabase_admin",
        "-d",
        name,
        "--single-transaction",
        "--exit-on-error",
      ],
      archive,
    );
    const observed = snapshotAccess(name);
    assert.deepEqual(
      observed.graphqlWrapper,
      manifest.graphqlWrapper,
      "Restored GraphQL wrapper changed",
    );
    const grants = [];
    assert.equal(
      observed.sourceDatabaseAcl.owner,
      manifest.sourceDatabaseAcl.owner,
    );
    for (const grant of observed.sourceDatabaseAcl.grants) {
      assert.ok(
        orderedGrants(databaseGrants).includes(JSON.stringify(grant)),
        "Unexpected restored database access",
      );
    }
    for (const grant of manifest.sourceDatabaseAcl.grants) {
      if (
        !orderedGrants(observed.sourceDatabaseAcl.grants).includes(
          JSON.stringify(grant),
        )
      ) {
        const [, grantee, privilege] = grant;
        grants.push(`GRANT ${privilege} ON DATABASE "${name}" TO ${grantee}`);
      }
    }
    assert.deepEqual(
      Object.keys(observed.managedSchemaAcls).sort(),
      Object.keys(manifest.managedSchemaAcls).sort(),
    );
    for (const [schema, expected] of Object.entries(
      manifest.managedSchemaAcls,
    )) {
      const restored = observed.managedSchemaAcls[schema];
      if (isDeepStrictEqual(restored, expected)) continue;
      assert.ok(
        schema === "graphql" || schema === "graphql_public",
        "Unreviewed schema ACL discrepancy on " + schema,
      );
      assert.equal(restored.owner, providerOwner);
      // Only the original template0 owner ACL is a supported restore discrepancy.
      assert.deepEqual(
        orderedGrants(restored.grants),
        orderedGrants(
          graphSchemaGrants.filter(([, role]) => role === providerOwner),
        ),
      );
      grants.push(
        `GRANT USAGE ON SCHEMA ${schema} TO postgres WITH GRANT OPTION`,
      );
      grants.push(
        `GRANT USAGE ON SCHEMA ${schema} TO anon, authenticated, service_role`,
      );
    }
    if (grants.length)
      sql(name, "BEGIN;\n" + grants.join(";\n") + ";\nCOMMIT;");
    const { archiveSha256, ...expected } = manifest;
    assert.deepEqual(
      snapshotAccess(name),
      expected,
      "Backup access manifest was not fully restored",
    );
  };
  const session = (name) => {
    testDatabase(name);
    return spawn(
      "docker",
      [
        "exec",
        "-i",
        container,
        "/opt/postgres/bin/psql",
        "-h",
        "/tmp",
        "-U",
        "postgres",
        "-d",
        name,
        "-X",
        "-qAt",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      { cwd: project, env, timeout: 60_000, stdio: ["pipe", "pipe", "pipe"] },
    );
  };
  return {
    nonce,
    migrations,
    directory,
    sql,
    cli,
    exec,
    docker,
    backup,
    restore,
    session,
    get container() {
      return container;
    },
    start() {
      const version = step(cliPath, ["--version"]).stdout.toString().trim();
      assert.equal(version, "3.1.0", "Use the tested Supabase CLI release");
      assert.equal(owned().length, 0);
      cli("start", "--runtime", "docker", "--eager");
      const stacks = owned();
      assert.equal(stacks.length, 1);
      stackId = stacks[0].id;
      const ids = docker([
        "ps",
        "-q",
        "--no-trunc",
        "--filter",
        "label=com.supabase.stack=" + stackId,
        "--filter",
        "label=com.supabase.service=database",
      ])
        .stdout.toString()
        .trim()
        .split("\n");
      assert.equal(ids.length, 1);
      container = ids[0];
      const root = JSON.parse(
        docker([
          "inspect",
          "--format",
          '{{json (index .Config.Labels "com.supabase.stack-root")}}',
          container,
        ]).stdout,
      );
      assert.equal(
        realpathSync(root),
        realpathSync(path.join(state, "stacks", stackId, "data")),
      );
      for (const address of JSON.parse(
        docker([
          "inspect",
          "--format",
          "{{json .NetworkSettings.Ports}}",
          container,
        ]).stdout,
      )["5432/tcp"] ?? []) {
        assert.equal(address.HostIp, "127.0.0.1");
      }
      assert.equal(
        sql("postgres", "show server_version_num;").stdout.toString().trim(),
        "170012",
      );
    },
    cleanup() {
      const stacks = owned();
      for (const stack of stacks) {
        assert.ok(!stackId || stack.id === stackId);
        cli("stack", "stop", "--stack-id", stack.id);
        cli("stack", "destroy", "--stack-id", stack.id, "--yes");
      }
      assert.equal(owned().length, 0);
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
