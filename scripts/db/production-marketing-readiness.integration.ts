import { execFileSync } from "node:child_process";
import { createHmac,randomUUID } from "node:crypto";
import { expect,it,vi } from "vitest";
import { withProductionMarketingBrowser } from "../../tests/helpers/production-marketing-browser";
import { productionMarketingLanding } from "../../components/marketing/production-marketing-document";
import { productionMarketingEnrollmentEnabled } from "../../lib/production-marketing/config";
import { createProductionMarketingStorage } from "../../lib/production-marketing/storage";
import { handleProductionMarketingRequest,handleProductionMarketingUnsubscribe } from "../../lib/production-marketing/requests";
import { createProductionMarketingDeliveryStorage } from "../../lib/production-marketing/delivery-storage";
import { productionMarketingProvider } from "../../lib/production-marketing/delivery-provider";
import { dispatchProductionMarketing } from "../../lib/production-marketing/worker";
import { createProductionMarketingEventStorage } from "../../lib/production-marketing/event-storage";
import { receiveProductionMarketingEvent } from "../../lib/production-marketing/events";
import { handleProductionMarketingStatus } from "../../lib/production-marketing/operator-status";
import { productionMarketingTemplateHash } from "../../lib/production-marketing/templates";
const container=process.env.HELIX_SYNTHETIC_MARKETING_READINESS_CONTAINER??"";
if(!/^helix-production-marketing-542-[0-9]+-[0-9]+$/.test(container)||process.env.DOCKER_HOST||process.env.DOCKER_CONTEXT)throw new Error("Owned local database required.");
const docker=(args:string[],input?:string)=>execFileSync("docker",args,{encoding:"utf8",input,stdio:["pipe","pipe","pipe"]});
if(!JSON.parse(docker(["context","inspect"]))[0].Endpoints.docker.Host.startsWith("unix://")||docker(["inspect","-f",'{{index .Config.Labels "helix.task"}}',container]).trim()!=="production-marketing-542-synthetic")throw new Error("Owned local database required.");
function sql(input:string){try{return docker(["exec","-i",container,"psql","-X","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1","-Atq"],input).trim();}catch{throw new Error("Owned synthetic database assertion failed.");}}
const literal=(v:unknown)=>v===null?"NULL":typeof v==="boolean"?String(v):`'${(typeof v==="string"?v:JSON.stringify(v)).replaceAll("'","''")}'`;
const canonical="https://www.helixskin.us",topic="11111111-1111-4111-8111-111111111111",admin="22222222-2222-4222-8222-222222222222";
const signing=Buffer.from("synthetic-readiness-signing-secret").toString("base64");
const contract={version:"production_welcome_delivery_v1",from:"news@helixskin.us",replyTo:"support@helixskin.us",topicId:topic,postalAddress:"Synthetic test address only",templateHash:productionMarketingTemplateHash};
const env={VERCEL:"1",VERCEL_ENV:"production",VERCEL_PROJECT_ID:"synthetic",VERCEL_DEPLOYMENT_ID:"synthetic",VERCEL_PROJECT_PRODUCTION_URL:"helixskin.us",
 HELIX_PRODUCTION_MARKETING_SITE_ORIGIN:canonical,HELIX_PRODUCTION_MARKETING_VERCEL_PROJECT_ID:"synthetic",HELIX_PRODUCTION_MARKETING_DEPLOYMENT_ID:"synthetic",
 HELIX_PRODUCTION_MARKETING_SUPABASE_URL:"https://erasogmsqpgiirovubjh.supabase.co",NEXT_PUBLIC_SUPABASE_URL:"https://erasogmsqpgiirovubjh.supabase.co",HELIX_PRODUCTION_MARKETING_SERVICE_KEY:"synthetic-db-only",
 HELIX_PRODUCTION_MARKETING_ENABLED:"false",HELIX_PRODUCTION_MARKETING_DISPATCH_ENABLED:"false",HELIX_PRODUCTION_MARKETING_EVENTS_ENABLED:"true",HELIX_PRODUCTION_MARKETING_STATUS_ENABLED:"true",
 HELIX_PRODUCTION_MARKETING_ABUSE_KEY:"a".repeat(64),HELIX_PRODUCTION_MARKETING_CAPABILITY_KEY:"c".repeat(64),HELIX_PRODUCTION_MARKETING_CAPABILITY_KEY_ID:"synthetic-v1",
 HELIX_PRODUCTION_MARKETING_WORKER_TOKEN:"w".repeat(48),HELIX_PRODUCTION_MARKETING_PROVIDER_KEY:"synthetic-send-only",HELIX_PRODUCTION_MARKETING_PREFERENCE_KEY:"synthetic-read-only",
 HELIX_PRODUCTION_MARKETING_DELIVERY_CONTRACT:JSON.stringify(contract),HELIX_PRODUCTION_MARKETING_WEBHOOK_SECRET:`whsec_${signing}`};
const rpcNames=new Set(["request_production_marketing_subscription","confirm_production_marketing_subscription","withdraw_production_marketing_subscription","cleanup_production_marketing_delivery","claim_production_marketing_message","prepare_production_marketing_message","retry_production_marketing_message","finish_production_marketing_message","defer_production_marketing_message","record_production_marketing_event","read_production_marketing_status"]);
type Captured={body:{from:string;reply_to:string;to:string[];subject:string;html:string;text:string;headers:Record<string,string>;tags:Array<{name:string;value:string}>};provider:string;wire:string;key:string};
const sends:Captured[]=[];let posts=0,serverFault=false;
const transport=vi.fn(async(input:string|URL|Request,init?:RequestInit)=>{
 const url=String(input),headers=init?.headers as Record<string,string>;
 if(url.startsWith(`${env.HELIX_PRODUCTION_MARKETING_SUPABASE_URL}/rest/v1/rpc/`)){
  const name=url.split("/").at(-1)!;if(!rpcNames.has(name)||init?.method!=="POST"||headers.apikey!==env.HELIX_PRODUCTION_MARKETING_SERVICE_KEY||headers.Authorization!==`Bearer ${env.HELIX_PRODUCTION_MARKETING_SERVICE_KEY}`)throw new Error("Unexpected synthetic RPC.");
  const args=JSON.parse(String(init.body)) as Record<string,unknown>;if(Object.keys(args).some(k=>!/^p_[a-z_]+$/.test(k)))throw new Error("Unexpected argument.");
  const raw=sql(`SET ROLE service_role;SELECT to_jsonb(public.${name}(${Object.entries(args).map(([k,v])=>`${k}=>${literal(v)}`).join(",")}));`);return Response.json(raw?JSON.parse(raw):null);
 }
 if(url==="https://api.resend.com/emails"){
  if(init?.method!=="POST"||headers.Authorization!==`Bearer ${env.HELIX_PRODUCTION_MARKETING_PROVIDER_KEY}`)throw new Error("Wrong provider contract.");
  const provider=randomUUID(),wire=String(init.body);sends.push({body:JSON.parse(wire),provider,wire,key:headers["Idempotency-Key"]});return Response.json({id:provider});
 }
 if(url.startsWith("https://api.resend.com/contacts/")){
  if((init?.method??"GET")!=="GET"||headers.Authorization!==`Bearer ${env.HELIX_PRODUCTION_MARKETING_PREFERENCE_KEY}`)throw new Error("Read-only native preference required.");
  return Response.json(url.includes("/topics?")?{data:[{id:topic,subscription:"opt_in"}],has_more:false}:{id:topic,email:decodeURIComponent(url.split("/").at(-1)!),unsubscribed:false});
 }
 throw new Error("External network forbidden.");
});
const requests=createProductionMarketingStorage(env),delivery=createProductionMarketingDeliveryStorage(env),events=createProductionMarketingEventStorage(env);
const worker=()=>dispatchProductionMarketing(new Request(`${canonical}/api/internal/marketing/production/dispatch`,{method:"POST",headers:{authorization:`Bearer ${env.HELIX_PRODUCTION_MARKETING_WORKER_TOKEN}`}}),{env,storage:delivery,provider:productionMarketingProvider});
const state=(email:string)=>sql(`SELECT state FROM private.production_marketing_subscribers WHERE normalized_email=${literal(email)};`);
function switchFixture(on:boolean){env.HELIX_PRODUCTION_MARKETING_ENABLED=String(on);env.HELIX_PRODUCTION_MARKETING_DISPATCH_ENABLED=String(on);sql(`UPDATE private.production_marketing_controls SET enrollment_enabled=${on},dispatch_enabled=${on},events_enabled=true,status_enabled=true,daily_limit=100,monthly_limit=1000,delivery_contract_text=${literal(JSON.stringify(contract))};`);}
async function event(send:Captured,type:string){
 const id=`msg_${randomUUID()}`,timestamp=String(Math.floor(Date.now()/1000)),body=JSON.stringify({type,created_at:new Date().toISOString(),data:{email_id:send.provider,from:send.body.from,to:send.body.to,tags:Object.fromEntries(send.body.tags.map(t=>[t.name,t.value]))}});
 const signature=createHmac("sha256",Buffer.from(signing,"base64")).update(`${id}.${timestamp}.${body}`).digest("base64");
 return receiveProductionMarketingEvent(new Request(`${canonical}/api/webhooks/marketing-production`,{method:"POST",body,headers:{"svix-id":id,"svix-timestamp":timestamp,"svix-signature":`v1,${signature}`}}),{env,record:events.record});
}
it("proves the complete no-send browser/consent/worker/signed-event/withdrawal journey through actual PostgreSQL at both viewports",async()=>{
 vi.stubGlobal("fetch",transport);
 try {
  expect(sql("SELECT count(*) FROM private.production_marketing_subscribers;")).toBe("0");expect(sql("SELECT NOT enrollment_enabled AND NOT dispatch_enabled AND NOT events_enabled AND NOT status_enabled FROM private.production_marketing_controls;")).toBe("t");
  sql(`INSERT INTO public.admin_memberships VALUES('${admin}','admin',true);`);
  let sequence=0;
  await withProductionMarketingBrowser(async(incoming,outgoing)=>{
   try {
    const local=`http://${incoming.headers.host}`,url=new URL(incoming.url??"/",local);if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(local))throw new Error();
    const path=url.pathname,method=incoming.method??"GET",view=path==="/marketing/production"?"enrollment":path==="/marketing/production/confirm"?"confirm":path==="/marketing/production/preferences"?"preferences":null;
    let result:Response;
    if(view&&(method==="GET"||method==="HEAD"))result=productionMarketingLanding(view,productionMarketingEnrollmentEnabled(env),method);
    else {
     let body="";for await(const chunk of incoming){body+=chunk;if(Buffer.byteLength(body)>8192)throw new Error();}
     const headers=new Headers();for(const key of ["origin","content-type"]){const value=incoming.headers[key];if(typeof value==="string")headers.set(key,key==="origin"&&value===local?canonical:value);}
     headers.set("x-vercel-forwarded-for","192.0.2.1");
     const request=new Request(canonical+path+url.search,{method,headers,...(method!=="GET"&&method!=="HEAD"?{body}:{})});
     const action=path.split("/").at(-1);if(method==="POST")posts++;
     result=action==="unsubscribe"?await handleProductionMarketingUnsubscribe(request,{env,storage:requests}):["subscription","confirm","preferences"].includes(action??"")?await handleProductionMarketingRequest(request,action as "subscription"|"confirm"|"preferences",{env,storage:requests}):new Response(null,{status:404});
    }
    outgoing.writeHead(result.status,Object.fromEntries(result.headers));outgoing.end(await result.text());
   }catch{serverFault=true;outgoing.writeHead(500);outgoing.end();}
  },async(context,origin)=>{
   const page=await context.newPage(),email=`journey-${sequence++}@example.invalid`;
   env.HELIX_PRODUCTION_MARKETING_ENABLED="false";env.HELIX_PRODUCTION_MARKETING_DISPATCH_ENABLED="false";
   await page.goto(`${origin}/marketing/production`);expect(await page.getByRole("checkbox").isChecked()).toBe(false);expect(await page.getByRole("button").isDisabled()).toBe(true);
   switchFixture(true);await page.reload();expect(await page.getByRole("checkbox").isChecked()).toBe(false);await page.getByRole("textbox",{name:"Email address"}).fill(email);
   expect((await context.request.post(`${origin}/api/marketing/production/subscription`,{headers:{origin:"https://foreign.example.invalid"},data:{email,consent:true}})).status()).toBe(403);expect(state(email)).toBe("");
   const before=posts;await page.getByRole("button").click();expect(posts).toBe(before);expect(state(email)).toBe("");
   await page.getByRole("checkbox").check();await page.getByRole("button").click();await page.getByRole("status").filter({hasText:"held"}).waitFor();expect(state(email)).toBe("pending");
   expect(await (await worker()).json()).toEqual({status:"accepted"});const confirmation=sends.at(-1)!;expect(confirmation.body.to).toEqual([email]);expect(confirmation.body.from).toBe(contract.from);expect(confirmation.body.reply_to).toBe(contract.replyTo);expect(confirmation.body.headers).toEqual({});
   const confirmUrl=/https:\/\/www\.helixskin\.us\/marketing\/production\/confirm#token=[A-Za-z0-9_-]{43}/.exec(confirmation.body.text)![0],confirmationToken=new URL(confirmUrl).hash.slice(7);expect(new URL(confirmUrl).search).toBe("");
   const emailPage=await context.newPage();await emailPage.route(`${canonical}/brand/helix-wordmark-email.png`,route=>route.fulfill({path:new URL("../../public/brand/helix-wordmark-email.png",import.meta.url).pathname}));await emailPage.setContent('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src https://www.helixskin.us">'+confirmation.body.html);expect(await emailPage.getByRole("img",{name:"Helix"}).evaluate(n=>(n as HTMLImageElement).complete&&(n as HTMLImageElement).naturalWidth>0)).toBe(true);expect(await emailPage.getByRole("heading").innerText()).toBe("Confirm your subscription");expect(await emailPage.locator("body").innerText()).toContain(contract.postalAddress);expect(confirmation.body.text).toContain("Opening this email or its link does not confirm");expect(confirmation.body.html).not.toContain("{{");expect(await emailPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await emailPage.screenshot({path:`/private/tmp/helix-542-confirmation-email-${emailPage.viewportSize()!.width}.png`,fullPage:true});await emailPage.close();
   const scannerCount=posts;for(const method of ["GET","HEAD"]){const result=await context.request.fetch(`${origin}/marketing/production/confirm`,{method});expect(result.status()).toBe(200);if(method==="HEAD")expect(await result.text()).toBe("");expect((await context.request.fetch(`${origin}/api/marketing/production/confirm`,{method})).status()).toBe(405);}expect(posts).toBe(scannerCount);expect(state(email)).toBe("pending");
   await page.goto(confirmUrl.replace(canonical,origin));await page.waitForURL(`${origin}/marketing/production/confirm`);expect(posts).toBe(scannerCount);expect(state(email)).toBe("pending");
   await page.getByRole("button",{name:"Confirm subscription"}).focus();await page.keyboard.press("Enter");await page.getByRole("status").filter({hasText:"consent is confirmed"}).waitFor();expect(await page.getByRole("status").evaluate(n=>n===document.activeElement)).toBe(true);expect(state(email)).toBe("confirmed");
   const repeat=await context.request.post(`${origin}/api/marketing/production/confirm`,{headers:{origin},data:{token:confirmationToken}});expect(repeat.status()).toBe(200);
   expect(sql(`SELECT count(*) FROM private.production_marketing_messages m JOIN private.production_marketing_subscribers s ON s.id=m.subscriber_id WHERE s.normalized_email=${literal(email)} AND m.purpose='welcome';`)).toBe("1");
   expect(await (await worker()).json()).toEqual({status:"accepted"});const welcome=sends.at(-1)!;expect(welcome.body.subject).toBe("Welcome to Helix");expect(welcome.body.text).toContain(contract.postalAddress);expect(welcome.key).toBeTruthy();expect(welcome.body.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
   const preferenceUrl=/https:\/\/www\.helixskin\.us\/marketing\/production\/preferences#token=[A-Za-z0-9_-]{43}/.exec(welcome.body.text)![0],token=new URL(preferenceUrl).hash.slice(7);expect(token===confirmationToken).toBe(false);expect(new URL(preferenceUrl).search).toBe("");expect(welcome.body.headers["List-Unsubscribe"]).toBe(`<${canonical}/api/marketing/production/unsubscribe?token=${token}>`);
   expect(welcome.body.to).toEqual([email]);expect(welcome.body.from).toBe(contract.from);expect(welcome.body.reply_to).toBe(contract.replyTo);expect(welcome.body.html).not.toContain("{{");
   const welcomePage=await context.newPage();await welcomePage.route(`${canonical}/brand/helix-wordmark-email.png`,route=>route.fulfill({path:new URL("../../public/brand/helix-wordmark-email.png",import.meta.url).pathname}));await welcomePage.setContent('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src https://www.helixskin.us">'+welcome.body.html);expect(await welcomePage.getByRole("img",{name:"Helix"}).evaluate(n=>(n as HTMLImageElement).complete&&(n as HTMLImageElement).naturalWidth>0)).toBe(true);expect(await welcomePage.getByRole("heading").innerText()).toBe("Welcome to Helix");expect(await welcomePage.getByRole("link",{name:"Email preferences and unsubscribe"}).getAttribute("href")).toBe(preferenceUrl);expect(await welcomePage.locator("body").innerText()).toContain(contract.postalAddress);expect(await welcomePage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await welcomePage.screenshot({path:`/private/tmp/helix-542-welcome-email-${welcomePage.viewportSize()!.width}.png`,fullPage:true});await welcomePage.close();
   expect(sql(`SELECT m.body_text=${literal(welcome.wire)} AND m.state='accepted' AND m.delivery_status='pending' FROM private.production_marketing_messages m JOIN private.production_marketing_subscribers s ON s.id=m.subscriber_id WHERE s.normalized_email=${literal(email)} AND m.purpose='welcome';`)).toBe("t");
   expect((await event(welcome,"email.delivered")).status).toBe(200);expect((await event(welcome,"email.complained")).status).toBe(200);expect((await event(welcome,"email.delivered")).status).toBe(200);
   const status=await handleProductionMarketingStatus(new Request(`${canonical}/api/internal/marketing/production/status`),{env,getUser:async()=>({id:admin}),read:events.status});const counts=await status.json();expect(Object.keys(counts).length).toBe(11);expect(counts.suppressedSubscribers).toBeGreaterThan(0);expect(counts.acceptedMessages).toBeGreaterThan(0);expect(counts.suppressedMessages).toBeGreaterThan(0);expect(JSON.stringify(counts).includes(email)).toBe(false);
   switchFixture(false);const beforeWithdraw=posts;for(const method of ["GET","HEAD"]){expect((await context.request.fetch(`${origin}/marketing/production/preferences`,{method})).status()).toBe(200);expect((await context.request.fetch(`${origin}/api/marketing/production/unsubscribe?token=${token}`,{method})).status()).toBe(405);}expect(posts).toBe(beforeWithdraw);expect(state(email)).toBe("confirmed");
   await page.goto(preferenceUrl.replace(canonical,origin));await page.waitForURL(`${origin}/marketing/production/preferences`);expect(await page.getByRole("textbox").count()).toBe(0);expect((await context.cookies()).length).toBe(0);await page.getByRole("button",{name:"Unsubscribe from marketing"}).focus();await page.keyboard.press("Enter");await page.getByRole("status").filter({hasText:"withdrawal has been recorded"}).waitFor();expect(state(email)).toBe("withdrawn");
   const oneclick=()=>context.request.post(`${origin}/api/marketing/production/unsubscribe?token=${token}`,{headers:{"content-type":"application/x-www-form-urlencoded"},data:"List-Unsubscribe=One-Click"});expect((await oneclick()).status()).toBe(200);expect((await oneclick()).status()).toBe(200);expect(state(email)).toBe("withdrawn");
   switchFixture(true);expect((await context.request.post(`${origin}/api/marketing/production/confirm`,{headers:{origin},data:{token:confirmationToken}})).status()).toBe(400);switchFixture(false);
   expect(await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length,overflow:document.documentElement.scrollWidth>innerWidth}))).toEqual({local:0,session:0,overflow:false});expect((await page.locator("body").innerText()).includes(token)).toBe(false);
   await page.screenshot({path:`/private/tmp/helix-542-withdrawn-${page.viewportSize()!.width}.png`,fullPage:true});await page.reload();await page.getByRole("alert").filter({hasText:"invalid or has expired"}).waitFor();expect(await page.getByRole("button").isDisabled()).toBe(true);await page.close();
  },{viewports:[{width:390,height:844},{width:1440,height:1000}]});
  expect(sequence).toBe(2);expect(sends.length).toBe(4);expect(serverFault).toBe(false);
 }finally{vi.unstubAllGlobals();}
},90000);
