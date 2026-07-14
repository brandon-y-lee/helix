select jsonb_pretty(
  jsonb_build_object(
    'generated_at', now(),
    'schemas', (
      select coalesce(jsonb_agg(jsonb_build_object('schema_name', nspname) order by nspname), '[]'::jsonb)
      from pg_namespace
      where nspname in ('public', 'app_ops')
    ),
    'tables', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'schema_name', n.nspname,
            'table_name', c.relname,
            'relkind', c.relkind,
            'rls_enabled', c.relrowsecurity,
            'rls_forced', c.relforcerowsecurity,
            'estimated_live_rows', coalesce(s.n_live_tup, 0),
            'total_bytes', pg_total_relation_size(c.oid),
            'table_bytes', pg_relation_size(c.oid)
          )
          order by n.nspname, c.relname
        ),
        '[]'::jsonb
      )
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      left join pg_stat_user_tables s on s.relid = c.oid
      where c.relkind in ('r', 'p')
        and n.nspname in ('public', 'app_ops')
    ),
    'columns', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'schema_name', table_schema,
            'table_name', table_name,
            'column_name', column_name,
            'ordinal_position', ordinal_position,
            'data_type', data_type,
            'is_nullable', is_nullable,
            'column_default', column_default
          )
          order by table_schema, table_name, ordinal_position
        ),
        '[]'::jsonb
      )
      from information_schema.columns
      where table_schema in ('public', 'app_ops')
    ),
    'constraints', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'schema_name', n.nspname,
            'table_name', c.relname,
            'constraint_name', con.conname,
            'constraint_type', con.contype,
            'definition', pg_get_constraintdef(con.oid)
          )
          order by n.nspname, c.relname, con.conname
        ),
        '[]'::jsonb
      )
      from pg_constraint con
      join pg_class c on c.oid = con.conrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('public', 'app_ops')
    ),
    'indexes', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'schema_name', schemaname,
            'table_name', tablename,
            'index_name', indexname,
            'index_definition', indexdef
          )
          order by schemaname, tablename, indexname
        ),
        '[]'::jsonb
      )
      from pg_indexes
      where schemaname in ('public', 'app_ops')
    ),
    'triggers', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'schema_name', n.nspname,
            'table_name', c.relname,
            'trigger_name', t.tgname,
            'definition', pg_get_triggerdef(t.oid)
          )
          order by n.nspname, c.relname, t.tgname
        ),
        '[]'::jsonb
      )
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where not t.tgisinternal
        and n.nspname in ('public', 'app_ops')
    ),
    'policies', (
      select coalesce(
        jsonb_agg(to_jsonb(p) order by schemaname, tablename, policyname),
        '[]'::jsonb
      )
      from pg_policies p
      where schemaname in ('public', 'app_ops')
    ),
    'grants', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'table_schema', table_schema,
            'table_name', table_name,
            'grantee', grantee,
            'privilege_type', privilege_type,
            'is_grantable', is_grantable
          )
          order by table_schema, table_name, grantee, privilege_type
        ),
        '[]'::jsonb
      )
      from information_schema.role_table_grants
      where table_schema in ('public', 'app_ops')
        and grantee in ('anon', 'authenticated', 'service_role')
    )
  )
) as public_schema_metadata;
