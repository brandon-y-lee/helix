-- Run inside the same transaction after preserve-prefix, source DDL, Auth binding
-- and the current development seed. Addresses in public now identify new objects.
DO $verify$
DECLARE item record;
  observed_count bigint;
  observed_hash text;
BEGIN
  IF pg_temp.helix_prefix_structure() IS DISTINCT FROM (SELECT fingerprint FROM pg_temp.helix_prefix_original_structure) THEN
    RAISE EXCEPTION 'Historical keys, policies, enums or dependencies changed during preservation';
  END IF;
  FOR item IN SELECT * FROM pg_temp.helix_prefix_tables LOOP
    IF to_regclass(format('helix_development_prefix.%I',item.name)) IS DISTINCT FROM item.relid THEN
      RAISE EXCEPTION 'Original table identity changed for %',item.name;
    END IF;
    EXECUTE format('SELECT count(*), encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text COLLATE "C")::text,''[]''),''UTF8'')),''hex'') FROM helix_development_prefix.%I t',item.name)
      INTO observed_count,observed_hash;
    IF (observed_count,observed_hash) IS DISTINCT FROM (item.row_count,item.rows_sha) THEN
      RAISE EXCEPTION 'Original row or key changed for %',item.name;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_temp.helix_prefix_ledger old
      JOIN supabase_migrations.schema_migrations l USING (version)
      WHERE old.row_sha=encode(sha256(convert_to(to_jsonb(l)::text,'UTF8')),'hex'))<>12
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations)<>12 THEN
    RAISE EXCEPTION 'Migration ledger changed during rehearsal';
  END IF;
  IF (SELECT count(*) FROM pg_temp.helix_prefix_hooks h JOIN pg_trigger t USING (oid)
      WHERE t.tgfoid=h.tgfoid AND t.tgname=h.tgname
        AND t.tgenabled='O' AND t.tgtype=5)<>2 THEN
    RAISE EXCEPTION 'Original managed hook binding changed';
  END IF;
  IF (SELECT count(*) FROM pg_type WHERE typnamespace='helix_development_prefix'::regnamespace AND typtype='e')<>11
     OR (SELECT count(*) FROM pg_proc WHERE pronamespace='helix_development_prefix'::regnamespace)<>5
     OR EXISTS (SELECT FROM pg_temp.helix_prefix_functions f LEFT JOIN pg_proc p USING (oid)
       WHERE p.oid IS NULL OR p.pronamespace<>'helix_development_prefix'::regnamespace
         OR p.prosecdef OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']
         OR p.prosrc <> 'BEGIN RAISE EXCEPTION ''Historical rehearsal routine disabled'' USING ERRCODE=''42501''; END') THEN
    RAISE EXCEPTION 'Archive functions or types differ from the original prefix';
  END IF;
  -- A schema USAGE check alone misses a prepared lookup that already resolved the
  -- old object. Verify underlying table, column and function permissions as well.
  FOR item IN SELECT oid,rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
    IF has_schema_privilege(item.oid,'helix_development_prefix','USAGE')
       OR has_schema_privilege(item.oid,'helix_development_prefix','CREATE')
       OR EXISTS (SELECT FROM pg_temp.helix_prefix_tables t WHERE
            has_table_privilege(item.oid,t.relid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
            OR has_any_column_privilege(item.oid,t.relid,'SELECT,INSERT,UPDATE,REFERENCES'))
       OR EXISTS (SELECT FROM pg_temp.helix_prefix_functions f WHERE has_function_privilege(item.oid,f.oid,'EXECUTE'))
       OR EXISTS (SELECT FROM pg_type t WHERE t.typnamespace='helix_development_prefix'::regnamespace
            AND t.typtype='e' AND has_type_privilege(item.oid,t.oid,'USAGE')) THEN
      RAISE EXCEPTION 'Role % can access archived data or code',item.rolname;
    END IF;
  END LOOP;
  IF EXISTS (SELECT FROM pg_publication WHERE puballtables) OR EXISTS (SELECT FROM pg_publication_tables
       WHERE schemaname='helix_development_prefix')
     OR EXISTS (SELECT FROM pg_constraint fk JOIN pg_class c ON c.oid=fk.conrelid
       JOIN pg_class parent ON parent.oid=fk.confrelid WHERE fk.contype='f'
         AND parent.relnamespace='helix_development_prefix'::regnamespace AND c.relnamespace<>parent.relnamespace)
     OR EXISTS (SELECT FROM pg_depend d JOIN pg_class archived ON d.refclassid='pg_class'::regclass AND d.refobjid=archived.oid
       JOIN pg_rewrite r ON d.classid='pg_rewrite'::regclass AND r.oid=d.objid
       WHERE archived.relnamespace='helix_development_prefix'::regnamespace)
     OR EXISTS (SELECT FROM pg_trigger t JOIN pg_class c ON t.tgrelid=c.oid
       WHERE t.tgfoid IN (SELECT oid FROM pg_temp.helix_prefix_functions)
         AND c.relnamespace<>'helix_development_prefix'::regnamespace) THEN
    RAISE EXCEPTION 'Current application can reach an archived relation or writer';
  END IF;
END
$verify$;
