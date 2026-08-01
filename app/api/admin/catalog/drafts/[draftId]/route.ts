import { NextResponse } from "next/server";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import {
  assertSameOrigin,
  readCatalogJson,
  requireExpectedVersion,
  requireRequestObject,
  runCatalogRoute,
} from "@/lib/admin/catalog/request";
import { saveCatalogDraft } from "@/lib/admin/catalog/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ draftId: string }>;
};

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  return runCatalogRoute(async () => {
    assertSameOrigin(request);
    const access = await requireAdminCapability("catalog.edit");
    const body = requireRequestObject(await readCatalogJson(request));
    const { draftId } = await context.params;
    const result = await saveCatalogDraft({
      draftId,
      expectedVersion: requireExpectedVersion(body.expectedVersion),
      document: body.document,
      actorId: access.userId,
      role: access.role,
    });
    return NextResponse.json(result);
  });
}
