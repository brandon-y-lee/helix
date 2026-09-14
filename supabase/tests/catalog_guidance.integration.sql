-- Run only through the labeled disposable PostgreSQL checkpoint runner.
begin;
do $$ begin
  if current_database() not like 'helix_catalog_guidance_%' then
    raise exception 'Guidance tests require an isolated Catalog test database';
  end if;
end $$;
select pg_temp.seed_catalog_identity('super-serum', 'Super Serum');

savepoint missing_current_pdp;
do $missing_current_pdp$
#variable_conflict use_variable
declare
  product_id constant uuid := '10000000-0000-4000-8000-000000000101';
  actor_id constant uuid := '10000000-0000-4000-8000-000000000901';
  original_document jsonb := public.get_catalog_editor_document(product_id);
  source_document jsonb;
  result jsonb;
  schema_number integer;
  populated boolean;
  revision_number integer := 1;
  revision_id uuid;
  expected_steps jsonb;
begin
  delete from public.product_pdp_content pdp where pdp.product_id = product_id;
  for schema_number in 1..2 loop
    foreach populated in array array[false,true] loop
      source_document := pg_temp.historical_catalog_identity_document(original_document,schema_number);
      source_document := jsonb_set(source_document,'{productPdpContent}',
        (source_document -> 'productPdpContent') - array[
          'profile_title_tokens','routine_overlay','outcome_heading','outcome_labels',
          'application_steps','ingredient_cards','ingredient_story'
        ]);
      source_document := jsonb_set(source_document,'{productPdpContent,routine_guidance}','"Historical routine guidance."');
      expected_steps := case when populated then '["Historical reviewed step."]'::jsonb else 'null'::jsonb end;
      source_document := case when populated then
        jsonb_set(source_document,'{productPdpContent,how_to_use_steps}',expected_steps)
        else source_document #- '{productPdpContent,how_to_use_steps}' end;
      revision_number := revision_number + 1;
      insert into public.catalog_product_revisions(product_id,revision_number,schema_version,document,published_by)
      values(product_id,revision_number,schema_number,source_document,actor_id) returning id into revision_id;
      result := public.restore_catalog_product_revision(revision_id,actor_id);
      if result ->> 'ok' is distinct from 'true'
         or jsonb_typeof(result #> '{draft,document,productPdpContent}') is distinct from 'object'
         or result #> '{draft,document,productPdpContent,how_to_use_steps}' is distinct from expected_steps
         or result #>> '{draft,document,productPdpContent,routine_guidance}' is distinct from 'Historical routine guidance.'
         or result #>> '{draft,document,productPdpContent,product_id}' is distinct from product_id::text
         or (select array_agg(k order by k) from jsonb_object_keys(result #> '{draft,document,productPdpContent}') k)
            is distinct from (select array_agg(k order by k) from jsonb_object_keys(original_document -> 'productPdpContent') k)
         or result #>> '{draft,document,product,display_name}' is distinct from 'Super Serum' then
        raise exception 'V% Restore with current PDP absent did not preserve reviewable historical content (populated=%)',schema_number,populated;
      end if;
      if populated then
        result := public.transition_catalog_product_draft((result #>> '{draft,id}')::uuid,1,'ready','[]',actor_id);
        result := public.publish_catalog_product_draft((result #>> '{draft,id}')::uuid,2,actor_id,'admin','[]');
        if result ->> 'ok' is distinct from 'true' then raise exception 'Restored historical PDP did not publish'; end if;
        revision_number := revision_number + 1;
        delete from public.product_pdp_content pdp where pdp.product_id = product_id;
      else
        if not (result #> '{draft,validation_errors}' @> '[{"code":"guidance_review_required"}]'::jsonb) then
          raise exception 'Missing historical instructions gained implied approval';
        end if;
        perform public.transition_catalog_product_draft((result #>> '{draft,id}')::uuid,1,'discard','[]',actor_id);
      end if;
      raise notice 'PASS Restore V% with current PDP absent preserves historical object and source steps (populated=%)',schema_number,populated;
    end loop;
  end loop;
end;
$missing_current_pdp$;
rollback to missing_current_pdp;

savepoint malformed_history;
do $malformed_history$
declare
  source_document jsonb := public.get_catalog_editor_document('10000000-0000-4000-8000-000000000101');
  revision_id uuid;
  malformed jsonb;
  revision_number integer := 1;
  before_state jsonb;
  rejected boolean;
begin
  for malformed in select value from jsonb_array_elements('[[],"unsupported",{"schema_version":2,"product_id":"10000000-0000-4000-8000-000000000101"}]'::jsonb) loop
    revision_number := revision_number + 1;
    insert into public.catalog_product_revisions(product_id,revision_number,schema_version,document,published_by)
    values('10000000-0000-4000-8000-000000000101',revision_number,4,
      jsonb_set(source_document,'{productPdpContent}',malformed),'10000000-0000-4000-8000-000000000901') returning id into revision_id;
    before_state := pg_temp.catalog_identity_state();
    rejected := false;
    begin
      perform public.restore_catalog_product_revision(revision_id,'10000000-0000-4000-8000-000000000901');
    exception when invalid_parameter_value then rejected := true;
    end;
    if not rejected or pg_temp.catalog_identity_state() is distinct from before_state then
      raise exception 'Malformed historical PDP content silently restored or changed state';
    end if;
  end loop;
  raise notice 'PASS malformed or unsupported historical PDP content fails closed without changing history';
end;
$malformed_history$;
rollback to malformed_history;

do $restore$
#variable_conflict use_variable
declare
  product_id constant uuid := '10000000-0000-4000-8000-000000000101';
  actor_id constant uuid := '10000000-0000-4000-8000-000000000901';
  current_document jsonb := public.get_catalog_editor_document(product_id);
  source_document jsonb;
  result jsonb;
  before_state jsonb;
  field_name text;
  schema_number integer;
  scenario text;
  revision_number integer := 1;
  revision_id uuid;
  draft_id uuid;
  expected_steps jsonb;
  rejected boolean;
begin
  for schema_number in 1..4 loop
    foreach scenario in array array['absent_pdp','null_pdp','absent_steps','null_steps','empty','populated'] loop
      source_document := pg_temp.historical_catalog_identity_document(current_document, schema_number);
      expected_steps := case scenario when 'empty' then '[]'::jsonb
        when 'populated' then '["Reviewed historical instruction."]'::jsonb else 'null'::jsonb end;
      source_document := case scenario
        when 'absent_pdp' then source_document - 'productPdpContent'
        when 'null_pdp' then jsonb_set(source_document,'{productPdpContent}','null')
        when 'absent_steps' then source_document #- '{productPdpContent,how_to_use_steps}'
        else jsonb_set(source_document,'{productPdpContent,how_to_use_steps}',expected_steps) end;
      revision_number := revision_number + 1;
      insert into public.catalog_product_revisions(product_id,revision_number,schema_version,document,published_by)
      values(product_id,revision_number,schema_number,source_document,actor_id) returning id into revision_id;
      before_state := pg_temp.catalog_identity_state();
      result := public.restore_catalog_product_revision(revision_id,actor_id);
      draft_id := (result #>> '{draft,id}')::uuid;
      if result ->> 'ok' is distinct from 'true'
         or result #>> '{draft,status}' is distinct from 'draft'
         or coalesce(result #> '{draft,document,productPdpContent,how_to_use_steps}','null'::jsonb)
            is distinct from expected_steps then
        raise exception 'V% % Restore lost source guidance or inherited current guidance',schema_number,scenario;
      end if;
      if (scenario in ('empty','populated') and result #> '{draft,validation_errors}' <> '[]'::jsonb)
         or (scenario not in ('empty','populated') and not (
           result #> '{draft,validation_errors}' @> '[{"code":"guidance_review_required"}]'::jsonb)) then
        raise exception 'V% % Restore did not expose the correct review state',schema_number,scenario;
      end if;
      foreach field_name in array array['slug','display_name','seo_title','seo_description','search_keywords'] loop
        if result #> array['draft','document','product',field_name]
           is distinct from current_document #> array['product',field_name] then
          raise exception 'V% % Restore changed current identity field %',schema_number,scenario,field_name;
        end if;
      end loop;
      if (pg_temp.catalog_identity_state() - array['product_content_drafts','catalog_editor_audit_log'])
         is distinct from (before_state - array['product_content_drafts','catalog_editor_audit_log']) then
        raise exception 'V% % Restore rewrote canonical or immutable historical data',schema_number,scenario;
      end if;
      if scenario in ('empty','populated') then
        result := public.transition_catalog_product_draft(draft_id,1,'ready','[]',actor_id);
        result := public.publish_catalog_product_draft(draft_id,2,actor_id,'admin','[]');
        if result ->> 'ok' is distinct from 'true'
           or to_jsonb((select pdp.how_to_use_steps from public.product_pdp_content pdp where pdp.product_id = product_id))
              is distinct from expected_steps then
          raise exception 'V% % reviewed Restore did not publish exact source guidance: %',schema_number,scenario,result;
        end if;
        revision_number := revision_number + 1;
      else
        before_state := pg_temp.catalog_identity_state();
        rejected := false;
        begin
          perform public.transition_catalog_product_draft(draft_id,1,'ready','[]',actor_id);
        exception when check_violation then rejected := true;
        end;
        if not rejected or pg_temp.catalog_identity_state() is distinct from before_state then
          raise exception 'V% % unreviewed Restore bypassed Ready',schema_number,scenario;
        end if;
        result := public.transition_catalog_product_draft(draft_id,1,'discard','[]',actor_id);
        if result ->> 'ok' <> 'true' or result #>> '{draft,status}' <> 'discarded' then
          raise exception 'V% % incomplete draft could not be discarded',schema_number,scenario;
        end if;
      end if;
      raise notice 'PASS Restore V% % preserves source guidance, current identity and immutable history',schema_number,scenario;
    end loop;
  end loop;
end;
$restore$;

do $editing$
#variable_conflict use_variable
declare
  product_id constant uuid := '10000000-0000-4000-8000-000000000101';
  actor_id constant uuid := '10000000-0000-4000-8000-000000000901';
  draft_id uuid;
  result jsonb;
  document jsonb;
  original_document jsonb;
  before_state jsonb;
  invalid_steps jsonb;
  rejected boolean;
  draft_version bigint;
begin
  -- A genuinely new draft of a Product with no PDP row is still editable.
  delete from public.product_pdp_content pdp where pdp.product_id = product_id;
  result := public.create_catalog_product_draft(product_id,actor_id);
  draft_id := (result #>> '{draft,id}')::uuid;
  if result ->> 'created' is distinct from 'true'
     or not (result #> '{draft,validation_errors}' @> '[{"code":"guidance_review_required"}]'::jsonb) then
    raise exception 'New incomplete draft did not expose reviewable guidance';
  end if;
  original_document := result #> '{draft,document}';
  document := jsonb_set(original_document,'{productPdpContent}',jsonb_build_object(
    'product_id',product_id,'schema_version',1,'how_to_use_steps',null));
  result := public.save_catalog_product_draft(draft_id,1,document,actor_id,'admin');
  if result ->> 'ok' is distinct from 'true'
     or result #>> '{draft,status}' <> 'draft'
     or not (result #> '{draft,validation_errors}' @> '[{"code":"guidance_review_required"}]'::jsonb) then
    raise exception 'Saving incomplete guidance did not remain reviewable';
  end if;
  -- A forged empty validation input cannot erase the SQL-owned issues, while
  -- issues owned by other contracts survive and stale guidance issues go away.
  result := public.transition_catalog_product_draft(draft_id,2,'validate',
    '[{"path":"media","code":"media_review_required","message":"Keep media issue"},{"path":"other","code":"custom","message":"Keep custom issue"},{"message":"No code remains"},{"code":null},{"code":"guidance_invalid_steps","message":"Stale"}]',actor_id);
  if result #> '{draft,validation_errors}' @> '[{"code":"guidance_invalid_steps"}]'::jsonb
     or not (result #> '{draft,validation_errors}' @> '[{"code":"guidance_review_required"},{"code":"media_review_required"},{"code":"custom"}]'::jsonb)
     or not (result #> '{draft,validation_errors}' @> '[{"message":"No code remains"},{"code":null}]'::jsonb)
     or jsonb_array_length(result #> '{draft,validation_errors}') <> 5 then
    raise exception 'Guidance validation removed other contracts or kept stale guidance issues';
  end if;
  if not exists (select 1 from public.catalog_editor_audit_log audit
    where audit.draft_id = draft_id and audit.action = 'draft.validated'
      and audit.metadata ->> 'validationErrorCount' = '5') then
    raise exception 'Validation audit count does not reflect stored validation errors';
  end if;
  draft_version := 3;
  for invalid_steps in select value from jsonb_array_elements('[null,"paragraph",{},[""],["  "],["\t\n"],["\u00a0\u2003\ufeff"],[null],[23],[{}],["Valid",false]]'::jsonb) loop
    document := jsonb_set(document,'{productPdpContent,how_to_use_steps}',invalid_steps);
    result := public.save_catalog_product_draft(draft_id,draft_version,document,actor_id,'admin');
    draft_version := draft_version + 1;
    if result ->> 'ok' is distinct from 'true' or result #> '{draft,validation_errors}' = '[]'::jsonb then
      raise exception 'Invalid steps % could not be saved for review',invalid_steps;
    end if;
    before_state := pg_temp.catalog_identity_state();
    rejected := false;
    begin
      perform public.transition_catalog_product_draft(draft_id,draft_version,'ready','[]',actor_id);
    exception when check_violation then rejected := true;
    end;
    if not rejected or pg_temp.catalog_identity_state() is distinct from before_state then
      raise exception 'Invalid steps % bypassed Ready or left partial changes',invalid_steps;
    end if;
    rejected := false;
    begin
      update public.product_content_drafts set status = 'published',validation_errors = '[]' where id = draft_id;
    exception when check_violation then rejected := true;
    end;
    if not rejected or pg_temp.catalog_identity_state() is distinct from before_state then
      raise exception 'Invalid steps % bypassed direct published transition',invalid_steps;
    end if;
  end loop;
  -- Explicit [] is an authored choice; saving it clears only guidance codes.
  document := jsonb_set(document,'{productPdpContent,how_to_use_steps}','[]');
  update public.product_content_drafts set document = document,
    validation_errors = '[{"code":"guidance_review_required"},{"code":"media_review_required"}]'
    where id = draft_id returning to_jsonb(product_content_drafts) into result;
  if result -> 'validation_errors' is distinct from '[{"code":"media_review_required"}]'::jsonb then
    raise exception 'Repair failed to remove only its own guidance issues';
  end if;
  result := public.save_catalog_product_draft(draft_id,draft_version,document,actor_id,'admin');
  draft_version := draft_version + 1;
  result := public.transition_catalog_product_draft(draft_id,draft_version,'ready','[]',actor_id);
  draft_version := draft_version + 1;
  result := public.publish_catalog_product_draft(draft_id,draft_version,actor_id,'admin','[]');
  if result ->> 'ok' is distinct from 'true'
     or (select pdp.how_to_use_steps from public.product_pdp_content pdp where pdp.product_id = product_id) is distinct from '{}'::text[] then
    raise exception 'Explicitly authored empty guidance did not publish: %',result;
  end if;
  result := public.create_catalog_product_draft(product_id,actor_id);
  draft_id := (result #>> '{draft,id}')::uuid;
  document := jsonb_set(result #> '{draft,document}','{productPdpContent,how_to_use_steps}',
    '["A reviewed first step.","A reviewed second step."]');
  result := public.save_catalog_product_draft(draft_id,1,document,actor_id,'admin');
  result := public.transition_catalog_product_draft(draft_id,2,'ready','[]',actor_id);
  result := public.publish_catalog_product_draft(draft_id,3,actor_id,'admin','[]');
  if result ->> 'ok' is distinct from 'true'
     or (select pdp.how_to_use_steps from public.product_pdp_content pdp where pdp.product_id = product_id)
        is distinct from array['A reviewed first step.','A reviewed second step.'] then
    raise exception 'Reviewed populated guidance did not publish: %',result;
  end if;
  raise notice 'PASS new draft, incomplete save/validate/discard, eleven malformed Ready/direct-Publish cases, repair, empty and populated Publish';
end;
$editing$;

select public.create_catalog_product_draft('10000000-0000-4000-8000-000000000101','10000000-0000-4000-8000-000000000901');
set local role service_role;
do $direct_service$
declare
  draft public.product_content_drafts%rowtype;
  rejected boolean := false;
begin
  update public.product_content_drafts set document = jsonb_set(document,'{productPdpContent,how_to_use_steps}','null'),
    validation_errors = '[]' where status = 'draft' returning * into strict draft;
  if not (draft.validation_errors @> '[{"code":"guidance_review_required"}]'::jsonb) then
    raise exception 'Direct service draft write did not execute its permitted validation helper';
  end if;
  begin
    update public.product_content_drafts set status = 'ready',validation_errors = '[]' where id = draft.id;
  exception when check_violation then rejected := true;
  end;
  if not rejected then raise exception 'Direct service write bypassed Ready guidance'; end if;
  raise notice 'PASS service_role direct writes can save incomplete drafts and cannot bypass Ready';
end;
$direct_service$;
set local role postgres;

do $permissions$
declare
  routine regprocedure;
begin
  foreach routine in array array[
    'private.catalog_guidance_validation_errors(jsonb)'::regprocedure,
    'private.catalog_restore_guidance(jsonb,jsonb)'::regprocedure,
    'private.enforce_catalog_draft_guidance()'::regprocedure
  ] loop
    if has_function_privilege('anon',routine,'execute')
       or has_function_privilege('authenticated',routine,'execute')
       or not exists (select 1 from pg_proc where oid = routine and not prosecdef and 'search_path=""' = any(proconfig)) then
      raise exception 'Guidance helper % gained public access, elevated authority, or unsafe search path',routine;
    end if;
  end loop;
  if has_function_privilege('anon','public.restore_catalog_product_revision(uuid,uuid)','execute')
     or has_function_privilege('authenticated','public.restore_catalog_product_revision(uuid,uuid)','execute')
     or not has_function_privilege('service_role','public.restore_catalog_product_revision(uuid,uuid)','execute') then
    raise exception 'Restore RPC grants changed';
  end if;
  raise notice 'PASS private guidance helpers preserve narrow grants and fixed search paths';
end;
$permissions$;
set constraints all immediate;
rollback;
