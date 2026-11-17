import { deployedPhotoWorker } from "@/lib/support/production/runtime";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const POST = deployedPhotoWorker;
