DO $migration$
BEGIN
  IF current_user<>session_user OR NOT EXISTS (SELECT FROM pg_catalog.pg_proc p WHERE p.oid=pg_catalog.to_regprocedure('private.install_helix_welcome_release()')
    AND p.proowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='postgres')
    AND p.proowner=(SELECT relowner FROM pg_catalog.pg_class WHERE oid=pg_catalog.to_regclass('private.helix_environment'))
    AND p.prosecdef=true AND p.prolang=(SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql')
    AND p.prokind='f' AND NOT p.proretset AND NOT p.proleakproof AND NOT p.proisstrict
    AND p.proparallel='u' AND p.prosqlbody IS NULL
    AND p.prorettype='pg_catalog.void'::pg_catalog.regtype AND p.provolatile='v'
    AND p.proconfig=ARRAY['search_path=pg_catalog, pg_temp','lock_timeout=3s']
    AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex')='828c7e3b299564874c5bb16a6b5ef417dff3bd1a1a408594140baf5a4a32be90'
    AND EXISTS (SELECT FROM pg_catalog.aclexplode(p.proacl) a WHERE a.grantee=session_user::pg_catalog.regrole
      AND a.grantor=p.proowner AND a.privilege_type='EXECUTE' AND NOT a.is_grantable)
    AND NOT EXISTS (SELECT FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
      WHERE a.grantee<>p.proowner AND (a.grantee<>session_user::pg_catalog.regrole OR a.grantor<>p.proowner OR a.is_grantable)))
    THEN RAISE EXCEPTION 'Unqualified marketing deployment capability'; END IF;
  PERFORM private.install_helix_welcome_release();
END
$migration$;
