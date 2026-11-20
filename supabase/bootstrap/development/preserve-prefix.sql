-- Local, transactional rehearsal only. Call before installing current application DDL.
-- These two independent guards exclude the normal hosted database and TCP connections.
DO $guard$
BEGIN
  IF current_database() !~ '^helix_bootstrap_prefix_[0-9a-f]{12}$'
     OR current_setting('helix.bootstrap_scope', true) IS DISTINCT FROM 'local-prefix-rehearsal'
     OR inet_server_addr() IS NOT NULL OR session_user <> 'postgres' OR current_user <> session_user
     OR current_setting('server_version_num')::int / 10000 <> 17 THEN
    RAISE EXCEPTION 'Local prefix rehearsal target required';
  END IF;
  IF to_regnamespace('helix_development_prefix') IS NOT NULL OR to_regnamespace('private') IS NOT NULL
     OR to_regnamespace('app_ops') IS NOT NULL OR to_regclass('supabase_migrations.schema_migrations') IS NULL THEN
    RAISE EXCEPTION 'Unexpected development bootstrap starting schema';
  END IF;
END
$guard$;

SET LOCAL search_path TO pg_catalog;

-- Acquire the writer boundary before collecting any counts or ACLs. A shared lock on
-- the genuine ledger allows readers but rejects inserts while the prefix is verified.
LOCK TABLE auth.users, storage.buckets, storage.objects IN ACCESS EXCLUSIVE MODE NOWAIT;
LOCK TABLE supabase_migrations.schema_migrations IN SHARE MODE NOWAIT;
DO $locks$
DECLARE r record;
BEGIN
  FOR r IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.oid
  LOOP
    EXECUTE format('LOCK TABLE ONLY %I.%I IN ACCESS EXCLUSIVE MODE NOWAIT', r.nspname, r.relname);
  END LOOP;
END
$locks$;

CREATE TEMP TABLE helix_prefix_signature ON COMMIT DROP AS
-- Source facts only. Generated UUIDs and timestamps differ between clean replays.
-- Variants are compared by their product's slug so their foreign keys remain meaningful.
WITH relations AS (
  SELECT c.* FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
), definitions(value) AS (
  SELECT jsonb_build_array('table',relname,relrowsecurity,relforcerowsecurity) FROM relations
  UNION ALL SELECT jsonb_build_array('column',r.relname,a.attname,a.attnum,format_type(a.atttypid,a.atttypmod),
    a.attnotnull,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid))
    FROM relations r JOIN pg_attribute a ON a.attrelid=r.oid AND a.attnum>0 AND NOT a.attisdropped
    LEFT JOIN pg_attrdef d ON d.adrelid=r.oid AND d.adnum=a.attnum
  UNION ALL SELECT jsonb_build_array('constraint',r.relname,c.conname,pg_get_constraintdef(c.oid))
    FROM relations r JOIN pg_constraint c ON c.conrelid=r.oid
  UNION ALL SELECT jsonb_build_array('index',r.relname,pg_get_indexdef(i.indexrelid))
    FROM relations r JOIN pg_index i ON i.indrelid=r.oid
  UNION ALL SELECT jsonb_build_array('enum',t.typname,e.enumlabel,e.enumsortorder)
    FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid WHERE t.typnamespace='public'::regnamespace
  UNION ALL SELECT jsonb_build_array('routine',pg_get_functiondef(p.oid))
    FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
      AND NOT EXISTS (SELECT FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')
  UNION ALL SELECT jsonb_build_array('trigger',pg_get_triggerdef(t.oid),t.tgenabled)
    FROM pg_trigger t JOIN relations r ON t.tgrelid=r.oid WHERE NOT t.tgisinternal
  UNION ALL SELECT jsonb_build_array('policy',r.relname,p.polname,p.polpermissive,p.polcmd,
    ARRAY(SELECT CASE roleid WHEN 0 THEN 'PUBLIC' ELSE pg_get_userbyid(roleid) END
      FROM unnest(p.polroles) roleid ORDER BY 1),
    pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid))
    FROM pg_policy p JOIN relations r ON p.polrelid=r.oid
), seed(value) AS (
  SELECT jsonb_build_array('product',to_jsonb(p)-ARRAY['id','created_at','updated_at','published_at'])
    FROM public.products p
  UNION ALL SELECT jsonb_build_array('variant',p.slug,to_jsonb(v)-ARRAY['id','product_id','updated_at'])
    FROM public.product_variants v JOIN public.products p ON p.id=v.product_id
  UNION ALL SELECT jsonb_build_array('collection',to_jsonb(c)-ARRAY['id','created_at','updated_at'])
    FROM public.collections c
)
SELECT encode(sha256(convert_to((SELECT jsonb_agg(value ORDER BY value::text COLLATE "C") FROM definitions)::text,'UTF8')),'hex') AS schema_sha256,
       encode(sha256(convert_to((SELECT jsonb_agg(value ORDER BY value::text COLLATE "C") FROM seed)::text,'UTF8')),'hex') AS seed_sha256;


-- Capture original OIDs and complete row multisets before any move. The recovery
-- check compares these post-upgrade. Runtime roles cannot access temporary evidence.
CREATE TEMP TABLE helix_prefix_tables (
  relid oid PRIMARY KEY, name name NOT NULL UNIQUE, row_count bigint NOT NULL, rows_sha text NOT NULL
) ON COMMIT DROP;
CREATE TEMP TABLE helix_prefix_hooks ON COMMIT DROP AS
  SELECT oid,tgfoid,tgname FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND NOT tgisinternal
    AND tgname IN ('on_auth_user_created_profile','on_auth_user_created_loyalty');
CREATE TEMP TABLE helix_prefix_ledger ON COMMIT DROP AS
  SELECT version, encode(sha256(convert_to(to_jsonb(l)::text,'UTF8')),'hex') AS row_sha
  FROM supabase_migrations.schema_migrations l;
CREATE TEMP TABLE helix_prefix_functions ON COMMIT DROP AS
  SELECT oid FROM pg_proc p WHERE pronamespace='public'::regnamespace
    AND proname IN ('award_loyalty_points','ensure_loyalty_account','merge_guest_cart','redeem_loyalty_points','set_updated_at');

DO $preflight$
DECLARE
  r record;
  n bigint;
  h text;
  expected_access_sha text;
  jobs_exist boolean;
BEGIN
  IF (SELECT schema_sha256 FROM pg_temp.helix_prefix_signature) <> '3afddf0c38a76c021179870453b0001e575dcd99abd4e084bd82643500231686'
     OR (SELECT seed_sha256 FROM pg_temp.helix_prefix_signature) IS DISTINCT FROM '3b86c3f9478a06a1964a4e0703d2afeda2641394360d9e9d311c64c7c3cbf3da' THEN
    RAISE EXCEPTION 'Unrecognized prefix application schema or seed';
  END IF;
  IF (SELECT array_agg(version::text ORDER BY version) FROM pg_temp.helix_prefix_ledger) IS DISTINCT FROM ARRAY[
    '20260617094816','20260617094856','20260617111002','20260617111014','202606180001','202606180002',
    '202606180003','202606180004','202606250001','202606290001','202606290002','202607130001'] THEN
    RAISE EXCEPTION 'Unrecognized migration ledger';
  END IF;
  IF (SELECT count(*) FROM pg_temp.helix_prefix_functions) <> 5 OR
     (SELECT count(*) FROM pg_temp.helix_prefix_hooks h JOIN pg_proc p ON h.tgfoid=p.oid
       JOIN pg_trigger t ON t.oid=h.oid WHERE p.pronamespace='public'::regnamespace
       AND p.proname='handle_new_user_'||replace(h.tgname,'on_auth_user_created_','')
       AND t.tgenabled='O' AND t.tgtype=5 AND t.tgqual IS NULL AND t.tgnargs=0) <> 2 THEN
    RAISE EXCEPTION 'Unrecognized prefix hook or function';
  END IF;
  IF EXISTS (SELECT FROM auth.users) OR EXISTS (SELECT FROM storage.objects)
     OR (SELECT array_agg(id ORDER BY id) FROM storage.buckets) IS DISTINCT FROM ARRAY['mei-pelle-catalog'] THEN
    RAISE EXCEPTION 'Unexpected managed data';
  END IF;
  -- pg_publication_tables expands FOR TABLES IN SCHEMA membership. FOR ALL would
  -- continue publishing archived tables even after a namespace change.
  IF EXISTS (SELECT FROM pg_publication WHERE puballtables OR pubname<>'supabase_realtime')
     OR EXISTS (SELECT FROM pg_publication_rel) OR EXISTS (SELECT FROM pg_publication_namespace)
     OR EXISTS (SELECT FROM pg_event_trigger e WHERE e.evtenabled <> 'D' AND
        (pg_get_userbyid(e.evtowner)<>'supabase_admin' OR (e.evtname::text,e.evtfoid::regprocedure::text) NOT IN (
          ('issue_graphql_placeholder','extensions.set_graphql_placeholder()'),
          ('issue_pg_cron_access','extensions.grant_pg_cron_access()'),
          ('issue_pg_graphql_access','extensions.grant_pg_graphql_access()'),
          ('issue_pg_net_access','extensions.grant_pg_net_access()'),
          ('pgrst_ddl_watch','extensions.pgrst_ddl_watch()'),
          ('pgrst_drop_watch','extensions.pgrst_drop_watch()')))) THEN
    RAISE EXCEPTION 'Unexpected publication or DDL integration';
  END IF;
  IF to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT FROM cron.job)' INTO jobs_exist;
    IF jobs_exist THEN RAISE EXCEPTION 'Unexpected scheduled integration'; END IF;
  END IF;
  IF EXISTS (SELECT FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind NOT IN ('r','i')
    AND NOT EXISTS (SELECT FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e')) THEN
    RAISE EXCEPTION 'Unexpected public relation outside the original tables and indexes';
  END IF;
  IF EXISTS (SELECT FROM pg_constraint fk JOIN pg_class child ON child.oid=fk.conrelid
    JOIN pg_class parent ON parent.oid=fk.confrelid WHERE fk.contype='f' AND
    ((parent.relnamespace='public'::regnamespace AND child.relnamespace<>parent.relnamespace)
      OR (child.relnamespace='public'::regnamespace AND parent.relnamespace<>child.relnamespace AND parent.oid<>'auth.users'::regclass))) THEN
    RAISE EXCEPTION 'Cross-schema foreign key outside the prefix';
  END IF;
  IF EXISTS (SELECT FROM pg_depend d JOIN pg_class old ON d.refclassid='pg_class'::regclass AND d.refobjid=old.oid
      JOIN pg_rewrite v ON d.classid='pg_rewrite'::regclass AND v.oid=d.objid
      WHERE old.relnamespace='public'::regnamespace)
    OR EXISTS (SELECT FROM pg_depend d JOIN pg_class old ON d.refclassid='pg_class'::regclass AND d.refobjid=old.oid
      JOIN pg_policy p ON d.classid='pg_policy'::regclass AND p.oid=d.objid JOIN pg_class c ON c.oid=p.polrelid
      WHERE old.relnamespace='public'::regnamespace AND c.relnamespace<>old.relnamespace)
    OR EXISTS (SELECT FROM pg_depend d JOIN pg_class old ON d.refclassid='pg_class'::regclass AND d.refobjid=old.oid
      WHERE old.relnamespace='public'::regnamespace AND d.classid='pg_proc'::regclass)
    OR EXISTS (SELECT FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      WHERE t.tgfoid IN (SELECT oid FROM pg_temp.helix_prefix_functions) AND c.relnamespace<>'public'::regnamespace) THEN
    RAISE EXCEPTION 'External dependency on a prefix relation or routine';
  END IF;
  -- Freeze the source runner's PostgreSQL or managed-image default ACL profile.
  -- A new grant to a known role is drift too (for example SELECT to PUBLIC).
  WITH grants AS (
    SELECT jsonb_build_array(pg_get_userbyid(a.defaclrole),coalesce(n.nspname,''),a.defaclobjtype,
      CASE g.grantee WHEN 0 THEN 'PUBLIC' ELSE pg_get_userbyid(g.grantee) END,
      pg_get_userbyid(g.grantor),g.privilege_type,g.is_grantable) AS value
    FROM pg_default_acl a LEFT JOIN pg_namespace n ON n.oid=a.defaclnamespace
      CROSS JOIN LATERAL aclexplode(a.defaclacl) g
    WHERE a.defaclnamespace IN (0,'public'::regnamespace::oid)
  )
  SELECT encode(sha256(convert_to(coalesce(jsonb_agg(value ORDER BY value::text COLLATE "C")::text,'[]'),'UTF8')),'hex')
    INTO h FROM grants;
  IF h NOT IN ('bc35ed0d48277c9b202f5da325b574a4eb1f68a8b10116079a95d629bd35f27d',
               '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945') THEN
    RAISE EXCEPTION 'Unexpected default ACL';
  END IF;
  -- Project-wide defaults do not describe grants on existing objects or columns.
  -- Include grantors, grant options, implicit PUBLIC privileges, the database
  -- owner, and both directions of the membership graph for all affected roles.
  -- Match the same reviewed native or plain PostgreSQL profile as its defaults.
  expected_access_sha := CASE h
    WHEN 'bc35ed0d48277c9b202f5da325b574a4eb1f68a8b10116079a95d629bd35f27d'
      THEN '36c6654c78bb3e33968ab48b9da31a6490a4f159bf0cddf107d2ec32e36f66fc'
    ELSE '0ef43de07350631256d8eb82d99d93d3c827ffdee8473bc44bee98099c2240f5'
  END;
  WITH RECURSIVE objects(kind, identity, acl) AS (
    SELECT 'schema', nspname::text, coalesce(nspacl, acldefault('n',nspowner))
      FROM pg_namespace WHERE nspname='public'
    UNION ALL SELECT 'table', c.relname::text, coalesce(c.relacl, acldefault('r',c.relowner))
      FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind='r'
    UNION ALL SELECT 'column', format('%I.%I',c.relname,a.attname), a.attacl
      FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid
      WHERE c.relnamespace='public'::regnamespace AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped
    UNION ALL SELECT 'routine', p.oid::regprocedure::text, coalesce(p.proacl, acldefault('f',p.proowner))
      FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND NOT EXISTS
        (SELECT FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')
    UNION ALL SELECT 'enum', t.typname::text, coalesce(t.typacl, acldefault('T',t.typowner))
      FROM pg_type t WHERE t.typnamespace='public'::regnamespace AND t.typtype='e'
  ), access AS (
    SELECT o.kind,o.identity,g.* FROM objects o CROSS JOIN LATERAL aclexplode(o.acl) g
  ), roots AS (
    SELECT grantee AS oid FROM access WHERE grantee<>0
    UNION SELECT oid FROM pg_roles WHERE rolsuper OR rolname IN
      ('anon','authenticated','service_role','pg_database_owner','pg_read_all_data','pg_write_all_data')
    UNION SELECT datdba FROM pg_database WHERE datname=current_database()
  ), connected(oid) AS (
    SELECT oid FROM roots
    UNION SELECT CASE WHEN m.member=reachable.oid THEN m.roleid ELSE m.member END
      FROM connected reachable JOIN pg_auth_members m ON m.member=reachable.oid OR m.roleid=reachable.oid
  ), entries(value) AS (
    SELECT jsonb_build_array('grant',kind,identity,pg_get_userbyid(grantor),
      CASE grantee WHEN 0 THEN 'PUBLIC' ELSE pg_get_userbyid(grantee) END,privilege_type,is_grantable)
      FROM access
    UNION ALL SELECT jsonb_build_array('role',role.rolname,role.rolsuper,role.rolinherit,role.rolcreaterole,
      role.rolcreatedb,role.rolcanlogin,role.rolreplication,role.rolbypassrls)
      FROM pg_roles role JOIN connected c USING (oid)
    UNION ALL SELECT jsonb_build_array('membership',pg_get_userbyid(m.member),pg_get_userbyid(m.roleid),
      pg_get_userbyid(m.grantor),m.admin_option,m.inherit_option,m.set_option)
      FROM pg_auth_members m JOIN connected c ON m.member=c.oid
    UNION ALL SELECT jsonb_build_array('database owner',pg_get_userbyid(datdba))
      FROM pg_database WHERE datname=current_database()
  )
  SELECT encode(sha256(convert_to(jsonb_agg(value ORDER BY value::text COLLATE "C")::text,'UTF8')),'hex')
    INTO h FROM entries;
  IF h IS DISTINCT FROM expected_access_sha THEN
    RAISE EXCEPTION 'Unexpected prefix access profile';
  END IF;
  IF EXISTS (SELECT FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind='r'
      AND c.relowner<>'postgres'::regrole)
     OR EXISTS (SELECT FROM pg_type t WHERE t.typnamespace='public'::regnamespace AND t.typtype='e'
      AND t.typowner<>'postgres'::regrole)
     OR EXISTS (SELECT FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proowner<>'postgres'::regrole
      AND NOT EXISTS (SELECT FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')) THEN
    RAISE EXCEPTION 'Unexpected prefix object owner';
  END IF;
  FOR r IN SELECT oid,relname FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' LOOP
    EXECUTE format('SELECT count(*), encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text COLLATE "C")::text,''[]''),''UTF8'')),''hex'') FROM public.%I t',r.relname)
      INTO n,h;
    IF n <> (CASE r.relname WHEN 'products' THEN 6 WHEN 'product_variants' THEN 10 WHEN 'collections' THEN 2 ELSE 0 END) THEN
      RAISE EXCEPTION 'Unexpected records in prefix table %',r.relname;
    END IF;
    INSERT INTO pg_temp.helix_prefix_tables VALUES (r.oid,r.relname,n,h);
  END LOOP;
  IF (SELECT count(*) FROM pg_temp.helix_prefix_tables) <> 22 THEN RAISE EXCEPTION 'Unrecognized prefix tables'; END IF;
END
$preflight$;

-- These catalog identities survive ALTER ... SET SCHEMA. Compare the original
-- graph by OID, including FK targets, policy expressions, key order and owners.
CREATE FUNCTION pg_temp.helix_prefix_structure() RETURNS text
LANGUAGE sql STABLE SET search_path=pg_catalog AS $body$
  WITH surfaces(value) AS (
    SELECT jsonb_build_array('table',c.oid,c.relowner,c.relrowsecurity,c.relforcerowsecurity)
      FROM pg_class c JOIN pg_temp.helix_prefix_tables t ON t.relid=c.oid
    UNION ALL SELECT jsonb_build_array('constraint',to_jsonb(k)-ARRAY['connamespace','conname'])
      FROM pg_constraint k JOIN pg_temp.helix_prefix_tables t ON t.relid=k.conrelid
    UNION ALL SELECT jsonb_build_array('index',to_jsonb(i)) FROM pg_index i
      JOIN pg_temp.helix_prefix_tables t ON t.relid=i.indrelid
    UNION ALL SELECT jsonb_build_array('policy',to_jsonb(p)) FROM pg_policy p
      JOIN pg_temp.helix_prefix_tables t ON t.relid=p.polrelid
    UNION ALL SELECT jsonb_build_array('trigger',tr.oid,tr.tgrelid,tr.tgfoid,tr.tgtype,tr.tgenabled)
      FROM pg_trigger tr JOIN pg_temp.helix_prefix_tables t ON t.relid=tr.tgrelid
    UNION ALL SELECT jsonb_build_array('enum',t.oid,t.typowner,t.typname,e.oid,e.enumlabel,e.enumsortorder)
      FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid
      WHERE t.typnamespace=coalesce(to_regnamespace('helix_development_prefix'), 'public'::regnamespace)
  )
  SELECT encode(sha256(convert_to(jsonb_agg(value ORDER BY value::text COLLATE "C")::text,'UTF8')),'hex')
  FROM surfaces
$body$;
CREATE TEMP TABLE helix_prefix_original_structure ON COMMIT DROP AS
  SELECT pg_temp.helix_prefix_structure() AS fingerprint;

-- Run inside the locked prefix transaction, before any object is renamed or moved.
DO $consumers$
BEGIN
  -- The pinned managed Auth schema has exactly two noninternal triggers.
  -- An additional disabled hook can be re-enabled later; it is still a consumer.
  -- The preceding prefix signature verifies both handler definitions and names.
  IF EXISTS (
    SELECT FROM pg_trigger tr JOIN pg_class c ON c.oid=tr.tgrelid
    WHERE c.relnamespace='auth'::regnamespace AND NOT tr.tgisinternal
      AND NOT EXISTS (
        SELECT FROM pg_temp.helix_prefix_hooks h
        WHERE h.oid=tr.oid AND h.tgfoid=tr.tgfoid AND h.tgname=tr.tgname
          AND tr.tgrelid='auth.users'::regclass AND tr.tgenabled='O' AND tr.tgtype=5
          AND tr.tgconstraint=0 AND tr.tgconstrrelid=0 AND tr.tgparentid=0
          AND NOT tr.tgdeferrable AND NOT tr.tginitdeferred
          AND tr.tgqual IS NULL AND tr.tgnargs=0 AND octet_length(tr.tgargs)=0
          AND tr.tgattr=''::int2vector AND tr.tgoldtable IS NULL AND tr.tgnewtable IS NULL
      )
  ) THEN
    RAISE EXCEPTION 'Unexpected prefix consumer';
  END IF;

  -- Check incoming references by object identity, including column dependencies.
  -- PostgreSQL records SQL-standard routine bodies here. String-body SQL,
  -- PL/pgSQL and dynamic SQL can resolve names at runtime without a catalog edge;
  -- this check cannot establish the absence of callers in such external code.
  IF EXISTS (
    WITH heaps(oid) AS (
      SELECT relid FROM pg_temp.helix_prefix_tables
      UNION ALL
      SELECT c.reltoastrelid FROM pg_class c JOIN pg_temp.helix_prefix_tables t ON t.relid=c.oid
      WHERE c.reltoastrelid<>0
    ), relations(oid) AS (
      SELECT oid FROM heaps
      UNION ALL SELECT i.indexrelid FROM pg_index i JOIN heaps h ON h.oid=i.indrelid
    ), types AS (
      SELECT t.oid,t.typarray FROM pg_type t
      WHERE (t.typnamespace='public'::regnamespace AND t.typtype='e')
        OR t.typrelid IN (SELECT oid FROM relations)
    ), owned_constraints(oid) AS (
      SELECT c.oid FROM pg_constraint c JOIN pg_temp.helix_prefix_tables t ON t.relid=c.conrelid
    ), archive(classid,objid) AS (
      SELECT 'pg_class'::regclass,oid FROM relations
      UNION ALL SELECT 'pg_type'::regclass,oid FROM types
      UNION ALL SELECT 'pg_type'::regclass,typarray FROM types WHERE typarray<>0
      UNION ALL SELECT 'pg_proc'::regclass,oid FROM pg_temp.helix_prefix_functions
      UNION ALL SELECT 'pg_constraint'::regclass,oid FROM owned_constraints
      UNION ALL SELECT 'pg_attrdef'::regclass,a.oid
        FROM pg_attrdef a JOIN pg_temp.helix_prefix_tables t ON t.relid=a.adrelid
      UNION ALL SELECT 'pg_policy'::regclass,p.oid
        FROM pg_policy p JOIN pg_temp.helix_prefix_tables t ON t.relid=p.polrelid
      UNION ALL SELECT 'pg_trigger'::regclass,tr.oid FROM pg_trigger tr
        WHERE tr.tgrelid IN (SELECT relid FROM pg_temp.helix_prefix_tables)
          -- Includes PostgreSQL's internal Auth-side triggers for outgoing prefix FKs.
          OR (tr.tgisinternal AND tr.tgconstraint IN (SELECT oid FROM owned_constraints))
    )
    SELECT FROM pg_depend d JOIN archive a ON a.classid=d.refclassid AND a.objid=d.refobjid
    WHERE NOT EXISTS (SELECT FROM archive consumer WHERE consumer.classid=d.classid AND consumer.objid=d.objid)
  ) THEN
    RAISE EXCEPTION 'Unexpected prefix consumer';
  END IF;
END
$consumers$;

CREATE SCHEMA helix_development_prefix;
REVOKE ALL ON SCHEMA helix_development_prefix FROM PUBLIC, anon, authenticated, service_role;

-- Keep both managed trigger names and OIDs. The application owner may rename
-- its own handler. Renaming the Auth trigger would require owning auth.users.
ALTER FUNCTION public.handle_new_user_loyalty() RENAME TO handle_new_user_rewards;

DO $move$
DECLARE
  item record;
  qualified text;
  disabled_body constant text := 'BEGIN RAISE EXCEPTION ''Historical rehearsal routine disabled'' USING ERRCODE=''42501''; END';
BEGIN
  -- Retained functions call public tables by name. Remove that behavior before
  -- moving them so even a previously resolved OID cannot target current tables.
  FOR item IN SELECT p.oid,p.proname,pg_get_function_arguments(p.oid) AS args,
    pg_get_function_result(p.oid) AS result_type,pg_get_function_identity_arguments(p.oid) AS identity_args
    FROM pg_proc p JOIN pg_temp.helix_prefix_functions old ON p.oid=old.oid ORDER BY p.oid
  LOOP
    EXECUTE format('CREATE OR REPLACE FUNCTION public.%I(%s) RETURNS %s LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS %L',
      item.proname,item.args,item.result_type,disabled_body);
    EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA helix_development_prefix',item.proname,item.identity_args);
  END LOOP;
  FOR item IN SELECT name FROM pg_temp.helix_prefix_tables ORDER BY name LOOP
    EXECUTE format('ALTER TABLE public.%I SET SCHEMA helix_development_prefix',item.name);
  END LOOP;
  FOR item IN SELECT typname FROM pg_type WHERE typnamespace='public'::regnamespace AND typtype='e' ORDER BY typname LOOP
    EXECUTE format('ALTER TYPE public.%I SET SCHEMA helix_development_prefix',item.typname);
  END LOOP;
  -- REVOKE on a table does not clear earlier column-level grants or grants to a
  -- nonstandard role. Remove every recorded non-owner ACL, including column ACLs.
  FOR item IN
    SELECT 'SCHEMA' AS kind,quote_ident(n.nspname) AS object_name,g.grantee,NULL::text AS columns
      FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) g
      WHERE n.nspname='helix_development_prefix' AND g.grantee<>n.nspowner
    UNION ALL SELECT 'TABLE',c.oid::regclass::text,g.grantee,NULL FROM pg_class c
      CROSS JOIN LATERAL aclexplode(c.relacl) g WHERE c.relnamespace='helix_development_prefix'::regnamespace AND c.relkind='r' AND g.grantee<>c.relowner
    UNION ALL SELECT 'TABLE',c.oid::regclass::text,g.grantee,quote_ident(a.attname) FROM pg_class c
      JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 CROSS JOIN LATERAL aclexplode(a.attacl) g
      WHERE c.relnamespace='helix_development_prefix'::regnamespace AND g.grantee<>c.relowner
    UNION ALL SELECT 'FUNCTION',p.oid::regprocedure::text,g.grantee,NULL FROM pg_proc p
      CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) g
      WHERE p.pronamespace='helix_development_prefix'::regnamespace AND g.grantee<>p.proowner
    UNION ALL SELECT 'TYPE',t.oid::regtype::text,g.grantee,NULL FROM pg_type t
      CROSS JOIN LATERAL aclexplode(coalesce(t.typacl,acldefault('T',t.typowner))) g
      WHERE t.typnamespace='helix_development_prefix'::regnamespace AND t.typtype='e' AND g.grantee<>t.typowner
  LOOP
    qualified := CASE WHEN item.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(item.grantee)) END;
    EXECUTE format('REVOKE ALL PRIVILEGES %s ON %s %s FROM %s',
      CASE WHEN item.columns IS NULL THEN '' ELSE '('||item.columns||')' END,item.kind,item.object_name,qualified);
  END LOOP;
END
$move$;
