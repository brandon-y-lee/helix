BEGIN;
-- Manual third package, after consent and delivery. No hosted installation or routing.
ALTER TABLE private.production_marketing_controls ADD COLUMN events_enabled boolean NOT NULL DEFAULT false,ADD COLUMN status_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE private.production_marketing_messages
  ADD COLUMN delivery_status text NOT NULL DEFAULT 'pending' CHECK(delivery_status IN ('pending','sent','delayed','delivered','failed','suppressed')),
  ADD COLUMN last_event_at timestamptz;
CREATE TABLE private.production_marketing_events (
  event_id text PRIMARY KEY CHECK(event_id ~ '^[A-Za-z0-9_-]{1,200}$'),
  message_id uuid NOT NULL REFERENCES private.production_marketing_messages(id),
  provider_id uuid NOT NULL,
  event_type text NOT NULL CHECK(event_type IN ('email.sent','email.delivered','email.delivery_delayed','email.failed','email.bounced','email.complained','email.suppressed')),
  occurred_at timestamptz NOT NULL,
  fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
  binding_conflict boolean NOT NULL
);
CREATE INDEX production_marketing_event_message ON private.production_marketing_events(message_id,event_type);
CREATE TABLE private.production_marketing_identity_conflicts (
  message_id uuid NOT NULL REFERENCES private.production_marketing_messages(id),
  provider_id uuid NOT NULL,
  source text NOT NULL CHECK(source IN ('event','response')),
  observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(message_id,provider_id,source)
);
DO $$ DECLARE t text;BEGIN
  FOREACH t IN ARRAY ARRAY['events','identity_conflicts'] LOOP
    EXECUTE format('ALTER TABLE private.production_marketing_%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE private.production_marketing_%I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON private.production_marketing_%I FROM PUBLIC,anon,authenticated,service_role',t);
  END LOOP;
END $$;
CREATE FUNCTION private.production_marketing_event_rank(p_status text) RETURNS integer LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
  SELECT CASE p_status WHEN 'pending' THEN 0 WHEN 'sent' THEN 1 WHEN 'delayed' THEN 2 WHEN 'delivered' THEN 3 WHEN 'failed' THEN 4 WHEN 'suppressed' THEN 5 ELSE -1 END;
$$;
REVOKE ALL ON FUNCTION private.production_marketing_event_rank(text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.record_production_marketing_event(p_event_id text,p_message_id uuid,p_provider_id uuid,p_event_type text,p_occurred_at timestamptz,p_sender text,p_recipient text,p_purpose text,p_contract_version text,p_environment text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private AS $$
DECLARE m record; v_email text; v_fingerprint text; existing text; conflict boolean; v_status text; reason text;
BEGIN
  PERFORM 1 FROM private.production_marketing_controls WHERE singleton AND events_enabled FOR SHARE;
  IF NOT FOUND THEN RETURN 'paused'; END IF;
  IF p_event_id IS NULL OR p_event_id !~ '^[A-Za-z0-9_-]{1,200}$' OR p_message_id IS NULL OR p_provider_id IS NULL
    OR p_event_type IS NULL OR p_event_type NOT IN ('email.sent','email.delivered','email.delivery_delayed','email.failed','email.bounced','email.complained','email.suppressed')
    OR p_occurred_at IS NULL OR NOT isfinite(p_occurred_at) OR p_occurred_at>clock_timestamp()+interval '5 minutes'
    OR p_sender IS NULL OR length(p_sender) NOT BETWEEN 1 AND 320 OR p_sender ~ E'[\r\n]'
    OR p_recipient IS NULL OR length(p_recipient) NOT BETWEEN 1 AND 254 OR p_recipient<>lower(btrim(p_recipient))
    OR p_purpose IS NULL OR p_purpose NOT IN ('confirmation','welcome') OR p_environment IS DISTINCT FROM 'production'
    OR p_contract_version IS DISTINCT FROM 'production_welcome_delivery_v1' THEN RETURN 'rejected'; END IF;
  v_fingerprint:=encode(sha256(convert_to(jsonb_build_array(p_message_id,p_provider_id,p_event_type,private.production_marketing_iso(p_occurred_at),p_sender,p_recipient,p_purpose,p_contract_version,p_environment)::text,'UTF8')),'hex');
  -- A duplicate ID serializes before address/message locks; finish never takes this event lock.
  PERFORM pg_advisory_xact_lock(hashtextextended('production-marketing:event:'||p_event_id,0));
  SELECT fingerprint INTO existing FROM private.production_marketing_events WHERE event_id=p_event_id;
  IF FOUND THEN RETURN CASE WHEN existing=v_fingerprint THEN 'recorded' ELSE 'rejected' END; END IF;
  SELECT s.normalized_email INTO v_email FROM private.production_marketing_messages x JOIN private.production_marketing_subscribers s ON s.id=x.subscriber_id WHERE x.id=p_message_id;
  IF NOT FOUND THEN RETURN 'rejected'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('production-marketing:address:'||v_email,0));
  -- No capability-bearing body is read by this receiver.
  SELECT x.id,x.subscriber_id,x.purpose,x.first_prepared_at,x.body_hash,x.contract_hash,x.sender,x.recipient,x.provider_id,x.state,x.reconciliation_required,x.delivery_status
    INTO m FROM private.production_marketing_messages x WHERE x.id=p_message_id FOR UPDATE;
  IF m.first_prepared_at IS NULL OR m.body_hash IS NULL OR m.contract_hash IS NULL OR m.sender IS DISTINCT FROM p_sender OR m.recipient IS DISTINCT FROM p_recipient
    OR m.purpose IS DISTINCT FROM p_purpose OR p_occurred_at<m.first_prepared_at-interval '5 minutes' THEN RETURN 'rejected'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('production-marketing:provider:'||p_provider_id::text,0));
  conflict:=(m.provider_id IS NOT NULL AND m.provider_id<>p_provider_id) OR EXISTS(SELECT 1 FROM private.production_marketing_messages WHERE provider_id=p_provider_id AND id<>m.id);
  INSERT INTO private.production_marketing_events VALUES(p_event_id,m.id,p_provider_id,p_event_type,p_occurred_at,v_fingerprint,conflict);
  IF conflict THEN INSERT INTO private.production_marketing_identity_conflicts(message_id,provider_id,source) VALUES(m.id,p_provider_id,'event') ON CONFLICT DO NOTHING; END IF;
  IF p_event_type IN ('email.bounced','email.complained','email.suppressed') THEN
    reason:=CASE p_event_type WHEN 'email.bounced' THEN 'bounced' WHEN 'email.complained' THEN 'complained' ELSE 'suppressed' END;
    INSERT INTO private.production_marketing_suppressions(subscriber_id,reason,occurred_at) VALUES(m.subscriber_id,reason,p_occurred_at)
      ON CONFLICT(subscriber_id) DO UPDATE SET
        reason=CASE WHEN array_position(ARRAY['suppressed','bounced','complained'],excluded.reason)>array_position(ARRAY['suppressed','bounced','complained'],private.production_marketing_suppressions.reason) THEN excluded.reason ELSE private.production_marketing_suppressions.reason END,
        occurred_at=least(private.production_marketing_suppressions.occurred_at,excluded.occurred_at);
    v_status:='suppressed';
  ELSE v_status:=CASE p_event_type WHEN 'email.sent' THEN 'sent' WHEN 'email.delivered' THEN 'delivered' WHEN 'email.failed' THEN 'failed' ELSE 'delayed' END;
  END IF;
  UPDATE private.production_marketing_messages SET
    provider_id=CASE WHEN provider_id IS NULL AND NOT conflict THEN p_provider_id ELSE provider_id END,
    delivery_status=CASE WHEN private.production_marketing_event_rank(v_status)>private.production_marketing_event_rank(delivery_status) THEN v_status ELSE delivery_status END,
    last_event_at=greatest(last_event_at,p_occurred_at),
    reconciliation_required=reconciliation_required OR conflict OR state='uncertain',
    state=CASE WHEN conflict OR reconciliation_required OR state='uncertain' THEN 'uncertain' ELSE state END
    WHERE id=m.id;
  RETURN 'recorded';
END $$;
REVOKE ALL ON FUNCTION public.record_production_marketing_event(text,uuid,uuid,text,timestamptz,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_production_marketing_event(text,uuid,uuid,text,timestamptz,text,text,text,text,text) TO service_role;

-- Same identity lock/order as the receiver. No change to eligibility, quotas, bytes or clocks.
CREATE OR REPLACE FUNCTION public.finish_production_marketing_message(p_id uuid,p_lease uuid,p_kind text,p_provider_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private AS $$
DECLARE m private.production_marketing_messages%ROWTYPE; v_email text; conflict boolean; BEGIN
  SELECT s.normalized_email INTO v_email FROM private.production_marketing_messages x JOIN private.production_marketing_subscribers s ON s.id=x.subscriber_id WHERE x.id=p_id;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('production-marketing:address:'||v_email,0));
  SELECT * INTO m FROM private.production_marketing_messages WHERE id=p_id FOR UPDATE;
  IF p_lease IS NULL OR m.lease_token IS NULL OR m.lease_until IS NULL OR m.lease_token IS DISTINCT FROM p_lease OR m.lease_until<=clock_timestamp()
    OR NOT(m.state='prepared' OR(m.state='uncertain' AND m.reconciliation_required)) OR p_kind IS NULL OR p_kind NOT IN ('accepted','uncertain')
    OR(p_kind='accepted' AND p_provider_id IS NULL) OR(p_kind='uncertain' AND p_provider_id IS NOT NULL) THEN RETURN false; END IF;
  IF p_kind='accepted' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('production-marketing:provider:'||p_provider_id::text,0));
    conflict:=(m.provider_id IS NOT NULL AND m.provider_id<>p_provider_id) OR EXISTS(SELECT 1 FROM private.production_marketing_messages WHERE provider_id=p_provider_id AND id<>m.id);
    IF conflict THEN
      INSERT INTO private.production_marketing_identity_conflicts(message_id,provider_id,source) VALUES(m.id,p_provider_id,'response') ON CONFLICT DO NOTHING;
      UPDATE private.production_marketing_messages SET state='uncertain',reconciliation_required=true,lease_token=NULL,lease_until=NULL WHERE id=m.id;RETURN true;
    END IF;
  END IF;
  UPDATE private.production_marketing_messages SET
    state=CASE WHEN reconciliation_required THEN 'uncertain' ELSE p_kind END,
    provider_id=CASE WHEN p_kind='accepted' THEN p_provider_id ELSE provider_id END,
    reconciliation_required=reconciliation_required OR(p_kind='uncertain' AND EXISTS(SELECT 1 FROM private.production_marketing_events WHERE message_id=m.id)),
    next_attempt_at=clock_timestamp()+interval '60 seconds',lease_token=NULL,lease_until=NULL WHERE id=m.id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.finish_production_marketing_message(uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_production_marketing_message(uuid,uuid,text,uuid) TO service_role;

CREATE FUNCTION public.read_production_marketing_status(p_actor_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private AS $$
DECLARE result jsonb;BEGIN
  IF p_actor_id IS NULL OR NOT EXISTS(SELECT 1 FROM private.production_marketing_controls WHERE singleton AND status_enabled)
    OR NOT EXISTS(SELECT 1 FROM public.admin_memberships WHERE user_id=p_actor_id AND active AND role='admin') THEN RETURN NULL; END IF;
  SELECT jsonb_build_object(
    'pendingSubscribers',(SELECT count(*) FROM private.production_marketing_subscribers WHERE state='pending'),
    'confirmedSubscribers',(SELECT count(*) FROM private.production_marketing_subscribers WHERE state='confirmed'),
    'withdrawnSubscribers',(SELECT count(*) FROM private.production_marketing_subscribers WHERE state='withdrawn'),
    'suppressedSubscribers',(SELECT count(*) FROM private.production_marketing_suppressions),
    'queuedMessages',count(*) FILTER(WHERE state='held' AND NOT reconciliation_required),
    'preparedMessages',count(*) FILTER(WHERE state='prepared' AND lease_until>clock_timestamp() AND NOT reconciliation_required),
    'acceptedMessages',count(*) FILTER(WHERE state='accepted' AND NOT reconciliation_required),
    'deliveredMessages',count(*) FILTER(WHERE delivery_status='delivered'),
    'suppressedMessages',count(*) FILTER(WHERE delivery_status='suppressed'),
    'failedMessages',count(*) FILTER(WHERE delivery_status='failed'),
    'uncertainMessages',count(*) FILTER(WHERE reconciliation_required OR state='uncertain' OR(state='prepared' AND coalesce(lease_until<=clock_timestamp(),true))))
    INTO result FROM private.production_marketing_messages;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.read_production_marketing_status(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_production_marketing_status(uuid) TO service_role;
COMMIT;
