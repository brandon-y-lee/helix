import "server-only";
import { createHash } from "node:crypto";
import {
  ProductionSupportError,
  type ProductionConfig,
  type ProductionEnvironment,
  type StoredContract,
} from "./config";
import { object } from "./request";
import { photoPath } from "./media";
const STORAGE_REQUEST_MS = 5_000;
const UPLOAD_TOKEN_TTL_MS = 2 * 60 * 60 * 1_000;
const MINT_CLOCK_MARGIN_MS = 30_000;
const TYPES = ["image/jpeg", "image/png", "image/webp"];
/** Own storage client, no legacy admin or credential fallback. No delete operation exists. */
export function createProductionPhotoStorage(
  config: ProductionConfig,
  env: ProductionEnvironment,
  contract: StoredContract,
  network: typeof fetch = fetch,
  now = Date.now,
) {
  const bucket = env.HELIX_PRODUCTION_SUPPORT_PHOTO_BUCKET;
  if (
    !bucket ||
    ["helix-support-photos", "helix-catalog"].includes(bucket) ||
    contract.projectRef !== config.projectRef ||
    contract.contractId !== config.contractId ||
    contract.photoBucket !== bucket ||
    !/^[a-z0-9][a-z0-9_-]{2,62}$/.test(bucket)
  )
    throw new ProductionSupportError();
  const base = `${config.projectUrl}/storage/v1`;
  async function request(
    path: string,
    limit: number,
    signal: AbortSignal,
    init: RequestInit = {},
  ): Promise<{ status: number; bytes: Buffer }> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    const pending = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new ProductionSupportError());
      }, STORAGE_REQUEST_MS);
    });
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const res = await Promise.race([
        network(`${base}${path}`, {
          ...init,
          redirect: "error",
          cache: "no-store",
          signal: controller.signal,
          headers: {
            apikey: config.serviceKey,
            authorization: `Bearer ${config.serviceKey}`,
            ...init.headers,
          },
        }),
        pending,
      ]);
      if (!res.body) throw new ProductionSupportError();
      reader = res.body.getReader();
      let length = 0;
      const chunks: Buffer[] = [];
      const declared = res.headers.get("content-length");
      if (
        declared !== null &&
        (!/^\d+$/.test(declared) || Number(declared) > limit)
      )
        throw new ProductionSupportError();
      for (;;) {
        const part = await Promise.race([reader.read(), pending]);
        if (signal.aborted) throw new ProductionSupportError();
        if (part.done) break;
        length += part.value.length;
        if (length > limit) throw new ProductionSupportError();
        chunks.push(Buffer.from(part.value));
      }
      return { status: res.status, bytes: Buffer.concat(chunks, length) };
    } finally {
      if (timer) clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      void reader?.cancel().catch(() => undefined);
      reader?.releaseLock();
    }
  }
  async function json(
    path: string,
    signal: AbortSignal,
    init: RequestInit = {},
  ) {
    const res = await request(path, 16384, signal, init);
    if (res.status < 200 || res.status >= 300)
      throw new ProductionSupportError();
    let value: unknown;
    try {
      value = JSON.parse(res.bytes.toString("utf8"));
    } catch {
      throw new ProductionSupportError();
    }
    if (!object(value)) throw new ProductionSupportError();
    return value;
  }
  async function privateBucket(signal: AbortSignal) {
    const data = await json(`/bucket/${bucket}`, signal);
    if (
      data.id !== bucket ||
      data.public !== false ||
      Number(data.file_size_limit) !== 10485760 ||
      !Array.isArray(data.allowed_mime_types) ||
      data.allowed_mime_types.length !== 3 ||
      TYPES.some((t) => !(data.allowed_mime_types as unknown[]).includes(t))
    )
      throw new ProductionSupportError();
  }
  async function read(
    path: string,
    kind: "raw" | "clean",
    signal: AbortSignal,
  ) {
    photoPath(path, kind);
    await privateBucket(signal);
    const res = await request(
      `/object/authenticated/${bucket}/${path}`,
      kind === "raw" ? 10485760 : 4194304,
      signal,
    );
    if (res.status !== 200 || !res.bytes.length)
      throw new ProductionSupportError();
    return res.bytes;
  }
  return {
    async sign(
      rawPath: string,
      mintDeadlineAt: string,
      tokenExpiresCeilingAt: string,
      signal: AbortSignal,
    ) {
      photoPath(rawPath, "raw");
      const deadline = Date.parse(mintDeadlineAt),
        ceiling = Date.parse(tokenExpiresCeilingAt);
      // Reserve the entire bounded POST duration plus a clock-skew margin BEFORE
      // minting. Bucket verification may consume time, so recheck immediately at
      // the handoff. A timed-out request may still mint remotely: its reservation
      // remains held and no cancellation/absence result authorizes cleanup.
      const assertMintWindow = () => {
        const current = now();
        if (
          !Number.isFinite(deadline) ||
          !Number.isFinite(ceiling) ||
          signal.aborted ||
          deadline < current + STORAGE_REQUEST_MS ||
          ceiling <
            current +
              UPLOAD_TOKEN_TTL_MS +
              STORAGE_REQUEST_MS +
              MINT_CLOCK_MARGIN_MS
        ) {
          throw new ProductionSupportError();
        }
      };
      assertMintWindow();
      await privateBucket(signal);
      assertMintWindow();
      const data = await json(
        `/object/upload/sign/${bucket}/${rawPath}`,
        signal,
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-upsert": "false" },
          body: "{}",
        },
      );
      // Do not assume a JWT payload format for the provider's opaque token. An
      // actual provider expiry/clock-bound canary remains an activation condition.
      if (
        now() > deadline ||
        now() + UPLOAD_TOKEN_TTL_MS + MINT_CLOCK_MARGIN_MS > ceiling
      ) {
        throw new ProductionSupportError();
      }
      if (
        typeof data.url !== "string" ||
        !data.url.startsWith("/object/upload/sign/")
      )
        throw new ProductionSupportError();
      const url = new URL(`${base}${data.url}`);
      if (
        url.origin !== config.projectUrl ||
        url.pathname !==
          `/storage/v1/object/upload/sign/${bucket}/${rawPath}` ||
        url.hash ||
        url.username ||
        url.password ||
        url.searchParams.getAll("token").length !== 1 ||
        !url.searchParams.get("token") ||
        [...url.searchParams.keys()].some((k) => k !== "token")
      )
        throw new ProductionSupportError();
      return url.toString();
    },
    readRaw: (path: string, signal: AbortSignal) => read(path, "raw", signal),
    readClean: (path: string, signal: AbortSignal) =>
      read(path, "clean", signal),
    async writeClean(path: string, bytes: Buffer, signal: AbortSignal) {
      photoPath(path, "clean");
      if (!bytes.length || bytes.length > 4194304)
        throw new ProductionSupportError();
      await privateBucket(signal);
      const result = await request(`/object/${bucket}/${path}`, 16384, signal, {
        method: "POST",
        headers: {
          "content-type": "image/webp",
          "x-upsert": "false",
          "cache-control": "max-age=0",
        },
        body: new Uint8Array(bytes),
      });
      if (result.status === 400 || result.status === 409) {
        const prior = await read(path, "clean", signal);
        if (
          createHash("sha256").update(prior).digest("hex") !==
          createHash("sha256").update(bytes).digest("hex")
        )
          throw new ProductionSupportError();
        return;
      }
      if (result.status < 200 || result.status >= 300)
        throw new ProductionSupportError();
    },
  };
}
