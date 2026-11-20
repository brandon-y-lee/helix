DO $migration$
declare
  target_ref text;
  prefix text;
  routine record;
  definition text;
  actual_body text;
  prior_regex text;
  constraint_definition text;
begin
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
    select prosrc into strict actual_body from pg_proc where oid = routine.oid;
    if strpos(actual_body, target_ref) = 0
      or (target_ref <> 'erasogmsqpgiirovubjh' and strpos(actual_body, 'erasogmsqpgiirovubjh') > 0)
      or encode(sha256(convert_to(replace(actual_body, target_ref, 'erasogmsqpgiirovubjh'), 'UTF8')), 'hex')
        <> routine.parent_body_sha256 then
      raise exception 'Unexpected Catalog predecessor for %',routine.oid;
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

  -- Retain all locking, immutable evidence, existing grants, and retry behavior.
  -- Bodies were matched against the reviewed source before replacing the narrow
  -- URL expressions. CREATE OR REPLACE preserves the RPC's identity and grants.
  definition := pg_get_functiondef('private.enforce_catalog_draft_media()'::regprocedure);
  execute replace(definition, 'char_length(' || quote_literal(prefix) || ')',
    'char_length(private.helix_catalog_media_prefix())');

  definition := pg_get_functiondef('public.cutover_catalog_product_media(jsonb)'::regprocedure);
  definition := replace(definition, 'v_prefix constant text := ' || quote_literal(prefix),
    'v_prefix constant text := private.helix_catalog_media_prefix()');
  execute replace(definition, 'p_manifest->>''projectRef'' is distinct from ' || quote_literal(target_ref),
    'p_manifest->>''projectRef'' is distinct from (select project_ref from private.read_helix_environment())');

  -- Keep every other property of the existing editorial-shape constraint.
  -- VALIDATE existing rows in the same transaction. No historical pointers or
  -- Catalog revisions are written. The bound identity cannot change in place.
  execute 'alter table public.product_media drop constraint product_media_core_routine_editorial_shape_check, '
    || 'add constraint product_media_core_routine_editorial_shape_check '
    || replace(constraint_definition, format('(url ~ %L::text)',prior_regex),'(private.is_bound_catalog_product_media_url(url))');
end;
$migration$;
