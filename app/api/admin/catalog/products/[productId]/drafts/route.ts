import { NextResponse } from "next/server";
import { requireAdminCapability } from "@/lib/admin/catalog/capabilities";
import {
  assertSameOrigin,
  runCatalogRoute,
} from "@/lib/admin/catalog/request";
import { createCatalogDraft } from "@/lib/admin/catalog/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ productId: string }>;
};

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  return runCatalogRoute(async () => {
    assertSameOrigin(request);
    const access = await requireAdminCapability("catalog.edit");
    const { productId } = await context.params;
    const result = await createCatalogDraft(productId, access.userId);
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  });
}
