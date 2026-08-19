-- Rebrand only current Public Site Product facts and Product Education.
-- Archived Products remain intact as Catalog history.
do $$
declare
  v_product_rows integer;
  v_pdp_rows integer;
  v_changed integer;
begin
  select count(*)
  into v_product_rows
  from public.products p
  where p.catalog_status = 'active'
    and to_jsonb(p)::text ilike '%Mei Pelle%';

  if v_product_rows <> 10 then
    raise exception
      'Expected 10 active Product branding rows before helix rebrand, found %',
      v_product_rows
      using errcode = '23514';
  end if;

  select count(*)
  into v_pdp_rows
  from public.product_pdp_content c
  join public.products p on p.id = c.product_id
  where p.catalog_status = 'active'
    and to_jsonb(c)::text ilike '%Mei Pelle%';

  if v_pdp_rows <> 1 then
    raise exception
      'Expected 1 active Product Education branding row before helix rebrand, found %',
      v_pdp_rows
      using errcode = '23514';
  end if;

  update public.products p
  set
    seo_title = replace(p.seo_title, 'Mei Pelle', 'helix'),
    editorial_description = replace(
      p.editorial_description,
      'Mei Pelle',
      'helix'
    ),
    formula_notes = coalesce(
      (
        select array_agg(
          replace(formula_note, 'Mei Pelle', 'helix')
          order by ordinality
        )
        from unnest(p.formula_notes) with ordinality
          as notes(formula_note, ordinality)
      ),
      '{}'::text[]
    )
  where p.catalog_status = 'active'
    and to_jsonb(p)::text ilike '%Mei Pelle%';

  get diagnostics v_changed = row_count;
  if v_changed <> 10 then
    raise exception
      'Expected to update 10 active Product branding rows, updated %',
      v_changed
      using errcode = '23514';
  end if;

  update public.product_pdp_content c
  set
    how_to_use_steps = (
      select array_agg(
        replace(step, 'Mei Pelle', 'helix')
        order by ordinality
      )
      from unnest(c.how_to_use_steps) with ordinality
        as steps(step, ordinality)
    ),
    application_steps = (
      select array_agg(
        replace(step, 'Mei Pelle', 'helix')
        order by ordinality
      )
      from unnest(c.application_steps) with ordinality
        as steps(step, ordinality)
    ),
    routine_guidance = replace(c.routine_guidance, 'Mei Pelle', 'helix'),
    updated_at = now()
  from public.products p
  where p.id = c.product_id
    and p.catalog_status = 'active'
    and to_jsonb(c)::text ilike '%Mei Pelle%';

  get diagnostics v_changed = row_count;
  if v_changed <> 1 then
    raise exception
      'Expected to update 1 active Product Education branding row, updated %',
      v_changed
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.products p
    where p.catalog_status = 'active'
      and to_jsonb(p)::text ilike '%Mei Pelle%'
  ) then
    raise exception
      'Active Product branding still contains Mei Pelle after migration'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.product_pdp_content c
    join public.products p on p.id = c.product_id
    where p.catalog_status = 'active'
      and to_jsonb(c)::text ilike '%Mei Pelle%'
  ) then
    raise exception
      'Active Product Education still contains Mei Pelle after migration'
      using errcode = '23514';
  end if;
end;
$$;
