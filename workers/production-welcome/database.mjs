import { X509Certificate } from "node:crypto";
import { validRecipient, validUuid } from "./bindings.mjs";

const projectRef = "erasogmsqpgiirovubjh";
const storefrontProject = "prj_N9nyPL9SixJHOROIovS8PDQ9aKny";
const role = "helix_native_welcome_worker";
const unavailable = () => new Error("Native welcome database unavailable.");

function connectionConfig(env) {
  const host = env.HELIX_NATIVE_WELCOME_DB_HOST;
  const password = env.HELIX_NATIVE_WELCOME_DB_PASSWORD;
  const ca = env.HELIX_NATIVE_WELCOME_DB_CA;
  const pooler = typeof host === "string" && /^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(host);
  // These startup settings have no truthy "disabled" value in pg, which reads
  // process.env independently of the environment passed to this module.
  if (
    process.env.NODE_PG_FORCE_NATIVE !== undefined ||
    process.env.PGOPTIONS ||
    process.env.PGREPLICATION ||
    (!pooler && host !== `db.${projectRef}.supabase.co`) ||
    typeof password !== "string" ||
    !password ||
    typeof ca !== "string" ||
    !ca.startsWith("-----BEGIN CERTIFICATE-----")
  )
    throw unavailable();
  new X509Certificate(ca);
  return {
    host,
    port: 5432,
    database: "postgres",
    user: pooler ? `${role}.${projectRef}` : role,
    password,
    ssl: { ca, rejectUnauthorized: true, minVersion: "TLSv1.2" },
    enableChannelBinding: true,
    application_name: "helix-native-welcome",
    client_encoding: "UTF8",
    connectionTimeoutMillis: 5000,
    lock_timeout: 3000,
    statement_timeout: 6000,
    query_timeout: 8000,
  };
}

/** @typedef {{contractHash: string, projectId: string, deploymentId: string, gitSha: string}} Release */
/** @typedef {{intentId: string, attemptId: string}} Attempt */
/** @typedef {Attempt & {recipient: string, reservedAt: string}} Reservation */
/** @typedef {{
 *   reserve: (release: Release) => Promise<Reservation | null>,
 *   finish: (attempt: Attempt, outcome: "submitted" | "unknown") => Promise<boolean>
 * }} WelcomeDatabase */

/**
 * Each SQL call commits before its result reaches the caller. The two
 * security-definer functions attest the owner-installed production marker
 * in that same transaction. The worker has no direct marker/table grant.
 * @template T
 * @param {Record<string, string | undefined>} env
 * @param {(db: WelcomeDatabase) => Promise<T>} run
 */
export async function withNativeWelcomeDatabase(env, run) {
  let client;
  let connected = false;
  async function query(sql, params) {
    if (!connected) throw unavailable();
    try {
      const { rows } = await client.query(sql, params);
      if (!Array.isArray(rows)) throw unavailable();
      return rows;
    } catch {
      throw unavailable();
    }
  }
  try {
    try {
      const config = connectionConfig(env);
      const { Client } = await import("pg");
      client = new Client(config);
      client.on("error", () => {
        connected = false;
      });
      await client.connect();
      connected = true;
      const rows = await query(`select current_user as role, session_user as login, current_database() as database
        from pg_catalog.pg_roles where rolname = current_user and rolcanlogin
          and not (rolsuper or rolcreaterole or rolcreatedb or rolreplication or rolbypassrls)`);
      if (rows.length !== 1 || rows[0].role !== role || rows[0].login !== role || rows[0].database !== "postgres")
        throw unavailable();
    } catch {
      throw unavailable();
    }
    return await run({
      async reserve({ contractHash, projectId, deploymentId, gitSha }) {
        if (
          !/^[0-9a-f]{64}$/.test(contractHash) ||
          contractHash !== env.HELIX_NATIVE_WELCOME_CONTRACT_SHA256 ||
          !/^prj_[A-Za-z0-9]{1,64}$/.test(projectId) ||
          projectId === storefrontProject ||
          projectId !== env.VERCEL_PROJECT_ID ||
          projectId !== env.HELIX_NATIVE_WELCOME_PROJECT_ID ||
          !/^dpl_[A-Za-z0-9]{1,64}$/.test(deploymentId) ||
          deploymentId !== env.VERCEL_DEPLOYMENT_ID ||
          !/^[0-9a-f]{40}$/.test(gitSha) ||
          gitSha !== env.VERCEL_GIT_COMMIT_SHA
        )
          throw unavailable();
        const rows = await query(
          "select intent_id,attempt_id,recipient,reserved_at from helix_welcome_worker.reserve($1::text,$2::text,$3::text,$4::text)",
          [contractHash, projectId, deploymentId, gitSha],
        );
        if (rows.length === 0) return null;
        const record = rows[0];
        if (
          rows.length !== 1 ||
          !validUuid(record?.intent_id) ||
          !validUuid(record.attempt_id) ||
          !validRecipient(record.recipient) ||
          !(record.reserved_at instanceof Date) ||
          !Number.isFinite(record.reserved_at.getTime())
        )
          throw unavailable();
        return {
          intentId: record.intent_id,
          attemptId: record.attempt_id,
          recipient: record.recipient,
          reservedAt: record.reserved_at.toISOString(),
        };
      },
      async finish({ intentId, attemptId }, outcome) {
        if (!validUuid(intentId) || !validUuid(attemptId) || !["submitted", "unknown"].includes(outcome))
          throw unavailable();
        const rows = await query("select helix_welcome_worker.finish($1::uuid,$2::uuid,$3::text) as recorded", [
          intentId,
          attemptId,
          outcome,
        ]);
        if (rows.length !== 1 || typeof rows[0]?.recorded !== "boolean") throw unavailable();
        return rows[0].recorded;
      },
    });
  } finally {
    connected = false;
    if (client) {
      const timeout = setTimeout(() => client.connection.stream.destroy(), 2000);
      timeout.unref();
      try {
        await client.end();
      } catch {
        throw unavailable();
      } finally {
        clearTimeout(timeout);
      }
    }
  }
}
