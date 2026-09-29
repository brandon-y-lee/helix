// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateDraft } from "../scripts/support-ai/runtime.mjs";

const directories: string[] = [];
const context = {
  messages: [{ id: "message-1", body: "Has my order shipped?" }],
  facts: [{ id: "sandbox", text: "This paid sandbox order has not shipped." }],
};
const result = { body: "Your sandbox order has not shipped.", references: ["sandbox"], needsHuman: false };
const disabledHostWarning = "Code Mode is unavailable because code-mode host is disabled. Code mode will fail closed; enable `features.code_mode_host` and install `codex-code-mode-host`.";

async function executable(scenario = "success") {
  const directory = await mkdtemp(join(tmpdir(), "helix-ai-runtime-"));
  directories.push(directory);
  const path = join(directory, "codex");
  const record = join(directory, "requests.jsonl");
  const configuration = await readFile(new URL("../scripts/support-ai/config.toml", import.meta.url), "utf8");
  const config: Record<string, unknown> = {};
  let section = config;
  for (const line of configuration.split("\n")) {
    if (line.startsWith("[")) {
      section = config;
      for (const key of line.slice(1, -1).split(".")) section = (section[key] ??= {}) as Record<string, unknown>;
    } else if (line.includes(" = ")) {
      const [key, value] = line.split(" = ");
      section[key] = JSON.parse(value);
    }
  }
  Object.assign(config.features as object, { auth_elicitation: true, mentions_v2: true });
  await writeFile(path, `#!${process.execPath}
import {createInterface} from 'node:readline';
import {appendFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
const scenario = ${JSON.stringify(scenario)};
const record = ${JSON.stringify(record)};
const config = ${JSON.stringify(config)};
const result = ${JSON.stringify(result)};
const warning = ${JSON.stringify(disabledHostWarning)};
if (process.argv.includes('--version')) {
 if(scenario==='version-tree-hang') {
  appendFileSync(record,JSON.stringify({pid:process.pid})+'\\n');
  spawn(process.execPath,['-e',"require('node:fs').appendFileSync("+JSON.stringify(record)+",JSON.stringify({pid:process.pid})+'\\\\n');process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:'inherit'});
  await new Promise(()=>{});
 }
 console.log(scenario==='version' ? 'codex-cli 0.159.0' : 'codex-cli 0.158.0'); process.exit(0);
}
const send = value => process.stdout.write(JSON.stringify(value)+'\\n');
const event = (method,params) => send({method,params});
appendFileSync(record,JSON.stringify({environment:process.env,pid:process.pid})+'\\n');
if (scenario==='tree-hang' && !process.argv.includes('--native')) {
 const native=spawn(process.execPath,[process.argv[1],'--native'],{stdio:'inherit'});
 process.on('SIGTERM',()=>{native.kill('SIGTERM');process.exit(0);});
 native.on('exit',()=>process.exit(0));
} else {
if (scenario.endsWith('hang')) process.on('SIGTERM',()=>{});
if (scenario==='tree-hang') setInterval(()=>{},1000);
createInterface({input:process.stdin}).on('line', line => {
 const request=JSON.parse(line); appendFileSync(record,line+'\\n');
 let value;
 switch(request.method) {
  case 'initialize':
   event('configWarning',{summary:'Codex could not find bubblewrap on PATH. Install bubblewrap with your OS package manager. See the sandbox prerequisites: https://developers.openai.com/codex/concepts/sandboxing#prerequisites. Codex will use the bundled bubblewrap in the meantime.',details:null});
   event('remoteControl/status/changed',{status:'disabled'});
   value={userAgent:'codex_cli_rs/0.158.0',codexHome:'/home/node/.codex',platformOs:'linux'}; break;
  case 'initialized': return;
  case 'account/read': value={account:{type:'chatgpt',planType:'pro'}}; break;
  case 'account/rateLimits/read': value={accountId:'owner',ordinaryUsageAllowed:true,rateLimits:{limitId:'codex',planType:'pro',primary:{usedPercent:20},secondary:null,spendControlReached:false,credits:{hasCredits:false,unlimited:false,balance:'0'}}}; break;
  case 'config/read': value={config}; break;
  case 'thread/start': event('warning',{threadId:'thread-1',message:warning}); value={thread:{id:'thread-1'}}; break;
  case 'turn/start':
   if (scenario.endsWith('hang')) return;
   if (scenario==='provider-quota') { event('error',{error:{codexErrorInfo:{httpConnectionFailed:{httpStatusCode:429}},message:'sensitive provider response'},willRetry:false}); return; }
   if (scenario==='auth-revoked') { event('account/updated',{authMode:null,planType:null}); return; }
   if (scenario==='tool-request') { send({id:99,method:'item/commandExecution/requestApproval',params:{command:'cat private'}}); return; }
   if (scenario==='tool-event') { event('item/started',{item:{type:'commandExecution'}}); return; }
   if (scenario==='unexpected-warning') { event('warning',{message:warning+' unexpected change'}); return; }
   if (scenario==='overflow') { process.stdout.write('x'.repeat(140000)); return; }
   if (scenario==='invalid-json') { process.stdout.write('not json\\n'); return; }
   if (scenario==='invalid-result') result.references=['unknown-fact'];
   send({id:request.id,result:{turn:{id:'turn-1',status:'inProgress'}}});
   event('item/completed',{threadId:'thread-1',turnId:'turn-1',item:{type:'agentMessage',text:JSON.stringify(result)}});
   event('turn/completed',{threadId:'thread-1',turn:{id:'turn-1',status:'completed',items:[]}}); return;
  default: process.exit(4);
 }
 if(request.method==='account/read' && scenario==='auth') value.account=null;
 if(request.method==='account/rateLimits/read') {
  if(scenario==='wrong-account') value.accountId='other';
  if(scenario==='quota') value.rateLimits.primary.usedPercent=100;
  if(scenario==='uncertain-quota') value.ordinaryUsageAllowed=null;
  if(scenario==='credits') value.rateLimits.credits={hasCredits:true,unlimited:false,balance:'5'};
 }
 if(request.method==='config/read' && scenario==='tools-enabled') value.config.features.shell_tool=true;
 send({id:request.id,result:value});
});
}
`, { mode: 0o700 });
  return { executable: path, cwd: directory, record };
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("private support drafting runtime", () => {
  it("returns a bounded, unapproved draft after checking the managed identity, limits and configuration", async () => {
    const runtime = await executable();
    vi.stubEnv("HELIX_SUPPORT_AI_WORKER_SECRET", "worker-secret");
    vi.stubEnv("OPENAI_API_KEY", "api-secret");
    vi.stubEnv("NODE_OPTIONS", "--trace-warnings");
    await expect(generateDraft(context, { ...runtime, accountId: "owner" })).resolves.toEqual(result);
    const records = (await readFile(runtime.record, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    expect(records[0].environment).not.toHaveProperty("HELIX_SUPPORT_AI_WORKER_SECRET");
    expect(records[0].environment).not.toHaveProperty("OPENAI_API_KEY");
    expect(records[0].environment).not.toHaveProperty("NODE_OPTIONS");
    expect(records.find((record) => record.method === "thread/start").params).toMatchObject({
      ephemeral: true, approvalPolicy: "never", sandbox: "read-only", model: "gpt-6-sol",
    });
    expect(records.find((record) => record.method === "turn/start").params.input).toEqual([
      { type: "text", text: JSON.stringify(context) },
    ]);
    expect(() => process.kill(records[0].pid, 0)).toThrow();
  });

  it.each([
    ["auth", "authentication_required"], ["wrong-account", "authentication_required"],
    ["quota", "quota_exceeded"], ["uncertain-quota", "quota_exceeded"], ["credits", "quota_exceeded"],
    ["tools-enabled", "runtime_mismatch"], ["version", "runtime_mismatch"],
  ])("refuses %s before sending customer text to the model", async (scenario, code) => {
    const runtime = await executable(scenario);
    await expect(generateDraft(context, { ...runtime, accountId: "owner" })).rejects.toMatchObject({ code, message: code });
    const requests = await readFile(runtime.record, "utf8").catch(() => "");
    expect(requests).not.toContain('"method":"turn/start"');
    expect(requests).not.toContain(context.messages[0].body);
  });

  it.each([
    ["provider-quota", "quota_exceeded"], ["auth-revoked", "authentication_required"],
    ["tool-request", "runtime_mismatch"], ["tool-event", "runtime_mismatch"],
    ["unexpected-warning", "runtime_mismatch"], ["overflow", "invalid_result"],
    ["invalid-json", "runtime_mismatch"], ["invalid-result", "invalid_result"],
  ])("stops %s without returning provider payloads or an untrusted result", async (scenario, code) => {
    const runtime = await executable(scenario);
    await expect(generateDraft(context, { ...runtime, accountId: "owner" })).rejects.toMatchObject({ code, message: code });
    const child = JSON.parse((await readFile(runtime.record, "utf8")).split("\n")[0]);
    expect(() => process.kill(child.pid, 0)).toThrow();
  });

  it("kills and reaps an unresponsive child at the deadline", async () => {
    const runtime = await executable("hang");
    await expect(generateDraft(context, { ...runtime, accountId: "owner", timeoutMs: 700 })).rejects.toMatchObject({ code: "worker_timeout" });
    const child = JSON.parse((await readFile(runtime.record, "utf8")).split("\n")[0]);
    expect(() => process.kill(child.pid, 0)).toThrow();
  });

  it("cancels an in-flight request and reaps its process", async () => {
    const runtime = await executable("hang");
    const controller = new AbortController();
    const attempt = generateDraft(context, { ...runtime, accountId: "owner", signal: controller.signal });
    const assertion = expect(attempt).rejects.toMatchObject({ code: "cancelled" });
    await vi.waitFor(async () => expect(await readFile(runtime.record, "utf8")).toContain('"method":"turn/start"'));
    controller.abort();
    await assertion;
    const child = JSON.parse((await readFile(runtime.record, "utf8")).split("\n")[0]);
    expect(() => process.kill(child.pid, 0)).toThrow();
  });

  it.each(["deadline", "cancellation", "version deadline", "version cancellation"])("stops the wrapper and its unresponsive native child on %s", async (mode) => {
    const version = mode.startsWith("version");
    const cancelled = mode.endsWith("cancellation");
    const runtime = await executable(version ? "version-tree-hang" : "tree-hang");
    const controller = new AbortController();
    const attempt = generateDraft(context, { ...runtime, accountId: "owner", timeoutMs: 700, signal: controller.signal });
    // Bound a broken implementation too, so the regression cannot leave native processes behind.
    let guard: ReturnType<typeof setTimeout>;
    const bounded = Promise.race([attempt, new Promise((_, reject) => {
      guard = setTimeout(() => reject(new Error("native process outlived cleanup")), 1800);
    })]);
    const assertion = expect(bounded).rejects.toMatchObject({ code: cancelled ? "cancelled" : "worker_timeout" });
    try {
      await vi.waitFor(async () => {
        const recorded = await readFile(runtime.record, "utf8");
        if (version) expect(recorded.trim().split("\n")).toHaveLength(2);
        else expect(recorded).toContain('"method":"turn/start"');
      });
      if (cancelled) controller.abort();
      await assertion;
      const processes = (await readFile(runtime.record, "utf8")).split("\n").filter(Boolean).map((line) => JSON.parse(line)).filter((record) => record.pid);
      expect(processes).toHaveLength(2);
      await vi.waitFor(() => processes.forEach(({ pid }) => expect(() => process.kill(pid, 0)).toThrow()));
    } finally {
      clearTimeout(guard!);
      const records = (await readFile(runtime.record, "utf8")).split("\n").filter(Boolean).map((line) => JSON.parse(line));
      for (const record of records) {
        if (record.pid) { try { process.kill(record.pid, "SIGKILL"); } catch { /* Already reaped. */ } }
      }
      await attempt.catch(() => {});
    }
  });

  it("rejects excessive customer context before starting the runtime", async () => {
    const runtime = await executable();
    await expect(generateDraft({ ...context, messages: [{ id: "m", body: "a".repeat(6001) }] }, { ...runtime, accountId: "owner" })).rejects.toMatchObject({ code: "invalid_result" });
    await expect(readFile(runtime.record, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });
});
