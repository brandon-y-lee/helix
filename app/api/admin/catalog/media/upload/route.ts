import { NextResponse } from "next/server";
import { CatalogAdminError } from "@/lib/admin/catalog/errors";
import { requireAdminCapability } from "@/lib/admin/catalog/capabilities";
import { stageCatalogMedia } from "@/lib/admin/catalog/media";
import {
  assertMediaRequestSize,
  assertSameOrigin,
  runCatalogRoute,
} from "@/lib/admin/catalog/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request): Promise<NextResponse> {
  return runCatalogRoute(async () => {
    assertSameOrigin(request);
    assertMediaRequestSize(request);
    const access = await requireAdminCapability("catalog.edit");
    if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) {
      throw new CatalogAdminError(
        "invalid_content_type",
        "Media uploads must use multipart/form-data.",
        415,
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    const productId = form.get("productId");
    const role = form.get("role");
    const sortOrder = Number(form.get("sortOrder"));
    const alt = form.get("alt");
    const variantValue = form.get("variantId");
    if (
      !(file instanceof File) ||
      typeof productId !== "string" ||
      typeof role !== "string" ||
      typeof alt !== "string"
    ) {
      throw new CatalogAdminError(
        "invalid_media_upload",
        "file, productId, role, sortOrder, and alt are required.",
        400,
      );
    }

    const media = await stageCatalogMedia({
      file,
      productId,
      role,
      sortOrder,
      alt,
      variantId:
        typeof variantValue === "string" && variantValue ? variantValue : null,
      actorId: access.userId,
    });
    return NextResponse.json({ media }, { status: 201 });
  });
}
