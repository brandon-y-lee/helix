import "server-only";
import { assertSupportOrigin, readSupportJson, SupportError, supportFailure, supportResponse, supportText, supportUuid } from "@/lib/support/request";
import { getSupportInquiryForActor, listSupportInquiriesForActor, mutateSupportInquiryForActor, requireSupportAccess } from "@/lib/support/service";
import { parseSupportInboxQuery, SupportPaginationError, type SupportInboxQuery } from "@/lib/support/pagination";
import type { SupportMutation } from "@/lib/support/types";

export type SupportAdminDependencies = {
  requireAccess(capability: "support.read" | "support.reply"): Promise<{ userId: string }>;
  list(actorId: string, query: SupportInboxQuery): Promise<unknown>;
  get(actorId: string, id: string, before?: string): Promise<unknown>;
  mutate(actorId: string, id: string, mutation: SupportMutation): Promise<unknown>;
};
const defaultDependencies: SupportAdminDependencies = { requireAccess: requireSupportAccess,
  list: listSupportInquiriesForActor, get: getSupportInquiryForActor, mutate: mutateSupportInquiryForActor };

function version(value: unknown, minimum = 1): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > 2_147_483_646) throw new SupportError("invalid_support_input");
  return value;
}

function mutation(body: Record<string, unknown>): SupportMutation {
  const expectedRevision = version(body.expectedRevision);
  let result: SupportMutation;
  switch (body.action) {
    case "save_draft": result = { action: body.action, expectedRevision, expectedDraftVersion: version(body.expectedDraftVersion, 0),
      subject: supportText(body.subject, 200), body: supportText(body.body, 10_000, true) }; break;
    case "approve_reply": result = { action: body.action, expectedRevision, draftVersion: version(body.draftVersion) }; break;
    case "add_note": result = { action: body.action, expectedRevision, body: supportText(body.body, 10_000, true) }; break;
    case "set_status":
      if (body.status !== "open" && body.status !== "closed") throw new SupportError("invalid_support_input");
      result = { action: body.action, expectedRevision, status: body.status }; break;
    default: throw new SupportError("invalid_support_input");
  }
  if (Object.keys(body).some((key) => !Object.hasOwn(result, key))) throw new SupportError("invalid_support_input");
  return result;
}

export async function handleSupportAdminRequest(request: Request, id?: string, dependencies: SupportAdminDependencies = defaultDependencies): Promise<Response> {
  try {
    const access = await dependencies.requireAccess(request.method === "GET" ? "support.read" : "support.reply");
    if (request.method === "GET") {
      if (id) {
        const before = new URL(request.url).searchParams.get("before");
        const inquiry = await dependencies.get(access.userId, supportUuid(id), before === null ? undefined : supportUuid(before));
        if (!inquiry) throw new SupportError("not_found");
        return supportResponse({ inquiry });
      }
      const query = new URL(request.url).searchParams;
      const value = (key: string) => {
        const values = query.getAll(key);
        return values.length > 1 ? values : values[0];
      };
      return supportResponse(await dependencies.list(access.userId, parseSupportInboxQuery({
        status: value("status"), before: value("before"), after: value("after"), page: value("page"),
      })));
    }
    assertSupportOrigin(request);
    if (request.method !== "POST" || !id) throw new SupportError("invalid_support_input");
    return supportResponse({ inquiry: await dependencies.mutate(access.userId, supportUuid(id), mutation(await readSupportJson(request))) });
  } catch (error) { return supportFailure(error instanceof SupportPaginationError ? new SupportError("invalid_support_input") : error); }
}
