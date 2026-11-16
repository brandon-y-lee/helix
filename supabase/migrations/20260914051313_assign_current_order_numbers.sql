-- Compatible preparation: change only the number assigned to a newly inserted Order.
-- Existing Orders and the current reservation wrapper remain unchanged.
SET lock_timeout = '10s';
SET statement_timeout = '120s';

DO $migration$
DECLARE
  target regprocedure := 'public.reserve_checkout_order_snapshot(text,uuid,uuid,text,text,integer,integer,integer,integer,integer,text,integer,integer,text,jsonb,jsonb)'::regprocedure;
  previous_expression constant text := '''MP-'' || pg_catalog.upper(pg_catalog.substr(p_idempotency_key, 18, 12))';
  current_expression constant text := '''HX-'' || pg_catalog.upper(pg_catalog.substr(p_idempotency_key, 18, 12))';
  previous_body_md5 constant text := '30f02dbc8f6afe7c72ed66418be4059e';
  before_row pg_catalog.pg_proc%rowtype;
  after_row pg_catalog.pg_proc%rowtype;
BEGIN
  SELECT * INTO STRICT before_row FROM pg_catalog.pg_proc WHERE oid = target;
  IF before_row.prosecdef OR before_row.proconfig IS DISTINCT FROM ARRAY['search_path=""']
    OR has_function_privilege('anon', target, 'EXECUTE')
    OR has_function_privilege('authenticated', target, 'EXECUTE')
    OR NOT has_function_privilege('service_role', target, 'EXECUTE')
  THEN RAISE EXCEPTION 'Unexpected Checkout reservation security contract'; END IF;

  IF pg_catalog.md5(pg_catalog.replace(before_row.prosrc, current_expression, previous_expression))
      = previous_body_md5 AND pg_catalog.strpos(before_row.prosrc, current_expression) > 0
  THEN RETURN; END IF;
  IF pg_catalog.md5(before_row.prosrc) <> previous_body_md5
    OR pg_catalog.strpos(before_row.prosrc, previous_expression) = 0
  THEN RAISE EXCEPTION 'Checkout reservation body changed; review before assigning current Order Numbers'; END IF;

  EXECUTE pg_catalog.replace(pg_catalog.pg_get_functiondef(target), previous_expression, current_expression);
  SELECT * INTO STRICT after_row FROM pg_catalog.pg_proc WHERE oid = target;
  IF after_row.prosrc IS DISTINCT FROM pg_catalog.replace(before_row.prosrc, previous_expression, current_expression)
    OR (after_row.proacl, after_row.proconfig, after_row.prosecdef)
      IS DISTINCT FROM (before_row.proacl, before_row.proconfig, before_row.prosecdef)
  THEN RAISE EXCEPTION 'Checkout number preparation changed an unrelated function contract'; END IF;
END;
$migration$;
