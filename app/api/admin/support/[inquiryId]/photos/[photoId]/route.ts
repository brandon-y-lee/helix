import { handleSupportPhotoAccessRequest } from "@/lib/support/photo-access";
import { photoStorage } from "@/lib/support/photo-storage";
import { requireSupportAccess } from "@/lib/support/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
type Context = { params: Promise<{ inquiryId: string; photoId: string }> };
async function handle(request: Request, context: Context) {
  const { inquiryId, photoId } = await context.params;
  return handleSupportPhotoAccessRequest(request, inquiryId, photoId, { env: process.env, now: Date.now,
    requireAccess: requireSupportAccess, getPhoto: photoStorage.getPhoto, readClean: photoStorage.readClean });
}
export async function POST(request: Request, context: Context) { return handle(request, context); }
export async function GET(request: Request, context: Context) { return handle(request, context); }
