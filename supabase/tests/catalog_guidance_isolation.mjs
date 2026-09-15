// Actual snapshot/Draft races in separately seeded disposable Catalog databases.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createSqlSession, requireSqlstate } from "./catalog_sql_session.mjs";

export async function verifyGuidanceDraftIsolation({
  container, checkpoint, identityMigration, extraMigrations = [], fixtures,
  guidanceMigration, operationSql, docker,
}) {
  const productId = "10000000-0000-4000-8000-000000000101";
  const actorId = "10000000-0000-4000-8000-000000000901";
  const projectRef = "erasogmsqpgiirovubjh";
  const withheld = "Usage directions will be published only after the exact U.S. OTC formula and Drug Facts label are verified.";
  const predecessor = "Massage onto damp skin, then rinse thoroughly. Use at night; morning cleansing can be added when needed. Follow with Peptide Bounce, then Ceramide Cushion when available.";
  const results = [];
  const unsupportedIsolation = [];
  for (const [slug, name] of [
    ["mineral-guard", "Mineral Guard"],
    ["biotic-reset", "Biotic Reset"],
  ]) {
    const mineralGuard = slug === "mineral-guard";
    const expectedRevision = mineralGuard ? 2 : 1;
    const expectedParagraph = mineralGuard ? withheld : predecessor;
    for (const isolation of ["repeatable read", "read committed"]) {
      const database = `helix_guidance_isolation_${randomBytes(8).toString("hex")}`;
      const psql = ["exec", "-i", container, "psql", "-X", "-U", "postgres",
        "-d", database, "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"];
      const sql = (input) => docker(psql, input).trim();
      const state = () => JSON.parse(sql(`${fixtures}\nselect pg_temp.catalog_identity_state();`));
      const sessions = [];
      let created = false;
      try {
        docker(["exec", container, "createdb", "-U", "postgres", database]);
        created = true;
        sql([checkpoint, identityMigration, ...extraMigrations, guidanceMigration,
          fixtures, `begin;
          select pg_temp.seed_catalog_identity('${slug}', '${name}');
          update public.products set catalog_status = 'active', published_at = now(),
            status = '${mineralGuard ? "waitlist" : "coming_soon"}',
            system_step_name = '${mineralGuard ? "PROTECT" : "CLEANSE"}',
            routine_group = '${mineralGuard ? "beyond_core" : "core"}',
            editorial_how_to_use = '${expectedParagraph}'
          where id = '${productId}';
          update public.product_families set system_step_name =
            '${mineralGuard ? "PROTECT" : "CLEANSE"}';
          ${mineralGuard ? `delete from public.product_pdp_content where product_id = '${productId}';
          insert into public.catalog_product_revisions(product_id, revision_number,
            schema_version, document, published_by)
          values ('${productId}', 2, 4, public.get_catalog_editor_document('${productId}'), '${actorId}');` : ""}
          commit;`].join("\n"));
        const beforeDraft = state();
        assert.equal(Object.keys(beforeDraft).length, 14);
        assert.deepEqual(beforeDraft.product_content_drafts, []);
        const reader = createSqlSession(psql);
        sessions.push(reader);
        // A's completed read fixes its snapshot before B may create a Draft.
        // The stdin milestone keeps this order independent of elapsed time.
        const reviewed = JSON.parse(await reader.send(`${operationSql}
          begin isolation level ${isolation};
          set local statement_timeout = '5s';
          set local idle_in_transaction_session_timeout = '20s';
          select jsonb_build_object(
            'document', public.get_catalog_editor_document('${productId}'),
            'revision', (select max(revision_number) from public.catalog_product_revisions where product_id='${productId}'),
            'drafts', (select count(*) from public.product_content_drafts where product_id='${productId}' and status in ('draft','ready')),
            'guidanceErrors', private.catalog_guidance_validation_errors(public.get_catalog_editor_document('${productId}'))
          );`));
        assert.equal(reviewed.document.product.slug, slug);
        assert.equal(reviewed.document.product.editorial_how_to_use, expectedParagraph);
        assert.equal(reviewed.revision, expectedRevision);
        assert.equal(reviewed.drafts, 0);
        if (mineralGuard) {
          assert.equal(reviewed.document.productPdpContent, null);
          assert.ok(reviewed.guidanceErrors.some((issue) => issue.code === "guidance_review_required"));
        } else {
          assert.deepEqual(reviewed.document.productPdpContent.how_to_use_steps,
            ["First current step.", "Second current step."]);
          assert.deepEqual(reviewed.guidanceErrors, []);
        }

        // Commit B's real application-role Create Draft before resuming A.
        // The production guidance trigger annotates missing guidance normally.
        const draftResult = JSON.parse(sql(`begin isolation level read committed;
          set local statement_timeout = '5s';
          set local role service_role;
          select public.create_catalog_product_draft('${productId}', '${actorId}'); commit;`));
        assert.equal(draftResult.created, true);
        assert.equal(draftResult.draft.product_id, productId);
        assert.equal(draftResult.draft.status, "draft");
        assert.equal(draftResult.draft.version, 1);
        assert.equal(draftResult.draft.base_revision, expectedRevision);
        assert.equal(draftResult.draft.created_by, actorId);
        assert.equal(draftResult.draft.updated_by, actorId);
        assert.deepEqual(draftResult.draft.document, reviewed.document);
        assert.deepEqual(draftResult.draft.validation_errors.filter((issue) =>
          ["guidance_review_required", "guidance_invalid_steps"].includes(issue.code)),
        reviewed.guidanceErrors);
        const afterDraft = state();
        const canonical = (snapshot) => Object.fromEntries(Object.entries(snapshot)
          .filter(([table]) => !["product_content_drafts", "catalog_editor_audit_log"].includes(table)));
        assert.deepEqual(canonical(afterDraft), canonical(beforeDraft));
        assert.deepEqual(afterDraft.product_content_drafts, [draftResult.draft]);
        assert.equal(afterDraft.catalog_editor_audit_log.length, beforeDraft.catalog_editor_audit_log.length + 1);
        for (const audit of beforeDraft.catalog_editor_audit_log) {
          assert.deepEqual(afterDraft.catalog_editor_audit_log.find((row) => row.id === audit.id), audit);
        }
        const draftAudits = afterDraft.catalog_editor_audit_log.filter((row) => row.draft_id === draftResult.draft.id);
        assert.equal(draftAudits.length, 1);
        assert.equal(draftAudits[0].action, "draft.created");
        assert.equal(draftAudits[0].actor_id, actorId);
        assert.equal(draftAudits[0].product_id, productId);
        assert.deepEqual(draftAudits[0].metadata, { baseRevision: expectedRevision, schemaVersion: 4 });

        const visibleDrafts = Number(await reader.send(`select count(*)
          from public.product_content_drafts where product_id='${productId}' and status in ('draft','ready');`));
        assert.equal(visibleDrafts, isolation === "read committed" ? 1 : 0);
        const delimiter = `$reviewed_${randomBytes(8).toString("hex")}$`;
        const result = await reader.finish(`select pg_temp.prepare_reviewed_product_guidance(
          ${delimiter}${JSON.stringify(reviewed.document)}${delimiter}::jsonb,
          ${reviewed.revision}, '${actorId}', '${projectRef}'); commit;`);
        const expectedSqlstate = isolation === "read committed" ? "23514" : "25001";
        requireSqlstate(result, expectedSqlstate);
        // Fresh committed state includes B's complete Draft and validation
        // issues. Neither guidance path may overwrite it or append history.
        assert.deepEqual(state(), afterDraft);
        results.push({ slug, isolation, visibleDrafts, sqlstate: expectedSqlstate,
          completeStatePreserved: true, committedDraftAndAuditPreserved: true,
          guidanceIssuesPreserved: true });

        if (unsupportedIsolation.length === 0) {
          for (const unsupported of ["read uncommitted", "repeatable read", "serializable"]) {
            const direct = createSqlSession(psql);
            sessions.push(direct);
            const refusal = await direct.finish(`${operationSql}
              begin isolation level ${unsupported};
              set local statement_timeout = '5s';
              select pg_temp.prepare_reviewed_product_guidance(null, null, null, null); commit;`);
            // Invalid manifests must reach the isolation guard before argument
            // validation, Catalog reads, locks or either publication branch.
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
