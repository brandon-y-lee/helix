import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

// Reuse maintained, guarded disposable PostgreSQL fixtures and all predecessor
// assertions. No database URL, hosted operation, or provider client is accepted.
const root = fileURLToPath(new URL("../../", import.meta.url));
const container = process.argv[2] ?? "helix-spec358-pg";
const source = path => readFileSync(root + path, "utf8");
function once(text, anchor, replacement) {
  assert.equal(text.split(anchor).length - 1, 1, `Composition anchor drift: ${anchor}`);
  return text.replace(anchor, () => replacement);
}
const metadata = `SELECT jsonb_build_object('definition',pg_get_functiondef(oid),
  'owner',proowner,'acl',proacl,'securityDefiner',prosecdef,'config',proconfig)
  FROM pg_proc WHERE oid=to_regprocedure('public.confirm_marketing_subscription_scoped(text,text,text)');`;
const proof = `
  migration('_legacy_marketing_confirmation_compatibility.sql');
  assert.equal(sql("SELECT to_regprocedure('public.confirm_marketing_subscription_scoped(text,text,text)') IS NOT NULL;").trim(),'t','Legacy welcome scoped RPC is installed');
  const shimMetadata=sql(${JSON.stringify(metadata)});
  const controls=sql("SELECT jsonb_agg(to_jsonb(c) ORDER BY environment,purpose) FROM private.email_controls c;");
  migration('_legacy_marketing_confirmation_compatibility.sql');
  assert.equal(sql(${JSON.stringify(metadata)}),shimMetadata,'Repeated shim preserves definition, owner, ACL, security and search_path');
  assert.equal(sql("SELECT jsonb_agg(to_jsonb(c) ORDER BY environment,purpose) FROM private.email_controls c;"),controls,'Installing shim never activates delivery');
  sql(source('supabase/tests/legacy_marketing_confirmation_compatibility.integration.sql'));
  sql("DELETE FROM private.marketing_request_limits; SET ROLE service_role; SELECT public.request_marketing_subscription('compat-race@example.invalid','footer','welcome_v1',repeat('K',64),repeat('b',64),true,marketing_contract_test.contract());");
  const confirmations=await concurrentLocked("SELECT public.confirm_marketing_subscription_scoped(repeat('K',64),repeat('N',64),'welcome');","SELECT public.confirm_marketing_subscription_scoped(repeat('K',64),repeat('O',64),'welcome');");
  assert.ok(confirmations.every(value=>value.includes('confirmed')),'Concurrent scoped confirmations are idempotent');
  assert.equal(sql("SELECT count(*) FROM private.marketing_consent_evidence e JOIN private.marketing_subscribers s ON s.id=e.subscriber_id WHERE s.normalized_email='compat-race@example.invalid' AND e.event='confirmed';").trim(),'1');
  assert.equal(sql("SELECT count(*) FROM private.marketing_preference_tokens t JOIN private.marketing_subscribers s ON s.id=t.subscriber_id WHERE s.normalized_email='compat-race@example.invalid';").trim(),'1');
  assert.equal(sql("SELECT jsonb_agg(to_jsonb(c) ORDER BY environment,purpose) FROM private.email_controls c;"),controls,'Confirmation never changes delivery controls');
`;
let legacy = source("scripts/db/test-marketing-subscription-contracts.mjs");
legacy = once(legacy, '\nconst root = fileURLToPath(new URL("../../", import.meta.url));', `\nconst root = ${JSON.stringify(root)};`);
legacy = once(legacy, 'from "./checkout-payment-test-fixture.mjs";', `from ${JSON.stringify(pathToFileURL(root + "scripts/db/checkout-payment-test-fixture.mjs").href)};`);
const resultAnchor = '  console.log(JSON.stringify({ status: "passed", postgresMajor: 17,';
legacy = once(legacy, resultAnchor, proof + resultAnchor);
const legacyResult = execFileSync(process.execPath, ["--input-type=module", "-", container], {
  input: legacy, encoding: "utf8", maxBuffer: 8 * 1024 * 1024,
});
assert.equal(JSON.parse(legacyResult).status, "passed");

// In the maintained combined suite, install shim before lifecycle, then prove
// lifecycle/reviews replace it and a late shim leaves the enhanced RPC intact.
let combined = source("scripts/db/test-lifecycle-combined.mjs");
combined = once(combined, "const root=fileURLToPath(new URL('../../',import.meta.url));", `const root=${JSON.stringify(root)};`);
const beforeConsent = `
const consentAnchor='  migration("_lifecycle_consent_activity.sql");';
wrapper=once(wrapper,consentAnchor,"  migration('_legacy_marketing_confirmation_compatibility.sql');\\n"+consentAnchor);
`;
combined = once(combined, "const addition=`", beforeConsent + "const addition=`");
const afterReviews = "  migration('_review_winback_core.sql');";
const fullProof = `
  const enhanced=sql(${JSON.stringify(metadata)});
  assert.ok(enhanced.includes('lifecycle_reviews'),'Full reviewed scoped behavior replaces welcome-only shim');
  migration('_legacy_marketing_confirmation_compatibility.sql');
  migration('_legacy_marketing_confirmation_compatibility.sql');
  assert.equal(sql(${JSON.stringify(metadata)}),enhanced,'Late shim preserves full definition, owner, ACL, security and search_path');
`;
// This code is embedded in the combined suite's generated harness template.
combined = once(combined, afterReviews, afterReviews + fullProof.replaceAll("\\", "\\\\").replaceAll("`", "\\`"));
const combinedResult = execFileSync(process.execPath, ["--input-type=module", "-", container], {
  input: combined, encoding: "utf8", maxBuffer: 8 * 1024 * 1024,
});
assert.equal(JSON.parse(combinedResult).status, "passed");
console.log(JSON.stringify({ status: "passed", postgresMajor: 17, legacyScopedConfirmation: true,
  scopedRejectionNoSideEffects: true, actualConcurrentConfirmation: true,
  fullMigrationOrders: true, enhancedFunctionPreserved: true, providerMutations: 0 }));
