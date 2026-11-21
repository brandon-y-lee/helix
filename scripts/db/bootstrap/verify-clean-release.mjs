import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  historyQuery,
  loadMigrations,
  qualifiedMigrationConnection,
  runForward,
} from "../forward-migrations.mjs";

const root = new URL("../../../", import.meta.url);
const operation = (name) =>
  readFileSync(new URL("supabase/operations/release-bootstrap/" + name + ".sql", root), "utf8");
const projectRef = "zyfkunnpnlmgvrojmrbg";
const releases = [
  "20261120131137_bind_catalog_media_to_environment.sql",
  "20261120141910_index_stable_catalog_product_order.sql",
];

export async function verifyCleanForwardRelease({
  stack,
  cleanDatabase,
  recoveredDatabase,
  snapshotSql,
}) {
  assert.equal(cleanDatabase, "helix_bootstrap_fresh_b_" + stack.nonce);
  assert.equal(recoveredDatabase, "helix_bootstrap_prefix_" + stack.nonce);
  const role = "helix_release_" + stack.nonce;
  const password = randomBytes(32).toString("hex");
  const target = {
    role,
    host: "db." + projectRef + ".supabase.co",
    projectRef,
    environment: "development",
    cutoverQualified: true,
    bootstrap: [],
    legacyCount: 0,
    legacyDigest: createHash("sha256").update("[]").digest("hex"),
  };
  const scalar = (database, sql) => stack.sql(database, sql).stdout.toString().trim();
  const readLedger = (database) =>
    JSON.parse(scalar(database, "SELECT row_to_json(s) FROM (" + historyQuery + ") s;"));
  const recovered = readLedger(recoveredDatabase);
  assert.equal(recovered.legacy_count, 12);
  assert.equal(recovered.versions.length, 12);
  assert.deepEqual(recovered.forward, []);
  assert.notEqual(recovered.legacy_digest, target.legacyDigest);
  const recoveredUrl = qualifiedMigrationConnection(
    { ...target, legacyCount: recovered.legacy_count, legacyDigest: recovered.legacy_digest },
    target.environment,
  );
  const releaseUrl = qualifiedMigrationConnection(target, target.environment);
  assert.equal(recoveredUrl.href, releaseUrl.href);
  assert.equal(releaseUrl.hostname, target.host);
  assert.equal(releaseUrl.username, role);
  assert.equal(releaseUrl.searchParams.get("sslmode"), "verify-full");

  // Exercise normal provider-target admission above. Only this separate loopback
  // transport, owned by the nonce-labelled disposable stack, may be dialled.
  const port = stack.docker(["port", stack.container, "5432/tcp"]).stdout.toString().trim();
  assert.match(port, /^127\.0\.0\.1:([0-9]+)$/);
  const loopback = new URL(
    "postgresql://" + role + "@" + port + "/" + cleanDatabase + "?sslmode=disable",
  );
  const ownerSql = (
    sql,
    { user = "postgres", environment = target.environment, mayFail = false } = {},
  ) =>
    stack.exec(
      [
        "/opt/postgres/bin/psql",
        "-h",
        "/tmp",
        "-U",
        user,
        "-d",
        cleanDatabase,
        "-X",
        "-Atq",
        "-v",
        "ON_ERROR_STOP=1",
        "-v",
        "expected_environment=" + environment,
        "-v",
        "expected_project_ref=" + projectRef,
        "-v",
        "writer_role=" + role,
        "-f",
        "-",
      ],
      sql,
      mayFail,
    );
  const namespace = () =>
    scalar(cleanDatabase, "SELECT to_regnamespace('supabase_migrations') IS NULL;");
  assert.equal(namespace(), "t");
  ownerSql(operation("20261120131122_helix_environment_identity"));
  ownerSql(
    "INSERT INTO private.helix_environment (environment, project_ref) VALUES (:'expected_environment', :'expected_project_ref');",
  );
  const initialize = operation("initialize_clean_development_history");
  for (const wrongTarget of [{ user: "supabase_admin" }, { environment: "production" }]) {
    const denied = ownerSql(initialize, { ...wrongTarget, mayFail: true });
    assert.notEqual(denied.status, 0);
    assert.match(denied.stderr.toString(), /authenticated development owner/);
    assert.equal(namespace(), "t");
  }
  ownerSql("CREATE SCHEMA helix_development_prefix;");
  const recoveredWithLostLedger = ownerSql(initialize, { mayFail: true });
  assert.notEqual(recoveredWithLostLedger.status, 0);
  assert.match(recoveredWithLostLedger.stderr.toString(), /requires its genuine migration history/);
  assert.equal(namespace(), "t");
  ownerSql("DROP SCHEMA helix_development_prefix;");
  ownerSql("CREATE SCHEMA supabase_migrations;");
  const partial = ownerSql(initialize, { mayFail: true });
  assert.notEqual(partial.status, 0);
  assert.match(partial.stderr.toString(), /Migration namespace already exists/);
  assert.equal(
    scalar(cleanDatabase, "SELECT to_regclass('supabase_migrations.schema_migrations') IS NULL;"),
    "t",
  );
  ownerSql("DROP SCHEMA supabase_migrations;");
  ownerSql("CREATE ROLE " + role + " LOGIN PASSWORD '" + password + "';");
  ownerSql("ALTER DEFAULT PRIVILEGES GRANT SELECT ON TABLES TO " + role + ";");
  const broadDefault = ownerSql(initialize, { mayFail: true });
  assert.notEqual(broadDefault.status, 0);
  assert.match(broadDefault.stderr.toString(), /owner-only empty migration ledger/);
  assert.equal(namespace(), "t", "A failed ACL check left a partial ledger");
  ownerSql("ALTER DEFAULT PRIVILEGES REVOKE SELECT ON TABLES FROM " + role + ";");
  ownerSql(initialize);
  const empty = readLedger(cleanDatabase);
  assert.deepEqual(empty, {
    legacy_count: 0,
    legacy_digest: target.legacyDigest,
    forward: [],
    versions: [],
  });
  ownerSql(operation("enroll_catalog_media_release"));
  ownerSql(operation("enroll_catalog_order_index"));

  const migrations = (await loadMigrations(fileURLToPath(root))).filter(({ file }) =>
    releases.includes(file),
  );
  assert.deepEqual(
    migrations.map(({ file }) => file),
    releases,
  );
  const businessState = () =>
    scalar(cleanDatabase, snapshotSql)
      .split("\n")
      .filter((line) => !line.startsWith("supabase_migrations.schema_migrations|"));
  const before = businessState();
  const ledgerRows = () =>
    scalar(
      cleanDatabase,
      "SELECT version, xmin, encode(sha256(convert_to(to_jsonb(m)::text,'UTF8')),'hex') FROM supabase_migrations.schema_migrations m ORDER BY version;",
    );
  const client = new pg.Client({
    host: "127.0.0.1",
    port: Number(loopback.port),
    database: cleanDatabase,
    user: role,
    password,
    ssl: false,
  });
  await client.connect();
  try {
    const command = (apply) =>
      runForward({
        client,
        cli: process.env.HELIX_SUPABASE_CLI || "supabase",
        connectionUrl: loopback.href,
        password,
        target,
        migrations,
        apply,
      });
    assert.deepEqual(await command(false), { pending: releases, applied: [] });
    assert.deepEqual(readLedger(cleanDatabase), empty);
    assert.deepEqual(await command(true), { pending: releases, applied: releases });
    const applied = readLedger(cleanDatabase);
    assert.equal(applied.legacy_count, 0);
    assert.equal(applied.legacy_digest, empty.legacy_digest);
    assert.deepEqual(
      applied.versions,
      releases.map((file) => file.split("_")[0]),
    );
    assert.deepEqual(
      applied.forward.map((row) => row.version),
      applied.versions,
    );
    const genuineRows = ledgerRows();
    assert.deepEqual(await command(true), { pending: [], applied: [] });
    assert.equal(ledgerRows(), genuineRows, "Clean release retry changed a genuine recorded row");
    const repeatedInit = ownerSql(initialize, { mayFail: true });
    assert.notEqual(repeatedInit.status, 0);
    assert.match(repeatedInit.stderr.toString(), /Migration namespace already exists/);
    assert.equal(ledgerRows(), genuineRows, "Owner initialization touched an existing forward ledger");
    assert.deepEqual(
      businessState(),
      before,
      "Forward release or retry changed business rows or sequences",
    );
    assert.deepEqual(readLedger(recoveredDatabase), recovered);
    return { initialRecords: 0, applied: releases, retryApplied: 0, preservedHistoricalPrefix: 12 };
  } finally {
    await client.end();
  }
}
