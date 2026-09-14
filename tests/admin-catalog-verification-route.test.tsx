import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
import CatalogVerificationPage from "@/app/helix-verification/admin/catalog/page";
import EditorVerificationPage from "@/app/helix-verification/admin/editor/page";
beforeEach(() => { vi.stubEnv("VERCEL", ""); vi.stubEnv("HELIX_VERIFICATION_ADAPTER", "1"); });
afterEach(() => vi.unstubAllEnvs());
describe.each([CatalogVerificationPage, EditorVerificationPage])("isolated catalog route", (Page) => {
  it.each([undefined, "", "0", "true"])("fails closed without exact adapter flag %s", async (flag) => {
    vi.stubEnv("HELIX_VERIFICATION_ADAPTER", flag);
    await expect(Page({})).rejects.toThrow("NOT_FOUND");
  });
  it("fails closed on Vercel", async () => {
    vi.stubEnv("VERCEL", "1");
    await expect(Page({})).rejects.toThrow("NOT_FOUND");
  });
  it("rejects unknown scenario input", async () => {
    await expect(Page({ searchParams: Promise.resolve({ state: "unknown" }) })).rejects.toThrow("NOT_FOUND");
  });
  it("renders the local presentation only after the gate", async () => {
    await expect(Page({})).resolves.toBeTruthy();
  });
});
