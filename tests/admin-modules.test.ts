import { describe, expect, it } from "vitest";
import { ADMIN_CAPABILITIES } from "@/lib/admin/capabilities";
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
    const first = getAdminModules();
    const second = getAdminModules();

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
    expect(getAdminModules()).toContainEqual({
      id: "catalog",
      label: "Catalog Editor",
      route: "/admin/catalog",
      description:
        "Maintain catalog merchandising, editorial content, and publishing state.",
      requiredCapability: ADMIN_CAPABILITIES.catalogRead,
      navigationOrder: 10,
      status: "unavailable",
    });
  });
});
