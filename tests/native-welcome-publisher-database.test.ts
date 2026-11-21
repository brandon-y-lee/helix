import { rootCertificates } from "node:tls";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withNativeWelcomeDatabase } from "../workers/production-welcome/database.mjs";

const pg = vi.hoisted(() => {
  const client = {
    connect: vi.fn(),
    query: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
  };
  return {
    client,
    Client: vi.fn(function () {
      return client;
    }),
  };
});
vi.mock("pg", () => ({ Client: pg.Client }));

const role = "helix_native_welcome_worker";
const projectRef = "erasogmsqpgiirovubjh";
const host = `db.${projectRef}.supabase.co`;
const identity = {
  contractHash: "a".repeat(64),
  projectId: "prj_IndependentPublisher",
  deploymentId: "dpl_Test123",
  gitSha: "b".repeat(40),
};
const env = {
  HELIX_NATIVE_WELCOME_DB_HOST: host,
  HELIX_NATIVE_WELCOME_DB_PASSWORD: "fixture-password",
  HELIX_NATIVE_WELCOME_DB_CA: rootCertificates[0],
  HELIX_NATIVE_WELCOME_PROJECT_ID: identity.projectId,
  VERCEL_PROJECT_ID: identity.projectId,
  VERCEL_DEPLOYMENT_ID: identity.deploymentId,
  VERCEL_GIT_COMMIT_SHA: identity.gitSha,
  HELIX_NATIVE_WELCOME_CONTRACT_SHA256: identity.contractHash,
};
const row = {
  intent_id: "11111111-1111-4111-8111-111111111111",
  attempt_id: "22222222-2222-4222-8222-222222222222",
  recipient: "synthetic@example.invalid",
  reserved_at: new Date("2026-11-21T01:02:03.004Z"),
};
const session = { role, login: role, database: "postgres" };
function initialIdentity(value: typeof session = session) {
  pg.client.query.mockResolvedValueOnce({ rows: [value] });
}
beforeEach(() => {
  vi.clearAllMocks();
  pg.client.query.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("isolated native welcome database", () => {
  it.each([
    [host, role],
    ["aws-0-us-east-1.pooler.supabase.com", `${role}.${projectRef}`],
  ])(
    "pins TLS, database and worker identity on %s before its two fixed autocommit calls",
    async (dbHost, user) => {
      vi.stubEnv("PGHOST", "untrusted.invalid");
      vi.stubEnv("PGSSLMODE", "disable");
      vi.stubEnv("PGPASSWORD", "untrusted-password");
      initialIdentity();
      pg.client.query.mockResolvedValueOnce({ rows: [row] }).mockResolvedValueOnce({ rows: [{ recorded: true }] });
      await withNativeWelcomeDatabase({ ...env, HELIX_NATIVE_WELCOME_DB_HOST: dbHost }, async (db) => {
        expect(Object.keys(db).sort()).toEqual(["finish", "reserve"]);
        const reservation = await db.reserve(identity);
        expect(reservation).toEqual({
          intentId: row.intent_id,
          attemptId: row.attempt_id,
          recipient: row.recipient,
          reservedAt: row.reserved_at.toISOString(),
        });
        expect(await db.finish({ intentId: row.intent_id, attemptId: row.attempt_id }, "submitted")).toBe(true);
      });
      expect(pg.Client).toHaveBeenCalledWith(
        expect.objectContaining({
          host: dbHost,
          port: 5432,
          user,
          database: "postgres",
          password: env.HELIX_NATIVE_WELCOME_DB_PASSWORD,
          ssl: expect.objectContaining({ ca: env.HELIX_NATIVE_WELCOME_DB_CA, rejectUnauthorized: true }),
          connectionTimeoutMillis: expect.any(Number),
          query_timeout: expect.any(Number),
          statement_timeout: expect.any(Number),
        }),
      );
      const queries = pg.client.query.mock.calls;
      expect(queries).toHaveLength(3);
      expect(queries[0][0]).toMatch(/current_user.*session_user.*current_database/i);
      expect(queries[1]).toEqual([
        expect.stringContaining("helix_welcome_worker.reserve($1::text,$2::text,$3::text,$4::text)"),
        [identity.contractHash, identity.projectId, identity.deploymentId, identity.gitSha],
      ]);
      expect(queries[2]).toEqual([
        expect.stringContaining("helix_welcome_worker.finish($1::uuid,$2::uuid,$3::text)"),
        [row.intent_id, row.attempt_id, "submitted"],
      ]);
      expect(pg.client.end).toHaveBeenCalledTimes(1);
    },
  );

  it("distinguishes an empty queue and an unrecorded completion", async () => {
    initialIdentity();
    pg.client.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ recorded: false }] });
    await withNativeWelcomeDatabase(env, async (db) => {
      expect(await db.reserve(identity)).toBeNull();
      expect(await db.finish({ intentId: row.intent_id, attemptId: row.attempt_id }, "unknown")).toBe(false);
    });
  });

  it.each([
    ["HELIX_NATIVE_WELCOME_DB_HOST", "postgresql://owner@untrusted.invalid"],
    ["HELIX_NATIVE_WELCOME_DB_HOST", "db.zyfkunnpnlmgvrojmrbg.supabase.co"],
    ["HELIX_NATIVE_WELCOME_DB_HOST", "aws-0-us-east-1.pooler.supabase.com.invalid"],
    ["HELIX_NATIVE_WELCOME_DB_PASSWORD", ""],
    ["HELIX_NATIVE_WELCOME_DB_CA", ""],
  ])("rejects an invalid dedicated %s without using an ambient connection", async (name, value) => {
    await expect(
      withNativeWelcomeDatabase(
        { ...env, [name]: value, DATABASE_URL: "postgresql://owner@untrusted.invalid" },
        vi.fn(),
      ),
    ).rejects.toThrow();
    expect(pg.Client).not.toHaveBeenCalled();
  });

  it.each(["PGOPTIONS", "PGREPLICATION"])("refuses an ambient startup override in %s", async (name) => {
    vi.stubEnv(name, "untrusted");
    await expect(withNativeWelcomeDatabase(env, vi.fn())).rejects.toThrow();
    expect(pg.Client).not.toHaveBeenCalled();
  });

  it.each([
    { ...session, role: "postgres" },
    { ...session, login: "postgres" },
    { ...session, database: "other" },
  ])("refuses unexpected authenticated session identity before calling the worker", async (value) => {
    initialIdentity(value);
    const run = vi.fn();
    await expect(withNativeWelcomeDatabase(env, run)).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
    expect(pg.client.end).toHaveBeenCalledTimes(1);
  });

  it.each([
    [row, row],
    [{ ...row, recipient: "first@example.invalid,second@example.invalid" }],
    [{ ...row, recipient: "First@example.invalid" }],
    [{ ...row, reserved_at: new Date(NaN) }],
    [{ ...row, intent_id: "invalid" }],
    [{ ...row, attempt_id: "" }],
  ])("rejects an ambiguous or malformed reservation", async (...rows) => {
    initialIdentity();
    pg.client.query.mockResolvedValueOnce({ rows });
    await expect(withNativeWelcomeDatabase(env, (db) => db.reserve(identity))).rejects.toThrow();
    expect(pg.client.end).toHaveBeenCalledTimes(1);
  });

  it("validates the release and the completion before binding any mutation parameters", async () => {
    initialIdentity();
    await withNativeWelcomeDatabase(env, async (db) => {
      for (const override of [
        { contractHash: "x" },
        { projectId: "prj_Other" },
        { deploymentId: "https://other.invalid" },
        { gitSha: "?" },
      ]) {
        await expect(db.reserve({ ...identity, ...override })).rejects.toThrow();
      }
      await expect(db.finish({ intentId: "bad", attemptId: row.attempt_id }, "submitted")).rejects.toThrow();
      // @ts-expect-error a runtime caller can still supply an unknown outcome
      await expect(db.finish({ intentId: row.intent_id, attemptId: row.attempt_id }, "failed")).rejects.toThrow();
    });
    expect(pg.client.query).toHaveBeenCalledTimes(1);
  });

  it("rejects the storefront as a publisher even when both environment IDs agree", async () => {
    const storefront = "prj_N9nyPL9SixJHOROIovS8PDQ9aKny";
    initialIdentity();
    await expect(
      withNativeWelcomeDatabase(
        { ...env, VERCEL_PROJECT_ID: storefront, HELIX_NATIVE_WELCOME_PROJECT_ID: storefront },
        (db) => db.reserve({ ...identity, projectId: storefront }),
      ),
    ).rejects.toThrow();
    expect(pg.client.query.mock.calls.some(([sql]) => String(sql).includes(".reserve("))).toBe(false);
  });

  it("redacts driver errors inside the callback and closes on both read and cleanup failures", async () => {
    const secret = "private-recipient-and-password";
    initialIdentity();
    pg.client.query.mockRejectedValueOnce(new Error(secret));
    pg.client.end.mockRejectedValueOnce(new Error(secret));
    await expect(
      withNativeWelcomeDatabase(env, async (db) => {
        await expect(db.reserve(identity)).rejects.toThrow(/^Native welcome database unavailable\.$/);
      }),
    ).rejects.toThrow(/^Native welcome database unavailable\.$/);
    expect(pg.client.end).toHaveBeenCalledTimes(1);
  });

  it("holds on idle disconnect, never interpreting an unobserved completion as a database success", async () => {
    initialIdentity();
    await withNativeWelcomeDatabase(env, async (db) => {
      const onError = pg.client.on.mock.calls[0][1];
      onError(new Error("sensitive upstream message"));
      await expect(db.finish({ intentId: row.intent_id, attemptId: row.attempt_id }, "unknown")).rejects.toThrow(
        /^Native welcome database unavailable\.$/,
      );
    });
    expect(pg.client.query).toHaveBeenCalledTimes(1);
  });

  it("rejects a missing completion result after the database may have accepted its update", async () => {
    initialIdentity();
    pg.client.query.mockResolvedValueOnce({ rows: [] });
    await expect(
      withNativeWelcomeDatabase(env, (db) =>
        db.finish({ intentId: row.intent_id, attemptId: row.attempt_id }, "submitted"),
      ),
    ).rejects.toThrow();
    expect(pg.client.query).toHaveBeenCalledTimes(2);
  });
});
