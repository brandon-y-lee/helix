-- Actual SQL proof against the disposable current-schema checkpoint only.
-- The runner loads the operation and catalog_identity.fixtures.sql beforehand.
\set ON_ERROR_STOP on
begin;
do $$ begin
  if current_database() not like 'helix_catalog_guidance_%' then
    raise exception 'Guidance preparation tests require an isolated Catalog test database';
  end if;
end $$;

create function pg_temp.assert_guidance_preparation_rejected(
  expected_document jsonb, expected_revision integer, actor_id uuid,
  project_ref text default 'erasogmsqpgiirovubjh'
) returns void language plpgsql as $$
declare
  before_state jsonb := pg_temp.catalog_identity_state();
  rejected boolean := false;
begin
  begin
    perform pg_temp.prepare_reviewed_product_guidance(
      expected_document, expected_revision, actor_id, project_ref);
  exception when others then
    rejected := true;
  end;
  if not rejected or pg_temp.catalog_identity_state() is distinct from before_state then
    raise exception 'Guidance preparation did not reject atomically';
  end if;
end;
$$;

create function pg_temp.test_guidance_preparation(target_slug text)
returns void language plpgsql as $$
#variable_conflict use_variable
declare
  product_id constant uuid := '10000000-0000-4000-8000-000000000101';
  other_id constant uuid := '10000000-0000-4000-8000-000000000102';
  actor_id constant uuid := '10000000-0000-4000-8000-000000000901';
  expected_revision integer := case when target_slug = 'mineral-guard' then 2 else 1 end;
  before_document jsonb;
  before_state jsonb;
  after_document jsonb;
  after_state jsonb;
  result jsonb;
  manifest jsonb;
  manifest_product jsonb;
  draft_id uuid;
begin
  perform pg_temp.seed_catalog_identity(target_slug,
    case when target_slug = 'mineral-guard' then 'Mineral Guard' else 'Biotic Reset' end);
  update public.products set catalog_status = 'active', published_at = now(),
    status = case when target_slug = 'mineral-guard' then 'waitlist' else 'coming_soon' end,
    system_step_name = case when target_slug = 'mineral-guard' then 'PROTECT' else 'CLEANSE' end,
    routine_group = case when target_slug = 'mineral-guard' then 'beyond_core' else 'core' end,
    editorial_how_to_use = case when target_slug = 'mineral-guard'
      then 'Usage directions will be published only after the exact U.S. OTC formula and Drug Facts label are verified.'
      else 'Massage onto damp skin, then rinse thoroughly. Use at night; morning cleansing can be added when needed. Follow with Peptide Bounce, then Ceramide Cushion when available.' end
  where id = product_id;
  update public.product_families set system_step_name =
    case when target_slug = 'mineral-guard' then 'PROTECT' else 'CLEANSE' end;
  if target_slug = 'mineral-guard' then
    delete from public.product_pdp_content content where content.product_id = product_id;
    insert into public.catalog_product_revisions(product_id, revision_number,
      schema_version, document, published_by)
    values (product_id, 2, 4, public.get_catalog_editor_document(product_id), actor_id);
  end if;
  before_document := public.get_catalog_editor_document(product_id);
  manifest := pg_temp.capture_guidance_preflight();
  select value into manifest_product from jsonb_array_elements(manifest -> 'products')
  where value ->> 'targetSlug' = target_slug;
  if manifest ->> 'requiredProjectRef' is distinct from 'erasogmsqpgiirovubjh'
     or manifest ->> 'administratorCount' is distinct from '1'
     or manifest ->> 'administratorId' is distinct from actor_id::text
     or manifest_product ->> 'productId' is distinct from product_id::text
     or manifest_product -> 'expectedDocument' is distinct from before_document
     or manifest_product ->> 'expectedRevision' is distinct from expected_revision::text
     or manifest_product -> 'activeDrafts' is distinct from '[]'::jsonb
     or jsonb_array_length(manifest_product -> 'publishedRevisionHashes') <> expected_revision
     or jsonb_array_length(manifest_product -> 'auditEntryHashes') <> 1
     or exists (select 1 from jsonb_each(manifest -> 'functionDefinitionHashes')
       where value = 'null'::jsonb) then
    raise exception '% read-only manifest did not capture exact synthetic inputs', target_slug;
  end if;

  perform pg_temp.assert_guidance_preparation_rejected(before_document, expected_revision,
    actor_id, 'unapproved-project');
  perform pg_temp.assert_guidance_preparation_rejected(before_document, expected_revision,
    actor_id, null);
  perform pg_temp.assert_guidance_preparation_rejected(before_document, expected_revision,
    '10000000-0000-4000-8000-000000000999');
  perform pg_temp.assert_guidance_preparation_rejected(before_document, expected_revision + 1, actor_id);
  perform pg_temp.assert_guidance_preparation_rejected(
    jsonb_set(before_document, '{product,editorial_description}', '"Unreviewed replacement"'),
    expected_revision, actor_id);
  perform pg_temp.assert_guidance_preparation_rejected(
    before_document - 'productId', expected_revision, actor_id);

  update public.admin_memberships set active = false where user_id = actor_id;
  perform pg_temp.assert_guidance_preparation_rejected(before_document, expected_revision, actor_id);
  update public.admin_memberships set active = true where user_id = actor_id;

  insert into public.product_content_drafts(product_id, base_revision, document,
    created_by, updated_by) values (product_id, expected_revision, before_document, actor_id, actor_id)
  returning id into draft_id;
  perform pg_temp.assert_guidance_preparation_rejected(before_document, expected_revision, actor_id);
  update public.product_content_drafts set status = 'ready', document =
    case when target_slug = 'mineral-guard'
      then jsonb_set(before_document, '{productPdpContent}', '{"how_to_use_steps": []}'::jsonb)
      else before_document end
  where id = draft_id;
  perform pg_temp.assert_guidance_preparation_rejected(before_document, expected_revision, actor_id);
  update public.product_content_drafts set status = 'discarded' where id = draft_id;

  update public.products set display_name = before_document #>> '{product,display_name}'
  where id = other_id;
  perform pg_temp.assert_guidance_preparation_rejected(before_document, expected_revision, actor_id);
  update public.products set display_name = 'Synthetic Cleanser' where id = other_id;

  -- A changed child row is a stale complete document even without a new revision.
  update public.product_variants variant set price_cents = price_cents + 1
  where variant.product_id = product_id;
  perform pg_temp.assert_guidance_preparation_rejected(before_document, expected_revision, actor_id);
  -- Keep this independent change and capture fresh review instead of undoing its timestamp.
  before_document := public.get_catalog_editor_document(product_id);

  if target_slug = 'mineral-guard' then
    -- Null instructions in an existing row are outside the declared missing-row operation.
    insert into public.product_pdp_content(product_id, how_to_use_steps) values (product_id, null);
    perform pg_temp.assert_guidance_preparation_rejected(
      public.get_catalog_editor_document(product_id), expected_revision, actor_id);
    delete from public.product_pdp_content content where content.product_id = product_id;
  else
    update public.product_pdp_content content set how_to_use_steps = array[null]::text[]
    where content.product_id = product_id;
    perform pg_temp.assert_guidance_preparation_rejected(
      public.get_catalog_editor_document(product_id), expected_revision, actor_id);
    update public.product_pdp_content content set how_to_use_steps = array[U&'\00A0\FEFF']
    where content.product_id = product_id;
    perform pg_temp.assert_guidance_preparation_rejected(
      public.get_catalog_editor_document(product_id), expected_revision, actor_id);
    update public.product_pdp_content content set how_to_use_steps =
      array['First current step.', 'Second current step.']
    where content.product_id = product_id;
  end if;
  before_document := public.get_catalog_editor_document(product_id);
  before_state := pg_temp.catalog_identity_state();
  result := pg_temp.prepare_reviewed_product_guidance(before_document,
    expected_revision, actor_id, 'erasogmsqpgiirovubjh');
  after_document := public.get_catalog_editor_document(product_id);
  after_state := pg_temp.catalog_identity_state();
  if result ->> 'outcome' is distinct from 'published'
     or result ->> 'revision' is distinct from (expected_revision + 1)::text
     or result ->> 'productId' is distinct from product_id::text then
    raise exception '% did not append the expected publication', target_slug;
  end if;
  if (after_state - array['products', 'product_pdp_content', 'catalog_product_revisions', 'catalog_editor_audit_log'])
     is distinct from
     (before_state - array['products', 'product_pdp_content', 'catalog_product_revisions', 'catalog_editor_audit_log'])
     or not ((after_state -> 'catalog_product_revisions') @> (before_state -> 'catalog_product_revisions'))
     or not ((after_state -> 'catalog_editor_audit_log') @> (before_state -> 'catalog_editor_audit_log'))
     or jsonb_array_length(after_state -> 'catalog_product_revisions')
        <> jsonb_array_length(before_state -> 'catalog_product_revisions') + 1
     or jsonb_array_length(after_state -> 'catalog_editor_audit_log')
        <> jsonb_array_length(before_state -> 'catalog_editor_audit_log') + 1 then
    raise exception '% changed unrelated facts or immutable history', target_slug;
  end if;
  if target_slug = 'mineral-guard' then
    if (after_document - 'productPdpContent') is distinct from (before_document - 'productPdpContent')
       or after_state -> 'products' is distinct from before_state -> 'products'
       or after_document #> '{productPdpContent,how_to_use_steps}' is distinct from '[]'::jsonb
       or after_document #>> '{product,editorial_how_to_use}' is distinct from
          'Usage directions will be published only after the exact U.S. OTC formula and Drug Facts label are verified.' then
      raise exception 'Mineral Guard fabricated guidance or rewrote unrelated Product facts';
    end if;
  elsif (after_document #- '{product,editorial_how_to_use}' #- '{product,updated_at}')
      is distinct from (before_document #- '{product,editorial_how_to_use}' #- '{product,updated_at}')
     or after_state -> 'product_pdp_content' is distinct from before_state -> 'product_pdp_content'
     or after_document #>> '{product,editorial_how_to_use}' is distinct from
       'Massage onto damp skin, then rinse thoroughly. Use at night; morning cleansing can be added when needed. Follow with Super Serum, then Ceramide Cushion when available.' then
    raise exception 'Biotic Reset changed more than its approved Product name mention';
  end if;
  if not exists (select 1 from public.catalog_editor_audit_log audit
    join public.catalog_product_revisions revision on revision.id = audit.revision_id
    where revision.product_id = product_id and revision.revision_number = expected_revision + 1
      and revision.document = after_document and revision.source_draft_id is null
      and audit.actor_id = actor_id and audit.draft_id is null
      and audit.metadata ->> 'source' = 'spec-358-reviewed-product-guidance'
      and audit.metadata ->> 'method' = 'controlled-content-operation'
      and audit.metadata ->> 'beforeDocumentHash' = md5(before_document::text)) then
    raise exception '% lacks truthful controlled-publication audit evidence', target_slug;
  end if;

  perform pg_temp.assert_guidance_preparation_rejected(before_document, expected_revision, actor_id);
  result := pg_temp.prepare_reviewed_product_guidance(after_document,
    expected_revision + 1, actor_id, 'erasogmsqpgiirovubjh');
  if result ->> 'outcome' is distinct from 'no-op'
     or pg_temp.catalog_identity_state() is distinct from after_state then
    raise exception '% repeated preparation added a write', target_slug;
  end if;
  raise notice 'PASS % governed guidance preparation, exact guards, history and fresh no-op', target_slug;
end;
$$;

savepoint mineral_guard;
select pg_temp.test_guidance_preparation('mineral-guard');
rollback to mineral_guard;
savepoint biotic_reset;
select pg_temp.test_guidance_preparation('biotic-reset');
rollback to biotic_reset;
do $$ begin
  if exists (select 1 from public.products)
     or exists (select 1 from public.catalog_product_revisions)
     or exists (select 1 from public.catalog_editor_audit_log) then
    raise exception 'Guidance preparation scenarios leaked Catalog rows';
  end if;
  raise notice 'PASS guidance preparation left the checkpoint empty';
end $$;
rollback;
