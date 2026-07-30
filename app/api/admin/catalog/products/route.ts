import { NextResponse } from "next/server";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import { runCatalogRoute } from "@/lib/admin/catalog/request";
import { listCatalogProducts } from "@/lib/admin/catalog/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  return runCatalogRoute(async () => {
    await requireAdminCapability("catalog.read");
    return NextResponse.json(
      await listCatalogProducts(new URL(request.url)),
    );
  });
}
