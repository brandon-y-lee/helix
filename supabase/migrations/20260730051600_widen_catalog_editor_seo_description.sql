-- Current canonical product copy includes a 360-character SEO description.
-- Keep a finite editor bound without blocking unchanged catalog publication.

do $$
declare
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.publish_catalog_product_draft(uuid,bigint,uuid)'::regprocedure
  )
  into v_definition;

  if pg_catalog.strpos(
    v_definition,
    'char_length(v_product.seo_description) > 320'
  ) = 0 then
    raise exception 'catalog publish SEO guard was not found'
      using errcode = '55000';
  end if;

  v_definition := pg_catalog.replace(
    v_definition,
    'char_length(v_product.seo_description) > 320',
    'char_length(v_product.seo_description) > 400'
  );

  execute v_definition;
end;
$$;

revoke all on function public.publish_catalog_product_draft(
  uuid,
  bigint,
  uuid
) from public, anon, authenticated;
grant execute on function public.publish_catalog_product_draft(
  uuid,
  bigint,
  uuid
) to service_role;

comment on function public.publish_catalog_product_draft(uuid, bigint, uuid) is
  'Atomically publishes a validated catalog editor draft. SEO descriptions are bounded at 400 characters for canonical compatibility.';
