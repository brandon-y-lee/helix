import { describe, expect, it } from "vitest";
import {
  ADMIN_CAPABILITIES,
  checkAdminCapability,
  requireAdminCapability,
} from "@/lib/admin/capabilities";

const identity = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "operator@example.com",
};

function membership(
  role: "admin" | "catalog_publisher" | "catalog_editor",
  active = true,
) {
  return {
    user_id: identity.id,
    role,
    active,
  };
}

describe("admin capability enforcement", () => {
  it("publishes the durable admin capability identifiers", () => {
    expect(Object.values(ADMIN_CAPABILITIES)).toEqual([
      "admin.access",
      "catalog.read",
      "catalog.edit",
      "catalog.publish",
      "catalog.delivery",
    ]);
  });

  it("allows only a verified active membership with the capability", async () => {
    await expect(
      checkAdminCapability(ADMIN_CAPABILITIES.access, {
        getIdentity: async () => identity,
        getMembership: async () => membership("catalog_editor"),
      }),
    ).resolves.toMatchObject({
      status: "allowed",
      principal: identity,
      access: {
        userId: identity.id,
        role: "catalog_editor",
      },
    });
  });

  it("returns forbidden for inactive or insufficient memberships", async () => {
    await expect(
      checkAdminCapability(ADMIN_CAPABILITIES.access, {
        getIdentity: async () => identity,
        getMembership: async () => membership("catalog_editor", false),
      }),
    ).resolves.toEqual({ status: "forbidden", principal: identity });

    await expect(
      checkAdminCapability(ADMIN_CAPABILITIES.catalogPublish, {
        getIdentity: async () => identity,
        getMembership: async () => membership("catalog_editor"),
      }),
    ).resolves.toEqual({ status: "forbidden", principal: identity });
  });

  it("fails closed when identity or membership cannot be determined", async () => {
    await expect(
      checkAdminCapability(ADMIN_CAPABILITIES.access, {
        getIdentity: async () => {
          throw new Error("Auth unavailable");
        },
      }),
    ).resolves.toEqual({ status: "unavailable", principal: null });

    await expect(
      checkAdminCapability(ADMIN_CAPABILITIES.access, {
        getIdentity: async () => identity,
        getMembership: async () => {
          throw new Error("Role store unavailable");
        },
      }),
    ).resolves.toEqual({ status: "unavailable", principal: identity });
  });

  it("throws a typed authentication failure for protected APIs", async () => {
    await expect(
      requireAdminCapability(ADMIN_CAPABILITIES.access, {
        getIdentity: async () => null,
      }),
    ).rejects.toMatchObject({
      code: "authentication_required",
      status: 401,
    });
  });
});
