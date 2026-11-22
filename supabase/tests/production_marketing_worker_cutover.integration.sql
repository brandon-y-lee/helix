-- Runs after the direct welcome fixture in a disposable production-shaped database.
BEGIN;

DO $$
DECLARE
  contract text := proof.hash(proof.contract());
  original text := repeat('b', 64);
  replacement text := repeat('d', 64);
  third text := repeat('e', 64);
  deadline timestamptz := statement_timestamp() + interval '10 minutes';
  msg uuid;
  lease_id uuid;
  retained jsonb;
  role_name text;
  column_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role','unexpected'] LOOP
    PERFORM proof.check(NOT has_function_privilege(role_name,
      'private.production_marketing_worker_cutover(text,text,text,text,timestamptz)','EXECUTE'),
      'only the database owner can execute worker overlap changes');
    FOREACH column_name IN ARRAY ARRAY['cutover_worker_binding_hash','cutover_primary_binding_hash','cutover_contract_hash','cutover_expires_at'] LOOP
      PERFORM proof.check(NOT has_column_privilege(role_name,'private.production_marketing_controls',column_name,'SELECT,UPDATE'),
        'only the database owner can access worker overlap fields');
    END LOOP;
  END LOOP;
  PERFORM proof.check(proof.ready(original) AND NOT proof.ready(replacement), 'installation preserves the current worker alone');

  BEGIN
    PERFORM private.production_marketing_worker_cutover('register', contract, original, replacement, deadline + interval '1 hour');
    RAISE EXCEPTION 'registered an unbounded overlap' USING ERRCODE = 'XX000';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
  PERFORM private.production_marketing_worker_cutover('register', contract, original, replacement, deadline);
  PERFORM proof.check(proof.ready(original) AND proof.ready(replacement) AND NOT proof.ready(third)
    AND NOT public.production_marketing_enrollment_ready(third,replacement), 'overlap accepts only the two exact workers and contract');

  BEGIN
    PERFORM private.production_marketing_worker_cutover('register', contract, original, third, deadline);
    RAISE EXCEPTION 'overwrote an active overlap' USING ERRCODE = 'XX000';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;

  msg := proof.seed_lease('cutover-retained', 'retry');
  SELECT lease, frozen INTO STRICT lease_id, retained FROM proof.races WHERE id = msg;
  PERFORM private.production_marketing_worker_cutover('swap', contract, original, replacement);
  PERFORM proof.check(proof.ready(original) AND proof.ready(replacement)
    AND (SELECT confirmation_worker_binding_hash=replacement AND cutover_expires_at=deadline
      FROM private.production_marketing_controls WHERE singleton),
    'swapping the primary retains the old worker with the original deadline');
  PERFORM proof.check(public.retry_direct_production_marketing_message(msg,lease_id,contract,replacement)->>'idempotencyKey'
    = retained->>'idempotencyKey','the replacement can retry the existing frozen message with its original key');
  PERFORM proof.check(public.withdraw_production_marketing_subscription(proof.hash('cutover-retained-p')),
    'first-party withdrawal survives a worker swap');

  BEGIN
    PERFORM private.production_marketing_worker_cutover('clear', contract, original, replacement);
    RAISE EXCEPTION 'accepted stale expected primary' USING ERRCODE = 'XX000';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
  PERFORM private.production_marketing_worker_cutover('clear', contract, replacement, original);
  PERFORM proof.check(proof.ready(replacement) AND NOT proof.ready(original),'clearing overlap leaves only the new primary');

  PERFORM private.production_marketing_worker_cutover('register', contract, replacement, original, deadline);
  UPDATE private.production_marketing_controls SET cutover_expires_at=statement_timestamp() - interval '1 second' WHERE singleton;
  PERFORM proof.check(proof.ready(replacement) AND NOT proof.ready(original),'expired overlap fails closed for the alternate alone');
  BEGIN
    PERFORM private.production_marketing_worker_cutover('swap', contract, replacement, original);
    RAISE EXCEPTION 'accepted expired overlap' USING ERRCODE = 'XX000';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;

  PERFORM private.production_marketing_worker_cutover('register', contract, replacement, original, deadline);
  UPDATE private.production_marketing_controls SET confirmation_worker_binding_hash=third WHERE singleton;
  PERFORM proof.check(proof.ready(third) AND NOT proof.ready(original),'changing the primary invalidates a mismatched overlap');
  UPDATE private.production_marketing_controls SET delivery_contract_text=proof.contract() || ' ',
    confirmation_worker_binding_hash=replacement WHERE singleton;
  PERFORM proof.check((SELECT num_nonnulls(cutover_worker_binding_hash,cutover_primary_binding_hash,cutover_contract_hash,cutover_expires_at)=0
    FROM private.production_marketing_controls WHERE singleton),'a paired contract and primary change erases overlap');
  UPDATE private.production_marketing_controls SET delivery_contract_text=proof.contract(),
    confirmation_worker_binding_hash=third WHERE singleton;
  PERFORM proof.check(proof.ready(third) AND NOT proof.ready(original),'restoring the original contract cannot re-arm a cleared overlap');
END $$;

ROLLBACK;
