-- Use the same connection as prefix-session-before.sql after the recovery commits.
DO $after$
DECLARE visible boolean;
BEGIN
  BEGIN
    EXECUTE 'EXECUTE helix_previous_catalog' INTO visible;
    IF visible IS DISTINCT FROM false THEN RAISE EXCEPTION 'Cached plan exposed a historical SKU'; END IF;
  EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
    NULL; -- Rejection is also a safe result of plan invalidation.
  END;
END
$after$;
SET ROLE service_role;
DO $after$
BEGIN
  IF has_table_privilege(current_setting('helix.test_old_product_oid')::oid,'SELECT')
     OR has_function_privilege(current_setting('helix.test_old_writer_oid')::oid,'EXECUTE') THEN
    RAISE EXCEPTION 'Cached historic object retains an application grant';
  END IF;
  BEGIN
    EXECUTE 'EXECUTE helix_previous_writer(NULL)';
    RAISE EXCEPTION 'Cached old writer can still execute' USING ERRCODE='P0004';
  EXCEPTION WHEN insufficient_privilege OR undefined_function THEN NULL;
  END;
END
$after$;
DEALLOCATE helix_previous_catalog;
DEALLOCATE helix_previous_writer;
RESET ROLE;
