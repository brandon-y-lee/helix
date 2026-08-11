set lock_timeout = '10s';
set statement_timeout = '120s';

do $complete_ceramide_claim_exclusion$
declare
  v_excluded_claim_pattern constant text :=
    '(3:1:1|[0-9]+([.][0-9]+)?[[:space:]-]*(hours?|hrs?|days?|weeks?|months?)|all[- ]day|((repair|restore|rebuild)[[:alpha:]]*.{0,40}(skin[ -])?barrier)|((skin[ -])?barrier.{0,40}(repair|restore|rebuild)[[:alpha:]]*)|penetrat[[:alpha:]]*.{0,30}(deeper|into)|deliver[[:alpha:]]*.{0,30}into( the)? skin|layer[- ]specific|clinically|before[ /-]?after|[0-9]+([.][0-9]+)?[[:space:]]*(x|×)|(twice|double|triple)|all skin types|sensitive[- ]skin( safe)?|hypoallergenic|non[- ]irritating|dermatologist[- ]tested|[0-9]+([.][0-9]+)?[[:space:]]*%|[0-9]+([.][0-9]+)?[[:space:]]*percent|[0-9]+([.][0-9]+)?[[:space:]]*(mg|mcg|µg|μg|g)[[:space:]]*/[[:space:]]*(ml|g)|[0-9]+([.][0-9]+)?[[:space:]]*ppm|concentration[- ]led|vegan|cruelty[- ]free|(^|[^[:alnum:]_])clean([^[:alnum:]_]|$)|sustainab|sourcing|certif)';
  v_ceramide_id uuid;
  v_customer_copy text;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('mei-pelle-ceramide-claims-169', 0)
  );

  select product.id,
         concat_ws(
           ' ',
           -- Formula notes preserve internal evidence for the excluded-claims dossier.
           (to_jsonb(product) - 'formula_notes')::text,
           to_jsonb(content)::text
         )
  into strict v_ceramide_id, v_customer_copy
  from public.products product
  join public.product_pdp_content content on content.product_id = product.id
  where product.slug = 'ceramide-cushion'
    and product.catalog_status = 'active'
    and product.status = 'coming_soon';

  if exists (
    select 1
    from public.product_variants variant
    where variant.product_id = v_ceramide_id
  ) then
    raise exception 'Ceramide Cushion must remain without Product Variants'
      using errcode = '23514';
  end if;

  if v_customer_copy ~* v_excluded_claim_pattern then
    raise exception 'Ceramide Cushion contains a claim withheld by specification 167'
      using errcode = '23514';
  end if;
end;
$complete_ceramide_claim_exclusion$;
