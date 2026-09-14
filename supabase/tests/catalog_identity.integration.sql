-- Run only in a disposable local current-schema checkpoint database.
-- Load the current Restore migration and operation in the same psql session.
-- Fixtures and every scenario roll back; no linked-provider execution.
\set ON_ERROR_STOP on
begin;
do $$ begin
  if current_database() not like 'catalog_t1_%'
     and current_database() not like 'helix_catalog_identity_%' then
    raise exception 'Catalog identity tests require an isolated Catalog test database';
  end if;
end $$;

savepoint restore_identity;
select pg_temp.seed_catalog_identity('super-serum', 'Super Serum');
do $restore_test$
#variable_conflict use_variable
declare
  product_id constant uuid := '10000000-0000-4000-8000-000000000101';
  actor_id constant uuid := '10000000-0000-4000-8000-000000000901';
  revision_id uuid;
  current_document jsonb;
  historical_document jsonb;
  result jsonb;
  second_result jsonb;
  state_before jsonb;
  state_after jsonb;
  field_name text;
  schema_number integer;
  null_metadata boolean;
  revision_number integer := 1;
  draft_id uuid;
  retained_fields constant jsonb := '["slug","display_name","seo_title","seo_description","search_keywords"]'::jsonb;
begin
  foreach null_metadata in array array[false, true] loop
    update public.products set
      seo_title = case when null_metadata then null else 'Current reviewed title' end,
      seo_description = case when null_metadata then null else 'Current reviewed description' end,
      search_keywords = case when null_metadata then '{}'::text[] else array['current serum', 'hydration'] end
    where id = product_id;
    for schema_number in 1..4 loop
      current_document := public.get_catalog_editor_document(product_id);
      historical_document := pg_temp.historical_catalog_identity_document(
        current_document, schema_number
      );
      revision_number := revision_number + 1;
      insert into public.catalog_product_revisions(
        product_id, revision_number, schema_version, document, published_by
      ) values (product_id, revision_number, schema_number,
        historical_document, actor_id)
      returning id into revision_id;
      -- Restore an older revision while a later revision exists: its draft must
      -- be based on the latest publication, not on the restored revision number.
      revision_number := revision_number + 1;
      insert into public.catalog_product_revisions(
        product_id, revision_number, schema_version, document, published_by
      ) values (product_id, revision_number, 4, current_document, actor_id);
      state_before := pg_temp.catalog_identity_state();
      result := public.restore_catalog_product_revision(revision_id, actor_id);
      if result ->> 'ok' is distinct from 'true'
         or result #>> '{draft,document,schemaVersion}' is distinct from '4'
         or result #>> '{draft,schema_version}' is distinct from '4'
         or result #>> '{draft,status}' is distinct from 'draft'
         or result #>> '{draft,version}' is distinct from '1'
         or result #>> '{draft,base_revision}' is distinct from revision_number::text
         or result #> '{draft,validation_errors}' is distinct from '[]'::jsonb
         or result -> 'retainedFields' is distinct from retained_fields then
        raise exception 'V% Restore did not create the disclosed current Working Catalog Draft', schema_number;
      end if;
      for field_name in select jsonb_array_elements_text(retained_fields) loop
        if result #> array['draft','document','product',field_name]
           is distinct from current_document #> array['product',field_name] then
          raise exception 'V% Restore reintroduced historical Product field % (null metadata: %)',
            schema_number, field_name, null_metadata;
        end if;
      end loop;
      if result #>> '{draft,document,product,editorial_description}'
           is distinct from 'Historical editorial content for review.'
         or result #>> '{draft,document,product,editorial_how_to_use}'
           is distinct from 'Historical application instructions for review.'
         or result #> '{draft,document,productFamily}'
           is distinct from current_document -> 'productFamily'
         or (result #> '{draft,document,product}') ?| array[
           'formal_title','card_tagline','routine_step_number','routine_step_name'
         ] then
        raise exception 'V% Restore lost reviewable content or current Product Family', schema_number;
      end if;
      draft_id := (result #>> '{draft,id}')::uuid;
      state_after := pg_temp.catalog_identity_state();
      if (state_after - array['product_content_drafts','catalog_editor_audit_log'])
         is distinct from
         (state_before - array['product_content_drafts','catalog_editor_audit_log'])
         or not ((state_after -> 'catalog_editor_audit_log') @> (state_before -> 'catalog_editor_audit_log'))
         or jsonb_array_length(state_after -> 'catalog_editor_audit_log')
           <> jsonb_array_length(state_before -> 'catalog_editor_audit_log') + 1 then
        raise exception 'V% Restore changed canonical facts or historical records', schema_number;
      end if;
      if not exists (
        select 1 from public.catalog_editor_audit_log audit
        where audit.action = 'draft.restored' and audit.draft_id = draft_id
          and audit.revision_id = revision_id and audit.actor_id = actor_id
          and audit.metadata -> 'retainedFields' = retained_fields
          and audit.metadata ->> 'restoredSchemaVersion' = schema_number::text
          and audit.metadata ->> 'baseRevision' = revision_number::text
      ) then
        raise exception 'V% Restore retained-field disclosure was not audited', schema_number;
      end if;
      second_result := public.restore_catalog_product_revision(revision_id, actor_id);
      if second_result ->> 'code' is distinct from 'active_draft_exists'
         or pg_temp.catalog_identity_state() is distinct from state_after then
        raise exception 'V% Restore bypassed the existing draft or appended duplicate history', schema_number;
      end if;
      -- The retained identity remains editable through a deliberate subsequent
      -- administrator action; Restore does not impose a permanent name lock.
      second_result := public.save_catalog_product_draft(draft_id, 1,
        jsonb_set(result #> '{draft,document}', '{product,display_name}',
          '"Deliberately edited future name"'::jsonb), actor_id, 'admin');
      if second_result #>> '{draft,document,product,display_name}'
         is distinct from 'Deliberately edited future name' then
        raise exception 'V% Restore prevented a deliberate editor identity change', schema_number;
      end if;
      update public.product_content_drafts set status = 'discarded' where id = draft_id;
      raise notice 'PASS Restore V%, current null metadata=%', schema_number, null_metadata;
    end loop;
  end loop;
  if has_function_privilege('anon','public.restore_catalog_product_revision(uuid,uuid)','execute')
     or has_function_privilege('authenticated','public.restore_catalog_product_revision(uuid,uuid)','execute')
     or not has_function_privilege('service_role','public.restore_catalog_product_revision(uuid,uuid)','execute')
     or not exists (
       select 1 from pg_proc where oid = 'public.restore_catalog_product_revision(uuid,uuid)'::regprocedure
         and prosecdef and 'search_path=""' = any(proconfig)
     ) then
    raise exception 'Restore publication boundary or fixed search path changed';
  end if;
end;
$restore_test$;
rollback to restore_identity;

savepoint restore_publication_revision_guard;
select pg_temp.seed_catalog_identity('super-serum', 'Super Serum');
do $restore_publication_revision_guard$
#variable_conflict use_variable
declare
  product_id constant uuid := '10000000-0000-4000-8000-000000000101';
  actor_id constant uuid := '10000000-0000-4000-8000-000000000901';
  current_document jsonb := public.get_catalog_editor_document(product_id);
  revision_id uuid;
  draft_id uuid;
  restored jsonb;
  ready jsonb;
  result jsonb;
  before_publication jsonb;
begin
  insert into public.catalog_product_revisions(
    product_id, revision_number, schema_version, document, published_by
  ) values (product_id, 2, 4,
    pg_temp.historical_catalog_identity_document(current_document, 4), actor_id)
  returning id into revision_id;
  restored := public.restore_catalog_product_revision(revision_id, actor_id);
  if restored ->> 'ok' is distinct from 'true'
     or restored #>> '{draft,base_revision}' is distinct from '2'
     or restored #>> '{draft,document,product,slug}' is distinct from 'super-serum' then
    raise exception 'Restore did not establish the current identity and latest base for publication';
  end if;
  draft_id := (restored #>> '{draft,id}')::uuid;

  -- A separate publication advances the Catalog after Restore. The restored
  -- draft must remain reviewable, but may not overwrite that newer revision.
  insert into public.catalog_product_revisions(
    product_id, revision_number, schema_version, document, published_by
  ) values (product_id, 3, 4, current_document, actor_id);
  ready := public.transition_catalog_product_draft(
    draft_id, 1, 'ready', '[]'::jsonb, actor_id
  );
  if ready ->> 'ok' is distinct from 'true'
     or ready #>> '{draft,status}' is distinct from 'ready'
     or ready #>> '{draft,version}' is distinct from '2' then
    raise exception 'Restored draft did not enter Ready through the current transition function';
  end if;
  before_publication := pg_temp.catalog_identity_state();
  result := public.publish_catalog_product_draft(
    draft_id, 2, actor_id, 'admin', '[]'::jsonb
  );
  if result ->> 'ok' is distinct from 'false'
     or result ->> 'code' is distinct from 'revision_conflict'
     or result ->> 'baseRevision' is distinct from '2'
     or result ->> 'latestRevision' is distinct from '3'
     or pg_temp.catalog_identity_state() is distinct from before_publication then
    raise exception 'Restored draft bypassed the current publication revision guard or left partial changes';
  end if;
  raise notice 'PASS restored Ready draft rejects a newer publication without changing Catalog, history or draft';
end;
$restore_publication_revision_guard$;
rollback to restore_publication_revision_guard;

-- The runner loads the exact reviewed operation in this same session.

create function pg_temp.verify_identity_publication(p_slug text, p_name text)
returns void language plpgsql as $$
#variable_conflict use_variable
declare
  product_id uuid;
  actor_id constant uuid := '10000000-0000-4000-8000-000000000901';
  expected_document jsonb;
  current_document jsonb;
  before_state jsonb;
  after_state jsonb;
  result jsonb;
begin
  begin
    product_id := pg_temp.seed_catalog_identity(p_slug, p_name);
    expected_document := public.get_catalog_editor_document(product_id);
    before_state := pg_temp.catalog_identity_state();
    result := pg_temp.upgrade_current_treat_identity(expected_document, 1, actor_id);
    current_document := public.get_catalog_editor_document(product_id);
    after_state := pg_temp.catalog_identity_state();
    if result ->> 'ok' is distinct from 'true'
       or result ->> 'outcome' is distinct from 'published'
       or result ->> 'productId' is distinct from product_id::text
       or result ->> 'revision' is distinct from '2'
       or current_document #>> '{product,slug}' is distinct from 'super-serum'
       or current_document #>> '{product,display_name}' is distinct from 'Super Serum'
       or current_document #>> '{product,seo_title}' is distinct from 'Super Serum — PDRN serum | helix' then
      raise exception '% did not publish the approved current Product identity', p_slug;
    end if;
    if (current_document #- '{product,slug}' #- '{product,display_name}'
        #- '{product,seo_title}' #- '{product,updated_at}')
       is distinct from
       (expected_document #- '{product,slug}' #- '{product,display_name}'
        #- '{product,seo_title}' #- '{product,updated_at}')
       or (after_state - array['products','product_slug_routes','catalog_product_revisions','catalog_editor_audit_log'])
          is distinct from
          (before_state - array['products','product_slug_routes','catalog_product_revisions','catalog_editor_audit_log'])
       or jsonb_array_length(after_state -> 'products') <> 2
       or not ((after_state -> 'products') @> jsonb_build_array(
         (select item from jsonb_array_elements(before_state -> 'products') item
          where item ->> 'id' = '10000000-0000-4000-8000-000000000102')
       )) then
      raise exception '% identity publication changed Product/Variant IDs, SKU, offers, media, relationships or unrelated facts', p_slug;
    end if;
    if not ((after_state -> 'catalog_product_revisions') @> (before_state -> 'catalog_product_revisions'))
       or jsonb_array_length(after_state -> 'catalog_product_revisions') <> 2
       or not ((after_state -> 'catalog_editor_audit_log') @> (before_state -> 'catalog_editor_audit_log'))
       or jsonb_array_length(after_state -> 'catalog_editor_audit_log') <> 2
       or not exists (
         select 1 from public.catalog_product_revisions r
         where r.product_id = product_id and r.revision_number = 2
           and r.schema_version = 4 and r.document = current_document
           and r.published_by = actor_id
       )
       or not exists (
         select 1 from public.catalog_editor_audit_log a
         join public.catalog_product_revisions r on r.id = a.revision_id
         where a.action = 'slug.rename.published' and a.product_id = product_id
           and a.actor_id = actor_id and r.revision_number = 2
       ) then
      raise exception '% identity publication did not preserve history and append exactly one publication/audit', p_slug;
    end if;
    if not exists (
      select 1 from public.product_slug_routes r where r.source_slug = p_slug
        and r.source_product_id = product_id and r.target_product_id = product_id
        and r.route_kind = 'rename'
    ) or not exists (
      select 1 from public.product_slug_routes r where r.source_slug = 'super-serum'
        and r.source_product_id = product_id and r.target_product_id = product_id
        and r.route_kind = 'canonical'
    ) or jsonb_array_length(after_state -> 'product_slug_routes') <> 3 then
      raise exception '% identity publication failed to retain slug reservation history', p_slug;
    end if;
    result := pg_temp.upgrade_current_treat_identity(expected_document, 1, actor_id);
    if result ->> 'outcome' is distinct from 'no-op'
       or result ->> 'revision' is distinct from '2'
       or pg_temp.catalog_identity_state() is distinct from after_state then
      raise exception '% retry changed state or appended duplicate publication', p_slug;
    end if;
    set constraints all immediate;
    -- Roll back this complete synthetic scenario without weakening constraints
    -- or deleting append-only history. Unexpected exceptions remain failures.
    raise exception using errcode = 'ZT001', message = 'synthetic scenario complete';
  exception when sqlstate 'ZT001' then null;
  end;
  raise notice 'PASS % publication, child/history preservation and retry', p_slug;
end;
$$;
select pg_temp.verify_identity_publication('peptide-bounce', 'Peptide Bounce');
select pg_temp.verify_identity_publication('maxxing-serum', 'Maxxing Serum');

savepoint current_identity;
select pg_temp.seed_catalog_identity('super-serum', 'Super Serum');
do $current_identity_test$
#variable_conflict use_variable
declare
  product_id constant uuid := '10000000-0000-4000-8000-000000000101';
  actor_id constant uuid := '10000000-0000-4000-8000-000000000901';
  expected_document jsonb := public.get_catalog_editor_document(product_id);
  before_state jsonb;
  result jsonb;
begin
  update public.products set
    editorial_description = 'Newer reviewed content that must survive verification.',
    seo_title = null, seo_description = 'Newer reviewed SEO.',
    search_keywords = array['newer keyword'] where id = product_id;
  update public.product_variants set price_cents = 3100
    where id = '10000000-0000-4000-8000-000000000201';
  update public.product_media set alt = 'Newer approved media description'
    where id = '10000000-0000-4000-8000-000000000301';
  insert into public.catalog_product_revisions(
    product_id, revision_number, schema_version, document, published_by
  ) values (product_id, 2, 4, public.get_catalog_editor_document(product_id), actor_id);
  before_state := pg_temp.catalog_identity_state();
  result := pg_temp.upgrade_current_treat_identity(expected_document, 1, actor_id);
  if result ->> 'outcome' is distinct from 'no-op'
     or result ->> 'revision' is distinct from '2'
     or result ->> 'productId' is distinct from product_id::text
     or pg_temp.catalog_identity_state() is distinct from before_state then
    raise exception 'Current identity verification overwrote newer governed facts or history';
  end if;
  raise notice 'PASS already-current identity preserves newer content, SEO, offers and media';
end;
$current_identity_test$;
rollback to current_identity;

create function pg_temp.verify_identity_rejection(p_case text)
returns void language plpgsql as $$
#variable_conflict use_variable
declare
  product_id uuid;
  actor_id constant uuid := '10000000-0000-4000-8000-000000000901';
  expected_document jsonb;
  before_state jsonb;
  rejected boolean := false;
  expected_error text := '23514';
begin
  begin
    product_id := pg_temp.seed_catalog_identity(
      case when p_case = 'current-active-draft' then 'super-serum' else 'peptide-bounce' end,
      case when p_case = 'current-active-draft' then 'Super Serum' else 'Peptide Bounce' end
    );
    expected_document := public.get_catalog_editor_document(product_id);
    case p_case
      when 'missing' then
        update public.products set slug = 'unrelated-serum' where id = product_id;
        update public.product_sources set supplier_product_id = 'unrelated'
          where product_sources.product_id = product_id;
      when 'ambiguous-identity' then
        update public.products set slug = 'maxxing-serum'
          where id = '10000000-0000-4000-8000-000000000102';
      when 'ambiguous-provenance' then
        insert into public.product_sources(
          product_id, supplier, supplier_title, supplier_url, supplier_handle,
          supplier_product_id, source_inspected_at, source_content_hash, raw_source
        ) select '10000000-0000-4000-8000-000000000102', supplier,
          supplier_title, supplier_url, supplier_handle, supplier_product_id,
          source_inspected_at, source_content_hash, raw_source
          from public.product_sources where product_sources.product_id = product_id;
      when 'source-mismatch' then
        update public.product_sources set source_content_hash = repeat('f',64)
          where product_sources.product_id = product_id;
      when 'source-inspection-mismatch' then
        update public.product_sources set source_inspected_at = '2026-01-01T00:00:00Z'
          where product_sources.product_id = product_id;
      when 'source-inci-mismatch' then
        update public.products set ingredients = 'Different unapproved Formula.' where id = product_id;
      when 'wrong-name' then
        update public.products set display_name = 'An unreviewed different Product' where id = product_id;
      when 'wrong-seo-title' then
        update public.products set seo_title = 'New operator-owned title' where id = product_id;
      when 'null-seo-title' then
        update public.products set seo_title = null where id = product_id;
      when 'reserved-slug' then
        insert into public.product_slug_routes(
          source_slug, source_product_id, target_product_id, route_kind
        ) values ('super-serum', product_id, product_id, 'rename');
      when 'active-draft', 'current-active-draft', 'ready-draft' then
        perform public.create_catalog_product_draft(product_id, actor_id);
        if p_case = 'ready-draft' then
          update public.product_content_drafts set status = 'ready'
            where product_content_drafts.product_id = product_id;
        end if;
      when 'stale-revision' then
        insert into public.catalog_product_revisions(
          product_id, revision_number, schema_version, document, published_by
        ) values (product_id, 2, 4, expected_document, actor_id);
        expected_error := '40001';
      when 'stale-document' then
        update public.products set editorial_description = 'Concurrent reviewed content.' where id = product_id;
        expected_error := '40001';
      when 'inactive-administrator' then
        update public.admin_memberships set active = false where user_id = actor_id;
        expected_error := '22023';
      when 'mismatched-snapshot-product' then null;
      else raise exception 'Unknown rejection scenario %', p_case;
    end case;
    if p_case <> 'stale-document' then
      expected_document := public.get_catalog_editor_document(product_id);
    end if;
    if p_case = 'mismatched-snapshot-product' then
      expected_document := jsonb_set(expected_document, '{productId}',
        '"10000000-0000-4000-8000-000000000999"'::jsonb);
    end if;
    before_state := pg_temp.catalog_identity_state();
    begin
      perform pg_temp.upgrade_current_treat_identity(expected_document, 1, actor_id);
    exception when others then
      if sqlstate <> expected_error then
        raise exception '% raised unexpected SQLSTATE %: %', p_case, sqlstate, sqlerrm;
      end if;
      rejected := true;
    end;
    if not rejected then
      raise exception '% unexpectedly published', p_case;
    end if;
    if pg_temp.catalog_identity_state() is distinct from before_state then
      raise exception '% rejection left partial Catalog changes', p_case;
    end if;
    set constraints all immediate;
    raise exception using errcode = 'ZT001', message = 'synthetic scenario complete';
  exception when sqlstate 'ZT001' then null;
  end;
  raise notice 'PASS atomic rejection: %', p_case;
end;
$$;
select pg_temp.verify_identity_rejection(test_case)
from unnest(array[
  'missing', 'ambiguous-identity', 'ambiguous-provenance',
  'source-mismatch', 'source-inspection-mismatch', 'source-inci-mismatch',
  'wrong-name', 'wrong-seo-title', 'null-seo-title', 'reserved-slug',
  'active-draft', 'ready-draft', 'current-active-draft',
  'stale-revision', 'stale-document', 'inactive-administrator',
  'mismatched-snapshot-product'
]) test_case;

do $$ begin
  if exists (select 1 from public.products)
     or exists (select 1 from public.catalog_product_revisions)
     or exists (select 1 from public.catalog_editor_audit_log) then
    raise exception 'Synthetic test scenarios leaked Catalog rows';
  end if;
  raise notice 'PASS Catalog identity/Restore scenarios left the checkpoint empty';
end $$;
rollback;
