set lock_timeout = '10s';
set statement_timeout = '120s';

alter function public.publish_catalog_product_draft(
  uuid, bigint, uuid, text, jsonb
) rename to publish_catalog_product_draft_without_family_lock_order;

revoke all on function
  public.publish_catalog_product_draft_without_family_lock_order(
    uuid, bigint, uuid, text, jsonb
  )
from public, anon, authenticated, service_role;

create function public.publish_catalog_product_draft(
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
  v_product_id uuid;
  v_document jsonb;
  v_current_family_id uuid;
  v_requested_family_id uuid;
  v_lock_family_id uuid;
  v_affected_product_ids uuid[];
begin
  select draft.product_id, draft.document
  into v_product_id, v_document
  from public.product_content_drafts draft
  where draft.id = p_draft_id;

  if v_product_id is null then
    return public.publish_catalog_product_draft_without_family_lock_order(
      p_draft_id,
      p_expected_version,
      p_actor_id,
      p_actor_role,
      p_change_audit
    );
  end if;

  select membership.family_id into v_current_family_id
  from public.product_family_memberships membership
  where membership.product_id = v_product_id;

  if jsonb_typeof(v_document #> '{productFamily,family}') = 'object'
     and coalesce(v_document #>> '{productFamily,family,id}', '')
       ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    v_requested_family_id :=
      (v_document #>> '{productFamily,family,id}')::uuid;
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

    select coalesce(
      array_agg(affected.product_id order by affected.product_id),
      array[v_product_id]
    )
    into v_affected_product_ids
    from (
      select v_product_id as product_id
      union
      select membership.product_id
      from public.product_family_memberships membership
      where membership.family_id = v_current_family_id
      union
      select (member ->> 'product_id')::uuid
      from jsonb_array_elements(
        case
          when jsonb_typeof(
            v_document #> '{productFamily,memberships}'
          ) = 'array'
            then v_document #> '{productFamily,memberships}'
          else '[]'::jsonb
        end
      ) member
      where coalesce(member ->> 'product_id', '')
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ) affected;

    perform 1
    from public.products product
    where product.id = any(v_affected_product_ids)
    order by product.id
    for update;
  end if;

  return public.publish_catalog_product_draft_without_family_lock_order(
    p_draft_id,
    p_expected_version,
    p_actor_id,
    p_actor_role,
    p_change_audit
  );
end;
$$;

revoke all on function public.publish_catalog_product_draft(
  uuid, bigint, uuid, text, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.publish_catalog_product_draft(
  uuid, bigint, uuid, text, jsonb
) to service_role;

comment on function public.publish_catalog_product_draft(
  uuid, bigint, uuid, text, jsonb
) is
  'Serializes shared Product Family publication before any Product row lock, then dispatches the canonical audited V4 publish.';
