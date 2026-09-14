-- Prepare this migration before deploying the application that requires the
-- retainedFields Restore response. Restore only creates a Working Catalog Draft.
set lock_timeout = '10s';
set statement_timeout = '120s';

create or replace function public.restore_catalog_product_revision(
  p_revision_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revision public.catalog_product_revisions%rowtype;
  v_current_product public.products%rowtype;
  v_existing public.product_content_drafts%rowtype;
  v_created public.product_content_drafts%rowtype;
  v_document jsonb;
  v_base_revision integer;
  v_retained_fields constant text[] := array[
    'slug', 'display_name', 'seo_title', 'seo_description', 'search_keywords'
  ];
begin
  select * into v_revision
  from public.catalog_product_revisions where id = p_revision_id;
  if not found then
    raise exception 'catalog revision not found' using errcode = 'P0002';
  end if;

  select * into v_current_product
  from public.products where id = v_revision.product_id for update;
  if not found then
    raise exception 'catalog product not found' using errcode = 'P0002';
  end if;

  select * into v_existing
  from public.product_content_drafts
  where product_id = v_revision.product_id and status in ('draft', 'ready')
  for update;
  if found then
    return jsonb_build_object(
      'ok', false, 'code', 'active_draft_exists',
      'stored', jsonb_build_object(
        'id', v_existing.id, 'version', v_existing.version,
        'status', v_existing.status, 'updatedAt', v_existing.updated_at,
        'updatedBy', v_existing.updated_by
      )
    );
  end if;

  -- Keep the supported historical decoders and current Product Family wrapper.
  v_document := private.catalog_editor_upgrade_to_v4(v_revision.document);
  if v_document is null then
    raise exception 'unsupported catalog revision schema version %',
      v_revision.schema_version using errcode = '22023';
  end if;

  -- Apply the current identity to every supported revision schema, including V4.
  -- jsonb_build_object retains current nulls instead of resurrecting old values.
  v_document := jsonb_set(
    v_document,
    '{product}',
    (v_document -> 'product') || jsonb_build_object(
      'slug', v_current_product.slug,
      'display_name', v_current_product.display_name,
      'seo_title', v_current_product.seo_title,
      'seo_description', v_current_product.seo_description,
      'search_keywords', v_current_product.search_keywords
    )
  );

  select coalesce(max(revision_number), 0) into v_base_revision
  from public.catalog_product_revisions
  where product_id = v_revision.product_id;

  insert into public.product_content_drafts (
    product_id, schema_version, base_revision, version, document, status,
    validation_errors, created_by, updated_by
  ) values (
    v_revision.product_id, 4, v_base_revision, 1, v_document, 'draft',
    '[]'::jsonb, p_actor_id, p_actor_id
  ) returning * into v_created;

  insert into public.catalog_editor_audit_log (
    action, actor_id, product_id, draft_id, revision_id, metadata
  ) values (
    'draft.restored', p_actor_id, v_revision.product_id, v_created.id,
    v_revision.id, jsonb_build_object(
      'restoredRevision', v_revision.revision_number,
      'restoredSchemaVersion', v_revision.schema_version,
      'draftSchemaVersion', 4,
      'baseRevision', v_base_revision,
      'retainedFields', to_jsonb(v_retained_fields)
    )
  );
  return jsonb_build_object(
    'ok', true,
    'draft', to_jsonb(v_created),
    'retainedFields', to_jsonb(v_retained_fields)
  );
end;
$$;

revoke all on function public.restore_catalog_product_revision(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.restore_catalog_product_revision(uuid, uuid)
  to service_role;

comment on function public.restore_catalog_product_revision(uuid, uuid) is
  'Creates a Working Catalog Draft from a supported Published Revision, retaining current Product identity and discovery fields without rewriting history.';
