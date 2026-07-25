import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

config({ path: resolve(process.cwd(), ".env.local"), quiet: true });

const PROJECT_REF = "erasogmsqpgiirovubjh";
const WEBHOOK_PATH = "/api/webhooks/supabase/catalog-search-sync";
const WEBHOOK_HEADER = "x-webhook-secret";
const EDITORIAL_ROLES = [
  "routine_video",
  "routine_video_poster",
  "profile_editorial",
  "ingredients_texture",
  "core_routine_texture",
] as const;

type MediaRow = {
  id: string;
  product_id: string;
  role: string;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function verifyProjectRef() {
  const url = new URL(requiredEnv("NEXT_PUBLIC_SUPABASE_URL"));
  const hostRef = url.hostname.split(".")[0];
  if (hostRef !== PROJECT_REF) {
    throw new Error(
      `[core-pdp-reconcile] Refusing Supabase project "${hostRef}"; expected "${PROJECT_REF}".`,
    );
  }
}

export function receiverUrl(
  endpoint: string,
  siteUrl = process.env.NEXT_PUBLIC_SITE_URL,
): URL {
  const url = new URL(WEBHOOK_PATH, endpoint);
  const isLocal =
    url.hostname === "127.0.0.1" ||
    url.hostname === "localhost" ||
    url.hostname === "::1" ||
    url.hostname === "[::1]";
  if (isLocal && url.protocol === "http:") return url;
  if (url.protocol !== "https:") {
    throw new Error(
      "[core-pdp-reconcile] Receiver must use HTTPS unless it is local.",
    );
  }

  if (!siteUrl || url.origin !== new URL(siteUrl).origin) {
    throw new Error(
      "[core-pdp-reconcile] Remote receiver origin must match NEXT_PUBLIC_SITE_URL.",
    );
  }
  return url;
}

async function readEditorialRows(): Promise<MediaRow[]> {
  const supabase = createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { autoRefreshToken: false, persistSession: false },
      realtime: {
        transport: WebSocket as unknown as typeof globalThis.WebSocket,
      },
    },
  );
  const { data, error } = await supabase
    .from("product_media")
    .select("id, product_id, role")
    .in("role", [...EDITORIAL_ROLES])
    .order("product_id", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) {
    throw new Error(
      `[core-pdp-reconcile] Failed to read editorial media: ${error.message}`,
    );
  }
  return (data ?? []) as MediaRow[];
}

export async function reconcileCorePdpMedia({
  endpoint,
  apply = false,
}: {
  endpoint: string;
  apply?: boolean;
}) {
  verifyProjectRef();
  const url = receiverUrl(endpoint);
  const rows = await readEditorialRows();

  if (!apply) {
    return {
      ok: true,
      dryRun: true,
      projectRef: PROJECT_REF,
      receiver: url.origin,
      eventsPlanned: rows.length,
    };
  }

  const secret = requiredEnv("SUPABASE_CATALOG_WEBHOOK_SECRET");
  const results: Array<{
    id: string;
    role: string;
    status: number;
    action: string | null;
  }> = [];

  for (const row of rows) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [WEBHOOK_HEADER]: secret,
      },
      body: JSON.stringify({
        schema: "public",
        type: "INSERT",
        table: "product_media",
        record: row,
      }),
    });
    const body = (await response.json().catch(() => null)) as {
      action?: string;
      error?: string;
    } | null;
    if (!response.ok) {
      throw new Error(
        `[core-pdp-reconcile] Receiver rejected ${row.id} (${response.status}): ` +
          `${body?.error ?? "unknown error"}`,
      );
    }
    results.push({
      id: row.id,
      role: row.role,
      status: response.status,
      action: body?.action ?? null,
    });
  }

  return {
    ok: true,
    dryRun: false,
    projectRef: PROJECT_REF,
    receiver: url.origin,
    eventsSubmitted: results.length,
    eventsAccepted: results.filter((result) => result.status === 200).length,
    algoliaActions: [...new Set(results.map((result) => result.action))],
  };
}

function parseArgs(argv: string[]) {
  const endpointIndex = argv.indexOf("--endpoint");
  const endpoint = endpointIndex >= 0 ? argv[endpointIndex + 1] : undefined;
  if (!endpoint) {
    throw new Error(
      "Pass --endpoint <origin>, for example --endpoint http://127.0.0.1:3010.",
    );
  }
  const apply = argv.includes("--apply") && !argv.includes("--dry-run");
  return { endpoint, apply };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  Promise.resolve()
    .then(() => reconcileCorePdpMedia(parseArgs(process.argv.slice(2))))
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
    })
    .catch((error) => {
      console.error(
        JSON.stringify(
          {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Unknown Core PDP reconciliation error",
          },
          null,
          2,
        ),
      );
      process.exitCode = 1;
    });
}
