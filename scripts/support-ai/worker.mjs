import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const FAILURE_CODES = new Set(["quota_exceeded", "authentication_required", "runtime_mismatch", "invalid_result", "worker_timeout", "worker_unavailable", "cancelled"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RUNTIME = { version: "0.158.0", model: "gpt-6-sol", promptVersion: "1" };
const failure = (code) => Object.assign(new Error(code), { code });
const failureCode = (error) => FAILURE_CODES.has(error?.code) ? error.code : "worker_unavailable";

export function readWorkerConfig(env) {
  const url = new URL(env.HELIX_SUPPORT_AI_URL ?? "");
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash
    || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]", "host.docker.internal"].includes(url.hostname)))
    || !/^[^\s]{32,256}$/.test(env.HELIX_SUPPORT_AI_WORKER_SECRET ?? "")
    || !/^[^\s]{1,128}$/.test(env.HELIX_SUPPORT_AI_ACCOUNT_ID ?? "")) throw failure("runtime_mismatch");
  return { url: new URL("/api/internal/support-ai/worker", url).href, secret: env.HELIX_SUPPORT_AI_WORKER_SECRET, accountId: env.HELIX_SUPPORT_AI_ACCOUNT_ID };
}

async function apiCall(config, fetch, body, signal) {
  const timeout = AbortSignal.timeout(5_000);
  try {
    const response = await fetch(config.url, {
      method: "POST", redirect: "error", cache: "no-store",
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      headers: { Authorization: `Bearer ${config.secret}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok || !response.body) throw failure("worker_unavailable");
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 32_768) throw failure("invalid_result");
        chunks.push(Buffer.from(value));
      }
    } finally { await reader.cancel().catch(() => {}); }
    const result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!result || typeof result !== "object" || Array.isArray(result)) throw failure("invalid_result");
    return result;
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    throw failure(failureCode(error));
  }
}

// One admission, one model attempt. The server owns leases, authority and stale-result checks.
/**
 * @param {{url: string, secret: string, accountId: string}} config
 * @param {{fetch?: typeof globalThis.fetch, generate?: typeof import('./runtime.mjs').generateDraft, signal?: AbortSignal}} options
 */
export async function runOnce(config, { fetch = globalThis.fetch, generate, signal } = {}) {
  const claimed = await apiCall(config, fetch, { action: "claim" }, signal);
  if (claimed.job === null) return "idle";
  const job = claimed.job;
  if (!job || !UUID.test(job.id) || !UUID.test(job.leaseToken) || !Number.isFinite(Date.parse(job.expiresAt))) throw failure("invalid_result");
  const identity = { jobId: job.id, leaseToken: job.leaseToken };
  const controller = new AbortController();
  const abort = () => controller.abort(failure("cancelled"));
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const budget = Math.min(90_000, Date.parse(job.expiresAt) - Date.now() - 10_000);
  const deadline = setTimeout(() => controller.abort(failure("worker_timeout")), Math.max(0, budget));
  let timer;
  let checking;
  let stopped = false;
  const poll = () => {
    checking = apiCall(config, fetch, { action: "check", ...identity }, controller.signal)
      .then((result) => {
        if (typeof result.active !== "boolean") throw failure("invalid_result");
        if (!result.active) controller.abort(failure("cancelled"));
      })
      .catch((error) => { if (!controller.signal.aborted) controller.abort(failure(failureCode(error))); })
      .finally(() => { if (!stopped && !controller.signal.aborted) timer = setTimeout(poll, 3_000); });
  };
  try {
    if (budget <= 0) throw failure("worker_timeout");
    controller.signal.throwIfAborted();
    timer = setTimeout(poll, 3_000);
    const generateDraft = generate ?? (await import("./runtime.mjs")).generateDraft;
    const result = await generateDraft(job.context, { accountId: config.accountId, signal: controller.signal });
    stopped = true;
    clearTimeout(timer);
    await checking;
    controller.signal.throwIfAborted();
    const completed = await apiCall(config, fetch, { action: "complete", ...identity, result, runtime: RUNTIME }, controller.signal);
    if (typeof completed.accepted !== "boolean") throw failure("invalid_result");
    return completed.accepted ? "completed" : "discarded";
  } catch (error) {
    const code = controller.signal.aborted ? failureCode(controller.signal.reason) : failureCode(error);
    // Lost responses are left for lease expiry; never start a second inference or replay completion.
    await apiCall(config, fetch, { action: "fail", ...identity, errorCode: code }).catch(() => {});
    return code;
  } finally {
    stopped = true;
    clearTimeout(timer);
    clearTimeout(deadline);
    controller.abort(failure("cancelled"));
    await checking;
    signal?.removeEventListener("abort", abort);
  }
}

async function main() {
  if (process.platform !== "linux" || process.getuid?.() !== 1000 || process.cwd() !== "/work") throw failure("runtime_mismatch");
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length && !["--once", "--login"].includes(args[0]))) throw failure("runtime_mismatch");
  const pinned = await readFile(new URL("./config.toml", import.meta.url));
  const configPath = "/home/node/.codex/config.toml";
  try { await writeFile(configPath, pinned, { mode: 0o600, flag: "wx" }); }
  catch (error) { if (error.code !== "EEXIST") throw error; }
  if (!(await readFile(configPath)).equals(pinned)) throw failure("runtime_mismatch");
  if (args[0] === "--login") {
    const child = spawn("codex", ["--strict-config", "login", "--device-auth"], { stdio: "inherit", env: { PATH: process.env.PATH, LANG: "C.UTF-8" } });
    process.exitCode = await new Promise((resolve) => { child.once("error", () => resolve(1)); child.once("exit", (code) => resolve(code ?? 1)); });
    return;
  }
  const config = readWorkerConfig(process.env);
  const controller = new AbortController();
  process.once("SIGTERM", () => controller.abort());
  process.once("SIGINT", () => controller.abort());
  do {
    try {
      const outcome = await runOnce(config, { signal: controller.signal });
      if (outcome !== "idle") process.stdout.write(`${JSON.stringify({ outcome })}\n`);
    } catch (error) { process.stdout.write(`${JSON.stringify({ outcome: failureCode(error) })}\n`); }
    if (args[0] === "--once" || controller.signal.aborted) break;
    await delay(5_000, undefined, { signal: controller.signal }).catch(() => {});
  } while (!controller.signal.aborted);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { process.stderr.write(`${JSON.stringify({ outcome: failureCode(error) })}\n`); process.exitCode = 1; });
}
