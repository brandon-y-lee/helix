-- Read-only inventory except for this connection-local helper. No persistent DDL.
-- Verify the connection targets erasogmsqpgiirovubjh before use. Trigger arguments
-- may contain credentials: report only the exact definition digest, never the body.
create or replace function pg_temp.product_url_inventory()
returns jsonb language sql set search_path='' as $inventory$
select jsonb_build_object(
  'resolver', (select jsonb_build_object(
    'signature',p.oid::regprocedure::text,'bodyMd5',md5(p.prosrc),
    'definitionSha256',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),
    'language',l.lanname,'securityDefiner',p.prosecdef,'volatility',p.provolatile,
    'config',to_jsonb(p.proconfig),'acl',p.proacl::text
  ) from pg_proc p join pg_language l on l.oid=p.prolang
    where p.oid=to_regprocedure('public.resolve_product_slug(text)')),
  'resolverSignatures',(select coalesce(jsonb_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text),'[]')
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='resolve_product_slug'),
  'callers',(select coalesce(jsonb_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text),'[]')
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname not like 'pg_temp_%' and n.nspname not like 'pg_toast_temp_%'
      and p.oid is distinct from to_regprocedure('public.resolve_product_slug(text)')
      and p.prosrc ilike '%resolve_product_slug%'),
  'dependencies',(select coalesce(jsonb_agg(pg_describe_object(d.classid,d.objid,d.objsubid)
      order by pg_describe_object(d.classid,d.objid,d.objsubid)),'[]')
    from pg_depend d where d.refclassid='pg_proc'::regclass
      and d.refobjid=to_regprocedure('public.resolve_product_slug(text)')),
  'policies',(select coalesce(jsonb_agg(to_jsonb(p) order by p.policyname),'[]')
    from pg_policies p where p.schemaname='public' and p.tablename='product_slug_routes'),
  'table',(select jsonb_build_object('rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'acl',c.relacl::text)
    from pg_class c where c.oid='public.product_slug_routes'::regclass),
  'columnAcls',(select coalesce(jsonb_agg(jsonb_build_object('column',a.attname,'acl',a.attacl::text) order by a.attnum),'[]')
    from pg_attribute a where a.attrelid='public.product_slug_routes'::regclass and a.attacl is not null and not a.attisdropped),
  'triggers',(select coalesce(jsonb_agg(jsonb_build_object(
      'table',c.relname,'name',t.tgname,'functionSchema',n.nspname,'functionName',p.proname,
      'enabled',t.tgenabled,'type',t.tgtype,
      'definitionSha256',encode(sha256(convert_to(pg_get_triggerdef(t.oid),'UTF8')),'hex')
    ) order by c.relname,t.tgname),'[]')
    from pg_trigger t join pg_class c on c.oid=t.tgrelid
    join pg_proc p on p.oid=t.tgfoid join pg_namespace n on n.oid=p.pronamespace
    where not t.tgisinternal and t.tgrelid in ('public.products'::regclass,'public.product_slug_routes'::regclass)),
  'integrityFunctions',(select jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object(
      'definitionSha256',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),
      'acl',p.proacl::text))
    from pg_proc p where p.oid in (
      'private.enforce_replaced_product_archival()'::regprocedure,
      'private.forbid_product_slug_route_delete()'::regprocedure,
      'private.sync_product_slug_route()'::regprocedure,
      'private.validate_product_slug_route_row()'::regprocedure,
      'public.replace_catalog_product_slug(uuid,uuid,uuid)'::regprocedure,
      'public.replace_catalog_product_slug_v1(uuid,uuid,uuid)'::regprocedure)),
  'reservations',(select coalesce(jsonb_agg(jsonb_build_object(
      'sourceSlug',r.source_slug,'sourceProductId',r.source_product_id,
      'targetProductId',r.target_product_id,'routeKind',r.route_kind,'createdAt',r.created_at
    ) order by r.source_slug),'[]') from public.product_slug_routes r),
  'activeProducts',(select coalesce(jsonb_agg(jsonb_build_object(
      'productId',p.id,'slug',p.slug,'revision',coalesce((select max(r.revision_number)
        from public.catalog_product_revisions r where r.product_id=p.id),0),
      'searchKeywords',p.search_keywords
    ) order by p.id),'[]') from public.products p where p.catalog_status='active')
);
$inventory$;
select pg_temp.product_url_inventory();
