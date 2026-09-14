-- Session-local, affected-field-only preparation. This file never calls the
-- operation. Follow docs/operations/reviewed-product-guidance.md in an explicit
-- transaction after external connection verification and manifest review.
create or replace function pg_temp.prepare_reviewed_product_guidance(
  p_expected_document jsonb,
  p_expected_revision integer,
  p_actor_id uuid,
  p_verified_project_ref text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $operation$
declare
  v_product_id uuid;
  v_product public.products%rowtype;
  v_candidates uuid[];
  v_family_id uuid;
  v_locked_family_id uuid;
  v_document jsonb;
  v_after jsonb;
  v_revision integer;
  v_published public.catalog_product_revisions%rowtype;
  v_changed_field text;
  v_affected integer;
  v_withheld constant text := 'Usage directions will be published only after the exact U.S. OTC formula and Drug Facts label are verified.';
  v_old_paragraph constant text := 'Massage onto damp skin, then rinse thoroughly. Use at night; morning cleansing can be added when needed. Follow with Peptide Bounce, then Ceramide Cushion when available.';
  v_current_paragraph constant text := 'Massage onto damp skin, then rinse thoroughly. Use at night; morning cleansing can be added when needed. Follow with Super Serum, then Ceramide Cushion when available.';
begin
  -- The supplied ref attests external target verification; SQL does not infer
  -- the provider identity from current_database(), which is normally postgres.
  if p_verified_project_ref is distinct from 'erasogmsqpgiirovubjh'
     or p_expected_document is null
     or p_expected_document ->> 'schemaVersion' is distinct from '4'
     or p_expected_revision is null or p_expected_revision < 1
     or p_expected_document ->> 'productId' is null
     or p_expected_document ->> 'productId'
        is distinct from p_expected_document #>> '{product,id}'
  then
    raise exception 'guidance preparation requires the verified project and reviewed V4 manifest'
      using errcode = '22023';
  end if;
  v_product_id := (p_expected_document ->> 'productId')::uuid;

  -- Match normal family-aware publication lock order before fencing direct
  -- writers. NOWAIT rejects an in-flight independent edit instead of waiting
  -- for a table-lock upgrade while Product locks are held.
  select family_id into v_family_id from public.product_family_memberships
  where product_id = v_product_id;
  if v_family_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('helix-product-family:' || v_family_id::text, 0));
    perform 1 from public.product_families where id = v_family_id for update;
  end if;
  perform 1 from public.products product
  where product.id = v_product_id or product.id in (
    select product_id from public.product_family_memberships where family_id = v_family_id
  ) order by product.id for update;
  select family_id into v_locked_family_id from public.product_family_memberships
  where product_id = v_product_id;
  if v_locked_family_id is distinct from v_family_id then
    raise exception 'Product Family advanced after preflight' using errcode = '40001';
  end if;
  lock table public.products, public.product_pdp_content, public.product_sources,
    public.product_variants, public.product_media, public.product_relationships,
    public.product_families, public.product_family_memberships,
    public.product_content_drafts, public.catalog_product_revisions,
    public.catalog_editor_audit_log, public.admin_memberships
    in share row exclusive mode nowait;

  if not exists (select 1 from public.admin_memberships
    where user_id = p_actor_id and role = 'admin' and active) then
    raise exception 'guidance preparation requires an active Catalog Administrator'
      using errcode = '22023';
  end if;
  select * into v_product from public.products where id = v_product_id;
  if not found or v_product.catalog_status is distinct from 'active'
     or (
       (v_product.slug = 'mineral-guard' and v_product.display_name = 'Mineral Guard'
         and v_product.system_step_name = 'PROTECT' and v_product.routine_group = 'beyond_core'
         and v_product.status = 'waitlist' and v_product.editorial_how_to_use = v_withheld)
       or (v_product.slug = 'biotic-reset' and v_product.display_name = 'Biotic Reset'
         and v_product.system_step_name = 'CLEANSE' and v_product.routine_group = 'core'
         and v_product.editorial_how_to_use in (v_old_paragraph, v_current_paragraph))
     ) is not true then
    raise exception 'guidance preparation is not the approved Product and editorial state'
      using errcode = '23514';
  end if;
  select array_agg(id order by id) into v_candidates from public.products
  where slug = v_product.slug or display_name = v_product.display_name;
  if cardinality(v_candidates) is distinct from 1 or v_candidates[1] <> v_product_id then
    raise exception 'guidance preparation requires one unambiguous Product'
      using errcode = '23514';
  end if;
  if exists (select 1 from public.product_content_drafts
    where product_id = v_product_id and status in ('draft', 'ready')) then
    raise exception 'guidance preparation cannot replace an active Catalog Draft'
      using errcode = '23514';
  end if;
  select coalesce(max(revision_number), 0) into v_revision
  from public.catalog_product_revisions where product_id = v_product_id;
  v_document := public.get_catalog_editor_document(v_product_id);

  -- Every attempt, including a repeat no-op, uses a fresh exact manifest.
  if v_revision <> p_expected_revision or v_document is distinct from p_expected_document then
    raise exception 'Catalog document or revision advanced after guidance preflight'
      using errcode = '40001';
  end if;

  if v_product.slug = 'mineral-guard' then
    if v_document #> '{productPdpContent,how_to_use_steps}' = '[]'::jsonb then
      return jsonb_build_object('ok', true, 'outcome', 'no-op',
        'productId', v_product_id, 'revision', v_revision);
    end if;
    if v_document -> 'productPdpContent' is distinct from 'null'::jsonb then
      raise exception 'Mineral Guard requires the reviewed missing PDP row'
        using errcode = '23514';
    end if;
    insert into public.product_pdp_content(product_id, how_to_use_steps)
    values (v_product_id, '{}'::text[]);
    get diagnostics v_affected = row_count;
    v_changed_field := 'productPdpContent.how_to_use_steps';
  else
    if private.catalog_guidance_validation_errors(v_document) <> '[]'::jsonb then
      raise exception 'Biotic Reset structured instructions need separate review'
        using errcode = '23514';
    end if;
    if v_product.editorial_how_to_use = v_current_paragraph then
      return jsonb_build_object('ok', true, 'outcome', 'no-op',
        'productId', v_product_id, 'revision', v_revision);
    end if;
    update public.products set editorial_how_to_use = v_current_paragraph
    where id = v_product_id;
    get diagnostics v_affected = row_count;
    v_changed_field := 'product.editorial_how_to_use';
  end if;
  if v_affected <> 1 then
    raise exception 'guidance preparation expected exactly one affected row';
  end if;
  v_after := public.get_catalog_editor_document(v_product_id);
  if v_product.slug = 'mineral-guard' then
    if (v_after - 'productPdpContent') is distinct from (v_document - 'productPdpContent')
       or v_after #> '{productPdpContent,how_to_use_steps}' is distinct from '[]'::jsonb
       or v_after #>> '{productPdpContent,schema_version}' is distinct from '1'
       or jsonb_strip_nulls((v_after -> 'productPdpContent') - array[
         'product_id', 'schema_version', 'how_to_use_steps', 'created_at', 'updated_at'
       ]) is distinct from '{}'::jsonb then
      raise exception 'guidance preparation changed unapproved Mineral Guard facts';
    end if;
  elsif (v_after #- '{product,editorial_how_to_use}' #- '{product,updated_at}')
    is distinct from
    (v_document #- '{product,editorial_how_to_use}' #- '{product,updated_at}') then
    raise exception 'guidance preparation changed unapproved Biotic Reset facts';
  end if;
  insert into public.catalog_product_revisions(
    product_id, revision_number, schema_version, document, published_by
  ) values (v_product_id, v_revision + 1, 4, v_after, p_actor_id)
  returning * into v_published;
  insert into public.catalog_editor_audit_log(
    action, actor_id, product_id, revision_id, metadata
  ) values ('draft.published', p_actor_id, v_product_id, v_published.id,
    jsonb_build_object('source', 'spec-358-reviewed-product-guidance',
      'method', 'controlled-content-operation',
      'projectRef', p_verified_project_ref, 'beforeDocumentHash', md5(v_document::text),
      'revision', v_published.revision_number,
      'changedFields', jsonb_build_array(v_changed_field)));
  return jsonb_build_object('ok', true, 'outcome', 'published',
    'productId', v_product_id, 'revision', v_published.revision_number);
end;
$operation$;

revoke all on function pg_temp.prepare_reviewed_product_guidance(jsonb, integer, uuid, text)
  from public, anon, authenticated, service_role;
