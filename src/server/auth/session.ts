"use strict";

/**
 * Unified Authentication & Cross-Platform Session Handler.
 *
 * Provides session parsing that recognizes shared auth tokens and cross-subdomain
 * cookies from the Sports Clan Nexus ecosystem. Enables seamless session continuity
 * between Jyinx and Nexus without re-authentication prompts.
 *
 * Architecture:
 *   - Reads Supabase auth cookies set by the primary Nexus domain.
 *   - Validates JWT tokens across subdomains via shared cookie domain config.
 *   - Exposes a `getSharedSession()` helper that both Jyinx and Nexus API routes
 *     can call to resolve the active user identity.
 */

import { createClient } from "@/lib/supabase/server";

/** Supabase project reference — used for cookie prefixing. */
const PROJECT_REF = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0]
  : "localhost";

/** Cookie name patterns Supabase uses for auth. */
const AUTH_COOKIE_PREFIX = `sb-${PROJECT_REF}-auth-token`;
const AUTH_COOKIE_PREFIX_ALT = `sb-${PROJECT_REF}-auth-token-code-verifier`;

export interface SharedSession {
  userId: string;
  email?: string;
  provider?: string;
  providerToken?: string;
  expiresAt?: number;
  isCrossDomain: boolean;
}

/**
 * Attempts to resolve a shared session from cookies, headers, or
 * direct Supabase client call.
 *
 *   - Primary: standard Supabase `getUser()` (server-side cookie reads).
 *   - Fallback: manual cookie parsing for cross-domain scenarios where
 *     the Nexus domain sets domain-scoped cookies readable by Jyinx.
 */
export async function getSharedSession(): Promise<SharedSession | null> {
  try {
    const client = await createClient();
    const { data, error } = await client.auth.getUser();

    if (error || !data?.user) {
      // Attempt cross-domain cookie parsing as fallback.
      const fallback = await parseCrossDomainCookies();
      if (fallback) {
        // Validate the token from cross-domain cookie.
        const { data: crossData } = await client.auth.getUser(
          fallback.accessToken
        );
        if (crossData?.user) {
          return {
            userId: crossData.user.id,
            email: crossData.user.email,
            provider: crossData.user.app_metadata?.provider as string | undefined,
            providerToken: crossData.user.user_metadata?.provider_token as string | undefined,
            expiresAt: fallback.expiresAt,
            isCrossDomain: true,
          };
        }
      }
      return null;
    }

    return {
      userId: data.user.id,
      email: data.user.email,
      provider: data.user.app_metadata?.provider as string | undefined,
      providerToken: data.user.user_metadata?.provider_token as string | undefined,
      expiresAt: undefined,
      isCrossDomain: false,
    };
  } catch {
    return null;
  }
}

/**
 * Manually inspects request cookies for Supabase auth tokens scoped
 * to a shared parent domain (sportsclannexus.com → *.sportsclannexus.com).
 *
 * This handles the case where the Nexus app sets `.sportsclannexus.com`
 * cookies and Jyinx (on a subdomain like jyinx.sportsclannexus.com) needs
 * to read them.
 */
async function parseCrossDomainCookies(): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
} | null> {
  try {
    // Use Next.js `cookies()` to read all cookies.
    const { cookies } = await import("next/headers");
    const jar = await cookies();

    // Supabase stores auth as two cookies: one for the access token,
    // one for the code verifier. We look for both patterns.
    const tokenCookie = jar.get(AUTH_COOKIE_PREFIX);

    if (!tokenCookie?.value) return null;

    // The value is a JSON array: [accessToken, refreshToken, expiresAt, ...].
    const parsed = safeParseJson(tokenCookie.value);
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "string") {
      return {
        accessToken: parsed[0],
        refreshToken: typeof parsed[1] === "string" ? parsed[1] : undefined,
        expiresAt: typeof parsed[2] === "number" ? parsed[2] : undefined,
      };
    }

    return null;
  } catch {
    return null;
  }
}

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Builds the shared auth cookie configuration that should be set in
 * the primary Nexus app's Supabase client init:
 *
 *   auth: {
 *     cookieOptions: {
 *       domain: ".sportsclannexus.com",   // shared parent domain
 *       sameSite: "lax",
 *       secure: true,
 *       path: "/",
 *     },
 *   }
 *
 * This ensures Jyinx (and any subdomain) can read the session cookie.
 */
export function getSharedCookieConfig(baseDomain: string): {
  domain: string;
  sameSite: "lax";
  secure: boolean;
  path: string;
} {
  return {
    domain: `.${baseDomain.replace(/^\./, "")}`,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}

/**
 * Utility: derive a display name from a session for UI purposes.
 */
export function displayNameFromSession(session: SharedSession): string {
  return session.email?.split("@")[0] ?? `User-${session.userId.slice(0, 8)}`;
}