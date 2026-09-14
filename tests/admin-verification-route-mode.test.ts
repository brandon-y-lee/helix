import { describe, expect, it } from "vitest";
import { applicationRouteMode } from "@/lib/admin/routes";

describe("isolated Admin presentation route modes", () => {
  it.each([
    "/helix-verification/admin",
    "/helix-verification/admin/catalog",
    "/helix-verification/admin/editor",
    "/helix-verification/admin/states",
  ])("uses the Admin shell for the exact fixture %s", (pathname) => {
    expect(applicationRouteMode(pathname)).toBe("standard-admin");
  });
  it("uses commerce-disabled preview chrome only for the exact Preview fixture", () => {
    expect(applicationRouteMode("/helix-verification/admin/preview")).toBe("catalog-preview");
    expect(applicationRouteMode("/helix-verification/admin/preview/unknown")).toBe("storefront");
    expect(applicationRouteMode("/helix-verification/customer")).toBe("storefront");
    expect(applicationRouteMode("/helix-verification/admin/unknown")).toBe("storefront");
  });
});
