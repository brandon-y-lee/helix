-- FINAL CONTRACTION: deliberately outside automatic migrations. Load the
-- preflight helper first, then call in a transaction with the exact reviewed
-- inventory and independently verified deployment evidence. This helper does
-- not contact Vercel/Algolia or prove an attestation true; the operator must do so.
create or replace function pg_temp.contract_product_urls(p_expected jsonb,p_evidence jsonb)
returns jsonb language plpgsql set search_path='' as $contract$
declare
  before_state jsonb;
  after_state jsonb;
  resolver regprocedure := to_regprocedure('public.resolve_product_slug(text)');
  item jsonb;
  role_name text;
  hook_count integer := 0;
  maintenance_count integer := 0;
  product_guard_count integer := 0;
  policy_count integer;
  contracted boolean;
begin
  if p_evidence->>'projectRef' is distinct from 'erasogmsqpgiirovubjh'
     or p_evidence->>'stage' is distinct from 'canonical-consumers-search-reconciled'
     or coalesce(p_evidence->>'sourceSha','') !~ '^[0-9a-f]{40}$'
     or p_evidence->>'verifiedDeploymentSha' is distinct from p_evidence->>'sourceSha'
     or nullif(btrim(p_evidence->>'deploymentId'),'') is null
     or p_evidence->'canonicalConsumersVerified' is distinct from 'true'::jsonb
     or p_evidence->'searchVerified' is distinct from 'true'::jsonb
     or p_evidence->'catalogWritesPaused' is distinct from 'true'::jsonb
     or p_evidence->'routeDeliveriesDrained' is distinct from 'true'::jsonb then
    raise exception 'Product URL contraction requires exact verified deployment, project, stage and drained write pause';
  end if;
  perform set_config('lock_timeout','5s',true);
  perform set_config('statement_timeout','120s',true);
  -- Fence independent Product writers and HTTP scheduling. No lock-name change
  -- to current publication/replacement functions is necessary for this operation.
  lock table public.products, public.product_slug_routes in access exclusive mode nowait;
  before_state := pg_temp.product_url_inventory();
  if before_state is distinct from p_expected then
    raise exception 'Product URL contraction inventory changed; refresh and review';
  end if;
  if before_state->'callers' <> '[]'::jsonb or before_state->'dependencies' <> '[]'::jsonb
     or before_state#>'{table,rls}' is distinct from 'true'::jsonb
     or before_state->'columnAcls' <> '[]'::jsonb then
    raise exception 'Product URL contraction has callers, dependencies, missing RLS or column grants';
  end if;
  foreach role_name in array array['anon','authenticated','service_role'] loop
    if has_table_privilege(role_name,'public.product_slug_routes','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       or (role_name='service_role' and not has_table_privilege(role_name,'public.product_slug_routes','SELECT')) then
      raise exception 'Product URL contraction found unexpected ledger privileges';
    end if;
  end loop;
  for item in select value from jsonb_array_elements(before_state->'triggers') loop
    if item->>'table'='products' then
      if item->>'name' in ('sync_inserted_product_slug_route','sync_updated_product_slug_route','enforce_replaced_product_archival') then
        if item->>'functionSchema'<>'private' or item->>'enabled'<>'O'
           or not ((item->>'name'='sync_inserted_product_slug_route'
               and item->>'functionName'='sync_product_slug_route' and item->>'type'='5')
             or (item->>'name'='sync_updated_product_slug_route'
               and item->>'functionName'='sync_product_slug_route' and item->>'type'='17')
             or (item->>'name'='enforce_replaced_product_archival'
               and item->>'functionName'='enforce_replaced_product_archival' and item->>'type'='19')) then
          raise exception 'Product URL contraction found an unexpected Product safeguard';
        end if;
        product_guard_count := product_guard_count+1;
      end if;
      continue;
    end if;
    if item->>'name' in ('product_slug_routes_append_only','validate_product_slug_route_row')
       and item->>'functionSchema'='private' and item->>'enabled'='O'
       and ((item->>'name'='product_slug_routes_append_only'
          and item->>'functionName'='forbid_product_slug_route_delete' and item->>'type'='11')
         or (item->>'name'='validate_product_slug_route_row'
          and item->>'functionName'='validate_product_slug_route_row' and item->>'type'='23')) then
      maintenance_count := maintenance_count+1;
    elsif item->>'name'='helix_catalog_search_sync_product_slug_routes'
       and item->>'functionSchema'='supabase_functions' and item->>'functionName'='http_request'
       and item->>'enabled'='O' and item->>'type'='29' then
      hook_count := hook_count+1;
    else
      raise exception 'Product URL contraction found an unexpected route trigger';
    end if;
  end loop;
  if maintenance_count <> 2 or product_guard_count <> 3 then
    raise exception 'Product URL contraction requires every ledger and Product safeguard';
  end if;
  policy_count := jsonb_array_length(before_state->'policies');
  contracted := resolver is null;
  if contracted then
    if before_state->'resolverSignatures' <> '[]'::jsonb or policy_count <> 0 or hook_count <> 0
       or has_any_column_privilege('anon','public.product_slug_routes','SELECT')
       or has_any_column_privilege('authenticated','public.product_slug_routes','SELECT') then
      raise exception 'Product URL contraction is partial; review before recovery';
    end if;
    return jsonb_build_object('outcome','already-contracted','deploymentSha',p_evidence->>'sourceSha');
  end if;
  if jsonb_array_length(before_state->'resolverSignatures') <> 1
     or before_state#>>'{resolver,bodyMd5}' <> 'd000ebe76039fb8d53153488649ddcbe'
     or before_state#>>'{resolver,language}' <> 'sql'
     or before_state#>'{resolver,securityDefiner}' is distinct from 'false'::jsonb
     or before_state#>>'{resolver,volatility}' <> 's'
     or before_state#>'{resolver,config}' is distinct from '["search_path=\"\""]'::jsonb
     or not has_function_privilege('anon',resolver,'EXECUTE')
     or not has_function_privilege('authenticated',resolver,'EXECUTE')
     or not has_function_privilege('service_role',resolver,'EXECUTE')
     or policy_count <> 1
     or before_state#>>'{policies,0,policyname}' <> 'Public read active Product slug routes'
     or before_state#>>'{policies,0,cmd}' <> 'SELECT' then
    raise exception 'Product URL contraction found unexpected resolver or policy contract';
  end if;
  if hook_count=1 then
    drop trigger helix_catalog_search_sync_product_slug_routes on public.product_slug_routes restrict;
  end if;
  revoke select on table public.product_slug_routes from public,anon,authenticated;
  drop policy "Public read active Product slug routes" on public.product_slug_routes;
  drop function public.resolve_product_slug(text) restrict;
  after_state := pg_temp.product_url_inventory();
  if after_state->'reservations' is distinct from before_state->'reservations'
     or after_state->'activeProducts' is distinct from before_state->'activeProducts'
     or after_state->'integrityFunctions' is distinct from before_state->'integrityFunctions'
     or after_state->'triggers' is distinct from (select jsonb_agg(value order by value->>'table',value->>'name')
       from jsonb_array_elements(before_state->'triggers') where value->>'name'<>'helix_catalog_search_sync_product_slug_routes')
     or after_state->'policies' <> '[]'::jsonb
     or has_any_column_privilege('anon','public.product_slug_routes','SELECT')
     or has_any_column_privilege('authenticated','public.product_slug_routes','SELECT')
     or not has_table_privilege('service_role','public.product_slug_routes','SELECT') then
    raise exception 'Product URL contraction postflight failed; transaction must roll back';
  end if;
  return jsonb_build_object('outcome','contracted','deploymentSha',p_evidence->>'sourceSha',
    'removedHttpHooks',hook_count,'retainedReservations',jsonb_array_length(after_state->'reservations'));
end;
$contract$;
