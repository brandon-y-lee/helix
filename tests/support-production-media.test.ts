// @vitest-environment node
import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  materializeMedia,
  MEDIA_REQUEST_LIMIT,
  type MediaRecipe,
} from "@/lib/support/production/media";
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const hash = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const recipe = (bytes: Buffer): MediaRecipe => ({
  version: 1,
  inquiryId: uuid(4),
  primaryOutboxId: uuid(1),
  parentMessageId: "<primary@example.invalid>",
  replyTo: "visitor@example.invalid",
  deliveryToken: "a".repeat(64),
  photos: [
    {
      photoId: uuid(3),
      uploadId: uuid(5),
      ordinal: 0,
      path: `clean/${uuid(4)}/${uuid(5)}.webp`,
      hash: hash(bytes),
      bytes: bytes.length,
    },
  ],
});
it("serializes reproducibly, freezes primary threading and ignores no arbitrary recipients", async () => {
  const bytes = Buffer.from("synthetic");
  const read = vi.fn().mockResolvedValue(bytes);
  const a = await materializeMedia(
    recipe(bytes),
    uuid(2),
    uuid(6),
    read,
    AbortSignal.timeout(1000),
  );
  const b = await materializeMedia(
    recipe(bytes),
    uuid(2),
    uuid(6),
    read,
    AbortSignal.timeout(1000),
  );
  expect(a).toEqual(b);
  const p = JSON.parse(a.requestText);
  expect(p.to).toEqual(["support@helixskin.us"]);
  expect(p.subject).toBe(`Helix Website inquiry ${uuid(1)}`);
  expect(p.headers["In-Reply-To"]).toBe("<primary@example.invalid>");
  expect(p.attachments[0].content).toBe(bytes.toString("base64"));
  await expect(
    materializeMedia(
      { ...recipe(bytes), replyTo: "bad\r\nbcc: a@example.invalid" },
      uuid(2),
      uuid(6),
      read,
      AbortSignal.timeout(1000),
    ),
  ).rejects.toThrow();
});
it("blocks object substitution, duplicate photos, path escapes and unknown serializer without sending", async () => {
  const b = Buffer.from("x");
  const r = recipe(b);
  for (const invalid of [
    { ...r, version: 2 },
    { ...r, photos: [...r.photos, ...r.photos] },
    { ...r, photos: [{ ...r.photos[0], path: "https://attacker.invalid/x" }] },
  ])
    await expect(
      materializeMedia(
        invalid,
        uuid(2),
        uuid(6),
        vi.fn().mockResolvedValue(b),
        AbortSignal.timeout(1000),
      ),
    ).rejects.toThrow();
  await expect(
    materializeMedia(
      r,
      uuid(2),
      uuid(6),
      vi.fn().mockResolvedValue(Buffer.from("y")),
      AbortSignal.timeout(1000),
    ),
  ).rejects.toThrow();
});
it("supports five maximum clean files including per-file padding with bounded serialized overhead", async () => {
  const bytes = Buffer.alloc(4 * 1024 * 1024, 1);
  const r = recipe(bytes);
  r.photos = Array.from({ length: 5 }, (_, n) => ({
    ...r.photos[0],
    photoId: uuid(n + 10),
    uploadId: uuid(n + 20),
    ordinal: n,
    path: `clean/${uuid(4)}/${uuid(n + 20)}.webp`,
  }));
  const out = await materializeMedia(
    r,
    uuid(2),
    uuid(6),
    async () => bytes,
    AbortSignal.timeout(5000),
  );
  const p = JSON.parse(out.requestText);
  expect(
    p.attachments.reduce(
      (n: number, a: { content: string }) => n + a.content.length,
      0,
    ),
  ).toBe(27962040);
  expect(Buffer.byteLength(out.requestText)).toBeLessThan(MEDIA_REQUEST_LIMIT);
}, 10000);

import { dispatchProductionOutbox } from "@/lib/support/production/worker";
import { productionConfig } from "@/lib/support/production/config";
const conf = productionConfig({
  VERCEL: "1",
  VERCEL_ENV: "production",
  HELIX_PRODUCTION_SUPPORT_ORIGIN: "https://www.helixskin.us",
  HELIX_PRODUCTION_SUPPORT_PROJECT_REF: "abcdefghijklmnopqrst",
  HELIX_PRODUCTION_SUPPORT_PROJECT_URL:
    "https://abcdefghijklmnopqrst.supabase.co",
  HELIX_PRODUCTION_SUPPORT_CONTRACT_ID: uuid(6),
  HELIX_PRODUCTION_SUPPORT_SERVICE_ROLE_KEY:
    "synthetic-service-credential-32-characters",
  HELIX_PRODUCTION_SUPPORT_ABUSE_SECRET: "synthetic-abuse-secret-32-characters",
  HELIX_PRODUCTION_SUPPORT_WORKER_ENABLED: "true",
  HELIX_PRODUCTION_SUPPORT_FULL_MEDIA_QUALIFIED: "true",
  HELIX_PRODUCTION_SUPPORT_ISOLATION_QUALIFIED: "true",
  HELIX_PRODUCTION_SUPPORT_OPERATIONS_QUALIFIED: "true",
});
it("verifies immutable bytes before recording a provider attempt and never sends substitution", async () => {
  const bytes = Buffer.from("synthetic");
  const r = recipe(bytes);
  const frozen = await materializeMedia(
    r,
    uuid(2),
    uuid(6),
    async () => bytes,
    AbortSignal.timeout(1000),
  );
  const d = {
    contract: vi.fn().mockResolvedValue({ ...conf }),
    claim: vi.fn().mockResolvedValue({
      outboxId: uuid(2),
      leaseId: uuid(7),
      kind: "media",
      recipe: r,
      ...frozen,
    }),
    start: vi.fn().mockResolvedValue({
      outboxId: uuid(2),
      kind: "media",
      recipe: r,
      ...frozen,
      idempotencyKey: `support-media:${uuid(2)}`,
      attemptCount: 1,
      firstAttemptAt: new Date().toISOString(),
    }),
    complete: vi.fn().mockResolvedValue(true),
    send: vi
      .fn()
      .mockResolvedValue({ outcome: "accepted", providerEmailId: uuid(8) }),
    readClean: vi.fn().mockResolvedValue(bytes),
    leaseId: () => uuid(7),
    now: Date.now,
  };
  expect((await dispatchProductionOutbox(conf, d)).accepted).toBe(1);
  expect(d.readClean.mock.invocationCallOrder[0]).toBeLessThan(
    d.start.mock.invocationCallOrder[0],
  );
  expect(d.send.mock.calls[0][0].requestText).toBe(frozen.requestText);
  d.start.mockClear();
  d.send.mockClear();
  d.readClean.mockResolvedValue(Buffer.from("tampered"));
  await expect(dispatchProductionOutbox(conf, d)).rejects.toThrow();
  expect(d.start).not.toHaveBeenCalled();
  expect(d.send).not.toHaveBeenCalled();
});
it("bounds a stalled reconstruction even if the injected reader ignores cancellation", async () => {
  const controller = new AbortController();
  const pending = materializeMedia(
    recipe(Buffer.from("x")),
    uuid(2),
    uuid(6),
    () => new Promise<Buffer>(() => undefined),
    controller.signal,
  );
  controller.abort();
  await expect(pending).rejects.toThrow();
});
it("reconciles confirmed media corruption without starting a provider attempt", async () => {
  const bytes = Buffer.from("original");
  const r = recipe(bytes);
  const frozen = await materializeMedia(
    r,
    uuid(2),
    uuid(6),
    async () => bytes,
    AbortSignal.timeout(1000),
  );
  const d = {
    contract: async () => ({ ...conf }),
    claim: async () => ({
      outboxId: uuid(2),
      leaseId: uuid(7),
      kind: "media",
      recipe: r,
      ...frozen,
    }),
    start: vi.fn(),
    complete: vi.fn(),
    send: vi.fn(),
    readClean: async () => Buffer.from("corrupt"),
    reconcile: vi.fn().mockResolvedValue(true),
    leaseId: () => uuid(7),
    now: Date.now,
  };
  expect(await dispatchProductionOutbox(conf, d)).toEqual({
    claimed: 1,
    accepted: 0,
    unconfirmed: 1,
  });
  expect(d.reconcile).toHaveBeenCalledWith(conf, {
    outboxId: uuid(2),
    leaseId: uuid(7),
  });
  expect(d.start).not.toHaveBeenCalled();
  expect(d.send).not.toHaveBeenCalled();
});
