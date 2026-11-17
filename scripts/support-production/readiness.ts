/** Read-only packet evaluation. It never establishes live state or grants action authority. */
export const readinessClaims = [
  "persistedSubmission", "providerHandoff", "inboxReceipt", "operatorReply",
  "maximumOriginalProcessing", "maximumCleanedDelivery", "operatorAttachmentHashes",
  "threadGrouping", "lateMediaAfterReply", "privateArchiveRestore", "developmentAccessRetired",
  "providerIsolation", "legacyReconciliation", "decoderDeployment", "quotaBudget", "reconciliationMonitoring",
  "primaryMonitor", "backupMonitor", "preservationCustodian",
] as const;
const configurationFields = [
  "context", "origin", "projectRef", "projectUrl", "contractId", "storedProjectRef", "storedContractId",
  "photoBucket", "storedPhotoBucket", "photoWorkerLimit", "acknowledgementPolicy", "credentialsPresent", "runtimeControls", "storedControls",
];
const credentialFields = ["database", "abuse", "worker", "sending", "sentWebhook"];
const controlFields = ["admission", "worker", "fullMedia", "isolation", "operations"];
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return object(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function booleans(value: unknown, fields: readonly string[]) {
  return exact(value, fields) && fields.every((key) => typeof value[key] === "boolean");
}
export function evaluateSupportReadiness(packet: unknown, expectedCandidate: string, now = Date.now()) {
  const checks = {
    packetFormat: false, candidateMatched: false, snapshotFresh: false, productionContext: false,
    targetIdentity: false, storageBinding: false, photoLeaseCapacity: false,
    credentialsDeclared: false, controlsDisabled: false, manualAcknowledgementPolicy: false,
  };
  let claims: Record<string, unknown> = {};
  if (exact(packet, ["version", "candidateCommit", "observedAt", "configuration", "claims"])
    && packet.version === 1 && exact(packet.configuration, configurationFields)
    && booleans(packet.claims, readinessClaims)) {
    const config = packet.configuration;
    claims = packet.claims as Record<string, unknown>;
    checks.packetFormat = booleans(config.credentialsPresent, credentialFields) && booleans(config.runtimeControls, controlFields) && booleans(config.storedControls, controlFields);
    checks.candidateMatched = /^[a-f0-9]{40}$/.test(expectedCandidate) && packet.candidateCommit === expectedCandidate;
    const observed = typeof packet.observedAt === "string" && packet.observedAt.length <= 32
      ? Date.parse(packet.observedAt) : NaN;
    checks.snapshotFresh = Number.isFinite(now) && Number.isFinite(observed) && observed <= now
      && now - observed <= 15 * 60_000 && new Date(observed).toISOString() === packet.observedAt;
    checks.productionContext = config.context === "production" && config.origin === "https://www.helixskin.us";
    checks.targetIdentity = typeof config.projectRef === "string" && /^[a-z0-9]{20}$/.test(config.projectRef)
      && config.projectUrl === `https://${config.projectRef}.supabase.co` && config.storedProjectRef === config.projectRef
      && typeof config.contractId === "string" && uuid.test(config.contractId) && config.storedContractId === config.contractId;
    checks.storageBinding = typeof config.photoBucket === "string" && /^[a-z0-9][a-z0-9-]{2,62}$/.test(config.photoBucket)
      && !["helix-support-photos", "helix-catalog"].includes(config.photoBucket) && config.storedPhotoBucket === config.photoBucket;
    checks.photoLeaseCapacity = Number.isInteger(config.photoWorkerLimit) && Number(config.photoWorkerLimit) >= 1 && Number(config.photoWorkerLimit) <= 16;
    checks.credentialsDeclared = booleans(config.credentialsPresent, credentialFields)
      && credentialFields.every((key) => (config.credentialsPresent as Record<string, unknown>)[key] === true);
    checks.controlsDisabled = [config.runtimeControls, config.storedControls].every((controls) =>
      booleans(controls, controlFields) && controlFields.every((key) => (controls as Record<string, unknown>)[key] === false));
    checks.manualAcknowledgementPolicy = config.acknowledgementPolicy === "none_native_manual";
  }
  const missingClaims = readinessClaims.filter((name) => claims[name] !== true);
  const configurationComplete = Object.values(checks).every(Boolean);
  const claimsComplete = checks.packetFormat && missingClaims.length === 0;
  return {
    status: configurationComplete && claimsComplete ? "operator_review_required" as const : "blocked" as const,
    configurationComplete, claimsComplete, checks, missingClaims,
    actualProductionVerified: false as const, activationAuthorized: false as const,
    notice: "Supplied snapshots and claims are not independently verified live state. Exact deployed canaries, private preservation, effective access isolation and applicable action approvals remain required.",
  };
}
