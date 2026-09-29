import "server-only";
import { timingSafeEqual } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { cleanupSupportPhotos } from "@/lib/support/photo-worker";

export type SupportRetentionDependencies = {
  env: Record<string, string | undefined>;
  now(): number;
  redact(signal: AbortSignal): Promise<unknown>;
  clean: typeof cleanupSupportPhotos;
};
const defaults: SupportRetentionDependencies = {
  env: process.env, now: Date.now, clean: cleanupSupportPhotos,
  async redact(signal) {
    const { data, error } = await createSupabaseAdminClient().rpc("run_support_retention", { p_limit: 20 })
      .abortSignal(AbortSignal.any([signal, AbortSignal.timeout(5_000)]));
    if (error) throw new Error("Support cleanup is unavailable.");
    return data;
  },
};
const headers = { "Cache-Control": "private, no-store" };

function retentionCounts(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid cleanup result.");
  const data = value as Record<string, unknown>;
  const count = (key: string): number => {
    const value = data[key];
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("Invalid cleanup count.");
    return value;
  };
  const time = data.oldestOverdueAt;
  if (time !== null && (typeof time !== "string" || time.length > 40
    || !/^\d{4}-\d{2}-\d{2}T[\d:.+-]+Z?$/.test(time) || !Number.isFinite(Date.parse(time)))) throw new Error("Invalid cleanup time.");
  return { inquiriesRedacted: count("inquiriesRedacted"), draftsRedacted: count("draftsRedacted"),
    photosExpired: count("photosExpired"), auditDeleted: count("auditDeleted"), emailsRedacted: count("emailsRedacted"),
    heldInquiries: count("heldInquiries"), oldestOverdueAt: time };
}

/** Independent scheduling prevents incoming email/photo backlogs from starving cleanup. */
export async function handleSupportRetentionRequest(request: Request, deps = defaults): Promise<Response> {
  const secret = deps.env.HELIX_SUPPORT_RETENTION_SECRET;
  if (!secret || !/^[^\s]{32,256}$/.test(secret)) return Response.json({ error: "Support cleanup is not configured." }, { status: 503, headers });
  const expected = Buffer.from(`Bearer ${secret}`), supplied = Buffer.from(request.headers.get("authorization") ?? "");
  if (supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) return Response.json({ error: "Unauthorized." }, { status: 401, headers });
  if (request.method !== "POST") return Response.json({ error: "Method not allowed." }, { status: 405, headers });
  if (deps.env.HELIX_SUPPORT_RETENTION_ENABLED !== "true" || deps.env.HELIX_EMAIL_ENVIRONMENT !== "sandbox"
    || deps.env.HELIX_EMAIL_MODE !== "restricted" || deps.env.NEXT_PUBLIC_SUPABASE_URL !== "https://erasogmsqpgiirovubjh.supabase.co") {
    return Response.json({ error: "Support cleanup is not configured." }, { status: 503, headers });
  }
  try {
    const deadline = deps.now() + 45_000;
    const signal = AbortSignal.timeout(45_000);
    const result = { ...retentionCounts(await deps.redact(signal)), objectsCleaned: 0, objectsDeferred: 0 };
    for (let index = 0; index < 3 && !signal.aborted && deadline - deps.now() >= 10_000; index++) {
      const cleanup = await deps.clean({ deadline, signal });
      result.objectsCleaned += cleanup.cleaned;
      result.objectsDeferred += cleanup.deferred;
      if (!cleanup.cleaned && !cleanup.deferred) break;
    }
    return Response.json({ ok: true, ...result }, { headers });
  } catch {
    return Response.json({ error: "Support cleanup needs operator attention." }, { status: 503, headers });
  }
}
