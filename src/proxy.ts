import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

/**
 * Next.js 16 Proxy (formerly Middleware).
 *
 * The `middleware.ts` file convention is deprecated in Next.js 16 and has been
 * renamed to `proxy.ts`. The exported function must be named `proxy` (or a
 * default export). This runs on the Node.js runtime before routes render.
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};