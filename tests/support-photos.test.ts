// @vitest-environment node
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { decodeSupportPhoto, PhotoError, readPhotoBytes, validatePhotoContainer } from "@/lib/support/photos";

describe("private support photo decoding", () => {
  it("fully decodes permitted formats and strips private metadata", async () => {
    for (const format of ["jpeg", "png", "webp"] as const) {
      const input = await sharp({ create: { width: 24, height: 16, channels: 3, background: "red" } })
        .withExif({ IFD0: { Copyright: "private customer metadata" } }).toFormat(format).toBuffer();
      const clean = await decodeSupportPhoto(input, { deadline: Date.now() + 10_000 });
      const metadata = await sharp(clean.bytes).metadata();
      expect(clean).toMatchObject({ width: 24, height: 16, mediaType: "image/webp" });
      expect(metadata.format).toBe("webp");
      expect(metadata.exif).toBeUndefined();
      expect(metadata.icc).toBeUndefined();
      expect(clean.bytes.includes(Buffer.from("private customer metadata"))).toBe(false);
    }
  });
  it("rejects active, unsupported, truncated and appended payloads", async () => {
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "blue" } }).png().toBuffer();
    for (const input of [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), Buffer.from("GIF89a"),
      png.subarray(0, -8), Buffer.concat([png, Buffer.from("<script>bad()</script>")])]) {
      await expect(decodeSupportPhoto(input, { deadline: Date.now() + 10_000 })).rejects.toBeInstanceOf(PhotoError);
    }
  });
  it("rejects animated WebP and PNG containers before decoder admission", async () => {
    const header = Buffer.from("524946461600000057454250565038580a00000002000000000000000000", "hex");
    expect(() => validatePhotoContainer(header)).toThrow(PhotoError);
    const png = await sharp({ create: { width: 1, height: 1, channels: 3, background: "blue" } }).png().toBuffer();
    const chunk = Buffer.concat([Buffer.from([0, 0, 0, 0]), Buffer.from("acTL"), Buffer.alloc(4)]);
    expect(() => validatePhotoContainer(Buffer.concat([png.subarray(0, 33), chunk, png.subarray(33)]))).toThrow(PhotoError);
  });
  it("rejects corrupt pixel data even when the container is structurally valid", async () => {
    const input = await sharp({ create: { width: 8, height: 8, channels: 3, background: "blue" } }).png().toBuffer();
    const chunk = input.indexOf(Buffer.from("IDAT"));
    input[chunk + 5] ^= 0xff;
    expect(validatePhotoContainer(input)).toBe("png");
    await expect(decodeSupportPhoto(input, { deadline: Date.now() + 10_000 })).rejects.toMatchObject({ code: "invalid_image" });
  });
  it("rejects oversized pixel dimensions and expired or canceled execution", async () => {
    const input = await sharp({ create: { width: 6000, height: 5000, channels: 3, background: "blue" } }).png().toBuffer();
    await expect(decodeSupportPhoto(input, { deadline: Date.now() + 10_000 })).rejects.toMatchObject({ code: "invalid_image" });
    await expect(decodeSupportPhoto(input, { deadline: Date.now() - 1 })).rejects.toMatchObject({ code: "processing_timeout" });
    await expect(decodeSupportPhoto(input, { deadline: Date.now() + 1000, signal: AbortSignal.abort() })).rejects.toMatchObject({ code: "processing_timeout" });
  });
  it("terminates a real decoder child at its wall deadline and frees the next admission", async () => {
    const input = await sharp({ create: { width: 8, height: 8, channels: 3, background: "blue" } }).png().toBuffer();
    const start = Date.now();
    await expect(decodeSupportPhoto(input, { deadline: start + 2 })).rejects.toMatchObject({ code: "processing_timeout" });
    expect(Date.now() - start).toBeLessThan(3000);
    const clean = await decodeSupportPhoto(input, { deadline: Date.now() + 10_000 });
    expect(clean.width).toBe(8);
  });
});

describe("bounded private photo reads", () => {
  it("bounds actual streamed bytes without trusting Content-Length and cancels overflow", async () => {
    let canceled = false;
    const body = new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(new Uint8Array(8)); }, cancel() { canceled = true; } });
    await expect(readPhotoBytes(new Response(body), 12, AbortSignal.timeout(1000))).rejects.toMatchObject({ code: "too_large" });
    expect(canceled).toBe(true);
  });
  it("cancels a body that stalls when its request deadline ends", async () => {
    let canceled = false;
    const response = new Response(new ReadableStream({ cancel() { canceled = true; } }));
    await expect(readPhotoBytes(response, 12, AbortSignal.timeout(20))).rejects.toMatchObject({ code: "processing_timeout" });
    expect(canceled).toBe(true);
  });
});
