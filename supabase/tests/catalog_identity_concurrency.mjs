// Actual concurrent writers against disposable synthetic Catalog databases.
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

export async function verifyIdentityWriterConcurrency({
  container, checkpoint, fixtures, operationSql, docker,
}) {
  const productId = "10000000-0000-4000-8000-000000000101";
  const siblingId = "10000000-0000-4000-8000-000000000102";
  const familyId = "10000000-0000-4000-8000-000000000401";
  const actorId = "10000000-0000-4000-8000-000000000901";
  const results = [];
  for (const scenario of [
    "concurrent-predecessor-slug", "busy-product-writer", "busy-source-writer",
  ]) {
    const database = `helix_identity_review_${randomBytes(6).toString("hex")}`;
    const psql = ["exec", "-i", container, "psql", "-X", "-U", "postgres", "-d",
      database, "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"];
    const sql = (input) => docker(psql, input).trim();
    const sessions = [];
    let created = false;

    function session(input, keepOpen = false) {
      const child = spawn("docker", psql, { stdio: ["pipe", "pipe", "pipe"] });
      let output = "";
      let errors = "";
      const deadline = setTimeout(() => child.kill(), 15_000);
      const done = new Promise((resolveDone, rejectDone) => {
        child.stdout.on("data", (chunk) => { output += chunk; });
        child.stderr.on("data", (chunk) => { errors += chunk; });
        child.on("error", rejectDone);
        child.on("close", (status) => {
          clearTimeout(deadline);
          resolveDone({ status, output, errors });
        });
      });
      // Register rejection handling immediately; assertions inspect the result.
      done.catch(() => {});
      const result = { child, done, output: () => output };
      sessions.push(result);
      if (keepOpen) child.stdin.write(input);
      else child.stdin.end(input);
      return result;
    }

    async function until(check, message) {
      for (let attempt = 0; attempt < 50; attempt += 1) {
        if (check()) return;
        await delay(100);
      }
      throw new Error(message);
    }

    try {
      docker(["exec", container, "createdb", "-U", "postgres", database]);
      created = true;
      sql(checkpoint
        + "\n" + fixtures
        + "\nselect pg_temp.seed_catalog_identity('peptide-bounce', 'Peptide Bounce');");
      const snapshot = sql(`select public.get_catalog_editor_document('${productId}');`);
      JSON.parse(snapshot);
      const lockQuery = {
        "concurrent-predecessor-slug": `select pg_advisory_xact_lock(hashtextextended('helix-product-family:${familyId}', 0));`,
        "busy-product-writer": `update public.products set editorial_description='Independent edit survives' where id='${siblingId}';`,
        "busy-source-writer": `update public.product_sources set original_source_price_cents=2600 where product_id='${productId}';`,
      }[scenario];
      const locker = session(`begin; ${lockQuery}\n\\echo REVIEW_LOCKED\n`, true);
      await until(() => locker.output().includes("REVIEW_LOCKED"), "Writer did not acquire its lock");
      const delimiter = `$snapshot_${randomBytes(8).toString("hex")}$`;
      const operation = session(operationSql
        + "\nset application_name='identity_review_upgrade'; begin;"
        + `select pg_temp.upgrade_current_treat_identity(${delimiter}${snapshot}${delimiter}::jsonb, 1, '${actorId}'); commit;`);

      if (scenario === "concurrent-predecessor-slug") {
        await until(() => sql("select count(*) from pg_stat_activity where datname=current_database() and application_name='identity_review_upgrade' and wait_event='advisory';") === "1",
          "Identity operation did not wait for the family lock");
        sql(`update public.products set slug='maxxing-serum' where id='${siblingId}';`);
        locker.child.stdin.end("commit;\n");
        const release = await locker.done;
        if (release.status !== 0) throw new Error(release.errors);
      }

      const result = await operation.done;
      if (scenario !== "concurrent-predecessor-slug") {
        locker.child.stdin.end("commit;\n");
        const release = await locker.done;
        if (release.status !== 0) throw new Error(release.errors);
      }
      const expectedSqlstate = scenario === "concurrent-predecessor-slug" ? "23514" : "55P03";
      const revision = sql(`select max(revision_number) from public.catalog_product_revisions where product_id='${productId}';`);
      const slug = sql(`select slug from public.products where id='${productId}';`);
      const competitor = scenario === "concurrent-predecessor-slug"
        ? sql(`select slug from public.products where id='${siblingId}';`) === "maxxing-serum"
        : scenario === "busy-product-writer"
          ? sql(`select editorial_description from public.products where id='${siblingId}';`) === "Independent edit survives"
          : sql(`select original_source_price_cents from public.product_sources where product_id='${productId}';`) === "2600";
      if (result.status === 0 || !result.errors.includes(expectedSqlstate)
          || revision !== "1" || slug !== "peptide-bounce" || !competitor) {
        throw new Error(JSON.stringify({ scenario, result, revision, slug, competitor }));
      }
      results.push({ scenario, sqlstate: expectedSqlstate,
        originalRevision: Number(revision), independentEditPreserved: competitor });
    } finally {
      for (const { child } of sessions) {
        if (child.exitCode === null && child.signalCode === null) child.kill();
      }
      await Promise.allSettled(sessions.map(({ done }) => done));
      if (created) docker(["exec", container, "dropdb", "-U", "postgres", "--force", database]);
    }
  }
  return results;
}
