import { NextResponse } from "next/server";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import {
  assertSameOrigin,
  readCatalogJson,
  requireExpectedVersion,
  requireRequestObject,
  runCatalogRoute,
} from "@/lib/admin/catalog/request";
import { publishCatalogDraft } from "@/lib/admin/catalog/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ draftId: string }> };

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  return runCatalogRoute(async () => {
    assertSameOrigin(request);
    const access = await requireAdminCapability("catalog.publish");
    const body = requireRequestObject(await readCatalogJson(request));
    const { draftId } = await context.params;
    return NextResponse.json(
      await publishCatalogDraft({
        draftId,
        expectedVersion: requireExpectedVersion(body.expectedVersion),
        actorId: access.userId,
        role: access.role,
      }),
    );
  });
}
