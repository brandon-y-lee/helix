import assert from "node:assert/strict";
import { handleWake } from "../../workers/production-welcome/publisher.mjs";

const origin = "https://publisher.vercel.app";
const env = {
  VERCEL: "1", VERCEL_ENV: "production", VERCEL_TARGET_ENV: "production",
  VERCEL_URL: "publisher-build.vercel.app", VERCEL_PROJECT_PRODUCTION_URL: "publisher.vercel.app",
  VERCEL_PROJECT_ID: "prj_native597", VERCEL_DEPLOYMENT_ID: "dpl_native597",
  VERCEL_GIT_PROVIDER: "github", VERCEL_GIT_REPO_ID: "123456", VERCEL_GIT_COMMIT_REF: "main",
  VERCEL_GIT_COMMIT_SHA: "d".repeat(40), HELIX_NATIVE_WELCOME_GIT_REPO_ID: "123456",
  HELIX_NATIVE_WELCOME_PROJECT_ID: "prj_native597", HELIX_NATIVE_WELCOME_ORIGIN: origin,
  HELIX_NATIVE_WELCOME_CONTRACT_SHA256: "c".repeat(64), HELIX_NATIVE_WELCOME_ENABLED: "true",
  HELIX_NATIVE_WELCOME_WAKE_TOKEN: "local-wake-".repeat(5), HELIX_NATIVE_WELCOME_DB_PASSWORD: "local-db".repeat(5),
  HELIX_NATIVE_WELCOME_RESEND_KEY: "re_" + "stub".repeat(8),
};

export async function exerciseNativeWelcomePublisher({ sql, seed, worker }) {
  // Only generated UUIDs are accepted by the proof's psql adapter; runtime uses pg query parameters.
  function uuid(value) {
    assert.match(value, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
    return "'" + value + "'::uuid";
  }
  const database = {
    async reserve(binding) {
      assert.deepEqual(binding, {
        contractHash: env.HELIX_NATIVE_WELCOME_CONTRACT_SHA256, projectId: env.VERCEL_PROJECT_ID,
        deploymentId: env.VERCEL_DEPLOYMENT_ID, gitSha: env.VERCEL_GIT_COMMIT_SHA,
      });
      const result = sql(`SELECT row_to_json(r) FROM helix_welcome_worker.reserve(
        repeat('c',64),'prj_native597','dpl_native597',repeat('d',40)) r;`, worker);
      if (!result) return null;
      const r = JSON.parse(result);
      return { intentId: r.intent_id, attemptId: r.attempt_id, recipient: r.recipient, reservedAt: r.reserved_at };
    },
    async finish({ intentId, attemptId }, outcome) {
      assert.ok(outcome === "submitted" || outcome === "unknown");
      return sql(`SELECT helix_welcome_worker.finish(${uuid(intentId)},${uuid(attemptId)},'${outcome}');`, worker) === "t";
    },
  };
  const contacts = new Map([
    ["matrix-global-out@example.invalid", { global: false, topic: true }],
    ["matrix-topic-out@example.invalid", { global: true, topic: false }],
  ]);
  const sent = [], handedOff = [];
  async function providerStub(url, { method, redirect, body }) {
    assert.equal(url, "https://api.resend.com/events/send");
    assert.equal(method, "POST");
    assert.equal(redirect, "error");
    const { email, event, payload } = JSON.parse(body);
    assert.equal(event, "helix.welcome.confirmed.v1");
    assert.match(email, /^matrix-[a-z-]+@example\.invalid$/);
    assert.deepEqual(Object.keys(payload), ["attempt_id"]);
    assert.equal(sql(`SELECT count(*) FROM private.production_marketing_messages
      WHERE state='native_reserved' AND native_attempt_id=${uuid(payload.attempt_id)};`), "1", "reservation committed before I/O");
    handedOff.push(email);
    // Model Resend's documented contact creation, global and Topic preference checks.
    // This fixture's Topic defaults to opt-in; an existing opt-out remains authoritative.
    if (!contacts.has(email)) contacts.set(email, { global: true, topic: true });
    const options = contacts.get(email);
    if (options.global && options.topic) sent.push(email);
    if (email === "matrix-lost-ack@example.invalid") throw new Error("Lost synthetic response");
    return Response.json({ object: "event", event }, { status: 202 });
  }
  const wake = () => handleWake(new Request(origin + "/api/wake", {
    method: "POST", headers: { authorization: "Bearer " + env.HELIX_NATIVE_WELCOME_WAKE_TOKEN },
  }), env, { withDatabase: async (_env, fn) => fn(database), fetchImpl: providerStub });

  for (const label of ["matrix-first", "matrix-global-out", "matrix-topic-out", "matrix-lost-ack"]) {
    const intentId = seed(label);
    const lost = label === "matrix-lost-ack";
    const result = await wake();
    assert.equal(result.status, lost ? 503 : 200);
    assert.deepEqual(await result.json(), { status: lost ? "held" : "submitted" });
    assert.equal(sql(`SELECT state FROM private.production_marketing_messages WHERE id=${uuid(intentId)};`), lost ? "native_unknown" : "native_submitted");
    assert.deepEqual(await (await wake()).json(), { status: "idle" });
  }
  assert.deepEqual(handedOff, ["matrix-first", "matrix-global-out", "matrix-topic-out", "matrix-lost-ack"].map(label => label + "@example.invalid"));
  assert.deepEqual(sent, ["matrix-first@example.invalid", "matrix-lost-ack@example.invalid"]);
}
