import { describe, expect, it } from "vitest";
import { ADMIN_CAPABILITIES, capabilitiesForRole, checkAdminCapability } from "@/lib/admin/capabilities";
import { getAdminModules } from "@/lib/admin/modules";

describe("Support authorization boundary", () => {
  it("gives explicit Support access only to admins and filters the shared module registry", () => {
    for (const role of ["catalog_editor", "catalog_publisher"] as const) {
      const capabilities = capabilitiesForRole(role);
      expect(capabilities).not.toContain("support.read");
      expect(capabilities).not.toContain("support.reply");
      expect(getAdminModules(capabilities).map((module) => module.id)).not.toContain("support");
    }
    expect(capabilitiesForRole("admin")).toEqual(expect.arrayContaining(["support.read", "support.reply"]));
    expect(getAdminModules(capabilitiesForRole("admin"))).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "support", route: "/admin/support", requiredCapability: "support.read" }),
    ]));
  });

  it("denies direct Support requests when admin membership has been revoked", async () => {
    const decision = await checkAdminCapability(ADMIN_CAPABILITIES.supportReply, {
      getIdentity: async () => ({ id: "operator-id", email: "synthetic@example.invalid" }),
      getMembership: async () => ({ user_id: "operator-id", role: "admin", active: false }),
    });
    expect(decision.status).toBe("forbidden");
  });
});
