-- Ticket #529 / Spec #527. Manual, separately authorized installation AFTER install.sql.
-- No bucket, key, scheduler, operational identity, network call, gate enablement or deletion.
BEGIN;
DO $$ BEGIN
 IF current_user IN ('anon','authenticated','service_role','authenticator')
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
  RAISE EXCEPTION 'support_install_requires_trusted_operator';
 END IF;
END $$;
ALTER TABLE support_production_private.outbox ADD COLUMN kind text NOT NULL DEFAULT 'primary' CHECK(kind IN ('primary','media'));
ALTER TABLE support_production_private.outbox DROP CONSTRAINT outbox_inquiry_id_key;
CREATE UNIQUE INDEX support_prod_one_primary ON support_production_private.outbox(inquiry_id) WHERE kind='primary';

CREATE TABLE support_production_private.photo_slots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), inquiry_id uuid NOT NULL REFERENCES support_production_private.inquiries(id),
 upload_id uuid NOT NULL, ordinal integer NOT NULL CHECK(ordinal BETWEEN 0 AND 4),
 declared_bytes integer NOT NULL CHECK(declared_bytes BETWEEN 1 AND 10485760),
 content_type text NOT NULL CHECK(content_type IN ('image/jpeg','image/png','image/webp')),
 raw_path text NOT NULL UNIQUE, clean_path text NOT NULL UNIQUE,
 mint_deadline_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(inquiry_id,upload_id), UNIQUE(inquiry_id,ordinal),
 CHECK(raw_path='raw/'||inquiry_id||'/'||upload_id), CHECK(clean_path='clean/'||inquiry_id||'/'||upload_id||'.webp')
);
CREATE TABLE support_production_private.photo_ledger (
 photo_id uuid PRIMARY KEY REFERENCES support_production_private.photo_slots(id),
 state text NOT NULL DEFAULT 'declared' CHECK(state IN ('declared','uploading','pending','leased','ready','rejected','reconciliation')),
 mint_count integer NOT NULL DEFAULT 0 CHECK(mint_count BETWEEN 0 AND 3), token_expires_ceiling_at timestamptz,
 lease_id uuid, lease_until timestamptz, attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 5),
 next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 raw_bytes integer CHECK(raw_bytes BETWEEN 1 AND 10485760), raw_hash text CHECK(raw_hash ~ '^[a-f0-9]{64}$'),
 raw_content_type text, raw_accepted boolean NOT NULL DEFAULT false,
 clean_bytes integer CHECK(clean_bytes BETWEEN 1 AND 4194304), clean_hash text CHECK(clean_hash ~ '^[a-f0-9]{64}$'),
 width integer CHECK(width BETWEEN 1 AND 2560), height integer CHECK(height BETWEEN 1 AND 2560),
 CHECK((lease_id IS NULL)=(lease_until IS NULL)), CHECK((raw_bytes IS NULL)=(raw_hash IS NULL)),
 CHECK((raw_bytes IS NULL)=(raw_content_type IS NULL)), CHECK(NOT raw_accepted OR raw_bytes IS NOT NULL),
 CHECK((clean_bytes IS NULL)=(clean_hash IS NULL)), CHECK((clean_bytes IS NULL)=(width IS NULL)), CHECK((clean_bytes IS NULL)=(height IS NULL)),
 CHECK(clean_bytes IS NULL OR raw_accepted), CHECK(state<>'ready' OR clean_bytes IS NOT NULL)
);
CREATE INDEX support_prod_photo_due ON support_production_private.photo_ledger(next_attempt_at,photo_id) WHERE state IN ('pending','leased');
CREATE TABLE support_production_private.photo_leases(id uuid PRIMARY KEY,photo_id uuid NOT NULL REFERENCES support_production_private.photo_slots(id));
CREATE TABLE support_production_private.media_batches (
 id uuid PRIMARY KEY, inquiry_id uuid NOT NULL REFERENCES support_production_private.inquiries(id),
 recipe jsonb NOT NULL, request_hash text CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 request_bytes integer CHECK(request_bytes BETWEEN 1 AND 29000000),
 lease_id uuid, lease_until timestamptz, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((request_hash IS NULL)=(request_bytes IS NULL)), CHECK((lease_id IS NULL)=(lease_until IS NULL))
);
CREATE TABLE support_production_private.media_members (
 photo_id uuid PRIMARY KEY REFERENCES support_production_private.photo_slots(id), batch_id uuid NOT NULL REFERENCES support_production_private.media_batches(id)
);
CREATE INDEX support_prod_media_unfrozen ON support_production_private.media_batches(created_at,id) WHERE request_hash IS NULL;
CREATE TABLE support_production_private.media_leases(id uuid PRIMARY KEY,batch_id uuid NOT NULL REFERENCES support_production_private.media_batches(id));
-- This package deliberately has no retention/disposition/release RPC. Even invalid
-- evidence and possibly in-flight uploads retain their entire already charged slot.
CREATE TRIGGER immutable_photo_slots BEFORE UPDATE OR DELETE ON support_production_private.photo_slots
 FOR EACH ROW EXECUTE FUNCTION support_production_private.immutable_inquiry();
CREATE TRIGGER immutable_media_members BEFORE UPDATE OR DELETE ON support_production_private.media_members
 FOR EACH ROW EXECUTE FUNCTION support_production_private.immutable_inquiry();
CREATE FUNCTION support_production_private.protect_photo_ledger() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'support_record_preserved'; END IF;
 IF NEW.photo_id<>OLD.photo_id OR NEW.mint_count<OLD.mint_count OR NEW.attempt_count<OLD.attempt_count
 OR (OLD.token_expires_ceiling_at IS NOT NULL AND (NEW.token_expires_ceiling_at IS NULL OR NEW.token_expires_ceiling_at<OLD.token_expires_ceiling_at))
 OR (OLD.raw_hash IS NOT NULL AND (NEW.raw_bytes,NEW.raw_hash,NEW.raw_content_type) IS DISTINCT FROM (OLD.raw_bytes,OLD.raw_hash,OLD.raw_content_type))
 OR (OLD.raw_accepted AND NOT NEW.raw_accepted)
 OR (OLD.clean_hash IS NOT NULL AND (NEW.clean_bytes,NEW.clean_hash,NEW.width,NEW.height) IS DISTINCT FROM (OLD.clean_bytes,OLD.clean_hash,OLD.width,OLD.height))
 THEN RAISE EXCEPTION 'support_photo_immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_photo_ledger BEFORE UPDATE OR DELETE ON support_production_private.photo_ledger
 FOR EACH ROW EXECUTE FUNCTION support_production_private.protect_photo_ledger();
CREATE FUNCTION support_production_private.protect_media_batch() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'support_record_preserved'; END IF;
 IF (NEW.id,NEW.inquiry_id,NEW.recipe,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.inquiry_id,OLD.recipe,OLD.created_at)
 OR (OLD.request_hash IS NOT NULL AND (NEW.request_hash,NEW.request_bytes) IS DISTINCT FROM (OLD.request_hash,OLD.request_bytes)) THEN RAISE EXCEPTION 'support_media_immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_media_batch BEFORE UPDATE OR DELETE ON support_production_private.media_batches
 FOR EACH ROW EXECUTE FUNCTION support_production_private.protect_media_batch();
CREATE FUNCTION support_production_private.protect_outbox_kind() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF NEW.kind<>OLD.kind THEN RAISE EXCEPTION 'support_outbox_immutable'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER protect_outbox_kind BEFORE UPDATE ON support_production_private.outbox
 FOR EACH ROW EXECUTE FUNCTION support_production_private.protect_outbox_kind();
CREATE FUNCTION support_production_private.seed_photo_slots() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 INSERT INTO support_production_private.photo_slots(inquiry_id,upload_id,ordinal,declared_bytes,content_type,raw_path,clean_path,mint_deadline_at)
 SELECT NEW.id,(p.value->>'uploadId')::uuid,p.ordinality-1,(p.value->>'byteSize')::integer,p.value->>'contentType',
 'raw/'||NEW.id||'/'||(p.value->>'uploadId'),'clean/'||NEW.id||'/'||(p.value->>'uploadId')||'.webp',NEW.created_at+interval '15 minutes'
 FROM jsonb_array_elements(NEW.canonical_payload->'photos') WITH ORDINALITY p;
 INSERT INTO support_production_private.photo_ledger(photo_id) SELECT id FROM support_production_private.photo_slots WHERE inquiry_id=NEW.id;
 RETURN NEW;
END $$;
CREATE TRIGGER seed_photo_slots AFTER INSERT ON support_production_private.inquiries
 FOR EACH ROW EXECUTE FUNCTION support_production_private.seed_photo_slots();

-- Existing T1 declarations retain their original reservation and mint deadline.
-- No reservation adjustment or original inquiry mutation occurs during this one-time extension.
INSERT INTO support_production_private.photo_slots(inquiry_id,upload_id,ordinal,declared_bytes,content_type,raw_path,clean_path,mint_deadline_at)
 SELECT i.id,(p.value->>'uploadId')::uuid,p.ordinality-1,(p.value->>'byteSize')::integer,p.value->>'contentType',
 'raw/'||i.id||'/'||(p.value->>'uploadId'),'clean/'||i.id||'/'||(p.value->>'uploadId')||'.webp',i.created_at+interval '15 minutes'
 FROM support_production_private.inquiries i CROSS JOIN LATERAL jsonb_array_elements(i.canonical_payload->'photos') WITH ORDINALITY p;
INSERT INTO support_production_private.photo_ledger(photo_id) SELECT id FROM support_production_private.photo_slots;


CREATE FUNCTION support_production_private.valid_uuid(v jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT coalesce(jsonb_typeof(v)='string' AND v#>>'{}' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',false)
$$;
CREATE FUNCTION support_production_private.owned_inquiry(v jsonb) RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog AS $$ DECLARE result uuid; BEGIN
 IF NOT support_production_private.valid_uuid(v->'submissionId') OR jsonb_typeof(v->'capabilityHash')<>'string'
 OR coalesce(v->>'capabilityHash','') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'support_invalid_input'; END IF;
 SELECT id INTO result FROM support_production_private.inquiries WHERE submission_id=(v->>'submissionId')::uuid AND capability_hash=v->>'capabilityHash';
 IF NOT FOUND THEN RAISE EXCEPTION 'support_photo_unavailable'; END IF; RETURN result;
END $$;
CREATE FUNCTION public.reserve_support_prod_photo(p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE i uuid; s support_production_private.photo_slots%ROWTYPE; l support_production_private.photo_ledger%ROWTYPE;
BEGIN
 PERFORM support_production_private.validate_input(p_input,ARRAY['projectRef','contractId','submissionId','capabilityHash','uploadId'],ARRAY['projectRef','contractId','submissionId','capabilityHash','uploadId']);
 PERFORM support_production_private.media_context(p_input); i:=support_production_private.owned_inquiry(p_input);
 IF NOT support_production_private.valid_uuid(p_input->'uploadId') THEN RAISE EXCEPTION 'support_invalid_input'; END IF;
 SELECT * INTO s FROM support_production_private.photo_slots WHERE inquiry_id=i AND upload_id=(p_input->>'uploadId')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'support_photo_unavailable'; END IF;
 SELECT * INTO l FROM support_production_private.photo_ledger WHERE photo_id=s.id FOR UPDATE;
 IF s.mint_deadline_at<=clock_timestamp() OR l.mint_count>=3 OR l.state NOT IN ('declared','uploading') THEN RAISE EXCEPTION 'support_upload_closed'; END IF;
 UPDATE support_production_private.photo_ledger SET mint_count=mint_count+1,state='uploading',token_expires_ceiling_at=clock_timestamp()+interval '2 hours 1 minute'
 WHERE photo_id=s.id RETURNING * INTO l;
 RETURN jsonb_build_object('photoId',s.id,'uploadId',s.upload_id,'rawPath',s.raw_path,'cleanPath',s.clean_path,'byteSize',s.declared_bytes,'contentType',s.content_type,
 'mintDeadlineAt',s.mint_deadline_at,'tokenExpiresCeilingAt',l.token_expires_ceiling_at);
END $$;
CREATE FUNCTION public.complete_support_prod_photo(p_input jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE i uuid; s support_production_private.photo_slots%ROWTYPE; l support_production_private.photo_ledger%ROWTYPE;
BEGIN
 PERFORM support_production_private.validate_input(p_input,ARRAY['projectRef','contractId','submissionId','capabilityHash','uploadId'],ARRAY['projectRef','contractId','submissionId','capabilityHash','uploadId']);
 PERFORM support_production_private.media_context(p_input); i:=support_production_private.owned_inquiry(p_input);
 IF NOT support_production_private.valid_uuid(p_input->'uploadId') THEN RAISE EXCEPTION 'support_invalid_input'; END IF;
 SELECT * INTO s FROM support_production_private.photo_slots WHERE inquiry_id=i AND upload_id=(p_input->>'uploadId')::uuid;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO l FROM support_production_private.photo_ledger WHERE photo_id=s.id FOR UPDATE;
 IF l.state IN ('pending','leased','ready') THEN RETURN true; END IF;
 IF l.state<>'uploading' OR l.mint_count=0 OR l.token_expires_ceiling_at<clock_timestamp() THEN RETURN false; END IF;
 UPDATE support_production_private.photo_ledger SET state='pending',next_attempt_at=clock_timestamp() WHERE photo_id=s.id;
 RETURN true;
END $$;
CREATE FUNCTION public.read_support_prod_photos(p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE i uuid; result jsonb; BEGIN
 PERFORM support_production_private.validate_input(p_input,ARRAY['projectRef','contractId','submissionId','capabilityHash'],ARRAY['projectRef','contractId','submissionId','capabilityHash']);
 PERFORM support_production_private.media_context(p_input); i:=support_production_private.owned_inquiry(p_input);
 SELECT coalesce(jsonb_agg(jsonb_build_object('uploadId',s.upload_id,'status',CASE
 WHEN l.state IN ('declared','uploading') THEN 'pending_upload' WHEN l.state IN ('pending','leased') THEN 'processing'
 WHEN l.state='reconciliation' THEN 'needs_review' ELSE l.state END) ORDER BY s.ordinal),'[]'::jsonb) INTO result
 FROM support_production_private.photo_slots s JOIN support_production_private.photo_ledger l ON l.photo_id=s.id WHERE s.inquiry_id=i;
 RETURN jsonb_build_object('submissionId',p_input->>'submissionId','photos',result);
END $$;
CREATE FUNCTION public.claim_support_prod_photo(p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s support_production_private.photo_slots%ROWTYPE; l support_production_private.photo_ledger%ROWTYPE; v_id uuid; BEGIN
 PERFORM support_production_private.validate_input(p_input,ARRAY['projectRef','contractId','leaseId'],ARRAY['projectRef','contractId','leaseId']);
 PERFORM support_production_private.media_context(p_input,true);
 IF NOT support_production_private.valid_uuid(p_input->'leaseId') THEN RAISE EXCEPTION 'support_invalid_input'; END IF;
 IF (SELECT count(*) FROM support_production_private.photo_ledger WHERE state='leased' AND lease_until>clock_timestamp())
 >=(SELECT photo_worker_limit FROM support_production_private.contract WHERE singleton) THEN RETURN NULL; END IF;
 -- Bound exhausted housekeeping; never release reservation or delete evidence.
 WITH due AS (SELECT photo_id FROM support_production_private.photo_ledger WHERE state IN ('pending','leased') AND attempt_count>=5
 AND (lease_until IS NULL OR lease_until<=clock_timestamp()) ORDER BY next_attempt_at,photo_id FOR UPDATE SKIP LOCKED LIMIT 20)
 UPDATE support_production_private.photo_ledger x SET state='reconciliation',lease_id=NULL,lease_until=NULL FROM due WHERE x.photo_id=due.photo_id;
 SELECT photo_id INTO v_id FROM support_production_private.photo_ledger WHERE state IN ('pending','leased') AND attempt_count<5
 AND next_attempt_at<=clock_timestamp() AND (lease_until IS NULL OR lease_until<=clock_timestamp()) ORDER BY next_attempt_at,photo_id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 INSERT INTO support_production_private.photo_leases(id,photo_id) VALUES((p_input->>'leaseId')::uuid,v_id) ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE support_production_private.photo_ledger SET state='leased',lease_id=(p_input->>'leaseId')::uuid,lease_until=clock_timestamp()+interval '120 seconds',attempt_count=attempt_count+1
 WHERE photo_id=v_id RETURNING * INTO l;
 SELECT * INTO s FROM support_production_private.photo_slots WHERE id=v_id;
 RETURN jsonb_build_object('photoId',s.id,'inquiryId',s.inquiry_id,'uploadId',s.upload_id,'leaseId',l.lease_id,'leaseUntil',l.lease_until,
 'rawPath',s.raw_path,'cleanPath',s.clean_path,'declaredBytes',s.declared_bytes,'contentType',s.content_type);
END $$;
CREATE FUNCTION public.record_support_prod_photo_raw(p_input jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s support_production_private.photo_slots%ROWTYPE; l support_production_private.photo_ledger%ROWTYPE; n integer; accepted boolean; BEGIN
 PERFORM support_production_private.validate_input(p_input,ARRAY['projectRef','contractId','photoId','leaseId','rawBytes','rawHash','contentType'],ARRAY['projectRef','contractId','photoId','leaseId','rawBytes','rawHash','contentType']);
 PERFORM support_production_private.media_context(p_input,true);
 IF NOT support_production_private.valid_uuid(p_input->'photoId') OR NOT support_production_private.valid_uuid(p_input->'leaseId')
 OR jsonb_typeof(p_input->'rawBytes')<>'number' OR p_input->>'rawBytes' !~ '^[0-9]{1,8}$' OR (p_input->>'rawBytes')::bigint NOT BETWEEN 1 AND 10485760
 OR jsonb_typeof(p_input->'rawHash')<>'string' OR p_input->>'rawHash' !~ '^[a-f0-9]{64}$'
 OR p_input->>'contentType' NOT IN ('image/jpeg','image/png','image/webp','application/octet-stream') THEN RAISE EXCEPTION 'support_invalid_input'; END IF;
 SELECT * INTO s FROM support_production_private.photo_slots WHERE id=(p_input->>'photoId')::uuid;
 SELECT * INTO l FROM support_production_private.photo_ledger WHERE photo_id=s.id FOR UPDATE;
 IF NOT FOUND OR l.state<>'leased' OR l.lease_id IS DISTINCT FROM (p_input->>'leaseId')::uuid OR l.lease_until<=clock_timestamp() THEN RETURN false; END IF;
 n:=(p_input->>'rawBytes')::integer;
 IF l.raw_hash IS NOT NULL THEN RETURN l.raw_accepted AND (l.raw_bytes,l.raw_hash,l.raw_content_type)=(n,p_input->>'rawHash',p_input->>'contentType'); END IF;
 accepted:=n=s.declared_bytes AND p_input->>'contentType'=s.content_type AND n+coalesce((SELECT sum(p.raw_bytes) FROM support_production_private.photo_ledger p
 JOIN support_production_private.photo_slots x ON x.id=p.photo_id WHERE x.inquiry_id=s.inquiry_id AND p.raw_accepted),0)<=20971520;
 UPDATE support_production_private.photo_ledger SET raw_bytes=n,raw_hash=p_input->>'rawHash',raw_content_type=p_input->>'contentType',raw_accepted=accepted,
 state=CASE WHEN accepted THEN 'leased' ELSE 'rejected' END,lease_id=CASE WHEN accepted THEN lease_id ELSE NULL END,lease_until=CASE WHEN accepted THEN lease_until ELSE NULL END WHERE photo_id=s.id;
 RETURN accepted;
END $$;
CREATE FUNCTION public.finish_support_prod_photo(p_input jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE l support_production_private.photo_ledger%ROWTYPE; v_outcome text; BEGIN
 PERFORM support_production_private.validate_input(p_input,ARRAY['projectRef','contractId','photoId','leaseId','outcome','cleanBytes','cleanHash','width','height'],ARRAY['projectRef','contractId','photoId','leaseId','outcome']);
 PERFORM support_production_private.media_context(p_input,true);
 IF NOT support_production_private.valid_uuid(p_input->'photoId') OR NOT support_production_private.valid_uuid(p_input->'leaseId') OR p_input->>'outcome' NOT IN ('ready','rejected','retry') THEN RAISE EXCEPTION 'support_invalid_input'; END IF;
 v_outcome:=p_input->>'outcome';
 IF v_outcome='ready' THEN
  IF EXISTS(SELECT 1 FROM unnest(ARRAY['cleanBytes','width','height']) k WHERE coalesce(jsonb_typeof(p_input->k),'')<>'number' OR coalesce(p_input->>k,'') !~ '^[0-9]{1,8}$')
  OR coalesce(jsonb_typeof(p_input->'cleanHash'),'')<>'string' OR coalesce(p_input->>'cleanHash','') !~ '^[a-f0-9]{64}$' OR (p_input->>'cleanBytes')::bigint NOT BETWEEN 1 AND 4194304
  OR (p_input->>'width')::bigint NOT BETWEEN 1 AND 2560 OR (p_input->>'height')::bigint NOT BETWEEN 1 AND 2560 THEN RAISE EXCEPTION 'support_invalid_input'; END IF;
 ELSIF p_input ?| ARRAY['cleanBytes','cleanHash','width','height'] THEN RAISE EXCEPTION 'support_invalid_input'; END IF;
 SELECT * INTO l FROM support_production_private.photo_ledger WHERE photo_id=(p_input->>'photoId')::uuid FOR UPDATE;
 IF NOT FOUND OR l.state<>'leased' OR l.lease_id IS DISTINCT FROM (p_input->>'leaseId')::uuid OR l.lease_until<=clock_timestamp() THEN RETURN false; END IF;
 IF v_outcome='ready' AND NOT l.raw_accepted THEN RETURN false; END IF;
 UPDATE support_production_private.photo_ledger SET state=CASE WHEN v_outcome='retry' AND attempt_count<5 THEN 'pending' WHEN v_outcome='retry' THEN 'reconciliation' ELSE v_outcome END,
 lease_id=NULL,lease_until=NULL,next_attempt_at=clock_timestamp()+interval '1 minute',
 clean_bytes=CASE WHEN v_outcome='ready' THEN (p_input->>'cleanBytes')::integer ELSE clean_bytes END,
 clean_hash=CASE WHEN v_outcome='ready' THEN p_input->>'cleanHash' ELSE clean_hash END,
 width=CASE WHEN v_outcome='ready' THEN (p_input->>'width')::integer ELSE width END,height=CASE WHEN v_outcome='ready' THEN (p_input->>'height')::integer ELSE height END
 WHERE photo_id=l.photo_id; RETURN true;
END $$;

ALTER TABLE support_production_private.contract ADD COLUMN photo_worker_limit integer NOT NULL DEFAULT 0 CHECK(photo_worker_limit BETWEEN 0 AND 16);
ALTER TABLE support_production_private.contract ADD COLUMN photo_bucket text CHECK(photo_bucket ~ '^[a-z0-9][a-z0-9-]{2,62}$' AND photo_bucket NOT IN ('helix-support-photos','helix-catalog'));
CREATE OR REPLACE FUNCTION public.read_support_prod_contract() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('projectRef',project_ref,'contractId',contract_id,'photoBucket',photo_bucket,'photoWorkerLimit',photo_worker_limit,
 'admissionEnabled',admission_enabled,'workerEnabled',worker_enabled,'fullMediaQualified',full_media_qualified,'isolationQualified',isolation_qualified,'operationsQualified',operations_qualified)
 FROM support_production_private.contract WHERE singleton
$$;
CREATE OR REPLACE FUNCTION support_production_private.media_context(v jsonb, worker boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog AS $$ DECLARE c support_production_private.contract%ROWTYPE; BEGIN
 SELECT * INTO c FROM support_production_private.contract WHERE singleton FOR UPDATE;
 IF NOT support_production_private.identity_matches(v) THEN RAISE EXCEPTION 'support_wrong_contract'; END IF;
 IF c.photo_bucket IS NULL OR NOT(c.full_media_qualified AND c.isolation_qualified AND c.operations_qualified AND (NOT worker OR c.worker_enabled)) THEN
 RAISE EXCEPTION 'support_media_unavailable'; END IF;
END $$;

CREATE FUNCTION public.prepare_support_prod_media(p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b support_production_private.media_batches%ROWTYPE; i uuid; o support_production_private.outbox%ROWTYPE;
 v_id uuid; v_token text; v_photos jsonb; v_recipe jsonb; v_email text;
BEGIN
 PERFORM support_production_private.validate_input(p_input,ARRAY['projectRef','contractId','leaseId'],ARRAY['projectRef','contractId','leaseId']);
 PERFORM support_production_private.media_context(p_input,true);
 IF NOT support_production_private.valid_uuid(p_input->'leaseId') THEN RAISE EXCEPTION 'support_invalid_input'; END IF;
 SELECT * INTO b FROM support_production_private.media_batches WHERE request_hash IS NULL AND (lease_until IS NULL OR lease_until<=clock_timestamp())
 ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN
  SELECT s.inquiry_id INTO i FROM support_production_private.photo_slots s JOIN support_production_private.photo_ledger l ON l.photo_id=s.id
   JOIN support_production_private.outbox p ON p.inquiry_id=s.inquiry_id AND p.kind='primary' AND p.rfc_message_id IS NOT NULL
   WHERE l.state='ready' AND NOT EXISTS(SELECT 1 FROM support_production_private.media_members m WHERE m.photo_id=s.id)
   ORDER BY s.created_at,s.id LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO o FROM support_production_private.outbox WHERE inquiry_id=i AND kind='primary';
  SELECT canonical_payload->>'email' INTO v_email FROM support_production_private.inquiries WHERE id=i;
  SELECT jsonb_agg(jsonb_build_object('photoId',s.id,'uploadId',s.upload_id,'ordinal',s.ordinal,'path',s.clean_path,'hash',l.clean_hash,'bytes',l.clean_bytes) ORDER BY s.ordinal) INTO v_photos
   FROM support_production_private.photo_slots s JOIN support_production_private.photo_ledger l ON l.photo_id=s.id
   WHERE s.inquiry_id=i AND l.state='ready' AND NOT EXISTS(SELECT 1 FROM support_production_private.media_members m WHERE m.photo_id=s.id);
  v_id:=gen_random_uuid();v_token:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
  v_recipe:=jsonb_build_object('version',1,'inquiryId',i,'primaryOutboxId',o.id,'parentMessageId',o.rfc_message_id,'replyTo',v_email,'deliveryToken',v_token,'photos',v_photos);
  INSERT INTO support_production_private.media_batches(id,inquiry_id,recipe) VALUES(v_id,i,v_recipe) RETURNING * INTO b;
  INSERT INTO support_production_private.media_members(photo_id,batch_id) SELECT (value->>'photoId')::uuid,b.id FROM jsonb_array_elements(v_photos);
 END IF;
 INSERT INTO support_production_private.media_leases(id,batch_id) VALUES((p_input->>'leaseId')::uuid,b.id) ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE support_production_private.media_batches SET lease_id=(p_input->>'leaseId')::uuid,lease_until=clock_timestamp()+interval '120 seconds' WHERE id=b.id;
 RETURN jsonb_build_object('outboxId',b.id,'leaseId',p_input->>'leaseId','recipe',b.recipe);
END $$;
CREATE FUNCTION public.finalize_support_prod_media(p_input jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b support_production_private.media_batches%ROWTYPE; v_hash text; v_bytes integer; BEGIN
 PERFORM support_production_private.validate_input(p_input,ARRAY['projectRef','contractId','outboxId','leaseId','requestHash','requestBytes'],ARRAY['projectRef','contractId','outboxId','leaseId','requestHash','requestBytes']);
 PERFORM support_production_private.media_context(p_input,true);
 IF NOT support_production_private.valid_uuid(p_input->'outboxId') OR NOT support_production_private.valid_uuid(p_input->'leaseId')
 OR jsonb_typeof(p_input->'requestHash')<>'string' OR p_input->>'requestHash' !~ '^[a-f0-9]{64}$'
 OR jsonb_typeof(p_input->'requestBytes')<>'number' OR p_input->>'requestBytes' !~ '^[0-9]{1,8}$'
 OR (p_input->>'requestBytes')::bigint NOT BETWEEN 1 AND 29000000 THEN RAISE EXCEPTION 'support_invalid_input'; END IF;
 v_hash:=p_input->>'requestHash';v_bytes:=(p_input->>'requestBytes')::integer;
 SELECT * INTO b FROM support_production_private.media_batches WHERE id=(p_input->>'outboxId')::uuid FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF b.request_hash IS NOT NULL THEN RETURN b.request_hash=v_hash AND b.request_bytes=v_bytes AND b.lease_id=(p_input->>'leaseId')::uuid; END IF;
 IF b.lease_id IS DISTINCT FROM (p_input->>'leaseId')::uuid OR b.lease_until<=clock_timestamp() THEN RETURN false; END IF;
 IF v_bytes <= (SELECT sum(4*(((value->>'bytes')::bigint+2)/3)) FROM jsonb_array_elements(b.recipe->'photos'))
 OR v_bytes > (SELECT sum(4*(((value->>'bytes')::bigint+2)/3))+32768 FROM jsonb_array_elements(b.recipe->'photos')) THEN RAISE EXCEPTION 'support_invalid_media_size'; END IF;
 -- Finalization freezes the exact serializer's hash before any provider attempt. No second stored payload object.
 UPDATE support_production_private.media_batches SET request_hash=v_hash,request_bytes=v_bytes WHERE id=b.id;
 INSERT INTO support_production_private.outbox(id,inquiry_id,contract_id,delivery_token,request_text,request_hash,idempotency_key,kind)
 VALUES(b.id,b.inquiry_id,p_input->>'contractId',b.recipe->>'deliveryToken','',v_hash,'support-media:'||b.id,'media');
 RETURN true;
END $$;

-- Primary code retained verbatim except the one-primary lookup and discriminated media returns.
CREATE OR REPLACE FUNCTION public.submit_support_prod_inquiry(p_input jsonb) RETURNS jsonb
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
  SELECT id INTO v_outbox FROM support_production_private.outbox WHERE inquiry_id=prior.id AND kind='primary';
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
CREATE OR REPLACE FUNCTION public.claim_support_prod_outbox(p_input jsonb) RETURNS jsonb
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
 IF (SELECT kind='media' FROM support_production_private.outbox WHERE id=v_id) THEN
  RETURN (SELECT jsonb_build_object('outboxId',v_id,'leaseId',v_lease,'kind','media','recipe',b.recipe,'requestHash',b.request_hash,'requestBytes',b.request_bytes)
   FROM support_production_private.media_batches b WHERE b.id=v_id);
 END IF;
 RETURN jsonb_build_object('outboxId',v_id,'leaseId',v_lease);
END $$;
CREATE OR REPLACE FUNCTION public.start_support_prod_send(p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c support_production_private.contract%ROWTYPE; o support_production_private.outbox%ROWTYPE;
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
 -- State is set to unknown before handoff: process death can never erase the first-attempt marker.
 UPDATE support_production_private.outbox SET first_attempt_at=coalesce(first_attempt_at,clock_timestamp()),attempt_count=attempt_count+1,state='unknown'
 WHERE id=o.id RETURNING * INTO o;
 IF o.kind='media' THEN
  RETURN (SELECT jsonb_build_object('outboxId',o.id,'kind','media','recipe',b.recipe,'requestHash',o.request_hash,'requestBytes',b.request_bytes,
   'idempotencyKey',o.idempotency_key,'attemptCount',o.attempt_count,'firstAttemptAt',o.first_attempt_at)
   FROM support_production_private.media_batches b WHERE b.id=o.id);
 END IF;
 RETURN jsonb_build_object('outboxId',o.id,'requestText',o.request_text,'requestHash',o.request_hash,
 'idempotencyKey',o.idempotency_key,'attemptCount',o.attempt_count,'firstAttemptAt',o.first_attempt_at);
END $$;
CREATE OR REPLACE FUNCTION public.record_support_prod_sent(p_input jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o support_production_private.outbox%ROWTYPE; e support_production_private.sent_events%ROWTYPE; v_provider uuid;
BEGIN
 PERFORM support_production_private.validate_input(p_input,ARRAY['projectRef','contractId','outboxId','deliveryToken','providerEmailId','messageId','from','to','eventId','subject'],ARRAY['projectRef','contractId','outboxId','deliveryToken','providerEmailId','messageId','from','to','eventId']);
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
 -- The deployed verifier passes the actual signed subject. Preserve primary-only
 -- compatibility for earlier metadata clients; media ALWAYS requires its frozen primary subject.
 IF p_input ? 'subject' AND (length(p_input->>'subject')>200 OR p_input->>'subject' ~ '[[:cntrl:]]') THEN RETURN 'unmatched'; END IF;
 IF o.kind='media' THEN
  IF NOT (p_input ? 'subject') OR p_input->>'subject' IS DISTINCT FROM
   (SELECT 'Helix Website inquiry '||(recipe->>'primaryOutboxId') FROM support_production_private.media_batches WHERE id=o.id) THEN RETURN 'unmatched'; END IF;
 ELSIF p_input ? 'subject' AND p_input->>'subject'<>'Helix Website inquiry '||o.id THEN RETURN 'unmatched'; END IF;
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
CREATE FUNCTION public.reconcile_support_prod_media(p_input jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM support_production_private.validate_input(p_input,ARRAY['projectRef','contractId','outboxId','leaseId'],ARRAY['projectRef','contractId','outboxId','leaseId']);
 PERFORM support_production_private.media_context(p_input,true);
 IF NOT support_production_private.valid_uuid(p_input->'outboxId') OR NOT support_production_private.valid_uuid(p_input->'leaseId') THEN RAISE EXCEPTION 'support_invalid_input'; END IF;
 UPDATE support_production_private.outbox SET state='reconciliation',lease_id=NULL,lease_until=NULL
 WHERE id=(p_input->>'outboxId')::uuid AND kind='media' AND state='leased' AND lease_id=(p_input->>'leaseId')::uuid AND lease_until>clock_timestamp();
 RETURN FOUND;
END $$;

DO $$ DECLARE r record; n text; BEGIN
 FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='support_production_private' LOOP
  EXECUTE format('ALTER TABLE support_production_private.%I ENABLE ROW LEVEL SECURITY',r.tablename);
  EXECUTE format('ALTER TABLE support_production_private.%I FORCE ROW LEVEL SECURITY',r.tablename);
 END LOOP;
 FOREACH n IN ARRAY ARRAY['reserve_support_prod_photo','complete_support_prod_photo','read_support_prod_photos','claim_support_prod_photo','record_support_prod_photo_raw','finish_support_prod_photo','prepare_support_prod_media','finalize_support_prod_media','reconcile_support_prod_media'] LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION public.%I(jsonb) FROM PUBLIC,anon,authenticated,service_role',n);
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(jsonb) TO service_role',n);
 END LOOP;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA support_production_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA support_production_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA support_production_private FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
