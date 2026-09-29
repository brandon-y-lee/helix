import { handleSupportPhotoRequest, supportPhotoSourceHash } from "@/lib/support/photo-request";
import { photoStorage } from "@/lib/support/photo-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function POST(request: Request) {
  return handleSupportPhotoRequest(request, { env: process.env, now: Date.now,
    sourceHash: (value) => supportPhotoSourceHash(value, process.env),
    reserveUpload: photoStorage.reserveUpload, createUploadUrl: photoStorage.createUploadUrl,
    completeUpload: photoStorage.completeUpload, readUploads: photoStorage.readUploads });
}
