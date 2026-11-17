/** Local-only browser proof. Shared lifecycle also supports the owned synthetic database composition. */
import { createServer, type RequestListener } from "node:http";
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import assert from "node:assert/strict";
import { chromium, type BrowserContext } from "@playwright/test";
import { productionMarketingLanding } from "../../components/marketing/production-marketing-document";

/** Test-only owned-loopback browser lifecycle shared by synthetic and database proofs. */
export async function withProductionMarketingBrowser(handler:RequestListener, proof:(context:BrowserContext,origin:string)=>Promise<void>, options:{actualOrigin?:string;viewports?:Array<{width:number;height:number}>}={}) {
  if(options.actualOrigin&&!/^http:\/\/127\.0\.0\.1:\d+$/.test(options.actualOrigin))throw new Error("Actual-route proof must use localhost only.");
  const server=createServer(handler);server.listen(0,"127.0.0.1");
  await new Promise<void>((resolve,reject)=>{server.once("listening",resolve);server.once("error",reject);});
  const address=server.address();assert(address&&typeof address==="object");const origin=`http://127.0.0.1:${address.port}`;
  let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
  try {
    browser=await chromium.launch({headless:true});
    for(const viewport of options.viewports??[{width:390,height:844}]){
      const context=await browser.newContext({viewport}),external:string[]=[],errors:string[]=[];
      context.on("page",page=>page.on("pageerror",error=>errors.push(error.message)));
      await context.route("**/*",route=>{
        if(![origin,options.actualOrigin].includes(new URL(route.request().url()).origin)){external.push("external request blocked");return route.abort();}return route.continue();
      });
      try{await proof(context,origin);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);}finally{await context.close();}
    }
  }finally{try{await browser?.close();}finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}}
}

async function main(){
let enabled = false;
const posts: Array<{ path: string; body: unknown }> = [];
const handler:RequestListener = async (request, response) => {
  const path = (request.url ?? "/").split("?")[0];
  if (request.method === "POST" && path.startsWith("/api/marketing/production/")) {
    let body = "";
    for await (const chunk of request) body += chunk;
    posts.push({ path, body: JSON.parse(body) });
    response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    response.end(JSON.stringify({ ok: true }));
    return;
  }
  const view = path === "/marketing/production" ? "enrollment"
    : path === "/marketing/production/confirm" ? "confirm"
      : path === "/marketing/production/preferences" ? "preferences" : null;
  if (!view || !["GET", "HEAD"].includes(request.method ?? "")) {
    response.writeHead(404); response.end(); return;
  }
  const rendered = productionMarketingLanding(view, enabled, request.method as "GET" | "HEAD");
  response.writeHead(rendered.status, Object.fromEntries(rendered.headers));
  response.end(await rendered.text());
};
const actualOrigin=process.argv[2];
await withProductionMarketingBrowser(handler,async(context,origin)=>{
  const page = await context.newPage();
  const enrollment = await page.goto(`${origin}/marketing/production`);
  assert.equal(enrollment?.headers()["referrer-policy"], "no-referrer");
  assert.equal(await page.getByRole("checkbox").isChecked(), false);
  assert.equal(await page.getByRole("button", { name: "Request confirmation" }).isDisabled(), true);
  assert.equal(await page.getByRole("textbox", { name: "Email address" }).isDisabled(), true);
  assert.equal(posts.length, 0);
  enabled = true;
  await page.reload();
  assert.equal(await page.getByRole("checkbox").isChecked(), false);
  await page.getByRole("textbox", { name: "Email address" }).fill("synthetic@example.test");
  await page.getByRole("button", { name: "Request confirmation" }).click();
  assert.equal(posts.length, 0);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Request confirmation" }).click();
  await page.getByRole("status").filter({ hasText: "held" }).waitFor();
  assert.deepEqual(posts.at(-1)?.body, { email: "synthetic@example.test", consent: true });
  const count = posts.length;
  const token = "c".repeat(43);
  const scanner = await fetch(`${origin}/marketing/production/confirm`, { method: "HEAD" });
  assert.equal(await scanner.text(), "");
  assert.equal(posts.length, count);
  await page.goto(`${origin}/marketing/production/confirm#token=${token}`);
  await page.waitForURL(`${origin}/marketing/production/confirm`);
  assert.equal(posts.length, count);
  assert.equal(await page.locator("body").innerText().then((text) => text.includes(token)), false);
  await page.getByRole("button", { name: "Confirm subscription" }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("status").filter({ hasText: "consent is confirmed" }).waitFor();
  assert.deepEqual(posts.at(-1), { path: "/api/marketing/production/confirm", body: { token } });
  assert.equal(await page.getByRole("status").evaluate((node) => node === document.activeElement), true);
  assert.equal(await page.getByRole("button", { name: "Confirm subscription" }).isDisabled(), true);
  enabled = false;
  await page.goto(`${origin}/marketing/production`);
  await page.goto(`${origin}/marketing/production/confirm#token=${token}`);
  await page.waitForURL(`${origin}/marketing/production/confirm`);
  assert.equal(await page.getByRole("button", { name: "Confirm subscription" }).isDisabled(), true);
  await page.goto(`${origin}/marketing/production/preferences#token=${"u".repeat(43)}`);
  await page.waitForURL(`${origin}/marketing/production/preferences`);
  const stop = page.getByRole("button", { name: "Unsubscribe from marketing" });
  assert.equal(await stop.isEnabled(), true);
  await stop.focus(); await page.keyboard.press("Enter");
  await page.getByRole("status").filter({ hasText: "withdrawal has been recorded" }).waitFor();
  assert.equal(posts.at(-1)?.path, "/api/marketing/production/preferences");
  assert.deepEqual(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })), { local: 0, session: 0 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  // Reload cannot replay a stripped capability or an earlier success state.
  await page.reload();
  await page.getByRole("alert").filter({ hasText: "invalid or has expired" }).waitFor();
  assert.equal(await stop.isDisabled(), true);
  if (actualOrigin) {
    for (const path of ["", "/confirm", "/preferences"]) {
      const result = await fetch(`${actualOrigin}/marketing/production${path}`, { method: "HEAD" });
      assert.equal(result.status, 200);
      assert.equal(await result.text(), "");
      assert.equal(result.headers.get("referrer-policy"), "no-referrer");
      assert(result.headers.get("cache-control")?.includes("no-store"));
      assert(result.headers.get("content-security-policy")?.includes("default-src 'none'"));
    }
    await page.goto(`${actualOrigin}/marketing/production`);
    assert.equal(await page.getByRole("checkbox").isChecked(), false);
    assert.equal(await page.getByRole("button", { name: "Request confirmation" }).isDisabled(), true);
    await page.screenshot({ path: "/tmp/helix-539-production-enrollment-mobile.png", fullPage: true });
    await page.goto(`${actualOrigin}/marketing/production/confirm#token=${"c".repeat(43)}`);
    await page.waitForURL(`${actualOrigin}/marketing/production/confirm`);
    assert.equal(await page.getByRole("button", { name: "Confirm subscription" }).isDisabled(), true);
    await page.goto(`${actualOrigin}/marketing/production/preferences#token=${"u".repeat(43)}`);
    await page.waitForURL(`${actualOrigin}/marketing/production/preferences`);
    assert.equal(await page.getByRole("button", { name: "Unsubscribe from marketing" }).isEnabled(), true);
    assert.equal(await page.getByRole("textbox").count(), 0);
    await page.screenshot({ path: "/tmp/helix-539-production-preferences-mobile.png", fullPage: true });
    console.log("PASS actual Next routes: all HEAD responses private/non-consuming; default-off enrollment/confirm; no-login withdrawal action available while paused; synthetic fragments stripped; no actual API requests.");
  }
  console.log("PASS mobile Chromium: default unchecked/disabled; explicit welcome consent; held not sent; scanner HEAD/GET inert; fragment stripped; keyboard explicit confirm; no-login withdrawal while paused; refresh cannot replay; no storage/external resources/errors/overflow.");
},{actualOrigin});
}
if(process.argv[1]&&realpathSync(fileURLToPath(import.meta.url))===realpathSync(process.argv[1]))await main();
