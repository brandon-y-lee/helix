import { NextResponse } from "next/server";
import { requireAdminCapability } from "@/lib/admin/catalog/capabilities";
import {
  assertSameOrigin,
  runCatalogRoute,
} from "@/lib/admin/catalog/request";
import { restoreCatalogRevision } from "@/lib/admin/catalog/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ revisionId: string }> };

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  return runCatalogRoute(async () => {
    assertSameOrigin(request);
    const access = await requireAdminCapability("catalog.edit");
    const { revisionId } = await context.params;
    return NextResponse.json(
      await restoreCatalogRevision(revisionId, access.userId),
      { status: 201 },
    );
  });
}
