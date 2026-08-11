set lock_timeout = '10s';
set statement_timeout = '60s';

create index product_families_system_step_name_idx
  on public.product_families (system_step_name);

comment on index public.product_families_system_step_name_idx is
  'Covers the Product Family System Step foreign key and step-scoped catalog reads.';

do $harden_refine_family_publication$
declare
  v_product_id uuid;
  v_revision_id uuid;
  v_revision_number integer;
  v_changed integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('mei-pelle-refine-family-143-hardening', 0)
  );

  select product.id, revision.id, revision.revision_number
  into strict v_product_id, v_revision_id, v_revision_number
  from public.products product
  join public.product_family_memberships membership
    on membership.product_id = product.id
  join public.product_families family
    on family.id = membership.family_id
  join public.product_slug_routes route
    on route.source_product_id = product.id
   and route.target_product_id = product.id
   and route.source_slug = 'refine-02-pore-treatment-pads'
   and route.route_kind = 'rename'
  join public.product_slug_routes canonical_route
    on canonical_route.source_product_id = product.id
   and canonical_route.target_product_id = product.id
   and canonical_route.source_slug = 'balancing-prep'
   and canonical_route.route_kind = 'canonical'
  join public.catalog_editor_audit_log family_audit
    on family_audit.product_id = product.id
   and family_audit.action = 'family.published'
   and family_audit.metadata ->> 'source' = 'migration-143'
   and family_audit.metadata ->> 'familyId' = family.id::text
  join public.catalog_product_revisions revision
    on revision.id = family_audit.revision_id
   and revision.product_id = product.id
   and revision.schema_version = 4
  where family.slug = 'refine'
    and family.system_step_name = 'REFINE'
    and membership.option_label = 'General'
    and membership.sort_order = 0
    and membership.is_entry
    and product.slug = 'balancing-prep'
    and product.display_name = 'Balancing Prep'
    and product.status = 'coming_soon'
    and product.catalog_status = 'active';

  if v_product_id is null or v_revision_id is null then
    raise exception 'REFINE family hardening preconditions failed'
      using errcode = '23514';
  end if;

  if (
    select count(*)
    from public.catalog_editor_audit_log audit
    where audit.product_id = v_product_id
      and audit.action = 'slug.rename.published'
      and audit.metadata ->> 'oldSlug' = 'refine-02-pore-treatment-pads'
      and audit.metadata ->> 'newSlug' = 'balancing-prep'
  ) = 0 then
    insert into public.catalog_editor_audit_log (
      action,
      actor_id,
      product_id,
      revision_id,
      metadata
    ) values (
      'slug.rename.published',
      null,
      v_product_id,
      v_revision_id,
      jsonb_build_object(
        'source', 'migration-143-hardening',
        'oldSlug', 'refine-02-pore-treatment-pads',
        'newSlug', 'balancing-prep',
        'revision', v_revision_number,
        'familySlug', 'refine',
        'offerEligible', false
      )
    );
    get diagnostics v_changed = row_count;
    if v_changed <> 1 then
      raise exception 'REFINE family hardening expected one audit event';
    end if;
  end if;

  if (
    select count(*)
    from public.catalog_editor_audit_log audit
    where audit.product_id = v_product_id
      and audit.action = 'slug.rename.published'
      and audit.metadata ->> 'oldSlug' = 'refine-02-pore-treatment-pads'
      and audit.metadata ->> 'newSlug' = 'balancing-prep'
  ) <> 1 then
    raise exception 'REFINE family hardening expected one audit event'
      using errcode = '23514';
  end if;
exception
  when no_data_found or too_many_rows then
    raise exception 'REFINE family hardening preconditions failed'
      using errcode = '23514';
end;
$harden_refine_family_publication$;
