-- Run by the enrolled forward writer. The new label commits before any use.
CREATE FUNCTION private.extend_checkout_environment() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp SET lock_timeout = '3s'
AS $capability$
DECLARE
  labels text[];
BEGIN
  IF NOT EXISTS (SELECT FROM private.helix_environment WHERE singleton AND
      (environment,project_ref) IN (('development','zyfkunnpnlmgvrojmrbg'),('production','erasogmsqpgiirovubjh'))) THEN
    RAISE EXCEPTION 'Unexpected payment migration target';
  END IF;
  SELECT array_agg(enumlabel::text ORDER BY enumsortorder) INTO labels FROM pg_enum
    WHERE enumtypid='public.checkout_environment'::regtype;
  IF labels = ARRAY['sandbox','live'] THEN RETURN; END IF;
  IF labels IS DISTINCT FROM ARRAY['sandbox'] THEN RAISE EXCEPTION 'Unrecognized checkout mode contract'; END IF;
  ALTER TYPE public.checkout_environment ADD VALUE 'live';
END;
$capability$;
