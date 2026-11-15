begin;
-- Existing harness leaves one genuine published review; no lifecycle subsystem.
select check_review(not private.public_review_offer_notice(tid(2),tid(10),'live'));
select check_review((read_public_product_reviews('synthetic-serum')->'reviews'->0->>'offerNotice')::boolean=false);
create function pg_temp.expect_disclosure_unavailable() returns void language plpgsql as $$begin
 begin perform read_public_product_reviews('synthetic-serum'); raise exception 'undisclosed projection escaped';
 exception when object_not_in_prerequisite_state then null; end;
end$$;
create table private.lifecycle_offers (id uuid);
select pg_temp.expect_disclosure_unavailable();
-- Trusted prior notice does not bypass an unavailable subsystem.
update private.product_reviews set offer_notice=true where user_id=tid(2) and environment='live';
select pg_temp.expect_disclosure_unavailable();
update private.product_reviews set offer_notice=false where user_id=tid(2) and environment='live';
drop table private.lifecycle_offers;
create function public.has_review_winback_offer_v1(uuid,uuid) returns boolean language sql as $$select true$$;
select pg_temp.expect_disclosure_unavailable();
drop function public.has_review_winback_offer_v1(uuid,uuid);
create function public.has_review_winback_offer_v1(uuid,uuid,text) returns text language sql as $$select 'true'::text$$;
select pg_temp.expect_disclosure_unavailable();
drop function public.has_review_winback_offer_v1(uuid,uuid,text);
create function public.has_review_winback_offer_v1(uuid,uuid,text) returns boolean language sql as $$select null::boolean$$;
select pg_temp.expect_disclosure_unavailable();
create or replace function public.has_review_winback_offer_v1(uuid,uuid,text) returns boolean language plpgsql as $$begin raise exception 'synthetic backend failure';end$$;
select pg_temp.expect_disclosure_unavailable();
create or replace function public.has_review_winback_offer_v1(uuid,uuid,text) returns boolean language sql as $$select false$$;
select check_review((read_public_product_reviews('synthetic-serum')->'reviews'->0->>'offerNotice')::boolean=false);
update private.product_reviews set offer_notice=true where user_id=tid(2) and environment='live';
select check_review((read_public_product_reviews('synthetic-serum')->'reviews'->0->>'offerNotice')::boolean=true);
update private.product_reviews set offer_notice=false where user_id=tid(2) and environment='live';
create or replace function public.has_review_winback_offer_v1(uuid,uuid,text) returns boolean language sql as $$select true$$;
-- A subsequent read changes without editing, remoderating, or modifying stored review flags.
select check_review((read_public_product_reviews('synthetic-serum')->'reviews'->0->>'offerNotice')::boolean=true);
select check_review((select not offer_notice from private.product_reviews where user_id=tid(2) and environment='live'));
set role authenticated;
do $$begin begin perform private.public_review_offer_notice(public.tid(2),public.tid(10),'live');raise exception 'adapter exposed';exception when insufficient_privilege then null;end;end$$;
reset role;
rollback;
