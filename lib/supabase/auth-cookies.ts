export type NamedCookie = {
  name: string;
  value?: string;
};

export const AUTH_DEGRADED_REQUEST_HEADER = "x-mei-pelle-auth-degraded";

const SUPABASE_AUTH_COOKIE = /^sb-[a-z0-9]+-auth-token(?:\.\d+)?$/i;

export function isSupabaseAuthCookieName(name: string): boolean {
  return SUPABASE_AUTH_COOKIE.test(name);
}

export function hasSupabaseAuthCookie(
  cookies: readonly NamedCookie[],
): boolean {
  return cookies.some(
    (cookie) =>
      isSupabaseAuthCookieName(cookie.name) &&
      (cookie.value === undefined || cookie.value.length > 0),
  );
}
