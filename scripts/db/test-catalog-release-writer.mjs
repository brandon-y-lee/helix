import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

// Stop the other transaction at a known point while its real Product lock
// is held. Both the gate and the observation are confined to this fixture DB.
async function checkWhileProductsLocked(client, mode, operation, inspect) {
  await client.query("SELECT pg_advisory_lock(563, 1)");
  async function observe() {
    try {
      const deadline = Date.now() + 30_000;
      do {
        const { rows: [state] } = await client.query(`SELECT EXISTS (
          SELECT FROM pg_locks gate JOIN pg_locks product USING (pid, database)
          WHERE gate.locktype = 'advisory' AND NOT gate.granted AND gate.classid = 563
            AND gate.objid = 1 AND gate.objsubid = 2
            AND gate.database = (SELECT oid FROM pg_database WHERE datname = current_database())
            AND product.relation = 'public.products'::regclass AND product.mode = $1 AND product.granted
        ) AS held`, [mode]);
        if (state.held) return await inspect();
        await delay(100);
      } while (Date.now() < deadline);
      assert.fail(`Timed out waiting for the other transaction's ${mode} on public.products`);
    } finally {
      await client.query("SELECT pg_advisory_unlock(563, 1)");
    }
  }
  const outcomes = await Promise.allSettled([operation(), observe()]);
  for (const result of outcomes) if (result.status === "rejected") throw result.reason;
}

// Fixture setup runs only after test-catalog-media has checked its disposable
// container label and created this run's unique database and login identity.
export function createCatalogReleaseWriter(docker, psql, writerRole, writerPassword) {
  assert.match(writerRole, /^helix_media_writer_[a-f0-9]{16}$/);
  assert.match(writerPassword, /^[a-f0-9]{64}$/);
  docker(psql, `
    BEGIN;
    CREATE ROLE ${writerRole} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${writerPassword}';
    CREATE SCHEMA supabase_migrations;
    CREATE TABLE supabase_migrations.schema_migrations (version text PRIMARY KEY, name text, statements text[]);
    COMMIT;
  `);
}

// Exercise the real CLI's ledger insertion with a harmless historical fixture.
// The owner never inserts a record on the writer's behalf.
export function seedCliHistory(cli, connectionUrl, password) {
  const working = mkdtempSync(join(tmpdir(), "helix-media-history-"));
  try {
    mkdirSync(join(working, "supabase", "migrations"), { recursive: true });
    writeFileSync(join(working, "supabase", "config.toml"), 'project_id = "helix-catalog-proof"\n');
    writeFileSync(join(working, "supabase", "migrations", "20200101000000_synthetic.sql"), "SELECT 1;\n");
    const options = {
      stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", timeout: 60_000,
      env: { PATH: process.env.PATH, HOME: working, XDG_CONFIG_HOME: working, PGPASSWORD: password,
        SUPABASE_TELEMETRY_DISABLED: "1", NO_COLOR: "1" },
    };
    assert.equal(execFileSync(cli, ["--version"], options).trim(), "2.117.0");
    execFileSync(cli, ["--workdir", working, "--yes", "db", "push", "--db-url", connectionUrl, "--skip-vault"], options);
  } finally {
    rmSync(working, { recursive: true, force: true });
  }
}

export async function checkCatalogRelease({
  root, docker, container, database, writerRole, writerPassword, environment, projectRef, oppositeRef,
  migrationPath, sidecar, cli, runnerFile, fixtures,
}) {
  assert.ok(!process.env.DOCKER_HOST && !process.env.DOCKER_CONTEXT, "Use the local Docker socket");
  const context = JSON.parse(docker(["context", "inspect"]))[0];
  assert.ok(context.Endpoints.docker.Host.startsWith("unix://"), "Use the local Docker socket");
  const address = docker(["port", container, "5432/tcp"]).trim();
  const port = /^127\.0\.0\.1:(\d+)$/.exec(address)?.[1];
  assert.ok(port, "The Catalog proof needs one local loopback PostgreSQL port");
  const runner = pathToFileURL(resolve(runnerFile ?? join(root, "scripts/db/forward-migrations.mjs")));
  const { historyQuery, runForward, validateReleaseSources } = await import(runner.href);
  const { Client } = createRequire(runner)("pg");
  const sql = readFileSync(join(root, migrationPath), "utf8");
  const file = basename(migrationPath);
  const [migration] = validateReleaseSources([[file, sql]], [[file, sidecar]]);
  const releaseDatabase = database + "_release";
  const psql = ["exec", "-i", container, "psql", "-X", "-U", "postgres", "-d", releaseDatabase,
    "--quiet", "--no-align", "--tuples-only", "--set=ON_ERROR_STOP=1"];
  const connectionUrl = `postgresql://${writerRole}@127.0.0.1:${port}/${releaseDatabase}?sslmode=disable`;
  const client = new Client({ host: "127.0.0.1", port: Number(port), database: releaseDatabase,
    user: writerRole, password: writerPassword, ssl: false, connectionTimeoutMillis: 5_000 });

  // The clone inherits the actual old schema, owner enrollment and marker. Use
  // a fresh Catalog fixture here so its durable records do not disturb the
  // rollback-isolated SQL and concurrency scenarios in the original scratch DB.
  docker(["exec", container, "createdb", "-U", "postgres", "--template", database, releaseDatabase]);
  try {
    const oldData = () => docker(psql, fixtures + "\nselect pg_temp.catalog_identity_state();").trim();
    const validator = () => docker(psql, "SELECT to_regprocedure('private.is_bound_catalog_product_media_url(text)') IS NOT NULL;").trim();
    docker(psql, fixtures + "\nselect pg_temp.seed_catalog_identity('synthetic-serum','Synthetic serum');");
    const snapshot = oldData();
    assert.equal(validator(), "f");
    await client.connect();
    const { rows: [profile] } = await client.query(`SELECT session_user, current_user,
      NOT (rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls) AS restricted,
      NOT EXISTS (SELECT FROM pg_auth_members m WHERE m.member = r.oid) AS no_memberships,
      NOT has_schema_privilege(current_user,'public','CREATE') AND NOT has_schema_privilege(current_user,'private','CREATE') AS no_create,
      has_function_privilege(current_user,'private.read_helix_environment()','EXECUTE') AS private_reader,
      has_function_privilege(current_user,'public.read_helix_environment()','EXECUTE') AS public_reader,
      has_function_privilege(current_user,'private.apply_helix_catalog_media_binding()','EXECUTE') AS can_apply,
      NOT has_table_privilege(current_user,'private.helix_environment','INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') AS cannot_bind
      FROM pg_roles r WHERE rolname=current_user`);
    assert.deepEqual(profile, { session_user: writerRole, current_user: writerRole, restricted: true,
      no_memberships: true, no_create: true, private_reader: true, public_reader: true, can_apply: true, cannot_bind: true });
    const deny = (query) => assert.rejects(client.query(query), { code: "42501" });
    await deny("SET ROLE service_role");
    await deny("SET ROLE postgres");
    await deny("UPDATE private.helix_environment SET project_ref = project_ref");
    await deny("UPDATE public.product_media SET url = url");
    await deny("ALTER TABLE public.product_media ADD COLUMN unsafe text");
    await deny("ALTER FUNCTION private.apply_helix_catalog_media_binding() RENAME TO unsafe");
    await deny("UPDATE supabase_migrations.schema_migrations SET name = name");

    seedCliHistory(cli, connectionUrl, writerPassword);
    const { rows: [before] } = await client.query(historyQuery);
    assert.equal(before.legacy_count, 1);
    assert.deepEqual(before.forward, []);
    const target = { environment, projectRef, role: writerRole, legacyCount: before.legacy_count,
      legacyDigest: before.legacy_digest, bootstrap: [] };
    const common = { client, connectionUrl, password: writerPassword, cli, target, migrations: [migration] };
    if (environment === "production") {
      const push = { ref: "refs/heads/main", after: "a".repeat(40) };
      const protectedHeads = new Map([["refs/heads/main", push.after]]);
      common.assertCurrentSource = async () => assert.equal(protectedHeads.get(push.ref), push.after);
    }
    await assert.rejects(runForward({ ...common, apply: true, target: { ...target, projectRef: oppositeRef } }),
      /Database marker or writer identity mismatch/);
    assert.deepEqual((await runForward({ ...common, apply: false })).pending, [file]);
    assert.equal(validator(), "f");
    // A sequence observes the failure point outside the rolled-back transaction.
    // It advances only when the genuine ledger insert sees the application DDL.
    docker(psql, `CREATE SEQUENCE private.media_ledger_interruption_observed;
      CREATE FUNCTION private.stop_media_ledger_fixture() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
      BEGIN
        IF NEW.version = '20261120131137' AND to_regprocedure('private.is_bound_catalog_product_media_url(text)') IS NOT NULL THEN
          PERFORM nextval('private.media_ledger_interruption_observed');
          RAISE EXCEPTION 'synthetic ledger interruption';
        END IF;
        RETURN NEW;
      END $$;
      REVOKE ALL ON FUNCTION private.stop_media_ledger_fixture() FROM PUBLIC, anon, authenticated, service_role;
      CREATE TRIGGER stop_media_ledger_fixture BEFORE INSERT ON supabase_migrations.schema_migrations
      FOR EACH ROW EXECUTE FUNCTION private.stop_media_ledger_fixture();`);
    await assert.rejects(runForward({ ...common, apply: true }), /Supabase CLI operation failed/);
    assert.equal(docker(psql, "SELECT is_called FROM private.media_ledger_interruption_observed;").trim(), "t",
      "The history insert must observe the new application DDL before the transaction fails");
    assert.deepEqual((await client.query(historyQuery)).rows[0], before);
    assert.equal(validator(), "f", "Failed ledger insert must roll back the application DDL");
    assert.equal(oldData(), snapshot);
    docker(psql, "DROP TRIGGER stop_media_ledger_fixture ON supabase_migrations.schema_migrations;");
    assert.deepEqual((await runForward({ ...common, apply: true })).applied, [file]);
    assert.equal(validator(), "t");
    assert.deepEqual((await client.query(sidecar.verify)).rows, [{ applied: true }]);
    assert.deepEqual(await runForward({ ...common, apply: true }), { pending: [], applied: [] });
    const { rows: [after] } = await client.query(historyQuery);
    assert.equal(after.legacy_digest, before.legacy_digest);
    assert.equal(after.legacy_count, 1);
    assert.deepEqual(after.forward.map((row) => row.version), ["20261120131137"]);
    assert.equal(oldData(), snapshot, "The existing Catalog records must remain identical across the real release");

    const orderFile = "20261120141910_index_stable_catalog_product_order.sql";
    const orderSql = readFileSync(join(root, "supabase/migrations", orderFile), "utf8");
    const orderSidecar = JSON.parse(readFileSync(join(root, "supabase/releases", orderFile.replace(/\.sql$/, ".json")), "utf8"));
    const [orderMigration] = validateReleaseSources([[orderFile, orderSql]], [[orderFile, orderSidecar]]);
    const orderRelease = { ...common, migrations: [migration, orderMigration], apply: true };
    const installer = readFileSync(join(root, "supabase/operations/release-bootstrap/enroll_catalog_order_index.sql"), "utf8");
    const enroll = [...psql, "-v", `writer_role=${writerRole}`, "-v", `expected_environment=${environment}`];
    const ownerEnroll = (ref) => docker([...enroll, "-v", `expected_project_ref=${ref}`], installer);
    assert.throws(() => ownerEnroll(oppositeRef), /independently verified environment/);
    docker(psql, `GRANT UPDATE (sort_order) ON public.products TO ${writerRole}`);
    assert.throws(() => ownerEnroll(projectRef), /restricted Catalog media migration login/);
    docker(psql, `REVOKE UPDATE (sort_order) ON public.products FROM ${writerRole}`);
    ownerEnroll(projectRef);
    assert.equal(docker(psql, `SELECT NOT EXISTS (SELECT FROM pg_roles WHERE rolname IN ('anon','authenticated','authenticator','service_role')
      AND (pg_has_role(oid,'${writerRole}','MEMBER') OR has_function_privilege(oid,'private.apply_helix_catalog_order_index()','EXECUTE')))`).trim(), "t");
    await deny("CREATE INDEX unauthorized_index ON public.products (id)");
    await deny("ALTER FUNCTION private.apply_helix_catalog_order_index() RENAME TO unauthorized");

    const predecessor = () => docker(psql, "SELECT 'public.products_catalog_status_sort_idx'::regclass::oid, pg_get_indexdef('public.products_catalog_status_sort_idx'::regclass)").trim();
    const oldIndex = predecessor();
    docker(psql, "CREATE INDEX products_catalog_status_sort_id_idx ON public.products (id)");
    await assert.rejects(runForward(orderRelease), /Supabase CLI operation failed/);
    assert.deepEqual((await client.query(orderSidecar.verify)).rows, [{ applied: false }]);
    assert.deepEqual((await client.query(historyQuery)).rows[0], after);
    docker(psql, "DROP INDEX public.products_catalog_status_sort_id_idx");

    const assertOrderPending = async () => {
      const { rows } = await client.query("SELECT to_regclass('public.products_catalog_status_sort_id_idx') IS NULL AS absent");
      assert.deepEqual(rows, [{ absent: true }]);
      assert.deepEqual((await client.query(historyQuery)).rows[0], after);
    };
    for (const keys of [
      "(catalog_status, sort_order, id)", "(sort_order, catalog_status, id)", "(catalog_status, sort_order, id, slug)",
      "(catalog_status, sort_order DESC, id DESC) INCLUDE (slug)",
      "(sort_order, id) WHERE catalog_status = 'active'",
      "(sort_order, id) WHERE catalog_status IN ('active', 'draft')",
      "(sort_order, id) WHERE catalog_status IS NOT NULL",
    ]) {
      docker(psql, `CREATE INDEX alternate_order ON public.products ${keys}`);
      const alternate = () => docker(psql, "SELECT 'public.alternate_order'::regclass::oid, pg_get_indexdef('public.alternate_order'::regclass)");
      const original = alternate();
      await assert.rejects(runForward(orderRelease), /Supabase CLI operation failed/);
      await assertOrderPending();
      assert.equal(alternate(), original);
      docker(psql, "DROP INDEX public.alternate_order");
    }
    // Neither mixed directions nor these NULL-order flags match PostgreSQL's
    // pathkeys for ORDER BY sort_order, id, including on NOT NULL columns.
    docker(psql, `CREATE INDEX mixed_order ON public.products (sort_order ASC, id DESC);
      CREATE INDEX wrong_null_order ON public.products (catalog_status, sort_order ASC NULLS FIRST, id ASC NULLS FIRST)`);

    await checkWhileProductsLocked(client, "RowExclusiveLock", async () => {
      const { stdout } = await promisify(execFile)("docker", [...psql, "-c", `BEGIN;
        UPDATE public.products SET sort_order = sort_order + 1 WHERE slug = 'synthetic-serum' RETURNING slug;
        SELECT pg_advisory_xact_lock(563, 1); ROLLBACK;`], { timeout: 45_000 });
      assert.match(stdout, /synthetic-serum/);
    }, async () => {
      await client.query("BEGIN");
      try {
        // A missing NOWAIT would hit this timeout (57014) before the
        // capability's three-second lock timeout could produce 55P03.
        await client.query("SET LOCAL statement_timeout = '1s'");
        await assert.rejects(client.query(orderSql), { code: "55P03" });
      } finally {
        await client.query("ROLLBACK");
      }
      await assert.rejects(runForward(orderRelease), /Supabase CLI operation failed/);
      await assertOrderPending();
    });

    // This genuine CLI insert can reach the gate only after its transaction
    // has created the index. Fail it after an independent anon read completes.
    docker(psql, `CREATE FUNCTION private.interrupt_order_history() RETURNS trigger
      LANGUAGE plpgsql SET search_path = pg_catalog AS $$
      BEGIN
        IF NEW.version = '20261120141910' AND to_regclass('public.products_catalog_status_sort_id_idx') IS NOT NULL THEN
          PERFORM pg_advisory_xact_lock(563, 1);
          RAISE EXCEPTION 'synthetic index history interruption';
        END IF;
        RETURN NEW;
      END $$;
      REVOKE ALL ON FUNCTION private.interrupt_order_history() FROM PUBLIC;
      CREATE TRIGGER interrupt_order_history BEFORE INSERT ON supabase_migrations.schema_migrations
        FOR EACH ROW EXECUTE FUNCTION private.interrupt_order_history();`);
    await checkWhileProductsLocked(client, "ShareRowExclusiveLock",
      () => assert.rejects(runForward(orderRelease), /Supabase CLI operation failed/),
      () => {
        const anon = docker([...psql, "--username=supabase_admin"], `SET SESSION AUTHORIZATION anon;
          SET statement_timeout = '2s';
          SELECT slug FROM public.products WHERE catalog_status = 'active' ORDER BY sort_order, id LIMIT 1;`);
        assert.equal(anon.trim(), "synthetic-cleanser");
      });
    await assertOrderPending();
    docker(psql, "DROP TRIGGER interrupt_order_history ON supabase_migrations.schema_migrations");
    assert.deepEqual((await runForward(orderRelease)).applied, [orderFile]);
    assert.deepEqual((await client.query(orderSidecar.verify)).rows, [{ applied: true }]);
    assert.deepEqual(await runForward(orderRelease), { pending: [], applied: [] });
    const { rows: [finished] } = await client.query(historyQuery);
    assert.equal(finished.legacy_digest, before.legacy_digest);
    assert.deepEqual(finished.forward.slice(0, 1), after.forward);
    assert.deepEqual(finished.forward.map((row) => row.version), ["20261120131137", "20261120141910"]);
    assert.equal(predecessor(), oldIndex);
    assert.equal(oldData(), snapshot);
    return { writerProfile: "dedicated-login", exactManifestVerified: true, failedLedgerRolledBack: true,
      preservedOldCatalog: true, conflictingIndexRefused: true, alternateIndexRefused: true,
      activeWriterRefused: true, anonReadDuringIndex: true, indexHistoryRolledBack: true, applied: 2, retryApplied: 0 };
  } finally {
    try { await client.end(); }
    finally { docker(["exec", container, "dropdb", "-U", "postgres", releaseDatabase]); }
  }
}
