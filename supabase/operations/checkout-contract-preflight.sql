-- Read-only. Run only against the verified approved project erasogmsqpgiirovubjh.
SELECT p.oid::regprocedure::text AS signature,
  pg_catalog.md5(p.prosrc) AS body_md5, p.prosecdef AS security_definer,
  p.proconfig, p.proacl::text AS grants,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute
FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN (
  'reserve_checkout_order_snapshot','reserve_checkout_order_snapshot_v2',
  'fail_checkout_order_from_stripe'
) ORDER BY signature;

SELECT p.oid::regprocedure::text AS routine_caller
FROM pg_catalog.pg_proc p
WHERE p.oid IS DISTINCT FROM to_regprocedure('public.fail_checkout_order_from_stripe(uuid,text)')
  AND p.prosrc ILIKE '%fail_checkout_order_from_stripe%';

SELECT pg_catalog.pg_describe_object(d.classid,d.objid,d.objsubid) AS tracked_dependency
FROM pg_catalog.pg_depend d
WHERE d.refclassid='pg_catalog.pg_proc'::regclass
  AND d.refobjid=to_regprocedure('public.fail_checkout_order_from_stripe(uuid,text)');
