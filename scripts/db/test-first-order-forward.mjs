import assert from "node:assert/strict";
import { runFirstOrderTests } from "./test-first-order-checkout.mjs";

// Called only with the disposable, loopback-bound managed stack from the
// settlement fixture. One target exercises the combined release and the other
// upgrades an already installed, genuinely recorded settlement release.
export async function testFirstOrderForward(context) {
  const { environment, writerRole, client, ownerSql, scalar, migrations, forward, ledger, enroll } = context;
  if (environment === "production") {
    const settlement = await forward(migrations.slice(0, 4));
    assert.deepEqual(settlement.applied, migrations.slice(2, 4).map(row => row.file));
  }
  const before = await ledger();
  const custody = ["private.extend_business_checkout_environment()", "private.install_first_order_checkout()"];
  for (const args of [["-U", "supabase_admin"], ["-v", "writer_role=service_role"],
    ["-v", "expected_environment=" + (environment === "development" ? "production" : "development")]]) {
    assert.notEqual(enroll(args, true).status, 0);
    assert.equal(scalar("SELECT to_regprocedure('private.install_first_order_checkout()') IS NULL"), "t");
  }
  enroll();
  assert.notEqual(enroll([], true).status, 0);
  assert.deepEqual(await ledger(), before);
  for (const routine of custody) {
    assert.equal(scalar(`SELECT bool_and(NOT has_function_privilege(r,'${routine}','EXECUTE'))
      FROM unnest(ARRAY['anon','authenticated','service_role']) r`), "t");
  }
  for (const phase of ["inventory", "issuer", "admission", "fulfillment"]) {
    const signature = "private.install_first_order_" + phase + "()";
    await assert.rejects(client.query("SELECT " + signature), { code: "42501" });
    assert.equal(scalar(`SELECT bool_and(NOT has_function_privilege(r,'${signature}','EXECUTE'))
      FROM unnest(ARRAY['anon','authenticated','service_role']) r`), "t");
  }

  ownerSql(`CREATE SEQUENCE private.admission_fault_seen;
    CREATE FUNCTION private.fail_admission_ledger_insert() RETURNS trigger LANGUAGE plpgsql
      SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
    BEGIN
      IF NEW.version='20261121075613' THEN
        PERFORM nextval('private.admission_fault_seen');
        RAISE EXCEPTION 'Synthetic first-order history failure';
      END IF;
      RETURN NEW;
    END $$;
    REVOKE ALL ON FUNCTION private.fail_admission_ledger_insert() FROM public,anon,authenticated,service_role;
    CREATE TRIGGER fail_admission_ledger BEFORE INSERT ON supabase_migrations.schema_migrations
      FOR EACH ROW EXECUTE FUNCTION private.fail_admission_ledger_insert();`);
  await assert.rejects(forward(), /Supabase CLI operation failed/);
  assert.equal(scalar("SELECT is_called FROM private.admission_fault_seen"), "t", "Fault reached after actual new DDL");
  const interrupted = await ledger();
  assert.deepEqual(interrupted.forward.map(row => row.version), migrations.slice(0, 5).map(row => row.file.split("_")[0]));
  assert.deepEqual(interrupted.forward.slice(0, before.forward.length), before.forward);
  assert.equal(interrupted.legacy_digest, before.legacy_digest);
  assert.equal(scalar("SELECT to_regprocedure('private.first_order_checkout_installed()') IS NULL"), "t");
  assert.equal((await client.query(migrations[3].verify)).rows[0].applied, false);
  assert.equal((await client.query(migrations[4].verify)).rows[0].applied, true);
  assert.equal((await client.query(migrations[2].verify)).rows[0].applied, false);

  ownerSql("DROP TRIGGER fail_admission_ledger ON supabase_migrations.schema_migrations");
  assert.deepEqual((await forward()).applied, [migrations[5].file]);
  const finished = await ledger();
  assert.deepEqual(finished.forward.slice(0, 5), interrupted.forward);
  assert.equal(finished.legacy_digest, before.legacy_digest);
  assert.deepEqual(await forward(), { pending: [], applied: [] });
  assert.deepEqual(await ledger(), finished);
  ownerSql("ALTER FUNCTION private.first_order_checkout_installed() SET search_path=public");
  try {
    await assert.rejects(forward(), /Installed migration contract failed/);
  } finally {
    ownerSql("ALTER FUNCTION private.first_order_checkout_installed() SET search_path=pg_catalog,pg_temp");
  }
  assert.deepEqual(await forward(), { pending: [], applied: [] });
  await assert.rejects(client.query("SELECT * FROM private.live_checkout_bindings"), { code: "42501" });
  await assert.rejects(client.query("DELETE FROM supabase_migrations.schema_migrations WHERE false"), { code: "42501" });
  const check = ownerSql("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.orders'::regclass AND conname='orders_checkout_mode'");
  assert.ok(check.startsWith("CHECK "));
  const replaceCheck = "ALTER TABLE public.orders DROP CONSTRAINT orders_checkout_mode, ADD CONSTRAINT orders_checkout_mode ";
  ownerSql(replaceCheck + "CHECK (true)");
  try {
    assert.equal((await client.query(migrations[5].verify)).rows[0].applied, false, "Retained checkout mode isolation must remain verified");
  } finally {
    ownerSql(replaceCheck + check);
  }
  assert.equal((await client.query(migrations[5].verify)).rows[0].applied, true);
  assert.equal((await client.query("SELECT current_user = $1 AS writer", [writerRole])).rows[0].writer, true);
  await runFirstOrderTests(context);
  console.log(JSON.stringify({ environment, recordedBefore: before.forward.length, recordedAfter: finished.forward.length,
    failedHistoryRolledBack: true, retryApplied: 0, firstOrderDomainTestsPassed: true }));
}
