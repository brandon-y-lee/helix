-- Prepare this additive contract before deploying structured-only guidance.
-- Historical revisions remain immutable; incomplete drafts remain repairable.
set lock_timeout = '10s';
set statement_timeout = '120s';

create function private.catalog_guidance_validation_errors(p_document jsonb)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_steps jsonb := p_document #> '{productPdpContent,how_to_use_steps}';
  v_step jsonb;
  -- The ECMAScript trim whitespace set, shared with the editor's text check.
  v_whitespace constant text := U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
  v_invalid boolean := false;
begin
  if v_steps is null or jsonb_typeof(v_steps) = 'null' then
    return jsonb_build_array(jsonb_build_object(
      'path', 'productPdpContent.how_to_use_steps',
      'code', 'guidance_review_required',
      'message', 'Review the usage instructions before Publish. Add approved steps or explicitly confirm that no How to Use section is intended.'
    ));
  end if;
  if jsonb_typeof(v_steps) <> 'array' then
    v_invalid := true;
  else
    for v_step in select value from jsonb_array_elements(v_steps) loop
      if jsonb_typeof(v_step) <> 'string'
         or btrim(v_step #>> '{}', v_whitespace) = '' then
        v_invalid := true;
        exit;
      end if;
    end loop;
  end if;
  if v_invalid then
    return jsonb_build_array(jsonb_build_object(
      'path', 'productPdpContent.how_to_use_steps',
      'code', 'guidance_invalid_steps',
      'message', 'Each usage instruction must contain text. Remove empty steps or explicitly confirm that no How to Use section is intended.'
    ));
  end if;
  return '[]'::jsonb;
end;
$$;

create function private.catalog_restore_guidance(p_document jsonb, p_source jsonb)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_source jsonb := p_source -> 'productPdpContent';
  v_decoded jsonb := p_document -> 'productPdpContent';
  v_metadata jsonb;
begin
  -- Historical decoders can overlay current PDP fields. The original revision
  -- alone determines whether its instructions were reviewed, absent or null.
  if v_source is null or jsonb_typeof(v_source) = 'null' then
    return jsonb_set(p_document, '{productPdpContent}', 'null'::jsonb);
  end if;
  if jsonb_typeof(v_source) <> 'object'
     or v_source -> 'schema_version' is distinct from '1'::jsonb
     or v_source -> 'product_id' is distinct from p_document -> 'productId' then
    raise exception 'Historical PDP content cannot be restored under the current guidance contract.'
      using errcode = '22023';
  end if;
  if jsonb_typeof(v_decoded) = 'array' then
    -- V1/V2's current-row merge yields [null, source, identity metadata] when
    -- the current Product has no PDP row. Recognize only that exact decoder
    -- result; never treat an arbitrary malformed historical array as content.
    v_metadata := v_decoded -> 2;
    if p_source ->> 'schemaVersion' not in ('1', '2')
       or jsonb_array_length(v_decoded) <> 3
       or v_decoded -> 0 is distinct from 'null'::jsonb
       or v_decoded -> 1 is distinct from v_source
       or v_source - array[
         'product_id','schema_version','profile_title_tokens','routine_overlay',
         'outcome_heading','outcome_labels','how_to_use_steps','application_steps',
         'ingredient_cards','ingredient_story','routine_guidance','created_at','updated_at'
       ] is distinct from '{}'::jsonb
       or jsonb_typeof(v_metadata) is distinct from 'object'
       or v_metadata - array['product_id','created_at','updated_at'] is distinct from '{}'::jsonb
       or v_metadata -> 'product_id' is distinct from p_document -> 'productId'
       or jsonb_typeof(v_metadata -> 'created_at') is distinct from 'string'
       or jsonb_typeof(v_metadata -> 'updated_at') is distinct from 'string'
       or coalesce(v_metadata ->> 'created_at', '') = ''
       or coalesce(v_metadata ->> 'updated_at', '') = '' then
      raise exception 'Historical PDP content cannot be restored under the current guidance contract.'
        using errcode = '22023';
    end if;
    -- Supply only absent nullable current-row fields. Do not copy live editorial
    -- data or cast instruction values before they have passed guidance review.
    v_decoded := jsonb_build_object(
      'profile_title_tokens', null, 'routine_overlay', null,
      'outcome_heading', null, 'outcome_labels', null,
      'application_steps', null, 'ingredient_cards', null,
      'ingredient_story', null, 'routine_guidance', null
    ) || v_source || v_metadata;
  elsif jsonb_typeof(v_decoded) is distinct from 'object' then
    raise exception 'Historical PDP content cannot be restored under the current guidance contract.'
      using errcode = '22023';
  end if;
  v_decoded := v_decoded || jsonb_build_object('how_to_use_steps',
    coalesce(v_source -> 'how_to_use_steps', 'null'::jsonb));
  return jsonb_set(p_document, '{productPdpContent}', v_decoded);
end;
$$;

create function private.enforce_catalog_draft_guidance()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_errors jsonb := private.catalog_guidance_validation_errors(new.document);
  v_source_errors jsonb := '[]'::jsonb;
begin
  -- Recompute this contract's issues only. Other independent validation
  -- contracts retain their entries and ordering, including unknown issue shapes.
  select coalesce(jsonb_agg(issue order by ordinal), '[]'::jsonb) || v_errors
    into new.validation_errors
  from jsonb_array_elements(new.validation_errors) with ordinality as entries(issue, ordinal)
  where coalesce(issue ->> 'code', '') not in (
    'guidance_review_required', 'guidance_invalid_steps'
  );

  if tg_op = 'UPDATE' and new.status = 'published' then
    -- The existing publisher writes its canonicalized output into NEW. Check
    -- the original Ready document too: numeric JSON cannot become approved text
    -- by passing through the database text[] conversion during publication.
    v_source_errors := private.catalog_guidance_validation_errors(old.document);
  end if;
  if new.status in ('ready', 'published')
     and (jsonb_array_length(v_errors) > 0 or jsonb_array_length(v_source_errors) > 0) then
    raise exception 'Catalog guidance requires review before Ready or Publish.'
      using errcode = '23514', detail = (v_errors || v_source_errors)::text;
  end if;
  return new;
end;
$$;

revoke all on function private.catalog_guidance_validation_errors(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.catalog_restore_guidance(jsonb, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.enforce_catalog_draft_guidance()
  from public, anon, authenticated, service_role;
-- Existing privileged direct draft writes also execute this invoker trigger.
grant execute on function private.catalog_guidance_validation_errors(jsonb),
  private.enforce_catalog_draft_guidance() to service_role;

create trigger product_content_drafts_reviewed_guidance
before insert or update of document, status, validation_errors
on public.product_content_drafts
for each row execute function private.enforce_catalog_draft_guidance();

-- Preserve T1's identity overlay and every historical decoder. Insert only the
-- guidance provenance step after decoding and its unsupported-schema guard.
do $patch_restore$
declare
  v_definition text := pg_get_functiondef('public.restore_catalog_product_revision(uuid,uuid)'::regprocedure);
  v_anchor constant text := '  -- Apply the current identity to every supported revision schema, including V4.';
  v_insertion constant text := E'  v_document := private.catalog_restore_guidance(v_document, v_revision.document);\n\n';
begin
  if (length(v_definition) - length(replace(v_definition, v_anchor, ''))) / length(v_anchor) <> 1
     or position(v_insertion in v_definition) > 0 then
    raise exception 'Restore guidance insertion requires the reviewed current-identity function';
  end if;
  execute replace(v_definition, v_anchor, v_insertion || v_anchor);
end;
$patch_restore$;

-- The trigger returns authoritative validation errors. Log the stored count,
-- including SQL-owned issues, rather than the caller's pre-trigger array size.
do $patch_validation_audit$
declare
  v_definition text := pg_get_functiondef('public.transition_catalog_product_draft(uuid,bigint,text,jsonb,uuid)'::regprocedure);
  v_old constant text := '''validationErrorCount'', jsonb_array_length(p_validation_errors)';
  v_new constant text := '''validationErrorCount'', jsonb_array_length(v_draft.validation_errors)';
begin
  if (length(v_definition) - length(replace(v_definition, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'Draft validation audit insertion requires the reviewed transition function';
  end if;
  execute replace(v_definition, v_old, v_new);
end;
$patch_validation_audit$;
