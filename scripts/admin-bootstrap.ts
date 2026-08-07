import "dotenv/config";

import {
  createClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import WebSocket from "ws";
import { assertApprovedSupabaseProjectUrl } from "../lib/supabase/project-safety";

const ROLES = new Set(["admin", "catalog_publisher", "catalog_editor"]);

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function verifyProjectRef(urlValue: string): void {
  assertApprovedSupabaseProjectUrl(urlValue);
}

function assertVerifiedUser(user: User): User {
  if (!user.email || !user.email_confirmed_at) {
    throw new Error("The selected Supabase user must have a verified email.");
  }
  return user;
}

async function findUserByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<User> {
  const normalized = email.toLowerCase();
  const matches: User[] = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw new Error("Supabase users could not be inspected.");
    matches.push(
      ...data.users.filter(
        (user) => user.email?.toLowerCase() === normalized,
      ),
    );
    if (data.users.length < 1000) break;
  }
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one verified Supabase user for the supplied email; found ${matches.length}.`,
    );
  }
  return assertVerifiedUser(matches[0]);
}

async function resolveUser(
  admin: SupabaseClient,
): Promise<User> {
  const userId = process.env.MEI_PELLE_ADMIN_USER_ID?.trim();
  const email = process.env.MEI_PELLE_ADMIN_EMAIL?.trim();
  if (Boolean(userId) === Boolean(email)) {
    throw new Error(
      "Set exactly one of MEI_PELLE_ADMIN_USER_ID or MEI_PELLE_ADMIN_EMAIL.",
    );
  }
  if (userId) {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data.user) {
      throw new Error("The supplied Supabase user ID was not found.");
    }
    return assertVerifiedUser(data.user);
  }
  return findUserByEmail(admin, email!);
}

async function main() {
  const url = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  verifyProjectRef(url);
  const role = requiredEnv("MEI_PELLE_ADMIN_ROLE");
  if (!ROLES.has(role)) {
    throw new Error(
      "MEI_PELLE_ADMIN_ROLE must be admin, catalog_publisher, or catalog_editor.",
    );
  }

  const admin = createClient(url, requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: {
      transport: WebSocket as unknown as typeof globalThis.WebSocket,
    },
  });
  const user = await resolveUser(admin);
  const { data, error } = await admin.rpc(
    "bootstrap_catalog_admin_membership",
    {
      p_user_id: user.id,
      p_role: role,
    },
  );
  if (error || !data || typeof data !== "object") {
    throw new Error("Admin membership could not be saved and audited.");
  }

  console.log(JSON.stringify(data));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown failure";
  console.error(`[admin-bootstrap] ${message}`);
  process.exitCode = 1;
});
