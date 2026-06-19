-- Presentation refresh: keep supplier/source facts restricted while allowing
-- the active storefront to render Mei-Pelle-owned copy and hue placeholders.

alter table public.products
  add column if not exists display_name text,
  add column if not exists formal_title text,
  add column if not exists card_tagline text,
  add column if not exists editorial_description text,
  add column if not exists editorial_how_to_use text,
  add column if not exists formula_notes text[] not null default '{}';

update public.products
set
  display_name = coalesce(display_name, split_part(name, ' ', 1)),
  formal_title = coalesce(formal_title, name),
  card_tagline = coalesce(card_tagline, tagline),
  editorial_description = coalesce(editorial_description, description),
  editorial_how_to_use = coalesce(editorial_how_to_use, how_to_use),
  formula_notes = coalesce(formula_notes, '{}')
where
  display_name is null
  or formal_title is null
  or card_tagline is null
  or editorial_description is null
  or editorial_how_to_use is null
  or formula_notes is null;

alter table public.product_media
  add column if not exists media_kind text not null default 'image',
  add column if not exists palette_id text,
  add column if not exists placeholder_palette jsonb not null default '{}'::jsonb;

alter table public.product_media
  alter column url drop not null;

alter table public.product_media
  drop constraint if exists product_media_role_check;

alter table public.product_media
  add constraint product_media_role_check
  check (
    role in (
      'card',
      'hero',
      'gallery',
      'detail',
      'campaign',
      'card_default',
      'card_hover',
      'cart',
      'search'
    )
  );

alter table public.product_media
  drop constraint if exists product_media_media_kind_check;

alter table public.product_media
  add constraint product_media_media_kind_check
  check (media_kind in ('image', 'placeholder'));

alter table public.product_media
  drop constraint if exists product_media_payload_check;

alter table public.product_media
  add constraint product_media_payload_check
  check (
    (media_kind = 'image' and nullif(url, '') is not null)
    or (media_kind = 'placeholder' and placeholder_palette <> '{}'::jsonb)
  );

alter table public.product_media
  drop constraint if exists product_media_placeholder_palette_check;

alter table public.product_media
  add constraint product_media_placeholder_palette_check
  check (
    media_kind <> 'placeholder'
    or (
      jsonb_typeof(placeholder_palette) = 'object'
      and placeholder_palette ? 'start'
      and placeholder_palette ? 'end'
      and (placeholder_palette ->> 'start') ~* '^#[0-9a-f]{6}$'
      and (placeholder_palette ->> 'end') ~* '^#[0-9a-f]{6}$'
      and (
        not placeholder_palette ? 'accent'
        or (placeholder_palette ->> 'accent') ~* '^#[0-9a-f]{6}$'
      )
      and (
        not placeholder_palette ? 'surface'
        or (placeholder_palette ->> 'surface') ~* '^#[0-9a-f]{6}$'
      )
      and (
        not placeholder_palette ? 'ink'
        or (placeholder_palette ->> 'ink') ~* '^#[0-9a-f]{6}$'
      )
      and (
        not placeholder_palette ? 'highlight'
        or (placeholder_palette ->> 'highlight') ~* '^#[0-9a-f]{6}$'
      )
    )
  );

create index if not exists product_media_kind_role_idx
  on public.product_media (media_kind, role);
