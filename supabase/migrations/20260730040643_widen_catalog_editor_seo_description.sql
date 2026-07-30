-- Existing canonical product SEO descriptions include long-form editorial
-- summaries. Keep the field bounded without making current catalog rows
-- impossible to validate and republish.

do $$
declare
  v_definition text;
  v_original text := 'char_length(v_product.seo_description) > 170';
  v_replacement text := 'char_length(v_product.seo_description) > 320';
begin
  select pg_catalog.pg_get_functiondef(
    'public.publish_catalog_product_draft(uuid,bigint,uuid)'::regprocedure
  )
  into v_definition;

  if v_definition is null or pg_catalog.strpos(v_definition, v_original) = 0
  then
    raise exception 'catalog publish SEO guard was not found'
      using errcode = '55000';
  end if;

  execute pg_catalog.replace(v_definition, v_original, v_replacement);
end;
$$;

comment on function public.publish_catalog_product_draft(uuid, bigint, uuid) is
  'Atomically publishes a validated catalog editor draft. SEO descriptions are bounded at 320 characters for canonical compatibility.';
