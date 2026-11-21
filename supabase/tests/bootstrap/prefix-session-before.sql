-- Run this on a second, persistent, autocommit connection immediately before recovery.
-- Materialize a query plan with actual historical relation and function OIDs.
SELECT set_config('helix.test_old_product_oid','public.products'::regclass::oid::text,false);
SELECT set_config('helix.test_old_writer_oid','public.ensure_loyalty_account(uuid)'::regprocedure::oid::text,false);
-- The native runtime roles may have no historic SELECT grant. Warm the catalog
-- plan as its actual owner, then warm a separate routine plan as service_role.
PREPARE helix_previous_catalog AS SELECT EXISTS (
  SELECT FROM public.products WHERE slug='northpoint-renewal-serum'
);
DO $before$
DECLARE present boolean;
BEGIN
  EXECUTE 'EXECUTE helix_previous_catalog' INTO present;
  IF present IS DISTINCT FROM true THEN RAISE EXCEPTION 'Stale caller never saw the original catalog'; END IF;
END
$before$;
SET ROLE service_role;
PREPARE helix_previous_writer(uuid) AS SELECT public.ensure_loyalty_account($1);
-- NULL is a documented rejected argument in the old function. This establishes
-- a real cached call without inserting a loyalty row.
DO $before$
BEGIN
  BEGIN
    EXECUTE 'EXECUTE helix_previous_writer(NULL)';
    RAISE EXCEPTION 'Old writer unexpectedly accepted NULL' USING ERRCODE='P0004';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'ensure_loyalty_account requires a user id' THEN RAISE; END IF;
  END;
END
$before$;
RESET ROLE;
