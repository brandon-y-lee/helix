import { readPublicSupabaseConnection } from "./project-safety";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createSupabaseFetch } from "@/lib/supabase/network";


export async function createSupabaseServerClient() {
  const { url, key } = readPublicSupabaseConnection();
  const cookieStore = await cookies();

  return createServerClient(
    url,
    key,
    {
      global: {
        fetch: createSupabaseFetch(),
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components cannot set cookies. Server Actions, Route
            // Handlers, and Middleware can; read-only callers still work.
          }
        },
      },
    },
  );
}
