import { lifecyclePopupReady } from '@/lib/marketing/campaign-storage';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=30;
export async function GET(){return Response.json({ready:await lifecyclePopupReady()},{headers:{'Cache-Control':'private, no-store'}});}
