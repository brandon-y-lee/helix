import "server-only";
import { createCipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { PRODUCTION_MARKETING_WORDING_VERSION, type ProductionMarketingEnvironment } from "./contract";

export type ProductionMarketingHeldEnvelope = {
  version: 1; keyId: string; requestId: string; issuedAt: string; expiresAt: string;
  iv: string; tag: string; ciphertext: string;
};
export function readProductionMarketingCapabilityKey(env: ProductionMarketingEnvironment) {
  const key = env.HELIX_PRODUCTION_MARKETING_CAPABILITY_KEY;
  const keyId = env.HELIX_PRODUCTION_MARKETING_CAPABILITY_KEY_ID;
  if (!key || !/^[a-f0-9]{64}$/i.test(key) || !keyId || !/^[A-Za-z0-9_-]{1,64}$/.test(keyId)) {
    throw new Error("Production marketing is unavailable.");
  }
  return { key: Buffer.from(key, "hex"), keyId };
}

/** Encrypts one immutable held confirmation input, not a provider-ready message.
 * No decrypt/read API is exposed by P1. P2 must authenticate and compare every
 * binding and capability hash before it can qualify this input for delivery.
 */
export function sealProductionMarketingCapabilities(email: string, env: ProductionMarketingEnvironment) {
  const { key, keyId } = readProductionMarketingCapabilityKey(env);
  const requestId = randomUUID(), issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.parse(issuedAt) + 86_400_000).toISOString();
  const confirmationToken = randomBytes(32).toString("base64url"), preferenceToken = randomBytes(32).toString("base64url");
  const binding = { email, scope: "welcome_only", wordingVersion: PRODUCTION_MARKETING_WORDING_VERSION, requestId, issuedAt, expiresAt };
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  cipher.setAAD(Buffer.from(JSON.stringify(["helix:production-marketing:confirmation", 1, keyId, requestId, email,
    "welcome_only", PRODUCTION_MARKETING_WORDING_VERSION, issuedAt, expiresAt])));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify({ ...binding, confirmationToken, preferenceToken }), "utf8"), cipher.final()]);
  const deliveryPayload: ProductionMarketingHeldEnvelope = { version: 1, keyId, requestId, issuedAt, expiresAt,
    iv: iv.toString("base64url"), tag: cipher.getAuthTag().toString("base64url"), ciphertext: ciphertext.toString("base64url") };
  return { confirmationHash: createHash("sha256").update(confirmationToken).digest("hex"),
    preferenceHash: createHash("sha256").update(preferenceToken).digest("hex"), deliveryPayload };
}
