set lock_timeout = '10s';
set statement_timeout = '120s';

alter function public.publish_catalog_product_draft_v4(
  uuid, bigint, uuid, text, jsonb
) rename to publish_catalog_product_draft_v4_without_family_concurrency;

revoke all on function
  public.publish_catalog_product_draft_v4_without_family_concurrency(
    uuid, bigint, uuid, text, jsonb
  )
from public, anon, authenticated, service_role;

create function public.publish_catalog_product_draft_v4(
  p_draft_id uuid,
  p_expected_version bigint,
  p_actor_id uuid,
  p_actor_role text,
  p_change_audit jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft public.product_content_drafts%rowtype;
  v_requested_family jsonb;
  v_current_family_id uuid;
  v_requested_family_id uuid;
  v_lock_family_id uuid;
  v_affected_product_ids uuid[];
  v_latest_revision integer;
  v_family_before jsonb;
  v_family_changed boolean;
  v_result jsonb;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_draft
  from public.product_content_drafts
  where id = p_draft_id
  for update;
  if not found then
    raise exception 'catalog draft not found' using errcode = 'P0002';
  end if;

  if v_draft.status <> 'ready'
     or v_draft.version <> p_expected_version
  then
    return public.publish_catalog_product_draft_v4_without_family_concurrency(
      p_draft_id,
      p_expected_version,
      p_actor_id,
      p_actor_role,
      p_change_audit
    );
  end if;

  if not (v_draft.document ? 'productFamily')
     or coalesce(
       jsonb_typeof(v_draft.document -> 'productFamily'),
       'null'
     ) not in ('object', 'null')
  then
    return public.publish_catalog_product_draft_v4_without_family_concurrency(
      p_draft_id,
      p_expected_version,
      p_actor_id,
      p_actor_role,
      p_change_audit
    );
  end if;

  v_requested_family := v_draft.document -> 'productFamily';

  select membership.family_id into v_current_family_id
  from public.product_family_memberships membership
  where membership.product_id = v_draft.product_id;

  if jsonb_typeof(v_requested_family) = 'object'
     and jsonb_typeof(v_requested_family -> 'family') = 'object'
  then
    begin
      v_requested_family_id :=
        (v_requested_family #>> '{family,id}')::uuid;
    exception
      when invalid_text_representation then
        return public.publish_catalog_product_draft_v4_without_family_concurrency(
          p_draft_id,
          p_expected_version,
          p_actor_id,
          p_actor_role,
          p_change_audit
        );
    end;
  end if;

  if v_current_family_id is not null
     and v_requested_family_id is not null
     and v_current_family_id <> v_requested_family_id
  then
    return public.publish_catalog_product_draft_v4_without_family_concurrency(
      p_draft_id,
      p_expected_version,
      p_actor_id,
      p_actor_role,
      p_change_audit
    );
  end if;

  v_lock_family_id := coalesce(
    v_current_family_id,
    v_requested_family_id
  );
  if v_lock_family_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'mei-pelle-product-family:' || v_lock_family_id::text,
        0
      )
    );

    perform 1
    from public.product_families family
    where family.id = v_lock_family_id
    for update;
  end if;

  select coalesce(
    array_agg(affected.product_id order by affected.product_id),
    array[v_draft.product_id]
  )
  into v_affected_product_ids
  from (
    select v_draft.product_id as product_id
    union
    select membership.product_id
    from public.product_family_memberships membership
    where membership.family_id = v_current_family_id
    union
    select (member ->> 'product_id')::uuid
    from jsonb_array_elements(
      case
        when jsonb_typeof(v_requested_family -> 'memberships') = 'array'
          then v_requested_family -> 'memberships'
        else '[]'::jsonb
      end
    ) member
    where (member ->> 'product_id') is not null
  ) affected;

  perform 1
  from public.products product
  where product.id = any(v_affected_product_ids)
  order by product.id
  for update;

  select coalesce(max(revision.revision_number), 0)
  into v_latest_revision
  from public.catalog_product_revisions revision
  where revision.product_id = v_draft.product_id;
  if v_draft.base_revision <> v_latest_revision then
    return jsonb_build_object(
      'ok', false,
      'code', 'revision_conflict',
      'baseRevision', v_draft.base_revision,
      'latestRevision', v_latest_revision
    );
  end if;

  v_family_before := private.catalog_editor_product_family(
    v_draft.product_id
  );
  v_family_changed := v_requested_family is distinct from v_family_before;

  v_result := public.publish_catalog_product_draft_v4_without_family_concurrency(
    p_draft_id,
    p_expected_version,
    p_actor_id,
    p_actor_role,
    p_change_audit
  );

  if v_result ->> 'ok' = 'true' and v_family_changed then
    with sibling_revisions as (
      insert into public.catalog_product_revisions (
        product_id,
        revision_number,
        schema_version,
        document,
        source_draft_id,
        published_by,
        published_at
      )
      select
        product.id,
        coalesce((
          select max(revision.revision_number)
          from public.catalog_product_revisions revision
          where revision.product_id = product.id
        ), 0) + 1,
        4,
        private.catalog_editor_document_v4(product.id),
        null,
        p_actor_id,
        v_now
      from public.products product
      where product.id = any(v_affected_product_ids)
        and product.id <> v_draft.product_id
      returning id, product_id, revision_number
    )
    insert into public.catalog_editor_audit_log (
      action,
      actor_id,
      product_id,
      draft_id,
      revision_id,
      metadata
    )
    select
      'family.published',
      p_actor_id,
      sibling.product_id,
      null,
      sibling.id,
      jsonb_build_object(
        'source', 'shared-family-publication',
        'originDraftId', p_draft_id,
        'originProductId', v_draft.product_id,
        'familyId', v_lock_family_id,
        'revision', sibling.revision_number,
        'changedTables', jsonb_build_object(
          'product_families', true,
          'product_family_memberships', true
        )
      )
    from sibling_revisions sibling;
  end if;

  return v_result;
end;
$$;

revoke all on function public.publish_catalog_product_draft_v4(
  uuid, bigint, uuid, text, jsonb
) from public, anon, authenticated, service_role;
