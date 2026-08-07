import "server-only";

import { getCurrentIdentity } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CatalogAdminError } from "@/lib/admin/catalog/errors";

export const ADMIN_CAPABILITIES = {
  access: "admin.access",
  catalogRead: "catalog.read",
  catalogEdit: "catalog.edit",
  catalogPublish: "catalog.publish",
  catalogDelivery: "catalog.delivery",
} as const;

export type AdminCapability =
  (typeof ADMIN_CAPABILITIES)[keyof typeof ADMIN_CAPABILITIES];
export type AdminRole = "admin" | "catalog_publisher" | "catalog_editor";

const ALL_ADMIN_CAPABILITIES = Object.values(ADMIN_CAPABILITIES);

const ADMIN_ROLE_CAPABILITIES: Readonly<
  Record<AdminRole, readonly AdminCapability[]>
> = {
  admin: ALL_ADMIN_CAPABILITIES,
  catalog_publisher: ALL_ADMIN_CAPABILITIES,
  catalog_editor: [
    ADMIN_CAPABILITIES.access,
    ADMIN_CAPABILITIES.catalogRead,
    ADMIN_CAPABILITIES.catalogEdit,
  ],
};

type AdminMembership = {
  user_id: string;
  role: AdminRole;
  active: boolean;
};

type AdminPrincipal = {
  id: string;
  email: string | null;
};

export type CatalogAdminAccess = {
  userId: string;
  email: string | null;
  role: AdminRole;
  capabilities: readonly AdminCapability[];
};

export type AdminCapabilityDecision =
  | {
      status: "allowed";
      principal: AdminPrincipal;
      access: CatalogAdminAccess;
    }
  | { status: "unauthenticated" }
  | { status: "forbidden"; principal: AdminPrincipal }
  | { status: "unavailable"; principal: AdminPrincipal | null };

export type AdminAccessDependencies = {
  getIdentity?: typeof getCurrentIdentity;
  getMembership?: (userId: string) => Promise<AdminMembership | null>;
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

export async function checkAdminCapability(
  capability: AdminCapability,
  dependencies: AdminAccessDependencies = {},
): Promise<AdminCapabilityDecision> {
  let identity: Awaited<ReturnType<typeof getCurrentIdentity>>;
  try {
    identity = await (dependencies.getIdentity ?? getCurrentIdentity)();
  } catch {
    return { status: "unavailable", principal: null };
  }
  if (!identity) return { status: "unauthenticated" };

  const principal = { id: identity.id, email: identity.email };
  let membership: AdminMembership | null;
  try {
    membership = await (dependencies.getMembership ?? defaultMembership)(
      identity.id,
    );
  } catch {
    return { status: "unavailable", principal };
  }

  if (
    !membership?.active ||
    membership.user_id !== identity.id ||
    !roleHasCapability(membership.role, capability)
  ) {
    return { status: "forbidden", principal };
  }

  return {
    status: "allowed",
    principal,
    access: {
      userId: identity.id,
      email: identity.email,
      role: membership.role,
      capabilities: capabilitiesForRole(membership.role),
    },
  };
}

export async function requireAdminCapability(
  capability: AdminCapability,
  dependencies: AdminAccessDependencies = {},
): Promise<CatalogAdminAccess> {
  const decision = await checkAdminCapability(capability, dependencies);
  if (decision.status === "allowed") return decision.access;
  if (decision.status === "unauthenticated") {
    throw new CatalogAdminError(
      "authentication_required",
      "Authentication is required.",
      401,
    );
  }
  if (decision.status === "forbidden") {
    throw new CatalogAdminError(
      "capability_required",
      `The ${capability} capability is required.`,
      403,
    );
  }
  throw new CatalogAdminError(
    "admin_access_unavailable",
    "Admin access could not be verified.",
    503,
  );
}
