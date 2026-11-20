-- Called by scripts/db/bootstrap/catalog-media.mjs in ONE transaction.
-- The bootstrap runner owns the connection; this unit never creates an identity marker.
-- The dev-* slugs exercise Catalog listing, rich PDP and family navigation with
-- synthetic test patterns. The branded homepage selects published merchandising
-- slugs such as super-serum. Verifying those sections and their real imagery
-- requires a separately reviewed development Catalog import and Storage proof.
set local search_path = pg_catalog, pg_temp;

do $admission$
declare
  input jsonb := nullif(current_setting('helix.catalog_seed_inputs', true), '')::jsonb;
  origin constant text := 'https://zyfkunnpnlmgvrojmrbg.supabase.co/storage/v1/object/public/helix-catalog/';
begin
  if current_setting('transaction_read_only')::boolean then
    raise exception 'Catalog seed requires a writable development transaction';
  end if;
  if input->>'mode' = 'local' then
    if current_database() !~ '^helix_bootstrap_(fresh_a|fresh_b|prefix)_[a-f0-9]{12}$'
       or inet_server_addr() is not null
       or coalesce(current_setting('helix.bootstrap_scope', true), '') not in
          ('local-clean-rehearsal', 'local-prefix-rehearsal') then
      raise exception 'Local Catalog seed requires an isolated rehearsal database';
    end if;
  elsif input->>'mode' = 'development' then
    if to_regprocedure('public.read_helix_environment()') is null then
      raise exception 'Development database identity is unavailable';
    end if;
    if (select count(*) = 1 and bool_and(binding.environment = 'development'
          and binding.project_ref = 'zyfkunnpnlmgvrojmrbg')
        from public.read_helix_environment() binding) is not true then
      raise exception 'Catalog seed requires the persistent development child';
    end if;
  else
    raise exception 'Catalog seed requires media verified for its target';
  end if;
  if jsonb_typeof(input->'media') is distinct from 'array'
    or jsonb_array_length(input->'media') <> 11 then
    raise exception 'Development Catalog media set incomplete';
  end if;
  if exists (
    select from jsonb_array_elements(input->'media') m
    where (m->>'url' = origin || (m->>'path')
      and starts_with(m->>'path', 'products/' || (m->>'product_id') || '/')
      and split_part(m->>'path', '/', 4) = (m->>'sha256') ||
          case m->>'mime' when 'image/webp' then '.webp' when 'video/mp4' then '.mp4' end) is not true
  ) then
    raise exception 'Development Catalog object identity mismatch';
  end if;
  if input->>'mode' = 'development' then
    if not exists (select from storage.buckets where id = 'helix-catalog' and public)
       or exists (
         select from jsonb_array_elements(input->'media') m
         where not exists (
           select from storage.objects o where o.bucket_id = 'helix-catalog'
             and o.name = m->>'path' and o.version is not null
             and o.metadata->>'mimetype' = m->>'mime' and o.metadata->>'size' = m->>'bytes'
         )
       ) then
      raise exception 'Verified Catalog objects are missing from development Storage';
    end if;
  end if;
end
$admission$;

-- The inputs to this helper are typed fixture records authored below. On retry,
-- verify every supplied field of an existing row, including keys and owning IDs.
-- A uniqueness collision with unrelated or edited data always aborts the transaction.
create or replace function pg_temp.ensure_catalog_fixture(target regclass, fields jsonb)
returns void language plpgsql as $fixture$
declare
  columns text;
  expected_columns text;
  actual_columns text;
  found_match boolean;
  inserted integer;
begin
  select string_agg(format('%I', key), ', ' order by key),
         string_agg(format('expected.%I', key), ', ' order by key),
         string_agg(format('actual.%I', key), ', ' order by key)
    into columns, expected_columns, actual_columns from jsonb_object_keys(fields) as key;
  execute format('insert into %1$s (%2$s)
    select %3$s from jsonb_populate_record(null::%1$s, $1) expected on conflict do nothing',
    target, columns, expected_columns) using fields;
  get diagnostics inserted = row_count;
  if inserted = 1 then return; end if;
  execute format('select exists (select from %1$s actual,
    jsonb_populate_record(null::%1$s, $1) expected
    where row(%2$s) is not distinct from row(%3$s))',
    target, actual_columns, expected_columns) into found_match using fields;
  if not found_match then raise exception 'Development fixture conflict in %', target; end if;
end
$fixture$;

do $seed$
declare
  input jsonb := current_setting('helix.catalog_seed_inputs')::jsonb;
  fixture_time constant text := '2026-01-01T00:00:00Z';
  family constant uuid := '55900003-0000-4000-8000-000000000001';
  steps constant text[] := array['CLEANSE','REFINE','TREAT','FRAME','SEAL','PROTECT','LIFT'];
  step_name text;
  item record;
  product_id uuid;
  media jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('helix-development-catalog-seed', 0));
  foreach step_name in array steps loop
    perform pg_temp.ensure_catalog_fixture('public.system_steps', jsonb_build_object(
      'name', step_name, 'position', array_position(steps, step_name),
      'routine_group', case when step_name in ('CLEANSE','TREAT','SEAL') then 'core' else 'beyond_core' end));
  end loop;
  perform pg_temp.ensure_catalog_fixture('public.product_families', jsonb_build_object(
    'id', family, 'slug', 'dev-preparation', 'display_name', 'Development Preparation',
    'system_step_name', 'REFINE', 'created_at', fixture_time, 'updated_at', fixture_time));

  for item in select * from (values
    (1, 'dev-cleanser', 'Development Cleanser', 'Cleanser', 'CLEANSE'),
    (2, 'dev-serum', 'Development Serum', 'Serum', 'TREAT'),
    (3, 'dev-moisturizer', 'Development Moisturizer', 'Moisturizer', 'SEAL'),
    (4, 'dev-preparation-gel', 'Development Preparation Gel', 'Gel', 'REFINE'),
    (5, 'dev-preparation-pads', 'Development Preparation Pads', 'Pads', 'REFINE')
  ) as fixtures(n, slug, title, product_type, step_name) loop
    product_id := ('55900000-0000-4000-8000-' || lpad(item.n::text, 12, '0'))::uuid;
    perform pg_temp.ensure_catalog_fixture('public.products', jsonb_build_object(
      'id', product_id, 'slug', item.slug, 'display_name', item.title, 'product_type', item.product_type,
      'editorial_description', 'Synthetic Catalog fixture for development.', 'editorial_how_to_use', '',
      'swatch_from', '#e8eced', 'swatch_to', '#a7afb4', 'sort_order', item.n,
      'system_step_name', item.step_name, 'routine_sort', item.n,
      'routine_group', case when item.step_name = 'REFINE' then 'beyond_core' else 'core' end,
      'catalog_status', 'active', 'status', 'coming_soon', 'currency', 'USD',
      'created_at', fixture_time, 'published_at', fixture_time, 'updated_at', fixture_time));
    perform pg_temp.ensure_catalog_fixture('public.product_variants', jsonb_build_object(
      'id', ('55900001-0000-4000-8000-' || lpad(item.n::text, 12, '0'))::uuid, 'product_id', product_id,
      'variant_key', 'development', 'label', 'Test size', 'price_cents', 100, 'available', false,
      'inventory_status', 'unavailable', 'sort_order', 0, 'updated_at', fixture_time));
    perform pg_temp.ensure_catalog_fixture('public.product_pdp_content', jsonb_build_object(
      'product_id', product_id, 'how_to_use_steps', '[]'::jsonb,
      'created_at', fixture_time, 'updated_at', fixture_time));
    if item.step_name = 'REFINE' then
      perform pg_temp.ensure_catalog_fixture('public.product_family_memberships', jsonb_build_object(
        'family_id', family, 'product_id', product_id, 'option_label', item.product_type,
        'sort_order', item.n - 4, 'is_entry', item.n = 4, 'created_at', fixture_time, 'updated_at', fixture_time));
    end if;
  end loop;

  for media in select value from jsonb_array_elements(input->'media') loop
    perform pg_temp.ensure_catalog_fixture('public.product_media', (media - array['path','mime','bytes','sha256'])
      || jsonb_build_object('created_at',fixture_time,'updated_at',fixture_time));
  end loop;
  perform pg_temp.ensure_catalog_fixture('public.product_relationships', jsonb_build_object(
    'product_id','55900000-0000-4000-8000-000000000002', 'related_product_id','55900000-0000-4000-8000-000000000003',
    'relationship_type','complete_the_routine','sort_order',0,'created_at',fixture_time));
end
$seed$;
