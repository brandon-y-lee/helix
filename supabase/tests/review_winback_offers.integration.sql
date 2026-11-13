-- Runs only after the test-only genuine evidence fixtures in review_winback.integration.sql.
-- No review table exists in this database: entitlement cannot depend on a review.
select review_test.seed(950);
do $$
declare src jsonb:=review_test.source(950); offer_id uuid; offer private.lifecycle_offers; blocked boolean:=false;
begin
 if src is null then raise exception 'review offer fixture must qualify'; end if;
 offer_id:=review_test.grant(950);
 if offer_id is null or review_test.grant(950) is distinct from offer_id then raise exception 'one immutable offer per order'; end if;
 select * into offer from private.lifecycle_offers where id=offer_id;
 if offer.kind<>'review_winback' or offer.percent_off<>10 or offer.source_order_id::text is distinct from src->>'orderId'
   or offer.source_user_id::text is distinct from src->>'userId' or offer.user_id is distinct from offer.source_user_id
   or offer.expires_at-offer.issued_at not between interval '13 days 23 hours 59 minutes' and interval '14 days 1 minute'
   then raise exception 'review offer provenance or fixed expiry differs'; end if;
 if public.read_lifecycle_offer_for_delivery(offer_id,src->>'email') is null then raise exception 'unconditional offer requires no submitted review'; end if;
 if not exists(select 1 from jsonb_array_elements(public.read_lifecycle_offers((src->>'userId')::uuid)) x where x->>'id'=offer_id::text)
   then raise exception 'unconditional offer must be available for next purchase'; end if;
 begin update private.lifecycle_offers set source_order_id=null where id=offer_id;
 exception when others then blocked:=true; end;
 if not blocked then raise exception 'source order mutation was accepted'; end if;
 blocked:=false;
 begin update private.lifecycle_offers set risk_revision='tampered' where id=offer_id;
 exception when others then blocked:=true; end;
 if not blocked then raise exception 'frozen evidence mutation was accepted'; end if;
 update review_test.risk set evidence=jsonb_set(evidence,'{status}','"disputed"') where order_id=(src->>'orderId')::uuid;
 if public.read_lifecycle_offer_for_delivery(offer_id,src->>'email') is not null
   or exists(select 1 from jsonb_array_elements(public.read_lifecycle_offers((src->>'userId')::uuid)) x where x->>'id'=offer_id::text)
   or review_test.grant(950) is not null then raise exception 'adverse source risk allowed fresh offer use or grant'; end if;
 update review_test.risk set evidence=jsonb_set(evidence,'{status}','"safe"') where order_id=(src->>'orderId')::uuid;
 update review_test.delivery set evidence=jsonb_set(evidence,'{revision}','"corrected"') where order_id=(src->>'orderId')::uuid;
 if public.read_lifecycle_offer_for_delivery(offer_id,src->>'email') is not null or review_test.grant(950) is not null
   then raise exception 'changed evidence manufactured a replacement offer'; end if;
 if (select count(*) from private.lifecycle_offers where source_order_id=(src->>'orderId')::uuid)<>1 then raise exception 'source dedupe differs'; end if;
end $$;
