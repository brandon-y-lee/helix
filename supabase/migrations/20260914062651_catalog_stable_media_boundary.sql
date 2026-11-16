-- Preparation only: no Catalog pointer writes and no enforcement activation.
-- Trusted tooling verifies complete bytes before invoking the service-only RPC.
set lock_timeout = '10s';
set statement_timeout = '120s';

create table private.catalog_media_operations (
  operation_id uuid primary key,
  manifest jsonb not null check (jsonb_typeof(manifest) = 'object'),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default now()
);
create table private.verified_media_copies (
  product_id uuid not null references public.products(id),
  source_url text not null,
  target_url text not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  byte_size bigint not null check (byte_size > 0),
  mime_type text not null,
  width integer not null check(width>0),
  height integer not null check(height>0),
  source_object_id uuid not null,
  source_object_version text not null,
  target_object_id uuid not null,
  target_object_version text not null,
  operation_id uuid not null references private.catalog_media_operations(operation_id)
    deferrable initially deferred,
  verified_at timestamptz not null default now(),
  primary key (product_id, source_url)
);
create table private.catalog_media_policy (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  operation_id uuid references private.catalog_media_operations(operation_id),
  activated_at timestamptz,
  activated_by uuid references public.admin_memberships(user_id),
  check ((not enabled and operation_id is null and activated_at is null and activated_by is null)
    or (enabled and operation_id is not null and activated_at is not null and activated_by is not null))
);
insert into private.catalog_media_policy(singleton) values(true);
alter table private.catalog_media_operations enable row level security;
alter table private.verified_media_copies enable row level security;
alter table private.catalog_media_policy enable row level security;
revoke all on private.catalog_media_operations, private.verified_media_copies,
  private.catalog_media_policy from public, anon, authenticated, service_role;

create function private.reject_media_evidence_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'verified media evidence is immutable' using errcode = '23514';
end;
$$;
create trigger verified_media_copies_append_only before update or delete
  on private.verified_media_copies for each row execute function private.reject_media_evidence_mutation();
create trigger catalog_media_operations_append_only before update or delete
  on private.catalog_media_operations for each row execute function private.reject_media_evidence_mutation();

create function private.is_current_product_media_url(p_url text, p_product_id uuid)
returns boolean language sql immutable set search_path = '' as $$
  select p_url ~ ('^https://erasogmsqpgiirovubjh[.]supabase[.]co/storage/v1/object/public/helix-catalog/products/'
    || p_product_id::text || '/(primary|card-hover|core-routine-editorial|core-routine-texture|gallery|ingredients-texture|outcomes|profile|application|routine|drafts)/[0-9a-f]{64}[.](jpg|png|webp|mp4)$')
    or p_url ~ ('^https://erasogmsqpgiirovubjh[.]supabase[.]co/storage/v1/object/public/helix-catalog/products/'
    || p_product_id::text || '/primary/original/[0-9a-f]{64}[.]webp$');
$$;

create function private.enforce_catalog_draft_media()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_enabled boolean;
  v_media jsonb;
  v_item jsonb;
  v_copy private.verified_media_copies%rowtype;
  v_index integer := 0;
  v_errors jsonb;
begin
  -- Locking read observes activation or aborts a transaction with a stale snapshot.
  select enabled into strict v_enabled from private.catalog_media_policy for share;
  -- The publisher replaces the final draft document with normalized canonical
  -- rows. Check the original Ready document too, before that evidence disappears.
  if v_enabled and tg_op='UPDATE' and old.status='ready' and new.status='published'
    and exists(select 1 from jsonb_array_elements(old.document->'media') item
      where item->>'url' is not null
        and private.is_current_product_media_url(item->>'url',old.product_id) is not true) then
    raise exception 'retired_media_reference: original Ready media requires review before Publish' using errcode='23514';
  end if;
  v_errors := coalesce((select jsonb_agg(issue order by ordinal)
    from jsonb_array_elements(new.validation_errors) with ordinality as t(issue,ordinal)
    where (issue->>'code') is distinct from 'retired_media_reference'), '[]'::jsonb);
  if jsonb_typeof(new.document->'media') = 'array' then
    v_media := '[]'::jsonb;
    for v_item in select value from jsonb_array_elements(new.document->'media') loop
      -- Restore and create share this INSERT boundary. Never rewrite a saved
      -- editor choice or trust a same-name file without exact immutable evidence.
      if tg_op = 'INSERT' and v_item->>'url' is not null then
        select * into v_copy from private.verified_media_copies
        where product_id = new.product_id and source_url = v_item->>'url'
          and width is not distinct from (v_item->>'width')::integer
          and height is not distinct from (v_item->>'height')::integer
          and split_part(mime_type,'/',1) = v_item->>'media_type'
          and exists(select 1 from storage.objects object
            where object.id=target_object_id and object.version=target_object_version
              and object.bucket_id='helix-catalog'
              and object.name=substring(target_url from char_length('https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/helix-catalog/')+1));
        if found then
          v_item := jsonb_set(v_item,'{url}',to_jsonb(v_copy.target_url));
        end if;
      end if;
      if v_item->>'url' is not null
        and private.is_current_product_media_url(v_item->>'url',new.product_id) is not true then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'code','retired_media_reference','path','media.' || v_index || '.url',
          'message','Choose approved media from this Product’s current UUID folder before marking Ready or publishing.'
        ));
      end if;
      v_media := v_media || jsonb_build_array(v_item);
      v_index := v_index + 1;
    end loop;
    new.document := jsonb_set(new.document,'{media}',v_media);
  end if;
  new.validation_errors := v_errors;
  if v_enabled and new.status in ('ready','published') and exists (
    select 1 from jsonb_array_elements(v_errors) issue where issue->>'code'='retired_media_reference'
  ) then
    raise exception 'retired_media_reference: choose approved current Product media before Ready or Publish'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger product_content_drafts_current_media
  before insert or update of document,status,validation_errors on public.product_content_drafts
  for each row execute function private.enforce_catalog_draft_media();

create function private.enforce_product_media_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_enabled boolean;
begin
  select enabled into strict v_enabled from private.catalog_media_policy for share;
  if v_enabled and new.archived_at is null and new.url is not null
     and private.is_current_product_media_url(new.url,new.product_id) is not true then
    raise exception 'active media URL must use the exact owning Product UUID namespace'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger product_media_current_identity
  before insert or update on public.product_media
  for each row execute function private.enforce_product_media_identity();

create function private.enforce_reactivated_product_media()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_enabled boolean;
begin
  select enabled into strict v_enabled from private.catalog_media_policy for share;
  -- Deferred check reads final rows: a Publish transaction may reactivate the
  -- Product and replace its media together. Archived Product history stays inert.
  if v_enabled and exists(select 1 from public.products p
    join public.product_media m on m.product_id=p.id
    where p.id=new.id and p.catalog_status<>'archived' and m.archived_at is null and m.url is not null
      and private.is_current_product_media_url(m.url,p.id) is not true) then
    raise exception 'reactivated Product media must use its owning Product UUID' using errcode='23514';
  end if;
  return null;
end;
$$;
create constraint trigger products_current_media_on_reactivation
  after insert or update on public.products deferrable initially deferred
  for each row execute function private.enforce_reactivated_product_media();

create function public.cutover_catalog_product_media(p_manifest jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_operation_id uuid;
  v_actor_id uuid;
  v_existing private.catalog_media_operations%rowtype;
  v_product jsonb;
  v_product_id uuid;
  v_media jsonb;
  v_row public.product_media%rowtype;
  v_document jsonb;
  v_after jsonb;
  v_revision integer;
  v_published public.catalog_product_revisions%rowtype;
  v_results jsonb := '[]'::jsonb;
  v_count integer := 0;
  v_source_path text;
  v_target_path text;
  v_source_object record;
  v_target_object record;
  v_copy private.verified_media_copies%rowtype;
  v_result jsonb;
  v_prefix constant text := 'https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/helix-catalog/';
begin
  -- PostgREST uses READ COMMITTED. A pre-existing repeatable-read snapshot can
  -- omit committed child rows even after table fences are acquired.
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'media cutover requires READ COMMITTED isolation' using errcode='25001';
  end if;
  if p_manifest->>'version' is distinct from '1'
    or p_manifest->>'projectRef' is distinct from 'erasogmsqpgiirovubjh'
    or jsonb_typeof(p_manifest->'products') is distinct from 'array'
    or jsonb_array_length(p_manifest->'products') not between 1 and 100 then
    raise exception 'media cutover requires a reviewed version 1 manifest for the approved project' using errcode='22023';
  end if;
  v_operation_id := (p_manifest->>'operationId')::uuid;
  v_actor_id := (p_manifest->>'actorId')::uuid;
  if v_operation_id is null or not exists(select 1 from public.admin_memberships
    where user_id=v_actor_id and role='admin' and active) then
    raise exception 'media cutover requires an operation identity and active administrator' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('catalog-media:' || v_operation_id,0));
  select * into v_existing from private.catalog_media_operations where operation_id=v_operation_id;
  if found then
    if v_existing.manifest is distinct from p_manifest then
      raise exception 'media operation identity already belongs to a different manifest' using errcode='23514';
    end if;
    return v_existing.result || '{"outcome":"no-op"}'::jsonb;
  end if;
  perform 1 from private.catalog_media_policy for share;
  -- Freeze every constituent of the expected V4 document, revision state and
  -- Storage identity. NOWAIT aborts instead of interrupting an independent writer.
  lock table public.products, public.product_pdp_content, public.product_variants,
    public.product_media, public.product_relationships, public.product_sources,
    public.product_families, public.product_family_memberships,
    public.catalog_product_revisions, public.product_content_drafts,
    public.admin_memberships, storage.objects in share row exclusive mode nowait;
  if not exists(select 1 from public.admin_memberships where user_id=v_actor_id and role='admin' and active) then
    raise exception 'media administrator advanced after preflight' using errcode='40001';
  end if;
  if exists(select 1 from jsonb_array_elements(p_manifest->'products') p
    group by p->>'productId' having count(*)>1) then
    raise exception 'duplicate Product in media manifest' using errcode='22023';
  end if;
  perform 1 from public.products where id in (
    select (p->>'productId')::uuid from jsonb_array_elements(p_manifest->'products') p
  ) order by id for update nowait;
  for v_product in select value from jsonb_array_elements(p_manifest->'products') order by value->>'productId' loop
    v_product_id := (v_product->>'productId')::uuid;
    if not exists(select 1 from public.products where id=v_product_id)
      or exists(select 1 from public.products where id=v_product_id and catalog_status='archived')
      or jsonb_typeof(v_product->'media') is distinct from 'array'
      or v_product #>> '{expectedDocument,schemaVersion}' is distinct from '4'
      or v_product #>> '{expectedDocument,productId}' is distinct from v_product_id::text then
      raise exception 'media manifest Product snapshot is invalid' using errcode='22023';
    end if;
    if exists(select 1 from public.product_content_drafts where product_id=v_product_id and status in ('draft','ready')) then
      raise exception 'media cutover cannot replace an active Catalog Draft' using errcode='23514';
    end if;
    select coalesce(max(revision_number),0) into v_revision from public.catalog_product_revisions where product_id=v_product_id;
    if v_revision is distinct from (v_product->>'expectedRevision')::integer then
      raise exception 'Catalog revision advanced after media preflight' using errcode='40001';
    end if;
    v_document := public.get_catalog_editor_document(v_product_id);
    if v_document is distinct from v_product->'expectedDocument' then
      raise exception 'Catalog facts advanced after media preflight' using errcode='40001';
    end if;
    if exists(select 1 from jsonb_array_elements(v_product->'media') m group by m->>'mediaId' having count(*)>1)
      or jsonb_array_length(v_product->'media')=0
      or (select coalesce(jsonb_agg(id::text order by id::text),'[]'::jsonb)
        from public.product_media where product_id=v_product_id and archived_at is null and url is not null
          and private.is_current_product_media_url(url,product_id) is not true)
      is distinct from (select coalesce(jsonb_agg(m->>'mediaId' order by m->>'mediaId'),'[]'::jsonb) from jsonb_array_elements(v_product->'media') m) then
      raise exception 'manifest must contain complete active media associations requiring cutover' using errcode='23514';
    end if;
    for v_media in select value from jsonb_array_elements(v_product->'media') loop
      select * into strict v_row from public.product_media where id=(v_media->>'mediaId')::uuid and product_id=v_product_id;
      if v_media->>'sourceUrl' is distinct from v_row.url
        or (v_media->>'width')::integer is distinct from v_row.width
        or (v_media->>'height')::integer is distinct from v_row.height
        or split_part(v_media->>'mimeType','/',1) is distinct from v_row.media_type
        or (v_media->>'sha256') !~ '^[0-9a-f]{64}$'
        or nullif(v_media->>'sha256','') is null
        or coalesce((v_media->>'byteSize')::bigint,0) not between 1 and 16777216
        or coalesce(v_row.width,0)<=0 or coalesce(v_row.height,0)<=0 then
        raise exception 'media copy evidence differs from approved association' using errcode='23514';
      end if;
      v_source_path := substring(v_row.url from char_length(v_prefix)+1);
      v_target_path := substring(v_media->>'targetUrl' from char_length(v_prefix)+1);
      if not starts_with(v_row.url,v_prefix || 'products/')
        or v_source_path !~ '^products/[a-z0-9]+(-[a-z0-9]+)*/'
        or split_part(v_source_path,'/',2) ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
        or private.is_current_product_media_url(v_media->>'targetUrl',v_product_id) is not true
        or regexp_replace(v_target_path,'^.*/','') is distinct from (v_media->>'sha256' || '.' || case v_media->>'mimeType'
          when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' when 'video/mp4' then 'mp4' else '' end)
        or v_target_path is distinct from ('products/' || v_product_id || '/' || regexp_replace(v_source_path,'^products/[^/]+/','')) then
        raise exception 'media target must preserve suffix under exact owning Product UUID' using errcode='23514';
      end if;
      select id,version,metadata into v_source_object from storage.objects where bucket_id='helix-catalog' and name=v_source_path;
      select id,version,metadata into v_target_object from storage.objects where bucket_id='helix-catalog' and name=v_target_path;
      if v_source_object.id is distinct from (v_media #>> '{sourceObject,id}')::uuid
        or v_target_object.id is distinct from (v_media #>> '{targetObject,id}')::uuid
        or nullif(v_media #>> '{sourceObject,version}','') is null
        or nullif(v_media #>> '{targetObject,version}','') is null
        or v_source_object.version is distinct from v_media #>> '{sourceObject,version}'
        or v_target_object.version is distinct from v_media #>> '{targetObject,version}'
        or v_source_object.metadata->>'mimetype' is distinct from v_media->>'mimeType'
        or v_target_object.metadata->>'mimetype' is distinct from v_media->>'mimeType'
        or (v_source_object.metadata->>'size')::bigint is distinct from (v_media->>'byteSize')::bigint
        or (v_target_object.metadata->>'size')::bigint is distinct from (v_media->>'byteSize')::bigint then
        raise exception 'Storage metadata or verified object identity advanced after byte verification' using errcode='40001';
      end if;
      insert into private.verified_media_copies(product_id,source_url,target_url,sha256,byte_size,mime_type,width,height,
        source_object_id,source_object_version,target_object_id,target_object_version,operation_id)
      values(v_product_id,v_row.url,v_media->>'targetUrl',v_media->>'sha256',(v_media->>'byteSize')::bigint,
        v_media->>'mimeType',v_row.width,v_row.height,v_source_object.id,v_source_object.version,
        v_target_object.id,v_target_object.version,v_operation_id) on conflict(product_id,source_url) do nothing;
      select * into strict v_copy from private.verified_media_copies where product_id=v_product_id and source_url=v_row.url;
      if v_copy.target_url is distinct from v_media->>'targetUrl' or v_copy.sha256 is distinct from v_media->>'sha256'
        or v_copy.byte_size is distinct from (v_media->>'byteSize')::bigint or v_copy.mime_type is distinct from v_media->>'mimeType'
        or v_copy.width is distinct from v_row.width or v_copy.height is distinct from v_row.height
        or v_copy.source_object_id is distinct from v_source_object.id or v_copy.target_object_id is distinct from v_target_object.id
        or v_copy.source_object_version is distinct from v_source_object.version or v_copy.target_object_version is distinct from v_target_object.version then
        raise exception 'conflicting immutable media copy evidence' using errcode='23514';
      end if;
      update public.product_media set url=v_copy.target_url where id=v_row.id;
      v_count := v_count+1;
    end loop;
    v_after := public.get_catalog_editor_document(v_product_id);
    if (v_after-'media') is distinct from (v_document-'media')
      or (select jsonb_agg(item - array['url','updated_at'] order by item->>'id') from jsonb_array_elements(v_after->'media') item)
      is distinct from (select jsonb_agg(item - array['url','updated_at'] order by item->>'id') from jsonb_array_elements(v_document->'media') item) then
      raise exception 'media cutover changed unapproved Catalog facts' using errcode='23514';
    end if;
    insert into public.catalog_product_revisions(product_id,revision_number,schema_version,document,published_by)
      values(v_product_id,v_revision+1,4,v_after,v_actor_id) returning * into v_published;
    insert into public.catalog_editor_audit_log(action,actor_id,product_id,revision_id,metadata)
      values('draft.published',v_actor_id,v_product_id,v_published.id,jsonb_build_object(
        'source','spec-358-stable-product-media','operationId',v_operation_id,
        'changedFields',jsonb_build_array('product_media.url'),'associationCount',jsonb_array_length(v_product->'media')));
    v_results := v_results || jsonb_build_array(jsonb_build_object('productId',v_product_id,'revision',v_revision+1,'revisionId',v_published.id));
  end loop;
  v_result := jsonb_build_object('ok',true,'outcome','published','operationId',v_operation_id,
    'products',v_results,'associationCount',v_count);
  insert into private.catalog_media_operations(operation_id,manifest,result) values(v_operation_id,p_manifest,v_result);
  return v_result;
end;
$$;

create function public.activate_catalog_product_media_policy(p_operation_id uuid,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_policy private.catalog_media_policy%rowtype;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'media activation requires READ COMMITTED isolation' using errcode='25001';
  end if;
  if not exists(select 1 from public.admin_memberships where user_id=p_actor_id and role='admin' and active)
    or not exists(select 1 from private.catalog_media_operations where operation_id=p_operation_id) then
    raise exception 'activation requires a completed media operation and active administrator' using errcode='22023';
  end if;
  select * into strict v_policy from private.catalog_media_policy for update;
  if v_policy.enabled then
    if v_policy.operation_id is distinct from p_operation_id then
      raise exception 'media policy is already active under another operation' using errcode='23514';
    end if;
    return jsonb_build_object('ok',true,'outcome','no-op','operationId',p_operation_id);
  end if;
  lock table public.products,public.product_media,public.product_content_drafts,public.admin_memberships in share row exclusive mode nowait;
  if not exists(select 1 from public.admin_memberships where user_id=p_actor_id and role='admin' and active) then
    raise exception 'media administrator advanced after preflight' using errcode='40001';
  end if;
  if exists(select 1 from public.product_content_drafts where status in ('draft','ready')) then
    raise exception 'media activation cannot proceed with an active Catalog Draft' using errcode='23514';
  end if;
  if exists(select 1 from public.product_media m join public.products p on p.id=m.product_id
    where p.catalog_status<>'archived' and m.archived_at is null and m.url is not null
    and private.is_current_product_media_url(m.url,m.product_id) is not true) then
    raise exception 'media activation requires every active media URL to use its owning Product UUID' using errcode='23514';
  end if;
  update private.catalog_media_policy set enabled=true,operation_id=p_operation_id,activated_at=now(),activated_by=p_actor_id;
  return jsonb_build_object('ok',true,'outcome','activated','operationId',p_operation_id);
end;
$$;

create function public.get_catalog_product_media_operation(p_operation_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('operation',(select result from private.catalog_media_operations where operation_id=p_operation_id),
    'policy',jsonb_build_object('enabled',enabled,'operationId',operation_id,'activatedAt',activated_at)) from private.catalog_media_policy;
$$;

revoke all on function private.reject_media_evidence_mutation(),
  private.is_current_product_media_url(text,uuid),private.enforce_catalog_draft_media(),
  private.enforce_product_media_identity(),private.enforce_reactivated_product_media() from public,anon,authenticated,service_role;
revoke all on function public.cutover_catalog_product_media(jsonb),
  public.activate_catalog_product_media_policy(uuid,uuid),
  public.get_catalog_product_media_operation(uuid) from public,anon,authenticated,service_role;
grant execute on function public.cutover_catalog_product_media(jsonb),
  public.activate_catalog_product_media_policy(uuid,uuid),
  public.get_catalog_product_media_operation(uuid) to service_role;
