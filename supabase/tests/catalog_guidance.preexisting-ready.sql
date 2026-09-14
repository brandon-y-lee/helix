-- Loaded after the migration, with a pre-migration Ready draft in this same
-- transaction. The runner rolls the complete scenario back.
do $test$
declare
  draft public.product_content_drafts%rowtype;
  before_state jsonb;
  rejected boolean := false;
begin
  select * into strict draft from public.product_content_drafts where status = 'ready';
  before_state := pg_temp.catalog_identity_state();
  begin
    perform public.publish_catalog_product_draft(draft.id, draft.version,
      '10000000-0000-4000-8000-000000000901', 'admin', '[]');
  exception when check_violation then
    if sqlerrm <> 'Catalog guidance requires review before Ready or Publish.' then raise; end if;
    rejected := true;
  when invalid_text_representation then
    -- Some malformed scalars fail at the existing text[] conversion before
    -- the final draft update. They must still roll the whole publication back.
    if jsonb_typeof(draft.document #> '{productPdpContent,how_to_use_steps}') = 'array' then raise; end if;
    rejected := true;
  end;
  if not rejected or pg_temp.catalog_identity_state() is distinct from before_state then
    raise exception 'Pre-migration Ready guidance % published or left partial Catalog/history/draft changes',
      draft.document #> '{productPdpContent,how_to_use_steps}';
  end if;
  raise notice 'PASS pre-migration Ready guidance % rejects Publish atomically',
    draft.document #> '{productPdpContent,how_to_use_steps}';
end;
$test$;
