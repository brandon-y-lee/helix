BEGIN;
-- Production consent is deliberately separate from every historical sandbox record.
-- No provider worker or activation/configuration RPC is introduced by this migration.
CREATE TABLE private.production_marketing_controls (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  enrollment_enabled boolean NOT NULL DEFAULT false,
  dispatch_enabled boolean NOT NULL DEFAULT false
);
INSERT INTO private.production_marketing_controls DEFAULT VALUES;
CREATE TABLE private.production_marketing_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_email text NOT NULL UNIQUE CHECK (normalized_email=lower(btrim(normalized_email)) AND length(normalized_email)<=254),
  revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
  generation bigint NOT NULL DEFAULT 1 CHECK(generation>0),
  state text NOT NULL CHECK(state IN ('pending','confirmed','withdrawn')),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE private.production_marketing_generations (
  subscriber_id uuid NOT NULL REFERENCES private.production_marketing_subscribers(id),
  generation bigint NOT NULL,
  request_revision bigint NOT NULL,
  scope text NOT NULL DEFAULT 'welcome_only' CHECK(scope='welcome_only'),
  wording_version text NOT NULL CHECK(wording_version='production_welcome_v1'),
  requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '24 hours',
  confirmation_hash text NOT NULL UNIQUE CHECK(confirmation_hash ~ '^[a-f0-9]{64}$'),
  preference_hash text NOT NULL UNIQUE CHECK(preference_hash ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY(subscriber_id,generation),
  UNIQUE(subscriber_id,generation,request_revision)
);
CREATE TABLE private.production_marketing_evidence (
  subscriber_id uuid NOT NULL,
  generation bigint NOT NULL,
  revision bigint NOT NULL,
  event text NOT NULL CHECK(event IN ('requested','confirmed','withdrawn')),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(subscriber_id,revision),
  FOREIGN KEY(subscriber_id,generation) REFERENCES private.production_marketing_generations(subscriber_id,generation)
);
CREATE TABLE private.production_marketing_confirmation_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id uuid NOT NULL,
  generation bigint NOT NULL,
  request_revision bigint NOT NULL,
  request_id uuid NOT NULL UNIQUE,
  delivery_payload jsonb,
  expires_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'held' CHECK(state IN ('held','cancelled')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(subscriber_id,generation),
  CHECK((state='held' AND delivery_payload IS NOT NULL) OR (state='cancelled' AND delivery_payload IS NULL)),
  FOREIGN KEY(subscriber_id,generation,request_revision) REFERENCES private.production_marketing_generations(subscriber_id,generation,request_revision)
);
CREATE TABLE private.production_marketing_request_limits (
  kind text NOT NULL CHECK(kind IN ('address','requester','global')),
  key text NOT NULL,
  period timestamptz NOT NULL,
  issued integer NOT NULL CHECK(issued>0),
  PRIMARY KEY(kind,key,period)
);
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['controls','subscribers','generations','evidence','confirmation_intents','request_limits'] LOOP
    EXECUTE format('ALTER TABLE private.production_marketing_%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE private.production_marketing_%I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON private.production_marketing_%I FROM PUBLIC,anon,authenticated,service_role',t);
  END LOOP;
END $$;
CREATE FUNCTION public.request_production_marketing_subscription(p_email text,p_confirmation_hash text,p_preference_hash text,p_requester_hash text,p_explicit_consent boolean,p_wording_version text,p_delivery_payload jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private AS $$
DECLARE
  v_email text:=lower(btrim(p_email));
  v_now timestamptz:=clock_timestamp();
  v_hour timestamptz:=date_trunc('hour',v_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_day timestamptz:=date_trunc('day',v_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  s private.production_marketing_subscribers%ROWTYPE;
  v_issued timestamptz;
  v_expires timestamptz;
  v_request_id uuid;
  v_value text;
BEGIN
  IF jsonb_typeof(p_delivery_payload) IS DISTINCT FROM 'object' OR octet_length(p_delivery_payload::text)>8192
    OR (SELECT count(*) FROM jsonb_object_keys(p_delivery_payload))<>8
    OR NOT (p_delivery_payload ?& ARRAY['version','keyId','requestId','issuedAt','expiresAt','iv','tag','ciphertext'])
    OR p_delivery_payload->'version' IS DISTINCT FROM '1'::jsonb THEN RETURN false; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_each(p_delivery_payload) WHERE key<>'version' AND jsonb_typeof(value)<>'string')
    OR p_delivery_payload->>'keyId' !~ '^[A-Za-z0-9_-]{1,64}$'
    OR p_delivery_payload->>'requestId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR p_delivery_payload->>'issuedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
    OR p_delivery_payload->>'expiresAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
    OR p_delivery_payload->>'iv' !~ '^[A-Za-z0-9_-]{16}$'
    OR p_delivery_payload->>'tag' !~ '^[A-Za-z0-9_-]{21}[AQgw]$'
    OR p_delivery_payload->>'ciphertext' !~ '^[A-Za-z0-9_-]+$' THEN RETURN false; END IF;
  BEGIN
    v_request_id:=(p_delivery_payload->>'requestId')::uuid;
    v_issued:=(p_delivery_payload->>'issuedAt')::timestamptz;
    v_expires:=(p_delivery_payload->>'expiresAt')::timestamptz;
    v_value:=p_delivery_payload->>'ciphertext';
    IF translate(rtrim(replace(encode(decode(translate(v_value,'-_','+/')||repeat('=',(4-length(v_value)%4)%4),'base64'),'base64'),E'\n',''),'='),'+/','-_')<>v_value THEN RETURN false; END IF;
  EXCEPTION WHEN invalid_parameter_value OR invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format THEN RETURN false;
  END;
  IF abs(extract(epoch FROM (v_issued-clock_timestamp())))>60 OR v_expires-v_issued<>interval '24 hours' OR v_expires<=clock_timestamp() THEN RETURN false; END IF;

  IF p_explicit_consent IS DISTINCT FROM true OR p_wording_version IS DISTINCT FROM 'production_welcome_v1'
    OR v_email IS NULL OR length(v_email)>254 OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR p_confirmation_hash IS NULL OR p_confirmation_hash !~ '^[a-f0-9]{64}$'
    OR p_preference_hash IS NULL OR p_preference_hash !~ '^[a-f0-9]{64}$'
    OR p_requester_hash IS NULL OR p_requester_hash !~ '^[a-f0-9]{64}$'
    OR p_confirmation_hash=p_preference_hash THEN RETURN false; END IF;
  PERFORM 1 FROM private.production_marketing_controls WHERE singleton AND enrollment_enabled FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  -- Global issuance serialization makes the finite shared budget atomic across addresses.
  PERFORM pg_advisory_xact_lock(hashtextextended('production-marketing:issuance',0));
  PERFORM pg_advisory_xact_lock(hashtextextended('production-marketing:address:'||v_email,0));
  v_now:=clock_timestamp();
  v_hour:=date_trunc('hour',v_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_day:=date_trunc('day',v_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  IF abs(extract(epoch FROM (v_issued-v_now)))>60 OR v_expires<=v_now
    OR EXISTS(SELECT 1 FROM private.production_marketing_confirmation_intents WHERE request_id=v_request_id) THEN RETURN false; END IF;
  SELECT * INTO s FROM private.production_marketing_subscribers WHERE normalized_email=v_email FOR UPDATE;
  IF FOUND AND (s.state='confirmed' OR (s.state='pending' AND EXISTS(
    SELECT 1 FROM private.production_marketing_generations g WHERE g.subscriber_id=s.id
      AND g.generation=s.generation AND g.expires_at>v_now))) THEN RETURN false; END IF;
  IF EXISTS(SELECT 1 FROM private.production_marketing_generations WHERE
    confirmation_hash IN (p_confirmation_hash,p_preference_hash) OR preference_hash IN (p_confirmation_hash,p_preference_hash)) THEN RETURN false; END IF;
  IF EXISTS(SELECT 1 FROM private.production_marketing_request_limits WHERE
    (kind='address' AND key=v_email AND period=v_day AND issued>=3) OR
    (kind='requester' AND key=p_requester_hash AND period=v_hour AND issued>=10) OR
    (kind='global' AND key='all' AND period=v_hour AND issued>=30)) THEN RETURN false; END IF;
  DELETE FROM private.production_marketing_request_limits WHERE period<v_day-interval '2 days';
  INSERT INTO private.production_marketing_request_limits(kind,key,period,issued) VALUES
    ('address',v_email,v_day,1),('requester',p_requester_hash,v_hour,1),('global','all',v_hour,1)
    ON CONFLICT(kind,key,period) DO UPDATE SET issued=private.production_marketing_request_limits.issued+1;
  IF s.id IS NULL THEN
    INSERT INTO private.production_marketing_subscribers(normalized_email,state) VALUES(v_email,'pending') RETURNING * INTO s;
  ELSE
    UPDATE private.production_marketing_confirmation_intents SET state='cancelled',delivery_payload=NULL WHERE subscriber_id=s.id AND state='held';
    UPDATE private.production_marketing_subscribers SET generation=generation+1,revision=revision+1,state='pending',updated_at=v_now
      WHERE id=s.id RETURNING * INTO s;
  END IF;
  INSERT INTO private.production_marketing_generations(subscriber_id,generation,request_revision,wording_version,requested_at,expires_at,confirmation_hash,preference_hash)
    VALUES(s.id,s.generation,s.revision,p_wording_version,v_issued,v_expires,p_confirmation_hash,p_preference_hash);
  INSERT INTO private.production_marketing_evidence(subscriber_id,generation,revision,event) VALUES(s.id,s.generation,s.revision,'requested');
  INSERT INTO private.production_marketing_confirmation_intents(subscriber_id,generation,request_revision,request_id,delivery_payload,expires_at)
    VALUES(s.id,s.generation,s.revision,v_request_id,p_delivery_payload,v_expires);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.request_production_marketing_subscription(text,text,text,text,boolean,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.request_production_marketing_subscription(text,text,text,text,boolean,text,jsonb) TO service_role;

CREATE FUNCTION public.confirm_production_marketing_subscription(p_token_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private AS $$
DECLARE
  s private.production_marketing_subscribers%ROWTYPE;
  g private.production_marketing_generations%ROWTYPE;
  v_email text;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' THEN RETURN false; END IF;
  PERFORM 1 FROM private.production_marketing_controls WHERE singleton AND enrollment_enabled FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT sub.normalized_email INTO v_email FROM private.production_marketing_generations gen
    JOIN private.production_marketing_subscribers sub ON sub.id=gen.subscriber_id WHERE gen.confirmation_hash=p_token_hash;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('production-marketing:address:'||v_email,0));
  SELECT * INTO s FROM private.production_marketing_subscribers WHERE normalized_email=v_email FOR UPDATE;
  SELECT * INTO g FROM private.production_marketing_generations WHERE confirmation_hash=p_token_hash;
  IF g.generation<>s.generation THEN RETURN false; END IF;
  IF s.state='confirmed' THEN RETURN true; END IF;
  IF g.expires_at<=clock_timestamp() THEN
    UPDATE private.production_marketing_confirmation_intents SET state='cancelled',delivery_payload=NULL WHERE subscriber_id=s.id AND generation=g.generation AND state='held';
    RETURN false;
  END IF;
  IF s.state<>'pending' OR s.revision<>g.request_revision THEN RETURN false; END IF;
  UPDATE private.production_marketing_subscribers SET state='confirmed',revision=revision+1,updated_at=clock_timestamp()
    WHERE id=s.id RETURNING * INTO s;
  INSERT INTO private.production_marketing_evidence(subscriber_id,generation,revision,event) VALUES(s.id,s.generation,s.revision,'confirmed');
  UPDATE private.production_marketing_confirmation_intents SET state='cancelled',delivery_payload=NULL WHERE subscriber_id=s.id AND state='held';
  -- No welcome admission or provider work occurs in this P1 boundary.
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.confirm_production_marketing_subscription(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_production_marketing_subscription(text) TO service_role;

CREATE FUNCTION public.withdraw_production_marketing_subscription(p_token_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private AS $$
DECLARE s private.production_marketing_subscribers%ROWTYPE; v_email text;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' THEN RETURN false; END IF;
  -- Both preference and confirmation capabilities confer restriction, never implicit consent.
  -- They do not expire for withdrawal; even old generations can restrict current consent.
  SELECT sub.normalized_email INTO v_email FROM private.production_marketing_generations gen
    JOIN private.production_marketing_subscribers sub ON sub.id=gen.subscriber_id
    WHERE gen.preference_hash=p_token_hash OR gen.confirmation_hash=p_token_hash;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('production-marketing:address:'||v_email,0));
  SELECT * INTO s FROM private.production_marketing_subscribers WHERE normalized_email=v_email FOR UPDATE;
  IF s.state='withdrawn' THEN RETURN true; END IF;
  UPDATE private.production_marketing_subscribers SET state='withdrawn',revision=revision+1,updated_at=clock_timestamp()
    WHERE id=s.id RETURNING * INTO s;
  INSERT INTO private.production_marketing_evidence(subscriber_id,generation,revision,event) VALUES(s.id,s.generation,s.revision,'withdrawn');
  UPDATE private.production_marketing_confirmation_intents SET state='cancelled',delivery_payload=NULL WHERE subscriber_id=s.id AND state='held';
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.withdraw_production_marketing_subscription(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_production_marketing_subscription(text) TO service_role;

-- No scheduler or public read/claim interface. Expiry denies use even before physical erasure.
CREATE FUNCTION public.cleanup_production_marketing_confirmation_intents()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private AS $$
DECLARE affected integer;
BEGIN
  UPDATE private.production_marketing_confirmation_intents SET state='cancelled',delivery_payload=NULL
    WHERE state='held' AND expires_at<=clock_timestamp();
  GET DIAGNOSTICS affected=ROW_COUNT;
  RETURN affected;
END $$;
REVOKE ALL ON FUNCTION public.cleanup_production_marketing_confirmation_intents() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_production_marketing_confirmation_intents() TO service_role;

COMMIT;
