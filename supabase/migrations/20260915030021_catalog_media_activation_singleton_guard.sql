-- Supabase API sessions preload safeupdate, including SECURITY DEFINER calls.
-- Qualify the existing singleton UPDATE without changing its activation guards,
-- ownership, grants, or any policy data.
set lock_timeout = '10s';
set statement_timeout = '120s';

do $patch_activation$
declare
  v_definition text := pg_get_functiondef('public.activate_catalog_product_media_policy(uuid,uuid)'::regprocedure);
  v_anchor constant text := '  update private.catalog_media_policy set enabled=true,operation_id=p_operation_id,activated_at=now(),activated_by=p_actor_id;';
  v_replacement constant text := '  update private.catalog_media_policy set enabled=true,operation_id=p_operation_id,activated_at=now(),activated_by=p_actor_id where singleton = true;';
begin
  if (length(v_definition) - length(replace(v_definition, v_anchor, ''))) / length(v_anchor) <> 1
     or position(v_replacement in v_definition) > 0 then
    raise exception 'Media activation requires the reviewed singleton UPDATE';
  end if;
  execute replace(v_definition, v_anchor, v_replacement);
end;
$patch_activation$;
