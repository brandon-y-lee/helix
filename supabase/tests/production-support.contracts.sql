-- SYNTHETIC ONLY. Loaded solely in the runner's uniquely owned disposable database.
CREATE SCHEMA production_support_test;
CREATE FUNCTION production_support_test.assert(ok boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',label; END IF; END $$;
CREATE FUNCTION production_support_test.input(n integer, overrides jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
LANGUAGE sql AS $$ SELECT jsonb_build_object(
 'projectRef','synthetic-support-project','contractId','synthetic-support-contract-v1',
 'submissionId',md5('submission'||n)::uuid,'payloadHash',repeat('a',64),'capabilityHash',repeat('b',64),
 'sourceHash',encode(sha256(convert_to('source'||n,'UTF8')),'hex'),
 'emailHash',encode(sha256(convert_to('email'||n,'UTF8')),'hex'),
 'name','Synthetic Visitor','email','synthetic-'||n||'@example.invalid','inquiryType','general','subject','Synthetic question',
 'body','Synthetic plain text only.','photos',jsonb_build_array(jsonb_build_object(
 'uploadId',md5('photo'||n)::uuid,'contentType','image/jpeg','byteSize',1))) || overrides $$;
CREATE FUNCTION production_support_test.submit(n integer, overrides jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
LANGUAGE sql AS $$ SELECT public.submit_support_prod_inquiry(production_support_test.input(n,overrides)) $$;
CREATE FUNCTION production_support_test.try_submit(n integer, overrides jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$ BEGIN RETURN production_support_test.submit(n,overrides);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('error',SQLERRM); END $$;
CREATE FUNCTION production_support_test.context(overrides jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
LANGUAGE sql AS $$ SELECT '{"projectRef":"synthetic-support-project","contractId":"synthetic-support-contract-v1"}'::jsonb||overrides $$;
GRANT USAGE ON SCHEMA production_support_test TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA production_support_test TO service_role;
