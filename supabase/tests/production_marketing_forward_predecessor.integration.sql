-- psql -XAtq -v ON_ERROR_STOP=1 -v marketing_predecessor_phase=seed|snapshot|withdraw
-- Use the same snapshot query on either side of the protected forward migration.
SELECT :'marketing_predecessor_phase'='seed' AS seed,
       :'marketing_predecessor_phase'='snapshot' AS snapshot,
       :'marketing_predecessor_phase'='withdraw' AS withdraw
\gset
BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $target$
BEGIN
  IF current_database() !~ '^helix_bootstrap_fresh_[ab]_[a-f0-9]{12}$'
    OR inet_server_addr() IS NOT NULL OR session_user<>'postgres' OR current_user<>session_user
    OR NOT EXISTS (SELECT FROM ONLY private.helix_environment WHERE singleton
       AND environment='development' AND project_ref='zyfkunnpnlmgvrojmrbg') THEN
    RAISE EXCEPTION 'Expected the local disposable development-shaped database';
  END IF;
END;
$target$;

\if :seed
DO $seed$
DECLARE
  kind text;
  issued timestamptz;
  envelope jsonb;
  confirmation_hash text;
  preference_hash text;
BEGIN
  IF to_regclass('private.production_marketing_messages') IS NOT NULL
    OR NOT EXISTS (SELECT FROM private.production_marketing_controls WHERE singleton AND NOT enrollment_enabled AND NOT dispatch_enabled)
    OR EXISTS (SELECT FROM private.production_marketing_subscribers)
    OR EXISTS (SELECT FROM private.production_marketing_request_limits) THEN
    RAISE EXCEPTION 'Expected original paused consent schema with an empty synthetic audience';
  END IF;
  -- Admission is temporarily open only inside this local transaction. The
  -- dispatch control stays off and the original P1 schema has no delivery worker.
  UPDATE private.production_marketing_controls SET enrollment_enabled=true WHERE singleton;
  SET LOCAL ROLE service_role;
  FOREACH kind IN ARRAY ARRAY['pending','confirmed'] LOOP
    issued:=clock_timestamp();
    confirmation_hash:=CASE kind WHEN 'pending' THEN repeat('1',64) ELSE repeat('3',64) END;
    preference_hash:=CASE kind WHEN 'pending' THEN repeat('2',64) ELSE repeat('4',64) END;
    envelope:=jsonb_build_object('version',1,'keyId','synthetic-598','requestId',gen_random_uuid(),
      'issuedAt',to_char(issued,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'expiresAt',to_char(issued+interval '24 hours','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'iv',repeat('A',16),'tag',repeat('A',22),'ciphertext','AAAA');
    IF public.request_production_marketing_subscription('fixture-598-'||kind||'@example.invalid',
      confirmation_hash,preference_hash,repeat('5',64),true,'production_welcome_v1',envelope)
      IS DISTINCT FROM true THEN RAISE EXCEPTION 'Original request rejected synthetic fixture'; END IF;
  END LOOP;
  IF public.confirm_production_marketing_subscription(repeat('3',64)) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Original confirmation rejected its own issued capability';
  END IF;
  SET LOCAL ROLE postgres;
  UPDATE private.production_marketing_controls SET enrollment_enabled=false WHERE singleton;
END;
$seed$;
SELECT true;

\elif :snapshot
DO $shape$
BEGIN
  IF NOT EXISTS (SELECT FROM private.production_marketing_controls WHERE singleton AND NOT enrollment_enabled AND NOT dispatch_enabled)
    OR (SELECT count(*) FROM private.production_marketing_subscribers)<>2
    OR (SELECT count(*) FROM private.production_marketing_generations)<>2
    OR (SELECT count(*) FROM private.production_marketing_evidence)<>3
    OR (SELECT count(*) FROM private.production_marketing_confirmation_intents)<>2
    OR NOT EXISTS (SELECT FROM private.production_marketing_confirmation_intents WHERE state='held' AND delivery_payload IS NOT NULL)
    OR NOT EXISTS (SELECT FROM private.production_marketing_confirmation_intents WHERE state='cancelled' AND delivery_payload IS NULL)
    OR (SELECT sum(issued) FROM private.production_marketing_request_limits) IS DISTINCT FROM 6::bigint THEN
    RAISE EXCEPTION 'Expected both original consent histories and their issuance budgets';
  END IF;
END;
$shape$;
-- Hash every retained original field, including keys, token hashes, timestamps,
-- and the opaque held envelope. New controls have independent paused defaults.
WITH original_rows(relation_name,fact) AS (
  SELECT 'controls',jsonb_build_array(singleton,enrollment_enabled,dispatch_enabled) FROM private.production_marketing_controls
  UNION ALL SELECT 'subscribers',to_jsonb(s) FROM private.production_marketing_subscribers s
  UNION ALL SELECT 'generations',to_jsonb(g) FROM private.production_marketing_generations g
  UNION ALL SELECT 'evidence',to_jsonb(e) FROM private.production_marketing_evidence e
  UNION ALL SELECT 'confirmation_intents',to_jsonb(i) FROM private.production_marketing_confirmation_intents i
  UNION ALL SELECT 'request_limits',to_jsonb(l) FROM private.production_marketing_request_limits l
)
SELECT encode(sha256(convert_to(jsonb_agg(jsonb_build_array(relation_name,fact)
  ORDER BY relation_name COLLATE "C",fact::text COLLATE "C")::text,'UTF8')),'hex') FROM original_rows;

\elif :withdraw
DO $withdraw$
BEGIN
  IF NOT EXISTS (SELECT FROM private.production_marketing_controls WHERE singleton AND NOT enrollment_enabled
    AND NOT dispatch_enabled AND NOT native_welcome_enabled AND NOT events_enabled AND NOT status_enabled
    AND daily_limit=0 AND monthly_limit=0)
    OR EXISTS (SELECT FROM private.production_marketing_messages)
    OR EXISTS (SELECT FROM private.production_marketing_native_generations) THEN
    RAISE EXCEPTION 'Forward installation must stay paused without adopting old consent for delivery';
  END IF;
  SET LOCAL ROLE service_role;
  IF public.confirm_production_marketing_subscription(repeat('1',64)) IS DISTINCT FROM false
    OR public.withdraw_production_marketing_subscription(repeat('6',64)) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Paused confirmation or an unissued withdrawal capability was accepted';
  END IF;
  -- The old confirmed preference and pending confirmation token both retain
  -- restriction authority while paused. Repeating either must be idempotent.
  IF public.withdraw_production_marketing_subscription(repeat('4',64)) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Original confirmed preference did not withdraw'; END IF;
  IF public.withdraw_production_marketing_subscription(repeat('4',64)) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Original preference could not be retried'; END IF;
  IF public.withdraw_production_marketing_subscription(repeat('1',64)) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Original pending capability did not withdraw'; END IF;
  IF public.withdraw_production_marketing_subscription(repeat('1',64)) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Original pending capability could not be retried'; END IF;
  SET LOCAL ROLE postgres;
  IF (SELECT count(*) FROM private.production_marketing_evidence)<>5
    OR (SELECT count(*) FROM private.production_marketing_evidence WHERE event='withdrawn')<>2
    OR (SELECT count(*) FROM private.production_marketing_subscribers
        WHERE state='withdrawn' AND generation=1 AND
        ((normalized_email='fixture-598-pending@example.invalid' AND revision=2)
         OR (normalized_email='fixture-598-confirmed@example.invalid' AND revision=3)))<>2
    OR (SELECT count(*) FROM private.production_marketing_confirmation_intents WHERE state='cancelled' AND delivery_payload IS NULL)<>2
    OR EXISTS (SELECT FROM private.production_marketing_messages)
    OR EXISTS (SELECT FROM private.production_marketing_native_generations)
    OR EXISTS (SELECT FROM private.production_marketing_quota_reservations)
    OR EXISTS (SELECT FROM private.production_marketing_events)
    OR EXISTS (SELECT FROM private.production_marketing_native_receipts) THEN
    RAISE EXCEPTION 'Original withdrawal must append exactly one fact per person and enqueue no work';
  END IF;
END;
$withdraw$;
SELECT true;
\else
DO $$ BEGIN RAISE EXCEPTION 'Unknown marketing predecessor fixture phase'; END $$;
\endif
COMMIT;
