import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/lib/catalog-cache", () => ({ getCachedProductRoutes: async () => [{ slug: "super-serum" }] }));
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

it.each(["", "https://www.helixskin.us"])("builds robots and sitemap URLs from the selected public origin: %s", async (configured) => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", configured);
  vi.resetModules();
  const origin = configured || "https://helixskin.vercel.app";
  const { default: robots } = await import("@/app/robots");
  const { default: sitemap } = await import("@/app/sitemap");
  expect(robots().sitemap).toBe(`${origin}/sitemap.xml`);
  const urls = (await sitemap()).map((entry) => entry.url);
  expect(urls).toContain(`${origin}/products/super-serum`);
  expect(urls.every((url) => new URL(url).origin === origin)).toBe(true);
});
