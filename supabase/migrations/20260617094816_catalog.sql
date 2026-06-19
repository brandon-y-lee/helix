-- Catalog schema for the Mei Pelle development storefront.
-- Public, read-only product catalog. No auth, no PII.

create table public.products (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  tagline     text not null,
  collection  text not null,
  blurb       text not null,
  description text not null,
  benefits    text[] not null default '{}',
  how_to_use  text not null,
  swatch_from text not null,
  swatch_to   text not null,
  position    int  not null default 0,
  created_at  timestamptz not null default now()
);

create table public.product_variants (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  variant_key text not null,
  label       text not null,
  price_cents int  not null check (price_cents >= 0),
  position    int  not null default 0,
  unique (product_id, variant_key)
);

create index product_variants_product_id_idx on public.product_variants(product_id);

-- Public catalog is world-readable; RLS on with read-only access for client roles.
alter table public.products enable row level security;
alter table public.product_variants enable row level security;

create policy "Public read products"
  on public.products for select to anon, authenticated using (true);

create policy "Public read product_variants"
  on public.product_variants for select to anon, authenticated using (true);;
