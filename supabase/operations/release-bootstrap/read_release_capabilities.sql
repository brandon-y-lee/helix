-- Install once as the independent owner after the environment marker bootstrap.
-- The application sees only installation/enablement booleans and the existing public marker.
begin;
create function private.read_helix_release_observations()
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  target record;
  support_flags jsonb := 'null';
  marketing_flags jsonb := 'null';
  event_flags jsonb;
  bound_media boolean;
begin
  select * into strict target from private.read_helix_environment();
  if target.environment <> 'production' or target.project_ref <> 'erasogmsqpgiirovubjh' then
    raise exception 'Wrong release observation target';
  end if;

  select exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.product_media'::regclass
    and tgname='product_media_bound_catalog_origin' and tgenabled='O')
    and exists(select 1 from pg_catalog.pg_constraint where conrelid='public.product_media'::regclass
    and conname='product_media_core_routine_editorial_shape_check' and convalidated
    and pg_catalog.pg_get_constraintdef(oid) like '%is_bound_catalog_product_media_url%') into bound_media;
  -- Absence of an optional package is explicit. A missing singleton or incompatible installed
  -- definition raises an error; a read failure is never interpreted as a disabled feature.
  if pg_catalog.to_regclass('support_production_private.contract') is not null then
    select jsonb_build_object('admission',admission_enabled,'worker',worker_enabled,
      'mediaQualified',full_media_qualified,'isolationQualified',isolation_qualified,
      'operationsQualified',operations_qualified)
    into strict support_flags from support_production_private.contract where singleton;
  end if;
  if pg_catalog.to_regclass('private.production_marketing_controls') is not null then
    select jsonb_build_object('enrollment',enrollment_enabled,'dispatch',dispatch_enabled)
    into strict marketing_flags from private.production_marketing_controls where singleton;
    if pg_catalog.to_regprocedure('public.read_production_marketing_status(uuid)') is not null then
      select jsonb_build_object('events',events_enabled,'status',status_enabled) into strict event_flags
      from private.production_marketing_controls where singleton;
      marketing_flags := marketing_flags || event_flags;
    end if;
  end if;
  return jsonb_build_object('environment',target.environment,'projectRef',target.project_ref,
    'catalogSchema',bound_media,'support',support_flags,'marketing',marketing_flags,
    'waitlist',exists (select 1 from pg_catalog.pg_proc p where p.pronamespace='public'::regnamespace
      and p.proname='enroll_product_waitlist' and pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')));
end;
$function$;
revoke all on function private.read_helix_release_observations() from public,anon,authenticated,service_role;
grant execute on function private.read_helix_release_observations() to service_role;
create function public.read_helix_release_observations() returns jsonb language sql stable security invoker
set search_path = '' as $$ select private.read_helix_release_observations() $$;
revoke all on function public.read_helix_release_observations() from public,anon,authenticated,service_role;
grant execute on function public.read_helix_release_observations() to service_role;
commit;
