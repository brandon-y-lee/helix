-- Ticket #411 preparation template. DO NOT execute during Ticket delivery.
-- Ticket #413 may execute this only from its reviewed activation manifest after
-- verifying project erasogmsqpgiirovubjh, the deployed merged SHA, the exact
-- sandbox Stripe account, an assigned active admin Operator, plan/capacity,
-- provider readiness, and HTTPS reachability without deployment protection.
-- SQL cannot establish those external facts. No live environment is authorized.
--
-- Run the read-only inventory first. If pg_cron alone is missing and its default
-- version is available and reviewed, its separate installation step is:
--   CREATE EXTENSION pg_cron;
-- Do not install/upgrade pg_net or supabase_vault here, or specify VERSION.
-- Re-inventory actual versions, signatures, ACLs and catalog trigger execution
-- after installation. Supabase ignores requested extension versions:
-- https://supabase.com/changelog/extension-version-pinning-ignored
--
-- After preparing and independently verifying access protection, provision
-- PAYMENT_WORKER_SECRET through a protected, parameterized channel into Vault
-- name helix_sandbox_payment_worker_secret and Vercel. It is
-- exactly 32 random bytes encoded as unpadded canonical base64url (43 chars).
-- Never place its value in this file, cron command text, terminal output or logs.
-- The Vault lookup below returns only existence/shape checks to the operator.
-- Decryption still puts plaintext headers in pg_net's queue, so ACL checks and
-- denial probes are required before any call. Also review custom security
-- definers identified by inventory: source matching cannot prove arbitrary
-- dynamic SQL safe. Preserve existing catalog webhooks and their owner grants.
-- The explicit Supabase administration roles below remain trusted. Platform
-- read-only collaborators and replication roles can read secrets by design;
-- this boundary protects application/custom roles, not platform administrators.
-- https://supabase.com/docs/guides/platform/access-control
--
-- This transaction prepares ONE INACTIVE job. It does not call the wrapper.
-- After synthetic denial probes and unchanged catalog delivery have passed,
-- #413 must separately activate the exact inventoried job ID with
-- cron.alter_job(job_id := <verified id>, active := true), then verify a completed
-- worker heartbeat. A successful queue insertion/cron run is not worker proof.

BEGIN;
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '3s';
SET LOCAL search_path = pg_catalog;

DO $preconditions$
BEGIN
  IF current_user <> 'postgres' OR current_database() <> 'postgres' THEN
    RAISE EXCEPTION 'Scheduler preparation requires the verified postgres session';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('helix-sandbox-payment-reconciliation', 0));
  IF (SELECT count(*) FROM pg_extension
      WHERE extname IN ('pg_net', 'supabase_vault', 'pg_cron')) <> 3
    OR to_regclass('net.http_request_queue') IS NULL
    OR to_regclass('net._http_response') IS NULL
    OR to_regclass('vault.secrets') IS NULL
    OR to_regclass('vault.decrypted_secrets') IS NULL
    OR to_regclass('cron.job') IS NULL
    OR to_regclass('cron.job_run_details') IS NULL
    OR to_regclass('net.http_request_queue_id_seq') IS NULL
    OR to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') IS NULL
    OR to_regprocedure('cron.schedule(text,text,text)') IS NULL
    OR to_regprocedure('cron.alter_job(bigint,text,text,text,text,boolean)') IS NULL
    OR to_regprocedure('supabase_functions.http_request()') IS NULL
    OR to_regnamespace('private') IS NULL
  THEN
    RAISE EXCEPTION 'Scheduler extension, relation or function prerequisites are missing';
  END IF;
  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('net.http_post(text,jsonb,jsonb,jsonb,integer)',
        ARRAY['url','body','params','headers','timeout_milliseconds']::text[], 'bigint'::regtype, 4),
      ('supabase_functions.http_request()', NULL::text[], 'trigger'::regtype, 0),
      ('cron.schedule(text,text,text)', ARRAY['job_name','schedule','command']::text[], 'bigint'::regtype, 0),
      ('cron.alter_job(bigint,text,text,text,text,boolean)',
        ARRAY['job_id','schedule','command','database','username','active']::text[], 'void'::regtype, 5)
    ) expected(signature, argument_names, result_type, default_count)
    JOIN pg_proc p ON p.oid = to_regprocedure(expected.signature)
    WHERE p.proargnames IS DISTINCT FROM expected.argument_names
      OR p.prorettype <> expected.result_type OR p.pronargdefaults <> expected.default_count
      OR p.prokind <> 'f' OR p.proretset OR p.provariadic <> 0 OR p.proargmodes IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Scheduler provider function signature differs from the reviewed contract';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
    OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
    OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')
  THEN
    RAISE EXCEPTION 'Expected application database roles are missing';
  END IF;
  IF (SELECT count(*) FROM vault.decrypted_secrets
      WHERE name = 'helix_sandbox_payment_worker_secret') > 1
    OR EXISTS (
      SELECT 1 FROM vault.decrypted_secrets
      WHERE name = 'helix_sandbox_payment_worker_secret'
        AND (decrypted_secret IS NULL
          OR decrypted_secret !~ '^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$')
    )
  THEN
    RAISE EXCEPTION 'Existing scheduler Vault credential is duplicated or malformed';
  END IF;
  -- Do not silently replace a different job or alter an already active worker.
  IF (SELECT count(*) FROM cron.job
      WHERE jobname = 'helix-sandbox-payment-reconciliation') > 1
    OR EXISTS (
      SELECT 1 FROM cron.job
      WHERE (command ~* 'wake_sandbox_payment_worker|/api/internal/payments/reconcile'
        OR jobname = 'helix-sandbox-payment-reconciliation')
        AND (
          jobname = 'helix-sandbox-payment-reconciliation'
          AND username = 'postgres' AND database = 'postgres'
          AND schedule = '* * * * *'
          AND command = 'select private.wake_sandbox_payment_worker();'
          AND nodename = 'localhost' AND nodeport = inet_server_port()
          AND active = false
        ) IS NOT TRUE
    )
  THEN
    RAISE EXCEPTION 'Existing payment scheduler configuration requires reconciliation';
  END IF;
  -- A pre-existing ordinary-role cron job must be reviewed before restricting
  -- cron function grants. This template never disables unrelated jobs.
  IF EXISTS (SELECT 1 FROM cron.job WHERE username IN
    ('anon', 'authenticated', 'service_role', 'catalog_editor', 'catalog_publisher'))
  THEN
    RAISE EXCEPTION 'Existing application-role cron jobs require review';
  END IF;
END;
$preconditions$;

-- Keep provider/internal owners' grants. Remove PUBLIC and direct application
-- grants only; inherited or SET ROLE paths cause the post-check to fail instead
-- of changing memberships or unrelated group privileges.
DO $restrict_access$
DECLARE
  v_role text;
  v_table regclass;
  v_function record;
  v_columns text;
BEGIN
  FOR v_role IN
    SELECT 'PUBLIC'
    UNION ALL SELECT rolname FROM pg_roles
      WHERE rolname IN ('anon', 'authenticated', 'service_role', 'catalog_editor', 'catalog_publisher')
  LOOP
    FOREACH v_table IN ARRAY ARRAY[
      'net.http_request_queue'::regclass, 'net._http_response'::regclass,
      'vault.secrets'::regclass, 'vault.decrypted_secrets'::regclass,
      'cron.job'::regclass, 'cron.job_run_details'::regclass
    ] LOOP
      EXECUTE format('REVOKE ALL ON TABLE %s FROM %s', v_table,
        CASE WHEN v_role = 'PUBLIC' THEN 'PUBLIC' ELSE quote_ident(v_role) END);
      SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum)
        INTO v_columns FROM pg_attribute
        WHERE attrelid = v_table AND attnum > 0 AND NOT attisdropped;
      EXECUTE format('REVOKE SELECT (%1$s), INSERT (%1$s), UPDATE (%1$s), REFERENCES (%1$s) ON TABLE %2$s FROM %3$s',
        v_columns, v_table,
        CASE WHEN v_role = 'PUBLIC' THEN 'PUBLIC' ELSE quote_ident(v_role) END);
    END LOOP;
    EXECUTE format('REVOKE ALL ON SEQUENCE net.http_request_queue_id_seq FROM %s',
      CASE WHEN v_role = 'PUBLIC' THEN 'PUBLIC' ELSE quote_ident(v_role) END);
    EXECUTE format('REVOKE CREATE ON SCHEMA net, vault, cron, private FROM %s',
      CASE WHEN v_role = 'PUBLIC' THEN 'PUBLIC' ELSE quote_ident(v_role) END);
    FOR v_function IN
      SELECT p.oid::regprocedure AS signature
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname IN ('vault', 'cron')
        OR (n.nspname = 'net' AND p.proname IN
          ('http_collect_response', '_http_collect_response', '_await_response'))
    LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s', v_function.signature,
        CASE WHEN v_role = 'PUBLIC' THEN 'PUBLIC' ELSE quote_ident(v_role) END);
    END LOOP;
  END LOOP;
END;
$restrict_access$;

DO $wrapper$
DECLARE
  v_existing record;
  v_body text := $worker$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO STRICT v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'helix_sandbox_payment_worker_secret';
  IF v_secret IS NULL OR v_secret !~ '^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$' THEN
    RAISE EXCEPTION 'Sandbox payment scheduler credential unavailable';
  END IF;
  RETURN net.http_post(
    url := 'https://helixskin.vercel.app/api/internal/payments/reconcile',
    body := '{}'::jsonb,
    params := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 50000
  );
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION USING ERRCODE = '55000',
    MESSAGE = 'Sandbox payment scheduler could not queue a wakeup';
END;
$worker$;
BEGIN
  SELECT p.*, r.rolname AS owner_name INTO v_existing
  FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
  WHERE p.oid = to_regprocedure('private.wake_sandbox_payment_worker()');
  IF FOUND THEN
    IF v_existing.prosrc <> v_body OR v_existing.prosecdef
      OR v_existing.owner_name <> 'postgres'
      OR v_existing.prorettype <> 'bigint'::regtype
      OR v_existing.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']::text[]
      OR v_existing.prolang <> (SELECT oid FROM pg_language WHERE lanname = 'plpgsql')
    THEN
      RAISE EXCEPTION 'Existing payment scheduler wrapper differs from the reviewed contract';
    END IF;
  ELSE
    EXECUTE format('CREATE FUNCTION private.wake_sandbox_payment_worker() RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS %L', v_body);
  END IF;
END;
$wrapper$;

REVOKE ALL ON FUNCTION private.wake_sandbox_payment_worker() FROM PUBLIC;
DO $wrapper_grants$
DECLARE v_role text;
BEGIN
  FOR v_role IN SELECT rolname FROM pg_roles
    WHERE rolname IN ('anon', 'authenticated', 'service_role', 'catalog_editor', 'catalog_publisher')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION private.wake_sandbox_payment_worker() FROM %I', v_role);
  END LOOP;
END;
$wrapper_grants$;
GRANT EXECUTE ON FUNCTION private.wake_sandbox_payment_worker() TO postgres;

DO $verify_access$
DECLARE
  v_role record;
  v_table regclass;
  v_function record;
  v_hook record;
  v_post record;
BEGIN
  -- Unknown non-system roles are not implicitly trusted. Their direct grants
  -- must be reconciled in the reviewed manifest, not removed by this template.
  -- Include composed SET/INHERIT/ADMIN paths, even with NOINHERIT intermediates.
  FOR v_role IN
    WITH RECURSIVE reachable(oid, rolname) AS (
      SELECT oid, rolname FROM pg_roles
      WHERE rolname !~ '^pg_'
        AND rolname NOT IN ('postgres', 'supabase_admin', 'supabase_functions_admin',
          'dashboard_user', 'supabase_auth_admin', 'supabase_storage_admin',
          'supabase_replication_admin', 'supabase_etl_admin', 'supabase_read_only_user')
      UNION
      SELECT target.oid, target.rolname
      FROM reachable source CROSS JOIN pg_roles target
      WHERE pg_has_role(source.oid, target.oid, 'SET')
        OR pg_has_role(source.oid, target.oid, 'USAGE')
        OR pg_has_role(source.oid, target.oid, 'USAGE WITH ADMIN OPTION')
    ) SELECT * FROM reachable
  LOOP
    IF v_role.rolname IN ('postgres', 'supabase_admin', 'supabase_functions_admin',
      'dashboard_user', 'supabase_auth_admin', 'supabase_storage_admin',
      'supabase_replication_admin', 'supabase_etl_admin', 'supabase_read_only_user',
      'pg_read_all_data', 'pg_write_all_data', 'pg_read_server_files',
      'pg_write_server_files', 'pg_execute_server_program')
      OR EXISTS (SELECT 1 FROM pg_roles WHERE oid = v_role.oid AND (rolsuper OR rolcreaterole))
      OR EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.proowner = v_role.oid
          AND (n.nspname IN ('vault', 'cron')
            OR (n.nspname = 'net' AND p.proname IN
              ('http_collect_response', '_http_collect_response', '_await_response'))
            OR p.oid IN ('private.wake_sandbox_payment_worker()'::regprocedure,
            'net.http_post(text,jsonb,jsonb,jsonb,integer)'::regprocedure,
            'supabase_functions.http_request()'::regprocedure))
      )
      OR EXISTS (
        SELECT 1 FROM pg_class WHERE relowner = v_role.oid AND oid IN (
          'net.http_request_queue'::regclass, 'net._http_response'::regclass,
          'net.http_request_queue_id_seq'::regclass, 'vault.secrets'::regclass,
          'vault.decrypted_secrets'::regclass, 'cron.job'::regclass, 'cron.job_run_details'::regclass)
      )
      OR EXISTS (
        SELECT 1 FROM pg_namespace WHERE nspowner = v_role.oid
          AND nspname IN ('private', 'net', 'vault', 'cron', 'supabase_functions')
      )
    THEN RAISE EXCEPTION 'An application role can reach a privileged scheduler owner';
    END IF;
    FOREACH v_table IN ARRAY ARRAY[
      'net.http_request_queue'::regclass, 'net._http_response'::regclass,
      'vault.secrets'::regclass, 'vault.decrypted_secrets'::regclass,
      'cron.job'::regclass, 'cron.job_run_details'::regclass
    ] LOOP
      IF has_table_privilege(v_role.oid, v_table, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        OR has_any_column_privilege(v_role.oid, v_table, 'SELECT,INSERT,UPDATE,REFERENCES')
      THEN RAISE EXCEPTION 'An application role retains protected scheduler data privileges';
      END IF;
    END LOOP;
    IF has_sequence_privilege(v_role.oid, 'net.http_request_queue_id_seq', 'USAGE,SELECT,UPDATE')
      OR has_schema_privilege(v_role.oid, 'net', 'CREATE')
      OR has_schema_privilege(v_role.oid, 'vault', 'CREATE')
      OR has_schema_privilege(v_role.oid, 'cron', 'CREATE')
      OR has_schema_privilege(v_role.oid, 'private', 'CREATE')
      OR has_schema_privilege(v_role.oid, 'supabase_functions', 'CREATE')
    THEN RAISE EXCEPTION 'An application role retains scheduler mutation privileges';
    END IF;
    FOR v_function IN
      SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname IN ('vault', 'cron')
        OR (n.nspname = 'net' AND p.proname IN
          ('http_collect_response', '_http_collect_response', '_await_response'))
        OR p.oid = 'private.wake_sandbox_payment_worker()'::regprocedure
    LOOP
      IF has_function_privilege(v_role.oid, v_function.oid, 'EXECUTE') THEN
        RAISE EXCEPTION 'An application role retains sensitive scheduler function privileges';
      END IF;
    END LOOP;
    IF EXISTS (
      WITH RECURSIVE dependent_views(oid) AS (
        SELECT unnest(ARRAY['net.http_request_queue'::regclass::oid,
          'net._http_response'::regclass::oid, 'vault.secrets'::regclass::oid,
          'vault.decrypted_secrets'::regclass::oid, 'cron.job'::regclass::oid,
          'cron.job_run_details'::regclass::oid])
        UNION
        SELECT rewrite.ev_class FROM dependent_views parent
        JOIN pg_depend dependency ON dependency.refclassid = 'pg_class'::regclass
          AND dependency.refobjid = parent.oid AND dependency.classid = 'pg_rewrite'::regclass
        JOIN pg_rewrite rewrite ON rewrite.oid = dependency.objid
      )
      SELECT 1 FROM dependent_views dependency JOIN pg_class relation ON relation.oid = dependency.oid
      WHERE relation.relkind IN ('v', 'm')
        AND (has_table_privilege(v_role.oid, relation.oid, 'SELECT,INSERT,UPDATE,DELETE')
          OR has_any_column_privilege(v_role.oid, relation.oid, 'SELECT,INSERT,UPDATE'))
    ) THEN RAISE EXCEPTION 'An application role can access a view of scheduler data';
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE p.prosecdef AND has_function_privilege(v_role.oid, p.oid, 'EXECUTE')
        AND p.prosrc ~* 'vault|http_request_queue|_http_response|http_collect_response|wake_sandbox_payment_worker'
        AND p.oid IS DISTINCT FROM to_regprocedure('net.http_get(text,jsonb,jsonb,integer)')
        AND p.oid IS DISTINCT FROM to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)')
        AND p.oid IS DISTINCT FROM to_regprocedure('net.http_delete(text,jsonb,jsonb,integer,jsonb)')
    ) THEN RAISE EXCEPTION 'An accessible security definer references scheduler data';
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM pg_proc p CROSS JOIN LATERAL
      aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    WHERE p.oid = 'private.wake_sandbox_payment_worker()'::regprocedure
      AND acl.grantee <> (SELECT oid FROM pg_roles WHERE rolname = 'postgres')
  ) THEN RAISE EXCEPTION 'Scheduler wrapper has an unexpected execute grantee';
  END IF;
  SELECT p.* INTO STRICT v_hook FROM pg_proc p
    WHERE p.oid = 'supabase_functions.http_request()'::regprocedure;
  SELECT p.* INTO STRICT v_post FROM pg_proc p
    WHERE p.oid = 'net.http_post(text,jsonb,jsonb,jsonb,integer)'::regprocedure;
  IF NOT v_hook.prosecdef OR NOT v_post.prosecdef
    OR v_hook.proconfig IS DISTINCT FROM ARRAY['search_path=supabase_functions']::text[]
    OR v_post.proconfig IS DISTINCT FROM ARRAY['search_path=net']::text[]
    OR NOT has_schema_privilege(v_hook.proowner, 'net', 'USAGE')
    OR NOT has_function_privilege(v_hook.proowner, v_post.oid, 'EXECUTE')
    OR NOT has_table_privilege(v_post.proowner, 'net.http_request_queue', 'INSERT')
    OR NOT has_column_privilege(v_post.proowner, 'net.http_request_queue', 'id', 'SELECT')
    OR NOT has_sequence_privilege(v_post.proowner, 'net.http_request_queue_id_seq', 'USAGE')
    OR NOT has_function_privilege('postgres', v_post.oid, 'EXECUTE')
    OR NOT has_table_privilege('postgres', 'vault.decrypted_secrets', 'SELECT')
  THEN
    RAISE EXCEPTION 'Scheduler hardening did not preserve catalog/provider execution privileges';
  END IF;
END;
$verify_access$;

DO $prepare_job$
DECLARE v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id FROM cron.job
  WHERE jobname = 'helix-sandbox-payment-reconciliation';
  IF NOT FOUND THEN
    v_job_id := cron.schedule('helix-sandbox-payment-reconciliation', '* * * * *',
      'select private.wake_sandbox_payment_worker();');
    -- Both operations commit together: the worker never observes an active job.
    PERFORM cron.alter_job(job_id := v_job_id, active := false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobid = v_job_id
    AND jobname = 'helix-sandbox-payment-reconciliation'
    AND username = 'postgres' AND database = 'postgres' AND active = false
    AND schedule = '* * * * *'
    AND command = 'select private.wake_sandbox_payment_worker();'
    AND nodename = 'localhost' AND nodeport = inet_server_port())
  THEN RAISE EXCEPTION 'Prepared scheduler job did not match its inactive contract';
  END IF;
END;
$prepare_job$;
COMMIT;
