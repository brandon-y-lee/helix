-- Catalog schema-only checkpoint: approved project erasogmsqpgiirovubjh
-- Captured 2026-09-14; PostgreSQL 17.6; installed migration 20260909042518.
-- Auth user identity is an explicit external stub; outbound provider webhooks excluded.
-- No customer or Catalog rows are included.
set check_function_bodies = false;
create schema private;
create schema auth;
create table auth.users (id uuid primary key);
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema private to service_role;
create table "public"."admin_memberships" (
  "user_id" uuid not null,
  "role" text not null,
  "active" boolean default true not null,
  "created_by" uuid,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
create table "public"."catalog_editor_audit_log" (
  "id" uuid default gen_random_uuid() not null,
  "action" text not null,
  "actor_id" uuid,
  "product_id" uuid,
  "draft_id" uuid,
  "revision_id" uuid,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null
);
create table "public"."catalog_product_revisions" (
  "id" uuid default gen_random_uuid() not null,
  "product_id" uuid not null,
  "revision_number" integer not null,
  "schema_version" smallint default 4 not null,
  "document" jsonb not null,
  "source_draft_id" uuid,
  "published_by" uuid,
  "published_at" timestamp with time zone default now() not null
);
create table "public"."product_content_drafts" (
  "id" uuid default gen_random_uuid() not null,
  "product_id" uuid not null,
  "schema_version" smallint default 4 not null,
  "base_revision" integer default 0 not null,
  "version" bigint default 1 not null,
  "document" jsonb not null,
  "status" text default 'draft'::text not null,
  "validation_errors" jsonb default '[]'::jsonb not null,
  "created_by" uuid not null,
  "updated_by" uuid not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "ready_at" timestamp with time zone,
  "published_at" timestamp with time zone,
  "discarded_at" timestamp with time zone
);
create table "public"."product_families" (
  "id" uuid default gen_random_uuid() not null,
  "slug" text not null,
  "display_name" text not null,
  "system_step_name" text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
create table "public"."product_family_memberships" (
  "family_id" uuid not null,
  "product_id" uuid not null,
  "option_label" text not null,
  "sort_order" smallint not null,
  "is_entry" boolean default false not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
create table "public"."product_media" (
  "id" uuid default gen_random_uuid() not null,
  "product_id" uuid not null,
  "variant_id" uuid,
  "media_type" text default 'image'::text not null,
  "url" text,
  "alt" text not null,
  "width" integer,
  "height" integer,
  "role" text default 'gallery'::text not null,
  "sort_order" integer default 0 not null,
  "original_source_url" text,
  "source_filename" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "palette_id" text,
  "placeholder_palette" jsonb default '{}'::jsonb not null,
  "archived_at" timestamp with time zone
);
create table "public"."product_pdp_content" (
  "product_id" uuid not null,
  "schema_version" smallint default 1 not null,
  "profile_title_tokens" jsonb,
  "routine_overlay" text,
  "outcome_heading" text,
  "outcome_labels" text[],
  "how_to_use_steps" text[],
  "application_steps" text[],
  "ingredient_cards" jsonb,
  "ingredient_story" jsonb,
  "routine_guidance" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
create table "public"."product_relationships" (
  "product_id" uuid not null,
  "related_product_id" uuid not null,
  "relationship_type" text default 'complete_the_routine'::text not null,
  "sort_order" integer default 0 not null,
  "created_at" timestamp with time zone default now() not null,
  "archived_at" timestamp with time zone
);
create table "public"."product_slug_routes" (
  "source_slug" text not null,
  "source_product_id" uuid not null,
  "target_product_id" uuid not null,
  "route_kind" text not null,
  "created_at" timestamp with time zone default now() not null
);
create table "public"."product_sources" (
  "product_id" uuid not null,
  "supplier" text not null,
  "supplier_title" text not null,
  "supplier_url" text not null,
  "supplier_handle" text not null,
  "supplier_product_id" text,
  "source_inspected_at" timestamp with time zone not null,
  "source_content_hash" text,
  "original_source_price_cents" integer,
  "formulation_version_notes" text,
  "raw_source" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
create table "public"."product_variants" (
  "id" uuid default gen_random_uuid() not null,
  "product_id" uuid not null,
  "variant_key" text not null,
  "label" text not null,
  "price_cents" integer not null,
  "sku" text,
  "supplier_variant_id" text,
  "option_values" jsonb default '{}'::jsonb not null,
  "compare_at_price_cents" integer,
  "available" boolean default true not null,
  "inventory_status" text default 'in_stock'::text not null,
  "volume" text,
  "pack_count" integer,
  "sort_order" integer not null,
  "updated_at" timestamp with time zone default now() not null,
  "archived_at" timestamp with time zone
);
create table "public"."products" (
  "id" uuid default gen_random_uuid() not null,
  "slug" text not null,
  "benefits" text[] default '{}'::text[] not null,
  "swatch_from" text not null,
  "swatch_to" text not null,
  "created_at" timestamp with time zone default now() not null,
  "status" text default 'available'::text not null,
  "made_for" text,
  "good_for" text,
  "texture" text,
  "product_type" text not null,
  "catalog_status" text default 'active'::text not null,
  "badge" text,
  "currency" text default 'USD'::text not null,
  "sort_order" integer not null,
  "published_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "key_ingredients" text[] default '{}'::text[] not null,
  "ingredients" text,
  "cautions" text[] default '{}'::text[] not null,
  "finish" text,
  "volume" text,
  "skin_types" text[] default '{}'::text[] not null,
  "concerns" text[] default '{}'::text[] not null,
  "usage_time" text[] default '{}'::text[] not null,
  "seo_title" text,
  "seo_description" text,
  "search_keywords" text[] default '{}'::text[] not null,
  "display_name" text not null,
  "editorial_description" text not null,
  "editorial_how_to_use" text not null,
  "formula_notes" text[] default '{}'::text[] not null,
  "routine_group" text not null,
  "routine_sort" integer not null,
  "system_step_name" text
);
create table "public"."system_steps" (
  "name" text not null,
  "position" smallint not null,
  "routine_group" text not null
);
alter table public."admin_memberships" add constraint "admin_memberships_pkey" PRIMARY KEY (user_id);
alter table public."admin_memberships" add constraint "admin_memberships_role_check" CHECK ((role = ANY (ARRAY['admin'::text, 'catalog_publisher'::text, 'catalog_editor'::text])));
alter table public."catalog_editor_audit_log" add constraint "catalog_editor_audit_log_action_check" CHECK ((action = ANY (ARRAY['draft.created'::text, 'draft.saved'::text, 'draft.validated'::text, 'draft.ready'::text, 'draft.discarded'::text, 'draft.restored'::text, 'draft.published'::text, 'media.uploaded'::text, 'membership.created'::text, 'membership.updated'::text, 'slug.rename.published'::text, 'slug.replacement.published'::text, 'family.published'::text])));
alter table public."catalog_editor_audit_log" add constraint "catalog_editor_audit_log_metadata_check" CHECK ((jsonb_typeof(metadata) = 'object'::text));
alter table public."catalog_editor_audit_log" add constraint "catalog_editor_audit_log_pkey" PRIMARY KEY (id);
alter table public."catalog_product_revisions" add constraint "catalog_product_revisions_document_check" CHECK (((jsonb_typeof(document) = 'object'::text) AND (((document ->> 'schemaVersion'::text))::smallint = schema_version) AND (schema_version = ANY (ARRAY[1, 2, 3, 4])) AND ((schema_version <> 4) OR (NOT ((document -> 'product'::text) ?| ARRAY['formal_title'::text, 'card_tagline'::text, 'routine_step_number'::text, 'routine_step_name'::text])))));
alter table public."catalog_product_revisions" add constraint "catalog_product_revisions_pkey" PRIMARY KEY (id);
alter table public."catalog_product_revisions" add constraint "catalog_product_revisions_product_id_revision_number_key" UNIQUE (product_id, revision_number);
alter table public."catalog_product_revisions" add constraint "catalog_product_revisions_revision_number_check" CHECK ((revision_number > 0));
alter table public."catalog_product_revisions" add constraint "catalog_product_revisions_schema_version_check" CHECK ((schema_version = ANY (ARRAY[1, 2, 3, 4])));
alter table public."product_content_drafts" add constraint "product_content_drafts_base_revision_check" CHECK ((base_revision >= 0));
alter table public."product_content_drafts" add constraint "product_content_drafts_current_schema_check" CHECK (((status <> ALL (ARRAY['draft'::text, 'ready'::text])) OR (schema_version = 4)));
alter table public."product_content_drafts" add constraint "product_content_drafts_document_check" CHECK (((jsonb_typeof(document) = 'object'::text) AND (((document ->> 'schemaVersion'::text))::smallint = schema_version) AND (schema_version = ANY (ARRAY[1, 2, 3, 4])) AND ((schema_version <> 4) OR (NOT ((document -> 'product'::text) ?| ARRAY['formal_title'::text, 'card_tagline'::text, 'routine_step_number'::text, 'routine_step_name'::text])))));
alter table public."product_content_drafts" add constraint "product_content_drafts_pkey" PRIMARY KEY (id);
alter table public."product_content_drafts" add constraint "product_content_drafts_schema_version_check" CHECK ((schema_version = ANY (ARRAY[1, 2, 3, 4])));
alter table public."product_content_drafts" add constraint "product_content_drafts_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'ready'::text, 'published'::text, 'discarded'::text])));
alter table public."product_content_drafts" add constraint "product_content_drafts_validation_errors_check" CHECK ((jsonb_typeof(validation_errors) = 'array'::text));
alter table public."product_content_drafts" add constraint "product_content_drafts_version_check" CHECK ((version > 0));
alter table public."product_families" add constraint "product_families_display_name_check" CHECK ((NULLIF(btrim(display_name), ''::text) IS NOT NULL));
alter table public."product_families" add constraint "product_families_pkey" PRIMARY KEY (id);
alter table public."product_families" add constraint "product_families_slug_check" CHECK (((slug = btrim(slug)) AND (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text)));
alter table public."product_families" add constraint "product_families_slug_key" UNIQUE (slug);
alter table public."product_family_memberships" add constraint "product_family_memberships_family_id_sort_order_key" UNIQUE (family_id, sort_order);
alter table public."product_family_memberships" add constraint "product_family_memberships_option_label_check" CHECK ((NULLIF(btrim(option_label), ''::text) IS NOT NULL));
alter table public."product_family_memberships" add constraint "product_family_memberships_pkey" PRIMARY KEY (family_id, product_id);
alter table public."product_family_memberships" add constraint "product_family_memberships_product_id_key" UNIQUE (product_id);
alter table public."product_family_memberships" add constraint "product_family_memberships_sort_order_check" CHECK ((sort_order >= 0));
alter table public."product_media" add constraint "product_media_canonical_payload_check" CHECK ((((media_type = 'video'::text) AND (NULLIF(url, ''::text) IS NOT NULL) AND (placeholder_palette = '{}'::jsonb)) OR ((media_type = 'image'::text) AND (((NULLIF(url, ''::text) IS NOT NULL) AND (placeholder_palette = '{}'::jsonb)) OR ((url IS NULL) AND (jsonb_typeof(placeholder_palette) = 'object'::text) AND (placeholder_palette ? 'start'::text) AND (placeholder_palette ? 'end'::text) AND ((placeholder_palette ->> 'start'::text) ~* '^#[0-9a-f]{6}$'::text) AND ((placeholder_palette ->> 'end'::text) ~* '^#[0-9a-f]{6}$'::text) AND ((NOT (placeholder_palette ? 'accent'::text)) OR ((placeholder_palette ->> 'accent'::text) ~* '^#[0-9a-f]{6}$'::text)) AND ((NOT (placeholder_palette ? 'surface'::text)) OR ((placeholder_palette ->> 'surface'::text) ~* '^#[0-9a-f]{6}$'::text)) AND ((NOT (placeholder_palette ? 'ink'::text)) OR ((placeholder_palette ->> 'ink'::text) ~* '^#[0-9a-f]{6}$'::text)) AND ((NOT (placeholder_palette ? 'highlight'::text)) OR ((placeholder_palette ->> 'highlight'::text) ~* '^#[0-9a-f]{6}$'::text)))))));
alter table public."product_media" add constraint "product_media_core_routine_editorial_shape_check" CHECK (((role <> 'core_routine_editorial'::text) OR ((media_type = 'image'::text) AND (NULLIF(btrim(url), ''::text) IS NOT NULL) AND (url ~ '^https://erasogmsqpgiirovubjh[.]supabase[.]co/storage/v1/object/public/helix-catalog/products/[^[:space:]?#]+$'::text) AND (width IS NOT NULL) AND (width > 0) AND (height IS NOT NULL) AND (height > 0) AND (variant_id IS NULL) AND (sort_order = 1) AND (palette_id IS NULL) AND (placeholder_palette = '{}'::jsonb))));
alter table public."product_media" add constraint "product_media_editorial_role_type_check" CHECK (((role <> ALL (ARRAY['routine_video'::text, 'routine_video_poster'::text, 'profile_editorial'::text, 'ingredients_texture'::text, 'core_routine_texture'::text, 'core_routine_editorial'::text, 'pdp_outcome'::text, 'pdp_application'::text])) OR ((NULLIF(btrim(url), ''::text) IS NOT NULL) AND (width IS NOT NULL) AND (width > 0) AND (height IS NOT NULL) AND (height > 0) AND (((role = 'routine_video'::text) AND (media_type = 'video'::text)) OR ((role = ANY (ARRAY['routine_video_poster'::text, 'profile_editorial'::text, 'ingredients_texture'::text, 'core_routine_texture'::text, 'core_routine_editorial'::text, 'pdp_outcome'::text, 'pdp_application'::text])) AND (media_type = 'image'::text))))));
alter table public."product_media" add constraint "product_media_height_check" CHECK (((height IS NULL) OR (height > 0)));
alter table public."product_media" add constraint "product_media_media_type_check" CHECK ((media_type = ANY (ARRAY['image'::text, 'video'::text])));
alter table public."product_media" add constraint "product_media_pkey" PRIMARY KEY (id);
alter table public."product_media" add constraint "product_media_role_check" CHECK ((role = ANY (ARRAY['card'::text, 'hero'::text, 'gallery'::text, 'detail'::text, 'card_default'::text, 'card_hover'::text, 'cart'::text, 'search'::text, 'routine_video'::text, 'routine_video_poster'::text, 'profile_editorial'::text, 'ingredients_texture'::text, 'core_routine_texture'::text, 'core_routine_editorial'::text, 'pdp_outcome'::text, 'pdp_application'::text])));
alter table public."product_media" add constraint "product_media_width_check" CHECK (((width IS NULL) OR (width > 0)));
alter table public."product_pdp_content" add constraint "product_pdp_content_ingredient_cards_check" CHECK (((ingredient_cards IS NULL) OR (jsonb_typeof(ingredient_cards) = 'array'::text)));
alter table public."product_pdp_content" add constraint "product_pdp_content_ingredient_story_check" CHECK (((ingredient_story IS NULL) OR (jsonb_typeof(ingredient_story) = 'object'::text)));
alter table public."product_pdp_content" add constraint "product_pdp_content_outcome_labels_check" CHECK (((outcome_labels IS NULL) OR (cardinality(outcome_labels) = 3)));
alter table public."product_pdp_content" add constraint "product_pdp_content_pkey" PRIMARY KEY (product_id);
alter table public."product_pdp_content" add constraint "product_pdp_content_profile_title_tokens_check" CHECK (((profile_title_tokens IS NULL) OR ((jsonb_typeof(profile_title_tokens) = 'array'::text) AND (jsonb_array_length(profile_title_tokens) > 0))));
alter table public."product_pdp_content" add constraint "product_pdp_content_schema_version_check" CHECK ((schema_version = 1));
alter table public."product_relationships" add constraint "product_relationships_not_self" CHECK ((product_id <> related_product_id));
alter table public."product_relationships" add constraint "product_relationships_pkey" PRIMARY KEY (product_id, related_product_id, relationship_type);
alter table public."product_relationships" add constraint "product_relationships_relationship_type_check" CHECK ((relationship_type = ANY (ARRAY['complete_the_routine'::text, 'related'::text, 'routine_next'::text])));
alter table public."product_slug_routes" add constraint "product_slug_routes_identity_check" CHECK ((((route_kind = ANY (ARRAY['canonical'::text, 'rename'::text])) AND (source_product_id = target_product_id)) OR ((route_kind = 'replacement'::text) AND (source_product_id <> target_product_id))));
alter table public."product_slug_routes" add constraint "product_slug_routes_pkey" PRIMARY KEY (source_slug);
alter table public."product_slug_routes" add constraint "product_slug_routes_route_kind_check" CHECK ((route_kind = ANY (ARRAY['canonical'::text, 'rename'::text, 'replacement'::text])));
alter table public."product_slug_routes" add constraint "product_slug_routes_source_slug_check" CHECK (((source_slug = btrim(source_slug)) AND (source_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text) AND (char_length(source_slug) <= 120)));
alter table public."product_sources" add constraint "product_sources_original_source_price_cents_check" CHECK (((original_source_price_cents IS NULL) OR (original_source_price_cents >= 0)));
alter table public."product_sources" add constraint "product_sources_pkey" PRIMARY KEY (product_id);
alter table public."product_variants" add constraint "product_variants_compare_at_price_cents_check" CHECK (((compare_at_price_cents IS NULL) OR (compare_at_price_cents >= 0)));
alter table public."product_variants" add constraint "product_variants_inventory_status_check" CHECK ((inventory_status = ANY (ARRAY['in_stock'::text, 'low_stock'::text, 'out_of_stock'::text, 'unavailable'::text])));
alter table public."product_variants" add constraint "product_variants_pack_count_check" CHECK (((pack_count IS NULL) OR (pack_count > 0)));
alter table public."product_variants" add constraint "product_variants_pkey" PRIMARY KEY (id);
alter table public."product_variants" add constraint "product_variants_price_cents_check" CHECK ((price_cents >= 0));
alter table public."products" add constraint "products_active_system_step_check" CHECK (((catalog_status <> 'active'::text) OR (system_step_name IS NOT NULL)));
alter table public."products" add constraint "products_catalog_status_check" CHECK ((catalog_status = ANY (ARRAY['draft'::text, 'active'::text, 'archived'::text])));
alter table public."products" add constraint "products_currency_check" CHECK ((currency = 'USD'::text));
alter table public."products" add constraint "products_pkey" PRIMARY KEY (id);
alter table public."products" add constraint "products_routine_group_check" CHECK (((routine_group IS NULL) OR (routine_group = ANY (ARRAY['core'::text, 'beyond_core'::text]))));
alter table public."products" add constraint "products_slug_key" UNIQUE (slug);
alter table public."products" add constraint "products_slug_length_check" CHECK ((char_length(slug) <= 120));
alter table public."products" add constraint "products_status_check" CHECK ((status = ANY (ARRAY['available'::text, 'coming_soon'::text, 'sold_out'::text, 'waitlist'::text])));
alter table public."system_steps" add constraint "system_steps_fixed_contract_check" CHECK ((((name = 'CLEANSE'::text) AND ("position" = 1) AND (routine_group = 'core'::text)) OR ((name = 'REFINE'::text) AND ("position" = 2) AND (routine_group = 'beyond_core'::text)) OR ((name = 'TREAT'::text) AND ("position" = 3) AND (routine_group = 'core'::text)) OR ((name = 'FRAME'::text) AND ("position" = 4) AND (routine_group = 'beyond_core'::text)) OR ((name = 'SEAL'::text) AND ("position" = 5) AND (routine_group = 'core'::text)) OR ((name = 'PROTECT'::text) AND ("position" = 6) AND (routine_group = 'beyond_core'::text)) OR ((name = 'LIFT'::text) AND ("position" = 7) AND (routine_group = 'beyond_core'::text))));
alter table public."system_steps" add constraint "system_steps_name_check" CHECK ((name = ANY (ARRAY['CLEANSE'::text, 'REFINE'::text, 'TREAT'::text, 'FRAME'::text, 'SEAL'::text, 'PROTECT'::text, 'LIFT'::text])));
alter table public."system_steps" add constraint "system_steps_name_routine_group_key" UNIQUE (name, routine_group);
alter table public."system_steps" add constraint "system_steps_pkey" PRIMARY KEY (name);
alter table public."system_steps" add constraint "system_steps_position_check" CHECK ((("position" >= 1) AND ("position" <= 7)));
alter table public."system_steps" add constraint "system_steps_position_key" UNIQUE ("position");
alter table public."system_steps" add constraint "system_steps_routine_group_check" CHECK ((routine_group = ANY (ARRAY['core'::text, 'beyond_core'::text])));
alter table public."admin_memberships" add constraint "admin_memberships_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."admin_memberships" add constraint "admin_memberships_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."catalog_editor_audit_log" add constraint "catalog_editor_audit_log_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."catalog_editor_audit_log" add constraint "catalog_editor_audit_log_draft_id_fkey" FOREIGN KEY (draft_id) REFERENCES product_content_drafts(id) ON DELETE SET NULL;
alter table public."catalog_editor_audit_log" add constraint "catalog_editor_audit_log_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
alter table public."catalog_editor_audit_log" add constraint "catalog_editor_audit_log_revision_id_fkey" FOREIGN KEY (revision_id) REFERENCES catalog_product_revisions(id) ON DELETE SET NULL;
alter table public."catalog_product_revisions" add constraint "catalog_product_revisions_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;
alter table public."catalog_product_revisions" add constraint "catalog_product_revisions_published_by_fkey" FOREIGN KEY (published_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."catalog_product_revisions" add constraint "catalog_product_revisions_source_draft_id_fkey" FOREIGN KEY (source_draft_id) REFERENCES product_content_drafts(id) ON DELETE RESTRICT;
alter table public."product_content_drafts" add constraint "product_content_drafts_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
alter table public."product_content_drafts" add constraint "product_content_drafts_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;
alter table public."product_content_drafts" add constraint "product_content_drafts_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
alter table public."product_families" add constraint "product_families_system_step_name_fkey" FOREIGN KEY (system_step_name) REFERENCES system_steps(name) ON UPDATE RESTRICT ON DELETE RESTRICT;
alter table public."product_family_memberships" add constraint "product_family_memberships_family_id_fkey" FOREIGN KEY (family_id) REFERENCES product_families(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
alter table public."product_family_memberships" add constraint "product_family_memberships_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
alter table public."product_media" add constraint "product_media_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
alter table public."product_media" add constraint "product_media_variant_id_fkey" FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL;
alter table public."product_pdp_content" add constraint "product_pdp_content_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
alter table public."product_relationships" add constraint "product_relationships_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
alter table public."product_relationships" add constraint "product_relationships_related_product_id_fkey" FOREIGN KEY (related_product_id) REFERENCES products(id) ON DELETE CASCADE;
alter table public."product_slug_routes" add constraint "product_slug_routes_source_product_id_fkey" FOREIGN KEY (source_product_id) REFERENCES products(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
alter table public."product_slug_routes" add constraint "product_slug_routes_target_product_id_fkey" FOREIGN KEY (target_product_id) REFERENCES products(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
alter table public."product_sources" add constraint "product_sources_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
alter table public."product_variants" add constraint "product_variants_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
alter table public."products" add constraint "products_system_step_routine_group_fkey" FOREIGN KEY (system_step_name, routine_group) REFERENCES system_steps(name, routine_group) ON UPDATE RESTRICT ON DELETE RESTRICT;
CREATE OR REPLACE FUNCTION private.catalog_editor_document_v3(p_product_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'schemaVersion', 3,
    'productId', p.id,
    'product', to_jsonb(p),
    'productPdpContent', (
      select to_jsonb(pc)
      from public.product_pdp_content pc
      where pc.product_id = p.id
    ),
    'variants', coalesce((
      select jsonb_agg(to_jsonb(v) order by v.sort_order, v.variant_key)
      from public.product_variants v
      where v.product_id = p.id
        and v.archived_at is null
    ), '[]'::jsonb),
    'media', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.role, m.sort_order, m.id)
      from public.product_media m
      where m.product_id = p.id
        and m.archived_at is null
    ), '[]'::jsonb),
    'relationships', coalesce((
      select jsonb_agg(
        to_jsonb(r)
        order by r.relationship_type, r.sort_order, r.related_product_id
      )
      from public.product_relationships r
      where r.product_id = p.id
        and r.archived_at is null
    ), '[]'::jsonb),
    'productSource', (
      select to_jsonb(s)
      from public.product_sources s
      where s.product_id = p.id
    )
  )
  from public.products p
  where p.id = p_product_id;
$function$;
revoke all on function private.catalog_editor_document_v3(uuid) from public, anon, authenticated, service_role;
grant execute on function private.catalog_editor_document_v3(uuid) to "postgres";
CREATE OR REPLACE FUNCTION private.catalog_editor_document_v4(p_product_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'schemaVersion', 4,
    'productId', p.id,
    'product', to_jsonb(p),
    'productPdpContent', (
      select to_jsonb(pc)
      from public.product_pdp_content pc
      where pc.product_id = p.id
    ),
    'variants', coalesce((
      select jsonb_agg(to_jsonb(v) order by v.sort_order, v.variant_key)
      from public.product_variants v
      where v.product_id = p.id
        and v.archived_at is null
    ), '[]'::jsonb),
    'media', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.role, m.sort_order, m.id)
      from public.product_media m
      where m.product_id = p.id
        and m.archived_at is null
    ), '[]'::jsonb),
    'relationships', coalesce((
      select jsonb_agg(
        to_jsonb(r)
        order by r.relationship_type, r.sort_order, r.related_product_id
      )
      from public.product_relationships r
      where r.product_id = p.id
        and r.archived_at is null
    ), '[]'::jsonb),
    'productSource', (
      select to_jsonb(s)
      from public.product_sources s
      where s.product_id = p.id
    ),
    'productFamily', private.catalog_editor_product_family(p.id)
  )
  from public.products p
  where p.id = p_product_id;
$function$;
revoke all on function private.catalog_editor_document_v4(uuid) from public, anon, authenticated, service_role;
grant execute on function private.catalog_editor_document_v4(uuid) to "postgres";
CREATE OR REPLACE FUNCTION private.catalog_editor_product_family(p_product_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select (
    select jsonb_build_object(
      'family', to_jsonb(family),
      'memberships', coalesce((
        select jsonb_agg(
          to_jsonb(member)
          order by member.sort_order, member.product_id
        )
        from public.product_family_memberships member
        where member.family_id = family.id
      ), '[]'::jsonb)
    )
    from public.product_family_memberships current_member
    join public.product_families family
      on family.id = current_member.family_id
    where current_member.product_id = p_product_id
  );
$function$;
revoke all on function private.catalog_editor_product_family(uuid) from public, anon, authenticated, service_role;
grant execute on function private.catalog_editor_product_family(uuid) to "postgres";
CREATE OR REPLACE FUNCTION private.catalog_editor_upgrade_to_v3(p_document jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  return case p_document ->> 'schemaVersion'
    when '1' then private.catalog_editor_upgrade_v2_to_v3(
      private.catalog_editor_upgrade_v1_to_v2(p_document)
    )
    when '2' then private.catalog_editor_upgrade_v2_to_v3(p_document)
    when '3' then p_document
    else null
  end;
end;
$function$;
revoke all on function private.catalog_editor_upgrade_to_v3(jsonb) from public, anon, authenticated, service_role;
grant execute on function private.catalog_editor_upgrade_to_v3(jsonb) to "postgres";
CREATE OR REPLACE FUNCTION private.catalog_editor_upgrade_to_v4(p_document jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_document jsonb;
begin
  v_document := private.catalog_editor_upgrade_to_v4_without_family(p_document);
  if v_document is null then
    return null;
  end if;

  return v_document || jsonb_build_object(
    'productFamily',
    private.catalog_editor_product_family((v_document ->> 'productId')::uuid)
  );
end;
$function$;
revoke all on function private.catalog_editor_upgrade_to_v4(jsonb) from public, anon, authenticated, service_role;
grant execute on function private.catalog_editor_upgrade_to_v4(jsonb) to "postgres";
CREATE OR REPLACE FUNCTION private.catalog_editor_upgrade_to_v4_without_family(p_document jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  return case p_document ->> 'schemaVersion'
    when '1' then private.catalog_editor_upgrade_v3_to_v4(
      private.catalog_editor_upgrade_v2_to_v3(
        private.catalog_editor_upgrade_v1_to_v2(p_document)
      )
    )
    when '2' then private.catalog_editor_upgrade_v3_to_v4(
      private.catalog_editor_upgrade_v2_to_v3(p_document)
    )
    when '3' then private.catalog_editor_upgrade_v3_to_v4(p_document)
    when '4' then p_document
    else null
  end;
end;
$function$;
revoke all on function private.catalog_editor_upgrade_to_v4_without_family(jsonb) from public, anon, authenticated, service_role;
grant execute on function private.catalog_editor_upgrade_to_v4_without_family(jsonb) to "postgres";
CREATE OR REPLACE FUNCTION private.catalog_editor_upgrade_v1_to_v2(p_document jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_product jsonb;
  v_variants jsonb;
  v_media jsonb;
  v_ingredients text;
begin
  if jsonb_typeof(p_document) <> 'object'
     or p_document ->> 'schemaVersion' <> '1'
     or jsonb_typeof(p_document -> 'product') <> 'object'
     or jsonb_typeof(p_document -> 'variants') <> 'array'
     or jsonb_typeof(p_document -> 'media') <> 'array'
     or jsonb_typeof(p_document -> 'relationships') <> 'array'
  then
    raise exception 'invalid catalog editor V1 document'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_document -> 'media') item
    where item ->> 'role' = 'campaign'
  ) then
    raise exception
      'V1 document contains the unsupported campaign media role'
      using errcode = '22023';
  end if;

  v_product := p_document -> 'product';
  v_ingredients := nullif(btrim(v_product ->> 'ingredients'), '');
  if v_ingredients is not null
     and nullif(
       btrim(v_product #>> '{product_details,sourceFullInci}'),
       ''
     ) is not null
     and regexp_replace(v_ingredients, '\s+', ' ', 'g')
       <> regexp_replace(
         btrim(v_product #>> '{product_details,sourceFullInci}'),
         '\s+',
         ' ',
         'g'
       )
  then
    raise exception 'V1 document contains conflicting full INCI values'
      using errcode = '22023';
  end if;

  if v_ingredients is null then
    v_ingredients := nullif(
      btrim(v_product #>> '{product_details,sourceFullInci}'),
      ''
    );
  end if;

  v_product :=
    v_product
    - array[
        'name',
        'tagline',
        'collection',
        'blurb',
        'description',
        'how_to_use',
        'position',
        'action_name',
        'routine_number',
        'subtitle',
        'descriptor',
        'featured_rank',
        'product_details',
        'routine_step',
        'routine_order',
        'routine_group_label',
        'routine_display_label',
        'legacy_routine_group_label',
        'legacy_routine_display_label'
      ]::text[]
    || jsonb_build_object(
      'display_name',
        coalesce(
          nullif(v_product ->> 'display_name', ''),
          nullif(v_product ->> 'name', '')
        ),
      'formal_title',
        coalesce(
          nullif(v_product ->> 'formal_title', ''),
          nullif(v_product ->> 'name', '')
        ),
      'card_tagline',
        coalesce(
          nullif(v_product ->> 'card_tagline', ''),
          nullif(v_product ->> 'tagline', '')
        ),
      'editorial_description',
        coalesce(
          nullif(v_product ->> 'editorial_description', ''),
          nullif(v_product ->> 'description', '')
        ),
      'editorial_how_to_use',
        coalesce(
          nullif(v_product ->> 'editorial_how_to_use', ''),
          nullif(v_product ->> 'how_to_use', '')
        ),
      'sort_order',
        coalesce(v_product -> 'sort_order', v_product -> 'position'),
      'ingredients',
        to_jsonb(v_ingredients)
    );

  select coalesce(
    jsonb_agg(
      item
      - 'position'
      || jsonb_build_object(
        'sort_order',
        coalesce(item -> 'sort_order', item -> 'position')
      )
      order by coalesce(
        (item ->> 'sort_order')::integer,
        (item ->> 'position')::integer
      ),
      item ->> 'variant_key'
    ),
    '[]'::jsonb
  )
  into v_variants
  from jsonb_array_elements(p_document -> 'variants') item;

  select coalesce(
    jsonb_agg(
      item
      - 'media_kind'
      || jsonb_build_object(
        'media_type',
        coalesce(
          nullif(item ->> 'media_type', ''),
          case
            when item ->> 'media_kind' = 'video' then 'video'
            else 'image'
          end
        )
      )
      order by item ->> 'role', (item ->> 'sort_order')::integer
    ),
    '[]'::jsonb
  )
  into v_media
  from jsonb_array_elements(p_document -> 'media') item;

  return jsonb_build_object(
    'schemaVersion', 2,
    'productId', p_document -> 'productId',
    'product', v_product,
    'productPdpContent', p_document -> 'productPdpContent',
    'variants', v_variants,
    'media', v_media,
    'relationships', p_document -> 'relationships'
  );
end;
$function$;
revoke all on function private.catalog_editor_upgrade_v1_to_v2(jsonb) from public, anon, authenticated, service_role;
grant execute on function private.catalog_editor_upgrade_v1_to_v2(jsonb) to "postgres";
CREATE OR REPLACE FUNCTION private.catalog_editor_upgrade_v2_to_v3(p_document jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_product_id uuid;
  v_current jsonb;
  v_product jsonb;
  v_pdp jsonb;
  v_variants jsonb;
  v_media jsonb;
  v_relationships jsonb;
begin
  if jsonb_typeof(p_document) <> 'object'
     or p_document ->> 'schemaVersion' <> '2'
     or (p_document ->> 'productId') is null
  then
    raise exception 'invalid catalog editor V2 document'
      using errcode = '22023';
  end if;

  v_product_id := (p_document ->> 'productId')::uuid;
  v_current := private.catalog_editor_document_v3(v_product_id);
  if v_current is null then
    raise exception 'catalog product not found'
      using errcode = 'P0002';
  end if;

  v_product := (v_current -> 'product') || (p_document -> 'product');
  v_product := v_product || jsonb_build_object(
    'id', v_product_id,
    'created_at', v_current #> '{product,created_at}',
    'published_at', v_current #> '{product,published_at}',
    'updated_at', v_current #> '{product,updated_at}'
  );

  if coalesce(jsonb_typeof(p_document -> 'productPdpContent'), 'null') = 'null'
  then
    v_pdp := 'null'::jsonb;
  else
    v_pdp := coalesce(v_current -> 'productPdpContent', '{}'::jsonb)
      || (p_document -> 'productPdpContent')
      || jsonb_build_object(
        'product_id', v_product_id,
        'created_at', coalesce(
          v_current #> '{productPdpContent,created_at}',
          to_jsonb(clock_timestamp())
        ),
        'updated_at', coalesce(
          v_current #> '{productPdpContent,updated_at}',
          to_jsonb(clock_timestamp())
        )
      );
  end if;

  select coalesce(jsonb_agg(
    coalesce((
      select to_jsonb(v)
      from public.product_variants v
      where v.id = (item ->> 'id')::uuid
        and v.product_id = v_product_id
    ), '{}'::jsonb)
    || item
    || jsonb_build_object(
      'product_id', v_product_id,
      'updated_at', coalesce((
        select to_jsonb(v.updated_at)
        from public.product_variants v
        where v.id = (item ->> 'id')::uuid
      ), to_jsonb(clock_timestamp())),
      'archived_at', null
    )
    order by ordinality
  ), '[]'::jsonb)
  into v_variants
  from jsonb_array_elements(p_document -> 'variants')
    with ordinality as entries(item, ordinality);

  select coalesce(jsonb_agg(
    coalesce((
      select to_jsonb(m)
      from public.product_media m
      where m.id = (item ->> 'id')::uuid
        and m.product_id = v_product_id
    ), '{}'::jsonb)
    || item
    || jsonb_build_object(
      'product_id', v_product_id,
      'created_at', coalesce((
        select to_jsonb(m.created_at)
        from public.product_media m
        where m.id = (item ->> 'id')::uuid
      ), to_jsonb(clock_timestamp())),
      'updated_at', coalesce((
        select to_jsonb(m.updated_at)
        from public.product_media m
        where m.id = (item ->> 'id')::uuid
      ), to_jsonb(clock_timestamp())),
      'archived_at', null
    )
    order by ordinality
  ), '[]'::jsonb)
  into v_media
  from jsonb_array_elements(p_document -> 'media')
    with ordinality as entries(item, ordinality);

  select coalesce(jsonb_agg(
    coalesce((
      select to_jsonb(r)
      from public.product_relationships r
      where r.product_id = v_product_id
        and r.related_product_id = (item ->> 'related_product_id')::uuid
        and r.relationship_type = item ->> 'relationship_type'
    ), '{}'::jsonb)
    || item
    || jsonb_build_object(
      'product_id', v_product_id,
      'created_at', coalesce((
        select to_jsonb(r.created_at)
        from public.product_relationships r
        where r.product_id = v_product_id
          and r.related_product_id = (item ->> 'related_product_id')::uuid
          and r.relationship_type = item ->> 'relationship_type'
      ), to_jsonb(clock_timestamp())),
      'archived_at', null
    )
    order by ordinality
  ), '[]'::jsonb)
  into v_relationships
  from jsonb_array_elements(p_document -> 'relationships')
    with ordinality as entries(item, ordinality);

  return jsonb_build_object(
    'schemaVersion', 3,
    'productId', v_product_id,
    'product', v_product,
    'productPdpContent', v_pdp,
    'variants', v_variants,
    'media', v_media,
    'relationships', v_relationships,
    'productSource', v_current -> 'productSource'
  );
end;
$function$;
revoke all on function private.catalog_editor_upgrade_v2_to_v3(jsonb) from public, anon, authenticated, service_role;
grant execute on function private.catalog_editor_upgrade_v2_to_v3(jsonb) to "postgres";
CREATE OR REPLACE FUNCTION private.catalog_editor_upgrade_v3_to_v4(p_document jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_product_id uuid;
  v_current jsonb;
  v_product jsonb;
  v_step_name text;
  v_routine_group text;
begin
  if jsonb_typeof(p_document) <> 'object'
     or p_document ->> 'schemaVersion' <> '3'
     or (p_document ->> 'productId') is null
     or jsonb_typeof(p_document -> 'product') <> 'object'
  then
    raise exception 'invalid catalog editor V3 document'
      using errcode = '22023';
  end if;

  v_product_id := (p_document ->> 'productId')::uuid;
  v_current := private.catalog_editor_document_v4(v_product_id);
  if v_current is null then
    raise exception 'catalog product not found'
      using errcode = 'P0002';
  end if;

  v_step_name := upper(coalesce(
    nullif(btrim(p_document #>> '{product,system_step_name}'), ''),
    nullif(btrim(p_document #>> '{product,routine_step_name}'), ''),
    case
      when upper(p_document #>> '{product,display_name}') in (
        'CLEANSE',
        'REFINE',
        'TREAT',
        'FRAME',
        'SEAL',
        'PROTECT',
        'LIFT'
      )
      then p_document #>> '{product,display_name}'
    end,
    v_current #>> '{product,system_step_name}'
  ));

  select s.routine_group
  into v_routine_group
  from public.system_steps s
  where s.name = v_step_name;

  v_product :=
    (v_current -> 'product')
    || (
      (p_document -> 'product')
      - array[
          'formal_title',
          'card_tagline',
          'routine_step_number',
          'routine_step_name'
        ]::text[]
    )
    || jsonb_build_object(
      'id', v_product_id,
      'slug', v_current #> '{product,slug}',
      'currency', v_current #> '{product,currency}',
      'created_at', v_current #> '{product,created_at}',
      'published_at', v_current #> '{product,published_at}',
      'updated_at', v_current #> '{product,updated_at}',
      'system_step_name', to_jsonb(v_step_name),
      'routine_group', to_jsonb(coalesce(
        v_routine_group,
        v_current #>> '{product,routine_group}'
      ))
    );

  return jsonb_build_object(
    'schemaVersion', 4,
    'productId', v_product_id,
    'product', v_product,
    'productPdpContent', p_document -> 'productPdpContent',
    'variants', p_document -> 'variants',
    'media', p_document -> 'media',
    'relationships', p_document -> 'relationships',
    'productSource', coalesce(
      p_document -> 'productSource',
      v_current -> 'productSource'
    )
  );
end;
$function$;
revoke all on function private.catalog_editor_upgrade_v3_to_v4(jsonb) from public, anon, authenticated, service_role;
grant execute on function private.catalog_editor_upgrade_v3_to_v4(jsonb) to "postgres";
CREATE OR REPLACE FUNCTION private.enforce_core_routine_editorial_product()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.role = 'core_routine_editorial'
    and not exists (
      select 1
      from public.products p
      where p.id = new.product_id
        and p.routine_group = 'core'
    )
  then
    raise exception using
      errcode = '23514',
      message = 'core_routine_editorial media requires a Core product';
  end if;

  return new;
end;
$function$;
revoke all on function private.enforce_core_routine_editorial_product() from public, anon, authenticated, service_role;
grant execute on function private.enforce_core_routine_editorial_product() to "postgres";
CREATE OR REPLACE FUNCTION private.enforce_product_family_invariants()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_family_id uuid;
  v_family_ids uuid[];
begin
  if tg_table_name = 'product_families' then
    v_family_ids := array[coalesce(new.id, old.id)];
  elsif tg_table_name = 'product_family_memberships' then
    v_family_ids := case tg_op
      when 'INSERT' then array[new.family_id]
      when 'DELETE' then array[old.family_id]
      else array[old.family_id, new.family_id]
    end;
  elsif tg_table_name = 'products' then
    select coalesce(array_agg(membership.family_id), array[]::uuid[])
    into v_family_ids
    from public.product_family_memberships membership
    where membership.product_id = coalesce(new.id, old.id);
  else
    return null;
  end if;

  for v_family_id in
    select distinct family_id
    from unnest(v_family_ids) as family_id
    where family_id is not null
  loop
    if not exists (
      select 1 from public.product_families where id = v_family_id
    ) then
      continue;
    end if;

    if (
      select count(*) filter (where membership.is_entry)
      from public.product_family_memberships membership
      where membership.family_id = v_family_id
    ) <> 1 then
      raise exception 'Product Family requires exactly one entry Product'
        using errcode = '23514';
    end if;

    if exists (
      select 1
      from public.product_family_memberships membership
      join public.product_families family on family.id = membership.family_id
      join public.products product on product.id = membership.product_id
      where membership.family_id = v_family_id
        and product.system_step_name is distinct from family.system_step_name
    ) then
      raise exception 'Product Family members must share one System Step'
        using errcode = '23514';
    end if;
  end loop;

  return null;
end;
$function$;
revoke all on function private.enforce_product_family_invariants() from public, anon, authenticated, service_role;
grant execute on function private.enforce_product_family_invariants() to "postgres";
CREATE OR REPLACE FUNCTION private.enforce_replaced_product_archival()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.catalog_status = 'active'
     and old.catalog_status is distinct from new.catalog_status
     and exists (
       select 1
       from public.product_slug_routes route
       where route.source_product_id = new.id
         and route.route_kind = 'replacement'
     )
  then
    raise exception 'A replaced Product must remain Archived'
      using errcode = '23514';
  end if;

  return new;
end;
$function$;
revoke all on function private.enforce_replaced_product_archival() from public, anon, authenticated, service_role;
grant execute on function private.enforce_replaced_product_archival() to "postgres";
CREATE OR REPLACE FUNCTION private.forbid_product_slug_route_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  raise exception 'product_slug_routes is append-only'
    using errcode = '55000';
end;
$function$;
revoke all on function private.forbid_product_slug_route_delete() from public, anon, authenticated, service_role;
grant execute on function private.forbid_product_slug_route_delete() to "postgres";
CREATE OR REPLACE FUNCTION private.reject_catalog_history_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  raise exception '% is append-only', tg_table_name
    using errcode = '55000';
end;
$function$;
CREATE OR REPLACE FUNCTION private.sync_product_slug_route()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_changed integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('mei-pelle-product-slug-routes', 0)
  );

  if tg_op = 'INSERT' then
    insert into public.product_slug_routes (
      source_slug,
      source_product_id,
      target_product_id,
      route_kind
    ) values (
      new.slug,
      new.id,
      new.id,
      'canonical'
    );
    return new;
  end if;

  update public.product_slug_routes
  set route_kind = 'rename'
  where source_slug = old.slug
    and source_product_id = old.id
    and target_product_id = old.id
    and route_kind = 'canonical';
  get diagnostics v_changed = row_count;
  if v_changed <> 1 then
    raise exception 'Product is missing its canonical slug route'
      using errcode = '23514';
  end if;

  insert into public.product_slug_routes (
    source_slug,
    source_product_id,
    target_product_id,
    route_kind
  ) values (
    new.slug,
    new.id,
    new.id,
    'canonical'
  );

  return new;
end;
$function$;
revoke all on function private.sync_product_slug_route() from public, anon, authenticated, service_role;
grant execute on function private.sync_product_slug_route() to "postgres";
CREATE OR REPLACE FUNCTION private.validate_product_slug_route_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_source public.products%rowtype;
  v_target public.products%rowtype;
begin
  if tg_op = 'UPDATE' and (
    new.source_slug <> old.source_slug
    or new.source_product_id <> old.source_product_id
    or new.created_at <> old.created_at
  ) then
    raise exception 'Product slug route provenance is immutable'
      using errcode = '55000';
  end if;

  if tg_op = 'UPDATE'
     and old.route_kind = 'replacement'
     and new.route_kind <> 'replacement'
  then
    raise exception 'Product replacement routes cannot be restored or renamed'
      using errcode = '55000';
  end if;

  select * into v_source
  from public.products
  where id = new.source_product_id;
  if not found then
    raise exception 'Product slug route source Product does not exist'
      using errcode = '23503';
  end if;

  select * into v_target
  from public.products
  where id = new.target_product_id;
  if not found then
    raise exception 'Product slug route target Product does not exist'
      using errcode = '23503';
  end if;

  if new.route_kind = 'canonical' and (
    new.source_product_id <> new.target_product_id
    or new.source_slug <> v_source.slug
  ) then
    raise exception 'Canonical Product slug route does not match its Product'
      using errcode = '23514';
  end if;

  if new.route_kind = 'rename' and (
    new.source_product_id <> new.target_product_id
    or new.source_slug = v_source.slug
  ) then
    raise exception 'Historical Product rename route is not historical'
      using errcode = '23514';
  end if;

  if new.route_kind = 'replacement' and (
    new.source_product_id = new.target_product_id
    or v_source.catalog_status <> 'archived'
    or v_target.catalog_status <> 'active'
  ) then
    raise exception
      'Product replacement requires an Archived source and Active target'
      using errcode = '23514';
  end if;

  if new.route_kind <> 'canonical' and exists (
    select 1
    from public.products p
    where p.slug = new.source_slug
      and p.catalog_status = 'active'
  ) then
    raise exception 'Historical Product slug collides with an active canonical slug'
      using errcode = '23514';
  end if;

  return new;
end;
$function$;
revoke all on function private.validate_product_slug_route_row() from public, anon, authenticated, service_role;
grant execute on function private.validate_product_slug_route_row() to "postgres";
CREATE OR REPLACE FUNCTION public.bootstrap_catalog_admin_membership(p_user_id uuid, p_role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_existing public.admin_memberships%rowtype;
  v_membership public.admin_memberships%rowtype;
  v_action text;
begin
  if p_role not in ('admin', 'catalog_publisher', 'catalog_editor') then
    raise exception 'invalid admin role'
      using errcode = '22023';
  end if;

  perform 1
  from auth.users
  where id = p_user_id
    and email is not null
    and email_confirmed_at is not null
  for update;

  if not found then
    raise exception 'verified admin user not found'
      using errcode = 'P0002';
  end if;

  select *
  into v_existing
  from public.admin_memberships
  where user_id = p_user_id
  for update;

  v_action := case
    when found then 'membership.updated'
    else 'membership.created'
  end;

  insert into public.admin_memberships (
    user_id,
    role,
    active,
    created_by
  )
  values (
    p_user_id,
    p_role,
    true,
    p_user_id
  )
  on conflict (user_id) do update
  set
    role = excluded.role,
    active = true
  returning * into v_membership;

  insert into public.catalog_editor_audit_log (
    action,
    actor_id,
    metadata
  )
  values (
    v_action,
    p_user_id,
    jsonb_build_object(
      'role', p_role,
      'previousRole', v_existing.role,
      'previousActive', v_existing.active
    )
  );

  return jsonb_build_object(
    'ok', true,
    'userId', v_membership.user_id,
    'role', v_membership.role,
    'action', case
      when v_action = 'membership.created' then 'created'
      else 'updated'
    end
  );
end;
$function$;
revoke all on function bootstrap_catalog_admin_membership(uuid,text) from public, anon, authenticated, service_role;
grant execute on function bootstrap_catalog_admin_membership(uuid,text) to "postgres";
grant execute on function bootstrap_catalog_admin_membership(uuid,text) to "service_role";
CREATE OR REPLACE FUNCTION public.create_catalog_product_draft(p_product_id uuid, p_actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_existing public.product_content_drafts%rowtype;
  v_created public.product_content_drafts%rowtype;
  v_document jsonb;
  v_base_revision integer;
begin
  perform 1 from public.products where id = p_product_id for update;
  if not found then
    raise exception 'catalog product not found' using errcode = 'P0002';
  end if;

  select * into v_existing
  from public.product_content_drafts
  where product_id = p_product_id and status in ('draft', 'ready')
  for update;
  if found then
    return jsonb_build_object('created', false, 'draft', to_jsonb(v_existing));
  end if;

  v_document := private.catalog_editor_document_v4(p_product_id);
  select coalesce(max(revision_number), 0) into v_base_revision
  from public.catalog_product_revisions where product_id = p_product_id;

  insert into public.product_content_drafts (
    product_id, schema_version, base_revision, version, document, status,
    validation_errors, created_by, updated_by
  ) values (
    p_product_id, 4, v_base_revision, 1, v_document, 'draft', '[]'::jsonb,
    p_actor_id, p_actor_id
  ) returning * into v_created;

  insert into public.catalog_editor_audit_log (
    action, actor_id, product_id, draft_id, metadata
  ) values (
    'draft.created', p_actor_id, p_product_id, v_created.id,
    jsonb_build_object('baseRevision', v_base_revision, 'schemaVersion', 4)
  );

  return jsonb_build_object('created', true, 'draft', to_jsonb(v_created));
end;
$function$;
revoke all on function create_catalog_product_draft(uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function create_catalog_product_draft(uuid,uuid) to "postgres";
grant execute on function create_catalog_product_draft(uuid,uuid) to "service_role";
CREATE OR REPLACE FUNCTION public.get_catalog_editor_document(p_product_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.catalog_editor_document_v4(p_product_id);
$function$;
revoke all on function get_catalog_editor_document(uuid) from public, anon, authenticated, service_role;
grant execute on function get_catalog_editor_document(uuid) to "postgres";
grant execute on function get_catalog_editor_document(uuid) to "service_role";
CREATE OR REPLACE FUNCTION public.publish_catalog_product_draft(p_draft_id uuid, p_expected_version bigint, p_actor_id uuid, p_actor_role text, p_change_audit jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_product_id uuid;
  v_document jsonb;
  v_current_family_id uuid;
  v_requested_family_id uuid;
  v_lock_family_id uuid;
  v_affected_product_ids uuid[];
begin
  select draft.product_id, draft.document
  into v_product_id, v_document
  from public.product_content_drafts draft
  where draft.id = p_draft_id;

  if v_product_id is null then
    return public.publish_catalog_product_draft_without_family_lock_order(
      p_draft_id,
      p_expected_version,
      p_actor_id,
      p_actor_role,
      p_change_audit
    );
  end if;

  select membership.family_id into v_current_family_id
  from public.product_family_memberships membership
  where membership.product_id = v_product_id;

  if jsonb_typeof(v_document #> '{productFamily,family}') = 'object'
     and coalesce(v_document #>> '{productFamily,family,id}', '')
       ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    v_requested_family_id :=
      (v_document #>> '{productFamily,family,id}')::uuid;
  end if;

  v_lock_family_id := coalesce(
    v_current_family_id,
    v_requested_family_id
  );
  if v_lock_family_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'helix-product-family:' || v_lock_family_id::text,
        0
      )
    );

    perform 1
    from public.product_families family
    where family.id = v_lock_family_id
    for update;

    select coalesce(
      array_agg(affected.product_id order by affected.product_id),
      array[v_product_id]
    )
    into v_affected_product_ids
    from (
      select v_product_id as product_id
      union
      select membership.product_id
      from public.product_family_memberships membership
      where membership.family_id = v_current_family_id
      union
      select (member ->> 'product_id')::uuid
      from jsonb_array_elements(
        case
          when jsonb_typeof(
            v_document #> '{productFamily,memberships}'
          ) = 'array'
            then v_document #> '{productFamily,memberships}'
          else '[]'::jsonb
        end
      ) member
      where coalesce(member ->> 'product_id', '')
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ) affected;

    perform 1
    from public.products product
    where product.id = any(v_affected_product_ids)
    order by product.id
    for update;
  end if;

  return public.publish_catalog_product_draft_without_family_lock_order(
    p_draft_id,
    p_expected_version,
    p_actor_id,
    p_actor_role,
    p_change_audit
  );
end;
$function$;
revoke all on function publish_catalog_product_draft(uuid,bigint,uuid,text,jsonb) from public, anon, authenticated, service_role;
grant execute on function publish_catalog_product_draft(uuid,bigint,uuid,text,jsonb) to "postgres";
grant execute on function publish_catalog_product_draft(uuid,bigint,uuid,text,jsonb) to "service_role";
CREATE OR REPLACE FUNCTION public.publish_catalog_product_draft_v4(p_draft_id uuid, p_expected_version bigint, p_actor_id uuid, p_actor_role text, p_change_audit jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_draft public.product_content_drafts%rowtype;
  v_requested_family jsonb;
  v_current_family_id uuid;
  v_requested_family_id uuid;
  v_lock_family_id uuid;
  v_affected_product_ids uuid[];
  v_latest_revision integer;
  v_family_before jsonb;
  v_family_changed boolean;
  v_result jsonb;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_draft
  from public.product_content_drafts
  where id = p_draft_id
  for update;
  if not found then
    raise exception 'catalog draft not found' using errcode = 'P0002';
  end if;

  if v_draft.status <> 'ready'
     or v_draft.version <> p_expected_version
  then
    return public.publish_catalog_product_draft_v4_without_family_concurrency(
      p_draft_id,
      p_expected_version,
      p_actor_id,
      p_actor_role,
      p_change_audit
    );
  end if;

  if not (v_draft.document ? 'productFamily')
     or coalesce(
       jsonb_typeof(v_draft.document -> 'productFamily'),
       'null'
     ) not in ('object', 'null')
  then
    return public.publish_catalog_product_draft_v4_without_family_concurrency(
      p_draft_id,
      p_expected_version,
      p_actor_id,
      p_actor_role,
      p_change_audit
    );
  end if;

  v_requested_family := v_draft.document -> 'productFamily';

  select membership.family_id into v_current_family_id
  from public.product_family_memberships membership
  where membership.product_id = v_draft.product_id;

  if jsonb_typeof(v_requested_family) = 'object'
     and jsonb_typeof(v_requested_family -> 'family') = 'object'
  then
    begin
      v_requested_family_id :=
        (v_requested_family #>> '{family,id}')::uuid;
    exception
      when invalid_text_representation then
        return public.publish_catalog_product_draft_v4_without_family_concurrency(
          p_draft_id,
          p_expected_version,
          p_actor_id,
          p_actor_role,
          p_change_audit
        );
    end;
  end if;

  if v_current_family_id is not null
     and v_requested_family_id is not null
     and v_current_family_id <> v_requested_family_id
  then
    return public.publish_catalog_product_draft_v4_without_family_concurrency(
      p_draft_id,
      p_expected_version,
      p_actor_id,
      p_actor_role,
      p_change_audit
    );
  end if;

  v_lock_family_id := coalesce(
    v_current_family_id,
    v_requested_family_id
  );
  if v_lock_family_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'helix-product-family:' || v_lock_family_id::text,
        0
      )
    );

    perform 1
    from public.product_families family
    where family.id = v_lock_family_id
    for update;
  end if;

  select coalesce(
    array_agg(affected.product_id order by affected.product_id),
    array[v_draft.product_id]
  )
  into v_affected_product_ids
  from (
    select v_draft.product_id as product_id
    union
    select membership.product_id
    from public.product_family_memberships membership
    where membership.family_id = v_current_family_id
    union
    select (member ->> 'product_id')::uuid
    from jsonb_array_elements(
      case
        when jsonb_typeof(v_requested_family -> 'memberships') = 'array'
          then v_requested_family -> 'memberships'
        else '[]'::jsonb
      end
    ) member
    where (member ->> 'product_id') is not null
  ) affected;

  perform 1
  from public.products product
  where product.id = any(v_affected_product_ids)
  order by product.id
  for update;

  select coalesce(max(revision.revision_number), 0)
  into v_latest_revision
  from public.catalog_product_revisions revision
  where revision.product_id = v_draft.product_id;
  if v_draft.base_revision <> v_latest_revision then
    return jsonb_build_object(
      'ok', false,
      'code', 'revision_conflict',
      'baseRevision', v_draft.base_revision,
      'latestRevision', v_latest_revision
    );
  end if;

  v_family_before := private.catalog_editor_product_family(
    v_draft.product_id
  );
  v_family_changed := v_requested_family is distinct from v_family_before;

  v_result := public.publish_catalog_product_draft_v4_without_family_concurrency(
    p_draft_id,
    p_expected_version,
    p_actor_id,
    p_actor_role,
    p_change_audit
  );

  if v_result ->> 'ok' = 'true' and v_family_changed then
    with sibling_revisions as (
      insert into public.catalog_product_revisions (
        product_id,
        revision_number,
        schema_version,
        document,
        source_draft_id,
        published_by,
        published_at
      )
      select
        product.id,
        coalesce((
          select max(revision.revision_number)
          from public.catalog_product_revisions revision
          where revision.product_id = product.id
        ), 0) + 1,
        4,
        private.catalog_editor_document_v4(product.id),
        null,
        p_actor_id,
        v_now
      from public.products product
      where product.id = any(v_affected_product_ids)
        and product.id <> v_draft.product_id
      returning id, product_id, revision_number
    )
    insert into public.catalog_editor_audit_log (
      action,
      actor_id,
      product_id,
      draft_id,
      revision_id,
      metadata
    )
    select
      'family.published',
      p_actor_id,
      sibling.product_id,
      null,
      sibling.id,
      jsonb_build_object(
        'source', 'shared-family-publication',
        'originDraftId', p_draft_id,
        'originProductId', v_draft.product_id,
        'familyId', v_lock_family_id,
        'revision', sibling.revision_number,
        'changedTables', jsonb_build_object(
          'product_families', true,
          'product_family_memberships', true
        )
      )
    from sibling_revisions sibling;
  end if;

  return v_result;
end;
$function$;
revoke all on function publish_catalog_product_draft_v4(uuid,bigint,uuid,text,jsonb) from public, anon, authenticated, service_role;
grant execute on function publish_catalog_product_draft_v4(uuid,bigint,uuid,text,jsonb) to "postgres";
CREATE OR REPLACE FUNCTION public.publish_catalog_product_draft_v4_without_family(p_draft_id uuid, p_expected_version bigint, p_actor_id uuid, p_actor_role text, p_change_audit jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_draft public.product_content_drafts%rowtype;
  v_document jsonb;
  v_before jsonb;
  v_after jsonb;
  v_product public.products%rowtype;
  v_pdp public.product_pdp_content%rowtype;
  v_source public.product_sources%rowtype;
  v_latest_revision integer;
  v_revision public.catalog_product_revisions%rowtype;
  v_now timestamptz := clock_timestamp();
  v_role text;
  v_products_changed boolean;
  v_pdp_changed boolean;
  v_variants_changed boolean;
  v_media_changed boolean;
  v_relationships_changed boolean;
  v_source_changed boolean;
begin
  select role into v_role
  from public.admin_memberships
  where user_id = p_actor_id and active;
  if v_role is null or v_role <> p_actor_role
     or v_role not in ('catalog_publisher', 'admin')
  then
    raise exception 'catalog actor cannot publish' using errcode = '42501';
  end if;
  if jsonb_typeof(p_change_audit) <> 'array' then
    raise exception 'catalog change audit must be an array'
      using errcode = '22023';
  end if;

  select * into v_draft
  from public.product_content_drafts where id = p_draft_id for update;
  if not found then
    raise exception 'catalog draft not found' using errcode = 'P0002';
  end if;
  if v_draft.status <> 'ready' then
    return jsonb_build_object(
      'ok', false, 'code', 'draft_not_ready',
      'stored', jsonb_build_object(
        'version', v_draft.version, 'status', v_draft.status,
        'updatedAt', v_draft.updated_at, 'updatedBy', v_draft.updated_by
      )
    );
  end if;
  if v_draft.version <> p_expected_version then
    return jsonb_build_object(
      'ok', false, 'code', 'version_conflict',
      'stored', jsonb_build_object(
        'version', v_draft.version, 'status', v_draft.status,
        'updatedAt', v_draft.updated_at, 'updatedBy', v_draft.updated_by
      )
    );
  end if;

  perform 1 from public.products where id = v_draft.product_id for update;
  if not found then
    raise exception 'catalog product not found' using errcode = 'P0002';
  end if;
  select coalesce(max(revision_number), 0) into v_latest_revision
  from public.catalog_product_revisions
  where product_id = v_draft.product_id;
  if v_draft.base_revision <> v_latest_revision then
    return jsonb_build_object(
      'ok', false, 'code', 'revision_conflict',
      'baseRevision', v_draft.base_revision,
      'latestRevision', v_latest_revision
    );
  end if;

  v_document := v_draft.document;
  if v_draft.schema_version <> 4
     or v_document ->> 'schemaVersion' <> '4'
     or v_document ->> 'productId' <> v_draft.product_id::text
     or jsonb_typeof(v_document -> 'product') <> 'object'
     or (v_document -> 'product') ?| array[
       'formal_title',
       'card_tagline',
       'routine_step_number',
       'routine_step_name'
     ]
     or coalesce(
       jsonb_typeof(v_document -> 'productPdpContent'),
       'null'
     ) not in ('object', 'null')
     or jsonb_typeof(v_document -> 'variants') <> 'array'
     or jsonb_typeof(v_document -> 'media') <> 'array'
     or jsonb_typeof(v_document -> 'relationships') <> 'array'
     or coalesce(
       jsonb_typeof(v_document -> 'productSource'),
       'null'
     ) not in ('object', 'null')
  then
    raise exception 'invalid catalog editor V4 document' using errcode = '22023';
  end if;

  v_before := private.catalog_editor_document_v4(v_draft.product_id);
  if p_actor_role <> 'admin' and (
    (v_document -> 'product') - array[
      'display_name', 'product_type', 'editorial_description',
      'editorial_how_to_use', 'benefits', 'made_for', 'good_for', 'badge',
      'formula_notes', 'search_keywords', 'seo_title', 'seo_description'
    ]::text[]
    is distinct from
    (v_before -> 'product') - array[
      'display_name', 'product_type', 'editorial_description',
      'editorial_how_to_use', 'benefits', 'made_for', 'good_for', 'badge',
      'formula_notes', 'search_keywords', 'seo_title', 'seo_description'
    ]::text[]
    or v_document -> 'variants' is distinct from v_before -> 'variants'
    or v_document -> 'productSource'
      is distinct from v_before -> 'productSource'
  ) then
    raise exception 'catalog actor cannot publish admin-only fields'
      using errcode = '42501';
  end if;

  select * into v_product
  from jsonb_populate_record(null::public.products, v_document -> 'product');
  if v_product.id <> v_draft.product_id
     or v_product.slug <> v_before #>> '{product,slug}'
     or v_product.currency <> 'USD'
     or nullif(btrim(v_product.display_name), '') is null
     or nullif(btrim(v_product.product_type), '') is null
     or nullif(btrim(v_product.editorial_description), '') is null
     or nullif(btrim(v_product.editorial_how_to_use), '') is null
     or v_product.sort_order < 0
     or v_product.routine_sort < 0
     or v_product.routine_group not in ('core', 'beyond_core')
     or v_product.catalog_status not in ('draft', 'active', 'archived')
     or v_product.status not in ('available', 'coming_soon', 'sold_out', 'waitlist')
     or (
       v_product.status = 'waitlist'
       and jsonb_array_length(v_document -> 'variants') <> 0
     )
     or (
       v_product.seo_title is not null
       and char_length(v_product.seo_title) > 70
     )
     or (
       v_product.seo_description is not null
       and char_length(v_product.seo_description) > 400
     )
  then
    raise exception 'invalid canonical product fields' using errcode = '22023';
  end if;

  if (
    v_product.catalog_status = 'active'
    and v_product.system_step_name is null
  ) or (
    v_product.system_step_name is not null
    and not exists (
      select 1
      from public.system_steps s
      where s.name = v_product.system_step_name
        and s.routine_group = v_product.routine_group
    )
  ) then
    raise exception 'invalid canonical System Step contract'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(v_document -> 'variants') item
    where item ->> 'product_id' <> v_draft.product_id::text
       or item ->> 'archived_at' is not null
  ) or exists (
    select 1 from jsonb_array_elements(v_document -> 'media') item
    where item ->> 'product_id' <> v_draft.product_id::text
       or item ->> 'archived_at' is not null
  ) or exists (
    select 1 from jsonb_array_elements(v_document -> 'relationships') item
    where item ->> 'product_id' <> v_draft.product_id::text
       or item ->> 'archived_at' is not null
  ) or exists (
    select 1 from jsonb_array_elements(v_document -> 'media') item
    where item ->> 'variant_id' is not null
      and not exists (
        select 1 from jsonb_array_elements(v_document -> 'variants') variant
        where variant ->> 'id' = item ->> 'variant_id'
      )
  ) then
    raise exception 'child row product identity is invalid'
      using errcode = '23503';
  end if;

  if exists (
    select 1 from jsonb_array_elements(v_document -> 'variants') item
    group by item ->> 'variant_key' having count(*) > 1
  ) or exists (
    select 1 from jsonb_array_elements(v_document -> 'media') item
    group by item ->> 'role', item ->> 'sort_order' having count(*) > 1
  ) or exists (
    select 1 from jsonb_array_elements(v_document -> 'relationships') item
    group by item ->> 'related_product_id', item ->> 'relationship_type'
    having count(*) > 1
  ) then
    raise exception 'duplicate catalog child identity' using errcode = '23505';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_document -> 'variants') item
    join public.product_variants existing
      on existing.id = (item ->> 'id')::uuid
    where existing.product_id <> v_draft.product_id
  ) or exists (
    select 1
    from jsonb_array_elements(v_document -> 'media') item
    join public.product_media existing
      on existing.id = (item ->> 'id')::uuid
    where existing.product_id <> v_draft.product_id
  ) then
    raise exception 'child row belongs to another product'
      using errcode = '23503';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_document -> 'relationships') item
    where (item ->> 'related_product_id')::uuid = v_draft.product_id
       or item ->> 'relationship_type' not in (
         'complete_the_routine', 'related', 'routine_next'
       )
       or (item ->> 'sort_order')::integer < 0
       or not exists (
         select 1 from public.products p
         where p.id = (item ->> 'related_product_id')::uuid
       )
  ) then
    raise exception 'invalid product relationship' using errcode = '22023';
  end if;

  update public.products p set
    display_name = v_product.display_name,
    product_type = v_product.product_type,
    catalog_status = v_product.catalog_status,
    badge = v_product.badge,
    sort_order = v_product.sort_order,
    editorial_description = v_product.editorial_description,
    benefits = v_product.benefits,
    editorial_how_to_use = v_product.editorial_how_to_use,
    formula_notes = v_product.formula_notes,
    swatch_from = v_product.swatch_from,
    swatch_to = v_product.swatch_to,
    status = v_product.status,
    made_for = v_product.made_for,
    good_for = v_product.good_for,
    texture = v_product.texture,
    key_ingredients = v_product.key_ingredients,
    ingredients = v_product.ingredients,
    cautions = v_product.cautions,
    finish = v_product.finish,
    volume = v_product.volume,
    skin_types = v_product.skin_types,
    concerns = v_product.concerns,
    usage_time = v_product.usage_time,
    seo_title = v_product.seo_title,
    seo_description = v_product.seo_description,
    search_keywords = v_product.search_keywords,
    routine_group = v_product.routine_group,
    system_step_name = v_product.system_step_name,
    routine_sort = v_product.routine_sort,
    published_at = v_now
  where p.id = v_draft.product_id
    and (
      to_jsonb(p)
      - array[
          'id', 'slug', 'currency', 'created_at', 'published_at', 'updated_at'
        ]::text[]
    ) is distinct from (
      (v_document -> 'product')
      - array[
          'id', 'slug', 'currency', 'created_at', 'published_at', 'updated_at'
        ]::text[]
    );

  if coalesce(
    jsonb_typeof(v_document -> 'productPdpContent'),
    'null'
  ) = 'null' then
    delete from public.product_pdp_content
    where product_id = v_draft.product_id;
  else
    select * into v_pdp from jsonb_populate_record(
      null::public.product_pdp_content,
      v_document -> 'productPdpContent'
    );
    if v_pdp.product_id <> v_draft.product_id
       or v_pdp.schema_version <> 1
    then
      raise exception 'invalid PDP content identity' using errcode = '22023';
    end if;
    insert into public.product_pdp_content (
      product_id, schema_version, profile_title_tokens, routine_overlay,
      outcome_heading, outcome_labels, how_to_use_steps, application_steps,
      ingredient_cards, ingredient_story, routine_guidance
    ) values (
      v_draft.product_id, v_pdp.schema_version, v_pdp.profile_title_tokens,
      v_pdp.routine_overlay, v_pdp.outcome_heading, v_pdp.outcome_labels,
      v_pdp.how_to_use_steps, v_pdp.application_steps, v_pdp.ingredient_cards,
      v_pdp.ingredient_story, v_pdp.routine_guidance
    ) on conflict (product_id) do update set
      schema_version = excluded.schema_version,
      profile_title_tokens = excluded.profile_title_tokens,
      routine_overlay = excluded.routine_overlay,
      outcome_heading = excluded.outcome_heading,
      outcome_labels = excluded.outcome_labels,
      how_to_use_steps = excluded.how_to_use_steps,
      application_steps = excluded.application_steps,
      ingredient_cards = excluded.ingredient_cards,
      ingredient_story = excluded.ingredient_story,
      routine_guidance = excluded.routine_guidance
    where (
      to_jsonb(product_pdp_content)
      - array['product_id', 'created_at', 'updated_at']::text[]
    ) is distinct from (
      to_jsonb(excluded)
      - array['product_id', 'created_at', 'updated_at']::text[]
    );
  end if;

  update public.product_variants v set
    archived_at = v_now,
    available = false,
    inventory_status = 'unavailable'
  where v.product_id = v_draft.product_id
    and v.archived_at is null
    and not exists (
      select 1 from jsonb_array_elements(v_document -> 'variants') item
      where item ->> 'id' = v.id::text
    );

  insert into public.product_variants (
    id, product_id, variant_key, label, price_cents, sku,
    supplier_variant_id, option_values, compare_at_price_cents, available,
    inventory_status, volume, pack_count, sort_order, archived_at
  )
  select
    x.id, v_draft.product_id, x.variant_key, x.label, x.price_cents, x.sku,
    x.supplier_variant_id, coalesce(x.option_values, '{}'::jsonb),
    x.compare_at_price_cents, x.available, x.inventory_status, x.volume,
    x.pack_count, x.sort_order, null
  from jsonb_to_recordset(v_document -> 'variants') as x(
    id uuid, variant_key text, label text, price_cents integer, sku text,
    supplier_variant_id text, option_values jsonb,
    compare_at_price_cents integer, available boolean,
    inventory_status text, volume text, pack_count integer, sort_order integer
  )
  on conflict (id) do update set
    variant_key = excluded.variant_key,
    label = excluded.label,
    price_cents = excluded.price_cents,
    sku = excluded.sku,
    supplier_variant_id = excluded.supplier_variant_id,
    option_values = excluded.option_values,
    compare_at_price_cents = excluded.compare_at_price_cents,
    available = excluded.available,
    inventory_status = excluded.inventory_status,
    volume = excluded.volume,
    pack_count = excluded.pack_count,
    sort_order = excluded.sort_order,
    archived_at = null
  where (
    to_jsonb(product_variants)
    - array['product_id', 'updated_at']::text[]
  ) is distinct from (
    to_jsonb(excluded)
    - array['product_id', 'updated_at']::text[]
  );

  update public.product_media m set archived_at = v_now
  where m.product_id = v_draft.product_id
    and m.archived_at is null
    and not exists (
      select 1 from jsonb_array_elements(v_document -> 'media') item
      where item ->> 'id' = m.id::text
    );

  insert into public.product_media (
    id, product_id, variant_id, media_type, url, alt, width, height, role,
    sort_order, original_source_url, source_filename, palette_id,
    placeholder_palette, archived_at
  )
  select
    x.id, v_draft.product_id, x.variant_id, x.media_type, x.url, x.alt,
    x.width, x.height, x.role, x.sort_order, x.original_source_url,
    x.source_filename, x.palette_id,
    coalesce(x.placeholder_palette, '{}'::jsonb), null
  from jsonb_to_recordset(v_document -> 'media') as x(
    id uuid, variant_id uuid, media_type text, url text, alt text,
    width integer, height integer, role text, sort_order integer,
    original_source_url text, source_filename text, palette_id text,
    placeholder_palette jsonb
  )
  on conflict (id) do update set
    variant_id = excluded.variant_id,
    media_type = excluded.media_type,
    url = excluded.url,
    alt = excluded.alt,
    width = excluded.width,
    height = excluded.height,
    role = excluded.role,
    sort_order = excluded.sort_order,
    original_source_url = excluded.original_source_url,
    source_filename = excluded.source_filename,
    palette_id = excluded.palette_id,
    placeholder_palette = excluded.placeholder_palette,
    archived_at = null
  where (
    to_jsonb(product_media)
    - array['product_id', 'created_at', 'updated_at']::text[]
  ) is distinct from (
    to_jsonb(excluded)
    - array['product_id', 'created_at', 'updated_at']::text[]
  );

  update public.product_relationships r set archived_at = v_now
  where r.product_id = v_draft.product_id
    and r.archived_at is null
    and not exists (
      select 1 from jsonb_array_elements(v_document -> 'relationships') item
      where item ->> 'related_product_id' = r.related_product_id::text
        and item ->> 'relationship_type' = r.relationship_type
    );

  insert into public.product_relationships (
    product_id, related_product_id, relationship_type, sort_order, archived_at
  )
  select
    v_draft.product_id,
    x.related_product_id,
    x.relationship_type,
    x.sort_order,
    null
  from jsonb_to_recordset(v_document -> 'relationships') as x(
    related_product_id uuid, relationship_type text, sort_order integer
  )
  where x.related_product_id <> v_draft.product_id
    and exists (
      select 1
      from public.products p
      where p.id = x.related_product_id
    )
  on conflict (product_id, related_product_id, relationship_type) do update set
    sort_order = excluded.sort_order,
    archived_at = null
  where row(
    product_relationships.sort_order,
    product_relationships.archived_at
  ) is distinct from row(excluded.sort_order, null::timestamptz);

  if jsonb_typeof(v_document -> 'productSource') = 'object' then
    select * into v_source from jsonb_populate_record(
      null::public.product_sources,
      v_document -> 'productSource'
    );
    if v_source.product_id <> v_draft.product_id then
      raise exception 'invalid product source identity' using errcode = '23503';
    end if;
    update public.product_sources s set
      supplier_title = v_source.supplier_title,
      supplier_url = v_source.supplier_url,
      original_source_price_cents = v_source.original_source_price_cents,
      formulation_version_notes = v_source.formulation_version_notes
    where s.product_id = v_draft.product_id
      and row(
        s.supplier_title, s.supplier_url, s.original_source_price_cents,
        s.formulation_version_notes
      ) is distinct from row(
        v_source.supplier_title, v_source.supplier_url,
        v_source.original_source_price_cents,
        v_source.formulation_version_notes
      );
  end if;

  v_after := private.catalog_editor_document_v4(v_draft.product_id);
  v_products_changed :=
    v_before -> 'product' is distinct from v_after -> 'product';
  v_pdp_changed :=
    v_before -> 'productPdpContent'
      is distinct from v_after -> 'productPdpContent';
  v_variants_changed :=
    v_before -> 'variants' is distinct from v_after -> 'variants';
  v_media_changed :=
    v_before -> 'media' is distinct from v_after -> 'media';
  v_relationships_changed :=
    v_before -> 'relationships' is distinct from v_after -> 'relationships';
  v_source_changed :=
    v_before -> 'productSource' is distinct from v_after -> 'productSource';

  insert into public.catalog_product_revisions (
    product_id, revision_number, schema_version, document, source_draft_id,
    published_by, published_at
  ) values (
    v_draft.product_id, v_latest_revision + 1, 4, v_after, v_draft.id,
    p_actor_id, v_now
  ) returning * into v_revision;

  update public.product_content_drafts set
    schema_version = 4,
    document = v_after,
    status = 'published',
    version = version + 1,
    validation_errors = '[]'::jsonb,
    updated_by = p_actor_id,
    updated_at = v_now,
    published_at = v_now
  where id = v_draft.id
  returning * into v_draft;

  insert into public.catalog_editor_audit_log (
    action, actor_id, product_id, draft_id, revision_id, metadata
  ) values (
    'draft.published', p_actor_id, v_draft.product_id, v_draft.id,
    v_revision.id, jsonb_build_object(
      'revision', v_revision.revision_number,
      'schemaVersion', 4,
      'advancedChanges', p_change_audit,
      'changedTables', jsonb_build_object(
        'products', v_products_changed,
        'product_pdp_content', v_pdp_changed,
        'product_variants', v_variants_changed,
        'product_media', v_media_changed,
        'product_relationships', v_relationships_changed,
        'product_sources', v_source_changed
      )
    )
  );

  return jsonb_build_object(
    'ok', true,
    'draft', to_jsonb(v_draft),
    'revision', to_jsonb(v_revision),
    'changedTables', jsonb_build_object(
      'products', v_products_changed,
      'productPdpContent', v_pdp_changed,
      'variants', v_variants_changed,
      'media', v_media_changed,
      'relationships', v_relationships_changed,
      'productSource', v_source_changed
    )
  );
end;
$function$;
revoke all on function publish_catalog_product_draft_v4_without_family(uuid,bigint,uuid,text,jsonb) from public, anon, authenticated, service_role;
grant execute on function publish_catalog_product_draft_v4_without_family(uuid,bigint,uuid,text,jsonb) to "postgres";
CREATE OR REPLACE FUNCTION public.publish_catalog_product_draft_v4_without_family_concurrency(p_draft_id uuid, p_expected_version bigint, p_actor_id uuid, p_actor_role text, p_change_audit jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_draft public.product_content_drafts%rowtype;
  v_actor_role text;
  v_latest_revision integer;
  v_requested_family jsonb;
  v_family_before jsonb;
  v_family_after jsonb;
  v_family public.product_families%rowtype;
  v_existing_family_id uuid;
  v_family_changed boolean;
  v_result jsonb;
  v_now timestamptz := clock_timestamp();
begin
  select role into v_actor_role
  from public.admin_memberships
  where user_id = p_actor_id and active;
  if v_actor_role is null
     or v_actor_role <> p_actor_role
     or v_actor_role not in ('catalog_publisher', 'admin')
  then
    raise exception 'catalog actor cannot publish' using errcode = '42501';
  end if;

  select * into v_draft
  from public.product_content_drafts
  where id = p_draft_id
  for update;
  if not found then
    raise exception 'catalog draft not found' using errcode = 'P0002';
  end if;
  if v_draft.status <> 'ready' then
    return jsonb_build_object(
      'ok', false,
      'code', 'draft_not_ready',
      'stored', jsonb_build_object(
        'version', v_draft.version,
        'status', v_draft.status,
        'updatedAt', v_draft.updated_at,
        'updatedBy', v_draft.updated_by
      )
    );
  end if;
  if v_draft.version <> p_expected_version then
    return jsonb_build_object(
      'ok', false,
      'code', 'version_conflict',
      'stored', jsonb_build_object(
        'version', v_draft.version,
        'status', v_draft.status,
        'updatedAt', v_draft.updated_at,
        'updatedBy', v_draft.updated_by
      )
    );
  end if;

  perform 1
  from public.products
  where id = v_draft.product_id
  for update;
  if not found then
    raise exception 'catalog product not found' using errcode = 'P0002';
  end if;

  select coalesce(max(revision_number), 0)
  into v_latest_revision
  from public.catalog_product_revisions
  where product_id = v_draft.product_id;
  if v_draft.base_revision <> v_latest_revision then
    return jsonb_build_object(
      'ok', false,
      'code', 'revision_conflict',
      'baseRevision', v_draft.base_revision,
      'latestRevision', v_latest_revision
    );
  end if;

  if not (v_draft.document ? 'productFamily')
     or coalesce(
       jsonb_typeof(v_draft.document -> 'productFamily'),
       'null'
     ) not in ('object', 'null')
  then
    raise exception 'invalid Product Family document' using errcode = '22023';
  end if;

  v_requested_family := v_draft.document -> 'productFamily';
  v_family_before := private.catalog_editor_product_family(
    v_draft.product_id
  );
  v_family_changed := v_requested_family is distinct from v_family_before;
  if v_family_changed and p_actor_role <> 'admin' then
    raise exception 'catalog actor cannot publish Product Family fields'
      using errcode = '42501';
  end if;

  if v_family_changed and jsonb_typeof(v_requested_family) = 'null' then
    v_existing_family_id := (
      v_family_before #>> '{family,id}'
    )::uuid;
    if v_existing_family_id is not null then
      delete from public.product_family_memberships
      where family_id = v_existing_family_id;
      delete from public.product_families
      where id = v_existing_family_id;
    end if;
  elsif v_family_changed then
    if jsonb_typeof(v_requested_family -> 'family') <> 'object'
       or jsonb_typeof(v_requested_family -> 'memberships') <> 'array'
    then
      raise exception 'invalid Product Family aggregate' using errcode = '22023';
    end if;

    select * into v_family
    from jsonb_populate_record(
      null::public.product_families,
      v_requested_family -> 'family'
    );
    if v_family.id is null
       or v_family.slug is null
       or v_family.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
       or nullif(btrim(v_family.display_name), '') is null
       or v_family.system_step_name is null
       or v_family.system_step_name
         <> v_draft.document #>> '{product,system_step_name}'
       or jsonb_array_length(v_requested_family -> 'memberships') = 0
    then
      raise exception 'invalid Product Family fields' using errcode = '22023';
    end if;

    if v_family_before is not null
       and v_family_before #>> '{family,id}' <> v_family.id::text
    then
      raise exception 'A Product cannot move between Product Families in one draft'
        using errcode = '23514';
    end if;

    if (
      select count(*)
      from jsonb_array_elements(v_requested_family -> 'memberships') member
      where (member ->> 'is_entry')::boolean
    ) <> 1
       or not exists (
         select 1
         from jsonb_array_elements(v_requested_family -> 'memberships') member
         where member ->> 'product_id' = v_draft.product_id::text
       )
       or exists (
         select 1
         from jsonb_array_elements(v_requested_family -> 'memberships') member
         where member ->> 'family_id' <> v_family.id::text
            or nullif(btrim(member ->> 'option_label'), '') is null
            or (member ->> 'sort_order')::integer < 0
       )
       or (
         select count(distinct member ->> 'product_id')
         from jsonb_array_elements(v_requested_family -> 'memberships') member
       ) <> jsonb_array_length(v_requested_family -> 'memberships')
       or (
         select count(distinct (member ->> 'sort_order')::integer)
         from jsonb_array_elements(v_requested_family -> 'memberships') member
       ) <> jsonb_array_length(v_requested_family -> 'memberships')
    then
      raise exception 'invalid Product Family memberships' using errcode = '23514';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(v_requested_family -> 'memberships') member
      left join public.products product
        on product.id = (member ->> 'product_id')::uuid
      where product.id is null
         or (
           product.id <> v_draft.product_id
           and product.system_step_name is distinct from v_family.system_step_name
         )
    ) then
      raise exception 'Product Family members must share one System Step'
        using errcode = '23514';
    end if;

    perform 1
    from public.products product
    join jsonb_array_elements(
      v_requested_family -> 'memberships'
    ) member on product.id = (member ->> 'product_id')::uuid
    order by product.id
    for update;

    insert into public.product_families (
      id,
      slug,
      display_name,
      system_step_name,
      created_at,
      updated_at
    ) values (
      v_family.id,
      v_family.slug,
      v_family.display_name,
      v_family.system_step_name,
      v_now,
      v_now
    )
    on conflict (id) do update set
      slug = excluded.slug,
      display_name = excluded.display_name,
      system_step_name = excluded.system_step_name,
      updated_at = excluded.updated_at
    where row(
      product_families.slug,
      product_families.display_name,
      product_families.system_step_name
    ) is distinct from row(
      excluded.slug,
      excluded.display_name,
      excluded.system_step_name
    );

    delete from public.product_family_memberships
    where family_id = v_family.id;

    insert into public.product_family_memberships (
      family_id,
      product_id,
      option_label,
      sort_order,
      is_entry,
      created_at,
      updated_at
    )
    select
      v_family.id,
      member.product_id,
      member.option_label,
      member.sort_order,
      member.is_entry,
      v_now,
      v_now
    from jsonb_to_recordset(
      v_requested_family -> 'memberships'
    ) as member(
      family_id uuid,
      product_id uuid,
      option_label text,
      sort_order smallint,
      is_entry boolean,
      created_at timestamptz,
      updated_at timestamptz
    );
  end if;

  v_result := public.publish_catalog_product_draft_v4_without_family(
    p_draft_id,
    p_expected_version,
    p_actor_id,
    p_actor_role,
    p_change_audit
  );
  if v_result ->> 'ok' <> 'true' then
    raise exception 'canonical Product publish failed after family validation'
      using errcode = '40001';
  end if;

  v_family_after := private.catalog_editor_product_family(v_draft.product_id);
  v_result := jsonb_set(
    v_result,
    '{changedTables,productFamily}',
    to_jsonb(v_family_changed),
    true
  );

  if v_family_changed then
    insert into public.catalog_editor_audit_log (
      action,
      actor_id,
      product_id,
      draft_id,
      revision_id,
      metadata
    ) values (
      'family.published',
      p_actor_id,
      v_draft.product_id,
      p_draft_id,
      (v_result #>> '{revision,id}')::uuid,
      jsonb_build_object(
        'before', v_family_before,
        'after', v_family_after,
        'revision', (v_result #>> '{revision,revision_number}')::integer,
        'changedTables', jsonb_build_object(
          'product_families', true,
          'product_family_memberships', true
        )
      )
    );
  end if;

  return v_result;
end;
$function$;
revoke all on function publish_catalog_product_draft_v4_without_family_concurrency(uuid,bigint,uuid,text,jsonb) from public, anon, authenticated, service_role;
grant execute on function publish_catalog_product_draft_v4_without_family_concurrency(uuid,bigint,uuid,text,jsonb) to "postgres";
CREATE OR REPLACE FUNCTION public.publish_catalog_product_draft_without_family_lock_order(p_draft_id uuid, p_expected_version bigint, p_actor_id uuid, p_actor_role text, p_change_audit jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_draft public.product_content_drafts%rowtype;
  v_current_slug text;
  v_requested_slug text;
  v_actor_role text;
  v_latest_revision integer;
  v_slug_changed boolean;
  v_result jsonb;
begin
  select * into v_draft
  from public.product_content_drafts
  where id = p_draft_id
  for update;
  if not found then
    raise exception 'catalog draft not found' using errcode = 'P0002';
  end if;

  if v_draft.status <> 'ready' then
    return jsonb_build_object(
      'ok', false,
      'code', 'draft_not_ready',
      'stored', jsonb_build_object(
        'version', v_draft.version,
        'status', v_draft.status,
        'updatedAt', v_draft.updated_at,
        'updatedBy', v_draft.updated_by
      )
    );
  end if;

  if v_draft.version <> p_expected_version then
    return jsonb_build_object(
      'ok', false,
      'code', 'version_conflict',
      'stored', jsonb_build_object(
        'version', v_draft.version,
        'status', v_draft.status,
        'updatedAt', v_draft.updated_at,
        'updatedBy', v_draft.updated_by
      )
    );
  end if;

  select role into v_actor_role
  from public.admin_memberships
  where user_id = p_actor_id and active;
  if v_actor_role is null
     or v_actor_role <> p_actor_role
     or v_actor_role not in ('catalog_publisher', 'admin')
  then
    raise exception 'catalog actor cannot publish' using errcode = '42501';
  end if;

  select p.slug into v_current_slug
  from public.products p
  where p.id = v_draft.product_id
  for update;
  if not found then
    raise exception 'catalog product not found' using errcode = 'P0002';
  end if;

  select coalesce(max(revision_number), 0)
  into v_latest_revision
  from public.catalog_product_revisions
  where product_id = v_draft.product_id;
  if v_draft.base_revision <> v_latest_revision then
    return jsonb_build_object(
      'ok', false,
      'code', 'revision_conflict',
      'baseRevision', v_draft.base_revision,
      'latestRevision', v_latest_revision
    );
  end if;

  v_requested_slug := v_draft.document #>> '{product,slug}';
  if v_requested_slug is null
     or v_requested_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  then
    raise exception 'invalid canonical Product slug' using errcode = '22023';
  end if;

  v_slug_changed := v_requested_slug <> v_current_slug;
  if v_slug_changed and p_actor_role <> 'admin' then
    raise exception 'Only a Catalog Administrator can change a Product slug'
      using errcode = '42501';
  end if;

  if v_slug_changed then
    perform pg_catalog.set_config(
      'helix.catalog_actor_id',
      p_actor_id::text,
      true
    );
    update public.products
    set slug = v_requested_slug
    where id = v_draft.product_id;
  end if;

  v_result := public.publish_catalog_product_draft_v4(
    p_draft_id,
    p_expected_version,
    p_actor_id,
    p_actor_role,
    p_change_audit
  );

  if v_slug_changed and v_result ->> 'ok' = 'true' then
    v_result := jsonb_set(
      jsonb_set(
        v_result,
        '{changedTables,products}',
        'true'::jsonb,
        true
      ),
      '{changedTables,productSlugRoutes}',
      'true'::jsonb,
      true
    );

    insert into public.catalog_editor_audit_log (
      action,
      actor_id,
      product_id,
      draft_id,
      revision_id,
      metadata
    ) values (
      'slug.rename.published',
      p_actor_id,
      v_draft.product_id,
      p_draft_id,
      (v_result #>> '{revision,id}')::uuid,
      jsonb_build_object(
        'sourceSlug', v_current_slug,
        'targetSlug', v_requested_slug,
        'routeKind', 'rename',
        'revision', (v_result #>> '{revision,revision_number}')::integer,
        'changedTables', jsonb_build_object(
          'products', true,
          'product_slug_routes', true
        )
      )
    );
  else
    v_result := jsonb_set(
      v_result,
      '{changedTables,productSlugRoutes}',
      'false'::jsonb,
      true
    );
  end if;

  return v_result;
end;
$function$;
revoke all on function publish_catalog_product_draft_without_family_lock_order(uuid,bigint,uuid,text,jsonb) from public, anon, authenticated, service_role;
grant execute on function publish_catalog_product_draft_without_family_lock_order(uuid,bigint,uuid,text,jsonb) to "postgres";
CREATE OR REPLACE FUNCTION public.replace_catalog_product_slug(p_source_product_id uuid, p_target_product_id uuid, p_actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor_role text;
begin
  select role into v_actor_role
  from public.admin_memberships
  where user_id = p_actor_id and active;

  if v_actor_role is null or v_actor_role <> 'admin' then
    raise exception 'Only a Catalog Administrator can publish a replacement'
      using errcode = '42501';
  end if;

  return public.replace_catalog_product_slug_v1(
    p_source_product_id,
    p_target_product_id,
    p_actor_id
  );
end;
$function$;
revoke all on function replace_catalog_product_slug(uuid,uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function replace_catalog_product_slug(uuid,uuid,uuid) to "postgres";
grant execute on function replace_catalog_product_slug(uuid,uuid,uuid) to "service_role";
CREATE OR REPLACE FUNCTION public.replace_catalog_product_slug_v1(p_source_product_id uuid, p_target_product_id uuid, p_actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_source public.products%rowtype;
  v_target public.products%rowtype;
  v_actor_role text;
  v_changed integer;
begin
  if p_source_product_id = p_target_product_id then
    raise exception 'Product replacement cannot target itself'
      using errcode = '23514';
  end if;

  select role into v_actor_role
  from public.admin_memberships
  where user_id = p_actor_id and active;
  if v_actor_role <> 'admin' then
    raise exception 'Only a Catalog Administrator can publish a replacement'
      using errcode = '42501';
  end if;

  perform 1
  from public.products
  where id in (p_source_product_id, p_target_product_id)
  order by id
  for update;

  select * into v_source
  from public.products
  where id = p_source_product_id;
  if not found then
    raise exception 'Replacement source Product does not exist'
      using errcode = '23503';
  end if;

  select * into v_target
  from public.products
  where id = p_target_product_id;
  if not found then
    raise exception 'Replacement target Product does not exist'
      using errcode = '23503';
  end if;

  if v_source.catalog_status <> 'archived'
     or v_target.catalog_status <> 'active'
  then
    raise exception
      'Product replacement requires an Archived source and Active target'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.product_slug_routes route
    where route.source_product_id = p_target_product_id
      and route.target_product_id = p_target_product_id
      and route.source_slug = v_target.slug
      and route.route_kind = 'canonical'
  ) then
    raise exception 'Replacement target is not canonical'
      using errcode = '23514';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('helix-product-slug-routes', 0)
  );

  update public.product_slug_routes
  set
    target_product_id = p_target_product_id,
    route_kind = 'replacement'
  where target_product_id = p_source_product_id;
  get diagnostics v_changed = row_count;
  if v_changed = 0 then
    raise exception 'Replacement source has no durable slug routes'
      using errcode = '23514';
  end if;

  insert into public.catalog_editor_audit_log (
    action,
    actor_id,
    product_id,
    metadata
  ) values (
    'slug.replacement.published',
    p_actor_id,
    p_target_product_id,
    jsonb_build_object(
      'sourceProductId', p_source_product_id,
      'sourceSlug', v_source.slug,
      'targetProductId', p_target_product_id,
      'targetSlug', v_target.slug,
      'flattenedRoutes', v_changed
    )
  );

  return jsonb_build_object(
    'ok', true,
    'sourceProductId', p_source_product_id,
    'sourceSlug', v_source.slug,
    'targetProductId', p_target_product_id,
    'targetSlug', v_target.slug,
    'flattenedRoutes', v_changed
  );
end;
$function$;
revoke all on function replace_catalog_product_slug_v1(uuid,uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function replace_catalog_product_slug_v1(uuid,uuid,uuid) to "postgres";
CREATE OR REPLACE FUNCTION public.restore_catalog_product_revision(p_revision_id uuid, p_actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_revision public.catalog_product_revisions%rowtype;
  v_existing public.product_content_drafts%rowtype;
  v_created public.product_content_drafts%rowtype;
  v_document jsonb;
  v_base_revision integer;
begin
  select * into v_revision
  from public.catalog_product_revisions where id = p_revision_id;
  if not found then
    raise exception 'catalog revision not found' using errcode = 'P0002';
  end if;

  perform 1 from public.products where id = v_revision.product_id for update;
  select * into v_existing
  from public.product_content_drafts
  where product_id = v_revision.product_id and status in ('draft', 'ready')
  for update;
  if found then
    return jsonb_build_object(
      'ok', false, 'code', 'active_draft_exists',
      'stored', jsonb_build_object(
        'id', v_existing.id, 'version', v_existing.version,
        'status', v_existing.status, 'updatedAt', v_existing.updated_at,
        'updatedBy', v_existing.updated_by
      )
    );
  end if;

  v_document := private.catalog_editor_upgrade_to_v4(v_revision.document);
  if v_document is null then
    raise exception 'unsupported catalog revision schema version %',
      v_revision.schema_version
      using errcode = '22023';
  end if;
  select coalesce(max(revision_number), 0) into v_base_revision
  from public.catalog_product_revisions
  where product_id = v_revision.product_id;

  insert into public.product_content_drafts (
    product_id, schema_version, base_revision, version, document, status,
    validation_errors, created_by, updated_by
  ) values (
    v_revision.product_id, 4, v_base_revision, 1, v_document, 'draft',
    '[]'::jsonb, p_actor_id, p_actor_id
  ) returning * into v_created;

  insert into public.catalog_editor_audit_log (
    action, actor_id, product_id, draft_id, revision_id, metadata
  ) values (
    'draft.restored', p_actor_id, v_revision.product_id, v_created.id,
    v_revision.id, jsonb_build_object(
      'restoredRevision', v_revision.revision_number,
      'restoredSchemaVersion', v_revision.schema_version,
      'draftSchemaVersion', 4,
      'baseRevision', v_base_revision
    )
  );
  return jsonb_build_object('ok', true, 'draft', to_jsonb(v_created));
end;
$function$;
revoke all on function restore_catalog_product_revision(uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function restore_catalog_product_revision(uuid,uuid) to "postgres";
grant execute on function restore_catalog_product_revision(uuid,uuid) to "service_role";
CREATE OR REPLACE FUNCTION public.save_catalog_product_draft(p_draft_id uuid, p_expected_version bigint, p_document jsonb, p_actor_id uuid, p_actor_role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_draft public.product_content_drafts%rowtype;
  v_current_family jsonb;
begin
  select * into v_draft
  from public.product_content_drafts
  where id = p_draft_id;
  if not found then
    raise exception 'catalog draft not found' using errcode = 'P0002';
  end if;

  if not (p_document ? 'productFamily')
     or coalesce(jsonb_typeof(p_document -> 'productFamily'), 'null')
       not in ('object', 'null')
  then
    raise exception 'invalid Product Family document' using errcode = '22023';
  end if;

  v_current_family := private.catalog_editor_product_family(
    v_draft.product_id
  );
  if p_document -> 'productFamily' is distinct from v_current_family
     and p_actor_role <> 'admin'
  then
    raise exception 'catalog actor cannot save Product Family fields'
      using errcode = '42501';
  end if;

  return public.save_catalog_product_draft_without_family(
    p_draft_id,
    p_expected_version,
    p_document,
    p_actor_id,
    p_actor_role
  );
end;
$function$;
revoke all on function save_catalog_product_draft(uuid,bigint,jsonb,uuid,text) from public, anon, authenticated, service_role;
grant execute on function save_catalog_product_draft(uuid,bigint,jsonb,uuid,text) to "postgres";
grant execute on function save_catalog_product_draft(uuid,bigint,jsonb,uuid,text) to "service_role";
CREATE OR REPLACE FUNCTION public.save_catalog_product_draft_without_family(p_draft_id uuid, p_expected_version bigint, p_document jsonb, p_actor_id uuid, p_actor_role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_draft public.product_content_drafts%rowtype;
  v_role text;
  v_canonical jsonb;
begin
  select role into v_role
  from public.admin_memberships
  where user_id = p_actor_id and active;
  if v_role is null or v_role <> p_actor_role
     or v_role not in ('catalog_editor', 'catalog_publisher', 'admin')
  then
    raise exception 'catalog actor role is not authorized'
      using errcode = '42501';
  end if;

  select * into v_draft
  from public.product_content_drafts
  where id = p_draft_id
  for update;
  if not found then
    raise exception 'catalog draft not found' using errcode = 'P0002';
  end if;
  if v_draft.status not in ('draft', 'ready') then
    return jsonb_build_object(
      'ok', false, 'code', 'draft_closed',
      'stored', jsonb_build_object(
        'id', v_draft.id, 'version', v_draft.version,
        'status', v_draft.status, 'updatedAt', v_draft.updated_at,
        'updatedBy', v_draft.updated_by
      )
    );
  end if;
  if v_draft.version <> p_expected_version then
    return jsonb_build_object(
      'ok', false, 'code', 'version_conflict',
      'stored', jsonb_build_object(
        'id', v_draft.id, 'version', v_draft.version,
        'status', v_draft.status, 'updatedAt', v_draft.updated_at,
        'updatedBy', v_draft.updated_by
      )
    );
  end if;
  if jsonb_typeof(p_document) <> 'object'
     or p_document ->> 'schemaVersion' <> '4'
     or p_document ->> 'productId' <> v_draft.product_id::text
     or jsonb_typeof(p_document -> 'product') <> 'object'
     or (p_document -> 'product') ?| array[
       'formal_title',
       'card_tagline',
       'routine_step_number',
       'routine_step_name'
     ]
     or coalesce(
       jsonb_typeof(p_document -> 'productPdpContent'),
       'null'
     ) not in ('object', 'null')
     or jsonb_typeof(p_document -> 'variants') <> 'array'
     or jsonb_typeof(p_document -> 'media') <> 'array'
     or jsonb_typeof(p_document -> 'relationships') <> 'array'
     or coalesce(
       jsonb_typeof(p_document -> 'productSource'),
       'null'
     ) not in ('object', 'null')
  then
    raise exception 'invalid catalog editor V4 document' using errcode = '22023';
  end if;

  v_canonical := private.catalog_editor_document_v4(v_draft.product_id);
  if p_actor_role <> 'admin' and (
    (p_document -> 'product') - array[
      'display_name', 'product_type', 'editorial_description',
      'editorial_how_to_use', 'benefits', 'made_for', 'good_for', 'badge',
      'formula_notes', 'search_keywords', 'seo_title', 'seo_description'
    ]::text[]
    is distinct from
    (v_canonical -> 'product') - array[
      'display_name', 'product_type', 'editorial_description',
      'editorial_how_to_use', 'benefits', 'made_for', 'good_for', 'badge',
      'formula_notes', 'search_keywords', 'seo_title', 'seo_description'
    ]::text[]
    or p_document -> 'variants' is distinct from v_canonical -> 'variants'
    or p_document -> 'productSource'
      is distinct from v_canonical -> 'productSource'
  ) then
    raise exception 'catalog actor cannot save admin-only fields'
      using errcode = '42501';
  end if;

  update public.product_content_drafts
  set schema_version = 4,
      document = p_document,
      version = version + 1,
      status = 'draft',
      validation_errors = '[]'::jsonb,
      updated_by = p_actor_id,
      updated_at = now(),
      ready_at = null
  where id = p_draft_id
  returning * into v_draft;

  insert into public.catalog_editor_audit_log (
    action, actor_id, product_id, draft_id, metadata
  ) values (
    'draft.saved', p_actor_id, v_draft.product_id, v_draft.id,
    jsonb_build_object('version', v_draft.version, 'schemaVersion', 4)
  );

  return jsonb_build_object('ok', true, 'draft', to_jsonb(v_draft));
end;
$function$;
revoke all on function save_catalog_product_draft_without_family(uuid,bigint,jsonb,uuid,text) from public, anon, authenticated, service_role;
grant execute on function save_catalog_product_draft_without_family(uuid,bigint,jsonb,uuid,text) to "postgres";
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;
revoke all on function set_updated_at() from public, anon, authenticated, service_role;
grant execute on function set_updated_at() to public;
grant execute on function set_updated_at() to "postgres";
grant execute on function set_updated_at() to "anon";
grant execute on function set_updated_at() to "authenticated";
grant execute on function set_updated_at() to "service_role";
CREATE OR REPLACE FUNCTION public.transition_catalog_product_draft(p_draft_id uuid, p_expected_version bigint, p_action text, p_validation_errors jsonb, p_actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_draft public.product_content_drafts%rowtype;
  v_audit_action text;
begin
  if p_action not in ('validate', 'ready', 'discard') then
    raise exception 'unsupported draft transition'
      using errcode = '22023';
  end if;

  if jsonb_typeof(p_validation_errors) <> 'array' then
    raise exception 'validation errors must be an array'
      using errcode = '22023';
  end if;

  select *
  into v_draft
  from public.product_content_drafts
  where id = p_draft_id
  for update;

  if not found then
    raise exception 'catalog draft not found'
      using errcode = 'P0002';
  end if;

  if v_draft.status not in ('draft', 'ready') then
    return jsonb_build_object(
      'ok', false,
      'code', 'draft_closed',
      'stored', jsonb_build_object(
        'version', v_draft.version,
        'status', v_draft.status,
        'updatedAt', v_draft.updated_at,
        'updatedBy', v_draft.updated_by
      )
    );
  end if;

  if v_draft.version <> p_expected_version then
    return jsonb_build_object(
      'ok', false,
      'code', 'version_conflict',
      'stored', jsonb_build_object(
        'version', v_draft.version,
        'status', v_draft.status,
        'updatedAt', v_draft.updated_at,
        'updatedBy', v_draft.updated_by
      )
    );
  end if;

  if p_action = 'ready' and jsonb_array_length(p_validation_errors) > 0 then
    return jsonb_build_object(
      'ok', false,
      'code', 'validation_failed',
      'validationErrors', p_validation_errors
    );
  end if;

  update public.product_content_drafts
  set
    status = case
      when p_action = 'ready' then 'ready'
      when p_action = 'discard' then 'discarded'
      else status
    end,
    validation_errors = p_validation_errors,
    version = version + 1,
    updated_by = p_actor_id,
    updated_at = now(),
    ready_at = case
      when p_action = 'ready' then now()
      when p_action = 'validate' and status = 'ready' then ready_at
      else null
    end,
    discarded_at = case
      when p_action = 'discard' then now()
      else discarded_at
    end
  where id = p_draft_id
  returning * into v_draft;

  v_audit_action := case p_action
    when 'validate' then 'draft.validated'
    when 'ready' then 'draft.ready'
    else 'draft.discarded'
  end;

  insert into public.catalog_editor_audit_log (
    action,
    actor_id,
    product_id,
    draft_id,
    metadata
  )
  values (
    v_audit_action,
    p_actor_id,
    v_draft.product_id,
    v_draft.id,
    jsonb_build_object(
      'version', v_draft.version,
      'validationErrorCount', jsonb_array_length(p_validation_errors)
    )
  );

  return jsonb_build_object(
    'ok', true,
    'draft', to_jsonb(v_draft)
  );
end;
$function$;
revoke all on function transition_catalog_product_draft(uuid,bigint,text,jsonb,uuid) from public, anon, authenticated, service_role;
grant execute on function transition_catalog_product_draft(uuid,bigint,text,jsonb,uuid) to "postgres";
grant execute on function transition_catalog_product_draft(uuid,bigint,text,jsonb,uuid) to "service_role";
CREATE TRIGGER admin_memberships_set_updated_at BEFORE UPDATE ON public.admin_memberships FOR EACH ROW EXECUTE FUNCTION set_updated_at();
alter table public."admin_memberships" enable row level security;
grant DELETE on public."admin_memberships" to "postgres";
grant INSERT on public."admin_memberships" to "postgres";
grant REFERENCES on public."admin_memberships" to "postgres";
grant SELECT on public."admin_memberships" to "postgres";
grant TRIGGER on public."admin_memberships" to "postgres";
grant TRUNCATE on public."admin_memberships" to "postgres";
grant UPDATE on public."admin_memberships" to "postgres";
grant INSERT on public."admin_memberships" to "service_role";
grant SELECT on public."admin_memberships" to "service_role";
grant UPDATE on public."admin_memberships" to "service_role";
CREATE INDEX catalog_editor_audit_product_idx ON public.catalog_editor_audit_log USING btree (product_id, created_at DESC);
CREATE TRIGGER catalog_editor_audit_log_append_only BEFORE DELETE OR UPDATE ON public.catalog_editor_audit_log FOR EACH ROW EXECUTE FUNCTION private.reject_catalog_history_mutation();
alter table public."catalog_editor_audit_log" enable row level security;
grant DELETE on public."catalog_editor_audit_log" to "postgres";
grant INSERT on public."catalog_editor_audit_log" to "postgres";
grant REFERENCES on public."catalog_editor_audit_log" to "postgres";
grant SELECT on public."catalog_editor_audit_log" to "postgres";
grant TRIGGER on public."catalog_editor_audit_log" to "postgres";
grant TRUNCATE on public."catalog_editor_audit_log" to "postgres";
grant UPDATE on public."catalog_editor_audit_log" to "postgres";
grant INSERT on public."catalog_editor_audit_log" to "service_role";
grant SELECT on public."catalog_editor_audit_log" to "service_role";
CREATE INDEX catalog_product_revisions_product_history_idx ON public.catalog_product_revisions USING btree (product_id, revision_number DESC);
CREATE TRIGGER catalog_product_revisions_append_only BEFORE DELETE OR UPDATE ON public.catalog_product_revisions FOR EACH ROW EXECUTE FUNCTION private.reject_catalog_history_mutation();
alter table public."catalog_product_revisions" enable row level security;
grant DELETE on public."catalog_product_revisions" to "postgres";
grant INSERT on public."catalog_product_revisions" to "postgres";
grant REFERENCES on public."catalog_product_revisions" to "postgres";
grant SELECT on public."catalog_product_revisions" to "postgres";
grant TRIGGER on public."catalog_product_revisions" to "postgres";
grant TRUNCATE on public."catalog_product_revisions" to "postgres";
grant UPDATE on public."catalog_product_revisions" to "postgres";
grant INSERT on public."catalog_product_revisions" to "service_role";
grant SELECT on public."catalog_product_revisions" to "service_role";
CREATE UNIQUE INDEX product_content_drafts_one_open_per_product_idx ON public.product_content_drafts USING btree (product_id) WHERE (status = ANY (ARRAY['draft'::text, 'ready'::text]));
CREATE INDEX product_content_drafts_product_history_idx ON public.product_content_drafts USING btree (product_id, updated_at DESC);
alter table public."product_content_drafts" enable row level security;
grant DELETE on public."product_content_drafts" to "postgres";
grant INSERT on public."product_content_drafts" to "postgres";
grant REFERENCES on public."product_content_drafts" to "postgres";
grant SELECT on public."product_content_drafts" to "postgres";
grant TRIGGER on public."product_content_drafts" to "postgres";
grant TRUNCATE on public."product_content_drafts" to "postgres";
grant UPDATE on public."product_content_drafts" to "postgres";
grant INSERT on public."product_content_drafts" to "service_role";
grant SELECT on public."product_content_drafts" to "service_role";
grant UPDATE on public."product_content_drafts" to "service_role";
CREATE INDEX product_families_system_step_name_idx ON public.product_families USING btree (system_step_name);
CREATE CONSTRAINT TRIGGER enforce_product_family_row_invariants AFTER INSERT OR UPDATE ON public.product_families DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.enforce_product_family_invariants();
CREATE TRIGGER product_families_set_updated_at BEFORE UPDATE ON public.product_families FOR EACH ROW EXECUTE FUNCTION set_updated_at();
alter table public."product_families" enable row level security;
create policy "Public read eligible Product Families" on public."product_families" as permissive for select to "authenticated", "anon" using ((EXISTS ( SELECT 1
   FROM (product_family_memberships membership
     JOIN products product ON ((product.id = membership.product_id)))
  WHERE ((membership.family_id = product_families.id) AND (product.catalog_status = 'active'::text) AND ((product.published_at IS NULL) OR (product.published_at <= statement_timestamp()))))));
grant SELECT on public."product_families" to "anon";
grant SELECT on public."product_families" to "authenticated";
grant DELETE on public."product_families" to "postgres";
grant INSERT on public."product_families" to "postgres";
grant REFERENCES on public."product_families" to "postgres";
grant SELECT on public."product_families" to "postgres";
grant TRIGGER on public."product_families" to "postgres";
grant TRUNCATE on public."product_families" to "postgres";
grant UPDATE on public."product_families" to "postgres";
grant DELETE on public."product_families" to "service_role";
grant INSERT on public."product_families" to "service_role";
grant SELECT on public."product_families" to "service_role";
grant UPDATE on public."product_families" to "service_role";
CREATE UNIQUE INDEX product_family_single_entry_uidx ON public.product_family_memberships USING btree (family_id) WHERE is_entry;
CREATE CONSTRAINT TRIGGER enforce_product_family_membership_invariants AFTER INSERT OR DELETE OR UPDATE ON public.product_family_memberships DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.enforce_product_family_invariants();
CREATE TRIGGER product_family_memberships_set_updated_at BEFORE UPDATE ON public.product_family_memberships FOR EACH ROW EXECUTE FUNCTION set_updated_at();
alter table public."product_family_memberships" enable row level security;
create policy "Public read eligible Product Family Memberships" on public."product_family_memberships" as permissive for select to "authenticated", "anon" using ((EXISTS ( SELECT 1
   FROM products product
  WHERE ((product.id = product_family_memberships.product_id) AND (product.catalog_status = 'active'::text) AND ((product.published_at IS NULL) OR (product.published_at <= statement_timestamp()))))));
grant SELECT on public."product_family_memberships" to "anon";
grant SELECT on public."product_family_memberships" to "authenticated";
grant DELETE on public."product_family_memberships" to "postgres";
grant INSERT on public."product_family_memberships" to "postgres";
grant REFERENCES on public."product_family_memberships" to "postgres";
grant SELECT on public."product_family_memberships" to "postgres";
grant TRIGGER on public."product_family_memberships" to "postgres";
grant TRUNCATE on public."product_family_memberships" to "postgres";
grant UPDATE on public."product_family_memberships" to "postgres";
grant DELETE on public."product_family_memberships" to "service_role";
grant INSERT on public."product_family_memberships" to "service_role";
grant SELECT on public."product_family_memberships" to "service_role";
grant UPDATE on public."product_family_memberships" to "service_role";
CREATE INDEX product_media_active_product_idx ON public.product_media USING btree (product_id, role, sort_order) WHERE (archived_at IS NULL);
CREATE UNIQUE INDEX product_media_active_role_order_idx ON public.product_media USING btree (product_id, role, sort_order) WHERE (archived_at IS NULL);
CREATE UNIQUE INDEX product_media_core_routine_editorial_role_unique ON public.product_media USING btree (product_id, role) WHERE ((role = 'core_routine_editorial'::text) AND (archived_at IS NULL));
CREATE UNIQUE INDEX product_media_core_routine_texture_role_unique ON public.product_media USING btree (product_id, role) WHERE (role = 'core_routine_texture'::text);
CREATE UNIQUE INDEX product_media_editorial_role_unique ON public.product_media USING btree (product_id, role) WHERE ((archived_at IS NULL) AND (role = ANY (ARRAY['routine_video'::text, 'routine_video_poster'::text, 'profile_editorial'::text])));
CREATE UNIQUE INDEX product_media_ingredients_texture_role_unique ON public.product_media USING btree (product_id, role) WHERE (role = 'ingredients_texture'::text);
CREATE INDEX product_media_product_sort_idx ON public.product_media USING btree (product_id, sort_order);
CREATE INDEX product_media_role_idx ON public.product_media USING btree (role);
CREATE INDEX product_media_variant_id_idx ON public.product_media USING btree (variant_id) WHERE (variant_id IS NOT NULL);
CREATE TRIGGER product_media_enforce_core_routine_editorial_product BEFORE INSERT OR UPDATE OF product_id, role ON public.product_media FOR EACH ROW EXECUTE FUNCTION private.enforce_core_routine_editorial_product();
CREATE TRIGGER product_media_set_updated_at BEFORE UPDATE ON public.product_media FOR EACH ROW EXECUTE FUNCTION set_updated_at();
alter table public."product_media" enable row level security;
create policy "Public read active product media" on public."product_media" as permissive for select to "authenticated", "anon" using (((archived_at IS NULL) AND (EXISTS ( SELECT 1
   FROM products
  WHERE ((products.id = product_media.product_id) AND (products.catalog_status = 'active'::text) AND (products.published_at <= now()))))));
grant SELECT on public."product_media" to "anon";
grant SELECT on public."product_media" to "authenticated";
grant DELETE on public."product_media" to "postgres";
grant INSERT on public."product_media" to "postgres";
grant REFERENCES on public."product_media" to "postgres";
grant SELECT on public."product_media" to "postgres";
grant TRIGGER on public."product_media" to "postgres";
grant TRUNCATE on public."product_media" to "postgres";
grant UPDATE on public."product_media" to "postgres";
grant DELETE on public."product_media" to "service_role";
grant INSERT on public."product_media" to "service_role";
grant SELECT on public."product_media" to "service_role";
grant UPDATE on public."product_media" to "service_role";
CREATE TRIGGER product_pdp_content_set_updated_at BEFORE UPDATE ON public.product_pdp_content FOR EACH ROW EXECUTE FUNCTION set_updated_at();
alter table public."product_pdp_content" enable row level security;
create policy "Public read active product PDP content" on public."product_pdp_content" as permissive for select to "authenticated", "anon" using ((EXISTS ( SELECT 1
   FROM products
  WHERE ((products.id = product_pdp_content.product_id) AND (products.catalog_status = 'active'::text) AND (products.published_at <= now())))));
grant SELECT on public."product_pdp_content" to "anon";
grant SELECT on public."product_pdp_content" to "authenticated";
grant DELETE on public."product_pdp_content" to "postgres";
grant INSERT on public."product_pdp_content" to "postgres";
grant REFERENCES on public."product_pdp_content" to "postgres";
grant SELECT on public."product_pdp_content" to "postgres";
grant TRIGGER on public."product_pdp_content" to "postgres";
grant TRUNCATE on public."product_pdp_content" to "postgres";
grant UPDATE on public."product_pdp_content" to "postgres";
grant DELETE on public."product_pdp_content" to "service_role";
grant INSERT on public."product_pdp_content" to "service_role";
grant SELECT on public."product_pdp_content" to "service_role";
grant UPDATE on public."product_pdp_content" to "service_role";
CREATE INDEX product_relationships_active_product_idx ON public.product_relationships USING btree (product_id, relationship_type, sort_order) WHERE (archived_at IS NULL);
CREATE INDEX product_relationships_related_idx ON public.product_relationships USING btree (related_product_id, relationship_type);
alter table public."product_relationships" enable row level security;
create policy "Public read active product relationships" on public."product_relationships" as permissive for select to "authenticated", "anon" using (((archived_at IS NULL) AND (EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_relationships.product_id) AND (p.catalog_status = 'active'::text) AND (p.published_at <= now())))) AND (EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_relationships.related_product_id) AND (p.catalog_status = 'active'::text) AND (p.published_at <= now()))))));
grant DELETE on public."product_relationships" to "anon";
grant INSERT on public."product_relationships" to "anon";
grant REFERENCES on public."product_relationships" to "anon";
grant SELECT on public."product_relationships" to "anon";
grant TRIGGER on public."product_relationships" to "anon";
grant TRUNCATE on public."product_relationships" to "anon";
grant UPDATE on public."product_relationships" to "anon";
grant DELETE on public."product_relationships" to "authenticated";
grant INSERT on public."product_relationships" to "authenticated";
grant REFERENCES on public."product_relationships" to "authenticated";
grant SELECT on public."product_relationships" to "authenticated";
grant TRIGGER on public."product_relationships" to "authenticated";
grant TRUNCATE on public."product_relationships" to "authenticated";
grant UPDATE on public."product_relationships" to "authenticated";
grant DELETE on public."product_relationships" to "postgres";
grant INSERT on public."product_relationships" to "postgres";
grant REFERENCES on public."product_relationships" to "postgres";
grant SELECT on public."product_relationships" to "postgres";
grant TRIGGER on public."product_relationships" to "postgres";
grant TRUNCATE on public."product_relationships" to "postgres";
grant UPDATE on public."product_relationships" to "postgres";
grant DELETE on public."product_relationships" to "service_role";
grant INSERT on public."product_relationships" to "service_role";
grant REFERENCES on public."product_relationships" to "service_role";
grant SELECT on public."product_relationships" to "service_role";
grant TRIGGER on public."product_relationships" to "service_role";
grant TRUNCATE on public."product_relationships" to "service_role";
grant UPDATE on public."product_relationships" to "service_role";
CREATE UNIQUE INDEX product_slug_routes_canonical_product_uidx ON public.product_slug_routes USING btree (source_product_id) WHERE (route_kind = 'canonical'::text);
CREATE INDEX product_slug_routes_source_product_id_idx ON public.product_slug_routes USING btree (source_product_id);
CREATE INDEX product_slug_routes_target_product_id_idx ON public.product_slug_routes USING btree (target_product_id);
CREATE TRIGGER product_slug_routes_append_only BEFORE DELETE ON public.product_slug_routes FOR EACH ROW EXECUTE FUNCTION private.forbid_product_slug_route_delete();
CREATE TRIGGER validate_product_slug_route_row BEFORE INSERT OR UPDATE ON public.product_slug_routes FOR EACH ROW EXECUTE FUNCTION private.validate_product_slug_route_row();
alter table public."product_slug_routes" enable row level security;
create policy "Public read active Product slug routes" on public."product_slug_routes" as permissive for select to "authenticated", "anon" using ((EXISTS ( SELECT 1
   FROM products target
  WHERE ((target.id = product_slug_routes.target_product_id) AND (target.catalog_status = 'active'::text) AND ((target.published_at IS NULL) OR (target.published_at <= statement_timestamp()))))));
grant SELECT on public."product_slug_routes" to "anon";
grant SELECT on public."product_slug_routes" to "authenticated";
grant DELETE on public."product_slug_routes" to "postgres";
grant INSERT on public."product_slug_routes" to "postgres";
grant REFERENCES on public."product_slug_routes" to "postgres";
grant SELECT on public."product_slug_routes" to "postgres";
grant TRIGGER on public."product_slug_routes" to "postgres";
grant TRUNCATE on public."product_slug_routes" to "postgres";
grant UPDATE on public."product_slug_routes" to "postgres";
grant SELECT on public."product_slug_routes" to "service_role";
CREATE TRIGGER product_sources_set_updated_at BEFORE UPDATE ON public.product_sources FOR EACH ROW EXECUTE FUNCTION set_updated_at();
alter table public."product_sources" enable row level security;
grant DELETE on public."product_sources" to "anon";
grant INSERT on public."product_sources" to "anon";
grant REFERENCES on public."product_sources" to "anon";
grant SELECT on public."product_sources" to "anon";
grant TRIGGER on public."product_sources" to "anon";
grant TRUNCATE on public."product_sources" to "anon";
grant UPDATE on public."product_sources" to "anon";
grant DELETE on public."product_sources" to "authenticated";
grant INSERT on public."product_sources" to "authenticated";
grant REFERENCES on public."product_sources" to "authenticated";
grant SELECT on public."product_sources" to "authenticated";
grant TRIGGER on public."product_sources" to "authenticated";
grant TRUNCATE on public."product_sources" to "authenticated";
grant UPDATE on public."product_sources" to "authenticated";
grant DELETE on public."product_sources" to "postgres";
grant INSERT on public."product_sources" to "postgres";
grant REFERENCES on public."product_sources" to "postgres";
grant SELECT on public."product_sources" to "postgres";
grant TRIGGER on public."product_sources" to "postgres";
grant TRUNCATE on public."product_sources" to "postgres";
grant UPDATE on public."product_sources" to "postgres";
grant DELETE on public."product_sources" to "service_role";
grant INSERT on public."product_sources" to "service_role";
grant REFERENCES on public."product_sources" to "service_role";
grant SELECT on public."product_sources" to "service_role";
grant TRIGGER on public."product_sources" to "service_role";
grant TRUNCATE on public."product_sources" to "service_role";
grant UPDATE on public."product_sources" to "service_role";
CREATE UNIQUE INDEX product_variants_active_key_idx ON public.product_variants USING btree (product_id, variant_key) WHERE (archived_at IS NULL);
CREATE INDEX product_variants_active_product_idx ON public.product_variants USING btree (product_id, sort_order) WHERE (archived_at IS NULL);
CREATE INDEX product_variants_availability_idx ON public.product_variants USING btree (product_id, available, inventory_status);
CREATE INDEX product_variants_product_id_idx ON public.product_variants USING btree (product_id);
CREATE UNIQUE INDEX product_variants_sku_unique_idx ON public.product_variants USING btree (sku) WHERE (sku IS NOT NULL);
CREATE TRIGGER product_variants_set_updated_at BEFORE UPDATE ON public.product_variants FOR EACH ROW EXECUTE FUNCTION set_updated_at();
alter table public."product_variants" enable row level security;
create policy "Public read active product variants" on public."product_variants" as permissive for select to "authenticated", "anon" using (((archived_at IS NULL) AND (EXISTS ( SELECT 1
   FROM products
  WHERE ((products.id = product_variants.product_id) AND (products.catalog_status = 'active'::text) AND (products.published_at <= now()))))));
grant SELECT on public."product_variants" to "anon";
grant SELECT on public."product_variants" to "authenticated";
grant DELETE on public."product_variants" to "postgres";
grant INSERT on public."product_variants" to "postgres";
grant REFERENCES on public."product_variants" to "postgres";
grant SELECT on public."product_variants" to "postgres";
grant TRIGGER on public."product_variants" to "postgres";
grant TRUNCATE on public."product_variants" to "postgres";
grant UPDATE on public."product_variants" to "postgres";
grant DELETE on public."product_variants" to "service_role";
grant INSERT on public."product_variants" to "service_role";
grant SELECT on public."product_variants" to "service_role";
grant UPDATE on public."product_variants" to "service_role";
CREATE INDEX products_catalog_status_sort_idx ON public.products USING btree (catalog_status, sort_order);
CREATE INDEX products_concerns_gin_idx ON public.products USING gin (concerns);
CREATE INDEX products_key_ingredients_gin_idx ON public.products USING gin (key_ingredients);
CREATE INDEX products_routine_sort_idx ON public.products USING btree (routine_sort, sort_order) WHERE (catalog_status = 'active'::text);
CREATE INDEX products_system_step_routine_group_idx ON public.products USING btree (system_step_name, routine_group);
CREATE CONSTRAINT TRIGGER enforce_product_family_product_invariants AFTER UPDATE ON public.products DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.enforce_product_family_invariants();
CREATE TRIGGER enforce_replaced_product_archival BEFORE UPDATE OF catalog_status ON public.products FOR EACH ROW WHEN ((old.catalog_status IS DISTINCT FROM new.catalog_status)) EXECUTE FUNCTION private.enforce_replaced_product_archival();
CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER sync_inserted_product_slug_route AFTER INSERT ON public.products FOR EACH ROW EXECUTE FUNCTION private.sync_product_slug_route();
CREATE TRIGGER sync_updated_product_slug_route AFTER UPDATE OF slug ON public.products FOR EACH ROW WHEN ((old.slug IS DISTINCT FROM new.slug)) EXECUTE FUNCTION private.sync_product_slug_route();
alter table public."products" enable row level security;
create policy "Public read active published products" on public."products" as permissive for select to "authenticated", "anon" using (((catalog_status = 'active'::text) AND (published_at <= now())));
grant SELECT on public."products" to "anon";
grant SELECT on public."products" to "authenticated";
grant DELETE on public."products" to "postgres";
grant INSERT on public."products" to "postgres";
grant REFERENCES on public."products" to "postgres";
grant SELECT on public."products" to "postgres";
grant TRIGGER on public."products" to "postgres";
grant TRUNCATE on public."products" to "postgres";
grant UPDATE on public."products" to "postgres";
grant DELETE on public."products" to "service_role";
grant INSERT on public."products" to "service_role";
grant SELECT on public."products" to "service_role";
grant UPDATE on public."products" to "service_role";
alter table public."system_steps" enable row level security;
create policy "Public read System Steps" on public."system_steps" as permissive for select to "authenticated", "anon" using (true);
grant SELECT on public."system_steps" to "anon";
grant SELECT on public."system_steps" to "authenticated";
grant DELETE on public."system_steps" to "postgres";
grant INSERT on public."system_steps" to "postgres";
grant REFERENCES on public."system_steps" to "postgres";
grant SELECT on public."system_steps" to "postgres";
grant TRIGGER on public."system_steps" to "postgres";
grant TRUNCATE on public."system_steps" to "postgres";
grant UPDATE on public."system_steps" to "postgres";
grant SELECT on public."system_steps" to "service_role";
set check_function_bodies = true;

