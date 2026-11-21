-- The writer can install only these source-pinned, owner-held phases. The second
-- release verifies the previous financial contract with the newly committed enum.
CREATE FUNCTION private.install_first_order_checkout() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp SET lock_timeout = '3s'
AS $capability$
BEGIN
  IF NOT EXISTS (SELECT FROM private.helix_environment WHERE singleton AND (environment,project_ref) IN
    (('development','zyfkunnpnlmgvrojmrbg'),('production','erasogmsqpgiirovubjh'))) THEN
    RAISE EXCEPTION 'Unexpected first-order target'; END IF;
  IF to_regprocedure('private.first_order_checkout_installed()') IS NOT NULL THEN
    IF EXISTS (SELECT FROM pg_proc p WHERE p.oid=to_regprocedure('private.first_order_checkout_installed()')
      AND p.proowner=(SELECT relowner FROM pg_class WHERE oid='public.orders'::regclass)
      AND p.prolang=(SELECT oid FROM pg_language WHERE lanname='sql') AND NOT p.prosecdef AND p.provolatile='s'
      AND p.prokind='f' AND NOT p.proretset AND p.prorettype='boolean'::regtype
      AND ARRAY(SELECT replace(x,' ','') FROM unnest(p.proconfig) x)=ARRAY['search_path=pg_catalog,pg_temp']
      AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='2af2e86351c8087c2b5fafebdb78e88de3606c0ebefd80ba10473cdf0bd8d304'
      AND has_function_privilege(session_user,p.oid,'EXECUTE')
      AND NOT EXISTS (SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        WHERE a.grantor<>p.proowner OR (a.grantee<>p.proowner AND
          (a.grantee<>session_user::regrole OR a.is_grantable OR a.privilege_type<>'EXECUTE')))) THEN
      IF private.first_order_checkout_installed() IS TRUE THEN RETURN; END IF;
    END IF;
    RAISE EXCEPTION 'Existing first-order contract drifted';
  END IF;
  IF NOT NOT EXISTS (SELECT FROM (VALUES
      ('private.install_first_order_inventory()','a480c3708e19291468240b7d8aafa457f6c5a167bcd0b78d4aabe4585a602549'),
      ('private.install_first_order_issuer()','28f9b4be294c34ffd4ece30a9ca4dc54bfd78f33d9c347bceaf50710b0493768'),
      ('private.install_first_order_admission()','52b691057a7571b3b1b8f20038a7ece5603c929b3576584b0c833d8175dd7d91'),
      ('private.install_first_order_fulfillment()','1d0502c757be333f737ef0200db9ccb8319deca9e41025d4b58e6161c4a7e3f5')
    ) expected(signature,digest) LEFT JOIN pg_proc p ON p.oid=to_regprocedure(expected.signature)
    WHERE p.oid IS NULL OR p.proowner<>(SELECT relowner FROM pg_class WHERE oid='public.orders'::regclass)
      OR p.prosecdef OR p.provolatile<>'v' OR p.prokind<>'f' OR p.proretset OR p.prorettype<>'void'::regtype
      OR p.prolang<>(SELECT oid FROM pg_language WHERE lanname='plpgsql')
      OR ARRAY(SELECT replace(x,' ','') FROM unnest(p.proconfig) x)<>ARRAY['search_path=pg_catalog,pg_temp']
      OR encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')<>expected.digest
      OR EXISTS (SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        WHERE a.grantee<>p.proowner OR a.grantor<>p.proowner)) THEN RAISE EXCEPTION 'Unrecognized owner-held first-order phase'; END IF;
  IF NOT EXISTS (SELECT FROM pg_proc p WHERE p.oid=to_regprocedure('private.live_checkout_contract_installed()')
      AND p.proowner=(SELECT relowner FROM pg_class WHERE oid='public.orders'::regclass)
      AND p.prolang=(SELECT oid FROM pg_language WHERE lanname='sql') AND NOT p.prosecdef AND p.provolatile='s'
      AND p.prokind='f' AND NOT p.proretset AND p.prorettype='boolean'::regtype
      AND ARRAY(SELECT replace(x,' ','') FROM unnest(p.proconfig) x)=ARRAY['search_path=pg_catalog,pg_temp']
      AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='7572f1b1b11e8212bb8db9417de87dc2370328b0aa4ea33b12094e24021d6ac4'
      AND has_function_privilege(session_user,p.oid,'EXECUTE')
      AND NOT EXISTS (SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        WHERE a.grantor<>p.proowner OR (a.grantee<>p.proowner AND
          (a.grantee<>session_user::regrole OR a.is_grantable OR a.privilege_type<>'EXECUTE'))))
    OR NOT EXISTS (SELECT FROM pg_proc p WHERE p.oid=to_regprocedure('private.first_order_predecessor_installed()')
      AND p.proowner=(SELECT relowner FROM pg_class WHERE oid='public.orders'::regclass)
      AND p.prolang=(SELECT oid FROM pg_language WHERE lanname='sql') AND NOT p.prosecdef AND p.provolatile='s'
      AND p.prokind='f' AND NOT p.proretset AND p.prorettype='boolean'::regtype
      AND ARRAY(SELECT replace(x,' ','') FROM unnest(p.proconfig) x)=ARRAY['search_path=pg_catalog,pg_temp']
      AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='9bd6bfc2fdaeb7aed316f6935d5160f0893365064e0b9a53b176ed97e50ed62f'
      AND has_function_privilege(session_user,p.oid,'EXECUTE')
      AND NOT EXISTS (SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        WHERE a.grantor<>p.proowner OR (a.grantee<>p.proowner AND
          (a.grantee<>session_user::regrole OR a.is_grantable OR a.privilege_type<>'EXECUTE')))) THEN
    RAISE EXCEPTION 'Unrecognized first-order predecessor verifier'; END IF;
  IF private.first_order_predecessor_installed() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Unrecognized live settlement predecessor'; END IF;
  PERFORM private.install_first_order_inventory();
  PERFORM private.install_first_order_issuer();
  PERFORM private.install_first_order_admission();
  PERFORM private.install_first_order_fulfillment();

CREATE FUNCTION private.first_order_checkout_installed() RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $verify$
SELECT
    (SELECT array_agg(enumlabel::text ORDER BY enumsortorder) FROM pg_enum WHERE enumtypid='public.checkout_environment'::regtype)=ARRAY['sandbox','live','business_sandbox']
    AND NOT EXISTS (SELECT FROM (VALUES
      ('private.apply_business_shipment(text,text,uuid,jsonb)','ee54257859a77384b0bfb90098720fd0c3b158e125bd4aad9b05a782e0e208a3',true,'jsonb','plpgsql','v'),
      ('private.authorize_business_checkout_receipt(text,text,uuid,text,uuid,text)','5ed8896d27e2e438111d4cd48ca0262816faf2b24db69a9bb0734b747980fd41',true,'boolean','sql','s'),
      ('private.authorize_live_checkout_receipt(text,uuid,text,uuid,text)','7388b21f0980e483313a41ce6ab65a1751ad2c51e55a395a912f0bfcdfebd595',true,'boolean','sql','s'),
      ('private.bind_recovered_business_checkout_session(text,text,uuid,uuid,text,uuid)','9cfddcc1a722c73eb96703dad41db6aac961c172b456c9bb699fb05cdae1f016',true,'boolean','plpgsql','v'),
      ('private.bind_recovered_live_checkout_session(text,uuid,uuid,text,uuid)','ab63effc968dcdf8a7aa5ddb25a3f1ce68149372f24b835c32b3f79f7d63a3b8',true,'boolean','plpgsql','v'),
      ('private.business_checkout_result(uuid,text)','6253f1b43e169715a03004262bd43fd2faa4fec5a2555d13f45c7ca4274a9c81',false,'jsonb','sql','s'),
      ('private.business_checkout_target(text,text)','07276f75a2aabd73d2ee7548231f3af82445fc3b92133426f4e72f8a7b8608cc',false,'boolean','sql','s'),
      ('private.business_fulfillment_paid(text,text,uuid)','1966c6352086ab00e561803858031e7788c91aaceb2ae846ff283e32d2496559',false,'boolean','sql','s'),
      ('private.business_shipment_projection(text,uuid,boolean)','d8c2394a64cc2da712cdc61484b9d75a2bb2a72f60cde5c9a962d96eef42889d',false,'jsonb','sql','s'),
      ('private.claim_business_stripe_event(text,text,text,text,text,uuid)','6291ab59de132a404c310a107f7c8fa02f039856fead3a84e95ab96b7e42e7d0',true,'text','plpgsql','v'),
      ('private.claim_live_stripe_event(text,text,text,text,uuid)','b0b9c16752bb9ee03c1c7a231b2c39a337efb2d3e7bd10bb36aaa9d97d8958b3',true,'text','plpgsql','v'),
      ('private.classify_business_checkout_attempt(text,text,uuid,uuid,uuid,text)','c3984e81d02d6d2e762f154cfd6ded406f3cd5b2385b3cfeded838240dac22b2',true,'text','sql','s'),
      ('private.classify_live_checkout_attempt(text,uuid,uuid,uuid,text)','345b74481d433483a457619bb2b0353f384ee1fafdeb437e7d11e4ec540e7a7a',true,'text','sql','s'),
      ('private.finalize_business_checkout_payment(text,text,uuid,uuid,text,jsonb)','c20022d064e19937cd85f5f59a737d0031860b9364a9e308ca0203b877d20c2d',true,'text','plpgsql','v'),
      ('private.finalize_live_checkout_payment(text,uuid,uuid,text,jsonb)','4be6c5cf6746a21c4f859df0f1c1a291f1c0648209bd1af12f93b55530db79dd',true,'text','plpgsql','v'),
      ('private.finish_business_stripe_event(text,text,text,uuid,text,text)','e78ed17f022aaa732cb03505f62ef1910826698250f895a85d4a346804d705ad',true,'boolean','plpgsql','v'),
      ('private.finish_live_stripe_event(text,text,uuid,text,text)','1f770ce479f7a4c8e8d9ab3bac9c6e8af5633b71d544229dee230f0f5a9d411a',true,'boolean','plpgsql','v'),
      ('private.guard_first_order_policy()','7de88f2c6ddf88b43a8ada8215b3972c75d74c76f94ee925001498e5ae673d12',false,'trigger','plpgsql','v'),
      ('private.guard_live_checkout_binding()','ea19b23759248f8f968e4c4f130c34ff56a989a13243592142ba93b5744d1720',false,'trigger','plpgsql','v'),
      ('private.live_checkout_target()','094513a67a99d83aa0d1c4bd5fd43ca0884e53ea07aad507372f8b89be6c4694',false,'boolean','sql','s'),
      ('private.preserve_checkout_mode()','e83c7e4ba7a87108651e6c3a5a456fc73ccea4b8b429e211c47f9e51c1184f35',false,'trigger','plpgsql','v'),
      ('private.read_archived_live_checkout_receipt(text,text,text)','dca4cb4466109227f781c869e73ffa4f051586056c8309d91dab985a8523844c',true,'jsonb','sql','s'),
      ('private.read_business_checkout_offer(text,text)','057dc34a74d16fb10207f33e77c4e8407d319433feb0d67a9afa52812e855f41',true,'jsonb','sql','s'),
      ('private.read_business_checkout_order_history(text,text,uuid,integer,timestamptz,uuid)','391d298330641a218ac32dc8a4410d6abc64da6a8c30fca131e79e5ec48f6052',true,'jsonb','sql','s'),
      ('private.read_business_checkout_order_id(text,text,text)','6378ec8cb963283e8e9a8c07be25f679b8a8225b17d9647dcf85eb1480e8a0a0',true,'uuid','sql','s'),
      ('private.read_business_checkout_payment_contract(text,text,uuid,text)','896d1c10d22a9f1853e29a1078ffeab68c98692e53d250142d4d856854d5cfc7',true,'jsonb','sql','s'),
      ('private.read_business_checkout_receipt(text,text,uuid,text,uuid,text)','c05eaf191e6fed379c4f6dbc2bf700ef55152f5b8a595f9afb025aa6740997a5',true,'jsonb','sql','s'),
      ('private.read_business_checkout_refund_target(text,text,text)','deacfe4c5b63a7ea06a0ba968a8645e4eec70b6170272b4352c10b2d7f57634b',true,'jsonb','sql','s'),
      ('private.read_business_order_shipments(text,text,uuid,text,uuid,text)','40d6e218b22b1d0f03ca041e76eebdc00d3423d59783735fa6c09f557bfc19c5',true,'jsonb','sql','s'),
      ('private.read_business_shipment_order(text,text,text,uuid)','085f3fe31ca1c93fa42721e48d9208a3a533834db33440e6490173c38745dd22',true,'jsonb','sql','s'),
      ('private.read_live_checkout_order_history(text,uuid,integer,timestamptz,uuid)','bb7b4c6d5be0caf305af16346d3f3035d6f4102d59a485a4c9c335f94e71948e',true,'jsonb','sql','s'),
      ('private.read_live_checkout_order_id(text,text)','0dfba40a837c1254d55906c679e631f85c6447e2c7cea4951c13a586a522b56f',true,'uuid','sql','s'),
      ('private.read_live_checkout_payment_contract(text,uuid,text)','2aa426f8d8172e96b40cc51034bb3b68f6566106320f7eb54b165a987ec26bf3',true,'jsonb','sql','s'),
      ('private.read_live_checkout_receipt(text,uuid,text,uuid,text)','f10ff43e6958ab918615bb838229e6bd18679cf70bff7dd91dd5b4566db2f1d3',true,'jsonb','sql','s'),
      ('private.read_live_checkout_refund_target(text,text)','ea739dca359043a0b281783aaa521d7c53ab8df4047e0bb20cfc26da471a038e',true,'jsonb','sql','s'),
      ('private.read_pending_business_checkout_contract(text,text,uuid,uuid)','2ef34cff02722d570d9e81011d927968136c91c76f3271dc331b4fe3e2806968',true,'jsonb','sql','s'),
      ('private.read_pending_live_checkout_contract(text,uuid,uuid)','479921d4ae490b53c6f2c4f5d9d0632c34776125395060ad4c047da832e57cb3',true,'jsonb','sql','s'),
      ('private.record_business_checkout_refund(text,text,text,text,integer,text)','68430ba6b5644d5fde0e71bb2c12c9167caf7ebc8a64917c665fb86c11ce299a',true,'text','plpgsql','v'),
      ('private.record_business_checkout_unpaid(text,text,uuid,uuid,text,text)','f7f935866b6dab00945290b0532f134214187b781463761e11fce178f4991f17',true,'text','plpgsql','v'),
      ('private.record_live_checkout_refund(text,text,text,integer,text)','9635d89229a95977bb2e534616a948c2bfbaebdbe4675ecc315b40b5098ea514',true,'text','plpgsql','v'),
      ('private.record_live_checkout_unpaid(text,uuid,uuid,text,text)','81021d8b7443343f2554f171536f4f6adaf13093fd37050521ada81b11ab68d0',true,'text','plpgsql','v'),
      ('private.release_unsent_business_checkout(text,text,uuid,uuid,uuid)','22b384c83e15270fe4067f7462a54cf8616b172eb63f5451c2eee6f9aa4bba3c',true,'boolean','plpgsql','v'),
      ('private.release_unsent_live_checkout_stock(text,uuid,uuid)','75c64e717673a2037fd62163bdf1a338edd2679f249040ffa7511b82b7c428fd',false,'boolean','plpgsql','v'),
      ('private.reserve_business_checkout(text,text,uuid,uuid,uuid,text,text)','64a54caab57dd6669efbc85da5169123a88f424e3609e5d6d95b0d3312561840',true,'jsonb','plpgsql','v'),
      ('private.reserve_live_checkout_stock(text,uuid,uuid,uuid,integer)','36b84d521d84d61350737686e26603dcc6668896c383343db9f980250b68af28',false,'boolean','plpgsql','v'),
      ('private.settle_first_order_stock()','a6f84e36976b0fc80204de3d077227f9c932870776d5c9b0968062edad35bc65',false,'trigger','plpgsql','v'),
      ('private.start_business_checkout_send(text,text,uuid,uuid,uuid)','1fec35fa48ad9a9c9bc69b04b3a183363dd7988eedf0ff9caf4fbef26cf70e38',true,'jsonb','plpgsql','v'),
      ('private.valid_business_checkout_binding(text,text,uuid,uuid)','1b94fb505a343e795b0054f8b6ba453e3408bd4adf3511dc3d2aeab28ecc7b0d',false,'boolean','sql','s'),
      ('private.valid_live_checkout_binding(text,uuid,uuid)','ea179142d5d6839b40f22e8015fa36c631845d77e65f6254d11c151002c06963',false,'boolean','sql','s'),
      ('public.apply_business_shipment(text,text,uuid,jsonb)','55bf6eec0c05983f521affb4bb793d8a047db5872547f263c1ddf0cda5dc48c5',false,'jsonb','sql','v'),
      ('public.authorize_business_checkout_receipt(text,text,uuid,text,uuid,text)','50218971105deeb9caf751ae7239d6291679b30ec773a1a38bda349633f9e585',false,'boolean','sql','s'),
      ('public.authorize_live_checkout_receipt(text,uuid,text,uuid,text)','3bca76f026a9e2a2d9cca35309c8c6707732661f14255018a92772318b01fe20',false,'boolean','sql','s'),
      ('public.bind_recovered_business_checkout_session(text,text,uuid,uuid,text,uuid)','73ef0dcab7b7fc8fd334460ec930b06aa39b267b6619d534a4689a9747c3af4b',false,'boolean','sql','v'),
      ('public.bind_recovered_live_checkout_session(text,uuid,uuid,text,uuid)','9a6c5e84b3aa912c59b4f0ea413659b3afa090243afb65a7a385d73d56db2fbc',false,'boolean','sql','v'),
      ('public.claim_business_stripe_event(text,text,text,text,text,uuid)','694a5d363ad5ca5b229a5f8adb873dd6e30d602f99f9ae02bf6b1c03c4550974',false,'text','sql','v'),
      ('public.claim_live_stripe_event(text,text,text,text,uuid)','8e6f950f8ab0ea1061f6ab9df0c52094396c3e22220a08b8a03ccd5c32df679e',false,'text','sql','v'),
      ('public.classify_business_checkout_attempt(text,text,uuid,uuid,uuid,text)','6c6a814299803bac38d2fcf7bb36d3251a473b45868b1eeb148b7bce12598f63',false,'text','sql','s'),
      ('public.classify_live_checkout_attempt(text,uuid,uuid,uuid,text)','65b635ac2229e347de838a5018d11ca68ba1a4ee4891523249fb55fd05982626',false,'text','sql','s'),
      ('public.finalize_business_checkout_payment(text,text,uuid,uuid,text,jsonb)','e9806065e16813dc961ceaa754429dfd3b388aba787465791f6e0aebcc0a59cd',false,'text','sql','v'),
      ('public.finalize_live_checkout_payment(text,uuid,uuid,text,jsonb)','bcbc13518575bc109ec62aac9cf9e8c3a016ead96686bb99e77515d8d7cc20fa',false,'text','sql','v'),
      ('public.finish_business_stripe_event(text,text,text,uuid,text,text)','ad3198c3decb0482fb0ce4324c4f706c2209284ebbd0c4bdacca5606b27745e5',false,'boolean','sql','v'),
      ('public.finish_live_stripe_event(text,text,uuid,text,text)','5b6501bd4d74ad8a1600fadfeffe54a85a1abba0febb1dc11dfd44f8bf624dd3',false,'boolean','sql','v'),
      ('public.read_archived_live_checkout_receipt(text,text,text)','b753627d8b6af84b43eae45f9fb4efb6d05607e47c38ad26e3b63c03cc4eeb6a',false,'jsonb','sql','s'),
      ('public.read_business_checkout_offer(text,text)','97fb674470b4278a47109cb408dfb66deaa0d1447d9a92c3d2bc3cf9bb901a39',false,'jsonb','sql','s'),
      ('public.read_business_checkout_order_history(text,text,uuid,integer,timestamptz,uuid)','84fdf7d1ba6b6dffb4bffc5de508e7d7b65a49c48e1a5b63506a92c1d9a03179',false,'jsonb','sql','s'),
      ('public.read_business_checkout_order_id(text,text,text)','a615a99e7e6dfcd4e822b5a034439ebd4c55175b8e110de82d04b9619817e8f4',false,'uuid','sql','s'),
      ('public.read_business_checkout_payment_contract(text,text,uuid,text)','7ca192400f3900354b3508575e73ddc0351944f72b9832a21181f959a2462aef',false,'jsonb','sql','s'),
      ('public.read_business_checkout_receipt(text,text,uuid,text,uuid,text)','1ca24d97b04bebe862521469dcc57a13f32a054e18553a926f3fbe1e925442c7',false,'jsonb','sql','s'),
      ('public.read_business_checkout_refund_target(text,text,text)','cdd59bd103f56b2c93363239299b3998c029e531447e512e1931f04dfc5feab1',false,'jsonb','sql','s'),
      ('public.read_business_order_shipments(text,text,uuid,text,uuid,text)','872ba711992359d0978f6b407add70517c299a10892123bb3eae1c5cd4ba6123',false,'jsonb','sql','s'),
      ('public.read_business_shipment_order(text,text,text,uuid)','6929dbb05c0e186a4618b87b32b0cf768bc041612e6dc71ba1b34b48404d6147',false,'jsonb','sql','s'),
      ('public.read_live_checkout_order_history(text,uuid,integer,timestamptz,uuid)','08ad65ca9dee56b47b86932eb712d0df3bb7454277712ec44246458a9ef68d56',false,'jsonb','sql','s'),
      ('public.read_live_checkout_order_id(text,text)','115e42f5682047103c3d9ba1f93579cbb303ee86fc836011bbf2134a7cd753e9',false,'uuid','sql','s'),
      ('public.read_live_checkout_payment_contract(text,uuid,text)','232d9f452dbc131a12795809b2b51c63faf743fd38e794a51d57cc182cbb35cc',false,'jsonb','sql','s'),
      ('public.read_live_checkout_receipt(text,uuid,text,uuid,text)','cd18f60cbd3fd60aa4007c39ae536c7e473b54db57e2cc71b95b9ab93a06c319',false,'jsonb','sql','s'),
      ('public.read_live_checkout_refund_target(text,text)','7381945047d8ae1865d21c0f5e1cba29104f5c28479e6f5cd9c65975ebae1db3',false,'jsonb','sql','s'),
      ('public.read_pending_business_checkout_contract(text,text,uuid,uuid)','cbbb104fb26be181ea9ee4586cfaca734f1eec686d2aa90b092960e30c94c528',false,'jsonb','sql','s'),
      ('public.read_pending_live_checkout_contract(text,uuid,uuid)','1813660dbc136bd6ee799d0e9d5b1be58ce195aa31fde3b7b447f14f43315326',false,'jsonb','sql','s'),
      ('public.record_business_checkout_refund(text,text,text,text,integer,text)','859b868c21336553811d59178740065eefb4f5d0967062b58fef7cf2168363b9',false,'text','sql','v'),
      ('public.record_business_checkout_unpaid(text,text,uuid,uuid,text,text)','6964466c45f3e2ec64f24daa91ed4111e1d943b8834e26c630f04c9356eac31d',false,'text','sql','v'),
      ('public.record_live_checkout_refund(text,text,text,integer,text)','21eab5ba4a476fec817e37a0e126353fc58c1abb39094d4967a16eee3be8ecda',false,'text','sql','v'),
      ('public.record_live_checkout_unpaid(text,uuid,uuid,text,text)','10e1119f3e665b7f6e6f84fb96e0833ccb004e3004402e9fa0ac86369c631076',false,'text','sql','v'),
      ('public.release_unsent_business_checkout(text,text,uuid,uuid,uuid)','ac981a6b37e4eac68427467b5f2023d07691c465760d8391e0d3e00f963398b8',false,'boolean','sql','v'),
      ('public.reserve_business_checkout(text,text,uuid,uuid,uuid,text,text)','4c1f7add8e262fa8029ecb4537c045799ab88c5ebccd1687edd2762413afaf2e',false,'jsonb','sql','v'),
      ('public.start_business_checkout_send(text,text,uuid,uuid,uuid)','743e39759c671f034cf897585bf73cdc4fbf15e7ecdc67454ff605d799513b71',false,'jsonb','sql','v')
    ) expected(signature,digest,is_definer,result_type,language,volatility)
      LEFT JOIN pg_proc p ON p.oid=to_regprocedure(expected.signature)
      WHERE p.oid IS NULL OR p.proowner<>(SELECT relowner FROM pg_class WHERE oid='public.orders'::regclass)
        OR p.proretset OR p.proleakproof OR p.prokind<>'f' OR p.proisstrict OR p.proparallel<>'u'
        OR p.provolatile::text<>expected.volatility OR p.prorettype<>expected.result_type::regtype
        OR (SELECT lanname FROM pg_language WHERE oid=p.prolang)<>expected.language
        OR ARRAY(SELECT replace(x,' ','') FROM unnest(p.proconfig) x)<>ARRAY['search_path=pg_catalog,pg_temp']
        OR EXISTS (SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
          WHERE a.grantor<>p.proowner OR (a.grantee<>p.proowner AND
            (a.grantee<>'service_role'::regrole OR NOT (expected.is_definer OR expected.signature LIKE 'public.%')
             OR a.is_grantable OR a.privilege_type<>'EXECUTE')))
        OR p.prosecdef IS DISTINCT FROM expected.is_definer OR encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')<>expected.digest
        OR has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE')
        OR has_function_privilege('service_role',p.oid,'EXECUTE') IS DISTINCT FROM
           (expected.is_definer OR expected.signature LIKE 'public.%'))
    AND (SELECT count(*)=8 FROM pg_class c WHERE c.relnamespace='private'::regnamespace
      AND c.relname IN ('live_checkout_bindings','live_stripe_customers','live_stripe_events','live_checkout_sale_policy','live_checkout_stock_reservations','business_shipments','business_shipment_items','business_shipment_commands')
      AND c.relrowsecurity AND c.relforcerowsecurity AND c.relkind='r'
      AND NOT EXISTS (SELECT FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee<>c.relowner OR a.grantor<>c.relowner)
      AND NOT EXISTS (SELECT FROM pg_attribute x, LATERAL aclexplode(x.attacl) a WHERE x.attrelid=c.oid AND (a.grantee<>c.relowner OR a.grantor<>c.relowner))
      AND NOT has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      AND NOT has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      AND NOT has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
    AND (SELECT count(*)=2 FROM pg_constraint WHERE (conrelid,conname) IN
       (('public.orders'::regclass,'orders_checkout_mode'),('public.payment_attempts'::regclass,'attempts_checkout_mode')) AND convalidated)
    AND (SELECT count(*)=3 FROM pg_trigger WHERE (tgrelid,tgname) IN
       (('public.orders'::regclass,'preserve_checkout_order_mode'),('public.payment_attempts'::regclass,'preserve_checkout_attempt_mode'),
        ('private.live_checkout_bindings'::regclass,'live_checkout_binding_immutable'))
       AND tgenabled='O' AND NOT tgisinternal)
    AND (
WITH cols AS (
  SELECT c.oid,c.relname,c.relnamespace FROM pg_class c WHERE c.relnamespace='private'::regnamespace
    AND c.relname IN ('live_checkout_bindings','live_stripe_customers','live_stripe_events','live_checkout_sale_policy','live_checkout_stock_reservations','business_shipments','business_shipment_items','business_shipment_commands')
), components(details) AS (
  SELECT jsonb_build_array('column',c.relname,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,
    a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid)) FROM cols c JOIN pg_attribute a ON a.attrelid=c.oid
    LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE a.attnum>0 AND NOT a.attisdropped
  UNION ALL SELECT jsonb_build_array('rel',c.relname,raw.relrowsecurity,raw.relforcerowsecurity,raw.relowner=(SELECT relowner FROM pg_class WHERE oid='public.orders'::regclass)) FROM cols c JOIN pg_class raw ON raw.oid=c.oid
  UNION ALL SELECT jsonb_build_array('constraint',k.conrelid::regclass::text,k.conname,k.contype,k.convalidated,
    k.condeferrable,k.condeferred,pg_get_constraintdef(k.oid)) FROM pg_constraint k WHERE k.conrelid IN (SELECT oid FROM cols)
    OR (k.conrelid,k.conname) IN (('public.orders'::regclass,'orders_checkout_mode'),('public.payment_attempts'::regclass,'attempts_checkout_mode'))
  UNION ALL SELECT jsonb_build_array('index',i.indrelid::regclass::text,i.indisvalid,i.indisready,pg_get_indexdef(i.indexrelid)) FROM pg_index i
    WHERE i.indrelid IN (SELECT oid FROM cols)
  UNION ALL SELECT jsonb_build_array('trigger',t.tgrelid::regclass::text,t.tgenabled,pg_get_triggerdef(t.oid)) FROM pg_trigger t WHERE NOT t.tgisinternal
    AND (t.tgrelid IN (SELECT oid FROM cols) OR (t.tgrelid,t.tgname) IN (
        ('public.orders'::regclass,'preserve_checkout_order_mode'),('public.orders'::regclass,'settle_first_order_stock'),('public.payment_attempts'::regclass,'preserve_checkout_attempt_mode')))
  UNION ALL SELECT jsonb_build_array('policy',p.polrelid::regclass::text,p.polname,p.polcmd,p.polpermissive,
    (SELECT array_agg(CASE role_oid WHEN 0 THEN 'public' ELSE pg_get_userbyid(role_oid)::text END) FROM unnest(p.polroles) role_oid),
    pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)) FROM pg_policy p
    WHERE p.polrelid IN (SELECT oid FROM cols) OR p.polrelid IN ('public.orders'::regclass,'public.payment_attempts'::regclass,'public.order_items'::regclass)
)
SELECT encode(sha256(convert_to(jsonb_agg(details ORDER BY details::text COLLATE "C")::text,'UTF8')),'hex') FROM components
    ) = '7c62f6f4b699c607cfabb7bbafa5007e84a87c3a4a1378520f1c9cd3434e913c'
    AND NOT EXISTS (SELECT FROM (VALUES
      ('private.install_first_order_inventory()','a480c3708e19291468240b7d8aafa457f6c5a167bcd0b78d4aabe4585a602549'),
      ('private.install_first_order_issuer()','28f9b4be294c34ffd4ece30a9ca4dc54bfd78f33d9c347bceaf50710b0493768'),
      ('private.install_first_order_admission()','52b691057a7571b3b1b8f20038a7ece5603c929b3576584b0c833d8175dd7d91'),
      ('private.install_first_order_fulfillment()','1d0502c757be333f737ef0200db9ccb8319deca9e41025d4b58e6161c4a7e3f5')
    ) expected(signature,digest) LEFT JOIN pg_proc p ON p.oid=to_regprocedure(expected.signature)
    WHERE p.oid IS NULL OR p.proowner<>(SELECT relowner FROM pg_class WHERE oid='public.orders'::regclass)
      OR p.prosecdef OR p.provolatile<>'v' OR p.prokind<>'f' OR p.proretset OR p.prorettype<>'void'::regtype
      OR p.prolang<>(SELECT oid FROM pg_language WHERE lanname='plpgsql')
      OR ARRAY(SELECT replace(x,' ','') FROM unnest(p.proconfig) x)<>ARRAY['search_path=pg_catalog,pg_temp']
      OR encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')<>expected.digest
      OR EXISTS (SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        WHERE a.grantee<>p.proowner OR a.grantor<>p.proowner))
$verify$;
REVOKE ALL ON FUNCTION private.first_order_checkout_installed() FROM PUBLIC,anon,authenticated,service_role;
EXECUTE format('GRANT EXECUTE ON FUNCTION private.first_order_checkout_installed() TO %I',session_user);
IF private.first_order_checkout_installed() IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'First-order release verification failed'; END IF;
END;
$capability$;
