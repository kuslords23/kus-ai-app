/**
 * SERVER-ONLY Supabase client.
 *
 * This module uses `next/headers` (`cookies()`) and MUST only be imported
 * from Server Components, Route Handlers, and Server Actions. Importing it
 * from a Client Component (or anything in the client bundle) fails the
 * Turbopack/Next.js build with "next/headers is not supported in Client
 * Components".
 *
 * The guard below is the dependency-free equivalent of the `server-only`
 * package: if a client bundle ever evaluates this module, it throws a clear
 * error instead of silently shipping `next/headers` to the browser.
 *
 * Client components should use `@/lib/supabase/client` instead.
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Dependency-free server-only guard (mirrors the `server-only` package).
if (typeof window !== "undefined") {
  throw new Error(
    "src/lib/supabase/server.ts is server-only — do not import it from Client Components. Use src/lib/supabase/client.ts instead."
  );
}

export async function createClient() {
  // `next/headers` `cookies()` is async in Next.js 15+ — must be awaited.
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        // @supabase/ssr 0.12+ uses getAll/setAll (not the deprecated get/set).
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — safe to ignore.
          }
        },
      },
    }
  );
}