-- Ticket #528 / Spec #527. Explicit operator installation ONLY, outside migration discovery.
-- No hosted target, credentials, cron, storage policy, network or operational identity is installed.
BEGIN;
DO $$ BEGIN
 IF current_user IN ('anon','authenticated','service_role','authenticator')
 OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
  RAISE EXCEPTION 'support_install_requires_trusted_operator';
 END IF;
END $$;
CREATE SCHEMA support_production_private;
REVOKE ALL ON SCHEMA support_production_private FROM PUBLIC,anon,authenticated,service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA support_production_private REVOKE ALL ON TABLES FROM PUBLIC,anon,authenticated,service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA support_production_private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE support_production_private.contract (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 project_ref text, contract_id text,
 admission_enabled boolean NOT NULL DEFAULT false,
 worker_enabled boolean NOT NULL DEFAULT false,
 full_media_qualified boolean NOT NULL DEFAULT false,
 isolation_qualified boolean NOT NULL DEFAULT false,
 operations_qualified boolean NOT NULL DEFAULT false,
 capacity_bytes bigint NOT NULL DEFAULT 0 CHECK(capacity_bytes>=0),
 reserved_bytes bigint NOT NULL DEFAULT 0 CHECK(reserved_bytes>=0 AND reserved_bytes<=capacity_bytes),
 source_hour_limit integer NOT NULL DEFAULT 0 CHECK(source_hour_limit>=0),
 email_hour_limit integer NOT NULL DEFAULT 0 CHECK(email_hour_limit>=0),
 global_hour_limit integer NOT NULL DEFAULT 0 CHECK(global_hour_limit>=0),
 CHECK ((project_ref IS NULL AND contract_id IS NULL) OR
 (project_ref ~ '^[a-z0-9-]{3,100}$' AND contract_id ~ '^[a-zA-Z0-9_-]{8,100}$'))
);
INSERT INTO support_production_private.contract(singleton) VALUES(true);
CREATE TABLE support_production_private.inquiries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), submission_id uuid NOT NULL UNIQUE,
 payload_hash text NOT NULL, capability_hash text NOT NULL,
 canonical_payload jsonb NOT NULL,
 declared_photo_count integer NOT NULL CHECK(declared_photo_count BETWEEN 0 AND 5),
 declared_photo_bytes bigint NOT NULL CHECK(declared_photo_bytes BETWEEN 0 AND 20971520),
 reserved_bytes bigint NOT NULL CHECK(reserved_bytes=declared_photo_count*14680064::bigint),
 preservation_hold boolean NOT NULL DEFAULT true CHECK(preservation_hold),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE support_production_private.abuse_windows (
 kind text NOT NULL CHECK(kind IN ('source','email','global','send-day')), digest text NOT NULL,
 window_at timestamptz NOT NULL, used integer NOT NULL CHECK(used>0),
 PRIMARY KEY(kind,digest,window_at)
);
CREATE TABLE support_production_private.outbox (
 id uuid PRIMARY KEY, inquiry_id uuid NOT NULL UNIQUE REFERENCES support_production_private.inquiries(id),
 contract_id text NOT NULL, delivery_token text NOT NULL UNIQUE,
 request_text text NOT NULL, request_hash text NOT NULL,
 idempotency_key text NOT NULL UNIQUE,
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','leased','unknown','accepted','reconciliation')),
 lease_id uuid, lease_until timestamptz,
 first_attempt_at timestamptz, attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count>=0),
 next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 provider_email_id uuid UNIQUE, rfc_message_id text UNIQUE,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK ((lease_id IS NULL)=(lease_until IS NULL)),
 CHECK ((first_attempt_at IS NULL)=(attempt_count=0))
);
-- Active work only: bound the ordered due scan and the oldest-first reconciliation scan.
CREATE INDEX support_prod_outbox_due ON support_production_private.outbox(next_attempt_at,created_at,id)
 WHERE state IN ('queued','leased','unknown');
CREATE INDEX support_prod_outbox_expiry ON support_production_private.outbox(first_attempt_at,id)
 WHERE state IN ('queued','leased','unknown') AND first_attempt_at IS NOT NULL;
CREATE TABLE support_production_private.leases (
 id uuid PRIMARY KEY, outbox_id uuid NOT NULL REFERENCES support_production_private.outbox(id),
 issued_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE support_production_private.sent_events (
 event_id text PRIMARY KEY, outbox_id uuid NOT NULL REFERENCES support_production_private.outbox(id),
 provider_email_id uuid NOT NULL, rfc_message_id text NOT NULL,
 received_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE FUNCTION support_production_private.reserve_provider_send(v_send_day timestamptz) RETURNS boolean
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 INSERT INTO support_production_private.abuse_windows AS budget(kind,digest,window_at,used)
 VALUES('send-day','global',v_send_day,1)
 ON CONFLICT(kind,digest,window_at) DO UPDATE SET used=budget.used+1 WHERE budget.used<20;
 RETURN FOUND;
END $$;

-- Triggers also protect against accidental future helper expansion. Trusted owners remain operators.
CREATE FUNCTION support_production_private.immutable_inquiry() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'support_record_immutable'; END $$;
CREATE TRIGGER immutable_inquiry BEFORE UPDATE OR DELETE ON support_production_private.inquiries
FOR EACH ROW EXECUTE FUNCTION support_production_private.immutable_inquiry();
CREATE FUNCTION support_production_private.immutable_outbox() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'support_record_preserved'; END IF;
 IF (NEW.id,NEW.inquiry_id,NEW.contract_id,NEW.delivery_token,NEW.request_text,NEW.request_hash,NEW.idempotency_key,NEW.created_at)
 IS DISTINCT FROM (OLD.id,OLD.inquiry_id,OLD.contract_id,OLD.delivery_token,OLD.request_text,OLD.request_hash,OLD.idempotency_key,OLD.created_at)
 OR (OLD.first_attempt_at IS NOT NULL AND NEW.first_attempt_at IS DISTINCT FROM OLD.first_attempt_at)
 OR NEW.attempt_count<OLD.attempt_count
 OR (OLD.provider_email_id IS NOT NULL AND NEW.provider_email_id IS DISTINCT FROM OLD.provider_email_id)
 OR (OLD.rfc_message_id IS NOT NULL AND NEW.rfc_message_id IS DISTINCT FROM OLD.rfc_message_id)
 THEN RAISE EXCEPTION 'support_outbox_immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_outbox BEFORE UPDATE OR DELETE ON support_production_private.outbox
FOR EACH ROW EXECUTE FUNCTION support_production_private.immutable_outbox();

CREATE FUNCTION support_production_private.validate_input(v jsonb, allowed text[], required text[]) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF v IS NULL OR jsonb_typeof(v)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(v) k WHERE NOT(k=ANY(allowed)))
 OR EXISTS(SELECT 1 FROM unnest(required) k WHERE NOT(v ? k) OR v->k='null'::jsonb) THEN
 RAISE EXCEPTION 'support_invalid_input'; END IF;
END $$;
CREATE FUNCTION support_production_private.identity_matches(v jsonb) RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT coalesce((SELECT project_ref=v->>'projectRef' AND contract_id=v->>'contractId'
 FROM support_production_private.contract WHERE singleton),false)
$$;
CREATE FUNCTION public.read_support_prod_contract() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('projectRef',project_ref,'contractId',contract_id,
 'admissionEnabled',admission_enabled,'workerEnabled',worker_enabled,
 'fullMediaQualified',full_media_qualified,'isolationQualified',isolation_qualified,'operationsQualified',operations_qualified)
 FROM support_production_private.contract WHERE singleton
$$;

CREATE FUNCTION public.submit_support_prod_inquiry(p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c support_production_private.contract%ROWTYPE; prior support_production_private.inquiries%ROWTYPE;
 v_id uuid; v_submission uuid; v_outbox uuid; v_token text; v_payload jsonb; v_request text;
 v_photo jsonb; v_count integer; v_total bigint:=0; v_size bigint; v_reserved bigint;
 v_window timestamptz:=date_trunc('hour',clock_timestamp()); v_limit integer; v_digest text; v_kind text; v_used integer;
BEGIN
 PERFORM support_production_private.validate_input(p_input,
 ARRAY['projectRef','contractId','submissionId','payloadHash','capabilityHash','sourceHash','emailHash','name','email','inquiryType','subject','body','photos'],
 ARRAY['projectRef','contractId','submissionId','payloadHash','capabilityHash','sourceHash','emailHash','name','email','inquiryType','subject','body','photos']);
 IF EXISTS(SELECT 1 FROM jsonb_each(p_input) e WHERE e.key<>'photos' AND jsonb_typeof(e.value)<>'string')
 OR p_input->>'submissionId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 OR EXISTS(SELECT 1 FROM unnest(ARRAY['payloadHash','capabilityHash','sourceHash','emailHash']) k WHERE p_input->>k !~ '^[0-9a-f]{64}$')
 OR length(btrim(p_input->>'name')) NOT BETWEEN 1 AND 100 OR p_input->>'name' ~ '[[:cntrl:]]'
 OR length(p_input->>'email')>254 OR p_input->>'email'<>lower(p_input->>'email')
 OR p_input->>'email' !~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$'
 OR p_input->>'email' ~ '[[:cntrl:]]'
 OR p_input->>'inquiryType' NOT IN ('product','routine','account','cart','accessibility','privacy','partnership','wholesale','general')
 OR length(btrim(p_input->>'subject')) NOT BETWEEN 1 AND 200 OR p_input->>'subject' ~ '[[:cntrl:]]'
 OR length(btrim(p_input->>'body')) NOT BETWEEN 1 AND 10000
 OR translate(p_input->>'body',E'\n\t','') ~ '[[:cntrl:]]'
 OR jsonb_typeof(p_input->'photos')<>'array' THEN RAISE EXCEPTION 'support_invalid_input'; END IF;
 v_count:=jsonb_array_length(p_input->'photos');
 IF v_count>5 THEN RAISE EXCEPTION 'support_invalid_photos'; END IF;
 FOR v_photo IN SELECT value FROM jsonb_array_elements(p_input->'photos') LOOP
  PERFORM support_production_private.validate_input(v_photo,ARRAY['uploadId','contentType','byteSize'],ARRAY['uploadId','contentType','byteSize']);
  IF jsonb_typeof(v_photo->'uploadId')<>'string' OR v_photo->>'uploadId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  OR jsonb_typeof(v_photo->'contentType')<>'string' OR v_photo->>'contentType' NOT IN ('image/jpeg','image/png','image/webp')
  OR jsonb_typeof(v_photo->'byteSize')<>'number' OR v_photo->>'byteSize' !~ '^[0-9]{1,8}$' THEN RAISE EXCEPTION 'support_invalid_photos'; END IF;
  v_size:=(v_photo->>'byteSize')::bigint;
  IF v_size NOT BETWEEN 1 AND 10485760 THEN RAISE EXCEPTION 'support_invalid_photos'; END IF;
  v_total:=v_total+v_size;
 END LOOP;
 IF v_total>20971520 OR (SELECT count(DISTINCT value->>'uploadId') FROM jsonb_array_elements(p_input->'photos'))<>v_count THEN
 RAISE EXCEPTION 'support_invalid_photos'; END IF;
 v_submission:=(p_input->>'submissionId')::uuid;
 v_payload:=p_input-ARRAY['projectRef','contractId','submissionId','payloadHash','capabilityHash','sourceHash','emailHash'];
 -- One row lock makes all independent quotas, capacity, deduplication and reservation atomic.
 SELECT * INTO c FROM support_production_private.contract WHERE singleton FOR UPDATE;
 IF NOT support_production_private.identity_matches(p_input) THEN RAISE EXCEPTION 'support_wrong_contract'; END IF;
 SELECT * INTO prior FROM support_production_private.inquiries WHERE submission_id=v_submission;
 IF FOUND THEN
  IF prior.payload_hash<>p_input->>'payloadHash' OR prior.capability_hash<>p_input->>'capabilityHash' OR prior.canonical_payload<>v_payload THEN
   RAISE EXCEPTION 'support_submission_conflict'; END IF;
  SELECT id INTO v_outbox FROM support_production_private.outbox WHERE inquiry_id=prior.id;
  RETURN jsonb_build_object('inquiryId',prior.id,'submissionId',prior.submission_id,'status','saved','outboxId',v_outbox,'photoStatus','declared','reservedBytes',prior.reserved_bytes);
 END IF;
 IF NOT(c.admission_enabled AND c.full_media_qualified AND c.isolation_qualified AND c.operations_qualified) THEN RAISE EXCEPTION 'support_admission_closed'; END IF;
 v_reserved:=v_count*14680064::bigint;
 IF c.reserved_bytes+v_reserved>c.capacity_bytes THEN RAISE EXCEPTION 'support_capacity_exhausted'; END IF;
 FOREACH v_kind IN ARRAY ARRAY['source','email','global'] LOOP
  v_digest:=CASE v_kind WHEN 'source' THEN p_input->>'sourceHash' WHEN 'email' THEN p_input->>'emailHash' ELSE 'global' END;
  v_limit:=CASE v_kind WHEN 'source' THEN c.source_hour_limit WHEN 'email' THEN c.email_hour_limit ELSE c.global_hour_limit END;
  SELECT used INTO v_used FROM support_production_private.abuse_windows WHERE kind=v_kind AND digest=v_digest AND window_at=v_window;
  IF coalesce(v_used,0)>=v_limit THEN RAISE EXCEPTION 'support_rate_limited'; END IF;
  INSERT INTO support_production_private.abuse_windows(kind,digest,window_at,used) VALUES(v_kind,v_digest,v_window,1)
  ON CONFLICT(kind,digest,window_at) DO UPDATE SET used=support_production_private.abuse_windows.used+1;
 END LOOP;
 INSERT INTO support_production_private.inquiries(submission_id,payload_hash,capability_hash,canonical_payload,declared_photo_count,declared_photo_bytes,reserved_bytes)
 VALUES(v_submission,p_input->>'payloadHash',p_input->>'capabilityHash',v_payload,v_count,v_total,v_reserved) RETURNING id INTO v_id;
 UPDATE support_production_private.contract SET reserved_bytes=reserved_bytes+v_reserved WHERE singleton;
 v_outbox:=gen_random_uuid(); v_token:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
 v_request:=jsonb_build_object('from','Helix Website <contact@helixskin.us>','to',jsonb_build_array('support@helixskin.us'),
 'reply_to',p_input->>'email','subject','Helix Website inquiry '||v_outbox,
 'text',E'Unverified visitor content: visitor-provided identity and Reply-To are unverified. Do not disclose Account, Order or private information based on them.\n\nInquiry: '||v_id||E'\nType: '||(p_input->>'inquiryType')||E'\nName: '||(p_input->>'name')||E'\nEmail: '||(p_input->>'email')||E'\nSubject: '||(p_input->>'subject')||E'\n\n'||(p_input->>'body'),
 'tags',jsonb_build_array(jsonb_build_object('name','helix_support_outbox','value',v_outbox::text),
 jsonb_build_object('name','helix_support_contract','value',c.contract_id),jsonb_build_object('name','helix_support_delivery','value',v_token)))::text;
 INSERT INTO support_production_private.outbox(id,inquiry_id,contract_id,delivery_token,request_text,request_hash,idempotency_key)
 VALUES(v_outbox,v_id,c.contract_id,v_token,v_request,encode(sha256(convert_to(v_request,'UTF8')),'hex'),'support-primary:'||v_outbox);
 RETURN jsonb_build_object('inquiryId',v_id,'submissionId',v_submission,'status','saved','outboxId',v_outbox,'photoStatus','declared','reservedBytes',v_reserved);
END $$;

CREATE FUNCTION public.claim_support_prod_outbox(p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c support_production_private.contract%ROWTYPE; v_id uuid; v_lease uuid; v_seconds integer;
BEGIN
 PERFORM support_production_private.validate_input(p_input,ARRAY['projectRef','contractId','leaseId','leaseSeconds'],ARRAY['projectRef','contractId','leaseId','leaseSeconds']);
 IF jsonb_typeof(p_input->'leaseId')<>'string' OR p_input->>'leaseId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 OR jsonb_typeof(p_input->'leaseSeconds')<>'number' OR p_input->>'leaseSeconds' !~ '^[0-9]{2,3}$' THEN RAISE EXCEPTION 'support_invalid_input'; END IF;
 v_lease:=(p_input->>'leaseId')::uuid; v_seconds:=(p_input->>'leaseSeconds')::integer;
 IF v_seconds NOT BETWEEN 30 AND 120 THEN RAISE EXCEPTION 'support_invalid_input'; END IF;
 SELECT * INTO c FROM support_production_private.contract WHERE singleton FOR SHARE;
 IF NOT support_production_private.identity_matches(p_input) THEN RAISE EXCEPTION 'support_wrong_contract'; END IF;
 IF NOT(c.worker_enabled AND c.full_media_qualified AND c.isolation_qualified AND c.operations_qualified) THEN RETURN NULL; END IF;
 -- Expired uncertain requests cannot escape the provider's conservative 20-hour window.
 WITH expired AS (
  SELECT id FROM support_production_private.outbox
  WHERE state IN ('queued','leased','unknown') AND first_attempt_at<=clock_timestamp()-interval '20 hours'
  AND (lease_until IS NULL OR lease_until<=clock_timestamp())
  ORDER BY first_attempt_at,id FOR UPDATE SKIP LOCKED LIMIT 20
 )
 UPDATE support_production_private.outbox o SET state='reconciliation',lease_id=NULL,lease_until=NULL
 FROM expired WHERE o.id=expired.id;
 SELECT id INTO v_id FROM support_production_private.outbox WHERE state IN ('queued','leased','unknown')
 AND (lease_until IS NULL OR lease_until<=clock_timestamp()) AND next_attempt_at<=clock_timestamp()
 AND (first_attempt_at IS NULL OR first_attempt_at>clock_timestamp()-interval '20 hours')
 ORDER BY next_attempt_at,created_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 INSERT INTO support_production_private.leases(id,outbox_id) VALUES(v_lease,v_id) ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE support_production_private.outbox SET state='leased',lease_id=v_lease,lease_until=clock_timestamp()+make_interval(secs=>v_seconds) WHERE id=v_id;
 RETURN jsonb_build_object('outboxId',v_id,'leaseId',v_lease);
END $$;

CREATE FUNCTION public.start_support_prod_send(p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c support_production_private.contract%ROWTYPE; o support_production_private.outbox%ROWTYPE; v_send_day timestamptz;
BEGIN
 PERFORM support_production_private.validate_input(p_input,ARRAY['projectRef','contractId','outboxId','leaseId'],ARRAY['projectRef','contractId','outboxId','leaseId']);
 IF p_input->>'outboxId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR p_input->>'leaseId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'support_invalid_input'; END IF;
 SELECT * INTO c FROM support_production_private.contract WHERE singleton FOR SHARE;
 IF NOT support_production_private.identity_matches(p_input) THEN RAISE EXCEPTION 'support_wrong_contract'; END IF;
 IF NOT(c.worker_enabled AND c.full_media_qualified AND c.isolation_qualified AND c.operations_qualified) THEN RETURN NULL; END IF;
 SELECT * INTO o FROM support_production_private.outbox WHERE id=(p_input->>'outboxId')::uuid FOR UPDATE;
 IF NOT FOUND OR o.state<>'leased' OR o.lease_id IS DISTINCT FROM (p_input->>'leaseId')::uuid OR o.lease_until<=clock_timestamp() THEN RETURN NULL; END IF;
 IF o.first_attempt_at<=clock_timestamp()-interval '20 hours' THEN
  UPDATE support_production_private.outbox SET state='reconciliation',lease_id=NULL,lease_until=NULL WHERE id=o.id; RETURN NULL;
 END IF;
 v_send_day:=date_trunc('day',clock_timestamp(),'UTC');
 IF NOT support_production_private.reserve_provider_send(v_send_day) THEN
  UPDATE support_production_private.outbox SET state=CASE WHEN o.first_attempt_at IS NULL THEN 'queued' ELSE 'unknown' END,
   next_attempt_at=v_send_day+interval '24 hours',lease_id=NULL,lease_until=NULL WHERE id=o.id;
  RETURN NULL;
 END IF;
 -- State is set to unknown before handoff: process death can never erase the first-attempt marker.
 UPDATE support_production_private.outbox SET first_attempt_at=coalesce(first_attempt_at,clock_timestamp()),attempt_count=attempt_count+1,state='unknown'
 WHERE id=o.id RETURNING * INTO o;
 RETURN jsonb_build_object('outboxId',o.id,'requestText',o.request_text,'requestHash',o.request_hash,
 'idempotencyKey',o.idempotency_key,'attemptCount',o.attempt_count,'firstAttemptAt',o.first_attempt_at,'budgetDay',v_send_day);
END $$;

CREATE FUNCTION public.complete_support_prod_send(p_input jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o support_production_private.outbox%ROWTYPE; v_provider uuid;
BEGIN
 PERFORM support_production_private.validate_input(p_input,ARRAY['projectRef','contractId','outboxId','leaseId','outcome','providerEmailId'],ARRAY['projectRef','contractId','outboxId','leaseId','outcome']);
 IF p_input->>'outboxId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR p_input->>'leaseId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 OR p_input->>'outcome' NOT IN ('accepted','unknown','rejected') THEN RAISE EXCEPTION 'support_invalid_input'; END IF;
 IF NOT support_production_private.identity_matches(p_input) THEN RAISE EXCEPTION 'support_wrong_contract'; END IF;
 PERFORM 1 FROM support_production_private.contract WHERE singleton FOR UPDATE;
 IF p_input->>'outcome'='accepted' THEN
  IF coalesce(p_input->>'providerEmailId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'support_invalid_input'; END IF;
  v_provider:=(p_input->>'providerEmailId')::uuid;
 ELSIF p_input->>'providerEmailId' IS NOT NULL THEN RAISE EXCEPTION 'support_invalid_input'; END IF;
 SELECT * INTO o FROM support_production_private.outbox WHERE id=(p_input->>'outboxId')::uuid FOR UPDATE;
 IF NOT FOUND OR o.state<>'unknown' OR o.first_attempt_at IS NULL OR o.lease_id IS DISTINCT FROM (p_input->>'leaseId')::uuid OR o.lease_until<=clock_timestamp() THEN RETURN false; END IF;
 IF v_provider IS NOT NULL AND ((o.provider_email_id IS NOT NULL AND o.provider_email_id<>v_provider)
 OR EXISTS(SELECT 1 FROM support_production_private.outbox WHERE provider_email_id=v_provider AND id<>o.id)) THEN RETURN false; END IF;
 UPDATE support_production_private.outbox SET provider_email_id=coalesce(provider_email_id,v_provider),
 state=CASE WHEN v_provider IS NOT NULL THEN 'accepted' WHEN p_input->>'outcome'='rejected' OR first_attempt_at<=clock_timestamp()-interval '20 hours' THEN 'reconciliation' ELSE 'unknown' END,
 lease_id=NULL,lease_until=NULL,next_attempt_at=clock_timestamp()+interval '1 minute' WHERE id=o.id;
 RETURN true;
END $$;

CREATE FUNCTION public.record_support_prod_sent(p_input jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o support_production_private.outbox%ROWTYPE; e support_production_private.sent_events%ROWTYPE; v_provider uuid;
BEGIN
 PERFORM support_production_private.validate_input(p_input,ARRAY['projectRef','contractId','outboxId','deliveryToken','providerEmailId','messageId','from','to','eventId'],ARRAY['projectRef','contractId','outboxId','deliveryToken','providerEmailId','messageId','from','to','eventId']);
 IF EXISTS(SELECT 1 FROM jsonb_each(p_input) j WHERE jsonb_typeof(j.value)<>'string')
 OR p_input->>'outboxId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR p_input->>'providerEmailId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 OR p_input->>'deliveryToken' !~ '^[0-9a-f]{64}$'
 OR length(p_input->>'messageId')>998 OR p_input->>'messageId' !~ '^<[^<>[:space:][:cntrl:]]+@[^<>[:space:][:cntrl:]]+>$'
 OR p_input->>'eventId' !~ '^[a-zA-Z0-9_-]{1,200}$' THEN RAISE EXCEPTION 'support_invalid_input'; END IF;
 IF NOT support_production_private.identity_matches(p_input) THEN RAISE EXCEPTION 'support_wrong_contract'; END IF;
 IF p_input->>'from'<>'Helix Website <contact@helixskin.us>' OR p_input->>'to'<>'support@helixskin.us' THEN RETURN 'unmatched'; END IF;
 -- Contract lock serializes bindings across different outboxes, not just duplicate callbacks.
 PERFORM 1 FROM support_production_private.contract WHERE singleton FOR UPDATE;
 SELECT * INTO o FROM support_production_private.outbox WHERE id=(p_input->>'outboxId')::uuid FOR UPDATE;
 IF NOT FOUND OR o.first_attempt_at IS NULL OR o.delivery_token<>p_input->>'deliveryToken' OR o.contract_id<>p_input->>'contractId' THEN RETURN 'unmatched'; END IF;
 v_provider:=(p_input->>'providerEmailId')::uuid;
 SELECT * INTO e FROM support_production_private.sent_events WHERE event_id=p_input->>'eventId';
 IF FOUND THEN
  IF e.outbox_id=o.id AND e.provider_email_id=v_provider AND e.rfc_message_id=p_input->>'messageId' THEN RETURN 'duplicate'; END IF;
  RETURN 'conflict';
 END IF;
 IF (o.provider_email_id IS NOT NULL AND o.provider_email_id<>v_provider)
 OR (o.rfc_message_id IS NOT NULL AND o.rfc_message_id<>p_input->>'messageId')
 OR EXISTS(SELECT 1 FROM support_production_private.outbox WHERE id<>o.id AND (provider_email_id=v_provider OR rfc_message_id=p_input->>'messageId')) THEN RETURN 'conflict'; END IF;
 UPDATE support_production_private.outbox SET provider_email_id=v_provider,rfc_message_id=p_input->>'messageId',state='accepted',lease_id=NULL,lease_until=NULL WHERE id=o.id;
 INSERT INTO support_production_private.sent_events(event_id,outbox_id,provider_email_id,rfc_message_id)
 VALUES(p_input->>'eventId',o.id,v_provider,p_input->>'messageId');
 RETURN 'matched';
END $$;

DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='support_production_private' LOOP
  EXECUTE format('ALTER TABLE support_production_private.%I ENABLE ROW LEVEL SECURITY',r.tablename);
  EXECUTE format('ALTER TABLE support_production_private.%I FORCE ROW LEVEL SECURITY',r.tablename);
 END LOOP;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA support_production_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA support_production_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA support_production_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.read_support_prod_contract() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_support_prod_contract() TO service_role;
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['submit_support_prod_inquiry','claim_support_prod_outbox','start_support_prod_send','complete_support_prod_send','record_support_prod_sent'] LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION public.%I(jsonb) FROM PUBLIC,anon,authenticated,service_role',n);
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(jsonb) TO service_role',n);
 END LOOP;
END $$;
COMMIT;
