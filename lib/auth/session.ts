import { cache } from "react";
import { cookies, headers } from "next/headers";
import type { User } from "@supabase/supabase-js";
import {
  AUTH_DEGRADED_REQUEST_HEADER,
  hasSupabaseAuthCookie,
} from "@/lib/supabase/auth-cookies";
import {
  isSupabaseNetworkError,
  toSupabaseUnavailableError,
} from "@/lib/supabase/network";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type VerifiedAuthClaims = {
  sub: string;
  email?: string;
  email_confirmed_at?: string;
  [key: string]: unknown;
};

async function requestHasAuthCookie(): Promise<boolean> {
  const cookieStore = await cookies();
  return hasSupabaseAuthCookie(cookieStore.getAll());
}

const getCurrentClaims = cache(async (): Promise<VerifiedAuthClaims | null> => {
  if (!(await requestHasAuthCookie())) return null;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error) {
    if (isSupabaseNetworkError(error)) {
      throw toSupabaseUnavailableError(error, "auth.getClaims");
    }
    return null;
  }

  const claims = data?.claims;
  return claims && typeof claims.sub === "string"
    ? (claims as VerifiedAuthClaims)
    : null;
});

export const getCurrentIdentity = cache(async () => {
  const claims = await getCurrentClaims();
  if (!claims) return null;

  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
  };
});

export const getCurrentUser = cache(async (): Promise<User | null> => {
  if (!(await requestHasAuthCookie())) return null;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) {
    if (isSupabaseNetworkError(error)) {
      throw toSupabaseUnavailableError(error, "auth.getUser");
    }
    return null;
  }

  return user;
});

export const getCurrentUserForPublicPage = cache(async () => {
  const requestHeaders = await headers();
  if (requestHeaders.get(AUTH_DEGRADED_REQUEST_HEADER) === "1") return null;

  try {
    return await getCurrentUser();
  } catch (error) {
    if (isSupabaseNetworkError(error)) return null;
    throw error;
  }
});
