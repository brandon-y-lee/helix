import { NextResponse } from "next/server";
import { requireAdminCapability } from "@/lib/admin/catalog/capabilities";
import { runCatalogRoute } from "@/lib/admin/catalog/request";
import { listCatalogRevisions } from "@/lib/admin/catalog/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ draftId: string }> };

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  return runCatalogRoute(async () => {
    await requireAdminCapability("catalog.read");
    const { draftId } = await context.params;
    return NextResponse.json({ items: await listCatalogRevisions(draftId) });
  });
}
