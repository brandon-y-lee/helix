import { NextResponse } from "next/server";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import { runCatalogRoute } from "@/lib/admin/catalog/request";
import { getCatalogEditor } from "@/lib/admin/catalog/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ productId: string }>;
};

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  return runCatalogRoute(async () => {
    const access = await requireAdminCapability("catalog.read");
    const { productId } = await context.params;
    return NextResponse.json(await getCatalogEditor(productId, access));
  });
}
