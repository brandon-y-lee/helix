-- Install once as the independent owner after the environment marker bootstrap.
-- The application sees only installation/enablement booleans and the existing public marker.
begin;
set local search_path = pg_catalog, pg_temp;
do $owner$
begin
  if session_user <> current_user
     or not exists (select from pg_class where oid = 'private.helix_environment'::regclass
       and relkind = 'r' and relowner = current_user::regrole and relrowsecurity) then
    raise exception 'The independent owner and verified production marker are required';
  end if;
  if not exists (select from private.helix_environment where singleton and
      (environment, project_ref) = ('production','erasogmsqpgiirovubjh')) then
    raise exception 'The independent owner and verified production marker are required';
  end if;
end;
$owner$;
create function private.read_helix_release_observations()
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  target record;
  support_flags jsonb := 'null';
  marketing_flags jsonb := 'null';
  event_flags jsonb;
  bound_media boolean;
  catalog_writers oid[];
  product constant uuid := '10000000-0000-4000-8000-000000000101';
  media_path constant text := '/storage/v1/object/public/helix-catalog/products/' || product || '/gallery/' || repeat('a',64) || '.webp';
  own_url constant text := 'https://erasogmsqpgiirovubjh.supabase.co' || media_path;
  child_url constant text := 'https://zyfkunnpnlmgvrojmrbg.supabase.co' || media_path;
begin
  select environment,project_ref into strict target from private.helix_environment where singleton;
  if target.environment <> 'production' or target.project_ref <> 'erasogmsqpgiirovubjh' then
    raise exception 'Wrong release observation target';
  end if;

  -- The reviewed #560 operation grants three read-only primitives to its one
  -- enrolled migration writer. Identify that login from the owner's fixed capability.
  select array_agg(a.grantee) into catalog_writers
    from pg_proc p cross join lateral aclexplode(p.proacl) a
    where p.oid = to_regprocedure('private.apply_helix_catalog_media_binding()')
      and p.proowner = current_user::regrole and p.prosecdef
      and encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') = '70b8a9c17b3e41612239d5692da70be837ad90be4d13f629a62bce97c800cb2b'
      and a.grantee <> p.proowner;

  -- These installed-definition fingerprints come from the real #560 migration on
  -- the repository's PostgreSQL 17 Catalog checkpoint. Check identities and ACLs
  -- before invoking any validator with the reader's elevated privileges.
  select coalesce(cardinality(catalog_writers) = 1, false) and not exists (
    select from (values
      -- signature, return type, set-returning, definer, service EXECUTE, writer EXECUTE, body SHA-256
      ('private.read_helix_environment()', 'record', true, true, true, true, 'd0da1cc1d6378efa182afcfc20f1dad42f55786b8be334f1e69ab1850fdc966e'),
      ('public.read_helix_environment()', 'record', true, false, true, true, '1a5d68297f34755d92cb4ea80e1432a76443861ff66a90e16b7eb651666996e7'),
      ('private.helix_catalog_media_prefix()', 'text', false, false, false, true, 'f367d566edcd7b15f089dd954b00e118bd5d82e80cfc4b4a5ceb6a95fa39f448'),
      ('private.is_current_product_media_url(text,uuid)', 'boolean', false, false, false, true, '59ce85c498b791ecc35c9893023d376256b9a844e2f4c295839f00d4c9b1a104'),
      ('private.is_bound_catalog_product_media_url(text)', 'boolean', false, true, true, true, 'fccaf85a521fe40a2a7b4990e27ddf1dc0a7824f6a56c2aa78a7043ed104d8d7'),
      ('private.enforce_bound_catalog_media_origin()', 'trigger', false, true, false, false, '044c5c06676312df9fc76e13329849258c2b85d50b39d4bc1ff9d9035cf71bb8'),
      ('private.enforce_catalog_draft_media()', 'trigger', false, true, false, false, '3e388c9afc50fdd0a7dcf0f1c937a43bf5ac1e08ed5debea9be5904457e2e20c'),
      ('private.enforce_product_media_identity()', 'trigger', false, true, false, false, 'cc4d67a3ff347523a5882ac78bd71ee9891a782b56171bda50cb2e65dbcd0bc0'),
      ('private.enforce_reactivated_product_media()', 'trigger', false, true, false, false, '9b04d45c793cab71ddf91e2f7632144907751a7b3af11ef00fbd315a5c1d7d26'),
      ('public.cutover_catalog_product_media(jsonb)', 'jsonb', false, true, true, false, '30171c904f9fe7c4b22c31186cc18bebd2beb9ff4213f8edd3ef87b2954c3070')
    ) expected(signature,result_type,returns_set,definer,service_access,writer_access,body_digest)
    where not exists (
      select from pg_proc p join pg_language lang on lang.oid = p.prolang
      where p.oid = to_regprocedure(expected.signature) and p.proowner = current_user::regrole
        and p.prorettype = expected.result_type::regtype and p.proretset = expected.returns_set
        and p.prosecdef = expected.definer and p.proconfig = array['search_path=""']
        and lang.lanname = case when expected.result_type in ('trigger','jsonb') then 'plpgsql' else 'sql' end
        and p.provolatile = (case when lang.lanname = 'sql' then 's' else 'v' end)::"char"
        and p.prokind = 'f' and not p.proleakproof and not p.proisstrict and p.proparallel = 'u' and p.prosupport = 0
        and encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') = expected.body_digest
        and has_function_privilege('service_role',p.oid,'EXECUTE') = expected.service_access
        and has_function_privilege(catalog_writers[1],p.oid,'EXECUTE') = expected.writer_access
        and not has_function_privilege('anon',p.oid,'EXECUTE') and not has_function_privilege('authenticated',p.oid,'EXECUTE')
        and not exists (select from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
          where a.grantee <> p.proowner and (a.is_grantable or a.grantor <> p.proowner
            or not ((expected.service_access and a.grantee = 'service_role'::regrole)
              or (expected.writer_access and a.grantee = catalog_writers[1]))))
    ))
    and exists (select from pg_constraint where conrelid = to_regclass('public.product_media')
      and conname = 'product_media_core_routine_editorial_shape_check' and contype = 'c' and convalidated
      and encode(sha256(convert_to(pg_get_constraintdef(oid),'UTF8')),'hex') = '1fb49d1c47247ddfefc1ed826df17076e9d8e7911ad4e44f003cde8ad05b56db')
    and (select count(*) = 4 from pg_trigger where tgenabled = 'O' and not tgisinternal
      and tgrelid in (to_regclass('public.product_media'),to_regclass('public.products'),to_regclass('public.product_content_drafts'))
      and pg_get_triggerdef(oid) in (
        'CREATE TRIGGER product_media_bound_catalog_origin BEFORE INSERT OR UPDATE OF product_id, url, archived_at ON public.product_media FOR EACH ROW EXECUTE FUNCTION private.enforce_bound_catalog_media_origin()',
        'CREATE TRIGGER product_content_drafts_current_media BEFORE INSERT OR UPDATE OF document, status, validation_errors ON public.product_content_drafts FOR EACH ROW EXECUTE FUNCTION private.enforce_catalog_draft_media()',
        'CREATE TRIGGER product_media_current_identity BEFORE INSERT OR UPDATE ON public.product_media FOR EACH ROW EXECUTE FUNCTION private.enforce_product_media_identity()',
        'CREATE CONSTRAINT TRIGGER products_current_media_on_reactivation AFTER INSERT OR UPDATE ON public.products DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.enforce_reactivated_product_media()'))
    and not exists (select from (values ('service_role'),('anon'),('authenticated')) api(role_name)
      where has_table_privilege(api.role_name,'private.helix_environment','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
        or has_any_column_privilege(api.role_name,'private.helix_environment','SELECT,INSERT,UPDATE'))
    into bound_media;

  if bound_media then
    bound_media := private.is_bound_catalog_product_media_url(own_url)
      and not private.is_bound_catalog_product_media_url(child_url)
      and not private.is_bound_catalog_product_media_url(replace(own_url,'helix-catalog/','avatars/'))
      and not private.is_bound_catalog_product_media_url(replace(own_url,'/gallery/', '/%252e%252e/'))
      and private.is_current_product_media_url(own_url,product)
      and not private.is_current_product_media_url(child_url,product)
      and not private.is_current_product_media_url(own_url,'10000000-0000-4000-8000-000000000102')
      and not private.is_current_product_media_url(replace(own_url,repeat('a',64),'unverified'),product);
  end if;
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
    'waitlist',exists (select from pg_proc p
      where p.oid = to_regprocedure('public.enroll_product_waitlist(uuid,text,boolean,text,text,text,uuid,text,jsonb)')
        and p.proargnames = array['p_product_id','p_normalized_email','p_marketing_consent','p_policy_version',
          'p_source','p_abuse_key','p_request_id','p_confirmation_token','p_marketing_template_contract']
        and p.prokind = 'f' and not p.proretset and p.prorettype = 'jsonb'::regtype
        and has_function_privilege('service_role',p.oid,'EXECUTE')
        and not has_function_privilege('anon',p.oid,'EXECUTE') and not has_function_privilege('authenticated',p.oid,'EXECUTE')));
end;
$function$;
revoke all on function private.read_helix_release_observations() from public,anon,authenticated,service_role;
grant execute on function private.read_helix_release_observations() to service_role;
create function public.read_helix_release_observations() returns jsonb language sql stable security invoker
set search_path = '' as $$ select private.read_helix_release_observations() $$;
revoke all on function public.read_helix_release_observations() from public,anon,authenticated,service_role;
grant execute on function public.read_helix_release_observations() to service_role;
do $grants$
begin
  if exists (
    select from pg_proc p
    where p.oid in ('private.read_helix_release_observations()'::regprocedure, 'public.read_helix_release_observations()'::regprocedure)
      and (not has_function_privilege('service_role', p.oid, 'EXECUTE')
        or has_function_privilege('anon', p.oid, 'EXECUTE')
        or has_function_privilege('authenticated', p.oid, 'EXECUTE')
        or has_function_privilege('helix_release_controller', p.oid, 'EXECUTE')
        or exists (select from aclexplode(coalesce(p.proacl, acldefault('f',p.proowner))) a
          where a.grantee <> p.proowner and
            (a.grantee <> 'service_role'::regrole or a.is_grantable or a.grantor <> p.proowner)))
  ) then raise exception 'Unexpected release observation grants'; end if;
end;
$grants$;
commit;
