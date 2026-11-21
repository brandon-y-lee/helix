-- Manual expansion after the owner-installed environment marker, consent, delivery and events.
-- New qualified requests use native welcome delivery. Existing consent and message rows retain their transport.
BEGIN;
SET LOCAL search_path = pg_catalog, pg_temp;
DO $$
BEGIN
  IF current_user <> 'postgres' OR NOT EXISTS (
    SELECT FROM pg_catalog.pg_class c WHERE c.oid='private.helix_environment'::regclass
      AND c.relkind='r' AND c.relowner='postgres'::regrole AND c.relrowsecurity
  ) OR NOT EXISTS (
    SELECT FROM ONLY private.helix_environment e WHERE e.singleton AND (e.environment,e.project_ref) IN (
      ('production','erasogmsqpgiirovubjh'),('development','zyfkunnpnlmgvrojmrbg'))
  ) THEN RAISE EXCEPTION 'Verified owner and environment marker required'; END IF;
END $$;

CREATE ROLE helix_native_welcome_worker NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE SCHEMA helix_welcome_worker AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA helix_welcome_worker FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA helix_welcome_worker TO helix_native_welcome_worker;

ALTER TABLE private.production_marketing_controls
  ADD COLUMN native_welcome_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN native_welcome_contract_hash text CHECK (native_welcome_contract_hash ~ '^[a-f0-9]{64}$'),
  ADD COLUMN native_welcome_publisher_project_id text CHECK (native_welcome_publisher_project_id ~ '^prj_[A-Za-z0-9]{1,64}$'),
  ADD COLUMN native_welcome_publisher_deployment_id text CHECK (native_welcome_publisher_deployment_id ~ '^dpl_[A-Za-z0-9]{1,64}$'),
  ADD COLUMN native_welcome_publisher_git_sha text CHECK (native_welcome_publisher_git_sha ~ '^[a-f0-9]{40}$'),
  ADD COLUMN native_welcome_qualified_until timestamptz CHECK (isfinite(native_welcome_qualified_until));

-- Only a successful qualified request inserts its new generation. A confirmation cannot opt an old request in.
CREATE TABLE private.production_marketing_native_generations (
  subscriber_id uuid NOT NULL,
  generation bigint NOT NULL,
  PRIMARY KEY (subscriber_id,generation),
  FOREIGN KEY (subscriber_id,generation) REFERENCES private.production_marketing_generations(subscriber_id,generation)
);
ALTER TABLE private.production_marketing_native_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.production_marketing_native_generations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.production_marketing_native_generations FROM PUBLIC,anon,authenticated,service_role,helix_native_welcome_worker;

-- The old claim indexes and every old mutation select only raw states. The disjoint state constraint
-- fences their original signatures and leases even if an old binary presents a known message ID.
ALTER TABLE private.production_marketing_messages
  ADD COLUMN transport text NOT NULL DEFAULT 'raw_email',
  ADD COLUMN native_attempt_id uuid UNIQUE,
  DROP CONSTRAINT production_marketing_messages_state_check,
  ADD CONSTRAINT production_marketing_message_transport_state CHECK (
    (transport='raw_email' AND native_attempt_id IS NULL AND state IN ('held','prepared','uncertain','accepted','cancelled'))
    OR (transport='native_event' AND purpose='welcome' AND state IN ('native_queued','native_reserved','native_submitted','native_unknown')
      AND ((state='native_queued')=(native_attempt_id IS NULL))
      AND ((state='native_queued')=(first_prepared_at IS NULL))
      AND ((state='native_queued')=(last_admitted_at IS NULL))
      AND ((state='native_queued')=(contract_hash IS NULL))
      AND lease_token IS NULL AND lease_until IS NULL AND body_text IS NULL AND body_hash IS NULL
      AND payload_expires_at IS NULL AND sender IS NULL AND recipient IS NULL AND provider_id IS NULL)
  );
CREATE INDEX production_marketing_native_queue ON private.production_marketing_messages(created_at,id) WHERE state='native_queued';

CREATE FUNCTION private.keep_production_marketing_transport() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF NEW.transport<>OLD.transport OR (OLD.transport='native_event' AND OLD.state<>NEW.state
      AND NOT (OLD.state='native_queued' AND NEW.state='native_reserved')
      AND NOT (OLD.state='native_reserved' AND NEW.state IN ('native_submitted','native_unknown')))
    OR (OLD.native_attempt_id IS NOT NULL AND (NEW.native_attempt_id IS DISTINCT FROM OLD.native_attempt_id
      OR NEW.last_admitted_at IS DISTINCT FROM OLD.last_admitted_at)) THEN
    RAISE EXCEPTION 'Immutable marketing transport or attempt';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER keep_production_marketing_transport BEFORE UPDATE ON private.production_marketing_messages
FOR EACH ROW EXECUTE FUNCTION private.keep_production_marketing_transport();

CREATE OR REPLACE FUNCTION public.request_qualified_production_marketing_subscription(
  p_contract_hash text,p_worker_binding_hash text,p_email text,p_confirmation_hash text,p_preference_hash text,p_requester_hash text,
  p_explicit_consent boolean,p_wording_version text,p_delivery_payload jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  PERFORM 1 FROM private.production_marketing_controls WHERE singleton FOR SHARE;
  IF NOT FOUND OR NOT public.production_marketing_enrollment_ready(p_contract_hash,p_worker_binding_hash) THEN
    RAISE EXCEPTION 'Enrollment unavailable' USING ERRCODE='55000';
  END IF;
  IF NOT public.request_production_marketing_subscription(
    p_email,p_confirmation_hash,p_preference_hash,p_requester_hash,p_explicit_consent,p_wording_version,p_delivery_payload
  ) THEN RETURN false; END IF;
  INSERT INTO private.production_marketing_native_generations(subscriber_id,generation)
    SELECT i.subscriber_id,i.generation FROM private.production_marketing_confirmation_intents i
    WHERE i.request_id=(p_delivery_payload->>'requestId')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Enrollment unavailable' USING ERRCODE='55000'; END IF;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION private.production_marketing_admit_welcome() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  message_id uuid := gen_random_uuid();
  native boolean;
BEGIN
  SELECT EXISTS (SELECT FROM private.production_marketing_native_generations g
    WHERE g.subscriber_id=NEW.subscriber_id AND g.generation=NEW.generation) INTO native;
  INSERT INTO private.production_marketing_messages(id,subscriber_id,generation,revision,purpose,idempotency_key,transport,state)
    VALUES(message_id,NEW.subscriber_id,NEW.generation,NEW.revision,'welcome','production-marketing/'||message_id,
      CASE WHEN native THEN 'native_event' ELSE 'raw_email' END,CASE WHEN native THEN 'native_queued' ELSE 'held' END)
    ON CONFLICT(subscriber_id,generation,purpose) DO NOTHING;
  RETURN NEW;
END $$;

CREATE FUNCTION private.production_marketing_on_native_parent() RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp RETURN EXISTS (
  SELECT FROM ONLY private.helix_environment e JOIN pg_catalog.pg_class c ON c.oid=e.tableoid
  WHERE e.singleton AND e.environment='production' AND e.project_ref='erasogmsqpgiirovubjh'
    AND c.relowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='postgres') AND c.relrowsecurity
);

-- Count the same logical promotions and latest admissions as the installed #548 transaction,
-- including legacy attempts from older generations. Locked admission always rechecks this predicate.
CREATE FUNCTION private.production_marketing_native_frequency_available(p_subscriber_id uuid,p_now timestamptz)
RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp SET timezone='UTC'
RETURN (SELECT count(*)<3 AND count(*) FILTER (WHERE coalesce(m.last_admitted_at,m.first_prepared_at)>p_now-interval '24 hours')=0
  FROM private.production_marketing_messages m
  WHERE m.subscriber_id=p_subscriber_id AND m.purpose<>'confirmation' AND m.first_prepared_at IS NOT NULL
    AND coalesce(m.last_admitted_at,m.first_prepared_at)>p_now-interval '7 days');

CREATE FUNCTION helix_welcome_worker.reserve(
  p_contract_hash text,p_publisher_project_id text,p_publisher_deployment_id text,p_publisher_git_sha text
) RETURNS TABLE(intent_id uuid,attempt_id uuid,recipient text,reserved_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET timezone='UTC' AS $$
DECLARE
  candidate record;
  message private.production_marketing_messages%ROWTYPE;
  controls private.production_marketing_controls%ROWTYPE;
  scan_time timestamptz := clock_timestamp();
  admission_time timestamptz;
BEGIN
  IF NOT private.production_marketing_on_native_parent() THEN RETURN; END IF;
  -- The published artifact and contract are operator-pinned after deployment. Neither the site nor
  -- the publisher has permission to set this tuple. A paused poll reads no subscriber addresses.
  IF NOT EXISTS (SELECT FROM private.production_marketing_controls c
    WHERE c.singleton AND c.dispatch_enabled AND c.native_welcome_enabled
      AND c.native_welcome_contract_hash=p_contract_hash AND c.native_welcome_publisher_project_id=p_publisher_project_id
      AND c.native_welcome_publisher_deployment_id=p_publisher_deployment_id AND c.native_welcome_publisher_git_sha=p_publisher_git_sha
      AND c.native_welcome_qualified_until>scan_time AND c.daily_limit>0 AND c.monthly_limit>0) THEN RETURN; END IF;

  -- Filter stale, restricted and frequency-capped rows before choosing a candidate. Walk past a
  -- busy address or message in queue order; the raw worker has its own disjoint candidate states.
  FOR candidate IN
    SELECT m.id,s.normalized_email FROM private.production_marketing_messages m
    JOIN private.production_marketing_subscribers s ON s.id=m.subscriber_id
    WHERE m.state='native_queued' AND private.production_marketing_eligible(m,scan_time)
      AND private.production_marketing_native_frequency_available(m.subscriber_id,scan_time)
    ORDER BY m.created_at,m.id
  LOOP
    IF NOT pg_try_advisory_xact_lock(hashtextextended('production-marketing:address:'||candidate.normalized_email,0)) THEN CONTINUE; END IF;
    SELECT m.* INTO message FROM private.production_marketing_messages m WHERE m.id=candidate.id FOR UPDATE SKIP LOCKED;
    IF NOT FOUND OR message.state<>'native_queued' THEN CONTINUE; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('production-marketing:quota',0));
    SELECT c.* INTO controls FROM private.production_marketing_controls c WHERE c.singleton FOR SHARE;
    admission_time := clock_timestamp();
    IF NOT FOUND OR NOT controls.dispatch_enabled OR NOT controls.native_welcome_enabled
      OR controls.native_welcome_contract_hash IS DISTINCT FROM p_contract_hash
      OR controls.native_welcome_publisher_project_id IS DISTINCT FROM p_publisher_project_id
      OR controls.native_welcome_publisher_deployment_id IS DISTINCT FROM p_publisher_deployment_id
      OR controls.native_welcome_publisher_git_sha IS DISTINCT FROM p_publisher_git_sha
      OR controls.native_welcome_qualified_until IS NULL OR controls.native_welcome_qualified_until<=admission_time
      THEN RETURN; END IF;
    IF NOT private.production_marketing_eligible(message,admission_time)
      OR NOT private.production_marketing_native_frequency_available(message.subscriber_id,admission_time) THEN CONTINUE; END IF;
    IF NOT private.production_marketing_reserve(message.id,admission_time) THEN RETURN; END IF;
    UPDATE private.production_marketing_messages m SET state='native_reserved',native_attempt_id=gen_random_uuid(),
      first_prepared_at=admission_time,last_admitted_at=admission_time,contract_hash=p_contract_hash
      WHERE m.id=message.id RETURNING m.id,m.native_attempt_id,candidate.normalized_email,admission_time
      INTO intent_id,attempt_id,recipient,reserved_at;
    RETURN NEXT;
    RETURN;
  END LOOP;
END $$;

CREATE FUNCTION helix_welcome_worker.finish(p_intent_id uuid,p_attempt_id uuid,p_outcome text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  outcome_state text;
BEGIN
  IF NOT private.production_marketing_on_native_parent() OR p_outcome IS NULL OR p_outcome NOT IN ('submitted','unknown')
    THEN RETURN false; END IF;
  outcome_state := CASE p_outcome WHEN 'submitted' THEN 'native_submitted' ELSE 'native_unknown' END;
  UPDATE private.production_marketing_messages SET state=outcome_state
    WHERE id=p_intent_id AND native_attempt_id=p_attempt_id AND state='native_reserved';
  IF FOUND THEN RETURN true; END IF;
  RETURN EXISTS (SELECT FROM private.production_marketing_messages
    WHERE id=p_intent_id AND native_attempt_id=p_attempt_id AND state=outcome_state);
END $$;

-- Preserve the authorized P3 report. Submitted events have no email delivery evidence.
CREATE OR REPLACE FUNCTION public.read_production_marketing_status(p_actor_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE result jsonb;BEGIN
  IF p_actor_id IS NULL OR NOT EXISTS(SELECT 1 FROM private.production_marketing_controls WHERE singleton AND status_enabled)
    OR NOT EXISTS(SELECT 1 FROM public.admin_memberships WHERE user_id=p_actor_id AND active AND role='admin') THEN RETURN NULL; END IF;
  SELECT jsonb_build_object(
    'pendingSubscribers',(SELECT count(*) FROM private.production_marketing_subscribers WHERE state='pending'),
    'confirmedSubscribers',(SELECT count(*) FROM private.production_marketing_subscribers WHERE state='confirmed'),
    'withdrawnSubscribers',(SELECT count(*) FROM private.production_marketing_subscribers WHERE state='withdrawn'),
    'suppressedSubscribers',(SELECT count(*) FROM private.production_marketing_suppressions),
    'queuedMessages',count(*) FILTER(WHERE (state='held' AND NOT reconciliation_required)
      OR (state='native_queued' AND private.production_marketing_eligible(m,statement_timestamp()))),
    'preparedMessages',count(*) FILTER(WHERE state='prepared' AND lease_until>clock_timestamp() AND NOT reconciliation_required),
    'acceptedMessages',count(*) FILTER(WHERE state='accepted' AND NOT reconciliation_required),
    'deliveredMessages',count(*) FILTER(WHERE delivery_status='delivered'),
    'suppressedMessages',count(*) FILTER(WHERE delivery_status='suppressed'),
    'failedMessages',count(*) FILTER(WHERE delivery_status='failed'),
    'uncertainMessages',count(*) FILTER(WHERE reconciliation_required OR state IN ('uncertain','native_reserved','native_unknown') OR(state='prepared' AND coalesce(lease_until<=clock_timestamp(),true))))
    INTO result FROM private.production_marketing_messages m;
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION private.keep_production_marketing_transport(), private.production_marketing_on_native_parent(),
  private.production_marketing_native_frequency_available(uuid,timestamptz) FROM PUBLIC,anon,authenticated,service_role,helix_native_welcome_worker;
REVOKE ALL ON FUNCTION helix_welcome_worker.reserve(text,text,text,text),helix_welcome_worker.finish(uuid,uuid,text)
  FROM PUBLIC,anon,authenticated,service_role,helix_native_welcome_worker;
GRANT EXECUTE ON FUNCTION helix_welcome_worker.reserve(text,text,text,text),helix_welcome_worker.finish(uuid,uuid,text)
  TO helix_native_welcome_worker;

DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_catalog.pg_proc p, LATERAL pg_catalog.aclexplode(p.proacl) a
    WHERE p.pronamespace='helix_welcome_worker'::regnamespace AND a.grantee NOT IN (p.proowner,'helix_native_welcome_worker'::regrole))
  OR EXISTS (SELECT FROM pg_catalog.pg_namespace n, LATERAL pg_catalog.aclexplode(n.nspacl) a
    WHERE n.oid='helix_welcome_worker'::regnamespace AND a.grantee NOT IN (n.nspowner,'helix_native_welcome_worker'::regrole))
  OR EXISTS (SELECT FROM pg_catalog.pg_class c, LATERAL pg_catalog.aclexplode(c.relacl) a
    WHERE c.oid='private.production_marketing_native_generations'::regclass AND a.grantee<>c.relowner)
  OR EXISTS (SELECT FROM pg_catalog.pg_proc p, LATERAL pg_catalog.aclexplode(p.proacl) a
    WHERE p.oid IN ('private.keep_production_marketing_transport()'::regprocedure,'private.production_marketing_on_native_parent()'::regprocedure,
      'private.production_marketing_native_frequency_available(uuid,timestamptz)'::regprocedure) AND a.grantee<>p.proowner)
  THEN RAISE EXCEPTION 'Unexpected native publisher grants'; END IF;
END $$;
COMMIT;
