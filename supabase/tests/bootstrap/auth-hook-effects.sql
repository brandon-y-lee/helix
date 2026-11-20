-- Direct SQL insert into the local managed auth.users table. The caller rolls back.
-- Fingerprint all archived and current application rows, allowing only the four
-- expected inserts. No synthetic or business row contents leave PostgreSQL.
CREATE FUNCTION pg_temp.helix_auth_write_snapshot(target_user uuid)
RETURNS TABLE(relation oid, row_count bigint, row_hash text)
LANGUAGE plpgsql SET search_path = pg_catalog AS $body$
DECLARE
  t record;
  expected_key name;
  predicate text;
BEGIN
  FOR t IN
    SELECT c.oid, n.nspname, c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind IN ('r','p') AND
      (n.nspname IN ('public','private','app_ops','helix_development_prefix')
       OR c.oid='auth.users'::regclass)
  LOOP
    expected_key := CASE
      WHEN t.nspname='public' AND t.relname IN ('profiles','rewards_accounts','referral_codes') THEN 'user_id'
      WHEN t.oid='auth.users'::regclass THEN 'id'
      END;
    predicate := CASE WHEN expected_key IS NULL OR target_user IS NULL THEN '' ELSE format(' WHERE r.%I IS DISTINCT FROM $1',expected_key) END;
    RETURN QUERY EXECUTE format(
      'SELECT $2, count(*), encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text COLLATE "C")::text,''[]''),''UTF8'')),''hex'') FROM %I.%I r%s',
      t.nspname, t.relname, predicate) USING target_user, t.oid;
  END LOOP;
END
$body$;

DO $check$
DECLARE
  synthetic_id uuid := gen_random_uuid();
BEGIN
  CREATE TEMP TABLE helix_before_auth_write ON COMMIT DROP AS
    SELECT * FROM pg_temp.helix_auth_write_snapshot(NULL);
  INSERT INTO auth.users(id,raw_user_meta_data) VALUES
    (synthetic_id,'{"first_name":"Development","last_name":"Rehearsal"}'::jsonb);
  IF (SELECT count(*) FROM auth.users WHERE id=synthetic_id) <> 1 OR
     (SELECT count(*) FROM public.profiles WHERE user_id=synthetic_id AND first_name='Development' AND last_name='Rehearsal') <> 1 OR
     (SELECT count(*) FROM public.rewards_accounts WHERE user_id=synthetic_id) <> 1 OR
     (SELECT count(*) FROM public.referral_codes WHERE user_id=synthetic_id) <> 1 THEN
    RAISE EXCEPTION 'Auth insert failed to initialize exactly one profile, rewards account and referral code';
  END IF;
  IF EXISTS (
    SELECT FROM pg_temp.helix_before_auth_write old
    FULL JOIN pg_temp.helix_auth_write_snapshot(synthetic_id) current USING (relation)
    WHERE (old.row_count,old.row_hash) IS DISTINCT FROM (current.row_count,current.row_hash)
  ) THEN
    RAISE EXCEPTION 'Auth insert changed additional application or archive rows';
  END IF;
END
$check$;
