-- The schema renderer installs the source-owned handler definitions, including
-- their original fixed search paths. Bind a clean fixture or verify the upgraded
-- fixture's original trigger OIDs. Do not replace or disable managed Auth hooks.
DO $hooks$
DECLARE expected record;
BEGIN
  LOCK TABLE auth.users IN ACCESS EXCLUSIVE MODE NOWAIT;
  FOR expected IN SELECT * FROM (VALUES
    ('on_auth_user_created_profile','public.handle_new_user_profile()'::regprocedure),
    (CASE WHEN to_regnamespace('helix_development_prefix') IS NULL THEN 'on_auth_user_created_rewards'
          ELSE 'on_auth_user_created_loyalty' END,'public.handle_new_user_rewards()'::regprocedure)
  ) h(name, handler)
  LOOP
    IF NOT EXISTS (SELECT FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND tgname=expected.name) THEN
      IF to_regnamespace('helix_development_prefix') IS NOT NULL THEN
        RAISE EXCEPTION 'Original Auth hook missing from recovered development';
      END IF;
      EXECUTE format('CREATE TRIGGER %I AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION %s',
        expected.name,expected.handler);
    END IF;
    IF NOT EXISTS (SELECT FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND tgname=expected.name
      AND tgfoid=expected.handler AND tgtype=5 AND tgenabled='O' AND tgqual IS NULL
      AND tgnargs=0 AND tgconstraint=0 AND NOT tgisinternal)
      OR (SELECT count(*) FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND tgfoid=expected.handler)<>1 THEN
      RAISE EXCEPTION 'Unexpected Auth binding for %', expected.name;
    END IF;
  END LOOP;
  IF to_regprocedure('public.handle_new_user_loyalty()') IS NOT NULL OR
     EXISTS (SELECT FROM pg_trigger WHERE tgrelid='auth.users'::regclass
        AND tgname IN ('on_auth_user_created_rewards','on_auth_user_created_loyalty')
        AND tgfoid<>'public.handle_new_user_rewards()'::regprocedure) THEN
    RAISE EXCEPTION 'Obsolete loyalty writer is still bound';
  END IF;
END
$hooks$;
