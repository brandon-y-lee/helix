-- Commit the enum before any subsequent DDL uses its new label. Preserve a
-- source-pinned, writer-readable proof that all earlier settlement guards remain.
CREATE FUNCTION private.extend_business_checkout_environment() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp SET lock_timeout = '3s'
AS $capability$
DECLARE labels text[];
BEGIN
  IF NOT EXISTS (SELECT FROM private.helix_environment WHERE singleton AND (environment,project_ref) IN
    (('development','zyfkunnpnlmgvrojmrbg'),('production','erasogmsqpgiirovubjh'))) THEN
    RAISE EXCEPTION 'Unexpected first-order environment'; END IF;
  IF NOT EXISTS (SELECT FROM pg_proc p WHERE p.oid=to_regprocedure('private.live_checkout_contract_installed()')
      AND p.proowner=(SELECT relowner FROM pg_class WHERE oid='public.orders'::regclass)
      AND p.prolang=(SELECT oid FROM pg_language WHERE lanname='sql') AND NOT p.prosecdef AND p.provolatile='s'
      AND p.prokind='f' AND NOT p.proretset AND p.prorettype='boolean'::regtype
      AND ARRAY(SELECT replace(x,' ','') FROM unnest(p.proconfig) x)=ARRAY['search_path=pg_catalog,pg_temp']
      AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='7572f1b1b11e8212bb8db9417de87dc2370328b0aa4ea33b12094e24021d6ac4'
      AND has_function_privilege(session_user,p.oid,'EXECUTE')
      AND NOT EXISTS (SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        WHERE a.grantor<>p.proowner OR (a.grantee<>p.proowner AND
          (a.grantee<>session_user::regrole OR a.is_grantable OR a.privilege_type<>'EXECUTE')))) THEN
    RAISE EXCEPTION 'Unrecognized baseline verifier'; END IF;
  SELECT array_agg(enumlabel::text ORDER BY enumsortorder) INTO labels FROM pg_enum
    WHERE enumtypid='public.checkout_environment'::regtype;
  IF labels=ARRAY['sandbox','live','business_sandbox'] THEN
    IF EXISTS (SELECT FROM pg_proc p WHERE p.oid=to_regprocedure('private.first_order_predecessor_installed()')
      AND p.proowner=(SELECT relowner FROM pg_class WHERE oid='public.orders'::regclass)
      AND p.prolang=(SELECT oid FROM pg_language WHERE lanname='sql') AND NOT p.prosecdef AND p.provolatile='s'
      AND p.prokind='f' AND NOT p.proretset AND p.prorettype='boolean'::regtype
      AND ARRAY(SELECT replace(x,' ','') FROM unnest(p.proconfig) x)=ARRAY['search_path=pg_catalog,pg_temp']
      AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='9bd6bfc2fdaeb7aed316f6935d5160f0893365064e0b9a53b176ed97e50ed62f'
      AND has_function_privilege(session_user,p.oid,'EXECUTE')
      AND NOT EXISTS (SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        WHERE a.grantor<>p.proowner OR (a.grantee<>p.proowner AND
          (a.grantee<>session_user::regrole OR a.is_grantable OR a.privilege_type<>'EXECUTE')))) THEN
      IF private.first_order_predecessor_installed() IS TRUE THEN RETURN; END IF;
    END IF;
    RAISE EXCEPTION 'Intermediate first-order contract drifted';
  END IF;
  IF labels IS DISTINCT FROM ARRAY['sandbox','live'] OR private.live_checkout_contract_installed() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Unrecognized settlement contract'; END IF;
  ALTER TYPE public.checkout_environment ADD VALUE 'business_sandbox';
CREATE FUNCTION private.first_order_predecessor_installed() RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $verify$
SELECT
    (SELECT array_agg(enumlabel::text ORDER BY enumsortorder) FROM pg_enum WHERE enumtypid='public.checkout_environment'::regtype)=ARRAY['sandbox','live','business_sandbox']
    AND NOT EXISTS (SELECT FROM (VALUES
      ('private.preserve_checkout_mode()','e83c7e4ba7a87108651e6c3a5a456fc73ccea4b8b429e211c47f9e51c1184f35',false,'trigger','plpgsql','v'),
      ('private.live_checkout_target()','094513a67a99d83aa0d1c4bd5fd43ca0884e53ea07aad507372f8b89be6c4694',false,'boolean','sql','s'),
      ('private.valid_live_checkout_binding(text,uuid,uuid)','ea179142d5d6839b40f22e8015fa36c631845d77e65f6254d11c151002c06963',false,'boolean','sql','s'),
      ('private.guard_live_checkout_binding()','cd4f10380af4ecd7b410a81028f295aef8aa7be6f47f15282f92d983afd0ab54',false,'trigger','plpgsql','v'),
      ('private.read_live_checkout_payment_contract(text,uuid,text)','2aa426f8d8172e96b40cc51034bb3b68f6566106320f7eb54b165a987ec26bf3',true,'jsonb','sql','s'),
      ('public.read_live_checkout_payment_contract(text,uuid,text)','232d9f452dbc131a12795809b2b51c63faf743fd38e794a51d57cc182cbb35cc',false,'jsonb','sql','s'),
      ('private.read_pending_live_checkout_contract(text,uuid,uuid)','479921d4ae490b53c6f2c4f5d9d0632c34776125395060ad4c047da832e57cb3',true,'jsonb','sql','s'),
      ('public.read_pending_live_checkout_contract(text,uuid,uuid)','1813660dbc136bd6ee799d0e9d5b1be58ce195aa31fde3b7b447f14f43315326',false,'jsonb','sql','s'),
      ('private.classify_live_checkout_attempt(text,uuid,uuid,uuid,text)','345b74481d433483a457619bb2b0353f384ee1fafdeb437e7d11e4ec540e7a7a',true,'text','sql','s'),
      ('public.classify_live_checkout_attempt(text,uuid,uuid,uuid,text)','65b635ac2229e347de838a5018d11ca68ba1a4ee4891523249fb55fd05982626',false,'text','sql','s'),
      ('private.read_live_checkout_order_id(text,text)','0dfba40a837c1254d55906c679e631f85c6447e2c7cea4951c13a586a522b56f',true,'uuid','sql','s'),
      ('public.read_live_checkout_order_id(text,text)','115e42f5682047103c3d9ba1f93579cbb303ee86fc836011bbf2134a7cd753e9',false,'uuid','sql','s'),
      ('private.bind_recovered_live_checkout_session(text,uuid,uuid,text,uuid)','ab63effc968dcdf8a7aa5ddb25a3f1ce68149372f24b835c32b3f79f7d63a3b8',true,'boolean','plpgsql','v'),
      ('public.bind_recovered_live_checkout_session(text,uuid,uuid,text,uuid)','9a6c5e84b3aa912c59b4f0ea413659b3afa090243afb65a7a385d73d56db2fbc',false,'boolean','sql','v'),
      ('private.claim_live_stripe_event(text,text,text,text,uuid)','b0b9c16752bb9ee03c1c7a231b2c39a337efb2d3e7bd10bb36aaa9d97d8958b3',true,'text','plpgsql','v'),
      ('public.claim_live_stripe_event(text,text,text,text,uuid)','8e6f950f8ab0ea1061f6ab9df0c52094396c3e22220a08b8a03ccd5c32df679e',false,'text','sql','v'),
      ('private.finish_live_stripe_event(text,text,uuid,text,text)','1f770ce479f7a4c8e8d9ab3bac9c6e8af5633b71d544229dee230f0f5a9d411a',true,'boolean','plpgsql','v'),
      ('public.finish_live_stripe_event(text,text,uuid,text,text)','5b6501bd4d74ad8a1600fadfeffe54a85a1abba0febb1dc11dfd44f8bf624dd3',false,'boolean','sql','v'),
      ('private.finalize_live_checkout_payment(text,uuid,uuid,text,jsonb)','4be6c5cf6746a21c4f859df0f1c1a291f1c0648209bd1af12f93b55530db79dd',true,'text','plpgsql','v'),
      ('public.finalize_live_checkout_payment(text,uuid,uuid,text,jsonb)','bcbc13518575bc109ec62aac9cf9e8c3a016ead96686bb99e77515d8d7cc20fa',false,'text','sql','v'),
      ('private.record_live_checkout_unpaid(text,uuid,uuid,text,text)','81021d8b7443343f2554f171536f4f6adaf13093fd37050521ada81b11ab68d0',true,'text','plpgsql','v'),
      ('public.record_live_checkout_unpaid(text,uuid,uuid,text,text)','10e1119f3e665b7f6e6f84fb96e0833ccb004e3004402e9fa0ac86369c631076',false,'text','sql','v'),
      ('private.read_live_checkout_refund_target(text,text)','ea739dca359043a0b281783aaa521d7c53ab8df4047e0bb20cfc26da471a038e',true,'jsonb','sql','s'),
      ('public.read_live_checkout_refund_target(text,text)','7381945047d8ae1865d21c0f5e1cba29104f5c28479e6f5cd9c65975ebae1db3',false,'jsonb','sql','s'),
      ('private.record_live_checkout_refund(text,text,text,integer,text)','9635d89229a95977bb2e534616a948c2bfbaebdbe4675ecc315b40b5098ea514',true,'text','plpgsql','v'),
      ('public.record_live_checkout_refund(text,text,text,integer,text)','21eab5ba4a476fec817e37a0e126353fc58c1abb39094d4967a16eee3be8ecda',false,'text','sql','v'),
      ('private.authorize_live_checkout_receipt(text,uuid,text,uuid,text)','7388b21f0980e483313a41ce6ab65a1751ad2c51e55a395a912f0bfcdfebd595',true,'boolean','sql','s'),
      ('public.authorize_live_checkout_receipt(text,uuid,text,uuid,text)','3bca76f026a9e2a2d9cca35309c8c6707732661f14255018a92772318b01fe20',false,'boolean','sql','s'),
      ('private.read_live_checkout_receipt(text,uuid,text,uuid,text)','f10ff43e6958ab918615bb838229e6bd18679cf70bff7dd91dd5b4566db2f1d3',true,'jsonb','sql','s'),
      ('public.read_live_checkout_receipt(text,uuid,text,uuid,text)','cd18f60cbd3fd60aa4007c39ae536c7e473b54db57e2cc71b95b9ab93a06c319',false,'jsonb','sql','s'),
      ('private.read_live_checkout_order_history(text,uuid,integer,timestamptz,uuid)','bb7b4c6d5be0caf305af16346d3f3035d6f4102d59a485a4c9c335f94e71948e',true,'jsonb','sql','s'),
      ('public.read_live_checkout_order_history(text,uuid,integer,timestamptz,uuid)','08ad65ca9dee56b47b86932eb712d0df3bb7454277712ec44246458a9ef68d56',false,'jsonb','sql','s')
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
    AND (SELECT count(*)=3 FROM pg_class c WHERE c.relnamespace='private'::regnamespace
      AND c.relname IN ('live_checkout_bindings','live_stripe_customers','live_stripe_events')
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
    AND c.relname IN ('live_checkout_bindings','live_stripe_customers','live_stripe_events')
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
        ('public.orders'::regclass,'preserve_checkout_order_mode'),('public.payment_attempts'::regclass,'preserve_checkout_attempt_mode')))
  UNION ALL SELECT jsonb_build_array('policy',p.polrelid::regclass::text,p.polname,p.polcmd,p.polpermissive,
    (SELECT array_agg(CASE role_oid WHEN 0 THEN 'public' ELSE pg_get_userbyid(role_oid)::text END) FROM unnest(p.polroles) role_oid),
    pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)) FROM pg_policy p
    WHERE p.polrelid IN (SELECT oid FROM cols) OR p.polrelid IN ('public.orders'::regclass,'public.payment_attempts'::regclass,'public.order_items'::regclass)
)
SELECT encode(sha256(convert_to(jsonb_agg(details ORDER BY details::text COLLATE "C")::text,'UTF8')),'hex') FROM components
    ) = '8dfd1872dc0c78a95e19ca16f30992d9d99a74594e57b7ee19ef554843a7dc03'
$verify$;
REVOKE ALL ON FUNCTION private.first_order_predecessor_installed() FROM PUBLIC,anon,authenticated,service_role;
EXECUTE format('GRANT EXECUTE ON FUNCTION private.first_order_predecessor_installed() TO %I',session_user);
IF private.first_order_predecessor_installed() IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Intermediate first-order settlement postflight failed'; END IF;
END;
$capability$;
