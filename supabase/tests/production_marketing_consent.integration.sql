-- Synthetic envelope only; cryptographic validity is verified separately through the real handler.
CREATE FUNCTION public.test_envelope() RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('version',1,'keyId','synthetic-v1','requestId',gen_random_uuid(),
    'issuedAt',to_char(t AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'expiresAt',to_char((t+interval '24 hours') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'iv',repeat('A',16),'tag',repeat('A',22),'ciphertext','AAAA') FROM (SELECT clock_timestamp() t) q;
$$;
CREATE FUNCTION public.test_assert(ok boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION '%',message; END IF; END $$;
SELECT public.test_assert((SELECT NOT enrollment_enabled AND NOT dispatch_enabled FROM private.production_marketing_controls),'fresh controls off');
SELECT public.test_assert((SELECT count(*)=0 FROM private.production_marketing_subscribers),'fresh state empty');
SELECT public.test_assert(NOT public.request_production_marketing_subscription('disabled@example.invalid',repeat('a',64),repeat('b',64),repeat('c',64),true,'production_welcome_v1',public.test_envelope()),'default off admission');
UPDATE private.production_marketing_controls SET enrollment_enabled=true;
SET ROLE service_role;
SELECT public.test_assert(NOT public.request_production_marketing_subscription('one@example.invalid',repeat('a',64),repeat('b',64),repeat('c',64),false,'production_welcome_v1',public.test_envelope()),'unchecked consent rejected');
SELECT public.test_assert(NOT public.request_production_marketing_subscription('one@example.invalid',repeat('a',64),repeat('b',64),repeat('c',64),true,'lifecycle_v1',public.test_envelope()),'scope cannot broaden');
SELECT public.test_assert(public.request_production_marketing_subscription(' ONE@EXAMPLE.INVALID ',repeat('a',64),repeat('b',64),repeat('c',64),true,'production_welcome_v1',public.test_envelope()),'explicit request admitted');
SELECT public.test_assert(NOT public.request_production_marketing_subscription('one@example.invalid',repeat('d',64),repeat('e',64),repeat('c',64),true,'production_welcome_v1',public.test_envelope()),'one outstanding generation');
RESET ROLE;
SELECT public.test_assert((SELECT normalized_email='one@example.invalid' AND state='pending' FROM private.production_marketing_subscribers),'normalized private pending consent');
SELECT public.test_assert((SELECT count(*)=1 AND bool_and(state='held') FROM private.production_marketing_confirmation_intents),'one held intent');
SELECT public.test_assert((SELECT count(*)=1 FROM private.production_marketing_evidence),'request records immutable evidence');
SET ROLE service_role;
SELECT public.test_assert(public.confirm_production_marketing_subscription(repeat('a',64)),'explicit confirmation works');
SELECT public.test_assert(public.confirm_production_marketing_subscription(repeat('a',64)),'repeated confirmation idempotent');
RESET ROLE;
SELECT public.test_assert((SELECT count(*)=0 FROM private.production_marketing_confirmation_intents WHERE state='held'),'confirmed consent cancels obsolete held confirmation');
SELECT public.test_assert((SELECT state='confirmed' AND revision=2 FROM private.production_marketing_subscribers),'confirm advances revision once');
SELECT public.test_assert((SELECT count(*)=1 FROM private.production_marketing_evidence WHERE event='confirmed'),'single confirmation evidence');
UPDATE private.production_marketing_controls SET enrollment_enabled=false;
SET ROLE service_role;
SELECT public.test_assert(public.withdraw_production_marketing_subscription(repeat('b',64)),'no-login capability withdrawal while paused');
SELECT public.test_assert(public.withdraw_production_marketing_subscription(repeat('b',64)),'repeated withdrawal idempotent');
SELECT public.test_assert(NOT public.confirm_production_marketing_subscription(repeat('a',64)),'stale confirmation cannot undo withdrawal');
RESET ROLE;
SELECT public.test_assert((SELECT state='withdrawn' AND revision=3 FROM private.production_marketing_subscribers),'withdraw advances revision once');
SELECT public.test_assert((SELECT count(*)=1 FROM private.production_marketing_evidence WHERE event='withdrawn'),'single withdrawal evidence');
UPDATE private.production_marketing_controls SET enrollment_enabled=true;
SET ROLE service_role;
SELECT public.test_assert(public.request_production_marketing_subscription('one@example.invalid',repeat('d',64),repeat('e',64),repeat('c',64),true,'production_welcome_v1',public.test_envelope()),'fresh explicit request after withdrawal');
SELECT public.test_assert(NOT public.confirm_production_marketing_subscription(repeat('a',64)),'old generation remains fenced');
SELECT public.test_assert(public.withdraw_production_marketing_subscription(repeat('a',64)),'old confirmation capability can restrict current pending generation');
SELECT public.test_assert(NOT public.confirm_production_marketing_subscription(repeat('d',64)),'withdraw beats pending current confirmation');
RESET ROLE;
-- Check real role grants, not just mocked client behavior.
DO $$ DECLARE role_name text; fn text; t text; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    FOREACH fn IN ARRAY ARRAY['request_production_marketing_subscription(text,text,text,text,boolean,text,jsonb)',
      'confirm_production_marketing_subscription(text)','withdraw_production_marketing_subscription(text)'] LOOP
      PERFORM public.test_assert(NOT has_function_privilege(role_name,'public.'||fn,'EXECUTE'),'public role cannot execute production RPC');
    END LOOP;
  END LOOP;
  FOREACH t IN ARRAY ARRAY['controls','subscribers','generations','evidence','confirmation_intents','request_limits'] LOOP
    PERFORM public.test_assert((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid=('private.production_marketing_'||t)::regclass),'forced RLS on every production table');
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      PERFORM public.test_assert(NOT has_table_privilege(role_name,'private.production_marketing_'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'),'no direct table grants');
    END LOOP;
  END LOOP;
END $$;
SET ROLE anon;
DO $$ BEGIN
  BEGIN PERFORM public.confirm_production_marketing_subscription(repeat('a',64)); RAISE EXCEPTION 'anon executed RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM public.withdraw_production_marketing_subscription(repeat('b',64)); RAISE EXCEPTION 'authenticated executed RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET ROLE service_role;
DO $$ BEGIN
  BEGIN UPDATE private.production_marketing_subscribers SET state='confirmed'; RAISE EXCEPTION 'service bypassed narrow RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
-- Even an accidental read grant cannot expose rows to ordinary authenticated users.
BEGIN;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT SELECT ON private.production_marketing_subscribers TO authenticated;
SET LOCAL ROLE authenticated;
SELECT public.test_assert((SELECT count(*)=0 FROM private.production_marketing_subscribers),'RLS denies rows independently of grants');
ROLLBACK;

-- Expiry is checked against database time, and changing scope is not a caller option.
SELECT public.request_production_marketing_subscription('expired@example.invalid',repeat('1',64),repeat('2',64),repeat('3',64),true,'production_welcome_v1',public.test_envelope());
UPDATE private.production_marketing_generations SET expires_at=clock_timestamp()-interval '1 second' WHERE confirmation_hash=repeat('1',64);
SELECT public.test_assert(NOT public.confirm_production_marketing_subscription(repeat('1',64)),'expired confirmation denied');
SELECT public.test_assert(public.withdraw_production_marketing_subscription(repeat('1',64)),'expired confirmation still allows withdrawal');
SELECT public.test_assert((SELECT bool_and(scope='welcome_only' AND wording_version='production_welcome_v1') FROM private.production_marketing_generations),'immutable narrowly scoped generations');
SELECT public.test_assert((SELECT bool_and(expires_at-requested_at=interval '24 hours') FROM private.production_marketing_generations WHERE confirmation_hash<>repeat('1',64)),'24 hour issuance expiry');

-- Exact finite issuance limits; same-address reconsent cannot bypass the daily cap.
DELETE FROM private.production_marketing_request_limits;
DO $$ DECLARE n integer; ch text; ph text; BEGIN
  FOR n IN 1..4 LOOP
    ch:=md5('address-confirm-'||n)||md5('address-confirm-'||n);
    ph:=md5('address-preference-'||n)||md5('address-preference-'||n);
    PERFORM public.test_assert(public.request_production_marketing_subscription('limited@example.invalid',ch,ph,repeat('3',64),true,'production_welcome_v1',public.test_envelope())=(n<=3),'address capped at three/day');
    PERFORM public.withdraw_production_marketing_subscription(ph);
  END LOOP;
END $$;
DELETE FROM private.production_marketing_request_limits;
DO $$ DECLARE n integer; ch text; ph text; BEGIN
  FOR n IN 1..11 LOOP
    ch:=md5('ip-confirm-'||n)||md5('ip-confirm-'||n);
    ph:=md5('ip-preference-'||n)||md5('ip-preference-'||n);
    PERFORM public.test_assert(public.request_production_marketing_subscription('ip-'||n||'@example.invalid',ch,ph,repeat('4',64),true,'production_welcome_v1',public.test_envelope())=(n<=10),'requester capped at ten/hour');
  END LOOP;
END $$;
DELETE FROM private.production_marketing_request_limits;
DO $$ DECLARE n integer; ch text; ph text; BEGIN
  FOR n IN 1..31 LOOP
    ch:=md5('global-confirm-'||n)||md5('global-confirm-'||n);
    ph:=md5('global-preference-'||n)||md5('global-preference-'||n);
    PERFORM public.test_assert(public.request_production_marketing_subscription('global-'||n||'@example.invalid',ch,ph,md5('requester-'||n)||md5('requester-'||n),true,'production_welcome_v1',public.test_envelope())=(n<=30),'global capped at thirty/hour');
  END LOOP;
END $$;
DELETE FROM private.production_marketing_request_limits;

-- C1 rejects malformed/broadened envelopes without persisting an issuance.
DELETE FROM private.production_marketing_request_limits;
DO $$ DECLARE envelope jsonb; bad jsonb; n integer:=0; original_count bigint; BEGIN
  envelope:=public.test_envelope();
  SELECT count(*) INTO original_count FROM private.production_marketing_subscribers;
  FOR bad IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
    NULL, '[]'::jsonb, '1'::jsonb, envelope-'tag', envelope||'{"extra":true}', envelope||'{"version":2}',
    envelope||'{"keyId":"../unsafe"}', envelope||'{"requestId":"not-uuid"}',
    envelope||'{"issuedAt":"2020-01-01T00:00:00.000Z","expiresAt":"2020-01-02T00:00:00.000Z"}',
    envelope||jsonb_build_object('expiresAt',envelope->>'issuedAt'),
    envelope||'{"iv":"AAAAAAAAAAAAAAA="}', envelope||'{"tag":"AAAAAAAAAAAAAAAAAAAAAB"}',
    envelope||'{"ciphertext":"A"}', envelope||'{"ciphertext":"AB"}',
    envelope||jsonb_build_object('ciphertext',repeat('A',8200)), envelope||'{"keyId":null}'
  )) LOOP
    n:=n+1;
    PERFORM public.test_assert(NOT public.request_production_marketing_subscription('bad-'||n||'@example.invalid',
      md5('bad-confirm-'||n)||md5('bad-confirm-'||n),md5('bad-preference-'||n)||md5('bad-preference-'||n),repeat('9',64),true,'production_welcome_v1',bad),'invalid envelope rejected');
  END LOOP;
  PERFORM public.test_assert((SELECT count(*)=original_count FROM private.production_marketing_subscribers),'invalid envelopes create no private subscriber');
  PERFORM public.test_assert(public.request_production_marketing_subscription('envelope@example.invalid',repeat('5',64),repeat('6',64),repeat('7',64),true,'production_welcome_v1',envelope),'valid envelope admitted');
  PERFORM public.test_assert(NOT public.request_production_marketing_subscription('replayed@example.invalid',repeat('8',64),repeat('9',64),repeat('7',64),true,'production_welcome_v1',envelope),'request UUID cannot be rebound');
END $$;
SELECT public.test_assert((SELECT i.request_revision=g.request_revision AND i.expires_at=g.expires_at
  AND i.request_id::text=i.delivery_payload->>'requestId'
  FROM private.production_marketing_confirmation_intents i JOIN private.production_marketing_generations g USING(subscriber_id,generation)
  WHERE g.confirmation_hash=repeat('5',64)),'envelope atomically bound to exact generation/revision/expiry');
SELECT public.test_assert(NOT has_function_privilege('anon','public.cleanup_production_marketing_confirmation_intents()','EXECUTE')
  AND NOT has_function_privilege('authenticated','public.cleanup_production_marketing_confirmation_intents()','EXECUTE'),'cleanup service-only');
UPDATE private.production_marketing_confirmation_intents SET expires_at=clock_timestamp()-interval '1 second' WHERE request_id IN (
  SELECT request_id FROM private.production_marketing_confirmation_intents i JOIN private.production_marketing_generations g USING(subscriber_id,generation) WHERE g.confirmation_hash=repeat('5',64));
SET ROLE service_role;
SELECT public.test_assert(public.cleanup_production_marketing_confirmation_intents()=1,'expiry cleanup erases one expired envelope');
SELECT public.test_assert(public.cleanup_production_marketing_confirmation_intents()=0,'cleanup idempotent');
RESET ROLE;
SELECT public.test_assert((SELECT bool_and(delivery_payload IS NULL) FROM private.production_marketing_confirmation_intents WHERE state='cancelled'),'every cancelled envelope physically erased');
DELETE FROM private.production_marketing_request_limits;
-- Superseding an expired pending generation clears its old held payload atomically.
SELECT public.request_production_marketing_subscription('supersede@example.invalid',repeat('0',64),repeat('f',64),repeat('7',64),true,'production_welcome_v1',public.test_envelope());
UPDATE private.production_marketing_generations SET expires_at=clock_timestamp()-interval '1 second' WHERE confirmation_hash=repeat('0',64);
SELECT public.test_assert(public.request_production_marketing_subscription('supersede@example.invalid',repeat('a',63)||'0',repeat('b',63)||'0',repeat('7',64),true,'production_welcome_v1',public.test_envelope()),'expired pending issuance may be explicitly superseded');
SELECT public.test_assert((SELECT i.state='cancelled' AND i.delivery_payload IS NULL
  FROM private.production_marketing_confirmation_intents i JOIN private.production_marketing_generations g USING(subscriber_id,generation)
  WHERE g.confirmation_hash=repeat('0',64)),'superseding clears old encrypted payload');
SELECT public.test_assert((SELECT i.state='cancelled' AND i.delivery_payload IS NULL
  FROM private.production_marketing_confirmation_intents i JOIN private.production_marketing_generations g USING(subscriber_id,generation)
  WHERE g.confirmation_hash=repeat('1',64)),'expired confirmation path clears encrypted payload');
DELETE FROM private.production_marketing_request_limits;
