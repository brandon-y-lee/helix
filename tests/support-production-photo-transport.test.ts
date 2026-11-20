// @vitest-environment node
import { syntheticMainContext } from "./helpers/supabase-target";
import { expect, it, vi } from "vitest";
import { productionConfig } from "@/lib/support/production/config";
import { createProductionPhotoStorage } from "@/lib/support/production/photo-storage";
import { handleProductionPhotos } from "@/lib/support/production/photo-request";
const id = "00000000-0000-4000-8000-000000000001";
const env = {
  ...syntheticMainContext, VERCEL: "1",
  VERCEL_ENV: "production",
  HELIX_PRODUCTION_SUPPORT_ORIGIN: "https://www.helixskin.us",
  HELIX_PRODUCTION_SUPPORT_PROJECT_REF: "erasogmsqpgiirovubjh",
  HELIX_PRODUCTION_SUPPORT_PROJECT_URL:
    "https://erasogmsqpgiirovubjh.supabase.co",
  HELIX_PRODUCTION_SUPPORT_CONTRACT_ID: id,
  HELIX_PRODUCTION_SUPPORT_SERVICE_ROLE_KEY:
    "synthetic-service-credential-32-characters",
  HELIX_PRODUCTION_SUPPORT_ABUSE_SECRET: "synthetic-abuse-secret-32-characters",
  HELIX_PRODUCTION_SUPPORT_PHOTO_BUCKET: "support-production-private",
  HELIX_PRODUCTION_SUPPORT_ADMISSION_ENABLED: "true",
  HELIX_PRODUCTION_SUPPORT_FULL_MEDIA_QUALIFIED: "true",
  HELIX_PRODUCTION_SUPPORT_ISOLATION_QUALIFIED: "true",
  HELIX_PRODUCTION_SUPPORT_OPERATIONS_QUALIFIED: "true",
};
const bucket = {
  id: env.HELIX_PRODUCTION_SUPPORT_PHOTO_BUCKET,
  public: false,
  file_size_limit: 10485760,
  allowed_mime_types: ["image/jpeg", "image/png", "image/webp"],
};
it("requires private bounded bucket, no upsert and exact signed destination", async () => {
  const network = vi
    .fn()
    .mockResolvedValueOnce(Response.json(bucket))
    .mockResolvedValueOnce(
      Response.json({
        url: `/object/upload/sign/${bucket.id}/raw/${id}/${id}?token=synthetic`,
      }),
    );
  const store = createProductionPhotoStorage(
    productionConfig(env),
    env,
    { ...productionConfig(env), photoBucket: bucket.id },
    network,
    () => 0,
  );
  expect(
    await store.sign(
      `raw/${id}/${id}`,
      new Date(60000).toISOString(),
      new Date(7260000).toISOString(),
      AbortSignal.timeout(1000),
    ),
  ).toContain("token=synthetic");
  expect(network.mock.calls[1][1]).toMatchObject({
    redirect: "error",
    headers: { "x-upsert": "false" },
    body: "{}",
  });
  for (const metadata of [
    { ...bucket, public: true },
    { ...bucket, file_size_limit: 20000000 },
  ]) {
    const n = vi.fn().mockResolvedValue(Response.json(metadata));
    const s = createProductionPhotoStorage(
      productionConfig(env),
      env,
      { ...productionConfig(env), photoBucket: bucket.id },
      n,
      () => 0,
    );
    await expect(
      s.sign(
        `raw/${id}/${id}`,
        new Date(60000).toISOString(),
        new Date(7260000).toISOString(),
        AbortSignal.timeout(1000),
      ),
    ).rejects.toThrow();
    expect(n).toHaveBeenCalledTimes(1);
  }
});
it("completion is only queued, credentials are never returned and preview/disabled makes no RPC", async () => {
  const rpc = vi.fn().mockResolvedValue(true);
  const d = {
    env,
    fullMediaImplemented: () => true,
    contract: vi.fn().mockResolvedValue({ ...productionConfig(env) }),
    rpc,
    sign: vi.fn(),
  };
  const req = () =>
    new Request("https://www.helixskin.us/api/support/production/photos", {
      method: "POST",
      headers: {
        origin: "https://www.helixskin.us",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "complete",
        submissionId: id,
        uploadId: id,
        uploadCapability: "a".repeat(64),
      }),
    });
  expect(await (await handleProductionPhotos(req(), d)).json()).toEqual({
    ok: true,
    status: "processing",
  });
  expect(d.sign).not.toHaveBeenCalled();
  for (const changed of [
    { env: { ...env, VERCEL_ENV: "preview" } },
    { fullMediaImplemented: () => false },
  ]) {
    rpc.mockClear();
    expect(
      (await handleProductionPhotos(req(), { ...d, ...changed })).status,
    ).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
  }
});

it("rejects shared or mismatched bucket before network and never accepts a redirected upload target", async () => {
  const network = vi.fn();
  for (const name of [
    "helix-support-photos",
    "helix-catalog",
    "other-production-bucket",
  ]) {
    expect(() =>
      createProductionPhotoStorage(
        productionConfig(env),
        { ...env, HELIX_PRODUCTION_SUPPORT_PHOTO_BUCKET: name },
        { ...productionConfig(env), photoBucket: bucket.id },
        network,
      ),
    ).toThrow();
  }
  expect(network).not.toHaveBeenCalled();
  const n = vi
    .fn()
    .mockResolvedValueOnce(Response.json(bucket))
    .mockResolvedValueOnce(
      Response.json({ url: "https://attacker.invalid/upload?token=secret" }),
    );
  await expect(
    createProductionPhotoStorage(
      productionConfig(env),
      env,
      { ...productionConfig(env), photoBucket: bucket.id },
      n,
      () => 0,
    ).sign(
      `raw/${id}/${id}`,
      new Date(60000).toISOString(),
      new Date(7260000).toISOString(),
      AbortSignal.timeout(1000),
    ),
  ).rejects.toThrow();
});
it("retains immutable clean object on lost write response and rejects a mismatched duplicate", async () => {
  const bytes = Buffer.from("clean");
  const n = vi
    .fn()
    .mockResolvedValueOnce(Response.json(bucket))
    .mockResolvedValueOnce(
      Response.json({ error: "already exists" }, { status: 409 }),
    )
    .mockResolvedValueOnce(Response.json(bucket))
    .mockResolvedValueOnce(new Response(bytes));
  const store = createProductionPhotoStorage(
    productionConfig(env),
    env,
    { ...productionConfig(env), photoBucket: bucket.id },
    n,
  );
  await store.writeClean(
    `clean/${id}/${id}.webp`,
    bytes,
    AbortSignal.timeout(2000),
  );
  expect(n).toHaveBeenCalledTimes(4);
  expect(n.mock.calls.every((c) => c[1]?.method !== "DELETE")).toBe(true);
});
it("bounds stalled body reads and does not await a hostile cancellation promise", async () => {
  vi.useFakeTimers();
  try {
    const cancel = vi.fn(() => new Promise<void>(() => undefined));
    const stream = new ReadableStream<Uint8Array>({
      pull: () => new Promise<void>(() => undefined),
      cancel,
    });
    const network = vi
      .fn()
      .mockResolvedValueOnce(Response.json(bucket))
      .mockResolvedValueOnce(new Response(stream));
    const store = createProductionPhotoStorage(
      productionConfig(env),
      env,
      { ...productionConfig(env), photoBucket: bucket.id },
      network,
    );
    const pending = store.readRaw(
      `raw/${id}/${id}`,
      new AbortController().signal,
    );
    const checked = expect(pending).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(5001);
    await checked;
    expect(cancel).toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});

it("reserves the full mint request deadline and clock margin before starting Storage signing", async () => {
  const ceiling = 7_260_000;
  let clock = 25_001;
  const network = vi.fn().mockResolvedValue(Response.json(bucket));
  const store = createProductionPhotoStorage(
    productionConfig(env),
    env,
    { ...productionConfig(env), photoBucket: bucket.id },
    network,
    () => clock,
  );
  await expect(
    store.sign(
      `raw/${id}/${id}`,
      new Date(60_000).toISOString(),
      new Date(ceiling).toISOString(),
      AbortSignal.timeout(1_000),
    ),
  ).rejects.toThrow();
  expect(network).not.toHaveBeenCalled();
  clock = 0;
  network.mockImplementation(async () => {
    clock = 25_001;
    return Response.json(bucket);
  });
  await expect(
    store.sign(
      `raw/${id}/${id}`,
      new Date(60_000).toISOString(),
      new Date(ceiling).toISOString(),
      AbortSignal.timeout(1_000),
    ),
  ).rejects.toThrow();
  expect(network).toHaveBeenCalledTimes(1);
});
it("keeps a delayed successful mint within the persisted ceiling and refuses a nearly expired mint window", async () => {
  let clock = 0;
  const network = vi.fn().mockImplementation(async (_url, init) => {
    if (init.method !== "POST") {
      clock = 20_000;
      return Response.json(bucket);
    }
    clock += 4_999;
    return Response.json({
      url: `/object/upload/sign/${bucket.id}/raw/${id}/${id}?token=synthetic`,
    });
  });
  const store = createProductionPhotoStorage(
    productionConfig(env),
    env,
    { ...productionConfig(env), photoBucket: bucket.id },
    network,
    () => clock,
  );
  await store.sign(
    `raw/${id}/${id}`,
    new Date(60_000).toISOString(),
    new Date(7_260_000).toISOString(),
    AbortSignal.timeout(1000),
  );
  expect(clock + 7_200_000 + 30_000).toBeLessThanOrEqual(7_260_000);
  network.mockClear();
  clock = 56_000;
  await expect(
    store.sign(
      `raw/${id}/${id}`,
      new Date(60_000).toISOString(),
      new Date(7_400_000).toISOString(),
      AbortSignal.timeout(1000),
    ),
  ).rejects.toThrow();
  expect(network).not.toHaveBeenCalled();
});
