-- Disposable PG17 fixtures only. Run the first section before installing P4,
-- then the second section on the same committed data using the native runner.
\if :preinstall
CREATE SCHEMA proof;
CREATE FUNCTION proof.check(ok boolean, reason text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION '%',reason; END IF; END $$;
CREATE FUNCTION proof.hash(seed text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(sha256(convert_to(seed,'UTF8')),'hex')
$$;
CREATE FUNCTION proof.request(label text, seed text, qualified boolean) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  t timestamptz := clock_timestamp();
  payload jsonb := jsonb_build_object('version',1,'keyId','synthetic-v1','requestId',gen_random_uuid(),
    'issuedAt',private.production_marketing_iso(t),'expiresAt',private.production_marketing_iso(t+interval '24 hours'),
    'iv',repeat('A',16),'tag',repeat('A',22),'ciphertext','AAAA');
  ok boolean;
BEGIN
  IF qualified THEN
    SELECT public.request_qualified_production_marketing_subscription(proof.hash(delivery_contract_text),repeat('b',64),
      label||'@example.invalid',proof.hash(seed||'-c'),proof.hash(seed||'-p'),proof.hash(seed||'-r'),true,'production_welcome_v1',payload)
    INTO ok FROM private.production_marketing_controls WHERE singleton;
  ELSE
    ok := public.request_production_marketing_subscription(label||'@example.invalid',proof.hash(seed||'-c'),proof.hash(seed||'-p'),
      proof.hash(seed||'-r'),true,'production_welcome_v1',payload);
  END IF;
  PERFORM proof.check(ok,'synthetic consent request failed');
END $$;
CREATE FUNCTION proof.confirmed(label text, seed text, qualified boolean) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE id uuid;
BEGIN
  PERFORM proof.request(label,seed,qualified);
  PERFORM proof.check(public.confirm_production_marketing_subscription(proof.hash(seed||'-c')),'synthetic confirmation failed');
  SELECT m.id INTO STRICT id FROM private.production_marketing_messages m
    JOIN private.production_marketing_subscribers s ON s.id=m.subscriber_id AND s.generation=m.generation
    WHERE s.normalized_email=label||'@example.invalid' AND m.purpose='welcome';
  RETURN id;
END $$;
UPDATE private.production_marketing_controls SET enrollment_enabled=true,dispatch_enabled=true,
  daily_limit=100, monthly_limit=500, status_enabled=true, delivery_contract_text='{"from":"news@helixskin.us","replyTo":"support@helixskin.us"}';
UPDATE private.production_marketing_controls SET confirmation_worker_binding_hash=repeat('b',64);
INSERT INTO public.admin_memberships VALUES('00000000-0000-4000-8000-000000000597','admin',true);
SELECT proof.confirmed('old-confirmed','old-confirmed',true);
SELECT proof.request('old-pending','old-pending',true);
\else
SELECT proof.check((SELECT NOT native_welcome_enabled FROM private.production_marketing_controls),'fresh P4 native control off');
SELECT proof.check((SELECT bool_and(transport='raw_email') FROM private.production_marketing_messages),'P4 keeps existing messages raw');
SELECT proof.check(public.confirm_production_marketing_subscription(proof.hash('old-pending-c')),'preinstall consent still confirms');
SELECT proof.check((SELECT count(*)=2 AND bool_and(transport='raw_email') FROM private.production_marketing_messages WHERE purpose='welcome'),
  'a legacy generation confirmed after installation keeps its original transport');
SELECT proof.confirmed('legacy-new','legacy-new',false);
SELECT proof.check((SELECT count(*)=3 AND bool_and(transport='raw_email') FROM private.production_marketing_messages WHERE purpose='welcome'),
  'retained direct 7-arg consent remains raw');
UPDATE private.production_marketing_messages SET state='cancelled' WHERE state='held';
SELECT proof.confirmed('paused-generation','paused-generation',true);
SELECT proof.check((SELECT count(*)=1 FROM private.production_marketing_messages WHERE transport='native_event' AND state='native_queued'),
  'new qualified generation retains its native destination through rollback');
CREATE FUNCTION proof.reserve_rows() RETURNS TABLE(intent_id uuid,attempt_id uuid,recipient text,reserved_at timestamptz)
LANGUAGE sql AS $$
  SELECT * FROM helix_welcome_worker.reserve(repeat('c',64),'prj_native597','dpl_native597',repeat('d',40))
$$;
SELECT proof.check(NOT EXISTS(SELECT FROM proof.reserve_rows()),'native rollback pause holds new intents');
SELECT proof.check(public.claim_production_marketing_message(gen_random_uuid()) IS NULL,'retained raw worker cannot drain native pause backlog');
CREATE FUNCTION proof.config() RETURNS void LANGUAGE sql AS $$
  UPDATE private.production_marketing_controls SET native_welcome_enabled=true,native_welcome_contract_hash=repeat('c',64),
    native_welcome_publisher_project_id='prj_native597',native_welcome_publisher_deployment_id='dpl_native597',
    native_welcome_publisher_git_sha=repeat('d',40),native_welcome_qualified_until=clock_timestamp()+interval '1 hour'
  WHERE singleton
$$;
SELECT proof.config();
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('a','prj_native597','dpl_native597','d'),('c','prj_other','dpl_native597','d'),
    ('c','prj_native597','dpl_other','d'),('c','prj_native597','dpl_native597','e')
  ) AS x(contract,project,deployment,sha) LOOP
    PERFORM proof.check(NOT EXISTS(SELECT FROM helix_welcome_worker.reserve(repeat(r.contract,64),r.project,r.deployment,repeat(r.sha,40))),
      'unqualified production worker could reserve');
  END LOOP;
END $$;
SELECT proof.check(NOT EXISTS(SELECT FROM private.production_marketing_quota_reservations),'wrong runtime identity cannot spend quota');
BEGIN;
UPDATE private.production_marketing_controls SET native_welcome_qualified_until=clock_timestamp()-interval '1 second';
SELECT proof.check(NOT EXISTS(SELECT FROM proof.reserve_rows()),'expired qualification blocks new work');
ROLLBACK;

DO $$ DECLARE a record; BEGIN
  SELECT * INTO STRICT a FROM proof.reserve_rows();
  PERFORM proof.check(a.recipient='paused-generation@example.invalid' AND a.reserved_at IS NOT NULL AND a.attempt_id IS NOT NULL,'worker gets exactly its recipient and admission identity');
  PERFORM proof.check(public.claim_production_marketing_message(gen_random_uuid()) IS NULL
    AND public.prepare_production_marketing_message(a.intent_id,a.attempt_id,'{}',NULL,repeat('c',64)) IS NULL
    AND public.retry_production_marketing_message(a.intent_id,a.attempt_id,repeat('c',64)) IS NULL
    AND NOT public.finish_production_marketing_message(a.intent_id,a.attempt_id,'accepted',gen_random_uuid()),
    'a native attempt cannot act as a raw worker lease');
  PERFORM proof.check(NOT helix_welcome_worker.finish(a.intent_id,gen_random_uuid(),'submitted'),'wrong attempt cannot finish');
  UPDATE private.production_marketing_controls SET native_welcome_enabled=false;
  PERFORM proof.check(helix_welcome_worker.finish(a.intent_id,a.attempt_id,'submitted'),'record provider 202 while dispatch paused');
  PERFORM proof.check((SELECT state='native_submitted' AND provider_id IS NULL AND body_text IS NULL AND delivery_status<>'delivered'
    FROM private.production_marketing_messages WHERE id=a.intent_id), 'submission does not claim delivery');
  PERFORM proof.check(helix_welcome_worker.finish(a.intent_id,a.attempt_id,'submitted')
    AND NOT helix_welcome_worker.finish(a.intent_id,a.attempt_id,'unknown'),'duplicate finish is idempotent and cannot replace its recorded outcome');
  PERFORM proof.check(NOT EXISTS(SELECT FROM proof.reserve_rows()),'submitted intent cannot be reclaimed');
END $$;
SELECT proof.config();

BEGIN;
-- More native rows than the old worker's claim page. Exercise real consent and
-- confirmation and keep each synthetic request under the historical global cap.
DO $$ DECLARE i int; label text; lease uuid:=gen_random_uuid(); legacy uuid; data jsonb; BEGIN
  FOR i IN 1..35 LOOP
    label := 'batch-'||i;
    IF i IN (1,20) THEN DELETE FROM private.production_marketing_request_limits WHERE kind='global'; END IF;
    PERFORM proof.confirmed(label,label,true);
  END LOOP;
  UPDATE private.production_marketing_controls SET native_welcome_enabled=false;
  legacy:=proof.confirmed('raw-after-backlog','raw-after-backlog',false);
  data:=public.claim_production_marketing_message(lease);
  PERFORM proof.check((data->>'id')::uuid=legacy,'native backlog larger than 32 cannot starve rollback worker');
  PERFORM proof.check(NOT helix_welcome_worker.finish(legacy,lease,'submitted'),'raw lease cannot finish a native attempt');
END $$;
ROLLBACK;

BEGIN;
DO $$ DECLARE a record; BEGIN
  PERFORM proof.confirmed('timeout','timeout',true);
  SELECT * INTO STRICT a FROM proof.reserve_rows();
  PERFORM proof.check(helix_welcome_worker.finish(a.intent_id,a.attempt_id,'unknown'),'timeout recorded');
  PERFORM proof.check((SELECT state='native_unknown' AND provider_id IS NULL AND body_text IS NULL FROM private.production_marketing_messages WHERE id=a.intent_id),'timeout remains ambiguous');
  PERFORM proof.check((public.read_production_marketing_status('00000000-0000-4000-8000-000000000597')->>'uncertainMessages')::integer=1,'staff can see ambiguous attempt');
  PERFORM proof.check(NOT EXISTS(SELECT FROM proof.reserve_rows()),'timeout does not issue replacement');
END $$;
ROLLBACK;

-- Suppression, superseded consent and old idle intents cannot cost quota.
BEGIN;
DO $$ DECLARE prior bigint; BEGIN
  SELECT count(*) INTO prior FROM private.production_marketing_quota_reservations;
  PERFORM proof.confirmed('suppressed','suppressed',true);
  INSERT INTO private.production_marketing_suppressions(subscriber_id,reason)
    SELECT id,'complained' FROM private.production_marketing_subscribers WHERE normalized_email='suppressed@example.invalid';
  PERFORM proof.confirmed('renewed','renewed-1',true);
  PERFORM proof.check(public.withdraw_production_marketing_subscription(proof.hash('renewed-1-p')),'withdraw first generation');
  PERFORM proof.request('renewed','renewed-2',true);
  ALTER TABLE private.production_marketing_messages ALTER COLUMN created_at SET DEFAULT (clock_timestamp()-interval '25 hours');
  PERFORM proof.confirmed('expired','expired',true);
  PERFORM proof.check(NOT EXISTS(SELECT FROM proof.reserve_rows()),'suppressed, superseded, and expired candidates stay inert');
  PERFORM proof.check((SELECT count(*)=prior FROM private.production_marketing_quota_reservations),'ineligible candidates cannot spend quota');
END $$;
ROLLBACK;

-- Frozen raw/native history two, four and six days ago isolates the seven-day
-- cap from the independent 24-hour cap. New admission uses the real reserve RPC.
BEGIN;
DO $$ DECLARE i int; seed text; message uuid; stamp timestamptz; prior bigint; BEGIN
  FOR i IN 1..3 LOOP
    seed := 'weekly-'||i;
    message := proof.confirmed('weekly',seed,i=2);
    stamp := clock_timestamp() - make_interval(days=>2*i);
    IF i=2 THEN
      UPDATE private.production_marketing_messages SET state='native_reserved',native_attempt_id=gen_random_uuid(),
        first_prepared_at=stamp,last_admitted_at=stamp,contract_hash=repeat('c',64) WHERE id=message;
    ELSE
      UPDATE private.production_marketing_messages SET state='accepted',
        first_prepared_at=stamp,last_admitted_at=stamp,provider_id=gen_random_uuid() WHERE id=message;
    END IF;
    PERFORM proof.check(public.withdraw_production_marketing_subscription(proof.hash(seed||'-p')),'end past generation');
  END LOOP;
  DELETE FROM private.production_marketing_request_limits WHERE kind='address' AND key='weekly@example.invalid';
  PERFORM proof.confirmed('weekly','weekly-now',true);
  SELECT count(*) INTO prior FROM private.production_marketing_quota_reservations;
  PERFORM proof.check(NOT EXISTS(SELECT FROM proof.reserve_rows()),'three mixed transport promotions in seven days hold a fourth');
  PERFORM proof.check((SELECT count(*)=prior FROM private.production_marketing_quota_reservations),'weekly cap leaks no quota');
END $$;
ROLLBACK;

-- Exercise the retained prepare RPC with a valid P2 welcome payload. A malformed
-- payload would mask cross-transport frequency or UTC quota regressions.
CREATE FUNCTION proof.prepare_raw(id uuid, lease uuid, label text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE token text:=rtrim(translate(encode(sha256(convert_to(id::text,'UTF8')),'base64'),'+/','-_'),'=');
  body jsonb:=jsonb_build_object('from','news@helixskin.us','to',jsonb_build_array(label||'@example.invalid'),
    'reply_to','support@helixskin.us','subject','Synthetic welcome','text','Synthetic welcome','html','<p>Synthetic welcome</p>',
    'headers',jsonb_build_object('List-Unsubscribe','<https://www.helixskin.us/api/marketing/production/unsubscribe?token='||token||'>','List-Unsubscribe-Post','List-Unsubscribe=One-Click'),
    'tags',jsonb_build_array(jsonb_build_object('name','environment','value','production'),jsonb_build_object('name','helix_message_id','value',id),
      jsonb_build_object('name','helix_purpose','value','welcome'),jsonb_build_object('name','helix_contract','value','production_welcome_delivery_v1')));
BEGIN
  RETURN public.prepare_production_marketing_message(id,lease,body::text,proof.hash(token),
    (SELECT proof.hash(delivery_contract_text) FROM private.production_marketing_controls WHERE singleton));
END $$;
BEGIN;
DO $$ DECLARE id uuid; lease uuid:=gen_random_uuid(); charged bigint; BEGIN
  id:=proof.confirmed('raw-first','raw-first-1',false);
  PERFORM proof.check((public.claim_production_marketing_message(lease)->>'id')::uuid=id,'real raw worker acquired old transport');
  PERFORM proof.check(proof.prepare_raw(id,lease,'raw-first') IS NOT NULL,'raw welcome passed P2 admission');
  SELECT count(*) INTO charged FROM private.production_marketing_quota_reservations;
  PERFORM proof.check(public.withdraw_production_marketing_subscription(proof.hash('raw-first-1-p')),'withdraw old raw consent');
  PERFORM proof.confirmed('raw-first','raw-first-2',true);
  PERFORM proof.check(NOT EXISTS(SELECT FROM proof.reserve_rows()),'an admitted raw welcome caps a new native generation');
  PERFORM proof.check((SELECT count(*)=charged FROM private.production_marketing_quota_reservations),'blocked native frequency check leaked no quota');
END $$;
ROLLBACK;

BEGIN;
DO $$ DECLARE id uuid; lease uuid:=gen_random_uuid(); charged bigint; BEGIN
  id:=proof.confirmed('native-first','native-first-1',true);
  PERFORM proof.check((SELECT intent_id=id FROM proof.reserve_rows()),'native welcome admitted before rollover');
  SELECT count(*) INTO charged FROM private.production_marketing_quota_reservations;
  PERFORM proof.check(public.withdraw_production_marketing_subscription(proof.hash('native-first-1-p')),'withdraw old native consent');
  id:=proof.confirmed('native-first','native-first-2',false);
  PERFORM proof.check((public.claim_production_marketing_message(lease)->>'id')::uuid=id,'raw generation eligible for legacy claim');
  PERFORM proof.check(proof.prepare_raw(id,lease,'native-first') IS NULL,'a native reservation caps a later raw generation');
  PERFORM proof.check((SELECT count(*)=charged FROM private.production_marketing_quota_reservations),'blocked raw frequency check leaked no quota');
END $$;
ROLLBACK;

BEGIN;
DO $$ DECLARE id uuid; lease uuid:=gen_random_uuid(); used_before bigint; BEGIN
  SELECT coalesce(sum(used),0) INTO used_before FROM private.production_marketing_quota_counters WHERE kind='day' AND period=(clock_timestamp() AT TIME ZONE 'UTC')::date;
  UPDATE private.production_marketing_controls SET daily_limit=used_before+1 WHERE singleton;
  id:=proof.confirmed('raw-quota','raw-quota',false);
  PERFORM proof.check((public.claim_production_marketing_message(lease)->>'id')::uuid=id,'claim raw quota fixture');
  PERFORM proof.check(proof.prepare_raw(id,lease,'raw-quota') IS NOT NULL,'raw consumes last daily slot');
  id:=proof.confirmed('native-quota','native-quota',true);
  PERFORM proof.check(NOT EXISTS(SELECT FROM proof.reserve_rows()) AND NOT EXISTS(
    SELECT FROM private.production_marketing_quota_reservations WHERE message_id=id),'native observes shared quota across recipients');
  UPDATE private.production_marketing_controls SET daily_limit=daily_limit+1 WHERE singleton;
  PERFORM proof.check((SELECT intent_id=id FROM proof.reserve_rows()),'quota-held native intent is recoverable');
END $$;
ROLLBACK;
\endif
