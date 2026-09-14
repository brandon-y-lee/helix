-- Helpers for the composed disposable current Catalog checkpoint only.
-- The runner also loads the exact T1 historical document/seed helpers and the
-- T7 Storage metadata/verified-copy fixture. No customer rows or media bytes.
create function pg_temp.assert_current_contract(p_condition boolean, p_message text)
returns void language plpgsql as $$ begin
  if p_condition is not true then raise exception 'Current contract: %', p_message; end if;
end $$;

create function pg_temp.current_contract_state()
returns jsonb language sql as $$
  select pg_temp.catalog_identity_state() || jsonb_build_object(
    'commerce', pg_temp.current_contract_order_state(),
    'archived_media', (select coalesce(jsonb_agg(to_jsonb(m) order by m.id),'[]')
      from public.product_media m where m.archived_at is not null),
    'verified_media_copies', (select coalesce(jsonb_agg(to_jsonb(m) order by m.product_id,m.source_url),'[]')
      from private.verified_media_copies m),
    'media_operations', (select coalesce(jsonb_agg(to_jsonb(m) order by m.operation_id),'[]')
      from private.catalog_media_operations m),
    'media_policy', (select to_jsonb(p) from private.catalog_media_policy p),
    'storage_objects', (select coalesce(jsonb_agg(to_jsonb(o) order by o.id),'[]') from storage.objects o)
  );
$$;

create function pg_temp.assert_current_history_rows(p_before jsonb)
returns void language plpgsql as $$
declare
  after_state jsonb := pg_temp.current_contract_state();
  key text;
begin
  foreach key in array array['catalog_product_revisions','catalog_editor_audit_log'] loop
    -- Containment would accept added nested fields and reordered JSON arrays.
    -- Existing rows must remain exactly equal; only new row IDs may be added.
    perform pg_temp.assert_current_contract(not exists(
      select 1 from jsonb_array_elements(p_before -> key) expected
      where not exists(select 1 from jsonb_array_elements(after_state -> key) actual
        where actual ->> 'id' = expected ->> 'id' and actual = expected)
    ), 'existing ' || key || ' rows changed or disappeared');
  end loop;
end $$;

create function pg_temp.assert_current_history(p_before jsonb)
returns void language plpgsql as $$
declare
  after_state jsonb := pg_temp.current_contract_state();
  key text;
begin
  perform pg_temp.assert_current_history_rows(p_before);
  foreach key in array array['commerce','archived_media','verified_media_copies',
    'media_operations','media_policy','storage_objects'] loop
    perform pg_temp.assert_current_contract(after_state -> key is not distinct from p_before -> key,
      key || ' changed during Catalog Restore/Publish');
  end loop;
end $$;

create function pg_temp.expect_current_rejection(p_statement text, p_states text[])
returns void language plpgsql as $$
declare
  before_state jsonb := pg_temp.current_contract_state();
  rejected boolean := false;
begin
  begin
    execute p_statement;
  exception when others then
    if not (sqlstate = any(p_states)) then raise; end if;
    rejected := true;
  end;
  perform pg_temp.assert_current_contract(rejected, 'expected rejection: ' || p_statement);
  perform pg_temp.assert_current_contract(pg_temp.current_contract_state() = before_state,
    'rejected writer left partial Catalog, commerce, history or media changes');
end $$;

create function pg_temp.assert_current_identity(p_document jsonb, p_current jsonb)
returns void language plpgsql as $$
declare field_name text;
begin
  foreach field_name in array array['slug','display_name','seo_title','seo_description','search_keywords'] loop
    perform pg_temp.assert_current_contract(
      p_document #> array['product',field_name] is not distinct from p_current #> array['product',field_name],
      'historical Restore resurrected ' || field_name);
  end loop;
  perform pg_temp.assert_current_contract(p_document -> 'productFamily' = p_current -> 'productFamily',
    'Restore lost the current Product Family');
end $$;
