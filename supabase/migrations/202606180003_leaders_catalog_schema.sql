-- Leaders-backed Mei-Pelle catalog expansion.
-- Additive and backward-compatible: existing product rows remain, then the
-- import command archives old active rows and upserts the selected system.

create extension if not exists pgcrypto;

alter table public.products
  add column if not exists action_name text,
  add column if not exists routine_number text,
  add column if not exists subtitle text,
  add column if not exists descriptor text,
  add column if not exists product_type text,
  add column if not exists catalog_status text not null default 'active'
    check (catalog_status in ('draft', 'active', 'archived')),
  add column if not exists badge text,
  add column if not exists currency text not null default 'USD'
    check (currency = 'USD'),
  add column if not exists featured_rank integer,
  add column if not exists sort_order integer,
  add column if not exists published_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists key_ingredients text[] not null default '{}',
  add column if not exists ingredients text,
  add column if not exists product_details jsonb not null default '{}'::jsonb,
  add column if not exists cautions text[] not null default '{}',
  add column if not exists finish text,
  add column if not exists volume text,
  add column if not exists skin_types text[] not null default '{}',
  add column if not exists concerns text[] not null default '{}',
  add column if not exists routine_step text,
  add column if not exists routine_order integer,
  add column if not exists usage_time text[] not null default '{}',
  add column if not exists seo_title text,
  add column if not exists seo_description text,
  add column if not exists search_keywords text[] not null default '{}';

update public.products
set
  action_name = coalesce(action_name, split_part(upper(name), ' ', 1)),
  subtitle = coalesce(subtitle, tagline),
  descriptor = coalesce(descriptor, blurb),
  product_type = coalesce(product_type, collection),
  featured_rank = coalesce(featured_rank, position),
  sort_order = coalesce(sort_order, position),
  routine_order = coalesce(routine_order, position),
  seo_title = coalesce(seo_title, name),
  seo_description = coalesce(seo_description, tagline),
  updated_at = coalesce(updated_at, now());

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

alter table public.product_variants
  add column if not exists sku text,
  add column if not exists supplier_variant_id text,
  add column if not exists option_values jsonb not null default '{}'::jsonb,
  add column if not exists compare_at_price_cents integer check (compare_at_price_cents is null or compare_at_price_cents >= 0),
  add column if not exists available boolean not null default true,
  add column if not exists inventory_status text not null default 'in_stock'
    check (inventory_status in ('in_stock', 'low_stock', 'out_of_stock', 'unavailable')),
  add column if not exists volume text,
  add column if not exists pack_count integer check (pack_count is null or pack_count > 0),
  add column if not exists sort_order integer,
  add column if not exists updated_at timestamptz not null default now();

update public.product_variants
set
  sort_order = coalesce(sort_order, position),
  option_values = case
    when option_values = '{}'::jsonb then jsonb_build_object('size', label)
    else option_values
  end,
  updated_at = coalesce(updated_at, now());

drop trigger if exists product_variants_set_updated_at on public.product_variants;
create trigger product_variants_set_updated_at
  before update on public.product_variants
  for each row execute function public.set_updated_at();

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists collections_set_updated_at on public.collections;
create trigger collections_set_updated_at
  before update on public.collections
  for each row execute function public.set_updated_at();

create table if not exists public.product_media (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete set null,
  media_type text not null default 'image' check (media_type in ('image', 'video')),
  url text not null,
  alt text not null,
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  role text not null default 'gallery'
    check (role in ('card', 'hero', 'gallery', 'detail', 'campaign')),
  sort_order integer not null default 0,
  original_source_url text,
  source_filename text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, role, sort_order)
);

create index if not exists product_media_product_sort_idx
  on public.product_media (product_id, sort_order);
create index if not exists product_media_role_idx
  on public.product_media (role);

drop trigger if exists product_media_set_updated_at on public.product_media;
create trigger product_media_set_updated_at
  before update on public.product_media
  for each row execute function public.set_updated_at();

create table if not exists public.product_relationships (
  product_id uuid not null references public.products(id) on delete cascade,
  related_product_id uuid not null references public.products(id) on delete cascade,
  relationship_type text not null default 'complete_the_routine'
    check (relationship_type in ('complete_the_routine', 'related', 'routine_next')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (product_id, related_product_id, relationship_type),
  constraint product_relationships_not_self check (product_id <> related_product_id)
);

create index if not exists product_relationships_related_idx
  on public.product_relationships (related_product_id, relationship_type);

create table if not exists public.product_sources (
  product_id uuid primary key references public.products(id) on delete cascade,
  supplier text not null,
  supplier_title text not null,
  supplier_url text not null,
  supplier_handle text not null,
  supplier_product_id text,
  source_inspected_at timestamptz not null,
  source_content_hash text,
  original_source_price_cents integer check (original_source_price_cents is null or original_source_price_cents >= 0),
  formulation_version_notes text,
  raw_source jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists product_sources_set_updated_at on public.product_sources;
create trigger product_sources_set_updated_at
  before update on public.product_sources
  for each row execute function public.set_updated_at();

create index if not exists products_catalog_status_sort_idx
  on public.products (catalog_status, sort_order, featured_rank);
create index if not exists products_routine_order_idx
  on public.products (routine_order) where catalog_status = 'active';
create index if not exists products_concerns_gin_idx
  on public.products using gin (concerns);
create index if not exists products_key_ingredients_gin_idx
  on public.products using gin (key_ingredients);
create index if not exists product_variants_availability_idx
  on public.product_variants (product_id, available, inventory_status);

alter table public.collections enable row level security;
alter table public.product_media enable row level security;
alter table public.product_relationships enable row level security;
alter table public.product_sources enable row level security;

drop policy if exists "Public read products" on public.products;
create policy "Public read active published products"
  on public.products for select to anon, authenticated
  using (catalog_status = 'active' and published_at <= now());

drop policy if exists "Public read product_variants" on public.product_variants;
create policy "Public read active product variants"
  on public.product_variants for select to anon, authenticated
  using (
    exists (
      select 1 from public.products
      where products.id = product_variants.product_id
        and products.catalog_status = 'active'
        and products.published_at <= now()
    )
  );

drop policy if exists "Public read active collections" on public.collections;
create policy "Public read active collections"
  on public.collections for select to anon, authenticated
  using (is_active = true);

drop policy if exists "Public read active product media" on public.product_media;
create policy "Public read active product media"
  on public.product_media for select to anon, authenticated
  using (
    exists (
      select 1 from public.products
      where products.id = product_media.product_id
        and products.catalog_status = 'active'
        and products.published_at <= now()
    )
  );

drop policy if exists "Public read active product relationships" on public.product_relationships;
create policy "Public read active product relationships"
  on public.product_relationships for select to anon, authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_relationships.product_id
        and p.catalog_status = 'active'
        and p.published_at <= now()
    )
    and exists (
      select 1 from public.products p
      where p.id = product_relationships.related_product_id
        and p.catalog_status = 'active'
        and p.published_at <= now()
    )
  );

-- No public policies for product_sources. Service role bypass is used by
-- controlled import/ops paths only; browser clients cannot read provenance.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'mei-pelle-catalog',
  'mei-pelle-catalog',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read Mei-Pelle catalog assets" on storage.objects;
create policy "Public read Mei-Pelle catalog assets"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'mei-pelle-catalog');

drop policy if exists "Service role manages Mei-Pelle catalog assets" on storage.objects;
create policy "Service role manages Mei-Pelle catalog assets"
  on storage.objects for all to service_role
  using (bucket_id = 'mei-pelle-catalog')
  with check (bucket_id = 'mei-pelle-catalog');
