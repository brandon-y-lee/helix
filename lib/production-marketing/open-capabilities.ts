import "server-only";
import { createDecipheriv, createHash } from "node:crypto";
import { readProductionMarketingCapabilityKey } from "./capabilities";
import { PRODUCTION_MARKETING_CAPABILITY, PRODUCTION_MARKETING_WORDING_VERSION, type ProductionMarketingEnvironment } from "./contract";
import type { ProductionMarketingIntent } from "./delivery-types";
const bad=()=>new Error("Production marketing is unavailable.");
export function openProductionMarketingCapabilities(intent:ProductionMarketingIntent,env:ProductionMarketingEnvironment) {
  const e=intent.envelope;
  if(!e || JSON.stringify(e).length>8192 || e.version!==1 || e.requestId!==intent.requestId || e.issuedAt!==intent.issuedAt || e.expiresAt!==intent.expiresAt
    || Date.parse(e.expiresAt)-Date.parse(e.issuedAt)!==86_400_000 || Date.parse(e.expiresAt)<=Date.now())throw bad();
  const active=readProductionMarketingCapabilityKey(env);
  let key=active.keyId===e.keyId?active.key:null;
  // Explicit server-only retained-key allowlist. Never a path, URL or provider lookup.
  if(!key && env.HELIX_PRODUCTION_MARKETING_CAPABILITY_KEYS) {
    const raw=env.HELIX_PRODUCTION_MARKETING_CAPABILITY_KEYS;
    if(raw.length>4096)throw bad();
    const keys:unknown=JSON.parse(raw);
    if(keys && typeof keys==="object" && !Array.isArray(keys) && Object.hasOwn(keys,e.keyId)) {
      const value=(keys as Record<string,unknown>)[e.keyId];
      if(typeof value==="string" && /^[a-f0-9]{64}$/i.test(value))key=Buffer.from(value,"hex");
    }
  }
  if(!key)throw bad();
  const decode=(value:string,length?:number)=>{if(typeof value!=="string"||!/^[A-Za-z0-9_-]+$/.test(value))throw bad();const bytes=Buffer.from(value,"base64url");if(bytes.toString("base64url")!==value||(length!==undefined&&bytes.length!==length))throw bad();return bytes;};
  const decipher=createDecipheriv("aes-256-gcm",key,decode(e.iv,12),{authTagLength:16});
  decipher.setAAD(Buffer.from(JSON.stringify(["helix:production-marketing:confirmation",1,e.keyId,e.requestId,intent.email,"welcome_only",PRODUCTION_MARKETING_WORDING_VERSION,e.issuedAt,e.expiresAt])));
  decipher.setAuthTag(decode(e.tag,16));
  // Never parse or use plaintext until GCM authentication succeeds.
  const v:unknown=JSON.parse(Buffer.concat([decipher.update(decode(e.ciphertext)),decipher.final()]).toString("utf8"));
  if(!v||typeof v!=="object"||Array.isArray(v))throw bad();
  const p=v as Record<string,unknown>;
  if(Object.keys(p).length!==8||p.email!==intent.email||p.scope!=="welcome_only"||p.wordingVersion!==PRODUCTION_MARKETING_WORDING_VERSION
    ||p.requestId!==e.requestId||p.issuedAt!==e.issuedAt||p.expiresAt!==e.expiresAt
    ||typeof p.confirmationToken!=="string"||!PRODUCTION_MARKETING_CAPABILITY.test(p.confirmationToken)
    ||typeof p.preferenceToken!=="string"||!PRODUCTION_MARKETING_CAPABILITY.test(p.preferenceToken)
    ||createHash("sha256").update(p.confirmationToken).digest("hex")!==intent.confirmationHash
    ||createHash("sha256").update(p.preferenceToken).digest("hex")!==intent.preferenceHash)throw bad();
  return {confirmationToken:p.confirmationToken,preferenceToken:p.preferenceToken};
}
