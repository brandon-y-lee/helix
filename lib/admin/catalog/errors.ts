export class CatalogAdminError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "CatalogAdminError";
  }
}

export function catalogErrorStatus(code: string): number {
  if (
    [
      "active_draft_exists",
      "draft_closed",
      "revision_conflict",
      "version_conflict",
    ].includes(code)
  ) {
    return 409;
  }
  if (code === "draft_not_ready" || code === "validation_failed") return 422;
  return 400;
}
