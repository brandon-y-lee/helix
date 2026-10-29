import { afterEach, expect, it, vi } from "vitest";
const missing = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
);
vi.mock("next/navigation", () => ({ notFound: missing }));
import Page from "@/app/helix-verification/privacy/page";
afterEach(() => vi.unstubAllEnvs());
it("requires local verification mode and is unavailable on Vercel", () => {
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("HELIX_VERIFICATION_ADAPTER", "1");
  expect(() => Page()).toThrow("NOT_FOUND");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("HELIX_VERIFICATION_ADAPTER", "");
  expect(() => Page()).toThrow("NOT_FOUND");
  vi.stubEnv("HELIX_VERIFICATION_ADAPTER", "1");
  expect(Page()).toBeTruthy();
});

it("serves local-only substitutes and blocks their routes on Vercel", async () => {
  const { GET, POST } =
    await import("@/app/helix-verification/privacy/mock/[name]/route");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("HELIX_VERIFICATION_ADAPTER", "1");
  const source = await (
    await GET(new Request("http://localhost/"), {
      params: Promise.resolve({ name: "meta.js" }),
    })
  ).text();
  expect(source).not.toMatch(/connect\.facebook|googletagmanager|https:\/\//);
  expect(source).toContain("disablePushState");
  expect(
    (
      await POST(new Request("http://localhost/", { method: "POST" }), {
        params: Promise.resolve({ name: "event" }),
      })
    ).status,
  ).toBe(204);
  vi.stubEnv("VERCEL", "1");
  await expect(
    GET(new Request("http://localhost/"), {
      params: Promise.resolve({ name: "meta.js" }),
    }),
  ).rejects.toThrow("NOT_FOUND");
});
