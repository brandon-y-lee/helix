-- Actual combined database behavior, after guarded resolver/dispatcher removal
-- and real verified-copy cutover/activation. Matrix scenarios roll back; the
-- canonical rename commits before its separate public-read transaction, matching
-- an actual reader after publication. The unique database is then destroyed.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '90s';
do $history_negative_control$
declare
  expected jsonb := pg_temp.current_contract_state();
  rejected boolean := false;
begin
  -- This synthetic older baseline lacks a key present in the stored revision.
  -- A containment comparison would wrongly certify an added historical field.
  expected := expected #- '{catalog_product_revisions,0,document,product,display_name}';
  begin
    perform pg_temp.assert_current_history_rows(expected);
  exception when raise_exception then
    if sqlerrm <> 'Current contract: existing catalog_product_revisions rows changed or disappeared' then raise; end if;
    rejected := true;
  end;
  perform pg_temp.assert_current_contract(rejected, 'history comparison accepted nested historical augmentation');
  raise notice 'PASS history negative control rejects nested historical augmentation instead of accepting containment';
end $history_negative_control$;
do $boundary$
declare role_name text; routine text;
begin
  if current_database() not like 'helix_catalog_current_%' then
    raise exception 'Current contract tests require their unique disposable database';
  end if;
  perform pg_temp.assert_current_contract((select enabled from private.catalog_media_policy),
    'combined matrix requires active media enforcement');
  perform pg_temp.assert_current_contract(to_regprocedure('private.catalog_editor_upgrade_to_v3(jsonb)') is null
    and to_regprocedure('public.resolve_product_slug(text)') is null,
    'retired executable APIs remain');
  foreach routine in array array[
    'private.catalog_editor_upgrade_v1_to_v2(jsonb)',
    'private.catalog_editor_upgrade_v2_to_v3(jsonb)',
    'private.catalog_editor_upgrade_v3_to_v4(jsonb)',
    'private.catalog_editor_upgrade_to_v4_without_family(jsonb)',
    'private.catalog_editor_upgrade_to_v4(jsonb)',
    'public.restore_catalog_product_revision(uuid,uuid)',
    'public.publish_catalog_product_draft(uuid,bigint,uuid,text,jsonb)'
  ] loop
    perform pg_temp.assert_current_contract(to_regprocedure(routine) is not null,
      'required historical decoder or current publisher disappeared: ' || routine);
  end loop;
  foreach role_name in array array['anon','authenticated'] loop
    perform pg_temp.assert_current_contract(
      not has_any_column_privilege(role_name,'public.product_slug_routes','SELECT')
      and not has_function_privilege(role_name,'public.restore_catalog_product_revision(uuid,uuid)','EXECUTE')
      and not has_function_privilege(role_name,'public.publish_catalog_product_draft(uuid,bigint,uuid,text,jsonb)','EXECUTE'),
      'public role retained private history or publication authority');
    execute format('set local role %I',role_name);
    begin
      perform source_slug from public.product_slug_routes;
      raise exception 'public role read private reservation history';
    exception when insufficient_privilege then null;
    end;
    begin
      perform * from public.resolve_product_slug('super-serum');
      raise exception 'public role called retired resolver';
    exception when undefined_function then null;
    end;
    reset role;
  end loop;
  set local role service_role;
  if (select count(*) from public.product_slug_routes) <> 2 then
    raise exception 'service role cannot read complete private reservations';
  end if;
  reset role;
  perform pg_temp.assert_current_contract(not has_table_privilege('service_role','public.product_slug_routes',
    'INSERT,UPDATE,DELETE,TRUNCATE'), 'service role can forge private ledger rows');
  raise notice 'PASS actual public role denial, service-only reservations and retained V1–V4 execution chain';
end $boundary$;

do $restore_matrix$
#variable_conflict use_variable
declare
  product_id constant uuid := '10000000-0000-4000-8000-000000000101';
  actor_id constant uuid := '10000000-0000-4000-8000-000000000901';
  retained constant jsonb := '["slug","display_name","seo_title","seo_description","search_keywords"]';
  source_url text := (select c.source_url from private.verified_media_copies c where c.product_id=product_id);
  target_url text := (select c.target_url from private.verified_media_copies c where c.product_id=product_id);
  before_state jsonb;
  current_document jsonb;
  source_document jsonb;
  working jsonb;
  expected_steps jsonb;
  result jsonb;
  schema_number integer;
  revision_number integer;
  revision_id uuid;
  draft_id uuid;
  draft_version bigint;
  guidance text;
  mapped boolean;
  need_guidance boolean;
  need_media boolean;
  correct_guidance boolean;
  step integer;
begin
  for schema_number in 1..4 loop
    foreach guidance in array array['missing','empty','populated'] loop
      foreach mapped in array array[true,false] loop
        current_document := public.get_catalog_editor_document(product_id);
        source_document := pg_temp.historical_catalog_identity_document(current_document,schema_number);
        expected_steps := case guidance when 'empty' then '[]'::jsonb
          when 'populated' then '["Reviewed historical step."]'::jsonb else 'null'::jsonb end;
        source_document := case when guidance='missing'
          then source_document #- '{productPdpContent,how_to_use_steps}'
          else jsonb_set(source_document,'{productPdpContent,how_to_use_steps}',expected_steps) end;
        source_document := jsonb_set(source_document,'{media,0,url}',to_jsonb(case when mapped then source_url
          else 'https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/helix-catalog/products/synthetic-serum/unmapped.webp' end));
        select coalesce(max(r.revision_number),0)+1 into revision_number
          from public.catalog_product_revisions r where r.product_id=product_id;
        insert into public.catalog_product_revisions(product_id,revision_number,schema_version,document,published_by)
          values(product_id,revision_number,schema_number,source_document,actor_id) returning id into revision_id;
        before_state := pg_temp.current_contract_state();
        result := public.restore_catalog_product_revision(revision_id,actor_id);
        draft_id := (result #>> '{draft,id}')::uuid;
        working := result #> '{draft,document}';
        draft_version := (result #>> '{draft,version}')::bigint;
        need_guidance := guidance='missing';
        need_media := not mapped;
        perform pg_temp.assert_current_contract(result->>'ok'='true' and result->'retainedFields'=retained
          and result #>> '{draft,status}'='draft' and result #>> '{draft,schema_version}'='4'
          and result #>> '{draft,base_revision}'=revision_number::text,
          'Restore did not expose the current repairable draft contract');
        perform pg_temp.assert_current_identity(working,current_document);
        perform pg_temp.assert_current_contract(working #>> '{media,0,url}'=case when mapped then target_url
          else source_document #>> '{media,0,url}' end, 'Restore mapping ignored verified copy evidence');
        perform pg_temp.assert_current_contract(working #> '{productPdpContent,how_to_use_steps}'=expected_steps,
          'Restore inherited live guidance or changed authored historical steps');
        perform pg_temp.assert_current_contract(
          (result #> '{draft,validation_errors}' @> '[{"code":"guidance_review_required"}]')=need_guidance
          and (result #> '{draft,validation_errors}' @> '[{"code":"retired_media_reference"}]')=need_media,
          'Restore lost independent actionable guidance or media errors');
        perform pg_temp.assert_current_contract((pg_temp.current_contract_state()
          - array['product_content_drafts','catalog_editor_audit_log'])
          = (before_state - array['product_content_drafts','catalog_editor_audit_log']),
          'Restore changed canonical facts, immutable revisions, media evidence or historical Orders');
        perform pg_temp.assert_current_contract(exists(select 1 from public.catalog_editor_audit_log a
          where a.draft_id=draft_id and a.action='draft.restored' and a.revision_id=revision_id
            and a.metadata->'retainedFields'=retained
            and a.metadata->>'restoredSchemaVersion'=schema_number::text),
          'composed Restore omitted identity/history audit disclosure');

        if need_guidance or need_media then
          perform pg_temp.expect_current_rejection(format(
            'select public.transition_catalog_product_draft(%L,%s,''ready'',''[]'',%L)',draft_id,draft_version,actor_id),array['23514']);
          perform pg_temp.expect_current_rejection(format(
            'update public.product_content_drafts set status=''published'',validation_errors=''[]'' where id=%L',draft_id),array['23514']);
          working := pg_temp.current_contract_state();
          result := public.publish_catalog_product_draft(draft_id,draft_version,actor_id,'admin','[]');
          perform pg_temp.assert_current_contract(result->>'code'='draft_not_ready'
            and pg_temp.current_contract_state()=working, 'incomplete draft published or changed state');
          working := (select document from public.product_content_drafts where id=draft_id);
          result := public.transition_catalog_product_draft(draft_id,draft_version,'validate',
            '[{"code":"independent_review","path":"other","message":"Separate operator review"}]',actor_id);
          draft_version := (result #>> '{draft,version}')::bigint;
          perform pg_temp.assert_current_contract(result #> '{draft,validation_errors}' @> '[{"code":"independent_review"}]'
            and (result #> '{draft,validation_errors}' @> '[{"code":"guidance_review_required"}]')=need_guidance
            and (result #> '{draft,validation_errors}' @> '[{"code":"retired_media_reference"}]')=need_media,
            'one validator removed another contract or an unknown issue');
          perform pg_temp.assert_current_contract(exists(select 1 from public.catalog_editor_audit_log a
            where a.draft_id=draft_id and a.action='draft.validated'
              and (a.metadata->>'version')::bigint=draft_version
              and (a.metadata->>'validationErrorCount')::integer=jsonb_array_length(result #> '{draft,validation_errors}')),
            'validation audit omitted database-owned correction issues');
        end if;

        -- Alternate repair order when both fields need correction. Every Save
        -- recomputes current issues; repairing one cannot erase the other.
        for step in 1..2 loop
          exit when not need_guidance and not need_media;
          correct_guidance := need_guidance and (not need_media or schema_number % 2=1);
          if correct_guidance then
            expected_steps := case when schema_number % 2=1 then '[]'::jsonb
              else '["Reviewed replacement step."]'::jsonb end;
            working := jsonb_set(working,'{productPdpContent,how_to_use_steps}',expected_steps);
            need_guidance := false;
          else
            working := jsonb_set(working,'{media,0,url}',to_jsonb(target_url));
            need_media := false;
          end if;
          result := public.save_catalog_product_draft(draft_id,draft_version,working,actor_id,'admin');
          draft_version := (result #>> '{draft,version}')::bigint;
          working := result #> '{draft,document}';
          perform pg_temp.assert_current_contract(result->>'ok'='true'
            and (result #> '{draft,validation_errors}' @> '[{"code":"guidance_review_required"}]')=need_guidance
            and (result #> '{draft,validation_errors}' @> '[{"code":"retired_media_reference"}]')=need_media,
            'repair hid a sibling issue or kept its corrected issue');
          if need_guidance or need_media then
            perform pg_temp.expect_current_rejection(format(
              'select public.transition_catalog_product_draft(%L,%s,''ready'',''[]'',%L)',draft_id,draft_version,actor_id),array['23514']);
          end if;
        end loop;
        result := public.transition_catalog_product_draft(draft_id,draft_version,'ready','[]',actor_id);
        draft_version := (result #>> '{draft,version}')::bigint;
        perform pg_temp.assert_current_contract(result->>'ok'='true'
          and result #> '{draft,validation_errors}'='[]'::jsonb, 'corrected draft cannot become Ready');
        result := public.publish_catalog_product_draft(draft_id,draft_version,actor_id,'admin','[]');
        perform pg_temp.assert_current_contract(result->>'ok'='true', 'corrected draft did not publish through current chain');
        set constraints all immediate;
        perform pg_temp.assert_current_identity(public.get_catalog_editor_document(product_id),current_document);
        perform pg_temp.assert_current_contract(public.get_catalog_editor_document(product_id)
          #> '{productPdpContent,how_to_use_steps}'=expected_steps
          and public.get_catalog_editor_document(product_id) #>> '{media,0,url}'=target_url,
          'Publish changed reviewed steps or resurrected retired media');
        perform pg_temp.assert_current_contract((select max(r.revision_number) from public.catalog_product_revisions r
          where r.product_id=product_id)=revision_number+1, 'Publish did not append exactly one revision');
        perform pg_temp.assert_current_history(before_state);
        raise notice 'PASS composed Restore V% guidance=% media=%: correction, Ready, Publish and immutable facts',
          schema_number,guidance,case when mapped then 'verified' else 'unmapped' end;
      end loop;
    end loop;
  end loop;
end $restore_matrix$;
rollback;

begin;
create temp table before_rename as select pg_temp.current_contract_state() as state;
do $rename$
#variable_conflict use_variable
declare
  product_id constant uuid := '10000000-0000-4000-8000-000000000101';
  target_id constant uuid := '10000000-0000-4000-8000-000000000102';
  actor_id constant uuid := '10000000-0000-4000-8000-000000000901';
  result jsonb;
  document jsonb;
  draft_id uuid;
begin
  result := public.create_catalog_product_draft(product_id,actor_id);
  draft_id := (result #>> '{draft,id}')::uuid;
  document := jsonb_set(result #> '{draft,document}','{product,slug}','"future-serum"');
  document := jsonb_set(document,'{product,display_name}','"Future Reviewed Serum"');
  perform public.save_catalog_product_draft(draft_id,1,document,actor_id,'admin');
  perform public.transition_catalog_product_draft(draft_id,2,'ready','[]',actor_id);
  result := public.publish_catalog_product_draft(draft_id,3,actor_id,'admin','[]');
  perform pg_temp.assert_current_contract(result->>'ok'='true'
    and result #>> '{changedTables,productSlugRoutes}'='true'
    and exists(select 1 from public.product_slug_routes where source_slug='super-serum'
      and source_product_id=product_id and target_product_id=product_id and route_kind='rename')
    and exists(select 1 from public.product_slug_routes where source_slug='future-serum'
      and source_product_id=product_id and target_product_id=product_id and route_kind='canonical'),
    'new canonical publication failed after URL/media/guidance contraction');
end $rename$;
commit;

-- Publish uses clock_timestamp(), whereas public RLS deliberately compares with
-- transaction now(). A real subsequent request starts after the Publish commit.
begin;
do $rename_followup$
#variable_conflict use_variable
declare
  product_id constant uuid := '10000000-0000-4000-8000-000000000101';
  target_id constant uuid := '10000000-0000-4000-8000-000000000102';
  actor_id constant uuid := '10000000-0000-4000-8000-000000000901';
  before_state jsonb := (select state from before_rename);
  result jsonb;
  document jsonb;
  current_document jsonb;
  draft_id uuid;
begin
  set local role anon;
  if not exists(select 1 from public.products where slug='future-serum')
     or exists(select 1 from public.products where slug='super-serum') then
    raise exception 'anonymous direct current Product discovery is stale';
  end if;
  reset role;
  current_document := public.get_catalog_editor_document(product_id);
  result := public.restore_catalog_product_revision('10000000-0000-4000-8000-000000000501',actor_id);
  draft_id := (result #>> '{draft,id}')::uuid;
  perform pg_temp.assert_current_identity(result #> '{draft,document}',current_document);
  perform pg_temp.assert_current_contract(result #> '{draft,validation_errors}'='[]'::jsonb,
    'verified historical media/guidance did not survive later rename Restore');
  perform public.transition_catalog_product_draft(draft_id,1,'ready','[]',actor_id);
  result := public.publish_catalog_product_draft(draft_id,2,actor_id,'admin','[]');
  perform pg_temp.assert_current_contract(result->>'ok'='true', 'later rename Restore did not publish');
  perform pg_temp.assert_current_identity(public.get_catalog_editor_document(product_id),current_document);
  perform pg_temp.assert_current_history(before_state);
  raise notice 'PASS future canonical Publish and subsequent historical Restore retain latest identity, UUID media and Orders';

  result := public.create_catalog_product_draft(product_id,actor_id);
  draft_id := (result #>> '{draft,id}')::uuid;
  document := jsonb_set(result #> '{draft,document}','{product,slug}','"synthetic-cleanser"');
  perform public.save_catalog_product_draft(draft_id,1,document,actor_id,'admin');
  perform public.transition_catalog_product_draft(draft_id,2,'ready','[]',actor_id);
  perform pg_temp.expect_current_rejection(format(
    'select public.publish_catalog_product_draft(%L,3,%L,''admin'',''[]''); set constraints all immediate;',
    draft_id,actor_id),array['23505','23514']);
  perform public.transition_catalog_product_draft(draft_id,3,'discard','[]',actor_id);
  perform pg_temp.expect_current_rejection(format(
    'update public.products set slug=''super-serum'' where id=%L',target_id),array['23505','23514']);
  perform pg_temp.expect_current_rejection(
    'update public.product_slug_routes set source_slug=''rewrite'' where source_slug=''super-serum''',array['55000']);
  perform pg_temp.expect_current_rejection(
    'delete from public.product_slug_routes where source_slug=''super-serum''',array['55000']);
  perform pg_temp.expect_current_rejection(format(
    'select public.replace_catalog_product_slug(%L,%L,%L)',product_id,target_id,actor_id),array['23514']);
  -- Governed replacement uses standalone synthetic Products; the main matrix
  -- above exercised the real Family wrapper without weakening its invariants.
  delete from public.product_family_memberships;
  delete from public.product_families;
  update public.products set catalog_status='archived' where id=product_id;
  set constraints all immediate;
  perform pg_temp.expect_current_rejection(format(
    'select public.replace_catalog_product_slug(%L,%L,null)',product_id,target_id),array['42501']);
  perform pg_temp.expect_current_rejection(format(
    'select public.replace_catalog_product_slug(%L,%L,%L)',product_id,product_id,actor_id),array['23514']);
  result := public.replace_catalog_product_slug(product_id,target_id,actor_id);
  perform pg_temp.assert_current_contract(result->>'ok'='true'
    and (select count(*) from public.product_slug_routes where source_product_id=product_id
      and target_product_id=target_id and route_kind='replacement')=2,
    'governed replacement lost private reservations');
  perform pg_temp.expect_current_rejection(format(
    'update public.products set catalog_status=''active'' where id=%L',product_id),array['23514']);
  perform pg_temp.assert_current_history(before_state);
  raise notice 'PASS composed slug collision atomicity, private history guards and governed replacement integrity';
end $rename_followup$;
rollback;
