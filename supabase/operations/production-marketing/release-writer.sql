-- Inside a verified owner block; writer is the fixed role OID for this target.
IF NOT EXISTS (SELECT FROM pg_roles r WHERE r.oid=writer AND r.rolcanlogin
    AND NOT (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls))
  OR EXISTS (SELECT FROM pg_auth_members m WHERE m.member=writer OR
    (m.roleid=writer AND m.member<>'postgres'::regrole))
  OR has_database_privilege(writer,current_database(),'CREATE')
  OR EXISTS (SELECT FROM pg_namespace n WHERE n.nspname IN ('private','public','supabase_migrations')
    AND (has_schema_privilege(writer,n.oid,'CREATE') OR NOT has_schema_privilege(writer,n.oid,'USAGE')))
  OR EXISTS (SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('private','public','supabase_migrations') AND c.relkind IN ('r','p','m','v','f') AND
      (has_table_privilege(writer,c.oid,'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
       OR has_any_column_privilege(writer,c.oid,'UPDATE,REFERENCES')
       OR (c.oid<>'supabase_migrations.schema_migrations'::regclass AND has_any_column_privilege(writer,c.oid,'INSERT'))
       OR (n.nspname='private' AND has_any_column_privilege(writer,c.oid,'SELECT'))))
  OR NOT has_table_privilege(writer,'supabase_migrations.schema_migrations','SELECT')
  OR NOT has_table_privilege(writer,'supabase_migrations.schema_migrations','INSERT')
  OR has_table_privilege(writer,'supabase_migrations.schema_migrations','SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION')
  OR EXISTS (SELECT FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    WHERE d.defaclrole='postgres'::regrole AND a.grantee=writer
      AND d.defaclnamespace IN (0,'private'::regnamespace,'public'::regnamespace,'supabase_migrations'::regnamespace))
  OR EXISTS (SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN ('private','public','supabase_migrations') AND p.prosecdef AND has_function_privilege(writer,p.oid,'EXECUTE')
      AND NOT (n.nspname='private' AND p.oid=ANY(array_remove(ARRAY[
        to_regprocedure('private.read_helix_environment()'),to_regprocedure('private.apply_helix_catalog_media_binding()'),
        to_regprocedure('private.apply_helix_catalog_order_index()'),to_regprocedure('private.is_bound_catalog_product_media_url(text)'),
        to_regprocedure('private.extend_checkout_environment()'),to_regprocedure('private.install_live_checkout_contract()'),
        to_regprocedure('private.extend_business_checkout_environment()'),to_regprocedure('private.install_first_order_checkout()'),
        to_regprocedure('private.install_helix_welcome_release()')]::oid[],NULL)))
      AND NOT (n.nspname='public' AND EXISTS (SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        WHERE a.grantee=0 AND a.privilege_type='EXECUTE'))) THEN
  RAISE EXCEPTION 'The authenticated restricted release writer is required';
END IF;
