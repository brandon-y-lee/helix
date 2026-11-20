-- Run only as the independent object owner through psql. These three
-- arguments identify an existing restricted login and externally verified
-- provider project; credentials are not arguments to this script.
\set ON_ERROR_STOP on
begin;
set local search_path = pg_catalog, pg_temp;
select set_config('helix.enroll_writer', :'writer_role', true),
       set_config('helix.enroll_environment', :'expected_environment', true),
       set_config('helix.enroll_project_ref', :'expected_project_ref', true);

do $owner$
declare
  writer oid;
  owner_id oid := current_user::regrole;
begin
  if exists (select from pg_class where oid in ('private.helix_environment'::regclass,'public.product_media'::regclass,
       'public.product_content_drafts'::regclass) and relowner <> owner_id)
    or exists (select from pg_proc where oid in ('private.read_helix_environment()'::regprocedure,
        'public.read_helix_environment()'::regprocedure,'private.is_current_product_media_url(text,uuid)'::regprocedure,
        'private.enforce_catalog_draft_media()'::regprocedure,'public.cutover_catalog_product_media(jsonb)'::regprocedure)
        and proowner <> owner_id) then
    raise exception 'Install this capability with the reviewed original object owner';
  end if;
  if exists (
    select from (values
      ('private.read_helix_environment()'::regprocedure, true, 'd0da1cc1d6378efa182afcfc20f1dad42f55786b8be334f1e69ab1850fdc966e'),
      ('public.read_helix_environment()'::regprocedure, false, '1a5d68297f34755d92cb4ea80e1432a76443861ff66a90e16b7eb651666996e7')
    ) expected(routine,definer,body_sha) join pg_proc p on p.oid=expected.routine
    where p.prosecdef <> expected.definer or p.proconfig is distinct from array['search_path=""']
      or p.prolang <> (select oid from pg_language where lanname='sql')
      or encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') <> expected.body_sha
  ) then raise exception 'Unexpected environment reader definition'; end if;
  if current_user <> session_user or not exists (select from private.helix_environment e
      where e.environment = current_setting('helix.enroll_environment') and e.project_ref = current_setting('helix.enroll_project_ref')) then
    raise exception 'Independent owner and matching environment marker required';
  end if;
  select oid into strict writer from pg_roles
    where rolname=current_setting('helix.enroll_writer') and rolname ~ '^[a-z][a-z0-9_]{0,48}$'
      and rolcanlogin and oid <> owner_id and not rolsuper and not rolcreatedb and not rolcreaterole
      and not rolbypassrls and not rolreplication and rolname not in ('anon','authenticated','authenticator','service_role')
      and rolname not like 'pg\_%' and rolname not like 'supabase\_%';
  if exists (select from pg_auth_members where member=writer)
    or exists (select from pg_roles r where r.rolname in ('anon','authenticated','authenticator','service_role')
      and pg_has_role(r.oid, writer, 'MEMBER'))
    or has_database_privilege(writer,current_database(),'CREATE')
    or exists (select from pg_namespace n where nspname in ('private','public','supabase_migrations')
      and has_schema_privilege(writer,n.oid,'CREATE'))
    or exists (select from pg_class c where relnamespace in ('private'::regnamespace,'public'::regnamespace)
      and relkind in ('r','p') and (has_table_privilege(writer,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
        or has_any_column_privilege(writer,c.oid,'INSERT,UPDATE')))
    -- Granting schema USAGE must never expose pre-existing private-table grants.
    or exists (select from pg_class c where relnamespace = 'private'::regnamespace
      and relkind in ('r','p','v','m','f') and has_any_column_privilege(writer,c.oid,'SELECT'))
    -- USAGE also enables routines whose EXECUTE was already granted directly
    -- or through PUBLIC (including PostgreSQL's default function ACL). Check
    -- existing private/history schemas even when USAGE predates enrollment.
    -- In public, preserve the API access already available to every login.
    or exists (
      select from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('private','supabase_migrations','public') and p.prosecdef
        and p.oid not in ('private.read_helix_environment()'::regprocedure, 'public.read_helix_environment()'::regprocedure)
        and has_function_privilege(writer,p.oid,'EXECUTE')
        and (n.nspname <> 'public' or not has_schema_privilege(writer,n.oid,'USAGE')
          or not exists (select from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
            where a.grantee = 0 and a.privilege_type = 'EXECUTE'))
    )
    or has_table_privilege(writer,'supabase_migrations.schema_migrations','UPDATE,DELETE,TRUNCATE,TRIGGER')
    or has_any_column_privilege(writer,'supabase_migrations.schema_migrations','UPDATE') then
    raise exception 'Refusing a release writer with existing privileged access';
  end if;

end;
$owner$;

-- No arguments, caller-provided commands, object names or session settings
-- enter the privileged operation. The release migration pins this exact body.
create function private.apply_helix_catalog_media_binding()
returns void language plpgsql security definer set search_path = pg_catalog, pg_temp as $capability$
declare
  target_ref text;
  prefix text;
  routine record;
  draft_body text;
  cutover_body text;
  release_writer name;
  actual_body text;
  prior_regex text;
  constraint_definition text;
begin
  -- Serialize against application DDL/writes touching the constraint or its
  -- triggers. A busy writer leaves the entire migration pending for retry.
  lock table public.product_media in access exclusive mode nowait;
  lock table public.product_content_drafts in share row exclusive mode nowait;
  lock table private.helix_environment in share mode nowait;
  select roles.rolname into strict release_writer
    from pg_proc p cross join lateral aclexplode(p.proacl) a
    join pg_roles roles on roles.oid = a.grantee
    where p.oid = 'private.apply_helix_catalog_media_binding()'::regprocedure
      and a.grantee <> p.proowner and a.privilege_type = 'EXECUTE' and not a.is_grantable;
  select project_ref into target_ref from private.read_helix_environment();
  if target_ref is null then
    raise exception 'A verified Helix environment marker is required before binding Catalog media';
  end if;
  prefix := 'https://' || target_ref || '.supabase.co/storage/v1/object/public/helix-catalog/';

  -- T1 renders the exact historical routines with the child hostname. A parent
  -- or child running any other body needs explicit reconciliation before apply.
  for routine in select * from (values
    ('private.is_current_product_media_url(text,uuid)'::regprocedure,
      '31f600f6bdb93d8597cb4e7b46a17ea32e0ecea2084807c613fa2378a698d984'),
    ('private.enforce_catalog_draft_media()'::regprocedure,
      '94bb6a756ad154f2e6f462acba7b47e06af3e395fc78cf8f71c25e457a7c5c94'),
    ('public.cutover_catalog_product_media(jsonb)'::regprocedure,
      '88264a174508b665ae012aac8a1bcb64b0f89c44af570a06e0082320d1a47e64')
  ) as approved(oid, parent_body_sha256)
  loop
    -- OIDs pin the signature. Preserve the trusted owner, language, exact
    -- search path, grants and volatility when replacing the verified body.
    select p.prosrc into strict actual_body from pg_proc p
      where p.oid = routine.oid and p.proowner = current_user::regrole
        and p.prokind = 'f' and not p.proleakproof and not p.proisstrict
        and not p.proretset and p.proparallel = 'u' and p.prosupport = 0
        and p.proconfig = array['search_path=""']
        and p.prosecdef = (p.oid <> 'private.is_current_product_media_url(text,uuid)'::regprocedure)
        and p.provolatile = (case when p.prosecdef then 'v' else 'i' end)::"char"
        and p.prolang = (select oid from pg_language where lanname = case when p.prosecdef then 'plpgsql' else 'sql' end)
        and has_function_privilege('service_role',p.oid,'EXECUTE') = (p.oid = 'public.cutover_catalog_product_media(jsonb)'::regprocedure)
        and not exists (
          select from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
          where acl.grantee <> p.proowner and (p.oid <> 'public.cutover_catalog_product_media(jsonb)'::regprocedure
            or acl.grantee <> 'service_role'::regrole or acl.is_grantable or acl.grantor <> p.proowner)
        );
    if strpos(actual_body, target_ref) = 0
      or (target_ref <> 'erasogmsqpgiirovubjh' and strpos(actual_body, 'erasogmsqpgiirovubjh') > 0)
      or encode(sha256(convert_to(replace(actual_body, target_ref, 'erasogmsqpgiirovubjh'), 'UTF8')), 'hex')
        <> routine.parent_body_sha256 then
      raise exception 'Unexpected Catalog predecessor for %',routine.oid;
    end if;
    if routine.oid = 'private.enforce_catalog_draft_media()'::regprocedure then
      draft_body := replace(actual_body, 'char_length(' || quote_literal(prefix) || ')',
        'char_length(private.helix_catalog_media_prefix())');
    elsif routine.oid = 'public.cutover_catalog_product_media(jsonb)'::regprocedure then
      cutover_body := replace(actual_body, 'v_prefix constant text := ' || quote_literal(prefix),
        'v_prefix constant text := private.helix_catalog_media_prefix()');
      cutover_body := replace(cutover_body, 'p_manifest->>''projectRef'' is distinct from ' || quote_literal(target_ref),
        'p_manifest->>''projectRef'' is distinct from (select project_ref from private.read_helix_environment())');
    end if;
  end loop;

  prior_regex := '^https://' || target_ref || '[.]supabase[.]co/storage/v1/object/public/helix-catalog/products/[^[:space:]?#]+$';
  select pg_get_constraintdef(oid) into strict constraint_definition from pg_constraint
    where conrelid='public.product_media'::regclass and conname='product_media_core_routine_editorial_shape_check' and convalidated;
  if strpos(constraint_definition, format('(url ~ %L::text)', prior_regex)) = 0
    or encode(sha256(convert_to(replace(constraint_definition, target_ref, 'erasogmsqpgiirovubjh'), 'UTF8')), 'hex')
      <> '432bb276675c7c50a70935534d8735d0e8d7b2e33f144a625e07dfdddab830a5' then
    raise exception 'Unexpected editorial media constraint for this target';
  end if;

  -- Only the existing schema's writer roles can use the private helper. An
  -- editor cannot establish a new hostname from uploaded metadata or a GUC.
  create function private.helix_catalog_media_prefix()
  returns text language sql stable security invoker set search_path = '' as $body$
    select 'https://' || e.project_ref || '.supabase.co/storage/v1/object/public/helix-catalog/'
    from private.read_helix_environment() e;
  $body$;
  revoke all on function private.helix_catalog_media_prefix() from public, anon, authenticated, service_role;

  create function private.is_bound_catalog_product_media_url(p_url text)
  returns boolean language sql stable security definer set search_path = '' as $body$
    select exists (
      select 1 from (select private.helix_catalog_media_prefix() || 'products/' as root) bound
      where starts_with(p_url, bound.root)
        and substr(p_url, length(bound.root) + 1) ~ '^[^[:space:]?#]+$'
        -- Do not let a normalized or repeatedly encoded path escape the bucket.
        and p_url !~ '/[.]{1,2}(/|$)' and p_url !~* '%(25|2e|2f|5c)'
        and strpos(p_url, chr(92)) = 0
    );
  $body$;
  revoke all on function private.is_bound_catalog_product_media_url(text) from public, anon, authenticated, service_role;
  grant execute on function private.is_bound_catalog_product_media_url(text) to service_role;

  -- The UUID cutover policy can remain paused during compatibility. Even then,
  -- new active media may reference only this database's public Catalog bucket.
  -- Archived links retain their original identity and may be inspected/restored.
  create function private.enforce_bound_catalog_media_origin()
  returns trigger language plpgsql security definer set search_path = '' as $body$
  begin
    if new.archived_at is null and new.url is not null and not private.is_bound_catalog_product_media_url(new.url) then
      raise exception 'Catalog media must use the owning Product environment' using errcode = '23514';
    end if;
    return new;
  end;
  $body$;
  revoke all on function private.enforce_bound_catalog_media_origin() from public, anon, authenticated, service_role;
  create trigger product_media_bound_catalog_origin before insert or update of product_id, url, archived_at
    on public.product_media for each row execute function private.enforce_bound_catalog_media_origin();

  create or replace function private.is_current_product_media_url(p_url text, p_product_id uuid)
  returns boolean language sql stable security invoker set search_path = '' as $body$
    select exists (
      select 1 from (select private.helix_catalog_media_prefix() || 'products/' || p_product_id::text || '/' as root) bound
      where starts_with(p_url, bound.root)
        and substr(p_url, length(bound.root) + 1) ~
          '^((primary|card-hover|core-routine-editorial|core-routine-texture|gallery|ingredients-texture|outcomes|profile|application|routine|drafts)/[0-9a-f]{64}[.](jpg|png|webp|mp4)|primary/original/[0-9a-f]{64}[.]webp)$'
    );
  $body$;

  -- Compile only the exact bodies captured and hashed above. The statements
  -- and attributes are fixed; no SQL definition is retrieved and re-executed.
  execute format('create or replace function private.enforce_catalog_draft_media() returns trigger '
    || 'language plpgsql security definer set search_path = %L as %L', '', draft_body);
  execute format('create or replace function public.cutover_catalog_product_media(p_manifest jsonb) returns jsonb '
    || 'language plpgsql security definer set search_path = %L as %L', '', cutover_body);

  -- Keep every other property of the existing editorial-shape constraint.
  -- VALIDATE existing rows in the same transaction. No historical pointers or
  -- Catalog revisions are written. The bound identity cannot change in place.
  execute 'alter table public.product_media drop constraint product_media_core_routine_editorial_shape_check, '
    || 'add constraint product_media_core_routine_editorial_shape_check '
    || replace(constraint_definition, format('(url ~ %L::text)',prior_regex),'(private.is_bound_catalog_product_media_url(url))');
  -- The sidecar calls just these read-only helpers, including the prefix
  -- used by the invoker predicate. The grantee comes from the owner-issued ACL.
  execute format('grant execute on function private.is_current_product_media_url(text,uuid), '
    || 'private.is_bound_catalog_product_media_url(text), private.helix_catalog_media_prefix() to %I', release_writer);
end;
$capability$;
revoke all on function private.apply_helix_catalog_media_binding() from public, anon, authenticated, service_role;
grant usage on schema private, public, supabase_migrations to :"writer_role";
grant select, insert on table supabase_migrations.schema_migrations to :"writer_role";
grant execute on function private.read_helix_environment(), public.read_helix_environment(),
  private.apply_helix_catalog_media_binding() to :"writer_role";
do $verify_acl$
begin
  if exists (
    select from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
    where p.oid = 'private.apply_helix_catalog_media_binding()'::regprocedure and acl.grantee <> p.proowner
      and (acl.grantee <> current_setting('helix.enroll_writer')::regrole or acl.is_grantable)
  ) then raise exception 'Unexpected apply capability grant'; end if;
end;
$verify_acl$;
commit;
