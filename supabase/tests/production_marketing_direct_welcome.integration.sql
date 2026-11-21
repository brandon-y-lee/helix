-- This fixture runs only in the labeled networkless PG17 created by the runner.
-- Keep real P1 consent and raw leases across installation of the direct package.
\if :legacy
CREATE SCHEMA proof;
CREATE FUNCTION proof.check(ok boolean, reason text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION '%',reason; END IF; END $$;
CREATE FUNCTION proof.hash(s text) RETURNS text LANGUAGE sql IMMUTABLE RETURN encode(sha256(convert_to(s,'UTF8')),'hex');
CREATE FUNCTION proof.topic() RETURNS uuid LANGUAGE sql IMMUTABLE RETURN 'aca091c7-8da7-440e-8761-e6a549c60aa5'::uuid;
CREATE FUNCTION proof.contract() RETURNS text LANGUAGE sql IMMUTABLE RETURN jsonb_build_object(
  'version','production_welcome_delivery_v1','from','hello@helixskin.us','replyTo','hello@helixskin.us','topicId',proof.topic(),
  'postalAddress','Synthetic fixture address','templateHash',repeat('f',64))::text;
CREATE FUNCTION proof.iso(t timestamptz) RETURNS text LANGUAGE sql IMMUTABLE
  RETURN to_char(t AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
CREATE FUNCTION proof.envelope() RETURNS jsonb LANGUAGE sql VOLATILE RETURN jsonb_build_object(
  'version',1,'keyId','fixture','requestId',gen_random_uuid(),'issuedAt',proof.iso(statement_timestamp()),
  'expiresAt',proof.iso(statement_timestamp()+interval '24 hours'),'iv',repeat('A',16),'tag',repeat('A',22),'ciphertext','AAAA');
CREATE FUNCTION proof.preference_token(id uuid) RETURNS text LANGUAGE sql IMMUTABLE RETURN
  rtrim(translate(encode(sha256(convert_to('fixture-'||id,'UTF8')),'base64'),'+/','-_'),'=');
CREATE FUNCTION proof.body(id uuid, address text, direct boolean DEFAULT true) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('from','hello@helixskin.us','to',jsonb_build_array(address),'reply_to','hello@helixskin.us',
    'subject','Welcome to Helix','text','Preferences: '||preferences,'html','<a href="'||preferences||'">Preferences</a>',
    'headers',jsonb_build_object('List-Unsubscribe','<https://www.helixskin.us/api/marketing/production/unsubscribe?token='||token||'>',
      'List-Unsubscribe-Post','List-Unsubscribe=One-Click'),
    'tags',jsonb_build_array(jsonb_build_object('name','environment','value','production'),jsonb_build_object('name','helix_message_id','value',id),
      jsonb_build_object('name','helix_purpose','value','welcome'),jsonb_build_object('name','helix_contract','value','production_welcome_delivery_v1')))
    || CASE WHEN direct THEN jsonb_build_object('topic_id',proof.topic()) ELSE '{}'::jsonb END
  FROM (SELECT proof.preference_token(id) AS token) t, LATERAL (SELECT 'https://www.helixskin.us/marketing/production/preferences#token='||token AS preferences) p
$$;
CREATE FUNCTION proof.original_request(label text) RETURNS boolean LANGUAGE sql VOLATILE AS $$
  SELECT public.request_production_marketing_subscription(label||'@example.invalid',proof.hash(label||'-c'),
    proof.hash(label||'-p'),proof.hash(label||'-r'),true,'production_welcome_v1',proof.envelope())
$$;
UPDATE private.production_marketing_controls SET enrollment_enabled=true,dispatch_enabled=true,events_enabled=true,daily_limit=100,monthly_limit=1000,
  delivery_contract_text=proof.contract(),confirmation_worker_binding_hash=repeat('b',64);
CREATE TABLE proof.before_direct (id uuid PRIMARY KEY,lease uuid NOT NULL,prepared jsonb NOT NULL);
DO $$ DECLARE label text; msg jsonb; lease uuid; id uuid; frozen jsonb; BEGIN
  FOREACH label IN ARRAY ARRAY['legacy-accepted','legacy-prepared'] LOOP
    PERFORM proof.check(proof.original_request(label),'original P1 request');
    PERFORM proof.check(public.confirm_production_marketing_subscription(proof.hash(label||'-c')),'original confirmation');
    lease:=gen_random_uuid(); msg:=public.claim_production_marketing_message(lease); id:=(msg->>'id')::uuid;
    PERFORM proof.check(msg->>'email'=label||'@example.invalid' AND msg->>'purpose'='welcome','original raw claim');
    frozen:=public.prepare_production_marketing_message(id,lease,proof.body(id,msg->>'email',false)::text,
      proof.hash(proof.preference_token(id)),proof.hash(proof.contract()));
    PERFORM proof.check(frozen IS NOT NULL,'original P2 frozen preparation');
    INSERT INTO proof.before_direct VALUES(id,lease,frozen);
    IF label='legacy-accepted' THEN
      PERFORM proof.check(public.finish_production_marketing_message(id,lease,'accepted','00000000-0000-4000-8000-000000000611'),'original P3 accepted');
    END IF;
  END LOOP;
  PERFORM proof.check(proof.original_request('legacy-pending'),'retained pending link');
END $$;
-- Installing an additive package must not itself turn on any existing control.
UPDATE private.production_marketing_controls SET enrollment_enabled=false,dispatch_enabled=false,events_enabled=false,status_enabled=false;
\else
CREATE FUNCTION proof.ready(binding text DEFAULT repeat('b',64)) RETURNS boolean LANGUAGE sql STABLE
  RETURN public.production_marketing_enrollment_ready(proof.hash(proof.contract()),binding);
CREATE FUNCTION proof.request(label text) RETURNS boolean LANGUAGE sql VOLATILE AS $$
  SELECT public.request_qualified_production_marketing_subscription(proof.hash(proof.contract()),repeat('b',64),
    label||'@example.invalid',proof.hash(label||'-c'),proof.hash(label||'-p'),proof.hash(label||'-r'),
    true,'production_welcome_v1',proof.envelope())
$$;
CREATE FUNCTION proof.preference(id text,kind text,label text,denied boolean DEFAULT false,topics uuid[] DEFAULT '{}',
  ambiguous boolean DEFAULT false,at_time timestamptz DEFAULT statement_timestamp()) RETURNS text LANGUAGE sql VOLATILE AS $$
  SELECT public.record_direct_production_marketing_preference(id,kind,at_time,label||'@example.invalid',denied,topics,ambiguous)
$$;
CREATE FUNCTION proof.denial(label text) RETURNS text LANGUAGE sql VOLATILE AS $$
  SELECT proof.preference('denial-'||label,'contact.updated',label,true)
$$;
CREATE TABLE proof.races (id uuid PRIMARY KEY, label text UNIQUE NOT NULL, lease uuid NOT NULL, frozen jsonb, admitted_at timestamptz);
CREATE FUNCTION proof.handoff(id uuid,label text,phase text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE lease_id uuid;
BEGIN
  SELECT r.lease INTO STRICT lease_id FROM proof.races r WHERE r.id=handoff.id AND r.label=handoff.label;
  IF phase='first' THEN
    RETURN public.prepare_direct_production_marketing_message(id,lease_id,proof.body(id,label||'@example.invalid')::text,
      proof.hash(proof.preference_token(id)),proof.hash(proof.contract()),repeat('b',64));
  ELSIF phase='retry' THEN
    RETURN public.retry_direct_production_marketing_message(id,lease_id,proof.hash(proof.contract()),repeat('b',64));
  END IF;
  RAISE EXCEPTION 'Unsupported fixture phase';
END $$;
CREATE FUNCTION proof.seed_lease(label text,phase text) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  current_lease uuid:=gen_random_uuid(); item jsonb; message_id uuid; original jsonb; previously_admitted timestamptz;
BEGIN
  PERFORM proof.check(proof.request(label),'fresh qualified request');
  PERFORM proof.check(public.confirm_production_marketing_subscription(proof.hash(label||'-c')),'explicit confirmed state');
  item:=public.claim_direct_production_marketing_message(current_lease,proof.hash(proof.contract()),repeat('b',64));
  PERFORM proof.check(item->>'email'=label||'@example.invalid' AND item->>'purpose'='welcome' AND (item->>'direct')::boolean,'only fresh direct welcome selected');
  message_id:=(item->>'id')::uuid;
  INSERT INTO proof.races VALUES(message_id,label,current_lease,NULL,NULL);
  IF phase='retry' THEN
    original:=proof.handoff(message_id,label,'first');
    PERFORM proof.check(original IS NOT NULL,'frozen first handoff before lost response');
    PERFORM proof.check(public.finish_production_marketing_message(message_id,current_lease,'uncertain',NULL),'record lost response');
    UPDATE private.production_marketing_messages m SET next_attempt_at=statement_timestamp() WHERE m.id=message_id
      RETURNING last_admitted_at INTO previously_admitted;
    current_lease:=gen_random_uuid();
    item:=public.claim_direct_production_marketing_message(current_lease,proof.hash(proof.contract()),repeat('b',64));
    PERFORM proof.check((item->>'id')::uuid=message_id AND item->'prepared'->>'idempotencyKey'=original->>'idempotencyKey',
      'lost raw response reclaims the same logical message');
    UPDATE proof.races r SET lease=current_lease,frozen=original,admitted_at=previously_admitted WHERE r.id=message_id;
  END IF;
  RETURN message_id;
END $$;
CREATE FUNCTION proof.verify_race(id uuid,label text,phase text,deny_first boolean) RETURNS void LANGUAGE plpgsql AS $$
DECLARE msg private.production_marketing_messages%ROWTYPE; r proof.races%ROWTYPE; reservations integer;
BEGIN
  SELECT * INTO STRICT msg FROM private.production_marketing_messages m WHERE m.id=verify_race.id;
  SELECT * INTO STRICT r FROM proof.races p WHERE p.id=verify_race.id;
  SELECT count(*) INTO reservations FROM private.production_marketing_quota_reservations q WHERE q.message_id=verify_race.id;
  PERFORM proof.check((SELECT s.state='withdrawn' FROM private.production_marketing_subscribers s WHERE s.id=msg.subscriber_id),'concurrent signed withdrawal persisted');
  PERFORM proof.check(proof.handoff(id,label,phase) IS NULL,'no later provider handoff');
  IF phase='first' AND deny_first THEN
    PERFORM proof.check(reservations=0 AND msg.first_prepared_at IS NULL AND msg.body_hash IS NULL,'deny preceding preparation spends no quota');
  ELSE
    PERFORM proof.check(reservations=2 AND msg.first_prepared_at IS NOT NULL AND msg.body_hash=proof.hash(msg.body_text)
      AND msg.idempotency_key='production-marketing/'||id,'prior admission remains one frozen logical send');
    IF phase='retry' THEN
      PERFORM proof.check(msg.body_text=r.frozen->>'body' AND msg.idempotency_key=r.frozen->>'idempotencyKey'
        AND CASE WHEN deny_first THEN msg.last_admitted_at=r.admitted_at ELSE msg.last_admitted_at>r.admitted_at END,'same-id retry respects order and bytes');
    END IF;
  END IF;
END $$;
GRANT USAGE ON SCHEMA proof TO service_role;
GRANT SELECT ON proof.races TO service_role;

SELECT proof.check(NOT proof.ready(),'direct package initially closed');
SELECT proof.check((SELECT count(*)=2 FROM proof.before_direct b JOIN private.production_marketing_messages m USING(id)
  WHERE m.body_text=b.prepared->>'body' AND m.idempotency_key=b.prepared->>'idempotencyKey'
    AND m.body_hash=proof.hash(m.body_text) AND (SELECT count(*) FROM private.production_marketing_quota_reservations q WHERE q.message_id=m.id)=2),
  'earlier prepared/accepted message identities and quota survived');
SELECT proof.check((SELECT bool_and(direct_subject IS NULL) FROM private.production_marketing_generations),'prior consent retains its original cohort');
SELECT proof.check(NOT EXISTS(SELECT FROM private.production_marketing_direct_denials)
  AND NOT EXISTS(SELECT FROM private.production_marketing_direct_receipts),'no synthetic or imported contact state on install');
DO $$ DECLARE role_name text; fn regprocedure; BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.claim_direct_production_marketing_message(uuid,text,text)'::regprocedure,
    'public.prepare_direct_production_marketing_message(uuid,uuid,text,text,text,text)'::regprocedure,
    'public.retry_direct_production_marketing_message(uuid,uuid,text,text)'::regprocedure,
    'public.record_direct_production_marketing_preference(text,text,timestamptz,text,boolean,uuid[],boolean)'::regprocedure,
    'public.hold_direct_production_marketing_receipt(text,uuid,uuid)'::regprocedure,
    'public.read_direct_production_marketing_status(uuid)'::regprocedure
  ] LOOP
    PERFORM proof.check(has_function_privilege('service_role',fn,'EXECUTE'),'dedicated service grant missing');
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated','unexpected'] LOOP
      PERFORM proof.check(NOT has_function_privilege(role_name,fn,'EXECUTE'),'unexpected direct RPC grant');
    END LOOP;
  END LOOP;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role','unexpected'] LOOP
    PERFORM proof.check(NOT has_table_privilege(role_name,'private.production_marketing_direct_lookup_key','SELECT,INSERT,UPDATE,DELETE')
      AND NOT has_table_privilege(role_name,'private.production_marketing_direct_denials','SELECT,INSERT,UPDATE,DELETE')
      AND NOT has_table_privilege(role_name,'private.production_marketing_direct_receipts','SELECT,INSERT,UPDATE,DELETE')
      AND NOT has_table_privilege(role_name,'private.production_marketing_direct_policy','SELECT,INSERT,UPDATE,DELETE'),
      'direct operational state is private');
    PERFORM proof.check(NOT has_function_privilege(role_name,'private.production_marketing_import_direct_denial(text,text)','EXECUTE')
      AND NOT has_column_privilege(role_name,'private.production_marketing_direct_lookup_key','secret','SELECT'),
      'baseline importer and secret remain exclusively owner-controlled');
  END LOOP;
END $$;

-- Open the proven receiver independently of enrollment or dispatch.
UPDATE private.production_marketing_controls SET events_enabled=true;
SELECT proof.check(proof.preference('before-site','contact.created','no-local-row',true)='applied','signed global denial before first signup');
SELECT proof.check(proof.preference('before-topic','contact.topics.updated','no-topic',false,ARRAY[proof.topic()])='applied','signed Topic denial before first signup');
SELECT proof.check(NOT EXISTS(SELECT FROM private.production_marketing_subscribers WHERE normalized_email IN ('no-local-row@example.invalid','no-topic@example.invalid'))
  AND (SELECT count(*)=2 AND bool_and(octet_length(subject)=32) FROM private.production_marketing_direct_denials),
  'unknown recipient creates only a keyed negative');
UPDATE private.production_marketing_direct_policy SET intake_evidence_sha256=repeat('c',64),baseline_evidence_sha256=repeat('b',64);
UPDATE private.production_marketing_controls SET enrollment_enabled=true,dispatch_enabled=true;
SELECT proof.check(NOT proof.ready(),'unknown provider Topic default closes enrollment');
UPDATE private.production_marketing_direct_policy SET topic_default='opt_out';
SELECT proof.check(NOT proof.ready(),'default opt-out closes enrollment');
UPDATE private.production_marketing_direct_policy SET topic_default='opt_in';
SELECT proof.check(proof.ready() AND NOT proof.ready(repeat('e',64)),'only proved Topic default and exact worker binding open signup');
SELECT proof.check(proof.preference('later-positive','contact.updated','no-local-row')='ignored'
  AND proof.preference('later-topic-positive','contact.topics.updated','no-topic')='ignored','later positive observations grant no permission');
SELECT proof.check(NOT proof.request('no-local-row') AND NOT proof.request('no-topic'),'new signup respects preexisting denies after positives');
BEGIN;
SELECT private.production_marketing_import_direct_denial('baseline-only@example.invalid','global');
SELECT private.production_marketing_import_direct_denial('baseline-only@example.invalid','global');
SELECT proof.check(NOT proof.request('baseline-only') AND NOT EXISTS (SELECT FROM private.production_marketing_subscribers WHERE normalized_email='baseline-only@example.invalid')
  AND (SELECT count(*)=3 FROM private.production_marketing_direct_denials),'merging a known negative from the complete baseline is repeatable and creates no person');
ROLLBACK;
SELECT proof.check(NOT EXISTS(SELECT FROM private.production_marketing_subscribers WHERE normalized_email IN ('no-local-row@example.invalid','no-topic@example.invalid')),
  'denied fresh request does not insert a subscriber');

BEGIN;
UPDATE private.production_marketing_controls SET events_enabled=false;
SELECT proof.check(NOT proof.ready(),'stored intake pause closes new signup');
SELECT proof.check(proof.preference('paused','contact.updated','paused-person',true)='paused','stored intake pause is retryable');
SELECT proof.check(NOT EXISTS(SELECT FROM private.production_marketing_direct_receipts WHERE event_id='paused'),'paused callback writes no receipt');
ROLLBACK;
SELECT proof.check(proof.preference('paused','contact.updated','paused-person',true)='applied','same callback after resuming');
SELECT proof.check(proof.preference('wrong-topic','contact.topics.updated','unrelated',false,ARRAY['00000000-0000-4000-8000-000000000611'::uuid])='ignored','irrelevant Topic does not suppress');
BEGIN;
UPDATE private.production_marketing_direct_policy SET intake_evidence_sha256=NULL;
SELECT proof.check(NOT proof.ready() AND public.claim_direct_production_marketing_message(gen_random_uuid(),proof.hash(proof.contract()),repeat('b',64)) IS NULL,
  'unproved intake leaves direct cohort recoverable');
SELECT proof.check(public.withdraw_production_marketing_subscription(proof.hash('legacy-pending-p')),'first-party withdrawal remains available with unproved intake');
ROLLBACK;
SELECT proof.check(public.confirm_production_marketing_subscription(proof.hash('legacy-pending-c')),'original unexpired consent link still works');
SELECT proof.check(public.withdraw_production_marketing_subscription(proof.hash('legacy-pending-p')),'original withdrawal link still works');

-- Reopen using the same persisted lookup after a fresh owner assessment; an
-- opt-out collected before any local account must still block that address.
BEGIN;
UPDATE private.production_marketing_direct_policy SET baseline_evidence_sha256=repeat('d',64),intake_evidence_sha256=repeat('e',64);
SELECT proof.check(proof.ready() AND NOT proof.request('no-local-row') AND NOT proof.request('no-topic'),
  'configuration renewal preserves historical denials across releases');
ROLLBACK;

-- Authorized finish records a response from before the rollout; it never replaces
-- the frozen body or introduces a new message or provider identity.
SELECT proof.check((SELECT public.finish_production_marketing_message(b.id,b.lease,'accepted','00000000-0000-4000-8000-000000000610')
  FROM proof.before_direct b JOIN private.production_marketing_messages m USING(id) WHERE m.state='prepared'),'retained worker can finish its prepared lease');
BEGIN;
DO $$ DECLARE blocked boolean:=false; old_hash bytea; BEGIN
  SELECT sha256(secret) INTO STRICT old_hash FROM private.production_marketing_direct_lookup_key;
  BEGIN UPDATE private.production_marketing_direct_lookup_key SET secret=extensions.gen_random_bytes(32);
  EXCEPTION WHEN OTHERS THEN blocked:=true; END;
  IF blocked THEN
    PERFORM proof.check((SELECT sha256(secret)=old_hash FROM private.production_marketing_direct_lookup_key),'denial key stays immutable');
  ELSE
    PERFORM proof.check(NOT proof.ready(),'accidental key rotation never silently loses earlier unknown-recipient denials');
  END IF;
END $$;
ROLLBACK;

-- Both bounded scans must walk past retained customers before applying the
-- 32-row limit, including confirmation intents still awaiting materialization.
BEGIN;
DO $$ DECLARE sample text; item jsonb; BEGIN
  FOR i IN 1..33 LOOP
    -- The fixture compresses several synthetic issuance hours into one transaction.
    DELETE FROM private.production_marketing_request_limits WHERE kind='global' AND issued>=28;
    sample:='legacy-backlog-'||i;
    PERFORM proof.check(proof.original_request(sample),'legacy issuance before direct queue');
    PERFORM proof.check(public.confirm_production_marketing_subscription(proof.hash(sample||'-c')),'legacy backlog welcome');
    PERFORM proof.check(proof.original_request('legacy-unconfirmed-'||i),'legacy backlog confirmation');
  END LOOP;
  PERFORM proof.check(proof.request('next-direct'),'first direct request behind retained backlog');
  item:=public.claim_direct_production_marketing_message(gen_random_uuid(),proof.hash(proof.contract()),repeat('b',64));
  PERFORM proof.check(item->>'email'='next-direct@example.invalid' AND item->>'purpose'='confirmation','first direct tick passes both legacy queue prefixes');
END $$;
ROLLBACK;

BEGIN;
DO $$ DECLARE observed timestamptz:=clock_timestamp(); BEGIN
  PERFORM proof.check(proof.preference('shared-id','contact.updated','conflict-a',true,at_time=>observed)='applied','first signed fact retained');
  PERFORM proof.check(proof.preference('shared-id','contact.updated','conflict-b',true,at_time=>observed)='held','conflicting signed observation held');
  PERFORM proof.check(NOT proof.ready(),'conflicting signature holds coverage');
  UPDATE private.production_marketing_direct_receipts SET resolved_at=clock_timestamp(),resolution_evidence_sha256=repeat('d',64)
    WHERE coverage_hold AND resolved_at IS NULL;
  PERFORM proof.check(proof.ready(),'reviewed and evidenced resolution restores intake coverage');
  PERFORM proof.check(proof.preference('shared-id','contact.updated','conflict-b',true,at_time=>observed)='duplicate','same resolved conflict deduplicated');
  PERFORM proof.check(proof.ready(),'repeated conflicting signed observation never reopens a resolved hold');
END $$;
ROLLBACK;

CREATE FUNCTION proof.raw_event(event_id text,id uuid,provider uuid,kind text,label text,prior_client boolean DEFAULT false,observed timestamptz DEFAULT clock_timestamp())
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  IF prior_client THEN
    RETURN public.record_production_marketing_event(event_id,id,provider,kind,observed,'hello@helixskin.us',label||'@example.invalid',
      'welcome','production_welcome_delivery_v1','production');
  END IF;
  RETURN public.record_direct_production_marketing_event(event_id,id,provider,kind,observed,'hello@helixskin.us',label||'@example.invalid',
    'welcome','production_welcome_delivery_v1','production');
END $$;

-- Delivery callbacks can beat the provider's asynchronous HTTP response. Only
-- the worker's matching response can turn their proposed ID into a binding.
BEGIN;
DO $$ DECLARE
  msg uuid; lease_id uuid; observed_id uuid:=gen_random_uuid(); returned_id uuid; observed timestamptz; sample text;
BEGIN
  FOREACH sample IN ARRAY ARRAY['positive-matched','positive-mismatched'] LOOP
    msg:=proof.seed_lease(sample,'first');
    SELECT r.lease INTO STRICT lease_id FROM proof.races r WHERE r.id=msg;
    PERFORM proof.check(proof.handoff(msg,sample,'first') IS NOT NULL,'prepare before provider callback');
    observed:=clock_timestamp(); observed_id:=gen_random_uuid();
    PERFORM proof.check(proof.raw_event(sample||'-sent',msg,observed_id,'email.sent',sample,sample='positive-matched',observed)='recorded','early sent durably acknowledged');
    PERFORM proof.check(proof.raw_event(sample||'-delivered',msg,observed_id,'email.delivered',sample,false,observed)='recorded','early delivery durably acknowledged');
    PERFORM proof.check(proof.raw_event(sample||'-sent',msg,observed_id,'email.sent',sample,sample='positive-matched',observed)='recorded','exact early positive replay acknowledged');
    PERFORM proof.check(EXISTS (SELECT FROM private.production_marketing_messages m WHERE m.id=msg AND m.provider_id IS NULL
      AND m.state='prepared' AND NOT m.reconciliation_required AND m.delivery_status='pending'
      AND NOT EXISTS (SELECT FROM private.production_marketing_suppressions s WHERE s.subscriber_id=m.subscriber_id)),
      'early positive observations keep the active lease open without attributing delivery or suppression');
    returned_id:=CASE WHEN sample='positive-matched' THEN observed_id ELSE gen_random_uuid() END;
    PERFORM proof.check(public.finish_production_marketing_message(msg,lease_id,'accepted',returned_id),'record independent HTTP response');
    IF returned_id=observed_id THEN
      PERFORM proof.check(EXISTS (SELECT FROM private.production_marketing_messages m WHERE m.id=msg AND m.provider_id=returned_id
        AND m.state='accepted' AND NOT m.reconciliation_required AND m.delivery_status='delivered'),'matching HTTP identity resolves early sent/delivered facts');
      PERFORM proof.check(proof.raw_event(sample||'-complaint',msg,observed_id,'email.complained',sample)='recorded','later strict complaint acknowledged');
      PERFORM proof.check(EXISTS (SELECT FROM private.production_marketing_messages m JOIN private.production_marketing_suppressions s ON m.subscriber_id=s.subscriber_id
        WHERE m.id=msg AND m.provider_id=returned_id AND m.delivery_status='suppressed' AND s.reason='complained'),'matching identity authorizes the later complaint');
    ELSE
      PERFORM proof.check(EXISTS (SELECT FROM private.production_marketing_messages m WHERE m.id=msg AND m.reconciliation_required
        AND m.provider_id IS DISTINCT FROM observed_id AND m.delivery_status='pending'
        AND NOT EXISTS (SELECT FROM private.production_marketing_suppressions s WHERE s.subscriber_id=m.subscriber_id)),
        'different HTTP identity isolates only that message without positive attribution or suppression');
      PERFORM proof.check(proof.raw_event(sample||'-complaint',msg,observed_id,'email.complained',sample)='recorded','later conflicting complaint durably held');
      PERFORM proof.check(EXISTS (SELECT FROM private.production_marketing_messages m WHERE m.id=msg AND m.reconciliation_required
        AND m.delivery_status='pending' AND NOT EXISTS (SELECT FROM private.production_marketing_suppressions s WHERE s.subscriber_id=m.subscriber_id)),
        'complaint for the conflicting proposed ID does not suppress');
      PERFORM proof.check(proof.ready() AND public.claim_direct_production_marketing_message(gen_random_uuid(),proof.hash(proof.contract()),repeat('b',64)) IS NULL,
        'an isolated ambiguous attempt cannot be replayed or block unrelated enrollments');
    END IF;
  END LOOP;
END $$;
ROLLBACK;

-- An account-level ambiguity can have no corresponding customer or message.
-- The direct report counts it independently; retained callers keep the P3 JSON.
BEGIN;
INSERT INTO public.admin_memberships VALUES
  ('00000000-0000-4000-8000-000000000611','admin',true),
  ('00000000-0000-4000-8000-000000000612','admin',false);
DO $$ DECLARE
  actor uuid:='00000000-0000-4000-8000-000000000611'; old_status jsonb; current_status jsonb; event_name text;
BEGIN
  SET LOCAL ROLE service_role;
  PERFORM proof.check(public.read_direct_production_marketing_status(actor) IS NULL,'stored status pause hides direct report');
  RESET ROLE;
  UPDATE private.production_marketing_controls SET status_enabled=true;
  SET LOCAL ROLE service_role;
  PERFORM proof.check(public.read_direct_production_marketing_status(NULL) IS NULL
    AND public.read_direct_production_marketing_status('00000000-0000-4000-8000-000000000612') IS NULL
    AND public.read_direct_production_marketing_status(gen_random_uuid()) IS NULL,'only current active admins can obtain direct aggregates');
  old_status:=public.read_production_marketing_status(actor);
  current_status:=public.read_direct_production_marketing_status(actor);
  PERFORM proof.check((SELECT count(*)=11 FROM jsonb_object_keys(old_status)) AND NOT old_status?'unresolvedPreferenceHolds'
    AND (SELECT count(*)=12 FROM jsonb_object_keys(current_status)) AND current_status-'unresolvedPreferenceHolds'=old_status
    AND current_status->'unresolvedPreferenceHolds'='0'::jsonb,'new aggregate extends the unchanged P3 contract by one integer');
  FOREACH event_name IN ARRAY ARRAY['unattributed-one','unattributed-two'] LOOP
    PERFORM proof.check(public.record_direct_production_marketing_preference(event_name,'contact.updated',NULL,NULL,true,'{}',true)='held',
      'signed unidentifiable preference is retained for coverage review');
  END LOOP;
  current_status:=public.read_direct_production_marketing_status(actor);
  PERFORM proof.check(current_status=old_status||'{"unresolvedPreferenceHolds":2}'::jsonb
    AND public.read_production_marketing_status(actor)=old_status,'message-free denials are visible without manufacturing uncertain messages');
  RESET ROLE;
  UPDATE private.production_marketing_direct_receipts SET resolved_at=clock_timestamp(),resolution_evidence_sha256=repeat('d',64)
    WHERE event_id='unattributed-one' AND coverage_hold;
  SET LOCAL ROLE service_role;
  PERFORM proof.check(public.read_direct_production_marketing_status(actor)=old_status||'{"unresolvedPreferenceHolds":1}'::jsonb,
    'resolving exactly one receipt reduces the preference hold count exactly once');
  RESET ROLE;
END $$;
ROLLBACK;

-- Keep this collection of deliberately ambiguous messages separate from the
-- independent admission races. All claims, preparations and responses use real RPCs.
BEGIN;
DO $$ DECLARE
  msg uuid; claimed_provider uuid; actual_provider uuid; lease_id uuid; label text;
BEGIN
  FOREACH label IN ARRAY ARRAY['early-marketing','mismatched-id','old-gateway','strict-bound'] LOOP
    msg:=proof.seed_lease(label,'first');
    SELECT r.lease INTO lease_id FROM proof.races r WHERE r.id=msg;
    PERFORM proof.check(proof.handoff(msg,label,'first') IS NOT NULL,'prepare a dedicated raw test message');
    claimed_provider:=gen_random_uuid();
    actual_provider:=CASE WHEN label='mismatched-id' THEN gen_random_uuid() ELSE claimed_provider END;
    IF label<>'early-marketing' THEN
      PERFORM proof.check(public.finish_production_marketing_message(msg,lease_id,'accepted',actual_provider),'real accepted response binds provider ID');
    END IF;
    PERFORM proof.check(proof.raw_event('receipt-'||label,msg,claimed_provider,'email.bounced',label,label='old-gateway')='recorded',
      'signed claimed receipt is durably acknowledged');
    IF label='strict-bound' THEN
      PERFORM proof.check(EXISTS(SELECT FROM private.production_marketing_messages m JOIN private.production_marketing_suppressions s ON s.subscriber_id=m.subscriber_id
        WHERE m.id=msg AND m.provider_id=actual_provider AND m.delivery_status='suppressed'),'strict accepted identity suppresses effective address');
    ELSE
      PERFORM proof.check(EXISTS(SELECT FROM private.production_marketing_messages m WHERE m.id=msg AND m.reconciliation_required AND m.delivery_status<>'suppressed'
        AND m.provider_id IS NOT DISTINCT FROM CASE WHEN label='early-marketing' THEN NULL ELSE actual_provider END)
        AND NOT EXISTS(SELECT FROM private.production_marketing_messages m JOIN private.production_marketing_suppressions s ON s.subscriber_id=m.subscriber_id WHERE m.id=msg),
        'early, mismatched, or unproved shared-mailbox claims preserve established identity without suppression');
    END IF;
  END LOOP;
END $$;
ROLLBACK;

BEGIN;
DO $$ DECLARE msg uuid; lease_id uuid; label text:='body-guard'; ok jsonb; frozen jsonb; BEGIN
  msg:=proof.seed_lease(label,'first');
  SELECT r.lease INTO lease_id FROM proof.races r WHERE r.id=msg;
  ok:=proof.body(msg,label||'@example.invalid');
  PERFORM proof.check(public.prepare_production_marketing_message(msg,lease_id,(ok-'topic_id')::text,
    proof.hash(proof.preference_token(msg)),proof.hash(proof.contract())) IS NULL,'retained worker cannot freeze direct generation');
  PERFORM proof.check(public.prepare_direct_production_marketing_message(msg,lease_id,(ok-'topic_id')::text,
    proof.hash(proof.preference_token(msg)),proof.hash(proof.contract()),repeat('b',64)) IS NULL,'direct welcome requires wire Topic');
  PERFORM proof.check(public.prepare_direct_production_marketing_message(msg,lease_id,(ok||jsonb_build_object('topic_id',gen_random_uuid()))::text,
    proof.hash(proof.preference_token(msg)),proof.hash(proof.contract()),repeat('b',64)) IS NULL,'foreign welcome Topic refused');
  PERFORM proof.check(public.prepare_direct_production_marketing_message(msg,lease_id,ok::text,
    proof.hash(proof.preference_token(msg)),proof.hash(proof.contract()),repeat('a',64)) IS NULL,'stale worker binding cannot release');
  PERFORM proof.check(NOT EXISTS(SELECT FROM private.production_marketing_quota_reservations WHERE message_id=msg),'invalid direct attempts consume no quota');
  -- Simulate a restored database with mismatched private material. Ordinary
  -- controllers cannot change this key. The trusted copy is restored by rollback.
  BEGIN
    SET LOCAL session_replication_role=replica;
    UPDATE private.production_marketing_direct_lookup_key SET secret=extensions.gen_random_bytes(32);
    SET LOCAL session_replication_role=origin;
    PERFORM proof.check(NOT proof.ready() AND proof.handoff(msg,label,'first') IS NULL,'key-commitment mismatch stops signup and claimed direct handoff');
    RAISE SQLSTATE 'P0611';
  EXCEPTION WHEN SQLSTATE 'P0611' THEN NULL; END;
  frozen:=proof.handoff(msg,label,'first');
  PERFORM proof.check(frozen->>'body'=ok::text AND frozen->>'idempotencyKey'='production-marketing/'||msg,'direct provider bytes are exactly the validated payload');
END $$;
ROLLBACK;

\endif
