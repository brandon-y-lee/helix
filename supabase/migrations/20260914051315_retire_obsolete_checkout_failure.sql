-- Contraction only after a verified deployment uses the session-qualified RPC.
-- Supply that reviewed deployment's exact source SHA in this transaction; see the runbook.
SET lock_timeout = '10s';
SET statement_timeout = '120s';

DO $migration$
DECLARE
  obsolete regprocedure := to_regprocedure('public.fail_checkout_order_from_stripe(uuid,text)');
  current_function regprocedure := 'public.fail_checkout_order_from_stripe(uuid,text,text)'::regprocedure;
  current_row pg_catalog.pg_proc%rowtype;
  obsolete_row pg_catalog.pg_proc%rowtype;
BEGIN
  IF coalesce(current_setting('helix.checkout_verified_deployment_sha', true), '') !~ '^[0-9a-f]{40}$'
  THEN RAISE EXCEPTION 'Checkout contraction requires a verified session-qualified deployment SHA'; END IF;

  SELECT * INTO STRICT current_row FROM pg_catalog.pg_proc WHERE oid = current_function;
  IF pg_catalog.md5(current_row.prosrc) <> '2602b3199f78b3be24ebf2cb7242d622'
    OR current_row.prosecdef OR current_row.proconfig IS DISTINCT FROM ARRAY['search_path=""']
    OR has_function_privilege('anon', current_function, 'EXECUTE')
    OR has_function_privilege('authenticated', current_function, 'EXECUTE')
    OR NOT has_function_privilege('service_role', current_function, 'EXECUTE')
  THEN RAISE EXCEPTION 'Unexpected session-qualified Checkout failure contract'; END IF;

  IF obsolete IS NULL THEN RETURN; END IF;
  SELECT * INTO STRICT obsolete_row FROM pg_catalog.pg_proc WHERE oid = obsolete;
  IF pg_catalog.md5(obsolete_row.prosrc) <> '9f4684bfd84df734cb8438b14aff0c16'
    OR obsolete_row.prosecdef OR obsolete_row.proconfig IS DISTINCT FROM ARRAY['search_path=""']
    OR has_function_privilege('anon', obsolete, 'EXECUTE')
    OR has_function_privilege('authenticated', obsolete, 'EXECUTE')
    OR NOT has_function_privilege('service_role', obsolete, 'EXECUTE')
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_depend WHERE refclassid = 'pg_catalog.pg_proc'::regclass AND refobjid = obsolete)
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE oid <> obsolete
      AND prosrc ILIKE '%fail_checkout_order_from_stripe%')
  THEN RAISE EXCEPTION 'Obsolete Checkout failure contract changed or has callers; review before removal'; END IF;

  DROP FUNCTION public.fail_checkout_order_from_stripe(uuid,text) RESTRICT;
END;
$migration$;
