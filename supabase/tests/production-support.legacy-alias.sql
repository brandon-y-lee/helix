-- Synthetic only. The resolver is independently packaged for the legacy target, not new production SQL.
SELECT production_support_test.assert(NOT public.support_legacy_reply_aliases_match(ARRAY[repeat('a',64)]),'missing legacy table fails closed');
CREATE SCHEMA private;
CREATE TABLE private.support_reply_routes(address text NOT NULL);
INSERT INTO private.support_reply_routes(address) VALUES(' Reply+Exact@Example.Invalid '),('second@example.invalid');
DO $$ DECLARE exact_hash text:=encode(sha256(convert_to('reply+exact@example.invalid','UTF8')),'hex');
 second_hash text:=encode(sha256(convert_to('second@example.invalid','UTF8')),'hex'); BEGIN
 PERFORM production_support_test.assert(public.support_legacy_reply_aliases_match(ARRAY[exact_hash]),'exact normalized alias matched');
 PERFORM production_support_test.assert(public.support_legacy_reply_aliases_match(ARRAY[exact_hash,second_hash]),'all exact aliases matched');
 PERFORM production_support_test.assert(NOT public.support_legacy_reply_aliases_match(ARRAY[exact_hash,repeat('f',64)]),'mixed unknown alias fails closed');
 PERFORM production_support_test.assert(NOT public.support_legacy_reply_aliases_match(ARRAY[encode(sha256(convert_to('reply+arbitrary@example.invalid','UTF8')),'hex')]),'matching domain or prefix not enough');
 PERFORM production_support_test.assert(NOT public.support_legacy_reply_aliases_match('{}'::text[]),'empty hash set fails closed');
 PERFORM production_support_test.assert(NOT public.support_legacy_reply_aliases_match(ARRAY[NULL]::text[]),'null digest fails closed');
 PERFORM production_support_test.assert(NOT public.support_legacy_reply_aliases_match(ARRAY[upper(exact_hash)]),'uppercase digest fails closed');
 PERFORM production_support_test.assert(NOT public.support_legacy_reply_aliases_match(ARRAY[[exact_hash]]),'multidimensional hashes fail closed');
 PERFORM production_support_test.assert(NOT public.support_legacy_reply_aliases_match(array_fill(exact_hash,ARRAY[101])),'oversized hash set fails closed');
 PERFORM production_support_test.assert(production_support_test.denied('SELECT public.support_legacy_reply_aliases_match(ARRAY['''||exact_hash||'''])','anon'),'anon alias RPC denied');
 PERFORM production_support_test.assert(production_support_test.denied('SELECT public.support_legacy_reply_aliases_match(ARRAY['''||exact_hash||'''])','authenticated'),'authenticated alias RPC denied');
END $$;
SET ROLE service_role;
SELECT production_support_test.assert(public.support_legacy_reply_aliases_match(ARRAY[encode(sha256(convert_to('reply+exact@example.invalid','UTF8')),'hex')]),'service role exact alias resolver callable');
RESET ROLE;
