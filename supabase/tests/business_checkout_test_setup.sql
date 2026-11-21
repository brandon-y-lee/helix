-- Only the disposable native forward-migration runner creates these databases.
DO $setup$
DECLARE
  database_environment text;
  project text;
  provider_mode text;
BEGIN
  IF current_database() !~ '^helix_bootstrap_fresh_[ab]_[a-f0-9]{12}$'
     OR inet_server_addr() IS NOT NULL OR current_user <> 'postgres' THEN
    RAISE EXCEPTION 'First-order fixtures require the local native owner and disposable database';
  END IF;
  SELECT environment, project_ref INTO STRICT database_environment, project
    FROM private.helix_environment WHERE singleton;
  provider_mode := CASE
    WHEN database_environment='development' AND project='zyfkunnpnlmgvrojmrbg' THEN 'business_sandbox'
    WHEN database_environment='production' AND project='erasogmsqpgiirovubjh' THEN 'live'
  END;
  IF provider_mode IS NULL OR EXISTS (SELECT FROM private.live_checkout_sale_policy) THEN
    RAISE EXCEPTION 'Expected the verified empty first-order enrollment';
  END IF;
  INSERT INTO private.catalog_media_policy(singleton) VALUES(true) ON CONFLICT DO NOTHING;
  INSERT INTO public.system_steps(name,position,routine_group) VALUES('TREAT',3,'core') ON CONFLICT DO NOTHING;
  INSERT INTO public.products(id,slug,display_name,product_type,swatch_from,swatch_to,sort_order,
    editorial_description,editorial_how_to_use,routine_group,routine_sort,system_step_name)
    VALUES('59200000-0000-4000-8000-000000000001','first-order-native-fixture','Native test serum',
      'Serum','#ffffff','#ffffff',1,'Synthetic description','Synthetic guidance','core',1,'TREAT');
  INSERT INTO public.product_variants(id,product_id,variant_key,label,price_cents,sku,sort_order) VALUES
    ('59200000-0000-4000-8000-000000000002','59200000-0000-4000-8000-000000000001',
      'eligible','Eligible unit',2500,'FIXTURE-592',1),
    ('59200000-0000-4000-8000-000000000003','59200000-0000-4000-8000-000000000001',
      'other','Other unit',2500,'FIXTURE-592-OTHER',2);
END;
$setup$;

-- The runner enrolls, inspects and opens this synthetic offer through the
-- production operator's entry point on the disposable database.
SELECT jsonb_build_object(
  'project_ref',e.project_ref,'provider_environment',CASE e.environment
    WHEN 'development' THEN 'business_sandbox' WHEN 'production' THEN 'live' END,
  'account_id','acct_592NativeMerchant','variant_id',v.id,'sku',v.sku,'currency',p.currency,
  'unit_price_cents',v.price_cents,'approved_units',64,'shipping_cents',500,'free_shipping_threshold_cents',5000,
  'shipping_rate_id','shr_592Fixture','shipper','Synthetic shipper','automatic_tax_enabled',true,
  'tax_behavior','exclusive','tax_code','txcd_12345678','dispatch_terms','Synthetic dispatch terms',
  'return_terms','Synthetic return terms') AS first_order_fixture_plan
FROM private.helix_environment e CROSS JOIN public.product_variants v JOIN public.products p ON p.id=v.product_id
WHERE e.singleton AND v.id='59200000-0000-4000-8000-000000000002';
