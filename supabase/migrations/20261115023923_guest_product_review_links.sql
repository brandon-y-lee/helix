-- Guest bearer capabilities are private, bounded, and cannot create accounts or sends.
create table private.guest_review_subjects (
 id uuid primary key default extensions.gen_random_uuid(), normalized_email text not null,
 environment text not null check(environment in ('sandbox','live')), unique(normalized_email,environment)
);
create table private.guest_review_links (
 token_hash text primary key check(token_hash ~ '^[0-9a-f]{64}$'),
 order_id uuid not null unique references public.orders(id), subject_id uuid not null references private.guest_review_subjects(id),
 created_at timestamptz not null default now(), expires_at timestamptz not null, revoked_at timestamptz,
 check(expires_at>created_at and expires_at<=created_at+interval '30 days')
);
alter table private.guest_review_subjects enable row level security;
alter table private.guest_review_links enable row level security;
revoke all on private.guest_review_subjects,private.guest_review_links from public,anon,authenticated,service_role;
alter table private.product_reviews alter column user_id drop not null;
alter table private.product_reviews add column guest_subject_id uuid references private.guest_review_subjects(id);
alter table private.product_reviews add constraint product_review_one_author check((user_id is null)<>(guest_subject_id is null));
alter table private.product_reviews add unique(guest_subject_id,product_id,environment);
alter table private.product_review_audit alter column actor_id drop not null;
alter table private.product_review_audit add column guest_subject_id uuid references private.guest_review_subjects(id);
alter table private.product_review_audit add constraint product_review_one_actor check((actor_id is null)<>(guest_subject_id is null));
create index product_review_audit_guest_time on private.product_review_audit(guest_subject_id,created_at);
create or replace function private.protect_product_review_provenance()
returns trigger language plpgsql set search_path='' as $$
begin
 if (new.user_id,new.guest_subject_id,new.product_id,new.order_item_id,new.environment) is distinct from
    (old.user_id,old.guest_subject_id,old.product_id,old.order_item_id,old.environment) then
 raise exception 'review provenance is immutable' using errcode='23514'; end if;
 return new;
end $$;

create function public.issue_guest_review_link_v1(p_order_id uuid,p_recipient text,p_token text,p_expires_at timestamptz)
returns boolean language plpgsql security definer set search_path='' as $$
declare o public.orders; s private.guest_review_subjects; l private.guest_review_links; h text; t timestamptz:=clock_timestamp();
begin
 if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' or p_recipient is null or length(p_recipient)>254
 then raise exception 'invalid guest review link' using errcode='22023'; end if;
 select * into o from public.orders where id=p_order_id for share;
 if o.id is null or o.user_id is not null or lower(btrim(o.customer_email)) is distinct from lower(btrim(p_recipient))
 or o.status not in ('paid','refunded') or not exists(select 1 from private.checkout_verified_payments v where v.order_id=o.id and v.session_id=o.stripe_checkout_session_id)
 then raise exception 'guest review unavailable' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('guest-review-order:'||o.id,0));
 h:=encode(extensions.digest(p_token,'sha256'),'hex');
 select * into l from private.guest_review_links where order_id=o.id;
 if l.order_id is not null then
   if l.token_hash=h and l.expires_at=p_expires_at and l.revoked_at is null then return true; end if;
   raise exception 'guest review link already bound' using errcode='42501';
 end if;
 if p_expires_at is null or p_expires_at<=t or p_expires_at>t+interval '30 days' then raise exception 'invalid expiry' using errcode='22023'; end if;
 insert into private.guest_review_subjects(normalized_email,environment) values(lower(btrim(p_recipient)),o.checkout_environment::text)
 on conflict(normalized_email,environment) do nothing;
 select * into s from private.guest_review_subjects where normalized_email=lower(btrim(p_recipient)) and environment=o.checkout_environment::text;
 insert into private.guest_review_links values(h,o.id,s.id,t,p_expires_at,null);
 return true;
end $$;

create function private.guest_review_link(p_token text) returns private.guest_review_links
language plpgsql stable security definer set search_path='' as $$
declare l private.guest_review_links;
begin
 if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then return null; end if;
 select x.* into l from private.guest_review_links x
 join private.guest_review_subjects s on s.id=x.subject_id join public.orders o on o.id=x.order_id
 where x.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and x.revoked_at is null and x.expires_at>clock_timestamp()
 and o.user_id is null and lower(btrim(o.customer_email))=s.normalized_email and o.checkout_environment::text=s.environment
 and o.status in ('paid','refunded') and exists(select 1 from private.checkout_verified_payments v where v.order_id=o.id and v.session_id=o.stripe_checkout_session_id);
 return l;
end $$;
create function public.guest_review_link_valid_v1(p_order_id uuid,p_recipient text,p_token text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare l private.guest_review_links;
begin
 l:=private.guest_review_link(p_token);
 return coalesce(l.order_id=p_order_id and exists(select 1 from private.guest_review_subjects s where s.id=l.subject_id and s.normalized_email=lower(btrim(p_recipient))),false);
end $$;
create function public.read_guest_product_reviews(p_token text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare l private.guest_review_links;
begin
 l:=private.guest_review_link(p_token);
 if l.order_id is null then raise exception 'guest review link unavailable' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(x),'[]'::jsonb) from (
 select distinct on(i.product_id) i.id as "orderItemId",i.product_name as "productName",i.product_slug as "productSlug",r.id,r.revision,r.status,o.checkout_environment::text as environment,
 v.display_name as "displayName",v.rating,v.title,v.body
 from public.order_items i join public.orders o on o.id=i.order_id
 left join private.product_reviews r on r.guest_subject_id=l.subject_id and r.product_id=i.product_id and r.environment=o.checkout_environment::text
 left join private.product_review_revisions v on v.review_id=r.id and v.revision=(select max(revision) from private.product_review_revisions where review_id=r.id)
 where o.id=l.order_id and i.product_id is not null order by i.product_id,i.id limit 100) x);
end $$;
create function public.submit_guest_product_review(p_token text,p_order_item_id uuid,p_expected_revision integer,p_display_name text,p_rating integer,p_title text,p_body text,p_consent boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_item record; v_review private.product_reviews; v_revision integer; l private.guest_review_links;
begin
 if p_consent is distinct from true or p_expected_revision<0 or p_expected_revision is null
 or p_display_name is null or length(trim(p_display_name)) not between 1 and 60
 or p_title is null or length(trim(p_title)) not between 1 and 120
 or p_body is null or length(trim(p_body)) not between 10 and 2000 or p_rating is null or p_rating not between 1 and 5
 or (p_display_name||p_title||regexp_replace(p_body,E'[\n\r\t]','','g')) ~ '[[:cntrl:]]' then raise exception 'invalid review' using errcode='22023'; end if;
 l:=private.guest_review_link(p_token);
 if l.order_id is null then raise exception 'guest review link unavailable' using errcode='42501'; end if;
 perform 1 from public.orders where id=l.order_id for share;
 perform 1 from private.guest_review_links where token_hash=l.token_hash and revoked_at is null for share;
 l:=private.guest_review_link(p_token);
 if l.order_id is null then raise exception 'guest review link unavailable' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('guest-review:'||l.subject_id::text,0));
 select i.product_id,o.checkout_environment::text as environment into v_item from public.order_items i join public.orders o on o.id=i.order_id
 where i.id=p_order_item_id and i.product_id is not null and o.id=l.order_id and o.user_id is null and o.status in ('paid','refunded')
 and exists(select 1 from private.checkout_verified_payments v where v.order_id=o.id and v.session_id=o.stripe_checkout_session_id);
 if not found then raise exception 'verified purchase required' using errcode='42501'; end if;
 select * into v_review from private.product_reviews where guest_subject_id=l.subject_id and product_id=v_item.product_id and environment=v_item.environment for update;
 if l.expires_at<=clock_timestamp() then raise exception 'guest review link unavailable' using errcode='42501'; end if;
 if coalesce(v_review.revision,0)<>p_expected_revision then raise exception 'review revision conflict' using errcode='40001'; end if;
 if (select count(*) from private.product_review_audit where guest_subject_id=l.subject_id and action='submitted' and created_at>now()-interval '1 minute')>=5 then raise exception 'review rate limited' using errcode='54000'; end if;
 if v_review.id is null then
 insert into private.product_reviews(guest_subject_id,product_id,order_item_id,environment,status) values(l.subject_id,v_item.product_id,p_order_item_id,v_item.environment,'pending') returning * into v_review;
 end if;
 v_revision:=v_review.revision+1;
 insert into private.product_review_revisions values(v_review.id,v_revision,trim(p_display_name),p_rating,trim(p_title),trim(p_body),'public-review-v1',now());
 update private.product_reviews set revision=v_revision,status='pending' where id=v_review.id;
 insert into private.product_review_audit(review_id,revision,guest_subject_id,action) values(v_review.id,v_revision,l.subject_id,'submitted');
 return jsonb_build_object('id',v_review.id,'revision',v_revision,'status','pending');
end $$;

create function public.withdraw_guest_product_review(p_token text,p_review_id uuid,p_expected_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.product_reviews; l private.guest_review_links;
begin
 l:=private.guest_review_link(p_token);
 if l.order_id is null then raise exception 'guest review link unavailable' using errcode='42501'; end if;
 perform 1 from public.orders where id=l.order_id for share;
 perform 1 from private.guest_review_links where token_hash=l.token_hash and revoked_at is null for share;
 l:=private.guest_review_link(p_token);
 if l.order_id is null then raise exception 'guest review link unavailable' using errcode='42501'; end if;
 select * into r from private.product_reviews where id=p_review_id and guest_subject_id=l.subject_id
 and product_id in(select product_id from public.order_items where order_id=l.order_id) for update;
 if not found or l.expires_at<=clock_timestamp() then raise exception 'review unavailable' using errcode='42501'; end if;
 if p_expected_revision is null or p_expected_revision<1 or r.revision<>p_expected_revision then raise exception 'review revision conflict' using errcode='40001'; end if;
 update private.product_reviews set revision=revision+1,published_revision=null,status='withdrawn' where id=r.id;
 insert into private.product_review_audit(review_id,revision,guest_subject_id,action) values(r.id,r.revision+1,l.subject_id,'withdrawn');
 return jsonb_build_object('id',r.id,'revision',r.revision+1,'status','withdrawn');
end $$;
create function private.guest_public_review_offer_notice(p_order_id uuid,p_product_id uuid,p_environment text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare contract regprocedure; result boolean;
begin
 contract:=pg_catalog.to_regprocedure('public.has_guest_review_winback_offer_v1(uuid,uuid,text)');
 if contract is null then
   if pg_catalog.to_regclass('private.lifecycle_offers') is null
      and not exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='has_guest_review_winback_offer_v1')
   then return false; end if;
   raise exception 'Review disclosure unavailable' using errcode='55000';
 end if;
 if not exists(select 1 from pg_catalog.pg_proc where oid=contract and prorettype='pg_catalog.bool'::regtype and not proretset and prokind='f') then
   raise exception 'Review disclosure unavailable' using errcode='55000'; end if;
 begin
   execute 'select public.has_guest_review_winback_offer_v1($1,$2,$3)' into result using p_order_id,p_product_id,p_environment;
 exception when others then raise exception 'Review disclosure unavailable' using errcode='55000'; end;
 if result is null then raise exception 'Review disclosure unavailable' using errcode='55000'; end if;
 return result;
end $$;
create or replace function public.read_public_product_reviews(p_slug text,p_after uuid default null,p_limit integer default 5)
returns jsonb language sql stable security definer set search_path='' as $$
 with visible as (
 select r.id,v.display_name,v.rating,v.title,v.body,v.created_at,case when r.guest_subject_id is not null then (case when private.guest_public_review_offer_notice((select order_id from public.order_items where id=r.order_item_id),r.product_id,r.environment) then true else r.offer_notice end) else (case when private.public_review_offer_notice(r.user_id,r.product_id,r.environment) then true else r.offer_notice end) end as offer_notice from private.product_reviews r
 join private.product_review_revisions v on v.review_id=r.id and v.revision=r.published_revision
 join public.products p on p.id=r.product_id
 where p.slug=p_slug and r.environment='live' and r.status<>'withdrawn'
 and exists(select 1 from public.order_items oi join public.orders o on o.id=oi.order_id where oi.id=r.order_item_id and oi.product_id=r.product_id and ((r.user_id is not null and o.user_id=r.user_id) or (r.guest_subject_id is not null and o.user_id is null and exists(select 1 from private.guest_review_subjects s where s.id=r.guest_subject_id and s.normalized_email=lower(btrim(o.customer_email)) and s.environment=o.checkout_environment::text))) and o.checkout_environment::text='live' and exists(select 1 from private.checkout_verified_payments vp where vp.order_id=o.id and vp.session_id=o.stripe_checkout_session_id))
 and (select publication_enabled from private.product_review_control where singleton)
 ), page as (select * from visible where p_after is null or id>p_after order by id limit greatest(1,least(coalesce(p_limit,5),20)))
 select jsonb_build_object('count',(select count(*) from visible),'average',coalesce((select avg(rating) from visible),0),
 'reviews',coalesce((select jsonb_agg(jsonb_build_object('id',id,'displayName',display_name,'rating',rating,'title',title,'body',body,'date',to_char(created_at at time zone 'UTC','YYYY-MM-DD'),'verifiedPurchase',true,'offerNotice',offer_notice) order by id) from page),'[]'::jsonb),
 'nextCursor',case when exists(select 1 from visible where id>(select max(id::text)::uuid from page)) then (select max(id::text) from page) else null end);
$$;

revoke all on function private.guest_review_link(text),private.guest_public_review_offer_notice(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.issue_guest_review_link_v1(uuid,text,text,timestamptz),public.guest_review_link_valid_v1(uuid,text,text),public.read_guest_product_reviews(text),public.submit_guest_product_review(text,uuid,integer,text,integer,text,text,boolean),public.withdraw_guest_product_review(text,uuid,integer) from public,anon,authenticated;
grant execute on function public.issue_guest_review_link_v1(uuid,text,text,timestamptz),public.guest_review_link_valid_v1(uuid,text,text),public.read_guest_product_reviews(text),public.submit_guest_product_review(text,uuid,integer,text,integer,text,text,boolean),public.withdraw_guest_product_review(text,uuid,integer) to service_role;
