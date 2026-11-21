-- P5 follows the reviewed consent, delivery, events and native welcome packages.
BEGIN;
SET LOCAL search_path=pg_catalog,pg_temp;
DO $$ BEGIN
  IF current_user<>'postgres' OR NOT EXISTS (SELECT FROM pg_class c JOIN ONLY private.helix_environment e ON c.oid=e.tableoid
      WHERE c.oid='private.helix_environment'::regclass AND c.relowner=current_user::regrole AND c.relrowsecurity
        AND e.singleton AND (e.environment,e.project_ref) IN (('production','erasogmsqpgiirovubjh'),('development','zyfkunnpnlmgvrojmrbg')))
    THEN RAISE EXCEPTION 'Verified Helix owner and target required'; END IF;
END $$;

-- The owner retains previously qualified identities for late signed callbacks.
-- Requalification can extend freshness without changing the meaning of an old hash.
CREATE TABLE private.production_marketing_native_epochs (
  contract_hash text PRIMARY KEY CHECK(contract_hash ~ '^[0-9a-f]{64}$'),
  sender text NOT NULL CHECK(length(sender)<=254 AND sender ~ '^[a-z0-9][a-z0-9._+-]*@([a-z0-9]([a-z0-9-]*[a-z0-9])?[.])*helixskin[.]us$'),
  topic_id uuid NOT NULL
);
CREATE TABLE private.production_marketing_native_policy (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0),
  contract_hash text REFERENCES private.production_marketing_native_epochs(contract_hash),
  evidence_sha256 text CHECK(evidence_sha256 ~ '^[0-9a-f]{64}$'),
  observed_at timestamptz CHECK(isfinite(observed_at)),
  qualified_until timestamptz CHECK(isfinite(qualified_until) AND qualified_until>observed_at),
  confirmation_contract_hash text CHECK(confirmation_contract_hash ~ '^[0-9a-f]{64}$'),
  confirmation_worker_binding_hash text CHECK(confirmation_worker_binding_hash ~ '^[0-9a-f]{64}$'),
  publisher_project_id text CHECK(publisher_project_id ~ '^prj_[A-Za-z0-9]{1,64}$'),
  publisher_deployment_id text CHECK(publisher_deployment_id ~ '^dpl_[A-Za-z0-9]{1,64}$'),
  publisher_git_sha text CHECK(publisher_git_sha ~ '^[0-9a-f]{40}$'),
  daily_limit integer CHECK(daily_limit BETWEEN 1 AND 100000),
  monthly_limit integer CHECK(monthly_limit BETWEEN 1 AND 1000000),
  provider_qualified boolean NOT NULL DEFAULT false,
  routing_qualified boolean NOT NULL DEFAULT false,
  quota_qualified boolean NOT NULL DEFAULT false,
  sender_exclusive boolean NOT NULL DEFAULT false
);
INSERT INTO private.production_marketing_native_policy DEFAULT VALUES;

-- Fingerprints cover the normalized signed observations only. Caller configuration
-- is deliberately excluded so retries across a deployment still identify one event.
CREATE TABLE private.production_marketing_native_receipts (
  event_id text PRIMARY KEY CHECK(event_id ~ '^[A-Za-z0-9_-]{1,200}$'),
  fingerprint text NOT NULL CHECK(fingerprint ~ '^[0-9a-f]{64}$'),
  event_type text NOT NULL CHECK(event_type IN ('contact.updated','contact.topics.updated','email.bounced','email.complained','email.suppressed')),
  occurred_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  outcome text NOT NULL CHECK(outcome IN ('applied','held','ignored')),
  restricted_subscriber_id uuid REFERENCES private.production_marketing_subscribers(id)
);
CREATE INDEX production_marketing_native_restricted_subscribers ON private.production_marketing_native_receipts(restricted_subscriber_id)
  WHERE restricted_subscriber_id IS NOT NULL;
CREATE TABLE private.production_marketing_native_holds (
  event_id text NOT NULL REFERENCES private.production_marketing_native_receipts(event_id),
  fingerprint text NOT NULL CHECK(fingerprint ~ '^[0-9a-f]{64}$'),
  reason text NOT NULL CHECK(reason IN ('invalid_contact_deny','invalid_restrictive_envelope','recipient_ambiguous','ownership_conflict',
    'policy_drift','unbound_recipient','event_id_conflict')),
  held_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(event_id,fingerprint)
);
CREATE TABLE private.production_marketing_native_resolutions (
  event_id text NOT NULL, fingerprint text NOT NULL,
  evidence_sha256 text NOT NULL CHECK(evidence_sha256 ~ '^[0-9a-f]{64}$'),
  resolved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(event_id,fingerprint),
  FOREIGN KEY(event_id,fingerprint) REFERENCES private.production_marketing_native_holds(event_id,fingerprint)
);

CREATE FUNCTION private.production_marketing_keep_callback_fact() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN RAISE EXCEPTION 'Native callback facts are immutable'; END $$;
DO $$ DECLARE tbl text; BEGIN
  FOREACH tbl IN ARRAY ARRAY['production_marketing_native_epochs','production_marketing_native_policy','production_marketing_native_receipts',
    'production_marketing_native_holds','production_marketing_native_resolutions'] LOOP
    EXECUTE format('ALTER TABLE private.%I ENABLE ROW LEVEL SECURITY',tbl);
    EXECUTE format('ALTER TABLE private.%I FORCE ROW LEVEL SECURITY',tbl);
    EXECUTE format('REVOKE ALL ON private.%I FROM PUBLIC,anon,authenticated,service_role,helix_native_welcome_worker',tbl);
    IF tbl<>'production_marketing_native_policy' THEN
      EXECUTE format('CREATE TRIGGER immutable_fact BEFORE UPDATE OR DELETE OR TRUNCATE ON private.%I FOR EACH STATEMENT EXECUTE FUNCTION private.production_marketing_keep_callback_fact()',tbl);
    END IF;
  END LOOP;
END $$;

CREATE FUNCTION private.production_marketing_native_unresolved_holds() RETURNS bigint
LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp RETURN (
  SELECT count(*) FROM private.production_marketing_native_holds h
  WHERE NOT EXISTS (SELECT FROM private.production_marketing_native_resolutions r WHERE (r.event_id,r.fingerprint)=(h.event_id,h.fingerprint))
);
CREATE FUNCTION private.production_marketing_on_native_parent() RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp RETURN EXISTS (
  SELECT FROM ONLY private.helix_environment e JOIN pg_class c ON c.oid=e.tableoid
  WHERE e.singleton AND e.environment='production' AND e.project_ref='erasogmsqpgiirovubjh'
    AND c.relowner=(SELECT oid FROM pg_roles WHERE rolname='postgres') AND c.relrowsecurity
);
CREATE FUNCTION private.production_marketing_native_policy_ready(p_now timestamptz) RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp RETURN EXISTS (
  SELECT FROM private.production_marketing_native_policy q
    JOIN private.production_marketing_controls c ON c.singleton=q.singleton
    JOIN private.production_marketing_native_epochs e ON e.contract_hash=q.contract_hash
  WHERE q.singleton AND private.production_marketing_on_native_parent()
    AND c.native_welcome_enabled AND c.dispatch_enabled AND c.events_enabled
    AND c.native_welcome_qualified_until>p_now AND c.native_welcome_contract_hash=q.contract_hash
    AND (c.native_welcome_publisher_project_id,c.native_welcome_publisher_deployment_id,c.native_welcome_publisher_git_sha)
      =(q.publisher_project_id,q.publisher_deployment_id,q.publisher_git_sha)
    AND (c.daily_limit,c.monthly_limit)=(q.daily_limit,q.monthly_limit)
    AND q.observed_at<=p_now AND q.qualified_until>p_now AND q.evidence_sha256 IS NOT NULL
    AND q.provider_qualified AND q.routing_qualified AND q.quota_qualified AND q.sender_exclusive
    AND q.confirmation_contract_hash=encode(sha256(convert_to(c.delivery_contract_text,'UTF8')),'hex')
    AND q.confirmation_worker_binding_hash=c.confirmation_worker_binding_hash
    AND private.production_marketing_native_unresolved_holds()=0
);
CREATE OR REPLACE FUNCTION public.production_marketing_enrollment_ready(p_contract_hash text,p_worker_binding_hash text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp RETURN EXISTS (
  SELECT FROM private.production_marketing_controls c WHERE c.singleton AND c.enrollment_enabled
    AND c.confirmation_worker_binding_hash=p_worker_binding_hash
    AND encode(sha256(convert_to(c.delivery_contract_text,'UTF8')),'hex')=p_contract_hash
    AND private.production_marketing_native_policy_ready(statement_timestamp())
);

-- Put the gate before any candidate/address lock. The worker's original exact
-- login, parent, SHA, publisher tuple, quotas and checked scan remain intact.
ALTER FUNCTION helix_welcome_worker.reserve(text,text,text,text) RENAME TO production_marketing_p4_reserve;
ALTER FUNCTION helix_welcome_worker.production_marketing_p4_reserve(text,text,text,text) SET SCHEMA private;
REVOKE ALL ON FUNCTION private.production_marketing_p4_reserve(text,text,text,text) FROM PUBLIC,anon,authenticated,service_role,helix_native_welcome_worker;
CREATE FUNCTION helix_welcome_worker.reserve(p_contract_hash text,p_publisher_project_id text,p_publisher_deployment_id text,p_publisher_git_sha text)
RETURNS TABLE(intent_id uuid,attempt_id uuid,recipient text,reserved_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF NOT private.production_marketing_native_caller_authorized() THEN RETURN; END IF;
  PERFORM FROM private.production_marketing_native_policy WHERE singleton FOR SHARE;
  IF FOUND AND private.production_marketing_native_policy_ready(clock_timestamp()) THEN
    RETURN QUERY SELECT * FROM private.production_marketing_p4_reserve(p_contract_hash,p_publisher_project_id,p_publisher_deployment_id,p_publisher_git_sha);
  END IF;
EXCEPTION WHEN SQLSTATE 'P0598' THEN RETURN;
END $$;

-- Recheck freshness at the irreversible reservation after any quota/address wait.
-- Raising inside reserve rolls back the P4 quota insertions in its subtransaction.
CREATE FUNCTION private.production_marketing_verify_native_reservation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF NOT private.production_marketing_native_policy_ready(clock_timestamp()) THEN
    RAISE EXCEPTION 'Native qualification expired' USING ERRCODE='P0598';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER verify_native_reservation BEFORE UPDATE ON private.production_marketing_messages FOR EACH ROW
  WHEN (OLD.state='native_queued' AND NEW.state='native_reserved') EXECUTE FUNCTION private.production_marketing_verify_native_reservation();

-- A sticky restriction also survives explicit retries through an older storefront.
-- The unchanged original P1 function retains its issuance/address lock ordering.
ALTER FUNCTION public.request_production_marketing_subscription(text,text,text,text,boolean,text,jsonb) SET SCHEMA private;
REVOKE ALL ON FUNCTION private.request_production_marketing_subscription(text,text,text,text,boolean,text,jsonb) FROM PUBLIC,anon,authenticated,service_role,helix_native_welcome_worker;
CREATE FUNCTION public.request_production_marketing_subscription(p_email text,p_confirmation_hash text,p_preference_hash text,p_requester_hash text,
  p_explicit_consent boolean,p_wording_version text,p_delivery_payload jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  PERFORM FROM private.production_marketing_native_policy WHERE singleton FOR SHARE;
  IF NOT FOUND OR EXISTS (SELECT FROM private.production_marketing_subscribers s JOIN private.production_marketing_native_receipts r
    ON r.restricted_subscriber_id=s.id WHERE s.normalized_email=lower(btrim(p_email))) THEN RETURN false; END IF;
  RETURN private.request_production_marketing_subscription(p_email,p_confirmation_hash,p_preference_hash,p_requester_hash,
    p_explicit_consent,p_wording_version,p_delivery_payload);
END $$;
ALTER FUNCTION public.request_qualified_production_marketing_subscription(text,text,text,text,text,text,boolean,text,jsonb) SET SCHEMA private;
REVOKE ALL ON FUNCTION private.request_qualified_production_marketing_subscription(text,text,text,text,text,text,boolean,text,jsonb)
  FROM PUBLIC,anon,authenticated,service_role,helix_native_welcome_worker;
CREATE FUNCTION public.request_qualified_production_marketing_subscription(
  p_contract_hash text,p_worker_binding_hash text,p_email text,p_confirmation_hash text,p_preference_hash text,p_requester_hash text,
  p_explicit_consent boolean,p_wording_version text,p_delivery_payload jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE accepted boolean;
BEGIN
  PERFORM FROM private.production_marketing_native_policy WHERE singleton FOR SHARE;
  accepted := private.request_qualified_production_marketing_subscription(p_contract_hash,p_worker_binding_hash,p_email,p_confirmation_hash,
    p_preference_hash,p_requester_hash,p_explicit_consent,p_wording_version,p_delivery_payload);
  IF accepted AND NOT private.production_marketing_native_policy_ready(clock_timestamp()) THEN
    RAISE EXCEPTION 'Enrollment unavailable' USING ERRCODE='55000';
  END IF;
  RETURN accepted;
END $$;

-- Only the verified gateway can supply these normalized, bounded observations.
-- The fingerprint distinguishes conflicting deliveries of the same signed ID.
CREATE FUNCTION public.record_native_welcome_restriction(
  p_contract_hash text,p_event_id text,p_event_type text,p_occurred_at timestamptz,p_sender text,p_recipient text,
  p_global_denied boolean,p_denied_topic_ids uuid[],p_ambiguity text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET timezone='UTC' AS $$
DECLARE
  policy private.production_marketing_native_policy%ROWTYPE;
  controls_digest text;
  receive_enabled boolean;
  observed_digest text;
  original_digest text;
  held_reason text := p_ambiguity;
  subscriber private.production_marketing_subscribers%ROWTYPE;
  authoritative boolean;
  known_sender boolean;
  known_topic boolean;
  applicable boolean := false;
  result text;
  mailbox text;
BEGIN
  IF NOT private.production_marketing_on_native_parent() THEN
    RAISE EXCEPTION 'Native callback target unavailable' USING ERRCODE='55000';
  END IF;
  IF p_event_id IS NULL OR p_event_id !~ '^[a-zA-Z0-9_-]{1,200}$' OR p_event_type IS NULL
    OR p_event_type NOT IN ('contact.updated','contact.topics.updated','email.bounced','email.complained','email.suppressed')
    OR p_global_denied IS NULL OR p_denied_topic_ids IS NULL OR cardinality(p_denied_topic_ids)>100
    OR coalesce(array_ndims(p_denied_topic_ids),1)<>1
    OR (SELECT count(DISTINCT t) FROM unnest(p_denied_topic_ids) t)<>cardinality(p_denied_topic_ids)
    OR p_ambiguity NOT IN ('invalid_contact_deny','invalid_restrictive_envelope','recipient_ambiguous','ownership_conflict')
    OR (p_occurred_at IS NULL AND p_ambiguity IS NULL) OR NOT isfinite(p_occurred_at)
    OR (p_contract_hash IS NOT NULL AND p_contract_hash !~ '^[0-9a-f]{64}$') THEN
    RAISE EXCEPTION 'Invalid native callback observation' USING ERRCODE='22023';
  END IF;
  FOREACH mailbox IN ARRAY ARRAY[p_sender,p_recipient] LOOP
    IF mailbox IS NOT NULL AND (length(mailbox)>254 OR mailbox<>lower(mailbox)
       OR mailbox !~ '^[^[:space:][:cntrl:]@,<>]+@[^[:space:][:cntrl:]@,<>]+[.][^[:space:][:cntrl:]@,<>]+$') THEN
      RAISE EXCEPTION 'Invalid native callback observation' USING ERRCODE='22023';
    END IF;
  END LOOP;
  IF (p_event_type<>'contact.updated' AND p_global_denied)
    OR (p_event_type<>'contact.topics.updated' AND cardinality(p_denied_topic_ids)>0)
    OR (p_event_type LIKE 'contact.%' AND p_sender IS NOT NULL) THEN
    RAISE EXCEPTION 'Invalid native callback observation' USING ERRCODE='22023';
  END IF;
  -- This lock serializes every negative decision, resolution, policy refresh and
  -- native reserve. Older raw consent/delivery paths share the address lock.
  SELECT * INTO STRICT policy FROM private.production_marketing_native_policy WHERE singleton FOR UPDATE;
  SELECT native_welcome_contract_hash,events_enabled INTO controls_digest,receive_enabled
    FROM private.production_marketing_controls WHERE singleton FOR SHARE;
  SELECT encode(sha256(convert_to(jsonb_build_array(p_event_id,p_event_type,p_occurred_at,p_sender,p_recipient,p_global_denied,
    ARRAY(SELECT t FROM unnest(p_denied_topic_ids) t ORDER BY t),p_ambiguity)::text,'UTF8')),'hex') INTO observed_digest;
  SELECT fingerprint INTO original_digest FROM private.production_marketing_native_receipts WHERE event_id=p_event_id;
  IF observed_digest=original_digest THEN RETURN 'duplicate'; END IF;
  -- A previous acknowledgment is durable. Every new observation, including a
  -- conflicting reuse of its ID, must retry while stored event intake is paused.
  IF receive_enabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Native callback intake unavailable' USING ERRCODE='55000';
  END IF;
  IF original_digest IS NOT NULL THEN
    INSERT INTO private.production_marketing_native_holds(event_id,fingerprint,reason) VALUES(p_event_id,observed_digest,'event_id_conflict')
      ON CONFLICT DO NOTHING;
    IF NOT FOUND THEN RETURN 'duplicate'; END IF;
    UPDATE private.production_marketing_native_policy SET revision=revision+1 WHERE singleton;
    RETURN 'held';
  END IF;
  authoritative := coalesce(policy.contract_hash=p_contract_hash AND policy.contract_hash=controls_digest AND policy.sender_exclusive,false);
  SELECT EXISTS (SELECT FROM private.production_marketing_native_epochs e WHERE e.sender=p_sender),
    EXISTS (SELECT FROM private.production_marketing_native_epochs e WHERE e.contract_hash=policy.contract_hash AND e.topic_id=ANY(p_denied_topic_ids))
    INTO known_sender,known_topic;
  IF p_occurred_at>clock_timestamp()+interval '5 minutes' THEN
    held_reason := coalesce(held_reason,'invalid_restrictive_envelope');
  END IF;
  IF p_event_type LIKE 'contact.%' THEN
    applicable := p_global_denied OR (known_topic AND held_reason IS NULL);
    IF held_reason IS NULL AND (p_global_denied OR cardinality(p_denied_topic_ids)>0) AND NOT authoritative THEN
      held_reason := 'policy_drift';
    END IF;
    IF NOT known_topic AND EXISTS (SELECT FROM private.production_marketing_native_epochs e
      WHERE e.topic_id=ANY(p_denied_topic_ids)) THEN held_reason:=coalesce(held_reason,'policy_drift'); END IF;
    IF applicable AND p_recipient IS NULL THEN held_reason:=coalesce(held_reason,'invalid_contact_deny'); END IF;
  ELSIF NOT known_sender AND p_sender IS NOT NULL AND p_recipient IS NULL AND held_reason IS NULL THEN
    -- A clean foreign sender has no claim on this lane, even when credentials rotated.
    RETURN 'ignored';
  ELSIF held_reason IS NULL THEN
    IF NOT authoritative OR NOT known_sender THEN held_reason:='policy_drift';
    ELSIF p_recipient IS NULL THEN held_reason:='recipient_ambiguous';
    ELSE applicable:=true;
    END IF;
  END IF;
  IF applicable AND p_recipient IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('production-marketing:address:'||p_recipient,0));
    SELECT * INTO subscriber FROM private.production_marketing_subscribers WHERE normalized_email=p_recipient FOR UPDATE;
    IF p_event_type LIKE 'email.%' AND NOT EXISTS (
      SELECT FROM private.production_marketing_messages m JOIN private.production_marketing_native_epochs e ON e.contract_hash=m.contract_hash
      WHERE m.subscriber_id=subscriber.id AND m.transport='native_event' AND m.native_attempt_id IS NOT NULL
        AND m.first_prepared_at<=p_occurred_at AND e.sender=p_sender
    ) THEN
      applicable:=false;
      held_reason:='unbound_recipient';
    END IF;
    applicable:=applicable AND subscriber.id IS NOT NULL;
  ELSE applicable:=false;
  END IF;
  IF applicable THEN
    IF subscriber.state<>'withdrawn' THEN
      UPDATE private.production_marketing_subscribers SET state='withdrawn',revision=revision+1,updated_at=clock_timestamp()
        WHERE id=subscriber.id RETURNING * INTO subscriber;
      INSERT INTO private.production_marketing_evidence(subscriber_id,generation,revision,event)
        VALUES(subscriber.id,subscriber.generation,subscriber.revision,'withdrawn');
    END IF;
    UPDATE private.production_marketing_confirmation_intents SET state='cancelled',delivery_payload=NULL
      WHERE subscriber_id=subscriber.id AND state='held';
    INSERT INTO private.production_marketing_suppressions(subscriber_id,reason)
      VALUES(subscriber.id,CASE p_event_type WHEN 'email.bounced' THEN 'bounced' WHEN 'email.complained' THEN 'complained' ELSE 'suppressed' END)
      ON CONFLICT DO NOTHING;
  END IF;
  result:=CASE WHEN held_reason IS NOT NULL THEN 'held' WHEN applicable THEN 'applied' ELSE 'ignored' END;
  INSERT INTO private.production_marketing_native_receipts(event_id,fingerprint,event_type,occurred_at,outcome,restricted_subscriber_id)
    VALUES(p_event_id,observed_digest,p_event_type,p_occurred_at,result,CASE WHEN applicable THEN subscriber.id END);
  IF held_reason IS NOT NULL THEN
    INSERT INTO private.production_marketing_native_holds(event_id,fingerprint,reason) VALUES(p_event_id,observed_digest,held_reason);
  END IF;
  IF held_reason IS NOT NULL OR applicable THEN
    UPDATE private.production_marketing_native_policy SET revision=revision+1 WHERE singleton;
  END IF;
  RETURN result;
END $$;

-- Clearing a reviewed ambiguity is a distinct, append-only owner operation.
CREATE FUNCTION private.resolve_native_welcome_hold(p_event_id text,p_fingerprint text,p_evidence_sha256 text) RETURNS boolean
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF current_user<>'postgres' OR NOT private.production_marketing_on_native_parent() OR p_evidence_sha256 IS NULL
     OR p_evidence_sha256 !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Verified native hold resolution required'; END IF;
  PERFORM FROM private.production_marketing_native_policy WHERE singleton FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (SELECT FROM private.production_marketing_native_holds h
    WHERE h.event_id=p_event_id AND h.fingerprint=p_fingerprint) THEN RETURN false; END IF;
  INSERT INTO private.production_marketing_native_resolutions(event_id,fingerprint,evidence_sha256) VALUES(p_event_id,p_fingerprint,p_evidence_sha256)
    ON CONFLICT DO NOTHING;
  IF FOUND THEN UPDATE private.production_marketing_native_policy SET revision=revision+1 WHERE singleton; END IF;
  RETURN EXISTS (SELECT FROM private.production_marketing_native_resolutions r
    WHERE (r.event_id,r.fingerprint,r.evidence_sha256)=(p_event_id,p_fingerprint,p_evidence_sha256));
END $$;

CREATE INDEX production_marketing_native_alert_states ON private.production_marketing_messages(state,last_admitted_at)
  WHERE state IN ('native_reserved','native_unknown');
CREATE FUNCTION public.production_marketing_native_alerts() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF NOT private.production_marketing_on_native_parent() THEN RAISE EXCEPTION 'Native maintenance unavailable' USING ERRCODE='55000'; END IF;
  RETURN jsonb_build_object('uncertainAttempts',(SELECT count(*) FROM private.production_marketing_messages
    WHERE state='native_unknown' OR (state='native_reserved' AND last_admitted_at<=statement_timestamp()-interval '2 minutes')),
    'unresolvedHolds',private.production_marketing_native_unresolved_holds());
END $$;

-- Object-scoped authority; reject ambient grants instead of exposing observations through a new default.
DO $$ DECLARE f record; expected oid; BEGIN
  FOR f IN SELECT p.oid,p.proowner,n.nspname,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE (n.nspname='private' AND p.proname IN ('production_marketing_keep_callback_fact','production_marketing_native_unresolved_holds',
      'production_marketing_on_native_parent','production_marketing_native_policy_ready','production_marketing_p4_reserve',
      'production_marketing_verify_native_reservation','request_production_marketing_subscription',
      'request_qualified_production_marketing_subscription','resolve_native_welcome_hold'))
    OR (n.nspname='public' AND p.proname IN ('production_marketing_enrollment_ready','request_production_marketing_subscription',
      'request_qualified_production_marketing_subscription','record_native_welcome_restriction','production_marketing_native_alerts'))
    OR (n.nspname='helix_welcome_worker' AND p.proname='reserve') LOOP
    expected:=CASE f.nspname WHEN 'public' THEN 'service_role'::regrole WHEN 'helix_welcome_worker' THEN 'helix_native_welcome_worker'::regrole END;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role,helix_native_welcome_worker',f.oid::regprocedure);
    IF expected IS NOT NULL THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I',f.oid::regprocedure,expected::regrole::text); END IF;
    IF EXISTS (SELECT FROM pg_proc p,LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      WHERE p.oid=f.oid AND a.grantee<>p.proowner AND (a.grantee IS DISTINCT FROM expected OR a.is_grantable))
      THEN RAISE EXCEPTION 'Unexpected native callback function grant'; END IF;
  END LOOP;
  IF EXISTS (SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace,
      LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
      WHERE n.nspname='private' AND c.relname IN ('production_marketing_native_epochs','production_marketing_native_policy',
        'production_marketing_native_receipts','production_marketing_native_holds','production_marketing_native_resolutions')
        AND a.grantee<>c.relowner) THEN RAISE EXCEPTION 'Unexpected native callback data grant'; END IF;
END $$;
COMMIT;
