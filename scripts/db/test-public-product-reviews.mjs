import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
const container = process.argv[2] ?? "helix-spec358-pg";
const docker = (args, options = {}) =>
  execFileSync("docker", args, { encoding: "utf8", ...options });
assert.equal(
  docker([
    "inspect",
    "-f",
    '{{index .Config.Labels "helix.task"}}',
    container,
  ]).trim(),
  "spec358-synthetic-sql",
);
const db = `public_reviews_${process.pid}_${Date.now()}`;
const args = [
  "exec",
  "-i",
  container,
  "psql",
  "-X",
  "-U",
  "postgres",
  "-d",
  db,
  "-v",
  "ON_ERROR_STOP=1",
  "-Atq",
];
const sql = (input) => docker(args, { input });
const read = (p) =>
  readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
try {
  docker(["exec", container, "createdb", "-U", "postgres", db]);
  sql(read("supabase/tests/checkpoints/checkout-current.sql"));
  sql(`CREATE SCHEMA private; ALTER TABLE auth.users ADD COLUMN email_confirmed_at timestamptz;
 CREATE TABLE public.admin_memberships(user_id uuid primary key,role text,active boolean);
 ${read("supabase/migrations/20260919001919_checkout_payment_contracts.sql").match(/create table private.checkout_verified_payments \([\s\S]*?\n\);/)[0]}
 CREATE FUNCTION public.tid(n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
 CREATE FUNCTION public.check_review(ok boolean) RETURNS void LANGUAGE plpgsql AS $$begin if ok is distinct from true then raise exception 'assertion failed';end if;end$$;
 INSERT INTO auth.users SELECT tid(n),now() FROM generate_series(1,5)n;
 INSERT INTO public.admin_memberships VALUES(tid(5),'admin',true);
 INSERT INTO public.system_steps VALUES ('TREAT',3,'core');
 INSERT INTO public.products(id,slug,display_name,product_type,swatch_from,swatch_to,sort_order,editorial_description,editorial_how_to_use,routine_group,routine_sort,system_step_name)
 VALUES(tid(10),'synthetic-serum','Synthetic serum','Serum','#fff','#fff',1,'Synthetic','Synthetic','core',1,'TREAT');
 INSERT INTO public.orders(id,order_number,user_id,status,merchandise_subtotal_cents,total_cents,idempotency_key,stripe_checkout_session_id)
 SELECT tid(20+n),'REV-'||n,tid(n),'paid',100,100,'review-test-'||n,'cs_review_'||n FROM generate_series(1,4)n;
 INSERT INTO public.order_items(id,order_id,product_id,product_slug,product_name,variant_key,variant_label,unit_price_cents,quantity,line_subtotal_cents)
 SELECT tid(30+n),tid(20+n),tid(10),'synthetic-serum','Synthetic serum','one','One',100,1,100 FROM generate_series(1,4)n;
 INSERT INTO private.checkout_verified_payments(order_id,session_id,contract_version,payment_intent_id,discount_cents,shipping_cents,tax_cents,total_cents,tax_breakdown,shipping_name,shipping_address)
 SELECT tid(20+n),'cs_review_'||n,'checkout_v2','pi_review_'||n,0,0,0,100,'[]','Synthetic','{}' FROM generate_series(1,4)n;`);
  const migration = readdirSync(
    new URL("../../supabase/migrations", import.meta.url),
  ).find((x) => x.endsWith("_public_product_reviews.sql"));
  sql(read(`supabase/migrations/${migration}`));
  sql(`SET ROLE service_role;
 SELECT public.submit_product_review(public.tid(1),public.tid(31),0,'Alex',1,'Not for me','This texture was not for me.',true);
 DO $$BEGIN BEGIN PERFORM public.submit_product_review(public.tid(2),public.tid(31),0,'Wrong',5,'No','Not my purchase.',true);RAISE EXCEPTION 'ownership escaped';EXCEPTION WHEN insufficient_privilege THEN NULL;END;END$$;
 DO $$BEGIN BEGIN PERFORM public.submit_product_review(public.tid(1),public.tid(31),0,'Alex',5,'No','Duplicate request.',true);RAISE EXCEPTION 'duplicate escaped';EXCEPTION WHEN serialization_failure THEN NULL;END;END$$;
 RESET ROLE;`);
  const id = sql(
    `select id from private.product_reviews where user_id=tid(1)`,
  ).trim();
  sql(`SET ROLE service_role; SELECT moderate_product_review(tid(5),'${id}',1,'published'); SELECT check_review((read_public_product_reviews('synthetic-serum')->>'count')::int=0); SELECT submit_product_review(tid(1),tid(31),1,'Alex',2,'Updated','I have updated my experience.',true); RESET ROLE;
 SELECT check_review((select published_revision=1 and revision=2 from private.product_reviews where id='${id}'));
 SET ROLE service_role; SELECT withdraw_product_review(tid(1),'${id}',2);
 DO $$BEGIN BEGIN PERFORM moderate_product_review(tid(5),'${id}',2,'published');RAISE EXCEPTION 'stale approval escaped';EXCEPTION WHEN serialization_failure THEN NULL;END;END$$;RESET ROLE;
 SELECT check_review((select published_revision is null and status='withdrawn' from private.product_reviews where id='${id}'));
 SET ROLE anon; DO $$BEGIN BEGIN PERFORM * FROM private.product_reviews;RAISE EXCEPTION 'private table escaped';EXCEPTION WHEN insufficient_privilege THEN NULL;END;END$$;RESET ROLE;`);
  // Real overlapping transactions must serialize on the account lock; a retry cannot create another vote.
  const statement = `SET ROLE service_role; SELECT submit_product_review(tid(2),tid(32),0,'Jo',3,'Mixed','Some things worked, some did not.',true);`;
  async function concurrentSubmission(statement) {
    const first = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
    let firstOutput = "";
    first.stdout.on("data", (x) => (firstOutput += x));
    let firstError = "";
    first.stderr.on("data", (x) => (firstError += x));
    const firstDone = new Promise((resolve) => first.on("close", resolve));
    first.stdin.write(`BEGIN;${statement}\n\\echo held\n`);
    const deadline = Date.now() + 8000;
    while (!firstOutput.includes("held")) {
      assert.ok(Date.now() < deadline, firstError || "first lock timeout");
      await new Promise((r) => setTimeout(r, 20));
    }
    const second = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
    let secondError = "";
    second.stderr.on("data", (x) => (secondError += x));
    const secondDone = new Promise((resolve) => second.on("close", resolve));
    second.stdin.end(
      `SET application_name='public-review-contender';${statement}`,
    );
    while (
      sql(
        `select exists(select 1 from pg_stat_activity where datname=current_database() and application_name='public-review-contender' and wait_event_type='Lock')`,
      ).trim() !== "t"
    ) {
      assert.ok(Date.now() < deadline, "contender did not lock");
      await new Promise((r) => setTimeout(r, 20));
    }
    first.stdin.end("COMMIT;");
    assert.equal(await firstDone, 0);
    assert.notEqual(await secondDone, 0);
    assert.match(secondError, /revision conflict/);
  }
  await concurrentSubmission(statement);
  sql(
    `SELECT check_review((select count(*)=1 from private.product_reviews where user_id=tid(2)));`,
  );
  // Future live-commerce proof is synthetic and confined to this disposable database.
  // Production migration deliberately does not relax the existing sandbox-only Order constraint.
  sql(`ALTER TYPE public.checkout_environment ADD VALUE 'live';`);
  sql(`ALTER TABLE public.orders DROP CONSTRAINT orders_sandbox_only;
 UPDATE public.orders SET checkout_environment='live' WHERE user_id IN(tid(3),tid(4));
 SET ROLE service_role;
 SELECT submit_product_review(tid(3),tid(33),0,'Lee',1,'Disappointed','Not the right fit for my routine.',true);
 SELECT submit_product_review(tid(4),tid(34),0,'Sam',5,'Good fit','A good fit for my usual routine.',true);
 RESET ROLE;`);
  const ids = sql(
    `SELECT id FROM private.product_reviews WHERE user_id IN(tid(3),tid(4)) ORDER BY user_id`,
  )
    .trim()
    .split("\n");
  sql(`SET ROLE service_role; DO $$BEGIN BEGIN PERFORM moderate_product_review(tid(5),'${ids[0]}',1,'published');RAISE EXCEPTION 'disabled publication escaped';EXCEPTION WHEN insufficient_privilege THEN NULL;END;END$$;RESET ROLE;
 UPDATE private.product_review_control SET publication_enabled=true;
 SET ROLE service_role; SELECT moderate_product_review(tid(5),'${ids[0]}',1,'published');SELECT moderate_product_review(tid(5),'${ids[1]}',1,'published');
 SELECT check_review((read_public_product_reviews('synthetic-serum',null,1)->>'count')::int=2);
 SELECT check_review((read_public_product_reviews('synthetic-serum',null,1)->>'average')::numeric=3);
 SELECT check_review(jsonb_array_length(read_public_product_reviews('synthetic-serum',null,1)->'reviews')=1);
 SELECT check_review((read_public_product_reviews('synthetic-serum',(read_public_product_reviews('synthetic-serum',null,1)->>'nextCursor')::uuid,1)->>'nextCursor') IS NULL);
 SELECT submit_product_review(tid(3),tid(33),1,'Lee',2,'An update','Some improvement after more use.',true);
 SELECT check_review((read_public_product_reviews('synthetic-serum')->>'average')::numeric=3);
 SELECT moderate_product_review(tid(5),'${ids[0]}',2,'published');
 SELECT check_review((read_public_product_reviews('synthetic-serum')->>'average')::numeric=3.5);
 SELECT withdraw_product_review(tid(4),'${ids[1]}',1);
 SELECT check_review((read_public_product_reviews('synthetic-serum')->>'count')::int=1);
 SELECT check_review((read_public_product_reviews('synthetic-serum')->>'average')::numeric=2);
 RESET ROLE;
 -- Provenance cannot be changed even by a direct table update.
 DO $$BEGIN BEGIN UPDATE private.product_reviews SET environment='live' WHERE user_id=tid(2);RAISE EXCEPTION 'provenance mutation escaped';EXCEPTION WHEN check_violation THEN NULL;END;END$$;
 -- Same account/product can rehearse and later submit a genuinely paid purchase independently.
 INSERT INTO public.orders(id,order_number,user_id,status,merchandise_subtotal_cents,total_cents,idempotency_key,stripe_checkout_session_id,checkout_environment)
 VALUES(tid(41),'REV-LIVE-2',tid(2),'paid',100,100,'review-live-2','cs_review_live_2','live');
 INSERT INTO public.order_items(id,order_id,product_id,product_slug,product_name,variant_key,variant_label,unit_price_cents,quantity,line_subtotal_cents)
 VALUES(tid(42),tid(41),tid(10),'synthetic-serum','Synthetic serum','one','One',100,1,100);
 INSERT INTO private.checkout_verified_payments(order_id,session_id,contract_version,payment_intent_id,discount_cents,shipping_cents,tax_cents,total_cents,tax_breakdown,shipping_name,shipping_address)
 VALUES(tid(41),'cs_review_live_2','checkout_v2','pi_review_live_2',0,0,0,100,'[]','Synthetic','{}');
 SET ROLE service_role;
 SELECT check_review(jsonb_array_length(read_owned_product_reviews(tid(2)))=2);
 SELECT check_review((SELECT count(*)=1 FROM jsonb_array_elements(read_owned_product_reviews(tid(2))) x WHERE x->>'environment'='live' AND x->>'id' IS NULL));
 RESET ROLE;`);
  await concurrentSubmission(
    `SET ROLE service_role; SELECT submit_product_review(tid(2),tid(42),0,'Jo',4,'Live purchase','My genuine purchase experience.',true);`,
  );
  sql(`SET ROLE service_role;
 DO $$BEGIN BEGIN PERFORM submit_product_review(tid(2),tid(42),0,'Jo',5,'Duplicate','Duplicate genuine purchase.',true);RAISE EXCEPTION 'live duplicate escaped';EXCEPTION WHEN serialization_failure THEN NULL;END;END$$;
 RESET ROLE;
 SELECT check_review((select count(*)=2 from private.product_reviews where user_id=tid(2)));
 DO $$DECLARE live_id uuid; demo_id uuid; BEGIN
 SELECT id INTO live_id FROM private.product_reviews WHERE user_id=tid(2) AND environment='live';
 SELECT id INTO demo_id FROM private.product_reviews WHERE user_id=tid(2) AND environment='sandbox';
 PERFORM moderate_product_review(tid(5),live_id,1,'published');
 PERFORM moderate_product_review(tid(5),demo_id,1,'published');
 PERFORM check_review((read_public_product_reviews('synthetic-serum')->>'count')::int=2);
 PERFORM submit_product_review(tid(2),tid(32),1,'Jo',1,'Demo edit','Only change the demo review.',true);
 PERFORM check_review((SELECT revision=1 AND status='published' FROM private.product_reviews WHERE id=live_id));
 PERFORM withdraw_product_review(tid(2),demo_id,2);
 PERFORM check_review((read_public_product_reviews('synthetic-serum')->>'count')::int=2);
 PERFORM submit_product_review(tid(2),tid(42),1,'Jo',3,'Live edit','Only change the genuine review.',true);
 PERFORM check_review((SELECT revision=3 AND status='withdrawn' FROM private.product_reviews WHERE id=demo_id));
 PERFORM moderate_product_review(tid(5),live_id,2,'published');
 PERFORM check_review((read_public_product_reviews('synthetic-serum')->>'average')::numeric=2.5);
 END$$;
 -- Rejecting an edit must not prevent a later neutral takedown of older publication.
 SET ROLE service_role;
 SELECT submit_product_review(tid(3),tid(33),2,'Lee',2,'Another edit','An updated honest account.',true);
 SELECT moderate_product_review(tid(5),'${ids[0]}',3,'rejected','personal_data');
 SELECT check_review((read_public_product_reviews('synthetic-serum')->>'count')::int=2);
 SELECT check_review((SELECT count(*)=1 FROM jsonb_array_elements(read_product_review_queue(tid(5))) x WHERE x->>'id'='${ids[0]}' AND x->>'status'='rejected' AND (x->>'publishedRevision')::int=2));
 SELECT moderate_product_review(tid(5),'${ids[0]}',3,'removed','personal_data');
 SELECT check_review((read_public_product_reviews('synthetic-serum')->>'count')::int=1);
 SELECT check_review((read_public_product_reviews('synthetic-serum')->>'average')::numeric=3);
 DO $$BEGIN BEGIN PERFORM moderate_product_review(tid(5),'${ids[0]}',3,'published');RAISE EXCEPTION 'removed publication revived';EXCEPTION WHEN serialization_failure THEN NULL;END;END$$;
 RESET ROLE;
 SELECT check_review((SELECT count(*)=3 FROM private.product_review_revisions WHERE review_id='${ids[0]}'));
 SELECT check_review((SELECT count(*)=1 FROM private.product_review_audit WHERE review_id='${ids[0]}' AND action='removed' AND reason='personal_data'));`);
  console.log(
    "Public review SQL: ownership, consent/revision, neutral publication, sandbox exclusion, withdrawal fencing, RLS concurrent dedupe, publication gate, complete aggregates, pagination and order provenance passed.",
  );
} finally {
  docker(["exec", container, "dropdb", "--if-exists", "-U", "postgres", db]);
}
