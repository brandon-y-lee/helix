-- Independent logical backup check. pg_dump can omit managed initial schema ACLs
-- even when it includes the functions and their EXECUTE grants.
BEGIN READ ONLY;
SET LOCAL search_path = pg_catalog;
WITH exposure AS (
  SELECT login.rolname AS login, available.rolname AS acting_role, n.oid, n.nspname,
    has_schema_privilege(available.oid,n.oid,'USAGE') AS usable,
    has_schema_privilege(available.oid,n.oid,'CREATE') AS can_create,
    available.oid AS role_id
  FROM pg_roles login JOIN pg_roles available ON pg_has_role(login.oid,available.oid,'SET')
  CROSS JOIN pg_namespace n
  WHERE login.rolname IN ('anon','authenticated','service_role','authenticator')
    AND n.nspname NOT IN ('public','pg_catalog','pg_toast','information_schema')
    AND n.nspname !~ '^pg_(toast_)?temp_[0-9]+$'
), state(value) AS (
  SELECT jsonb_build_array('schema',login,acting_role,nspname,usable,can_create)
    FROM exposure
  UNION ALL
  SELECT jsonb_build_array('call',e.login,e.acting_role,e.nspname,p.oid::regprocedure::text,
    pg_get_userbyid(p.proowner),p.prosecdef,encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'))
  FROM exposure e JOIN pg_proc p ON p.pronamespace=e.oid
  WHERE e.usable AND p.prokind IN ('f','w','p') AND has_function_privilege(e.role_id,p.oid,'EXECUTE')
)
SELECT encode(sha256(convert_to(jsonb_agg(value ORDER BY value::text COLLATE "C")::text,'UTF8')),'hex')
FROM state;
ROLLBACK;
