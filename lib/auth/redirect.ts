const DEFAULT_RETURN_TO = "/account";

export function safeReturnTo(value: FormDataEntryValue | string | null | undefined): string {
  if (typeof value !== "string" || value.length === 0) return DEFAULT_RETURN_TO;

  try {
    const decoded = decodeURIComponent(value);
    if (!decoded.startsWith("/") || decoded.startsWith("//")) return DEFAULT_RETURN_TO;
    if (decoded.includes("\\") || decoded.includes("\n") || decoded.includes("\r")) {
      return DEFAULT_RETURN_TO;
    }
    return decoded;
  } catch {
    return DEFAULT_RETURN_TO;
  }
}

export function authRedirectParam(pathname: string): string {
  return `/account/sign-in?next=${encodeURIComponent(safeReturnTo(pathname))}`;
}
