import { productionMarketingTestTarget } from "../../tests/helpers/production-marketing-target";
import { execFileSync } from "node:child_process";
import { createDecipheriv, createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
vi.mock("@/lib/release/deployment-authorization", () => ({
  productionDeploymentAuthorized: async (env: Record<string, string | undefined>) => env.VERCEL_DEPLOYMENT_ID === "dpl_SyntheticEmailBuild",
}));
import { handleProductionMarketingRequest, handleProductionMarketingUnsubscribe, type ProductionMarketingRequestStorage } from "../../lib/production-marketing/requests";
import type { ProductionMarketingHeldEnvelope } from "../../lib/production-marketing/capabilities";

// Only the owning no-network PostgreSQL harness may invoke this synthetic integration.
const container = process.env.HELIX_SYNTHETIC_PRODUCTION_MARKETING_CONTAINER ?? "";
if (!/^helix-production-marketing-539-[0-9]+-[0-9]+$/.test(container)
  || process.env.DOCKER_HOST || process.env.DOCKER_CONTEXT) throw new Error("Owned local database required.");
const docker = (args: string[], input?: string) => execFileSync("docker", args, { encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"] });
const endpoint = JSON.parse(docker(["context", "inspect"]))[0].Endpoints.docker.Host as string;
if (!endpoint.startsWith("unix://") || docker(["inspect", "-f", '{{index .Config.Labels "helix.task"}}', container]).trim() !== "production-marketing-539-synthetic") throw new Error("Owned local database required.");
const sql = (input: string) => {
  try { return docker(["exec", "-i", container, "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"], input).trim(); }
  catch { throw new Error("Synthetic database operation failed."); }
};
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const origin = "https://www.helixskin.us";
const env = {
  ...productionMarketingTestTarget,
  HELIX_PRODUCTION_MARKETING_ENABLED: "true", HELIX_PRODUCTION_MARKETING_ABUSE_KEY: "b".repeat(64),
  HELIX_PRODUCTION_MARKETING_CAPABILITY_KEY: "c".repeat(64), HELIX_PRODUCTION_MARKETING_CAPABILITY_KEY_ID: "synthetic-v1",
};
const storage: ProductionMarketingRequestStorage = {
  async request(input) {
    return sql(`SET ROLE service_role; SELECT public.request_production_marketing_subscription(${literal(input.email)},
      ${literal(input.confirmationHash)},${literal(input.preferenceHash)},${literal(input.requesterHash)},true,
      ${literal(input.wordingVersion)},${literal(JSON.stringify(input.deliveryPayload))}::jsonb);`) === "t";
  },
  async confirm(value) { return sql(`SET ROLE service_role; SELECT public.confirm_production_marketing_subscription(${literal(value)});`) === "t"; },
  async withdraw(value) { return sql(`SET ROLE service_role; SELECT public.withdraw_production_marketing_subscription(${literal(value)});`) === "t"; },
};
const post = (action: string, body: unknown) => new Request(`${origin}/api/marketing/production/${action}`, {
  method: "POST", headers: { origin, "content-type": "application/json", "x-vercel-forwarded-for": "192.0.2.1" }, body: JSON.stringify(body),
});
function record(email: string) {
  return JSON.parse(sql(`SELECT jsonb_build_object('state',s.state,'generation',s.generation,'revision',s.revision,
    'confirmationHash',g.confirmation_hash,'preferenceHash',g.preference_hash,'payload',i.delivery_payload,
    'intentState',i.state,'requestId',i.request_id,'requestRevision',i.request_revision,
    'expiresMs',extract(epoch from i.expires_at)*1000)
    FROM private.production_marketing_subscribers s JOIN private.production_marketing_generations g ON g.subscriber_id=s.id AND g.generation=s.generation
    JOIN private.production_marketing_confirmation_intents i ON i.subscriber_id=s.id AND i.generation=s.generation WHERE normalized_email=${literal(email)};`)) as {
      state: string; generation: number; revision: number; confirmationHash: string; preferenceHash: string;
      payload: ProductionMarketingHeldEnvelope | null; intentState: string; requestId: string; requestRevision: number; expiresMs: number;
    };
}
function decrypt(envelope: ProductionMarketingHeldEnvelope, email: string, key = env.HELIX_PRODUCTION_MARKETING_CAPABILITY_KEY) {
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(key, "hex"), Buffer.from(envelope.iv, "base64url"), { authTagLength: 16 });
  decipher.setAAD(Buffer.from(JSON.stringify(["helix:production-marketing:confirmation", 1, envelope.keyId, envelope.requestId, email,
    "welcome_only", "production_welcome_v1", envelope.issuedAt, envelope.expiresAt])));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
  // Never parse or use unauthenticated plaintext; final() must succeed first.
  const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64url")), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8")) as Record<string, string>;
}

it("proves actual enrollment, synthetic encrypted delivery recovery, explicit confirmation and paused withdrawal through PostgreSQL", async () => {
  const network = vi.fn(() => { throw new Error("Network forbidden in synthetic proof."); });
  vi.stubGlobal("fetch", network);
  try {
    sql("DELETE FROM private.production_marketing_request_limits; UPDATE private.production_marketing_controls SET enrollment_enabled=true;");
    const deps = { env, storage }, email = "handler@example.invalid";
    const submitted = await handleProductionMarketingRequest(post("subscription", { email, consent: true }), "subscription", deps);
    expect(submitted.status).toBe(202);
    expect(await submitted.text()).toBe('{"ok":true}');
    const pending = record(email);
    expect(pending.state).toBe("pending"); expect(pending.intentState).toBe("held");
    expect(pending.payload !== null).toBe(true);
    const envelope = pending.payload!;
    const clear = decrypt(envelope, email);
    expect(clear.email === email && clear.scope === "welcome_only" && clear.wordingVersion === "production_welcome_v1").toBe(true);
    expect(clear.requestId === pending.requestId && envelope.requestId === pending.requestId).toBe(true);
    expect(clear.issuedAt === envelope.issuedAt && clear.expiresAt === envelope.expiresAt).toBe(true);
    expect(Date.parse(clear.expiresAt) - Date.parse(clear.issuedAt)).toBe(86_400_000);
    expect(Date.parse(clear.expiresAt) === pending.expiresMs).toBe(true);
    expect(hash(clear.confirmationToken) === pending.confirmationHash && hash(clear.preferenceToken) === pending.preferenceHash).toBe(true);
    expect(pending.requestRevision === pending.revision).toBe(true);
    const persisted = sql("SELECT row_to_json(i) FROM private.production_marketing_confirmation_intents i;");
    expect(persisted.includes(clear.confirmationToken) || persisted.includes(clear.preferenceToken)).toBe(false);
    expect(() => decrypt(envelope, email, "d".repeat(64))).toThrow();
    expect(() => decrypt(envelope, "tampered@example.invalid")).toThrow();
    expect(() => decrypt({ ...envelope, tag: "A".repeat(22) }, email)).toThrow();
    for (const method of ["GET", "HEAD"]) {
      expect((await handleProductionMarketingRequest(new Request(`${origin}/api/marketing/production/confirm`, { method }), "confirm", deps)).status).toBe(405);
    }
    expect(record(email).state).toBe("pending");
    expect((await handleProductionMarketingRequest(post("confirm", { token: clear.confirmationToken }), "confirm", deps)).status).toBe(200);
    expect(record(email).state).toBe("confirmed"); expect(record(email).payload === null).toBe(true);
    expect((await handleProductionMarketingRequest(post("confirm", { token: clear.confirmationToken }), "confirm", deps)).status).toBe(200);
    expect(record(email).revision).toBe(2);
    sql("UPDATE private.production_marketing_controls SET enrollment_enabled=false,dispatch_enabled=false;");
    const paused = { env: { ...env, HELIX_PRODUCTION_MARKETING_ENABLED: "false" }, storage };
    const unsubscribe = () => new Request(`${origin}/api/marketing/production/unsubscribe?token=${clear.preferenceToken}`, {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click",
    });
    expect((await handleProductionMarketingUnsubscribe(unsubscribe(), paused)).status).toBe(200);
    expect((await handleProductionMarketingUnsubscribe(unsubscribe(), paused)).status).toBe(200);
    expect((await handleProductionMarketingRequest(post("preferences", { token: clear.confirmationToken }), "preferences", paused)).status).toBe(200);
    expect(record(email).state).toBe("withdrawn"); expect(record(email).revision).toBe(3);
    sql("UPDATE private.production_marketing_controls SET enrollment_enabled=true;");
    expect((await handleProductionMarketingRequest(post("confirm", { token: clear.confirmationToken }), "confirm", deps)).status).toBe(400);
    expect((await handleProductionMarketingRequest(post("subscription", { email, consent: true }), "subscription", deps)).status).toBe(202);
    const newer = record(email);
    expect(newer.generation).toBe(2);
    expect(newer.payload?.iv !== envelope.iv).toBe(true);
    const newerClear = decrypt(newer.payload!, email);
    // Old capability still restricts a later generation after its ciphertext was cleared.
    expect((await handleProductionMarketingRequest(post("preferences", { token: clear.preferenceToken }), "preferences", deps)).status).toBe(200);
    expect(record(email).payload === null && record(email).state === "withdrawn").toBe(true);
    expect((await handleProductionMarketingRequest(post("confirm", { token: newerClear.confirmationToken }), "confirm", deps)).status).toBe(400);
    expect(network).not.toHaveBeenCalled();
  } finally { vi.unstubAllGlobals(); }
}, 20_000);
