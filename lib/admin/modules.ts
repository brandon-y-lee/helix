import type { AdminCapability } from "@/lib/admin/capabilities";
import { ADMIN_CAPABILITIES } from "@/lib/admin/capabilities";

export type AdminModuleStatus = "active" | "unavailable";

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
    status: "unavailable",
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

export function getAdminModules(): AdminModule[] {
  return sortAdminModules(ADMIN_MODULE_REGISTRY);
}
