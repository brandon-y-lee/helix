import { observeProduction, serveReleaseStatus } from "@/lib/release-observations/status";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  return serveReleaseStatus(request, process.env, observeProduction);
}
