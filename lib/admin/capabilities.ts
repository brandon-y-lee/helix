import "server-only";

import { redirect } from "next/navigation";
import { authRedirectParam } from "@/lib/auth/redirect";
import { getCurrentUser } from "@/lib/auth/session";

export const ADMIN_CAPABILITIES = {
  access: "admin.access",
  catalogRead: "catalog.read",
  catalogEdit: "catalog.edit",
  catalogPublish: "catalog.publish",
  catalogDelivery: "catalog.delivery",
} as const;

export type AdminCapability =
  (typeof ADMIN_CAPABILITIES)[keyof typeof ADMIN_CAPABILITIES];

export type AdminPrincipal = {
  id: string;
  email: string | null;
};

export type AdminCapabilityAdapter = {
  hasCapability(
    principal: AdminPrincipal,
    capability: AdminCapability,
  ): Promise<boolean>;
};

export type AdminCapabilityDecision =
  | { status: "allowed"; principal: AdminPrincipal }
  | { status: "unauthenticated" }
  | { status: "forbidden"; principal: AdminPrincipal }
  | { status: "unavailable"; principal: AdminPrincipal | null };

type AdminCapabilityDependencies = {
  getPrincipal: () => Promise<AdminPrincipal | null>;
  adapter: AdminCapabilityAdapter;
};

async function getCurrentAdminPrincipal(): Promise<AdminPrincipal | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  return {
    id: user.id,
    email: user.email ?? null,
  };
}

/**
 * Integration boundary for the backend-owned role store. It intentionally
 * denies access until a durable server-side adapter replaces this export.
 */
export const adminCapabilityAdapter: AdminCapabilityAdapter = {
  async hasCapability() {
    throw new Error("Admin capability storage is not available.");
  },
};

const defaultDependencies: AdminCapabilityDependencies = {
  getPrincipal: getCurrentAdminPrincipal,
  adapter: adminCapabilityAdapter,
};

export async function checkAdminCapability(
  capability: AdminCapability,
  dependencies: Partial<AdminCapabilityDependencies> = {},
): Promise<AdminCapabilityDecision> {
  const resolved = { ...defaultDependencies, ...dependencies };
  let principal: AdminPrincipal | null;

  try {
    principal = await resolved.getPrincipal();
  } catch {
    return { status: "unavailable", principal: null };
  }

  if (!principal) return { status: "unauthenticated" };

  try {
    const allowed = await resolved.adapter.hasCapability(
      principal,
      capability,
    );
    return allowed
      ? { status: "allowed", principal }
      : { status: "forbidden", principal };
  } catch {
    return { status: "unavailable", principal };
  }
}

export async function requireAdminCapability(
  capability: AdminCapability,
  options: {
    returnTo?: string;
    dependencies?: Partial<AdminCapabilityDependencies>;
  } = {},
): Promise<Exclude<AdminCapabilityDecision, { status: "unauthenticated" }>> {
  const decision = await checkAdminCapability(
    capability,
    options.dependencies,
  );

  if (decision.status === "unauthenticated") {
    redirect(authRedirectParam(options.returnTo ?? "/admin"));
  }

  return decision;
}
