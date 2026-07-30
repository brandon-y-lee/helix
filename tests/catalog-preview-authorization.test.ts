import { describe, expect, it } from "vitest";
import {
  authorizeCatalogPreview,
  hasCatalogPreviewPermission,
} from "@/lib/catalog-editor/authorization";

describe("catalog preview authorization", () => {
  it("accepts catalog.read only from verified JWT permission claims", () => {
    expect(
      hasCatalogPreviewPermission({
        sub: "admin-id",
        app_metadata: { permissions: ["catalog.read"] },
      }),
    ).toBe(true);
    expect(
      hasCatalogPreviewPermission({
        sub: "admin-id",
        user_metadata: { permissions: ["catalog.read"] },
      }),
    ).toBe(false);
  });

  it("distinguishes anonymous, denied, authorized, and unavailable access", async () => {
    await expect(authorizeCatalogPreview(async () => null)).resolves.toEqual({
      status: "anonymous",
    });
    await expect(
      authorizeCatalogPreview(async () => ({ sub: "staff-id" })),
    ).resolves.toEqual({ status: "denied" });
    await expect(
      authorizeCatalogPreview(async () => ({
        sub: "admin-id",
        permissions: ["catalog.read"],
      })),
    ).resolves.toMatchObject({ status: "authorized" });
    await expect(
      authorizeCatalogPreview(async () => {
        throw new Error("auth unavailable");
      }),
    ).resolves.toEqual({ status: "unavailable" });
  });
});
