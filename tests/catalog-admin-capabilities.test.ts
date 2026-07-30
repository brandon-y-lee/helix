import { describe, expect, it } from "vitest";
import {
  capabilitiesForRole,
  requireAdminCapability,
  roleHasCapability,
} from "@/lib/admin/catalog/capabilities";

const identity = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  email: "verified@example.test",
};

describe("catalog admin capabilities", () => {
  it("keeps role mappings centralized and least-privilege", () => {
    expect(capabilitiesForRole("catalog_editor")).toEqual([
      "admin.access",
      "catalog.read",
      "catalog.edit",
    ]);
    expect(roleHasCapability("catalog_editor", "catalog.publish")).toBe(false);
    expect(roleHasCapability("catalog_publisher", "catalog.publish")).toBe(true);
    expect(roleHasCapability("admin", "catalog.delivery")).toBe(true);
  });

  it("rejects missing, inactive, and insufficient memberships", async () => {
    await expect(
      requireAdminCapability("catalog.read", {
        getIdentity: async () => null,
        getMembership: async () => null,
      }),
    ).rejects.toMatchObject({ code: "authentication_required", status: 401 });

    await expect(
      requireAdminCapability("catalog.read", {
        getIdentity: async () => identity,
        getMembership: async () => ({
          user_id: identity.id,
          role: "catalog_editor",
          active: false,
        }),
      }),
    ).rejects.toMatchObject({ code: "capability_required", status: 403 });

    await expect(
      requireAdminCapability("catalog.publish", {
        getIdentity: async () => identity,
        getMembership: async () => ({
          user_id: identity.id,
          role: "catalog_editor",
          active: true,
        }),
      }),
    ).rejects.toMatchObject({ code: "capability_required", status: 403 });
  });

  it("returns verified access only when the role owns the capability", async () => {
    await expect(
      requireAdminCapability("catalog.publish", {
        getIdentity: async () => identity,
        getMembership: async () => ({
          user_id: identity.id,
          role: "catalog_publisher",
          active: true,
        }),
      }),
    ).resolves.toMatchObject({
      userId: identity.id,
      role: "catalog_publisher",
      capabilities: expect.arrayContaining(["catalog.publish"]),
    });
  });
});
