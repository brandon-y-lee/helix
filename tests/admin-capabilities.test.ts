import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((location: string) => {
    throw new Error(`NEXT_REDIRECT:${location}`);
  }),
}));

import { redirect } from "next/navigation";
import {
  ADMIN_CAPABILITIES,
  checkAdminCapability,
  requireAdminCapability,
  type AdminCapabilityAdapter,
  type AdminPrincipal,
} from "@/lib/admin/capabilities";

const principal: AdminPrincipal = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "operator@example.com",
};

function adapter(result: boolean): AdminCapabilityAdapter {
  return {
    hasCapability: vi.fn(async () => result),
  };
}

beforeEach(() => {
  vi.mocked(redirect).mockClear();
});

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

  it("allows a verified principal only when the server adapter grants access", async () => {
    const capabilityAdapter = adapter(true);
    const result = await checkAdminCapability(ADMIN_CAPABILITIES.access, {
      getPrincipal: vi.fn(async () => principal),
      adapter: capabilityAdapter,
    });

    expect(result).toEqual({ status: "allowed", principal });
    expect(capabilityAdapter.hasCapability).toHaveBeenCalledWith(
      principal,
      "admin.access",
    );
  });

  it("returns forbidden for an authenticated principal without permission", async () => {
    await expect(
      checkAdminCapability(ADMIN_CAPABILITIES.access, {
        getPrincipal: vi.fn(async () => principal),
        adapter: adapter(false),
      }),
    ).resolves.toEqual({ status: "forbidden", principal });
  });

  it("fails closed when identity or authorization cannot be determined", async () => {
    await expect(
      checkAdminCapability(ADMIN_CAPABILITIES.access, {
        getPrincipal: vi.fn(async () => {
          throw new Error("Auth unavailable");
        }),
      }),
    ).resolves.toEqual({ status: "unavailable", principal: null });

    await expect(
      checkAdminCapability(ADMIN_CAPABILITIES.access, {
        getPrincipal: vi.fn(async () => principal),
        adapter: {
          async hasCapability() {
            throw new Error("Role store unavailable");
          },
        },
      }),
    ).resolves.toEqual({ status: "unavailable", principal });
  });

  it("redirects unauthenticated requests through the safe sign-in flow", async () => {
    await expect(
      requireAdminCapability(ADMIN_CAPABILITIES.access, {
        returnTo: "/admin",
        dependencies: {
          getPrincipal: vi.fn(async () => null),
        },
      }),
    ).rejects.toThrow(
      "NEXT_REDIRECT:/account/sign-in?next=%2Fadmin",
    );

    expect(redirect).toHaveBeenCalledWith(
      "/account/sign-in?next=%2Fadmin",
    );
  });
});
