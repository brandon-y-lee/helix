import type { AdminModule } from "@/lib/admin/modules";

export const verificationAdminModules: readonly AdminModule[] = [
  {
    id: "catalog",
    label: "Catalog Editor",
    route: "/admin/catalog",
    description:
      "Synthetic catalog module for local interface verification.",
    requiredCapability: "catalog.read",
    navigationOrder: 10,
    status: "active",
  },
];
