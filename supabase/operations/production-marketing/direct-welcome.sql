-- P4: direct welcome delivery following the unmodified consent, raw delivery and event packages.
BEGIN;
SET LOCAL search_path=pg_catalog,pg_temp;
DO $$
BEGIN
  IF current_user<>'postgres' OR NOT EXISTS (
    SELECT FROM ONLY private.helix_environment e JOIN pg_class c ON c.oid=e.tableoid
    WHERE c.relkind='r' AND c.relowner=current_user::regrole AND c.relrowsecurity AND e.singleton
      AND (e.environment,e.project_ref) IN (('production','erasogmsqpgiirovubjh'),('development','zyfkunnpnlmgvrojmrbg'))
  ) THEN RAISE EXCEPTION 'Verified Helix owner and target required'; END IF;
  IF (SELECT count(*) FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace
    JOIN pg_depend d ON d.refclassid='pg_extension'::regclass AND d.refobjid=e.oid AND d.deptype='e'
    JOIN pg_proc p ON d.classid='pg_proc'::regclass AND d.objid=p.oid AND p.pronamespace=n.oid
    WHERE e.extname='pgcrypto' AND n.nspname='extensions' AND NOT p.prosecdef
      AND pg_get_userbyid(p.proowner) IN ('postgres','supabase_admin') AND pg_get_userbyid(e.extowner) IN ('postgres','supabase_admin')
      AND p.oid IN (to_regprocedure('extensions.hmac(bytea,bytea,text)'),to_regprocedure('extensions.gen_random_bytes(integer)')))<>2
    THEN RAISE EXCEPTION 'Verified database cryptography required'; END IF;
END $$;

-- Generate and retain one key in the database. A separately retained commitment
-- detects missing/replaced material before any handoff or signed acknowledgment.
CREATE TABLE private.production_marketing_direct_lookup_key (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  secret bytea NOT NULL CHECK(octet_length(secret)=32)
);
INSERT INTO private.production_marketing_direct_lookup_key(secret) VALUES(extensions.gen_random_bytes(32));
CREATE TABLE private.production_marketing_direct_policy (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  lookup_key_hash bytea NOT NULL CHECK(octet_length(lookup_key_hash)=32),
  topic_default text CHECK(topic_default IN ('opt_in','opt_out')),
  baseline_evidence_sha256 text CHECK(baseline_evidence_sha256 ~ '^[a-f0-9]{64}$'),
  intake_evidence_sha256 text CHECK(intake_evidence_sha256 ~ '^[a-f0-9]{64}$'),
  revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0)
);
INSERT INTO private.production_marketing_direct_policy(lookup_key_hash)
 SELECT sha256(secret) FROM private.production_marketing_direct_lookup_key;
CREATE TABLE private.production_marketing_direct_denials (
  subject bytea NOT NULL CHECK(octet_length(subject)=32),
  scope text NOT NULL CHECK(scope IN ('global','aca091c7-8da7-440e-8761-e6a549c60aa5')),
  observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(subject,scope)
);
CREATE TABLE private.production_marketing_direct_receipts (
  event_id text PRIMARY KEY,
  fingerprint bytea NOT NULL CHECK(octet_length(fingerprint)=32),
  held boolean NOT NULL DEFAULT false,
  coverage_hold boolean NOT NULL DEFAULT false CHECK(NOT coverage_hold OR held),
  message_id uuid, provider_id uuid, occurred_at timestamptz,
  observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  resolved_at timestamptz,
  resolution_evidence_sha256 text CHECK(resolution_evidence_sha256 ~ '^[a-f0-9]{64}$'),
  CHECK((resolved_at IS NULL)=(resolution_evidence_sha256 IS NULL))
);
CREATE INDEX production_marketing_direct_coverage_holds ON private.production_marketing_direct_receipts(event_id)
  WHERE coverage_hold AND resolved_at IS NULL;
ALTER TABLE private.production_marketing_generations ADD COLUMN direct_subject bytea CHECK(octet_length(direct_subject)=32);

CREATE FUNCTION private.production_marketing_keep_direct_fact() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN RAISE EXCEPTION 'Direct marketing fact is immutable'; END $$;
CREATE TRIGGER immutable_direct_key BEFORE UPDATE OR DELETE OR TRUNCATE ON private.production_marketing_direct_lookup_key
  FOR EACH STATEMENT EXECUTE FUNCTION private.production_marketing_keep_direct_fact();
CREATE TRIGGER immutable_direct_commitment BEFORE UPDATE OF lookup_key_hash,singleton OR DELETE OR TRUNCATE ON private.production_marketing_direct_policy
  FOR EACH STATEMENT EXECUTE FUNCTION private.production_marketing_keep_direct_fact();
CREATE TRIGGER immutable_direct_denial BEFORE UPDATE OR DELETE OR TRUNCATE ON private.production_marketing_direct_denials
  FOR EACH STATEMENT EXECUTE FUNCTION private.production_marketing_keep_direct_fact();
CREATE TRIGGER immutable_direct_generation BEFORE UPDATE OF direct_subject ON private.production_marketing_generations
  FOR EACH ROW WHEN (OLD.direct_subject IS NOT NULL AND OLD.direct_subject IS DISTINCT FROM NEW.direct_subject)
  EXECUTE FUNCTION private.production_marketing_keep_direct_fact();
DO $$ DECLARE name text; BEGIN
  FOREACH name IN ARRAY ARRAY['lookup_key','policy','denials','receipts'] LOOP
    EXECUTE format('ALTER TABLE private.production_marketing_direct_%I ENABLE ROW LEVEL SECURITY',name);
    EXECUTE format('ALTER TABLE private.production_marketing_direct_%I FORCE ROW LEVEL SECURITY',name);
    EXECUTE format('REVOKE ALL ON TABLE private.production_marketing_direct_%I FROM PUBLIC,anon,authenticated,service_role',name);
  END LOOP;
END $$;

CREATE FUNCTION private.production_marketing_direct_parent() RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp RETURN EXISTS (
  SELECT FROM ONLY private.helix_environment e JOIN pg_class c ON c.oid=e.tableoid
  WHERE e.singleton AND e.environment='production' AND e.project_ref='erasogmsqpgiirovubjh'
    AND c.relkind='r' AND c.relrowsecurity AND c.relowner=(SELECT oid FROM pg_roles WHERE rolname='postgres')
);
CREATE FUNCTION private.production_marketing_direct_subject(p_email text) RETURNS bytea
LANGUAGE sql STABLE STRICT SET search_path=pg_catalog,pg_temp RETURN (
  SELECT extensions.hmac(convert_to('helix:production-marketing:deny:v1:'||lower(btrim(p_email)),'UTF8'),k.secret,'sha256')
  FROM private.production_marketing_direct_lookup_key k JOIN private.production_marketing_direct_policy q USING(singleton)
  WHERE k.singleton AND sha256(k.secret)=q.lookup_key_hash AND length(btrim(p_email)) BETWEEN 3 AND 254
);
CREATE FUNCTION private.production_marketing_direct_denied(p_subject bytea) RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp RETURN p_subject IS NULL OR EXISTS (
  SELECT FROM private.production_marketing_direct_denials WHERE subject=p_subject
    AND scope IN ('global','aca091c7-8da7-440e-8761-e6a549c60aa5')
);
CREATE FUNCTION private.production_marketing_direct_contract_valid(p_text text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
DECLARE c jsonb;
BEGIN
  c:=p_text::jsonb;
  RETURN coalesce(jsonb_typeof(c)='object' AND c->>'version'='production_welcome_delivery_v1'
    AND c->>'from'='hello@helixskin.us' AND c->>'replyTo'='hello@helixskin.us'
    AND c->>'topicId'='aca091c7-8da7-440e-8761-e6a549c60aa5' AND c->>'templateHash' ~ '^[0-9a-f]{64}$'
    AND jsonb_typeof(c->'postalAddress')='string' AND length(btrim(c->>'postalAddress')) BETWEEN 1 AND 500
    AND (c->>'postalAddress') !~ '[[:cntrl:]]' AND (c-ARRAY['version','from','replyTo','topicId','templateHash','postalAddress'])='{}'::jsonb,false);
EXCEPTION WHEN invalid_text_representation THEN RETURN false;
END $$;
CREATE FUNCTION private.production_marketing_direct_ready(p_contract_hash text,p_worker_binding_hash text) RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp RETURN EXISTS (
  SELECT FROM private.production_marketing_direct_policy q JOIN private.production_marketing_controls c USING(singleton)
    JOIN private.production_marketing_direct_lookup_key k USING(singleton)
  WHERE q.singleton AND private.production_marketing_direct_parent() AND sha256(k.secret)=q.lookup_key_hash
    AND q.topic_default='opt_in' AND q.baseline_evidence_sha256 IS NOT NULL AND q.intake_evidence_sha256 IS NOT NULL
    AND c.dispatch_enabled AND c.events_enabled AND c.daily_limit>0 AND c.monthly_limit>0
    AND private.production_marketing_direct_contract_valid(c.delivery_contract_text)
    AND encode(sha256(convert_to(c.delivery_contract_text,'UTF8')),'hex')=p_contract_hash
    AND c.confirmation_worker_binding_hash=p_worker_binding_hash
    AND NOT EXISTS (SELECT FROM private.production_marketing_direct_receipts WHERE coverage_hold AND resolved_at IS NULL)
);
CREATE OR REPLACE FUNCTION public.production_marketing_enrollment_ready(p_contract_hash text,p_worker_binding_hash text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp RETURN
  private.production_marketing_direct_ready(p_contract_hash,p_worker_binding_hash)
  AND EXISTS (SELECT FROM private.production_marketing_controls WHERE singleton AND enrollment_enabled);

-- Preserve the seven-argument ABI for existing clients, while respecting any
-- previously committed restriction. This path never marks a generation as direct.
ALTER FUNCTION public.request_production_marketing_subscription(text,text,text,text,boolean,text,jsonb) RENAME TO production_marketing_p1_request;
ALTER FUNCTION public.production_marketing_p1_request(text,text,text,text,boolean,text,jsonb) SET SCHEMA private;
CREATE FUNCTION public.request_production_marketing_subscription(p_email text,p_confirmation_hash text,p_preference_hash text,p_requester_hash text,
  p_explicit_consent boolean,p_wording_version text,p_delivery_payload jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  PERFORM FROM private.production_marketing_direct_policy WHERE singleton FOR SHARE;
  IF NOT FOUND OR private.production_marketing_direct_denied(private.production_marketing_direct_subject(p_email))
    OR EXISTS (SELECT FROM private.production_marketing_subscribers s JOIN private.production_marketing_suppressions d ON d.subscriber_id=s.id
        WHERE s.normalized_email=lower(btrim(p_email))) THEN RETURN false; END IF;
  RETURN private.production_marketing_p1_request(p_email,p_confirmation_hash,p_preference_hash,p_requester_hash,
    p_explicit_consent,p_wording_version,p_delivery_payload);
END $$;
CREATE OR REPLACE FUNCTION public.request_qualified_production_marketing_subscription(
  p_contract_hash text,p_worker_binding_hash text,p_email text,p_confirmation_hash text,p_preference_hash text,p_requester_hash text,
  p_explicit_consent boolean,p_wording_version text,p_delivery_payload jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  PERFORM FROM private.production_marketing_direct_policy WHERE singleton FOR SHARE;
  PERFORM FROM private.production_marketing_controls WHERE singleton FOR SHARE;
  IF NOT public.production_marketing_enrollment_ready(p_contract_hash,p_worker_binding_hash) THEN
    RAISE EXCEPTION 'Enrollment unavailable' USING ERRCODE='55000'; END IF;
  IF NOT public.request_production_marketing_subscription(p_email,p_confirmation_hash,p_preference_hash,p_requester_hash,
    p_explicit_consent,p_wording_version,p_delivery_payload) THEN RETURN false; END IF;
  UPDATE private.production_marketing_generations g SET direct_subject=private.production_marketing_direct_subject(p_email)
    FROM private.production_marketing_confirmation_intents i
    WHERE i.request_id=(p_delivery_payload->>'requestId')::uuid AND (g.subscriber_id,g.generation)=(i.subscriber_id,i.generation);
  IF NOT FOUND THEN RAISE EXCEPTION 'Enrollment unavailable' USING ERRCODE='55000'; END IF;
  RETURN true;
END $$;

-- Keep the negative record even when the address has never visited the storefront.
-- This helper is called under the direct policy lock. Restriction and P1/P2
-- withdrawal/prepare share the normalized address lock and original ledger.
CREATE FUNCTION private.production_marketing_apply_direct_denial(p_email text,p_subject bytea,p_scope text) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE sub private.production_marketing_subscribers%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('production-marketing:address:'||p_email,0));
  INSERT INTO private.production_marketing_direct_denials(subject,scope) VALUES(p_subject,p_scope) ON CONFLICT DO NOTHING;
  SELECT * INTO sub FROM private.production_marketing_subscribers WHERE normalized_email=p_email FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF sub.state<>'withdrawn' THEN
    UPDATE private.production_marketing_subscribers SET state='withdrawn',revision=revision+1,updated_at=clock_timestamp()
      WHERE id=sub.id RETURNING * INTO sub;
    INSERT INTO private.production_marketing_evidence(subscriber_id,generation,revision,event)
      VALUES(sub.id,sub.generation,sub.revision,'withdrawn');
  END IF;
  UPDATE private.production_marketing_confirmation_intents SET state='cancelled',delivery_payload=NULL WHERE subscriber_id=sub.id AND state='held';
  INSERT INTO private.production_marketing_suppressions(subscriber_id,reason) VALUES(sub.id,'suppressed') ON CONFLICT DO NOTHING;
END $$;
-- The original owner can merge verified baseline negatives without inventing a
-- signed provider receipt. A baseline never deletes an earlier signed denial.
CREATE FUNCTION private.production_marketing_import_direct_denial(p_email text,p_scope text) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_email text:=lower(btrim(p_email)); subject bytea;
BEGIN
  IF current_user<>'postgres' OR NOT private.production_marketing_direct_parent() OR p_scope IS NULL
    OR p_scope NOT IN ('global','aca091c7-8da7-440e-8761-e6a549c60aa5') OR v_email IS NULL OR length(v_email)>254
    OR v_email !~ '^[^[:space:][:cntrl:]@,<>]+@[^[:space:][:cntrl:]@,<>]+[.][^[:space:][:cntrl:]@,<>]+$' THEN
    RAISE EXCEPTION 'Verified baseline denial required'; END IF;
  PERFORM FROM private.production_marketing_direct_policy WHERE singleton FOR UPDATE;
  PERFORM FROM private.production_marketing_controls WHERE singleton AND events_enabled FOR SHARE;
  subject:=private.production_marketing_direct_subject(v_email);
  IF NOT FOUND OR subject IS NULL THEN RAISE EXCEPTION 'Verified intake required'; END IF;
  PERFORM private.production_marketing_apply_direct_denial(v_email,subject,p_scope);
  UPDATE private.production_marketing_direct_policy SET revision=revision+1 WHERE singleton;
END $$;

CREATE FUNCTION public.record_direct_production_marketing_preference(
  p_event_id text,p_event_type text,p_occurred_at timestamptz,p_email text,p_global_denied boolean,p_denied_topics uuid[],p_ambiguous boolean
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET timezone='UTC' AS $$
DECLARE
  subject bytea; observed bytea; previous bytea; conflict_id text; receive_enabled boolean; pinned boolean;
  uncertain boolean:=p_ambiguous; scope text;
BEGIN
  IF NOT private.production_marketing_direct_parent() THEN RETURN 'paused'; END IF;
  IF p_event_id IS NULL OR p_event_id !~ '^[A-Za-z0-9_-]{1,200}$' OR p_event_type IS NULL
    OR p_event_type NOT IN ('contact.created','contact.updated','contact.topics.updated')
    OR p_global_denied IS NULL OR p_ambiguous IS NULL OR p_denied_topics IS NULL OR cardinality(p_denied_topics)>100
    OR coalesce(array_ndims(p_denied_topics),1)<>1 OR (SELECT count(DISTINCT t) FROM unnest(p_denied_topics) t)<>cardinality(p_denied_topics)
    OR (p_occurred_at IS NULL AND NOT p_ambiguous) OR NOT isfinite(p_occurred_at)
    OR (p_global_denied AND p_event_type='contact.topics.updated') OR (cardinality(p_denied_topics)>0 AND p_event_type<>'contact.topics.updated')
    OR (p_email IS NOT NULL AND (length(p_email)>254 OR p_email<>lower(btrim(p_email))
      OR p_email !~ '^[^[:space:][:cntrl:]@,<>]+@[^[:space:][:cntrl:]@,<>]+[.][^[:space:][:cntrl:]@,<>]+$')) THEN
    RAISE EXCEPTION 'Invalid marketing preference observation' USING ERRCODE='22023';
  END IF;
  PERFORM FROM private.production_marketing_direct_policy WHERE singleton FOR UPDATE;
  IF NOT FOUND THEN RETURN 'paused'; END IF;
  SELECT events_enabled INTO receive_enabled FROM private.production_marketing_controls WHERE singleton FOR SHARE;
  IF private.production_marketing_direct_subject('key-check@helixskin.us') IS NULL THEN RETURN 'paused'; END IF;
  subject:=private.production_marketing_direct_subject(p_email);
  observed:=sha256(convert_to(jsonb_build_array(p_event_id,p_event_type,p_occurred_at,encode(subject,'hex'),p_global_denied,
    ARRAY(SELECT t FROM unnest(p_denied_topics) t ORDER BY t),p_ambiguous)::text,'UTF8'));
  PERFORM pg_advisory_xact_lock(hashtextextended('production-marketing:event:'||p_event_id,0));
  SELECT fingerprint INTO previous FROM private.production_marketing_direct_receipts WHERE event_id=p_event_id;
  -- Provider IDs exclude '/'. Preserve conflicts as separate facts so repeated
  -- delivery of the same conflict cannot undo its eventual owner resolution.
  conflict_id:='conflict/'||p_event_id||'/'||encode(observed,'hex');
  IF previous=observed OR EXISTS (SELECT FROM private.production_marketing_direct_receipts WHERE event_id=conflict_id)
    THEN RETURN 'duplicate'; END IF;
  IF receive_enabled IS DISTINCT FROM true THEN RETURN 'paused'; END IF;
  IF previous IS NOT NULL OR EXISTS (SELECT FROM private.production_marketing_events WHERE event_id=p_event_id) THEN
    INSERT INTO private.production_marketing_direct_receipts(event_id,fingerprint,held,coverage_hold,occurred_at)
      VALUES(conflict_id,observed,true,true,p_occurred_at);
    UPDATE private.production_marketing_direct_policy SET revision=revision+1 WHERE singleton;
    RETURN 'held';
  END IF;
  pinned:='aca091c7-8da7-440e-8761-e6a549c60aa5'::uuid=ANY(p_denied_topics);
  uncertain:=uncertain OR (p_occurred_at IS NOT NULL AND p_occurred_at>clock_timestamp()+interval '5 minutes')
    OR ((p_global_denied OR pinned) AND p_email IS NULL);
  IF subject IS NOT NULL THEN
    scope:=CASE WHEN p_global_denied THEN 'global' WHEN pinned AND NOT uncertain THEN 'aca091c7-8da7-440e-8761-e6a549c60aa5' END;
  END IF;
  IF scope IS NULL AND NOT uncertain THEN RETURN 'ignored'; END IF;
  IF scope IS NOT NULL THEN PERFORM private.production_marketing_apply_direct_denial(p_email,subject,scope); END IF;
  INSERT INTO private.production_marketing_direct_receipts(event_id,fingerprint,held,coverage_hold,occurred_at)
    VALUES(p_event_id,observed,uncertain,uncertain,p_occurred_at);
  UPDATE private.production_marketing_direct_policy SET revision=revision+1 WHERE singleton;
  RETURN CASE WHEN uncertain THEN 'held' ELSE 'applied' END;
END $$;
-- One queue with separate versioned entry points. A retained worker cannot see
-- a direct generation, even when an older client supplies a current lease.
CREATE FUNCTION private.production_marketing_claim_generation(
  p_lease uuid, p_direct boolean, p_contract_hash text, p_worker_binding_hash text
) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  candidate record;
  message private.production_marketing_messages%ROWTYPE;
  scan_time timestamptz;
  now_at_lock timestamptz;
  result jsonb;
BEGIN
  IF p_lease IS NULL THEN RETURN NULL; END IF;
  IF p_direct THEN
    PERFORM FROM private.production_marketing_direct_policy WHERE singleton FOR SHARE;
    IF NOT FOUND THEN RETURN NULL; END IF;
  END IF;
  PERFORM FROM private.production_marketing_controls
    WHERE singleton AND dispatch_enabled AND delivery_contract_text IS NOT NULL FOR SHARE;
  IF NOT FOUND OR (p_direct AND NOT private.production_marketing_direct_ready(p_contract_hash,p_worker_binding_hash))
    THEN RETURN NULL; END IF;

  -- Filter the generation and existing messages before either bounded scan.
  INSERT INTO private.production_marketing_messages(id,subscriber_id,generation,revision,purpose,idempotency_key)
    SELECT i.id,i.subscriber_id,i.generation,i.request_revision,'confirmation','production-marketing/'||i.id
    FROM private.production_marketing_confirmation_intents i
    JOIN private.production_marketing_generations g USING(subscriber_id,generation)
    WHERE i.state='held' AND i.expires_at>statement_timestamp() AND (g.direct_subject IS NOT NULL)=p_direct
      AND NOT EXISTS (SELECT FROM private.production_marketing_messages x WHERE x.id=i.id)
    ORDER BY i.created_at,i.id LIMIT 32
    ON CONFLICT(subscriber_id,generation,purpose) DO NOTHING;

  scan_time:=clock_timestamp();
  FOR candidate IN SELECT x.id,s.normalized_email,g.direct_subject
    FROM private.production_marketing_messages x
    JOIN private.production_marketing_subscribers s ON s.id=x.subscriber_id
    JOIN private.production_marketing_generations g ON (g.subscriber_id,g.generation)=(x.subscriber_id,x.generation)
    WHERE (g.direct_subject IS NOT NULL)=p_direct AND x.state IN ('held','uncertain') AND NOT x.reconciliation_required
      AND x.next_attempt_at<=scan_time AND (x.lease_until IS NULL OR x.lease_until<=scan_time)
    ORDER BY x.created_at,x.id LIMIT 32
  LOOP
    IF NOT pg_try_advisory_xact_lock(hashtextextended('production-marketing:address:'||candidate.normalized_email,0))
      THEN CONTINUE; END IF;
    SELECT * INTO message FROM private.production_marketing_messages WHERE id=candidate.id FOR UPDATE SKIP LOCKED;
    now_at_lock:=clock_timestamp();
    IF NOT FOUND OR message.state NOT IN ('held','uncertain') OR message.reconciliation_required
      OR message.next_attempt_at>now_at_lock OR message.lease_until>now_at_lock THEN CONTINUE; END IF;
    IF NOT private.production_marketing_eligible(message,now_at_lock)
      OR (p_direct AND private.production_marketing_direct_denied(candidate.direct_subject)) THEN
      UPDATE private.production_marketing_messages SET state='cancelled',reconciliation_required=first_prepared_at IS NOT NULL,
        lease_token=NULL,lease_until=NULL WHERE id=message.id;
      CONTINUE;
    END IF;
    UPDATE private.production_marketing_messages SET lease_token=p_lease,lease_until=now_at_lock+interval '60 seconds'
      WHERE id=message.id RETURNING * INTO message;
    SELECT jsonb_build_object('id',message.id,'subscriberId',s.id,'email',s.normalized_email,'purpose',message.purpose,
      'generation',message.generation,'revision',message.revision,'requestId',i.request_id,
      'issuedAt',private.production_marketing_iso(g.requested_at),
      'expiresAt',private.production_marketing_iso(CASE WHEN message.purpose='confirmation' THEN g.expires_at ELSE message.created_at+interval '24 hours' END),
      'confirmationHash',g.confirmation_hash,'preferenceHash',g.preference_hash,
      'envelope',CASE WHEN message.first_prepared_at IS NULL THEN i.delivery_payload END,
      'prepared',CASE WHEN message.first_prepared_at IS NOT NULL THEN private.production_marketing_prepared(message) END)
      INTO STRICT result
      FROM private.production_marketing_generations g JOIN private.production_marketing_confirmation_intents i USING(subscriber_id,generation)
      JOIN private.production_marketing_subscribers s ON s.id=g.subscriber_id
      WHERE (g.subscriber_id,g.generation)=(message.subscriber_id,message.generation);
    IF p_direct THEN RETURN result||jsonb_build_object('direct',true); END IF;
    RETURN result;
  END LOOP;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.claim_production_marketing_message(p_lease uuid) RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp
RETURN private.production_marketing_claim_generation(p_lease,false,NULL,NULL);
CREATE FUNCTION public.claim_direct_production_marketing_message(p_lease uuid,p_contract_hash text,p_worker_binding_hash text) RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp
RETURN private.production_marketing_claim_generation(p_lease,true,p_contract_hash,p_worker_binding_hash);

-- P2's first preparation and same-body retry share the final lock and eligibility
-- check. Only preparation can freeze content, generate a capability or spend the
-- first logical reservation. Retained cohorts keep their original P2 contract.
CREATE FUNCTION private.production_marketing_admit_generation(
  p_id uuid,p_lease uuid,p_contract_hash text,p_worker_binding_hash text,p_direct boolean,p_retry boolean,
  p_body text,p_preference_hash text
) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  message private.production_marketing_messages%ROWTYPE;
  controls private.production_marketing_controls%ROWTYPE;
  email text;
  subject_marker bytea;
  admitted_at timestamptz;
  expires_at_time timestamptz;
  body jsonb;
  contract jsonb;
  token text;
  preference_url text;
  with_topic boolean;
BEGIN
  IF p_lease IS NULL THEN RETURN NULL; END IF;
  IF p_direct THEN
    PERFORM FROM private.production_marketing_direct_policy WHERE singleton FOR SHARE;
    IF NOT FOUND THEN RETURN NULL; END IF;
  END IF;
  SELECT s.normalized_email,g.direct_subject INTO email,subject_marker
    FROM private.production_marketing_messages x JOIN private.production_marketing_subscribers s ON s.id=x.subscriber_id
    JOIN private.production_marketing_generations g ON (g.subscriber_id,g.generation)=(x.subscriber_id,x.generation)
    WHERE x.id=p_id AND (g.direct_subject IS NOT NULL)=p_direct;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('production-marketing:address:'||email,0));
  SELECT * INTO STRICT message FROM private.production_marketing_messages WHERE id=p_id FOR UPDATE;
  PERFORM pg_advisory_xact_lock(hashtextextended('production-marketing:quota',0));
  SELECT * INTO controls FROM private.production_marketing_controls WHERE singleton AND dispatch_enabled FOR SHARE;
  admitted_at:=clock_timestamp();
  IF NOT FOUND OR message.lease_token IS DISTINCT FROM p_lease OR message.lease_until IS NULL OR message.lease_until<=admitted_at
    OR controls.delivery_contract_text IS NULL OR p_contract_hash IS DISTINCT FROM encode(sha256(convert_to(controls.delivery_contract_text,'UTF8')),'hex')
    OR NOT private.production_marketing_eligible(message,admitted_at) THEN RETURN NULL; END IF;
  IF p_direct AND (NOT private.production_marketing_direct_ready(p_contract_hash,p_worker_binding_hash)
    OR private.production_marketing_direct_denied(subject_marker)) THEN RETURN NULL; END IF;

  IF p_retry THEN
    IF message.state<>'uncertain' OR message.first_prepared_at IS NULL OR message.contract_hash IS DISTINCT FROM p_contract_hash
      THEN RETURN NULL; END IF;
    IF NOT private.production_marketing_reserve(message.id,admitted_at) THEN RETURN NULL; END IF;
    UPDATE private.production_marketing_messages SET state='prepared',last_admitted_at=admitted_at
      WHERE id=p_id RETURNING * INTO message;
    RETURN private.production_marketing_prepared(message);
  END IF;

  IF message.state<>'held' OR message.first_prepared_at IS NOT NULL OR p_body IS NULL OR octet_length(p_body)>100000 THEN RETURN NULL; END IF;
  IF p_direct AND p_body IS NOT JSON OBJECT WITH UNIQUE KEYS THEN RETURN NULL; END IF;
  BEGIN body:=p_body::jsonb; contract:=controls.delivery_contract_text::jsonb;
    EXCEPTION WHEN invalid_text_representation THEN RETURN NULL; END;
  with_topic:=p_direct AND message.purpose='welcome';
  IF jsonb_typeof(body) IS DISTINCT FROM 'object' THEN RETURN NULL; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(body))<>8+with_topic::integer
    OR NOT (body ?& ARRAY['from','to','reply_to','subject','html','text','headers','tags'])
    OR (with_topic AND body->'topic_id' IS DISTINCT FROM contract->'topicId')
    OR body->>'from' IS DISTINCT FROM contract->>'from' OR body->>'reply_to' IS DISTINCT FROM contract->>'replyTo'
    OR body->'to' IS DISTINCT FROM jsonb_build_array(email)
    OR jsonb_typeof(body->'subject') IS DISTINCT FROM 'string' OR length(body->>'subject') NOT BETWEEN 1 AND 300 OR body->>'subject' ~ E'[\r\n]'
    OR jsonb_typeof(body->'html') IS DISTINCT FROM 'string' OR length(body->>'html')<1
    OR jsonb_typeof(body->'text') IS DISTINCT FROM 'string' OR length(body->>'text')<1
    OR body->'tags' IS DISTINCT FROM jsonb_build_array(jsonb_build_object('name','environment','value','production'),
      jsonb_build_object('name','helix_message_id','value',message.id),jsonb_build_object('name','helix_purpose','value',message.purpose),
      jsonb_build_object('name','helix_contract','value','production_welcome_delivery_v1')) THEN RETURN NULL; END IF;
  IF message.purpose='welcome' THEN
    IF EXISTS(SELECT FROM private.production_marketing_messages prior WHERE prior.subscriber_id=message.subscriber_id
        AND prior.purpose<>'confirmation' AND prior.first_prepared_at IS NOT NULL
        AND coalesce(prior.last_admitted_at,prior.first_prepared_at)>admitted_at-interval '24 hours')
      OR (SELECT count(*) FROM private.production_marketing_messages prior WHERE prior.subscriber_id=message.subscriber_id
        AND prior.purpose<>'confirmation' AND prior.first_prepared_at IS NOT NULL
        AND coalesce(prior.last_admitted_at,prior.first_prepared_at)>admitted_at-interval '7 days')>=3 THEN RETURN NULL; END IF;
    token:=substring(body->'headers'->>'List-Unsubscribe' FROM '^<https://www[.]helixskin[.]us/api/marketing/production/unsubscribe[?]token=([A-Za-z0-9_-]{43})>$');
    IF token IS NULL OR p_preference_hash IS DISTINCT FROM encode(sha256(convert_to(token,'UTF8')),'hex')
      OR body->'headers' IS DISTINCT FROM jsonb_build_object('List-Unsubscribe','<https://www.helixskin.us/api/marketing/production/unsubscribe?token='||token||'>',
        'List-Unsubscribe-Post','List-Unsubscribe=One-Click') THEN RETURN NULL; END IF;
    preference_url:='https://www.helixskin.us/marketing/production/preferences#token='||token;
    IF p_direct AND (strpos(body->>'html','href="'||preference_url||'"')=0 OR strpos(body->>'text',preference_url)=0) THEN RETURN NULL; END IF;
    expires_at_time:=admitted_at+interval '24 hours';
  ELSE
    IF p_preference_hash IS NOT NULL OR body->'headers' IS DISTINCT FROM '{}'::jsonb THEN RETURN NULL; END IF;
    SELECT expires_at INTO STRICT expires_at_time FROM private.production_marketing_generations
      WHERE (subscriber_id,generation)=(message.subscriber_id,message.generation);
  END IF;
  IF NOT private.production_marketing_reserve(message.id,admitted_at) THEN RETURN NULL; END IF;
  IF message.purpose='welcome' THEN
    INSERT INTO private.production_marketing_withdrawal_capabilities(hash,subscriber_id,message_id)
      VALUES(p_preference_hash,message.subscriber_id,message.id);
  END IF;
  UPDATE private.production_marketing_messages SET state='prepared',body_text=p_body,body_hash=encode(sha256(convert_to(p_body,'UTF8')),'hex'),
    contract_hash=p_contract_hash,first_prepared_at=admitted_at,last_admitted_at=admitted_at,payload_expires_at=expires_at_time,
    sender=contract->>'from',recipient=email WHERE id=p_id RETURNING * INTO message;
  IF message.purpose='confirmation' THEN
    UPDATE private.production_marketing_confirmation_intents SET state='cancelled',delivery_payload=NULL WHERE id=p_id;
  END IF;
  RETURN private.production_marketing_prepared(message);
END $$;

CREATE OR REPLACE FUNCTION public.prepare_production_marketing_message(
  p_id uuid,p_lease uuid,p_body text,p_preference_hash text,p_contract_hash text
) RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp
RETURN private.production_marketing_admit_generation(p_id,p_lease,p_contract_hash,NULL,false,false,p_body,p_preference_hash);
CREATE FUNCTION public.prepare_direct_production_marketing_message(
  p_id uuid,p_lease uuid,p_body text,p_preference_hash text,p_contract_hash text,p_worker_binding_hash text
) RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp
RETURN private.production_marketing_admit_generation(p_id,p_lease,p_contract_hash,p_worker_binding_hash,true,false,p_body,p_preference_hash);
CREATE OR REPLACE FUNCTION public.retry_production_marketing_message(p_id uuid,p_lease uuid,p_contract_hash text)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp
RETURN private.production_marketing_admit_generation(p_id,p_lease,p_contract_hash,NULL,false,true,NULL,NULL);
CREATE FUNCTION public.retry_direct_production_marketing_message(p_id uuid,p_lease uuid,p_contract_hash text,p_worker_binding_hash text)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp
RETURN private.production_marketing_admit_generation(p_id,p_lease,p_contract_hash,p_worker_binding_hash,true,true,NULL,NULL);

-- P3 remains the sole owner of delivery status and address suppression. Its
-- earlier receiver could bind a provider ID from a webhook before the send
-- response arrived. Only the retained non-shared lane keeps that behavior.
ALTER FUNCTION public.record_production_marketing_event(text,uuid,uuid,text,timestamptz,text,text,text,text,text)
  RENAME TO production_marketing_record_legacy_event;
ALTER FUNCTION public.production_marketing_record_legacy_event(text,uuid,uuid,text,timestamptz,text,text,text,text,text)
  SET SCHEMA private;
REVOKE ALL ON FUNCTION private.production_marketing_record_legacy_event(text,uuid,uuid,text,timestamptz,text,text,text,text,text)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.hold_direct_production_marketing_receipt(p_event_id text,p_message_id uuid,p_provider_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE observed bytea; previous bytea; address text;
BEGIN
  IF NOT private.production_marketing_direct_parent() THEN RETURN 'paused'; END IF;
  PERFORM FROM private.production_marketing_controls WHERE singleton AND events_enabled FOR SHARE;
  IF NOT FOUND THEN RETURN 'paused'; END IF;
  IF p_event_id IS NULL OR p_event_id !~ '^[A-Za-z0-9_-]{1,200}$' THEN
    RAISE EXCEPTION 'Invalid marketing receipt' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('production-marketing:event:'||p_event_id,0));
  observed:=sha256(convert_to(jsonb_build_array('claimed_delivery',p_event_id,p_message_id,p_provider_id)::text,'UTF8'));
  SELECT fingerprint INTO previous FROM private.production_marketing_direct_receipts WHERE event_id=p_event_id;
  IF previous=observed THEN RETURN 'duplicate'; END IF;
  INSERT INTO private.production_marketing_direct_receipts AS r(event_id,fingerprint,held,message_id,provider_id)
    VALUES(p_event_id,observed,true,p_message_id,p_provider_id)
    ON CONFLICT(event_id) DO UPDATE SET held=true WHERE NOT r.held;
  -- A recognizable but unprovable claim may isolate its *named* message. Never
  -- pick a subscriber from a shared From address, envelope recipient or unbound ID.
  SELECT s.normalized_email INTO address FROM private.production_marketing_messages m
    JOIN private.production_marketing_subscribers s ON s.id=m.subscriber_id WHERE m.id=p_message_id;
  IF FOUND THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('production-marketing:address:'||address,0));
    UPDATE private.production_marketing_messages SET reconciliation_required=true
      WHERE id=p_message_id AND NOT reconciliation_required;
  END IF;
  RETURN 'held';
END $$;

CREATE FUNCTION private.production_marketing_record_signed_event(
  p_strict boolean,p_event_id text,p_message_id uuid,p_provider_id uuid,p_event_type text,p_occurred_at timestamptz,
  p_sender text,p_recipient text,p_purpose text,p_contract_version text,p_environment text
) RETURNS text LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE m record; address text; shared boolean; observed text; previous text;
BEGIN
  IF NOT private.production_marketing_direct_parent() THEN RETURN 'paused'; END IF;
  PERFORM FROM private.production_marketing_controls WHERE singleton AND events_enabled FOR SHARE;
  IF NOT FOUND THEN RETURN 'paused'; END IF;
  IF p_event_id IS NULL OR p_event_id !~ '^[A-Za-z0-9_-]{1,200}$' OR p_event_type IS NULL OR p_event_type NOT IN
    ('email.sent','email.delivered','email.delivery_delayed','email.failed','email.bounced','email.complained','email.suppressed')
    THEN RETURN 'rejected'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('production-marketing:event:'||p_event_id,0));
  SELECT s.normalized_email INTO address FROM private.production_marketing_messages x
    JOIN private.production_marketing_subscribers s ON s.id=x.subscriber_id WHERE x.id=p_message_id;
  IF FOUND THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('production-marketing:address:'||address,0));
    -- Only correlation metadata is needed. Never read the token-bearing frozen body.
    SELECT x.sender,x.recipient,x.provider_id,x.state,x.purpose,x.first_prepared_at,x.body_hash,
      x.contract_hash,x.reconciliation_required,g.direct_subject IS NOT NULL AS direct
      INTO m FROM private.production_marketing_messages x JOIN private.production_marketing_generations g
      ON (g.subscriber_id,g.generation)=(x.subscriber_id,x.generation) WHERE x.id=p_message_id FOR UPDATE OF x;
    shared:=m.direct OR coalesce(m.sender='hello@helixskin.us',false) OR p_sender='hello@helixskin.us';
  ELSE
    -- A strict route carries a signed claim even if a submitted UUID was never ours.
    shared:=p_strict OR p_sender='hello@helixskin.us';
  END IF;
  IF shared THEN
    IF address IS NULL THEN
      PERFORM public.hold_direct_production_marketing_receipt(p_event_id,p_message_id,p_provider_id);
      RETURN 'recorded';
    END IF;
    IF p_provider_id IS NOT NULL
      AND p_occurred_at IS NOT NULL AND isfinite(p_occurred_at) AND p_occurred_at<=clock_timestamp()+interval '5 minutes'
      AND p_sender IS NOT NULL AND length(p_sender) BETWEEN 1 AND 320 AND p_sender !~ E'[\r\n]'
      AND p_recipient=address AND p_purpose=m.purpose AND m.sender=p_sender AND m.recipient=p_recipient
      AND m.body_hash IS NOT NULL AND m.contract_hash IS NOT NULL AND m.first_prepared_at IS NOT NULL
      AND p_occurred_at>=m.first_prepared_at-interval '5 minutes'
      AND p_contract_version='production_welcome_delivery_v1' AND p_environment='production' THEN
      -- Accept a replay of exactly the P3 fact already committed by the trusted
      -- receiver, including a retry reaching a previous deployment's narrower ABI.
      observed:=encode(sha256(convert_to(jsonb_build_array(p_message_id,p_provider_id,p_event_type,
        private.production_marketing_iso(p_occurred_at),p_sender,p_recipient,p_purpose,p_contract_version,p_environment)::text,'UTF8')),'hex');
      SELECT fingerprint INTO previous FROM private.production_marketing_events WHERE event_id=p_event_id;
      IF previous=observed THEN RETURN 'recorded'; END IF;
      IF previous IS NULL AND m.state='accepted' AND NOT m.reconciliation_required AND m.provider_id=p_provider_id
        AND (p_strict OR p_event_type NOT IN ('email.bounced','email.complained','email.suppressed'))
        AND NOT EXISTS (SELECT FROM private.production_marketing_direct_receipts WHERE event_id=p_event_id) THEN
        RETURN private.production_marketing_record_legacy_event(p_event_id,p_message_id,p_provider_id,p_event_type,p_occurred_at,
          p_sender,p_recipient,p_purpose,p_contract_version,p_environment);
      END IF;
    END IF;
    PERFORM public.hold_direct_production_marketing_receipt(p_event_id,p_message_id,p_provider_id);
    RETURN 'recorded';
  END IF;
  RETURN private.production_marketing_record_legacy_event(p_event_id,p_message_id,p_provider_id,p_event_type,p_occurred_at,
    p_sender,p_recipient,p_purpose,p_contract_version,p_environment);
END $$;

-- Only upgraded ingress has proved exact tag cardinality and envelope ownership.
CREATE FUNCTION public.record_direct_production_marketing_event(
  p_event_id text,p_message_id uuid,p_provider_id uuid,p_event_type text,p_occurred_at timestamptz,
  p_sender text,p_recipient text,p_purpose text,p_contract_version text,p_environment text
) RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp RETURN
  private.production_marketing_record_signed_event(true,p_event_id,p_message_id,p_provider_id,p_event_type,p_occurred_at,
    p_sender,p_recipient,p_purpose,p_contract_version,p_environment);
CREATE FUNCTION public.record_production_marketing_event(
  p_event_id text,p_message_id uuid,p_provider_id uuid,p_event_type text,p_occurred_at timestamptz,
  p_sender text,p_recipient text,p_purpose text,p_contract_version text,p_environment text
) RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp RETURN
  private.production_marketing_record_signed_event(false,p_event_id,p_message_id,p_provider_id,p_event_type,p_occurred_at,
    p_sender,p_recipient,p_purpose,p_contract_version,p_environment);

-- A stopped receiver may have missed signed denials. Re-enabling receipt
-- processing works immediately; send admission resumes after coverage is proven.
CREATE FUNCTION private.production_marketing_direct_pause_order() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN PERFORM FROM private.production_marketing_direct_policy WHERE singleton FOR UPDATE; RETURN NULL; END $$;
CREATE FUNCTION private.production_marketing_invalidate_direct_coverage() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  UPDATE private.production_marketing_direct_policy SET intake_evidence_sha256=NULL,revision=revision+1 WHERE singleton;
  RETURN NULL;
END $$;
CREATE TRIGGER direct_receiver_lock BEFORE UPDATE OF events_enabled ON private.production_marketing_controls
  FOR EACH STATEMENT EXECUTE FUNCTION private.production_marketing_direct_pause_order();
CREATE TRIGGER invalidate_direct_coverage AFTER UPDATE OF events_enabled ON private.production_marketing_controls
  FOR EACH ROW WHEN (OLD.events_enabled AND NOT NEW.events_enabled) EXECUTE FUNCTION private.production_marketing_invalidate_direct_coverage();

-- Restore only the explicitly supported service RPCs, including retained P1–P3
-- signatures. No role receives read/write access to markers or cryptographic keys.
DO $$ DECLARE f record; service oid:='service_role'::regrole; BEGIN
  FOR f IN SELECT p.oid,p.proowner,n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE (n.nspname='private' AND p.proname IN ('production_marketing_keep_direct_fact','production_marketing_direct_parent',
      'production_marketing_direct_subject','production_marketing_direct_denied','production_marketing_direct_contract_valid',
      'production_marketing_direct_ready','production_marketing_p1_request','production_marketing_apply_direct_denial',
      'production_marketing_import_direct_denial','production_marketing_claim_generation','production_marketing_admit_generation',
      'production_marketing_record_legacy_event','production_marketing_record_signed_event','production_marketing_direct_pause_order',
      'production_marketing_invalidate_direct_coverage'))
    OR (n.nspname='public' AND p.proname IN ('production_marketing_enrollment_ready','request_production_marketing_subscription',
      'request_qualified_production_marketing_subscription','claim_production_marketing_message','prepare_production_marketing_message',
      'retry_production_marketing_message','claim_direct_production_marketing_message','prepare_direct_production_marketing_message',
      'retry_direct_production_marketing_message','record_production_marketing_event','record_direct_production_marketing_event',
      'hold_direct_production_marketing_receipt','record_direct_production_marketing_preference')) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.oid::regprocedure);
    IF f.nspname='public' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.oid::regprocedure); END IF;
    IF EXISTS (SELECT FROM pg_proc p,LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      WHERE p.oid=f.oid AND a.grantee<>p.proowner AND (f.nspname<>'public' OR a.grantee<>service OR a.is_grantable))
      THEN RAISE EXCEPTION 'Unexpected direct marketing function grant'; END IF;
  END LOOP;
  IF EXISTS (SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace,
    LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
    WHERE n.nspname='private' AND c.relkind='r' AND c.relname IN ('production_marketing_direct_lookup_key',
      'production_marketing_direct_policy','production_marketing_direct_denials','production_marketing_direct_receipts')
    AND a.grantee<>c.relowner) THEN RAISE EXCEPTION 'Unexpected direct marketing data grant'; END IF;
END $$;
COMMIT;
