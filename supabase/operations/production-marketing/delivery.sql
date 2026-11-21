BEGIN;
-- Manual package for the new production store. No hosted installation or scheduler.
ALTER TABLE private.production_marketing_controls
  ADD COLUMN delivery_contract_text text CHECK(octet_length(delivery_contract_text)<=4096),
  ADD COLUMN confirmation_worker_binding_hash text CHECK(confirmation_worker_binding_hash ~ '^[a-f0-9]{64}$'),
  ADD COLUMN daily_limit integer NOT NULL DEFAULT 0 CHECK(daily_limit BETWEEN 0 AND 100000),
  ADD COLUMN monthly_limit integer NOT NULL DEFAULT 0 CHECK(monthly_limit BETWEEN 0 AND 1000000);

-- The operator records the HMAC of the qualified worker's credentials, target and content contract.
-- A contract edit must not carry that qualification forward, even on rollback.
CREATE FUNCTION private.production_marketing_clear_worker_qualification() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  NEW.confirmation_worker_binding_hash := NULL;
  RETURN NEW;
END $$;
CREATE TRIGGER production_marketing_contract_changed BEFORE UPDATE OF delivery_contract_text
  ON private.production_marketing_controls FOR EACH ROW
  WHEN (OLD.delivery_contract_text IS DISTINCT FROM NEW.delivery_contract_text
    AND OLD.confirmation_worker_binding_hash IS NOT DISTINCT FROM NEW.confirmation_worker_binding_hash)
  EXECUTE FUNCTION private.production_marketing_clear_worker_qualification();

CREATE FUNCTION public.production_marketing_enrollment_ready(p_contract_hash text,p_worker_binding_hash text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp
RETURN EXISTS (
  SELECT FROM private.production_marketing_controls AS c
  WHERE c.singleton AND c.enrollment_enabled AND c.dispatch_enabled AND c.daily_limit>0 AND c.monthly_limit>0
    AND c.confirmation_worker_binding_hash=p_worker_binding_hash
    AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(c.delivery_contract_text,'UTF8')),'hex')=p_contract_hash
);

CREATE FUNCTION public.request_qualified_production_marketing_subscription(
  p_contract_hash text,p_worker_binding_hash text,p_email text,p_confirmation_hash text,p_preference_hash text,p_requester_hash text,
  p_explicit_consent boolean,p_wording_version text,p_delivery_payload jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  -- Keep the verified controls fixed until the original consent transaction completes.
  PERFORM 1 FROM private.production_marketing_controls WHERE singleton FOR SHARE;
  IF NOT FOUND OR NOT public.production_marketing_enrollment_ready(p_contract_hash,p_worker_binding_hash) THEN
    RAISE EXCEPTION 'Enrollment unavailable' USING ERRCODE='55000';
  END IF;
  RETURN public.request_production_marketing_subscription(
    p_email,p_confirmation_hash,p_preference_hash,p_requester_hash,p_explicit_consent,p_wording_version,p_delivery_payload
  );
END $$;

CREATE TABLE private.production_marketing_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id uuid NOT NULL,
  generation bigint NOT NULL,
  revision bigint NOT NULL,
  purpose text NOT NULL CHECK(purpose IN ('confirmation','welcome')),
  state text NOT NULL DEFAULT 'held' CHECK(state IN ('held','prepared','uncertain','accepted','cancelled')),
  lease_token uuid,
  lease_until timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  first_prepared_at timestamptz,
  last_admitted_at timestamptz,
  payload_expires_at timestamptz,
  body_text text CHECK(octet_length(body_text)<=100000),
  body_hash text CHECK(body_hash ~ '^[a-f0-9]{64}$'),
  contract_hash text CHECK(contract_hash ~ '^[a-f0-9]{64}$'),
  sender text,
  recipient text,
  idempotency_key text NOT NULL UNIQUE,
  provider_id uuid,
  reconciliation_required boolean NOT NULL DEFAULT false,
  UNIQUE(subscriber_id,generation,purpose),
  FOREIGN KEY(subscriber_id,generation) REFERENCES private.production_marketing_generations(subscriber_id,generation),
  CHECK(body_text IS NULL OR (body_hash IS NOT NULL AND first_prepared_at IS NOT NULL AND payload_expires_at IS NOT NULL AND contract_hash IS NOT NULL))
);
CREATE UNIQUE INDEX production_marketing_provider_identity ON private.production_marketing_messages(provider_id) WHERE provider_id IS NOT NULL;
CREATE INDEX production_marketing_claim_candidates ON private.production_marketing_messages(next_attempt_at,created_at) WHERE state IN ('held','uncertain') AND NOT reconciliation_required;
CREATE INDEX production_marketing_body_cleanup ON private.production_marketing_messages(payload_expires_at,id) WHERE body_text IS NOT NULL;
CREATE INDEX production_marketing_confirmation_cleanup ON private.production_marketing_confirmation_intents(expires_at,id) WHERE delivery_payload IS NOT NULL;
CREATE TABLE private.production_marketing_withdrawal_capabilities (
  hash text PRIMARY KEY CHECK(hash ~ '^[a-f0-9]{64}$'),
  subscriber_id uuid NOT NULL REFERENCES private.production_marketing_subscribers(id),
  message_id uuid NOT NULL UNIQUE REFERENCES private.production_marketing_messages(id)
);
CREATE TABLE private.production_marketing_suppressions (
  subscriber_id uuid PRIMARY KEY REFERENCES private.production_marketing_subscribers(id),
  reason text NOT NULL CHECK(reason IN ('bounced','complained','suppressed')),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE private.production_marketing_quota_counters (
  kind text NOT NULL CHECK(kind IN ('day','month')), period date NOT NULL,
  used integer NOT NULL CHECK(used>0), PRIMARY KEY(kind,period)
);
CREATE TABLE private.production_marketing_quota_reservations (
  message_id uuid NOT NULL REFERENCES private.production_marketing_messages(id),
  kind text NOT NULL CHECK(kind IN ('day','month')), period date NOT NULL,
  PRIMARY KEY(message_id,kind,period)
);
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['messages','withdrawal_capabilities','suppressions','quota_counters','quota_reservations'] LOOP
    EXECUTE format('ALTER TABLE private.production_marketing_%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE private.production_marketing_%I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON private.production_marketing_%I FROM PUBLIC,anon,authenticated,service_role',t);
  END LOOP;
END $$;
CREATE FUNCTION private.production_marketing_iso(p_time timestamptz) RETURNS text LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$ SELECT to_char(p_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') $$;
CREATE FUNCTION private.production_marketing_admit_welcome() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private AS $$
DECLARE v_id uuid:=gen_random_uuid(); BEGIN
  -- Invoked only by the new explicit confirmation evidence transaction. No backfill.
  INSERT INTO private.production_marketing_messages(id,subscriber_id,generation,revision,purpose,idempotency_key)
    VALUES(v_id,NEW.subscriber_id,NEW.generation,NEW.revision,'welcome','production-marketing/'||v_id)
    ON CONFLICT(subscriber_id,generation,purpose) DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER production_marketing_confirmed_welcome AFTER INSERT ON private.production_marketing_evidence
  FOR EACH ROW WHEN(NEW.event='confirmed') EXECUTE FUNCTION private.production_marketing_admit_welcome();
CREATE FUNCTION private.production_marketing_message_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.subscriber_id IS DISTINCT FROM OLD.subscriber_id OR NEW.generation IS DISTINCT FROM OLD.generation
    OR NEW.revision IS DISTINCT FROM OLD.revision OR NEW.purpose IS DISTINCT FROM OLD.purpose OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'immutable message identity'; END IF;
  IF OLD.first_prepared_at IS NOT NULL AND (NEW.first_prepared_at IS DISTINCT FROM OLD.first_prepared_at OR NEW.payload_expires_at IS DISTINCT FROM OLD.payload_expires_at
    OR NEW.body_hash IS DISTINCT FROM OLD.body_hash OR NEW.contract_hash IS DISTINCT FROM OLD.contract_hash OR NEW.sender IS DISTINCT FROM OLD.sender
    OR NEW.recipient IS DISTINCT FROM OLD.recipient OR (NEW.body_text IS NOT NULL AND NEW.body_text IS DISTINCT FROM OLD.body_text)) THEN RAISE EXCEPTION 'immutable prepared message'; END IF;
  IF OLD.provider_id IS NOT NULL AND NEW.provider_id IS DISTINCT FROM OLD.provider_id THEN RAISE EXCEPTION 'immutable provider binding'; END IF;
  IF OLD.reconciliation_required AND NOT NEW.reconciliation_required THEN RAISE EXCEPTION 'reconciliation hold is restrictive'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER production_marketing_message_immutable BEFORE UPDATE ON private.production_marketing_messages
  FOR EACH ROW EXECUTE FUNCTION private.production_marketing_message_immutable();
CREATE FUNCTION private.production_marketing_eligible(m private.production_marketing_messages,p_now timestamptz) RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog,private AS $$
  SELECT EXISTS(SELECT 1 FROM private.production_marketing_subscribers s
    JOIN private.production_marketing_generations g ON g.subscriber_id=s.id AND g.generation=s.generation
    WHERE s.id=m.subscriber_id AND s.generation=m.generation AND s.revision=m.revision AND g.scope='welcome_only' AND g.wording_version='production_welcome_v1'
      AND NOT EXISTS(SELECT 1 FROM private.production_marketing_suppressions x WHERE x.subscriber_id=s.id)
      AND ((m.purpose='confirmation' AND s.state='pending' AND g.expires_at>p_now)
        OR (m.purpose='welcome' AND s.state='confirmed' AND (m.first_prepared_at IS NOT NULL OR m.created_at+interval '24 hours'>p_now))))
    AND NOT m.reconciliation_required
    AND (m.first_prepared_at IS NULL OR (m.body_text IS NOT NULL AND m.payload_expires_at>p_now AND m.first_prepared_at+interval '23 hours'>p_now));
$$;
CREATE FUNCTION private.production_marketing_reserve(p_id uuid,p_now timestamptz) RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog,private AS $$
DECLARE c private.production_marketing_controls%ROWTYPE; v_day date;
  v_month date; need_day boolean; need_month boolean;
BEGIN
  -- One shared quota lock, always after address then message. No network transaction.
  PERFORM pg_advisory_xact_lock(hashtextextended('production-marketing:quota',0));
  -- Runtime passes admission time captured after acquiring this lock; tests use explicit UTC dates.
  p_now:=coalesce(p_now,clock_timestamp());
  v_day:=(p_now AT TIME ZONE 'UTC')::date;
  v_month:=date_trunc('month',p_now AT TIME ZONE 'UTC')::date;
  SELECT * INTO c FROM private.production_marketing_controls WHERE singleton AND dispatch_enabled FOR SHARE;
  IF NOT FOUND OR c.daily_limit<=0 OR c.monthly_limit<=0 THEN RETURN false; END IF;
  need_day:=NOT EXISTS(SELECT 1 FROM private.production_marketing_quota_reservations WHERE message_id=p_id AND kind='day' AND period=v_day);
  need_month:=NOT EXISTS(SELECT 1 FROM private.production_marketing_quota_reservations WHERE message_id=p_id AND kind='month' AND period=v_month);
  IF (need_day AND coalesce((SELECT used FROM private.production_marketing_quota_counters WHERE kind='day' AND period=v_day),0)>=c.daily_limit)
    OR (need_month AND coalesce((SELECT used FROM private.production_marketing_quota_counters WHERE kind='month' AND period=v_month),0)>=c.monthly_limit) THEN RETURN false; END IF;
  IF need_day THEN
    INSERT INTO private.production_marketing_quota_reservations VALUES(p_id,'day',v_day);
    INSERT INTO private.production_marketing_quota_counters VALUES('day',v_day,1) ON CONFLICT(kind,period) DO UPDATE SET used=private.production_marketing_quota_counters.used+1;
  END IF;
  IF need_month THEN
    INSERT INTO private.production_marketing_quota_reservations VALUES(p_id,'month',v_month);
    INSERT INTO private.production_marketing_quota_counters VALUES('month',v_month,1) ON CONFLICT(kind,period) DO UPDATE SET used=private.production_marketing_quota_counters.used+1;
  END IF;
  RETURN true;
END $$;
CREATE FUNCTION private.production_marketing_prepared(m private.production_marketing_messages) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,private AS $$
  SELECT jsonb_build_object('body',m.body_text,'idempotencyKey',m.idempotency_key,'firstPreparedAt',private.production_marketing_iso(m.first_prepared_at),
    'admittedAt',private.production_marketing_iso(m.last_admitted_at),'payloadExpiresAt',private.production_marketing_iso(m.payload_expires_at),'leaseUntil',private.production_marketing_iso(m.lease_until));
$$;
CREATE FUNCTION public.cleanup_production_marketing_delivery() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private AS $$
DECLARE candidate record; m private.production_marketing_messages%ROWTYPE; n integer:=0;
BEGIN
  -- Address-first ordering also serializes cleanup with request/confirm/withdraw.
  FOR candidate IN SELECT i.id,s.normalized_email FROM private.production_marketing_confirmation_intents i JOIN private.production_marketing_subscribers s ON s.id=i.subscriber_id
    WHERE i.delivery_payload IS NOT NULL AND i.expires_at<=clock_timestamp() ORDER BY i.id LIMIT 100 LOOP
    IF NOT pg_try_advisory_xact_lock(hashtextextended('production-marketing:address:'||candidate.normalized_email,0)) THEN CONTINUE; END IF;
    UPDATE private.production_marketing_confirmation_intents SET state='cancelled',delivery_payload=NULL WHERE id=candidate.id AND expires_at<=clock_timestamp();
  END LOOP;
  FOR candidate IN SELECT x.id,s.normalized_email FROM private.production_marketing_messages x JOIN private.production_marketing_subscribers s ON s.id=x.subscriber_id
    WHERE x.body_text IS NOT NULL AND x.payload_expires_at<=clock_timestamp() ORDER BY x.id LIMIT 100 LOOP
    IF NOT pg_try_advisory_xact_lock(hashtextextended('production-marketing:address:'||candidate.normalized_email,0)) THEN CONTINUE; END IF;
    SELECT * INTO m FROM private.production_marketing_messages WHERE id=candidate.id FOR UPDATE SKIP LOCKED;
    IF FOUND AND m.payload_expires_at<=clock_timestamp() THEN
      UPDATE private.production_marketing_messages SET body_text=NULL,lease_token=NULL,lease_until=NULL,
        reconciliation_required=reconciliation_required OR state IN ('prepared','uncertain'),state=CASE WHEN state='prepared' THEN 'uncertain' ELSE state END WHERE id=m.id;
      n:=n+1;
    END IF;
  END LOOP;
  RETURN n;
END $$;
CREATE FUNCTION public.claim_production_marketing_message(p_lease uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private AS $$
DECLARE candidate record; m private.production_marketing_messages%ROWTYPE; v_now timestamptz; result jsonb;
BEGIN
  IF p_lease IS NULL OR NOT EXISTS(SELECT 1 FROM private.production_marketing_controls WHERE singleton AND dispatch_enabled AND delivery_contract_text IS NOT NULL) THEN RETURN NULL; END IF;
  INSERT INTO private.production_marketing_messages(id,subscriber_id,generation,revision,purpose,idempotency_key)
    SELECT i.id,i.subscriber_id,i.generation,i.request_revision,'confirmation','production-marketing/'||i.id
    FROM private.production_marketing_confirmation_intents i WHERE i.state='held' AND i.expires_at>clock_timestamp() ORDER BY i.created_at LIMIT 32
    ON CONFLICT(subscriber_id,generation,purpose) DO NOTHING;
  FOR candidate IN SELECT x.id,s.normalized_email FROM private.production_marketing_messages x JOIN private.production_marketing_subscribers s ON s.id=x.subscriber_id
    WHERE x.state IN ('held','uncertain') AND NOT x.reconciliation_required AND x.next_attempt_at<=clock_timestamp()
      AND (x.lease_until IS NULL OR x.lease_until<=clock_timestamp()) ORDER BY x.created_at,x.id LIMIT 32 LOOP
    IF NOT pg_try_advisory_xact_lock(hashtextextended('production-marketing:address:'||candidate.normalized_email,0)) THEN CONTINUE; END IF;
    SELECT * INTO m FROM private.production_marketing_messages WHERE id=candidate.id FOR UPDATE SKIP LOCKED;
    v_now:=clock_timestamp();
    IF NOT FOUND OR m.state NOT IN ('held','uncertain') OR m.reconciliation_required OR m.lease_until>v_now THEN CONTINUE; END IF;
    IF NOT private.production_marketing_eligible(m,v_now) THEN
      UPDATE private.production_marketing_messages SET state='cancelled',reconciliation_required=first_prepared_at IS NOT NULL,lease_token=NULL,lease_until=NULL WHERE id=m.id;
      CONTINUE;
    END IF;
    UPDATE private.production_marketing_messages SET lease_token=p_lease,lease_until=v_now+interval '60 seconds' WHERE id=m.id RETURNING * INTO m;
    SELECT jsonb_build_object('id',m.id,'subscriberId',s.id,'email',s.normalized_email,'purpose',m.purpose,'generation',m.generation,'revision',m.revision,
      'requestId',i.request_id,'issuedAt',private.production_marketing_iso(g.requested_at),
      'expiresAt',private.production_marketing_iso(CASE WHEN m.purpose='confirmation' THEN g.expires_at ELSE m.created_at+interval '24 hours' END),
      'confirmationHash',g.confirmation_hash,'preferenceHash',g.preference_hash,'envelope',CASE WHEN m.first_prepared_at IS NULL THEN i.delivery_payload ELSE NULL END,
      'prepared',CASE WHEN m.first_prepared_at IS NOT NULL THEN private.production_marketing_prepared(m) ELSE NULL END)
      INTO result FROM private.production_marketing_subscribers s JOIN private.production_marketing_generations g ON g.subscriber_id=s.id AND g.generation=m.generation
      JOIN private.production_marketing_confirmation_intents i ON i.subscriber_id=s.id AND i.generation=m.generation WHERE s.id=m.subscriber_id;
    RETURN result;
  END LOOP;
  RETURN NULL;
END $$;
CREATE FUNCTION public.prepare_production_marketing_message(p_id uuid,p_lease uuid,p_body text,p_preference_hash text,p_contract_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private AS $$
DECLARE m private.production_marketing_messages%ROWTYPE; c private.production_marketing_controls%ROWTYPE; v_email text; b jsonb; contract jsonb;
  v_now timestamptz; v_expires timestamptz; v_token text;
BEGIN
  SELECT s.normalized_email INTO v_email FROM private.production_marketing_messages x JOIN private.production_marketing_subscribers s ON s.id=x.subscriber_id WHERE x.id=p_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('production-marketing:address:'||v_email,0));
  SELECT * INTO m FROM private.production_marketing_messages WHERE id=p_id FOR UPDATE;
  PERFORM pg_advisory_xact_lock(hashtextextended('production-marketing:quota',0));
  v_now:=clock_timestamp();
  SELECT * INTO c FROM private.production_marketing_controls WHERE singleton AND dispatch_enabled FOR SHARE;
  IF NOT FOUND OR p_lease IS NULL OR m.lease_token IS NULL OR m.lease_until IS NULL OR m.lease_token IS DISTINCT FROM p_lease OR m.lease_until<=v_now OR m.state<>'held' OR m.first_prepared_at IS NOT NULL
    OR NOT private.production_marketing_eligible(m,v_now) OR c.delivery_contract_text IS NULL
    OR encode(sha256(convert_to(c.delivery_contract_text,'UTF8')),'hex') IS DISTINCT FROM p_contract_hash THEN RETURN NULL; END IF;
  IF p_body IS NULL OR octet_length(p_body)>100000 THEN RETURN NULL; END IF;
  BEGIN b:=p_body::jsonb;contract:=c.delivery_contract_text::jsonb; EXCEPTION WHEN invalid_text_representation THEN RETURN NULL; END;
  IF jsonb_typeof(b)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(b))<>8
    OR NOT(b ?& ARRAY['from','to','reply_to','subject','html','text','headers','tags'])
    OR b->>'from' IS DISTINCT FROM contract->>'from' OR b->>'reply_to' IS DISTINCT FROM contract->>'replyTo'
    OR b->'to' IS DISTINCT FROM jsonb_build_array(v_email)
    OR jsonb_typeof(b->'subject')<>'string' OR length(b->>'subject') NOT BETWEEN 1 AND 300 OR b->>'subject' ~ E'[\r\n]'
    OR jsonb_typeof(b->'html')<>'string' OR length(b->>'html')<1 OR jsonb_typeof(b->'text')<>'string' OR length(b->>'text')<1
    OR b->'tags' IS DISTINCT FROM jsonb_build_array(jsonb_build_object('name','environment','value','production'),jsonb_build_object('name','helix_message_id','value',m.id),
      jsonb_build_object('name','helix_purpose','value',m.purpose),jsonb_build_object('name','helix_contract','value','production_welcome_delivery_v1')) THEN RETURN NULL; END IF;
  IF m.purpose='welcome' THEN
    v_token:=substring(b->'headers'->>'List-Unsubscribe' FROM '^<https://www\.helixskin\.us/api/marketing/production/unsubscribe\?token=([A-Za-z0-9_-]{43})>$');
    IF v_token IS NULL OR p_preference_hash IS NULL OR encode(sha256(convert_to(v_token,'UTF8')),'hex')<>p_preference_hash
      OR b->'headers' IS DISTINCT FROM jsonb_build_object('List-Unsubscribe','<https://www.helixskin.us/api/marketing/production/unsubscribe?token='||v_token||'>','List-Unsubscribe-Post','List-Unsubscribe=One-Click') THEN RETURN NULL; END IF;
    v_expires:=v_now+interval '24 hours';
  ELSE
    IF p_preference_hash IS NOT NULL OR b->'headers' IS DISTINCT FROM '{}'::jsonb THEN RETURN NULL; END IF;
    SELECT expires_at INTO v_expires FROM private.production_marketing_generations WHERE subscriber_id=m.subscriber_id AND generation=m.generation;
  END IF;
  IF NOT private.production_marketing_reserve(m.id,v_now) THEN RETURN NULL; END IF;
  IF m.purpose='welcome' THEN INSERT INTO private.production_marketing_withdrawal_capabilities VALUES(p_preference_hash,m.subscriber_id,m.id); END IF;
  UPDATE private.production_marketing_messages SET state='prepared',body_text=p_body,body_hash=encode(sha256(convert_to(p_body,'UTF8')),'hex'),contract_hash=p_contract_hash,
    first_prepared_at=v_now,last_admitted_at=v_now,payload_expires_at=v_expires,sender=contract->>'from',recipient=v_email WHERE id=m.id RETURNING * INTO m;
  IF m.purpose='confirmation' THEN UPDATE private.production_marketing_confirmation_intents SET state='cancelled',delivery_payload=NULL WHERE id=m.id; END IF;
  RETURN private.production_marketing_prepared(m);
END $$;
CREATE FUNCTION public.retry_production_marketing_message(p_id uuid,p_lease uuid,p_contract_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private AS $$
DECLARE m private.production_marketing_messages%ROWTYPE; v_email text; v_now timestamptz; c private.production_marketing_controls%ROWTYPE;
BEGIN
  SELECT s.normalized_email INTO v_email FROM private.production_marketing_messages x JOIN private.production_marketing_subscribers s ON s.id=x.subscriber_id WHERE x.id=p_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('production-marketing:address:'||v_email,0));
  SELECT * INTO m FROM private.production_marketing_messages WHERE id=p_id FOR UPDATE;
  PERFORM pg_advisory_xact_lock(hashtextextended('production-marketing:quota',0));
  v_now:=clock_timestamp();
  SELECT * INTO c FROM private.production_marketing_controls WHERE singleton AND dispatch_enabled FOR SHARE;
  IF NOT FOUND OR p_lease IS NULL OR m.lease_token IS NULL OR m.lease_until IS NULL OR m.lease_token IS DISTINCT FROM p_lease OR m.lease_until<=v_now OR m.state<>'uncertain' OR m.first_prepared_at IS NULL
    OR NOT private.production_marketing_eligible(m,v_now) OR m.contract_hash IS DISTINCT FROM p_contract_hash
    OR encode(sha256(convert_to(c.delivery_contract_text,'UTF8')),'hex') IS DISTINCT FROM p_contract_hash THEN RETURN NULL; END IF;
  IF NOT private.production_marketing_reserve(m.id,v_now) THEN RETURN NULL; END IF;
  UPDATE private.production_marketing_messages SET state='prepared',last_admitted_at=v_now WHERE id=m.id RETURNING * INTO m;
  RETURN private.production_marketing_prepared(m);
END $$;
CREATE FUNCTION public.finish_production_marketing_message(p_id uuid,p_lease uuid,p_kind text,p_provider_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private AS $$
DECLARE m private.production_marketing_messages%ROWTYPE; v_email text; BEGIN
  SELECT s.normalized_email INTO v_email FROM private.production_marketing_messages x JOIN private.production_marketing_subscribers s ON s.id=x.subscriber_id WHERE x.id=p_id;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('production-marketing:address:'||v_email,0));
  SELECT * INTO m FROM private.production_marketing_messages WHERE id=p_id FOR UPDATE;
  IF p_lease IS NULL OR m.lease_token IS NULL OR m.lease_until IS NULL OR m.lease_token IS DISTINCT FROM p_lease OR m.lease_until<=clock_timestamp() OR m.state<>'prepared' OR p_kind IS NULL OR p_kind NOT IN ('accepted','uncertain')
    OR (p_kind='accepted' AND p_provider_id IS NULL) OR (p_kind='uncertain' AND p_provider_id IS NOT NULL) THEN RETURN false; END IF;
  IF p_kind='accepted' AND ((m.provider_id IS NOT NULL AND m.provider_id<>p_provider_id)
    OR EXISTS(SELECT 1 FROM private.production_marketing_messages WHERE provider_id=p_provider_id AND id<>m.id)) THEN
    UPDATE private.production_marketing_messages SET state='uncertain',reconciliation_required=true,lease_token=NULL,lease_until=NULL WHERE id=m.id; RETURN true;
  END IF;
  UPDATE private.production_marketing_messages SET state=p_kind,provider_id=CASE WHEN p_kind='accepted' THEN p_provider_id ELSE provider_id END,
    next_attempt_at=clock_timestamp()+interval '60 seconds',lease_token=NULL,lease_until=NULL WHERE id=m.id;
  RETURN true;
END $$;
CREATE FUNCTION public.defer_production_marketing_message(p_id uuid,p_lease uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private AS $$
DECLARE v_email text; BEGIN
  SELECT s.normalized_email INTO v_email FROM private.production_marketing_messages x JOIN private.production_marketing_subscribers s ON s.id=x.subscriber_id WHERE x.id=p_id;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('production-marketing:address:'||v_email,0));
  UPDATE private.production_marketing_messages SET lease_token=NULL,lease_until=NULL,next_attempt_at=clock_timestamp()+interval '60 seconds'
    WHERE id=p_id AND lease_token=p_lease AND lease_until>clock_timestamp() AND state IN ('held','uncertain');
  RETURN FOUND;
END $$;
-- Extend withdrawal authority with prepared welcome hashes; all old hashes remain valid.
CREATE OR REPLACE FUNCTION public.withdraw_production_marketing_subscription(p_token_hash text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private AS $$
DECLARE s private.production_marketing_subscribers%ROWTYPE; v_email text; BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' THEN RETURN false; END IF;
  SELECT sub.normalized_email INTO v_email FROM private.production_marketing_subscribers sub WHERE sub.id IN (
    SELECT gen.subscriber_id FROM private.production_marketing_generations gen WHERE gen.preference_hash=p_token_hash OR gen.confirmation_hash=p_token_hash
    UNION SELECT cap.subscriber_id FROM private.production_marketing_withdrawal_capabilities cap WHERE cap.hash=p_token_hash);
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('production-marketing:address:'||v_email,0));
  SELECT * INTO s FROM private.production_marketing_subscribers WHERE normalized_email=v_email FOR UPDATE;
  IF s.state='withdrawn' THEN RETURN true; END IF;
  UPDATE private.production_marketing_subscribers SET state='withdrawn',revision=revision+1,updated_at=clock_timestamp() WHERE id=s.id RETURNING * INTO s;
  INSERT INTO private.production_marketing_evidence(subscriber_id,generation,revision,event) VALUES(s.id,s.generation,s.revision,'withdrawn');
  UPDATE private.production_marketing_confirmation_intents SET state='cancelled',delivery_payload=NULL WHERE subscriber_id=s.id AND state='held';
  RETURN true;
END $$;
DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE (n.nspname='private' AND p.proname LIKE 'production_marketing_%') OR (n.nspname='public' AND p.proname IN (
      'production_marketing_enrollment_ready','request_qualified_production_marketing_subscription',
      'cleanup_production_marketing_delivery','claim_production_marketing_message','prepare_production_marketing_message','retry_production_marketing_message','finish_production_marketing_message','defer_production_marketing_message')) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
    IF f.signature::text NOT LIKE 'private.%' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature); END IF;
  END LOOP;
  IF EXISTS (
    SELECT FROM pg_catalog.pg_proc p, LATERAL pg_catalog.aclexplode(p.proacl) acl
    WHERE p.oid IN ('public.production_marketing_enrollment_ready(text,text)'::regprocedure,
      'public.request_qualified_production_marketing_subscription(text,text,text,text,text,text,boolean,text,jsonb)'::regprocedure)
      AND acl.grantee NOT IN (p.proowner,'service_role'::regrole::oid)
  ) THEN RAISE EXCEPTION 'unexpected production enrollment function grant'; END IF;
END $$;
COMMIT;
