import "server-only";

import { getCurrentIdentity } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CatalogAdminError } from "@/lib/admin/catalog/errors";

export const ADMIN_CAPABILITIES = [
  "admin.access",
  "catalog.read",
  "catalog.edit",
  "catalog.publish",
  "catalog.delivery",
] as const;

export type AdminCapability = (typeof ADMIN_CAPABILITIES)[number];
export type AdminRole = "admin" | "catalog_publisher" | "catalog_editor";

export const ADMIN_ROLE_CAPABILITIES: Readonly<
  Record<AdminRole, readonly AdminCapability[]>
> = {
  admin: ADMIN_CAPABILITIES,
  catalog_publisher: [
    "admin.access",
    "catalog.read",
    "catalog.edit",
    "catalog.publish",
    "catalog.delivery",
  ],
  catalog_editor: ["admin.access", "catalog.read", "catalog.edit"],
};

type AdminMembership = {
  user_id: string;
  role: AdminRole;
  active: boolean;
};

export type CatalogAdminAccess = {
  userId: string;
  email: string | null;
  role: AdminRole;
  capabilities: readonly AdminCapability[];
};

export function capabilitiesForRole(
  role: AdminRole,
): readonly AdminCapability[] {
  return ADMIN_ROLE_CAPABILITIES[role];
}

export function roleHasCapability(
  role: AdminRole,
  capability: AdminCapability,
): boolean {
  return capabilitiesForRole(role).includes(capability);
}

type AccessDependencies = {
  getIdentity?: typeof getCurrentIdentity;
  getMembership?: (userId: string) => Promise<AdminMembership | null>;
};

async function defaultMembership(
  userId: string,
): Promise<AdminMembership | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("admin_memberships")
    .select("user_id, role, active")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new CatalogAdminError(
      "admin_access_unavailable",
      "Admin access could not be verified.",
      503,
    );
  }
  return data as AdminMembership | null;
}

export async function requireAdminCapability(
  capability: AdminCapability,
  dependencies: AccessDependencies = {},
): Promise<CatalogAdminAccess> {
  const identity = await (dependencies.getIdentity ?? getCurrentIdentity)();
  if (!identity) {
    throw new CatalogAdminError(
      "authentication_required",
      "Authentication is required.",
      401,
    );
  }

  const membership = await (dependencies.getMembership ?? defaultMembership)(
    identity.id,
  );
  if (
    !membership?.active ||
    !roleHasCapability(membership.role, capability)
  ) {
    throw new CatalogAdminError(
      "capability_required",
      `The ${capability} capability is required.`,
      403,
    );
  }

  return {
    userId: identity.id,
    email: identity.email,
    role: membership.role,
    capabilities: capabilitiesForRole(membership.role),
  };
}
