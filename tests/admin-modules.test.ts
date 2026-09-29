import { describe, expect, it } from "vitest";
import {
  ADMIN_CAPABILITIES,
  capabilitiesForRole,
} from "@/lib/admin/capabilities";
import {
  getAdminModules,
  sortAdminModules,
  type AdminModule,
} from "@/lib/admin/modules";

describe("admin module registry", () => {
  it("orders modules deterministically without exposing mutable registry state", () => {
    const fixtures: AdminModule[] = [
      {
        id: "publish",
        label: "Publish",
        route: "/admin/publish",
        description: "Publish.",
        requiredCapability: ADMIN_CAPABILITIES.catalogPublish,
        navigationOrder: 30,
        status: "active",
      },
      {
        id: "catalog",
        label: "Catalog",
        route: "/admin/catalog",
        description: "Catalog.",
        requiredCapability: ADMIN_CAPABILITIES.catalogRead,
        navigationOrder: 10,
        status: "active",
      },
      {
        id: "delivery",
        label: "Delivery",
        route: "/admin/delivery",
        description: "Delivery.",
        requiredCapability: ADMIN_CAPABILITIES.catalogDelivery,
        navigationOrder: 30,
        status: "active",
      },
    ];
    const first = getAdminModules(capabilitiesForRole("admin"));
    const second = getAdminModules(capabilitiesForRole("admin"));

    expect(sortAdminModules(fixtures).map((module) => module.id)).toEqual([
      "catalog",
      "delivery",
      "publish",
    ]);
    expect(fixtures.map((module) => module.id)).toEqual([
      "publish",
      "catalog",
      "delivery",
    ]);
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
  });

  it("registers the Catalog Editor honestly for its integration route", () => {
    expect(getAdminModules(capabilitiesForRole("admin"))).toContainEqual({
      id: "catalog",
      label: "Catalog Editor",
      route: "/admin/catalog",
      description:
        "Maintain catalog merchandising, editorial content, and publishing state.",
      requiredCapability: ADMIN_CAPABILITIES.catalogRead,
      navigationOrder: 10,
      status: "active",
    });
  });

  it("shows demo orders only to principals with simulation authority", () => {
    expect(
      getAdminModules(capabilitiesForRole("admin")).map((module) => ({
        label: module.label,
        route: module.route,
      })),
    ).toEqual([
      { label: "Catalog Editor", route: "/admin/catalog" },
      { label: "Demo orders", route: "/admin/demo-orders" },
    ]);
    expect(
      getAdminModules(capabilitiesForRole("catalog_publisher")).map(
        (module) => module.route,
      ),
    ).toEqual(["/admin/catalog"]);
    expect(
      getAdminModules([ADMIN_CAPABILITIES.ordersSimulate]).map(
        (module) => module.route,
      ),
    ).toEqual(["/admin/demo-orders"]);
    expect(getAdminModules([ADMIN_CAPABILITIES.access])).toEqual([]);
    expect(getAdminModules([])).toEqual([]);
  });
});
