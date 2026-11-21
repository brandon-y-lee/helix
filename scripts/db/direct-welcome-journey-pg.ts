import { execFileSync } from "node:child_process";

const unavailable = () => new Error("Owned synthetic journey database required.");
type Role = "postgres" | "service_role";

function docker(args: string[], input?: string) {
  try {
    return execFileSync("docker", args, {
      encoding: "utf8",
      input,
      timeout: 10000,
      maxBuffer: 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    // Driver errors can contain SQL, encrypted capabilities, recipients or message bodies.
    throw unavailable();
  }
}

function ownContainer() {
  const container = process.env.HELIX_DIRECT_JOURNEY_CONTAINER ?? "";
  const owner = process.env.HELIX_DIRECT_JOURNEY_OWNER ?? "";
  if (
    !/^[0-9a-f]{64}$/.test(container) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(owner) ||
    process.env.DOCKER_HOST ||
    process.env.DOCKER_CONTEXT
  )
    throw unavailable();
  const socket = JSON.parse(docker(["context", "inspect"]))[0]?.Endpoints?.docker?.Host;
  if (typeof socket !== "string" || !/^unix:\/\/\/[^\r\n\0]+$/.test(socket)) throw unavailable();
  // Pin both the local daemon and immutable container ID for every subsequent psql invocation.
  const format =
    '{{.Id}} {{.HostConfig.NetworkMode}} {{index .Config.Labels "helix.direct-welcome"}} {{.State.Running}}';
  if (
    docker(["--host", socket, "inspect", "--type", "container", "--format", format, container]) !==
    [container, "none", owner, "true"].join(" ")
  )
    throw unavailable();
  return { container, socket };
}

const { container, socket } = ownContainer();
export function sql(query: string, role: Role = "postgres"): string {
  if (!["postgres", "service_role"].includes(role)) throw unavailable();
  return docker(
    [
      "--host",
      socket,
      "exec",
      "-i",
      container,
      "psql",
      "-XAtq",
      "-h",
      "/var/run/postgresql",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      role,
      "-d",
      "proof_journey",
    ],
    query,
  );
}

const rpcNames = new Set([
  "production_marketing_enrollment_ready",
  "request_qualified_production_marketing_subscription",
  "confirm_production_marketing_subscription",
  "withdraw_production_marketing_subscription",
  "cleanup_production_marketing_delivery",
  "claim_direct_production_marketing_message",
  "prepare_direct_production_marketing_message",
  "retry_direct_production_marketing_message",
  "finish_production_marketing_message",
  "defer_production_marketing_message",
  "record_direct_production_marketing_preference",
  "record_direct_production_marketing_event",
  "read_direct_production_marketing_status",
]);

// PostgREST coerces JSON arguments using the declared SQL parameter type. The other named inputs here are text.
const argumentTypes: Record<string, string> = {
  p_lease: "uuid",
  p_id: "uuid",
  p_actor_id: "uuid",
  p_provider_id: "uuid",
  p_message_id: "uuid",
  p_event_id: "text",
  p_occurred_at: "timestamptz",
  p_denied_topics: "uuid[]",
  p_delivery_payload: "jsonb",
  p_explicit_consent: "boolean",
  p_global_denied: "boolean",
  p_ambiguous: "boolean",
};
const rpcBase = "https://erasogmsqpgiirovubjh.supabase.co/rest/v1/rpc/";
export const journeyServiceKey = "sb_secret_direct_journey_synthetic";

function jsonRecord(value: Record<string, unknown>) {
  // SQL text and psql commands never receive the original strings as executable syntax.
  const payload = Buffer.from(JSON.stringify(value)).toString("base64");
  return `convert_from(decode('${payload}', 'base64'), 'UTF8')::jsonb`;
}

export async function rpcFixture(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = new Request(input, init);
  const name = request.url.slice(rpcBase.length);
  if (
    request.url !== rpcBase + name ||
    !rpcNames.has(name) ||
    request.method !== "POST" ||
    request.headers.get("apikey") !== journeyServiceKey ||
    request.headers.has("authorization")
  )
    throw new Error("Unexpected synthetic RPC request.");
  const text = await request.text();
  if (Buffer.byteLength(text) > 160000) throw unavailable();
  try {
    const args: unknown = JSON.parse(text);
    if (!args || typeof args !== "object" || Array.isArray(args)) throw unavailable();
    const keys = Object.keys(args);
    if (keys.length > 12 || !keys.every((key) => /^p_[a-z_]{1,40}$/.test(key))) throw unavailable();
    const params = keys.map((key) => key + " => a." + key).join(",");
    const columns = keys.map((key) => key + " " + (argumentTypes[key] ?? "text")).join(",");
    const from = keys.length
      ? ` FROM jsonb_to_record(${jsonRecord(args as Record<string, unknown>)}) AS a(${columns})`
      : "";
    const value = sql(`SELECT to_jsonb(public.${name}(${params}))${from};`, "service_role");
    return Response.json(value ? JSON.parse(value) : null);
  } catch {
    return Response.json({ error: "Synthetic RPC failed." }, { status: 500 });
  }
}
