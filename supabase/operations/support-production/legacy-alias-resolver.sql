-- SEPARATE legacy target operator installation only. Not installed by install.sql or migration discovery.
-- Read only exact stored legacy aliases; no message content or provider data is received here.
BEGIN;
DO $$ BEGIN
 IF current_user IN ('anon','authenticated','service_role','authenticator')
 OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
  RAISE EXCEPTION 'support_install_requires_trusted_operator';
 END IF;
END $$;
CREATE FUNCTION public.support_legacy_reply_aliases_match(p_address_hashes text[]) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE matched boolean;
BEGIN
 IF p_address_hashes IS NULL OR coalesce(array_ndims(p_address_hashes),0)<>1
 OR cardinality(p_address_hashes) NOT BETWEEN 1 AND 100
 OR EXISTS(SELECT 1 FROM unnest(p_address_hashes) h WHERE h IS NULL OR h !~ '^[0-9a-f]{64}$') THEN RETURN false; END IF;
 IF to_regclass('private.support_reply_routes') IS NULL THEN
  RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='support_legacy_aliases_unavailable';
 END IF;
 -- Dynamic statement permits installation when the optional legacy relation is absent.
 EXECUTE 'SELECT NOT EXISTS(SELECT 1 FROM unnest($1) h WHERE NOT EXISTS (
  SELECT 1 FROM private.support_reply_routes r
  WHERE encode(sha256(convert_to(lower(btrim(r.address)),''UTF8'')),''hex'')=h))'
 INTO matched USING p_address_hashes;
 RETURN coalesce(matched,false);
EXCEPTION WHEN undefined_table OR undefined_column OR insufficient_privilege THEN
 RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='support_legacy_aliases_unavailable';
END $$;
REVOKE ALL ON FUNCTION public.support_legacy_reply_aliases_match(text[]) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.support_legacy_reply_aliases_match(text[]) TO service_role;
COMMIT;
