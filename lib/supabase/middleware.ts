import {
  createServerClient,
  type CookieOptions,
} from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  AUTH_DEGRADED_REQUEST_HEADER,
  hasSupabaseAuthCookie,
} from "@/lib/supabase/auth-cookies";
import {
  createSupabaseFetch,
  isSupabaseNetworkError,
  logSupabaseUnavailable,
} from "@/lib/supabase/network";
import { ADMIN_ROUTE_REQUEST_HEADER } from "@/lib/admin/routes";

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

type CookieAdapter = {
  getAll: () => ReturnType<NextRequest["cookies"]["getAll"]>;
  setAll: (
    cookies: CookieToSet[],
    headers: Record<string, string>,
  ) => void;
};

type SessionClient = {
  auth: {
    getClaims: () => Promise<{ error: unknown }>;
  };
};

type MiddlewareDependencies = {
  createClient?: (cookies: CookieAdapter) => SessionClient;
  now?: () => number;
};

function forwardedRequestHeaders(request: NextRequest) {
  const headers = new Headers(request.headers);
  if (
    request.nextUrl.pathname === "/admin" ||
    request.nextUrl.pathname.startsWith("/admin/")
  ) {
    headers.set(
      ADMIN_ROUTE_REQUEST_HEADER,
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
  } else {
    headers.delete(ADMIN_ROUTE_REQUEST_HEADER);
  }
  return headers;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required Supabase env var: ${name}`);
  return value;
}

function isProtectedAccountRoute(pathname: string): boolean {
  return pathname === "/account";
}

function requestId(request: NextRequest): string {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}

function createDefaultClient(cookies: CookieAdapter): SessionClient {
  return createServerClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      global: {
        fetch: createSupabaseFetch(),
      },
      cookies,
    },
  );
}

function publicDegradedResponse(request: NextRequest) {
  const requestHeaders = forwardedRequestHeaders(request);
  requestHeaders.set(AUTH_DEGRADED_REQUEST_HEADER, "1");
  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

function nextResponse(request: NextRequest) {
  return NextResponse.next({
    request: {
      headers: forwardedRequestHeaders(request),
    },
  });
}

function protectedUnavailableResponse(request: NextRequest) {
  const unavailableUrl = request.nextUrl.clone();
  unavailableUrl.pathname = "/account/service-unavailable";
  unavailableUrl.search = "";
  unavailableUrl.searchParams.set("next", request.nextUrl.pathname);

  return NextResponse.rewrite(unavailableUrl, {
    status: 503,
    headers: {
      "Cache-Control": "private, no-store",
      "Retry-After": "5",
    },
  });
}

export async function updateSupabaseSession(
  request: NextRequest,
  dependencies: MiddlewareDependencies = {},
) {
  const pathname = request.nextUrl.pathname;
  if (pathname === "/account/service-unavailable") {
    return nextResponse(request);
  }

  const requestCookies = request.cookies.getAll();
  if (!hasSupabaseAuthCookie(requestCookies)) {
    return nextResponse(request);
  }

  const pendingCookies: CookieToSet[] = [];
  const pendingHeaders = new Headers();
  const cookieAdapter: CookieAdapter = {
    getAll() {
      return request.cookies.getAll();
    },
    setAll(cookies, headers) {
      pendingCookies.push(...cookies);
      Object.entries(headers).forEach(([name, value]) => {
        pendingHeaders.set(name, value);
      });
    },
  };
  const createClient = dependencies.createClient ?? createDefaultClient;
  const supabase = createClient(cookieAdapter);
  const now = dependencies.now ?? Date.now;
  const startedAt = now();

  let authError: unknown;
  try {
    ({ error: authError } = await supabase.auth.getClaims());
  } catch (error) {
    authError = error;
  }

  if (authError && isSupabaseNetworkError(authError)) {
    logSupabaseUnavailable(authError, {
      operation: "auth.getClaims",
      route: pathname,
      runtime: "middleware",
      requestId: requestId(request),
      elapsedMs: now() - startedAt,
    });
    return isProtectedAccountRoute(pathname)
      ? protectedUnavailableResponse(request)
      : publicDegradedResponse(request);
  }

  let response = nextResponse(request);
  if (pendingCookies.length > 0) {
    pendingCookies.forEach(({ name, value }) => {
      request.cookies.set(name, value);
    });
    response = nextResponse(request);
    pendingCookies.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options);
    });
  }
  pendingHeaders.forEach((value, name) => {
    response.headers.set(name, value);
  });

  return response;
}
