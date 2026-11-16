import "server-only";
import { readBoundedBody } from "@/lib/email/provider";
import { assertEmailEnvironment, type EmailEnvironment } from "@/lib/email/config";

type ActivityIdentity = { id: string; email?: string; email_confirmed_at?: string };
export type ActivityDependencies = {
  env: EmailEnvironment;
  getUser(): Promise<ActivityIdentity | null>;
  recordVisit(userId: string, slug: string): Promise<void>;
};
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
const result = (status: number) => new Response(null, { status, headers });
export async function handleLifecycleActivity(request: Request, deps: ActivityDependencies) {
  if (request.method !== "POST") return result(405);
  if (request.headers.get("origin") !== new URL(request.url).origin) return result(403);
  if (deps.env.HELIX_LIFECYCLE_ENABLED !== "true") return result(204);
  try {
    assertEmailEnvironment(deps.env);
    const body: unknown = JSON.parse(await readBoundedBody(request, 512));
    if (!body || typeof body !== "object" || Array.isArray(body)) return result(400);
    const value = body as Record<string, unknown>;
    if (Object.keys(value).some((key) => key !== "productSlug") || typeof value.productSlug !== "string"
      || !/^[a-z0-9][a-z0-9-]{0,159}$/.test(value.productSlug)) return result(400);
    const user = await deps.getUser();
    if (!user?.email || !user.email_confirmed_at) return result(204);
    // Database rechecks verified Auth email + current explicit lifecycle consent.
    // The browser never submits an identity, timestamp or availability fact.
    await deps.recordVisit(user.id, value.productSlug);
    return result(204);
  } catch (error) { return result(error instanceof RangeError ? 413 : 503); }
}
