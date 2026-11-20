-- Execute with search_path=pg_catalog. Only pg_catalog metadata is read. SQL bodies,
-- ACL arrays and trigger arguments are compared inside Postgres and never returned.
WITH app_schemas AS (
  SELECT oid, nspname FROM pg_catalog.pg_namespace WHERE nspname IN ('public','private','app_ops')
), relations AS (
  SELECT c.*, n.nspname, format('%I.%I', n.nspname, c.relname) AS name
  FROM pg_catalog.pg_class c JOIN app_schemas n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r','p','S','v','m')
    AND NOT EXISTS (SELECT FROM pg_catalog.pg_depend d WHERE d.deptype='e'
      AND d.classid='pg_catalog.pg_class'::regclass AND d.objid=c.oid)
), functions AS (
  SELECT p.*, format('%I.%I(%s)', n.nspname, p.proname, pg_catalog.oidvectortypes(p.proargtypes)) AS name,
    n.nspname FROM pg_catalog.pg_proc p JOIN app_schemas n ON n.oid=p.pronamespace
  WHERE p.prokind IN ('f','p') AND NOT EXISTS (SELECT FROM pg_catalog.pg_depend d
    WHERE d.deptype='e' AND d.classid='pg_catalog.pg_proc'::regclass AND d.objid=p.oid)
), media_routines AS (
  SELECT * FROM (VALUES
    ('private.enforce_catalog_draft_media()',1),
    ('private.is_current_product_media_url(text, uuid)',2),
    ('public.cutover_catalog_product_media(jsonb)',2)
  ) expected(name, occurrences)
), media_constraint AS (
  SELECT c.oid, pg_catalog.pg_get_constraintdef(c.oid) AS definition
  FROM pg_catalog.pg_constraint c JOIN relations r ON r.oid=c.conrelid
  WHERE r.name='public.product_media' AND c.conname='product_media_core_routine_editorial_shape_check'
), hooks AS (
  SELECT * FROM (VALUES ('products'), ('product_media'), ('product_variants'),
    ('product_pdp_content'), ('product_families'), ('product_family_memberships')) tables(name)
), triggers AS (
  SELECT t.oid, t.tgname, t.tgenabled, n.nspname, c.relname, t.tgfoid,
    t.tgtype=5 AND t.tgenabled='O' AND t.tgnargs=0 AND t.tgqual IS NULL AND t.tgconstraint=0 AS after_insert,
    n.nspname='public' AND c.relname IN (SELECT name FROM hooks)
      AND t.tgname='helix_catalog_search_sync_' || c.relname AS operational
  FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE NOT t.tgisinternal AND (c.oid IN (SELECT oid FROM relations)
    OR (n.nspname='auth' AND c.relname='users' AND t.tgname IN
      ('on_auth_user_created_profile','on_auth_user_created_loyalty','on_auth_user_created_rewards')))
), auth_hooks AS (
  SELECT t.*, t.after_insert AND t.tgfoid=pg_catalog.to_regprocedure(
      CASE t.tgname WHEN 'on_auth_user_created_profile' THEN 'public.handle_new_user_profile()'
      ELSE 'public.handle_new_user_rewards()' END)
    AND (SELECT count(*) FROM pg_catalog.pg_trigger other WHERE other.tgrelid='auth.users'::regclass
      AND NOT other.tgisinternal AND other.tgfoid=t.tgfoid)=1 AS canonical
  FROM triggers t WHERE t.nspname='auth' AND t.relname='users'
), roles AS (
  SELECT oid, rolname, rolbypassrls, rolcanlogin, rolcreaterole, rolcreatedb, rolsuper, rolreplication
  FROM pg_catalog.pg_roles WHERE rolname IN ('anon','authenticated','service_role')
), privileges AS (
  SELECT 'table'::text AS kind, r.name, s.rolname, perm,
    pg_catalog.has_table_privilege(s.oid,r.oid,perm) AS allowed,
    pg_catalog.has_table_privilege(s.oid,r.oid,perm||' WITH GRANT OPTION') AS delegable
  FROM relations r CROSS JOIN roles s CROSS JOIN
    unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) perm
  WHERE r.relkind <> 'S'
  UNION ALL SELECT 'sequence',r.name,s.rolname,perm,pg_catalog.has_sequence_privilege(s.oid,r.oid,perm),
    pg_catalog.has_sequence_privilege(s.oid,r.oid,perm||' WITH GRANT OPTION')
  FROM relations r CROSS JOIN roles s CROSS JOIN unnest(ARRAY['USAGE','SELECT','UPDATE']) perm WHERE r.relkind='S'
  UNION ALL SELECT 'routine',f.name,s.rolname,'EXECUTE',pg_catalog.has_function_privilege(s.oid,f.oid,'EXECUTE'),
    pg_catalog.has_function_privilege(s.oid,f.oid,'EXECUTE WITH GRANT OPTION')
  FROM functions f CROSS JOIN roles s
  UNION ALL SELECT 'schema',n.nspname,s.rolname,perm,pg_catalog.has_schema_privilege(s.oid,n.oid,perm),
    pg_catalog.has_schema_privilege(s.oid,n.oid,perm||' WITH GRANT OPTION')
  FROM app_schemas n CROSS JOIN roles s CROSS JOIN unnest(ARRAY['USAGE','CREATE']) perm
), objects(kind, name, definition) AS (
  SELECT 'relation',r.name,jsonb_build_array(r.relkind,pg_catalog.pg_get_userbyid(r.relowner),
    r.relrowsecurity,r.relforcerowsecurity,r.relpersistence,r.relreplident,r.reloptions,
    CASE WHEN r.relkind IN ('v','m') THEN pg_catalog.pg_get_viewdef(r.oid) END)
  FROM relations r
  UNION ALL SELECT 'column',r.name||'.'||a.attname,jsonb_build_array(pg_catalog.format_type(a.atttypid,a.atttypmod),
    a.attnotnull,a.attidentity,a.attgenerated,pg_catalog.pg_get_expr(d.adbin,d.adrelid),
    a.attcollation::regcollation::text,a.attstorage,a.attacl)
  FROM relations r JOIN pg_catalog.pg_attribute a ON a.attrelid=r.oid AND a.attnum>0 AND NOT a.attisdropped
    LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=r.oid AND d.adnum=a.attnum
  WHERE r.relkind <> 'S'
  UNION ALL SELECT 'constraint',r.name||'.'||c.conname,jsonb_build_array(c.contype,c.convalidated,
    c.condeferrable,c.condeferred,CASE WHEN m.oid IS NOT NULL THEN
      replace(replace(m.definition,'erasogmsqpgiirovubjh','<media-project>'),'zyfkunnpnlmgvrojmrbg','<media-project>')
      ELSE pg_catalog.pg_get_constraintdef(c.oid) END)
  FROM pg_catalog.pg_constraint c JOIN relations r ON r.oid=c.conrelid LEFT JOIN media_constraint m ON m.oid=c.oid
  UNION ALL SELECT 'index', r.name||'.'||i.indexrelid::regclass::text,
    jsonb_build_array(i.indisvalid,i.indisready,pg_catalog.pg_get_indexdef(i.indexrelid))
  FROM pg_catalog.pg_index i JOIN relations r ON r.oid=i.indrelid
  UNION ALL SELECT 'enum',n.nspname||'.'||t.typname, jsonb_agg(e.enumlabel ORDER BY e.enumsortorder)
  FROM pg_catalog.pg_type t JOIN app_schemas n ON n.oid=t.typnamespace JOIN pg_catalog.pg_enum e ON e.enumtypid=t.oid
  GROUP BY n.nspname,t.typname
  UNION ALL SELECT 'sequence',r.name,jsonb_build_array(s.seqtypid::regtype::text,s.seqstart,s.seqincrement,
    s.seqmax,s.seqmin,s.seqcache,s.seqcycle) FROM pg_catalog.pg_sequence s JOIN relations r ON r.oid=s.seqrelid
  UNION ALL SELECT 'routine',f.name,jsonb_build_array(pg_catalog.pg_get_userbyid(f.proowner),
    CASE WHEN m.name IS NOT NULL THEN replace(replace(pg_catalog.pg_get_functiondef(f.oid),
      'erasogmsqpgiirovubjh','<media-project>'),'zyfkunnpnlmgvrojmrbg','<media-project>') ELSE pg_catalog.pg_get_functiondef(f.oid) END)
  FROM functions f LEFT JOIN media_routines m ON m.name=f.name
  UNION ALL SELECT 'trigger',t.nspname||'.'||t.relname||'.'||
    CASE WHEN h.canonical AND h.tgname='on_auth_user_created_loyalty' THEN 'on_auth_user_created_rewards' ELSE t.tgname END,
    jsonb_build_array(t.tgenabled,CASE WHEN h.canonical AND h.tgname='on_auth_user_created_loyalty' THEN
      replace(pg_catalog.pg_get_triggerdef(t.oid),'CREATE TRIGGER on_auth_user_created_loyalty ',
        'CREATE TRIGGER on_auth_user_created_rewards ') ELSE pg_catalog.pg_get_triggerdef(t.oid) END)
    FROM triggers t LEFT JOIN auth_hooks h ON h.oid=t.oid WHERE NOT t.operational
  UNION ALL SELECT 'policy',n.nspname||'.'||c.relname||'.'||p.polname,jsonb_build_array(p.polpermissive,p.polcmd,
    (SELECT array_agg(grantee ORDER BY grantee COLLATE "C") FROM
      (SELECT CASE role WHEN 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(role) END AS grantee FROM unnest(p.polroles) role) policy_roles),pg_catalog.pg_get_expr(p.polqual,p.polrelid),pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid))
  FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE c.oid IN (SELECT oid FROM relations) OR (n.nspname='storage' AND c.relname='objects' AND p.polname IN
    ('Public read helix catalog assets','Service role manages helix catalog assets'))
), sections AS (
  SELECT kind, count(*) AS count, encode(sha256(convert_to(
    string_agg(jsonb_build_array(name,definition)::text,E'\n' ORDER BY name COLLATE "C"),'UTF8')),'hex') AS fingerprint
  FROM objects GROUP BY kind
), access_sections AS (
  SELECT kind, count(*) FILTER (WHERE allowed) AS allowed, encode(sha256(convert_to(string_agg(
    jsonb_build_array(name,rolname,perm,allowed)::text,E'\n' ORDER BY name COLLATE "C",rolname COLLATE "C",perm COLLATE "C"),'UTF8')),'hex') AS fingerprint
  FROM privileges GROUP BY kind
), media_checks AS (
  SELECT m.name, m.occurrences, f.prosrc AS definition FROM media_routines m LEFT JOIN functions f ON f.name=m.name
  UNION ALL SELECT 'public.product_media editorial URL constraint',1,(SELECT definition FROM media_constraint)
), target_bindings AS (
  SELECT ref, bool_and(coalesce(array_length(string_to_array(definition,ref),1)-1=occurrences,false)) AS exact
  FROM media_checks CROSS JOIN (VALUES ('erasogmsqpgiirovubjh'),('zyfkunnpnlmgvrojmrbg')) targets(ref)
  GROUP BY ref
), default_grants AS (
  SELECT n.nspname,pg_catalog.pg_get_userbyid(d.defaclrole) AS owner,d.defaclobjtype::text AS kind,
    CASE a.grantee WHEN 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END AS grantee,a.privilege_type
  FROM pg_catalog.pg_default_acl d LEFT JOIN pg_catalog.pg_namespace n ON n.oid=d.defaclnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) a
  WHERE d.defaclrole='postgres'::regrole AND (n.nspname IN ('public','private','app_ops') OR d.defaclnamespace=0)
)
SELECT jsonb_build_object(
  'searchPathPinned',current_schemas(false)=ARRAY['pg_catalog']::name[],
  'objects',(SELECT jsonb_object_agg(kind,jsonb_build_object('count',count,'sha256',fingerprint)) FROM sections),
  'effectivePrivileges',(SELECT jsonb_object_agg(kind,jsonb_build_object('allowed',allowed,'sha256',fingerprint)) FROM access_sections),
  'authHooks',(SELECT coalesce(jsonb_object_agg(tgname,jsonb_build_object('triggerOid',oid::text,
    'handlerOid',tgfoid::text,'canonical',coalesce(canonical,false))),'{}'::jsonb) FROM auth_hooks),
  'effectiveMaintenanceGrants',(SELECT jsonb_object_agg(rolname,counts) FROM (SELECT rolname,
    jsonb_build_object('TRUNCATE',count(*) FILTER (WHERE perm='TRUNCATE' AND allowed),
    'TRIGGER',count(*) FILTER (WHERE perm='TRIGGER' AND allowed),'MAINTAIN',count(*) FILTER (WHERE perm='MAINTAIN' AND allowed),
    'REFERENCES',count(*) FILTER (WHERE perm='REFERENCES' AND allowed)) AS counts FROM privileges WHERE kind='table' GROUP BY rolname) summary),
  'runtimeRoles',(SELECT jsonb_agg(rolname ORDER BY rolname) FROM roles),
  'delegablePrivilegeCount',(SELECT count(*) FROM privileges WHERE delegable),
  'runtimeRoleBoundaries',(SELECT jsonb_object_agg(rolname,jsonb_build_object(
    'bypassRls',rolbypassrls,'canLogin',rolcanlogin,'createRole',rolcreaterole,
    'createDatabase',rolcreatedb,'superuser',rolsuper,'replication',rolreplication)) FROM roles),
  'defaultClientTruncateGrant',EXISTS (SELECT FROM default_grants WHERE grantee IN ('PUBLIC','anon','authenticated') AND privilege_type='TRUNCATE'),
  'defaultRuntimeGrants',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY nspname,owner,kind,grantee,privilege_type),'[]'::jsonb)
    FROM default_grants d WHERE grantee IN ('PUBLIC','anon','authenticated','service_role')),
  'mediaProjectBindings',(SELECT jsonb_object_agg(ref,exact) FROM target_bindings),
  'environmentCatalogHookCount',(SELECT count(*) FROM triggers WHERE operational),
  'managedStorageTriggerCount',(SELECT count(*) FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='storage' AND c.relname IN ('buckets','objects') AND NOT t.tgisinternal),
  'managedRealtimePublication',EXISTS (SELECT FROM pg_catalog.pg_publication WHERE pubname='supabase_realtime'),
  'realtimeMembers',(SELECT coalesce(jsonb_agg(schemaname||'.'||tablename ORDER BY schemaname,tablename),'[]'::jsonb)
    FROM pg_catalog.pg_publication_tables WHERE pubname='supabase_realtime')
) AS verification;
