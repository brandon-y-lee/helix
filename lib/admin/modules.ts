import type { AdminCapability } from "@/lib/admin/capabilities";
import { ADMIN_CAPABILITIES } from "@/lib/admin/capabilities";

type AdminModuleStatus = "active" | "unavailable";

export type AdminModule = {
  id: string;
  label: string;
  route: `/admin/${string}`;
  description: string;
  requiredCapability: AdminCapability;
  navigationOrder: number;
  status: AdminModuleStatus;
};

const ADMIN_MODULE_REGISTRY: readonly AdminModule[] = [
  {
    id: "catalog",
    label: "Catalog Editor",
    route: "/admin/catalog",
    description:
      "Maintain catalog merchandising, editorial content, and publishing state.",
    requiredCapability: ADMIN_CAPABILITIES.catalogRead,
    navigationOrder: 10,
    status: "active",
  },
  {
    id: "payments",
    label: "Payments",
    route: "/admin/payments",
    description: "Review sandbox payment recovery and replay unresolved events.",
    requiredCapability: ADMIN_CAPABILITIES.paymentsManage,
    navigationOrder: 20,
    status: "active",
  },
];

export function sortAdminModules(
  modules: readonly AdminModule[],
): AdminModule[] {
  return [...modules].sort(
    (left, right) =>
      left.navigationOrder - right.navigationOrder ||
      left.id.localeCompare(right.id),
  );
}

export function getAdminModules(
  capabilities: readonly AdminCapability[],
): AdminModule[] {
  return sortAdminModules(ADMIN_MODULE_REGISTRY).filter((module) =>
    capabilities.includes(module.requiredCapability),
  );
}
