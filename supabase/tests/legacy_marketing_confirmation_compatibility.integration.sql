-- Synthetic-only proof, executed by the guarded disposable-database runner.
BEGIN;
CREATE FUNCTION marketing_contract_test.compat_state() RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'subscribers',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM private.marketing_subscribers s),
    'generations',(SELECT jsonb_agg(to_jsonb(g) ORDER BY subscriber_id,generation) FROM private.marketing_generations g),
    'tokens',(SELECT jsonb_agg(to_jsonb(t) ORDER BY token_hash) FROM private.marketing_confirmation_tokens t),
    'preferences',(SELECT jsonb_agg(to_jsonb(t) ORDER BY token_hash) FROM private.marketing_preference_tokens t),
    'evidence',(SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM private.marketing_consent_evidence e),
    'intents',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM private.email_intents i),
    'controls',(SELECT jsonb_agg(to_jsonb(c) ORDER BY environment,purpose) FROM private.email_controls c));
$$;
SELECT marketing_contract_test.assert(NOT has_function_privilege('anon',
  'public.confirm_marketing_subscription_scoped(text,text,text)','EXECUTE'), 'anonymous execution denied');
SELECT marketing_contract_test.assert(NOT has_function_privilege('authenticated',
  'public.confirm_marketing_subscription_scoped(text,text,text)','EXECUTE'), 'authenticated execution denied');
SELECT marketing_contract_test.assert(has_function_privilege('service_role',
  'public.confirm_marketing_subscription_scoped(text,text,text)','EXECUTE'), 'service execution allowed');
SELECT marketing_contract_test.assert((SELECT NOT prosecdef AND proconfig=ARRAY['search_path=""']
  FROM pg_proc WHERE oid='public.confirm_marketing_subscription_scoped(text,text,text)'::regprocedure),
  'shim is invoker with an empty search path');
DELETE FROM private.marketing_request_limits;
SET LOCAL ROLE service_role;
SELECT public.request_marketing_subscription('compat-welcome@example.invalid','footer','welcome_v1',
  repeat('W',64),repeat('b',64),true,marketing_contract_test.contract());
RESET ROLE;
-- Unknown/future contracts can exist in retained history; do not reinterpret one
-- as welcome consent merely because the legacy function is available.
WITH subscriber AS (
  INSERT INTO private.marketing_subscribers(normalized_email,status,current_confirmation_hash)
    VALUES('compat-future@example.invalid','pending',encode(extensions.digest(repeat('F',64),'sha256'),'hex')) RETURNING id
), generation AS (
  INSERT INTO private.marketing_generations(subscriber_id,generation,template_contract,source,wording_version)
    SELECT id,1,jsonb_set(marketing_contract_test.contract(),'{version}','"lifecycle_v1"'),
      'synthetic-future','synthetic-future' FROM subscriber RETURNING subscriber_id,generation
)
INSERT INTO private.marketing_confirmation_tokens(token_hash,subscriber_id,generation,expires_at)
  SELECT encode(extensions.digest(repeat('F',64),'sha256'),'hex'),subscriber_id,generation,
    clock_timestamp()+interval '1 day' FROM generation;
DO $$ DECLARE before_state jsonb; scope text; BEGIN
  before_state:=marketing_contract_test.compat_state();
  FOREACH scope IN ARRAY ARRAY['lifecycle','lifecycle_reviews','unknown',NULL] LOOP
    PERFORM marketing_contract_test.assert(public.confirm_marketing_subscription_scoped(repeat('W',64),repeat('P',64),scope)
      ='{"status":"invalid"}'::jsonb,'unavailable scope is rejected');
  END LOOP;
  PERFORM marketing_contract_test.assert(public.confirm_marketing_subscription_scoped(repeat('F',64),repeat('P',64),'welcome')
    ='{"status":"invalid"}'::jsonb,'future contract is not welcome consent');
  PERFORM marketing_contract_test.assert(public.confirm_marketing_subscription_scoped(NULL,repeat('P',64),'welcome')
    ='{"status":"invalid"}'::jsonb,'missing capability is rejected');
  PERFORM marketing_contract_test.assert(public.confirm_marketing_subscription_scoped('invalid',repeat('P',64),'welcome')
    ='{"status":"invalid"}'::jsonb,'malformed capability is rejected');
  PERFORM marketing_contract_test.assert(marketing_contract_test.compat_state()=before_state,
    'rejection preserves tokens, subscribers, evidence, intents and controls');
END $$;
SET LOCAL ROLE service_role;
SELECT marketing_contract_test.assert(public.confirm_marketing_subscription_scoped(repeat('W',64),repeat('P',64),'welcome')->>'status'='confirmed',
  'retained welcome link confirms through the legacy boundary');
SELECT marketing_contract_test.assert(public.confirm_marketing_subscription_scoped(repeat('W',64),repeat('Q',64),'welcome')->>'status'='confirmed',
  'replay retains legacy idempotence');
RESET ROLE;
SELECT marketing_contract_test.assert((SELECT count(*)=1 FROM private.marketing_consent_evidence e
  JOIN private.marketing_subscribers s ON s.id=e.subscriber_id WHERE s.normalized_email='compat-welcome@example.invalid' AND e.event='confirmed'),
  'one confirmed consent event');
SELECT marketing_contract_test.assert((SELECT count(*)=1 FROM private.marketing_preference_tokens t
  JOIN private.marketing_subscribers s ON s.id=t.subscriber_id WHERE s.normalized_email='compat-welcome@example.invalid'),
  'one preference capability');
ROLLBACK;
