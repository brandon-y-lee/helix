import { timingSafeEqual } from 'node:crypto';
import { runLifecycleCampaigns } from '@/lib/marketing/campaigns';
import { lifecycleCampaignDependencies } from '@/lib/marketing/campaign-storage';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=60;
const headers={'Cache-Control':'private, no-store'};
export async function POST(request:Request){
 const secret=process.env.HELIX_EMAIL_DISPATCH_SECRET;
 if(!secret||secret.length<32)return Response.json({error:'Worker unavailable.'},{status:503,headers});
 const expected=Buffer.from(`Bearer ${secret}`),supplied=Buffer.from(request.headers.get('authorization')??'');
 if(expected.length!==supplied.length||!timingSafeEqual(expected,supplied))return Response.json({error:'Unauthorized.'},{status:401,headers});
 try{return Response.json({ok:true,...await runLifecycleCampaigns(lifecycleCampaignDependencies())},{headers});}
 catch{return Response.json({error:'Campaign admission unavailable.'},{status:503,headers});}
}
