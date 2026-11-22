-- Owner-only production maintenance for rotating the qualified storefront worker.
BEGIN;
SET LOCAL search_path = pg_catalog, pg_temp;
SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF current_user <> 'postgres' OR NOT private.production_marketing_direct_parent() THEN
    RAISE EXCEPTION 'Verified production database owner required';
  END IF;
END $$;

ALTER TABLE private.production_marketing_controls
  ADD COLUMN cutover_worker_binding_hash text CHECK (cutover_worker_binding_hash ~ '^[a-f0-9]{64}$'),
  ADD COLUMN cutover_primary_binding_hash text CHECK (cutover_primary_binding_hash ~ '^[a-f0-9]{64}$'),
  ADD COLUMN cutover_contract_hash text CHECK (cutover_contract_hash ~ '^[a-f0-9]{64}$'),
  ADD COLUMN cutover_expires_at timestamptz,
  ADD CONSTRAINT production_marketing_complete_worker_cutover CHECK (
    num_nonnulls(cutover_worker_binding_hash, cutover_primary_binding_hash, cutover_contract_hash, cutover_expires_at) IN (0, 4)
    AND cutover_worker_binding_hash <> cutover_primary_binding_hash
  );

CREATE FUNCTION private.production_marketing_clear_worker_cutover() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  NEW.cutover_worker_binding_hash := NULL;
  NEW.cutover_primary_binding_hash := NULL;
  NEW.cutover_contract_hash := NULL;
  NEW.cutover_expires_at := NULL;
  RETURN NEW;
END $$;

CREATE TRIGGER production_marketing_clear_worker_cutover
  BEFORE UPDATE OF delivery_contract_text ON private.production_marketing_controls
  FOR EACH ROW WHEN (OLD.delivery_contract_text IS DISTINCT FROM NEW.delivery_contract_text)
  EXECUTE FUNCTION private.production_marketing_clear_worker_cutover();

CREATE OR REPLACE FUNCTION private.production_marketing_direct_ready(p_contract_hash text,p_worker_binding_hash text) RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp RETURN EXISTS (
  SELECT FROM private.production_marketing_direct_policy q JOIN private.production_marketing_controls c USING(singleton)
    JOIN private.production_marketing_direct_lookup_key k USING(singleton)
  WHERE q.singleton AND private.production_marketing_direct_parent() AND sha256(k.secret)=q.lookup_key_hash
    AND q.topic_default='opt_in' AND q.baseline_evidence_sha256 IS NOT NULL AND q.intake_evidence_sha256 IS NOT NULL
    AND c.dispatch_enabled AND c.events_enabled AND c.daily_limit>0 AND c.monthly_limit>0
    AND private.production_marketing_direct_contract_valid(c.delivery_contract_text)
    AND encode(sha256(convert_to(c.delivery_contract_text,'UTF8')),'hex')=p_contract_hash
    AND (
      c.confirmation_worker_binding_hash=p_worker_binding_hash
      OR (c.cutover_worker_binding_hash=p_worker_binding_hash
        AND c.cutover_primary_binding_hash=c.confirmation_worker_binding_hash
        AND c.cutover_contract_hash=p_contract_hash AND statement_timestamp()<c.cutover_expires_at)
    )
    AND NOT EXISTS (SELECT FROM private.production_marketing_direct_receipts WHERE coverage_hold AND resolved_at IS NULL)
);

CREATE FUNCTION private.production_marketing_worker_cutover(
  p_action text, p_contract_hash text, p_expected_primary text, p_other_binding text, p_expires_at timestamptz DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  controls private.production_marketing_controls%ROWTYPE;
  observed_at timestamptz;
BEGIN
  IF current_user <> 'postgres' OR NOT private.production_marketing_direct_parent() THEN
    RAISE EXCEPTION 'Verified production database owner required';
  END IF;

  SELECT * INTO STRICT controls FROM private.production_marketing_controls WHERE singleton FOR UPDATE;
  observed_at := clock_timestamp();
  IF (p_contract_hash ~ '^[a-f0-9]{64}$' AND p_expected_primary ~ '^[a-f0-9]{64}$'
    AND p_other_binding ~ '^[a-f0-9]{64}$' AND p_expected_primary <> p_other_binding) IS NOT TRUE
    OR controls.confirmation_worker_binding_hash IS DISTINCT FROM p_expected_primary
    OR encode(sha256(convert_to(controls.delivery_contract_text, 'UTF8')), 'hex') IS DISTINCT FROM p_contract_hash THEN
    RAISE EXCEPTION 'Marketing worker cutover no longer matches the expected state';
  END IF;

  IF p_action = 'register' THEN
    IF p_expires_at IS NULL OR p_expires_at <= observed_at OR p_expires_at > observed_at + interval '30 minutes'
      OR controls.cutover_expires_at > observed_at
      OR NOT private.production_marketing_direct_ready(p_contract_hash, p_expected_primary) THEN
      RAISE EXCEPTION 'Marketing worker overlap cannot be registered';
    END IF;
    UPDATE private.production_marketing_controls SET cutover_worker_binding_hash = p_other_binding,
      cutover_primary_binding_hash = p_expected_primary, cutover_contract_hash = p_contract_hash,
      cutover_expires_at = p_expires_at WHERE singleton;
    RETURN;
  END IF;

  IF p_expires_at IS NOT NULL OR controls.cutover_worker_binding_hash IS DISTINCT FROM p_other_binding
    OR controls.cutover_contract_hash IS DISTINCT FROM p_contract_hash
    OR controls.cutover_primary_binding_hash IS DISTINCT FROM p_expected_primary THEN
    RAISE EXCEPTION 'Marketing worker overlap no longer matches the expected state';
  END IF;

  IF p_action = 'swap' THEN
    IF controls.cutover_expires_at <= observed_at
      OR NOT private.production_marketing_direct_ready(p_contract_hash, p_other_binding) THEN
      RAISE EXCEPTION 'Marketing worker overlap is no longer ready';
    END IF;
    UPDATE private.production_marketing_controls SET confirmation_worker_binding_hash = p_other_binding,
      cutover_worker_binding_hash = p_expected_primary, cutover_primary_binding_hash = p_other_binding WHERE singleton;
  ELSIF p_action = 'clear' THEN
    UPDATE private.production_marketing_controls SET cutover_worker_binding_hash = NULL,
      cutover_primary_binding_hash = NULL, cutover_contract_hash = NULL, cutover_expires_at = NULL WHERE singleton;
  ELSE
    RAISE EXCEPTION 'Unknown marketing worker cutover action';
  END IF;
END $$;

REVOKE ALL ON FUNCTION private.production_marketing_clear_worker_cutover(),
  private.production_marketing_worker_cutover(text,text,text,text,timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
