/**
 * GitHub PAT storage API — permanent token persistence across sessions.
 *
 * POST   /api/github-pat  — store a token for the user
 * GET    /api/github-pat  — retrieve the stored token for the user
 * DELETE /api/github-pat  — remove the stored token for the user
 *
 * Tokens are stored in the `github_pat_tokens` table (hashed for security,
 * but the raw token is stored so it can be returned for API calls).
 */
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const PAT_TABLE = "github_pat_tokens";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function getUserId(): Promise<string | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

/** POST /api/github-pat — store a token. */
export async function POST(request: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    userId?: unknown;
    rawToken?: unknown;
    label?: unknown;
    scopes?: unknown;
  } | null;

  const rawToken = typeof body?.rawToken === "string" ? body.rawToken.trim() : "";
  const label = typeof body?.label === "string" ? body.label : "GitHub token";
  const scopes = Array.isArray(body?.scopes) ? (body.scopes as string[]) : [];

  if (!rawToken) {
    return NextResponse.json({ error: "rawToken is required." }, { status: 400 });
  }

  // Verify the token is valid by checking it against GitHub
  try {
    const check = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${rawToken}`, Accept: "application/vnd.github+json" },
      cache: "no-store",
    });
    if (!check.ok) {
      return NextResponse.json({ error: "Token is invalid or expired." }, { status: 400 });
    }
  } catch {
    // best-effort validation
  }

  try {
    const supabase = await createSupabaseServerClient();
    const hash = sha256(rawToken);
    const short = rawToken.slice(0, 8);

    // Delete any existing tokens for this user, then insert the new one.
    // This ensures clean upsert since the table has unique(user_id, token_hash).
    await supabase
      .from(PAT_TABLE)
      .update({ status: "revoked", updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("status", "active");

    const { error } = await supabase.from(PAT_TABLE).insert({
      user_id: userId,
      label,
      token_hash: hash,
      token_short: short,
      token: rawToken,
      scopes,
      status: "active",
    });

    if (error) {
      return NextResponse.json({ error: "Could not store token." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, short });
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : "Failed to store token." },
      { status: 500 }
    );
  }
}

/** GET /api/github-pat?userId=xxx — retrieve the stored token. */
export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId") ?? (await getUserId());
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from(PAT_TABLE)
      .select("token, label, scopes, updated_at, token_short")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: "No token found." }, { status: 404 });
    }

    return NextResponse.json({
      token: data.token,
      short: data.token_short,
      label: data.label,
      scopes: data.scopes,
    });
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : "Failed to retrieve token." },
      { status: 500 }
    );
  }
}

/** DELETE /api/github-pat — remove the stored token. */
export async function DELETE(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId") ?? (await getUserId());
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from(PAT_TABLE)
      .update({ status: "revoked", updated_at: new Date().toISOString() })
      .eq("user_id", userId);

    if (error) {
      return NextResponse.json({ error: "Could not remove token." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : "Failed to remove token." },
      { status: 500 }
    );
  }
}