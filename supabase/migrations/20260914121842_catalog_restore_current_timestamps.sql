-- Restore creates editable history for review; database-owned timestamps must
-- describe the current matching rows used by normal ownership validation.
set lock_timeout = '10s';
set statement_timeout = '120s';

create function private.catalog_restore_current_timestamps(
  p_document jsonb, p_current jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_section text;
  v_identity_fields text[];
  v_timestamp_fields text[];
  v_is_array boolean;
  v_rows jsonb;
begin
  -- Do not repair or conceal a mismatched historical Product identity.
  if p_document -> 'productId' is distinct from p_current -> 'productId' then
    return p_document;
  end if;
  for v_section, v_identity_fields, v_timestamp_fields, v_is_array in
    select * from (values
      ('product', array['id'], array['created_at','updated_at','published_at'], false),
      ('productPdpContent', array['product_id'], array['created_at','updated_at'], false),
      ('productSource', array['product_id'], array['created_at','updated_at'], false),
      ('variants', array['product_id','id'], array['updated_at'], true),
      ('media', array['product_id','id'], array['created_at','updated_at'], true),
      ('relationships', array['product_id','related_product_id','relationship_type'], array['created_at'], true)
    ) as sections(section, identities, timestamps, is_array)
  loop
    if not (p_document ? v_section)
       or jsonb_typeof(p_document -> v_section) = 'null' then
      continue;
    end if;
    -- Iterate historical rows only. No current row is inserted, no absent or
    -- archived historical row is removed, and list order is retained exactly.
    select coalesce(jsonb_agg(
      historical.row || coalesce((
        select jsonb_object_agg(field.key, field.value)
        from jsonb_each(current.row) as field
        where field.key = any(v_timestamp_fields)
      ), '{}'::jsonb) order by historical.ordinality
    ), '[]'::jsonb) into v_rows
    from jsonb_array_elements(case when v_is_array then p_document -> v_section
      else jsonb_build_array(p_document -> v_section) end)
      with ordinality as historical(row, ordinality)
    left join jsonb_array_elements(case when v_is_array then p_current -> v_section
      else jsonb_build_array(p_current -> v_section) end) as current(row)
      on jsonb_typeof(current.row) = 'object' and not exists (
        select 1 from unnest(v_identity_fields) as identity(field)
        where historical.row -> identity.field is distinct from current.row -> identity.field
      );
    p_document := jsonb_set(p_document, array[v_section],
      case when v_is_array then v_rows else v_rows -> 0 end);
  end loop;
  return p_document;
end;
$$;

revoke all on function private.catalog_restore_current_timestamps(jsonb, jsonb)
  from public, anon, authenticated, service_role;

-- The existing Restore holds the Product lock before decoding and INSERT.
-- Retain its guidance provenance, five identity fields, audit and response,
-- media trigger, conflict handling, security-definer settings and grants.
do $patch_restore$
declare
  v_definition text := pg_get_functiondef('public.restore_catalog_product_revision(uuid,uuid)'::regprocedure);
  v_anchor constant text := '  select coalesce(max(revision_number), 0) into v_base_revision';
  v_insertion constant text := E'  v_document := private.catalog_restore_current_timestamps(\n    v_document, public.get_catalog_editor_document(v_revision.product_id)\n  );\n\n';
begin
  if (length(v_definition) - length(replace(v_definition, v_anchor, ''))) / length(v_anchor) <> 1
     or position(v_insertion in v_definition) > 0
     or position('private.catalog_restore_guidance(v_document, v_revision.document)' in v_definition) = 0 then
    raise exception 'Restore timestamp refresh requires the reviewed identity and guidance function';
  end if;
  execute replace(v_definition, v_anchor, v_insertion || v_anchor);
end;
$patch_restore$;
