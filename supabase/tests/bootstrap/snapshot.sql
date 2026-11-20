-- Only the local rehearsal runs this comparison. Business-row values never leave PostgreSQL.
-- Include managed migration ledgers and relation-local sequence positions in the logical backup check.
BEGIN READ ONLY;
SET LOCAL search_path = pg_catalog;
SET LOCAL timezone = 'UTC';
SET LOCAL datestyle = 'ISO, YMD';
SELECT format(
  'SELECT %L || encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text COLLATE "C")::text, ''[]''), ''UTF8'')),''hex'') FROM %I.%I x',
  n.nspname||'.'||c.relname||'|',n.nspname,c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relkind='r' AND n.nspname IN ('auth','storage','public','private','app_ops','supabase_migrations')
ORDER BY n.nspname,c.relname
\gexec
SELECT format('SELECT %L || last_value || ''|'' || is_called FROM %I.%I',
   n.nspname||'.'||c.relname||'|',n.nspname,c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relkind='S' AND n.nspname IN ('auth','storage','public','private','app_ops','supabase_migrations')
ORDER BY n.nspname,c.relname
\gexec
ROLLBACK;
