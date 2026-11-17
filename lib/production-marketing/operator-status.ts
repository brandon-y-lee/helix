import "server-only";
import { getCurrentUser } from "@/lib/auth/session";
import { readProductionMarketingConfiguration } from "./config";
import { productionMarketingUuid } from "./delivery-config";
import type { ProductionMarketingEnvironment } from "./contract";
import { parseProductionMarketingStatus } from "./status-contract";
const headers={"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff","Vary":"Cookie"};
const failure=(status:number)=>Response.json({ok:false},{status,headers});
export async function handleProductionMarketingStatus(request:Request,deps:{env:ProductionMarketingEnvironment;getUser?:()=>Promise<{id:string}|null>;read:(actor:string)=>Promise<unknown>}) {
  if(request.method!=="GET")return failure(405);
  try {
    const config=readProductionMarketingConfiguration(deps.env),url=new URL(request.url);
    if(deps.env.HELIX_PRODUCTION_MARKETING_STATUS_ENABLED!=="true"||deps.env.NEXT_PUBLIC_SUPABASE_URL!==config.supabaseUrl)throw new Error();
    if(url.origin!==config.siteOrigin)return failure(403);
    if(url.search)return failure(400);
    // Project binding above precedes cookie/JWT verification. Never consume user_metadata roles.
    const user=await (deps.getUser??getCurrentUser)();
    if(!user||user.id.length!==36||!productionMarketingUuid.test(user.id))return failure(401);
    const status=parseProductionMarketingStatus(await deps.read(user.id));
    return status?Response.json(status,{headers}):failure(403);
  }catch{return failure(503);}
}
