// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { handleWake } from "../workers/production-welcome/publisher.mjs";
import { submitReservedEvent } from "../workers/production-welcome/resend.mjs";
import { POST } from "../workers/production-welcome/api/wake.js";

const origin = "https://publisher.vercel.app";
const event = "helix.welcome.confirmed.v1";
const reservation = {
  intentId: "5802a8f3-844d-4f36-bf68-4339bd05e43c",
  attemptId: "64f93a67-9d63-4b83-856c-1376e9ca56fc",
  recipient: "welcome-proof@example.invalid",
  get reservedAt() { return new Date().toISOString(); },
};
const env = {
  VERCEL: "1",
  VERCEL_ENV: "production",
  VERCEL_TARGET_ENV: "production",
  VERCEL_PROJECT_ID: "prj_Publisher",
  VERCEL_DEPLOYMENT_ID: "dpl_Publisher1",
  VERCEL_PROJECT_PRODUCTION_URL: "publisher.vercel.app",
  VERCEL_URL: "publisher-build.vercel.app",
  VERCEL_GIT_PROVIDER: "github",
  VERCEL_GIT_REPO_ID: "123456",
  VERCEL_GIT_COMMIT_REF: "main",
  VERCEL_GIT_COMMIT_SHA: "a".repeat(40),
  HELIX_NATIVE_WELCOME_ENABLED: "true",
  HELIX_NATIVE_WELCOME_ORIGIN: origin,
  HELIX_NATIVE_WELCOME_PROJECT_ID: "prj_Publisher",
  HELIX_NATIVE_WELCOME_GIT_REPO_ID: "123456",
  HELIX_NATIVE_WELCOME_CONTRACT_SHA256: "b".repeat(64),
  HELIX_NATIVE_WELCOME_WAKE_TOKEN: "wake".repeat(12),
  HELIX_NATIVE_WELCOME_RESEND_KEY: "re_" + "a".repeat(35),
  HELIX_NATIVE_WELCOME_DB_PASSWORD: "database".repeat(7),
};
function wake(url = origin + "/api/wake", init: RequestInit = {}) {
  return new Request(url, {
    method: "POST",
    headers: { authorization: "Bearer " + env.HELIX_NATIVE_WELCOME_WAKE_TOKEN },
    ...init,
  });
}
function fixture() {
  const reserve = vi.fn(async () => reservation as typeof reservation | null);
  const finish = vi.fn(async () => true);
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({ object: "event", event }, { status: 202 }),
  );
  const db = { reserve, finish };
  const withDatabase = vi.fn(async (_env: object, run: (database: typeof db) => Promise<Response>) => run(db));
  const invoke = (request = wake(), settings: Partial<typeof env> = {}) =>
    handleWake(request, { ...env, ...settings }, { withDatabase, fetchImpl: fetch });
  return { reserve, finish, fetch, withDatabase, invoke };
}
describe("isolated native welcome publisher", () => {
  it("submits only the DB-reserved event after an autocommitted reservation and records only submission", async () => {
    const f = fixture();
    const response = await f.invoke();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "submitted" });
    expect(f.reserve).toHaveBeenCalledExactlyOnceWith({
      contractHash: env.HELIX_NATIVE_WELCOME_CONTRACT_SHA256,
      projectId: env.VERCEL_PROJECT_ID,
      deploymentId: env.VERCEL_DEPLOYMENT_ID,
      gitSha: env.VERCEL_GIT_COMMIT_SHA,
    });
    expect(f.reserve.mock.invocationCallOrder[0]).toBeLessThan(f.fetch.mock.invocationCallOrder[0]);
    expect(f.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = f.fetch.mock.calls[0];
    const init = options!;
    expect(url).toBe("https://api.resend.com/events/send");
    expect(init).toMatchObject({ method: "POST", redirect: "error", cache: "no-store" });
    const headers = new Headers(init.headers);
    expect(Object.fromEntries(headers)).toEqual({
      authorization: "Bearer " + env.HELIX_NATIVE_WELCOME_RESEND_KEY,
      "content-type": "application/json",
    });
    expect(JSON.parse(init.body as string)).toEqual({
      event,
      email: reservation.recipient,
      payload: { attempt_id: reservation.attemptId },
    });
    expect(f.finish).toHaveBeenCalledExactlyOnceWith(
      { intentId: reservation.intentId, attemptId: reservation.attemptId },
      "submitted",
    );
  });

  it("rejects caller inputs, aliases and wrong credentials before reaching storage", async () => {
    const f = fixture();
    const requests = [
      wake(origin + "/api/wake?email=person%40example.invalid"),
      wake(origin + "/api/other"),
      wake("https://publisher-build.vercel.app/api/wake"),
      wake(undefined, { method: "GET" }),
      wake(undefined, { headers: { authorization: "Bearer bad" } }),
      wake(undefined, {
        body: JSON.stringify({
          recipient: reservation.recipient,
          event: "other",
          url: "https://example.invalid",
          payload: {},
        }),
      }),
      wake(undefined, { body: new Uint8Array([1]) }),
      wake(undefined, {
        headers: { authorization: "Bearer " + env.HELIX_NATIVE_WELCOME_WAKE_TOKEN, "content-length": "50" },
      }),
    ];
    for (const req of requests) expect((await f.invoke(req)).status).toBeGreaterThanOrEqual(400);
    expect(f.withDatabase).not.toHaveBeenCalled();
    expect(f.fetch).not.toHaveBeenCalled();
  });

  it("requires isolated production identity, exact contract and independently scoped secrets before reservation", async () => {
    const f = fixture();
    for (const settings of [
      { HELIX_NATIVE_WELCOME_ENABLED: "false" },
      { VERCEL_ENV: "preview" },
      { VERCEL_TARGET_ENV: "preview" },
      { VERCEL_GIT_COMMIT_REF: "dev" },
      { VERCEL_GIT_REPO_ID: "999" },
      { VERCEL_PROJECT_ID: "prj_Unapproved" },
      { VERCEL_GIT_COMMIT_SHA: "bad" },
      { VERCEL_DEPLOYMENT_ID: "unknown" },
      { VERCEL_GIT_REPO_ID: "1280166759", HELIX_NATIVE_WELCOME_GIT_REPO_ID: "1280166759" },
      {
        VERCEL_PROJECT_ID: "prj_N9nyPL9SixJHOROIovS8PDQ9aKny",
        HELIX_NATIVE_WELCOME_PROJECT_ID: "prj_N9nyPL9SixJHOROIovS8PDQ9aKny",
      },
      { HELIX_NATIVE_WELCOME_CONTRACT_SHA256: "BAD" },
      { HELIX_NATIVE_WELCOME_RESEND_KEY: "" },
      { HELIX_NATIVE_WELCOME_DB_PASSWORD: env.HELIX_NATIVE_WELCOME_WAKE_TOKEN },
    ])
      expect((await f.invoke(wake(), settings)).status).toBeGreaterThanOrEqual(400);
    expect(f.withDatabase).not.toHaveBeenCalled();
    expect(f.fetch).not.toHaveBeenCalled();
  });

  it("performs no I/O with Resend after an empty or unconfirmed database reservation", async () => {
    const f = fixture();
    f.reserve.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("private lease details"));
    expect(await (await f.invoke()).json()).toEqual({ status: "idle" });
    const second = await f.invoke();
    expect(second.status).toBe(503);
    expect(await second.text()).not.toContain("private");
    expect(f.fetch).not.toHaveBeenCalled();
    expect(f.finish).not.toHaveBeenCalled();
  });

  it("does not republish after lost acknowledgement or unsuccessful finish", async () => {
    const f = fixture();
    f.reserve.mockResolvedValueOnce(reservation).mockResolvedValue(null);
    f.finish.mockRejectedValueOnce(new Error("private commit details"));
    expect((await f.invoke()).status).toBe(503);
    expect(await (await f.invoke()).json()).toEqual({ status: "idle" });
    expect(f.fetch).toHaveBeenCalledTimes(1);
    expect(f.finish).toHaveBeenCalledTimes(1);
  });

  it("holds an ambiguous provider result without leaking details or retrying", async () => {
    const f = fixture();
    f.fetch.mockRejectedValueOnce(new Error("private provider details"));
    const response = await f.invoke();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "held" });
    expect(f.fetch).toHaveBeenCalledTimes(1);
    expect(f.finish).toHaveBeenCalledExactlyOnceWith(
      { intentId: reservation.intentId, attemptId: reservation.attemptId },
      "unknown",
    );
  });

  it.each([
    ["2026-11-21T09:30:30Z", "2026-11-21T09:30:00Z"],
    ["2026-11-22T00:00:01Z", "2026-11-21T23:59:59Z"],
  ])("holds a delayed or prior UTC-day reservation without provider I/O", async (now, reservedAt) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date(now));
      const f = fixture();
      f.reserve.mockResolvedValueOnce({ ...reservation, reservedAt }).mockResolvedValue(null);
      expect(await (await f.invoke()).json()).toEqual({ status: "held" });
      expect(f.finish).toHaveBeenCalledExactlyOnceWith(
        { intentId: reservation.intentId, attemptId: reservation.attemptId }, "unknown",
      );
      expect(await (await f.invoke()).json()).toEqual({ status: "idle" });
      expect(f.fetch).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("fixed Resend event request", () => {
  it.each([
    new Response(null, { status: 307, headers: { location: "https://other.example" } }),
    new Response(null, { status: 429 }),
    new Response(null, { status: 500 }),
    Response.json({ object: "event", event }, { status: 200 }),
    Response.json({ object: "event", event: "wrong" }, { status: 202 }),
    Response.json({ object: "event", event, extra: "sensitive" }, { status: 202 }),
    new Response("x".repeat(5000), { status: 202 }),
  ])("classifies an unsupported provider response as unknown with one request", async (response) => {
    const fetch = vi.fn(async () => response);
    expect(await submitReservedEvent(reservation, env.HELIX_NATIVE_WELCOME_RESEND_KEY, fetch)).toBe("unknown");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([
    { recipient: "a@example.invalid,b@example.invalid" },
    { recipient: "Mixed@Example.invalid" },
    { recipient: "line\nbreak@example.invalid" },
    { attemptId: "not-a-uuid" },
    { attemptId: [reservation.attemptId] },
    { recipient: "invalid..local@example.invalid" },
  ])("keeps invalid stored input from receiving a credential", async (fields) => {
    const fetch = vi.fn();
    expect(
      await submitReservedEvent({ ...reservation, ...fields }, env.HELIX_NATIVE_WELCOME_RESEND_KEY, fetch),
    ).toBe("unknown");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("aborts a hung provider request at the deadline and allows no retry", async () => {
    vi.useFakeTimers();
    try {
      const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise<Response>(() => {}));
      const outcome = submitReservedEvent(reservation, env.HELIX_NATIVE_WELCOME_RESEND_KEY, fetch);
      await vi.advanceTimersByTimeAsync(8100);
      expect(await outcome).toBe("unknown");
      expect(fetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

it("keeps the actual standalone deployment entry dark on preview even with worker settings present", async () => {
  const outbound = vi.fn();
  vi.stubGlobal("fetch", outbound);
  try {
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    vi.stubEnv("VERCEL_ENV", "preview");
    expect((await POST(wake())).status).toBe(503);
    expect(outbound).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
});
