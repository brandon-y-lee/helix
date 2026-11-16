// @vitest-environment node
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

const fake = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: fake.spawn }));
import { decodeSupportPhoto } from "@/lib/support/photos";

describe("decoder process deadline", () => {
  afterEach(() => vi.useRealTimers());
  it("kills native processing and waits for process close before resolving its cancellation", async () => {
    const bytes = await sharp({ create: { width: 1, height: 1, channels: 3, background: "red" } }).png().toBuffer();
    vi.useFakeTimers();
    const process = Object.assign(new EventEmitter(), { stdin: Object.assign(new EventEmitter(), { end: vi.fn() }),
      stdout: new EventEmitter(), kill: vi.fn() });
    fake.spawn.mockReturnValue(process);
    const controller = new AbortController();
    let settled = false;
    const pending = decodeSupportPhoto(bytes, { deadline: Date.now() + 6000, signal: controller.signal }).catch((error: unknown) => { settled = true; return error; });
    await expect(decodeSupportPhoto(bytes, { deadline: Date.now() + 6000 })).rejects.toMatchObject({ code: "processing_busy" });
    controller.abort();
    await Promise.resolve();
    expect(process.kill).toHaveBeenCalledWith("SIGKILL");
    expect(settled).toBe(false);
    process.emit("close", null);
    expect(await pending).toMatchObject({ code: "processing_timeout" });
    const options = fake.spawn.mock.calls.at(-1)?.[2];
    expect(options.env).toEqual({ NODE_ENV: "production", UV_THREADPOOL_SIZE: "1", VIPS_CONCURRENCY: "1" });
  });
  it("enforces its own wall deadline even when callers never cancel", async () => {
    const bytes = await sharp({ create: { width: 1, height: 1, channels: 3, background: "red" } }).png().toBuffer();
    vi.useFakeTimers();
    const process = Object.assign(new EventEmitter(), { stdin: Object.assign(new EventEmitter(), { end: vi.fn() }),
      stdout: new EventEmitter(), kill: vi.fn() });
    fake.spawn.mockReturnValue(process);
    const pending = decodeSupportPhoto(bytes, { deadline: Date.now() + 3000 }).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(3000);
    expect(process.kill).toHaveBeenCalledWith("SIGKILL");
    process.emit("close", null);
    expect(await pending).toMatchObject({ code: "processing_timeout" });
  });
});
