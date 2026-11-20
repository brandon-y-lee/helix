-- Run only inside the throwaway PG17 release authorization proof.
-- The observed contract comes from database state, including its absence.
begin;
create table public.product_media (url text);
do $$ begin
 if (public.read_helix_release_observations()->>'catalogSchema')::boolean or
    public.read_helix_release_observations()->'support' <> 'null'::jsonb then
   raise exception 'Missing contract incorrectly qualified';
 end if;
 if has_function_privilege('anon','public.read_helix_release_observations()','EXECUTE')
    or has_function_privilege('authenticated','private.read_helix_release_observations()','EXECUTE')
    or has_function_privilege('helix_release_controller','private.read_helix_release_observations()','EXECUTE') then
   raise exception 'Private observation reader exposed';
 end if;
end $$;
create function private.is_bound_catalog_product_media_url(text) returns boolean language sql immutable as $$select true$$;
alter table public.product_media add constraint product_media_core_routine_editorial_shape_check
  check (private.is_bound_catalog_product_media_url(url));
create function private.test_bound_media() returns trigger language plpgsql as $$ begin return new; end $$;
create trigger product_media_bound_catalog_origin before insert on public.product_media for each row execute function private.test_bound_media();
create schema support_production_private;
create table support_production_private.contract(singleton boolean primary key,admission_enabled boolean,worker_enabled boolean,
 full_media_qualified boolean,isolation_qualified boolean,operations_qualified boolean);
insert into support_production_private.contract values(true,false,true,false,false,false);
create table private.production_marketing_controls(singleton boolean primary key,enrollment_enabled boolean,dispatch_enabled boolean);
insert into private.production_marketing_controls values(true,false,false);
set local role service_role;
do $$ declare obs jsonb; begin
  obs := public.read_helix_release_observations();
  if obs->>'environment' is distinct from 'production' or obs->>'catalogSchema' is distinct from 'true'
     or obs->'support'->>'worker' is distinct from 'true'
     or obs->'marketing' is distinct from '{"enrollment":false,"dispatch":false}'::jsonb then
    raise exception 'Incorrect release capability observation';
  end if;
end $$;
reset role;
delete from support_production_private.contract;
do $$ begin
  begin perform public.read_helix_release_observations(); raise exception 'Missing contract accepted';
  exception when no_data_found then null; end;
end $$;
rollback;
