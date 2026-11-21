-- Stable PG17 catalog identity of this package. No subscriber, token, event or delivery rows are read.
-- Run with search_path=pg_catalog,pg_temp; object and grant identities are names, never cluster-local OIDs.
WITH relations AS (
  SELECT c.* FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='private' AND starts_with(c.relname,'production_marketing_')
), routines AS (
  SELECT p.*, n.nspname||'.'||p.proname||'('||oidvectortypes(p.proargtypes)||')' AS identity
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='helix_welcome_worker' OR
    (n.nspname IN ('private','public') AND
    (strpos(p.proname,'production_marketing')>0 OR strpos(p.proname,'native_welcome')>0))
), worker_schema AS (
  SELECT * FROM pg_namespace WHERE nspname='helix_welcome_worker'
), acl_objects(kind,identity,owner_id,acl) AS (
  SELECT 'relation',relname,relowner,coalesce(relacl,acldefault('r',relowner)) FROM relations
  UNION ALL SELECT 'column',r.relname||'.'||a.attname,r.relowner,a.attacl FROM relations r
    JOIN pg_attribute a ON a.attrelid=r.oid AND a.attnum>0 AND NOT a.attisdropped
  UNION ALL SELECT 'function',identity,proowner,coalesce(proacl,acldefault('f',proowner)) FROM routines
  UNION ALL SELECT 'schema',nspname,nspowner,coalesce(nspacl,acldefault('n',nspowner)) FROM worker_schema
), facts(kind,identity,definition) AS (
  SELECT 'relation',relname::text,jsonb_build_array(relkind,pg_get_userbyid(relowner),relrowsecurity,
    relforcerowsecurity,relpersistence,relreplident,relispartition,reloptions,pg_get_expr(relpartbound,oid))
    FROM relations
  UNION ALL SELECT 'column',r.relname||'.'||a.attname,
    jsonb_build_array(a.attnum,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,
      a.attcollation::regcollation::text,pg_get_expr(d.adbin,d.adrelid))
    FROM relations r JOIN pg_attribute a ON a.attrelid=r.oid AND a.attnum>0 AND NOT a.attisdropped
    LEFT JOIN pg_attrdef d ON d.adrelid=r.oid AND d.adnum=a.attnum WHERE r.relkind IN ('r','p')
  UNION ALL SELECT 'constraint',r.relname||'.'||c.conname,
    jsonb_build_array(pg_get_constraintdef(c.oid),c.convalidated,c.condeferrable,c.condeferred)
    FROM pg_constraint c JOIN relations r ON r.oid=c.conrelid
  UNION ALL SELECT 'index',i.indexrelid::regclass::text,jsonb_build_array(pg_get_indexdef(i.indexrelid),
    i.indisready,i.indisvalid,i.indislive,i.indisclustered,i.indisreplident)
    FROM pg_index i JOIN relations r ON r.oid=i.indrelid
  UNION ALL SELECT 'trigger',r.relname||'.'||t.tgname,jsonb_build_array(pg_get_triggerdef(t.oid),t.tgenabled)
    FROM pg_trigger t JOIN relations r ON r.oid=t.tgrelid WHERE NOT t.tgisinternal
  UNION ALL SELECT 'constraint trigger',r.relname||'.'||c.conname,jsonb_build_array(t.tgfoid::regprocedure::text,t.tgtype,t.tgenabled)
    FROM pg_trigger t JOIN relations r ON r.oid=t.tgrelid JOIN pg_constraint c ON c.oid=t.tgconstraint WHERE t.tgisinternal
  UNION ALL SELECT 'policy',r.relname||'.'||p.polname,jsonb_build_array(p.polcmd,p.polpermissive,
    (SELECT array_agg(CASE WHEN x=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x)::text END ORDER BY 1) FROM unnest(p.polroles)x),
    pg_get_expr(p.polqual,r.oid),pg_get_expr(p.polwithcheck,r.oid))
    FROM pg_policy p JOIN relations r ON r.oid=p.polrelid
  UNION ALL SELECT 'rule',r.relname||'.'||w.rulename,jsonb_build_array(pg_get_ruledef(w.oid),w.ev_enabled)
    FROM pg_rewrite w JOIN relations r ON r.oid=w.ev_class
  UNION ALL SELECT 'inherits',r.relname,jsonb_build_array(h.inhparent::regclass::text,h.inhseqno)
    FROM pg_inherits h JOIN relations r ON r.oid=h.inhrelid OR r.oid=h.inhparent
  UNION ALL SELECT 'routine',identity,jsonb_build_array(pg_get_functiondef(oid),pg_get_userbyid(proowner),
    prokind,prosecdef,provolatile,proparallel,proleakproof,proisstrict) FROM routines
  UNION ALL SELECT 'schema',nspname,jsonb_build_array(pg_get_userbyid(nspowner)) FROM worker_schema
  UNION ALL SELECT 'role',rolname,jsonb_build_array(rolsuper,rolinherit,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls)
    FROM pg_roles WHERE rolname='helix_native_welcome_worker'
  UNION ALL SELECT 'membership',r.rolname,jsonb_build_array(pg_get_userbyid(m.roleid),pg_get_userbyid(m.member),
    m.admin_option,m.inherit_option,m.set_option) FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member OR r.oid=m.roleid
    WHERE r.rolname='helix_native_welcome_worker' AND NOT (m.roleid=r.oid AND m.member='postgres'::regrole)
  UNION ALL SELECT 'grant/'||a.kind,a.identity,jsonb_build_array(pg_get_userbyid(g.grantor),
    CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(g.grantee)::text END,g.privilege_type,g.is_grantable)
    FROM acl_objects a CROSS JOIN LATERAL aclexplode(a.acl) g WHERE g.grantee<>a.owner_id
)
SELECT encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_array(kind,identity,definition)
  ORDER BY kind COLLATE "C",identity COLLATE "C",definition::text COLLATE "C"),'[]'::jsonb)::text,'UTF8')),'hex') FROM facts
