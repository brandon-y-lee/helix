// Actual snapshot/Draft races against the runner's labeled disposable database.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";

function session(psql) {
  const child = spawn("docker", psql, { stdio: ["pipe", "pipe", "pipe"] });
  let output = "";
  let errors = "";
  let milestone;
  const timeout = setTimeout(() => child.kill(), 30_000);
  const done = new Promise((resolveDone, rejectDone) => {
    child.stdout.on("data", (chunk) => {
      output += chunk;
      milestone?.();
    });
    child.stderr.on("data", (chunk) => { errors += chunk; });
    child.on("error", rejectDone);
    child.on("close", (status) => {
      clearTimeout(timeout);
      resolveDone({ status, output, errors });
    });
  });
  done.catch(() => {});
  return {
    child,
    done,
    async send(sql) {
      const marker = `IDENTITY_MILESTONE_${randomBytes(8).toString("hex")}`;
      const offset = output.length;
      const reached = new Promise((resolveReached) => {
        milestone = () => {
          const index = output.indexOf(marker, offset);
          if (index !== -1) resolveReached(output.slice(offset, index).trim());
        };
      });
      child.stdin.write(`${sql}\n\\echo ${marker}\n`);
      try {
        return await Promise.race([reached, done.then((result) => {
          throw new Error(`SQL session ended before its milestone: ${result.errors}`);
        })]);
      } finally {
        milestone = undefined;
      }
    },
    finish(sql) {
      child.stdin.end(sql);
      return done;
    },
  };
}

function requireSqlstate(result, expected) {
  assert.notEqual(result.status, 0, "Identity operation unexpectedly succeeded");
  assert.match(result.errors, new RegExp(`ERROR:  ${expected}:`));
}

export async function verifyIdentityDraftIsolation({
  container, checkpoint, fixtures, operationSql, docker,
}) {
  const productId = "10000000-0000-4000-8000-000000000101";
  const actorId = "10000000-0000-4000-8000-000000000901";
  const results = [];
  const unsupportedIsolation = [];
  for (const [slug, name] of [
    ["peptide-bounce", "Peptide Bounce"],
    ["maxxing-serum", "Maxxing Serum"],
    ["super-serum", "Super Serum"],
  ]) {
    for (const isolation of ["repeatable read", "read committed"]) {
      const database = `helix_identity_isolation_${randomBytes(8).toString("hex")}`;
      const psql = ["exec", "-i", container, "psql", "-X", "-U", "postgres",
        "-d", database, "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"];
      const sql = (input) => docker(psql, input).trim();
      const state = () => JSON.parse(sql(`${fixtures}\nselect pg_temp.catalog_identity_state();`));
      const sessions = [];
      let created = false;
      try {
        docker(["exec", container, "createdb", "-U", "postgres", database]);
        created = true;
        sql(`${checkpoint}\n${fixtures}\nselect pg_temp.seed_catalog_identity('${slug}', '${name}');`);
        const beforeDraft = state();
        const reader = session(psql);
        sessions.push(reader);
        // A complete read establishes A's snapshot before B is allowed to run.
        const reviewed = JSON.parse(await reader.send(`${operationSql}
          begin isolation level ${isolation};
          set local statement_timeout = '5s';
          select jsonb_build_object(
            'document', public.get_catalog_editor_document('${productId}'),
            'revision', (select max(revision_number) from public.catalog_product_revisions where product_id='${productId}'),
            'drafts', (select count(*) from public.product_content_drafts where product_id='${productId}' and status in ('draft','ready'))
          );`));
        assert.equal(reviewed.document.product.slug, slug);
        assert.equal(reviewed.revision, 1);
        assert.equal(reviewed.drafts, 0);

        // This is the real normal Create Draft, not a direct fixture insert.
        const draftResult = JSON.parse(sql(`begin isolation level read committed;
          select public.create_catalog_product_draft('${productId}', '${actorId}'); commit;`));
        assert.equal(draftResult.created, true);
        assert.equal(draftResult.draft.status, "draft");
        const afterDraft = state();
        const canonical = (snapshot) => Object.fromEntries(Object.entries(snapshot)
          .filter(([table]) => !["product_content_drafts", "catalog_editor_audit_log"].includes(table)));
        assert.deepEqual(canonical(afterDraft), canonical(beforeDraft));
        assert.deepEqual(afterDraft.product_content_drafts, [draftResult.draft]);
        assert.equal(afterDraft.catalog_editor_audit_log.length, beforeDraft.catalog_editor_audit_log.length + 1);
        for (const audit of beforeDraft.catalog_editor_audit_log) {
          assert.deepEqual(afterDraft.catalog_editor_audit_log.find((row) => row.id === audit.id), audit);
        }
        const draftAudit = afterDraft.catalog_editor_audit_log.find((row) => row.draft_id === draftResult.draft.id);
        assert.equal(draftAudit?.action, "draft.created");
        assert.equal(draftAudit.actor_id, actorId);

        const visibleDrafts = Number(await reader.send(`select count(*)
          from public.product_content_drafts where product_id='${productId}' and status in ('draft','ready');`));
        assert.equal(visibleDrafts, isolation === "read committed" ? 1 : 0);
        const delimiter = `$reviewed_${randomBytes(8).toString("hex")}$`;
        const result = await reader.finish(`select pg_temp.upgrade_current_treat_identity(
          ${delimiter}${JSON.stringify(reviewed.document)}${delimiter}::jsonb,
          ${reviewed.revision}, '${actorId}'); commit;`);
        const expectedSqlstate = isolation === "read committed" ? "23514" : "25001";
        requireSqlstate(result, expectedSqlstate);
        // A fresh connection proves B's Draft/audit and every canonical, child,
        // immutable revision and historical row survived A's rejected operation.
        assert.deepEqual(state(), afterDraft);
        results.push({ slug, isolation, visibleDrafts, sqlstate: expectedSqlstate,
          completeStatePreserved: true, committedDraftAndAuditPreserved: true });

        if (unsupportedIsolation.length === 0) {
          for (const unsupported of ["read uncommitted", "repeatable read", "serializable"]) {
            const direct = session(psql);
            sessions.push(direct);
            const refusal = await direct.finish(`${operationSql}
              begin isolation level ${unsupported};
              select pg_temp.upgrade_current_treat_identity(null, null, null); commit;`);
            // Isolation must reject even invalid inputs before their validation
            // reads, lock acquisition or the already-current no-op branch.
            requireSqlstate(refusal, "25001");
            assert.deepEqual(state(), afterDraft);
            unsupportedIsolation.push({ isolation: unsupported, sqlstate: "25001", statePreserved: true });
          }
        }
      } finally {
        for (const { child } of sessions) {
          if (child.exitCode === null && child.signalCode === null) child.kill();
        }
        await Promise.allSettled(sessions.map(({ done }) => done));
        if (created) docker(["exec", container, "dropdb", "-U", "postgres", "--force", database]);
      }
    }
  }
  return { draftRaces: results, unsupportedIsolation };
}
