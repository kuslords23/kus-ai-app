import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/legal/delete-account
 *
 * Self-service account deletion endpoint.
 * Purges user data: auth account, chat history, code vault files, connector credentials, token ledger.
 * Requires active session authentication.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const { confirmation } = (body ?? {}) as { confirmation?: string };

    if (confirmation !== "DELETE_MY_ACCOUNT") {
      return NextResponse.json(
        { error: 'Must send confirmation: "DELETE_MY_ACCOUNT"' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!supabaseUrl || !supabaseKey) {
      console.error("[delete-account] Missing Supabase env vars");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const adminClient = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const accessToken = req.cookies.get("sb-access-token")?.value
      ?? req.cookies.get("supabase-auth-token")?.value;

    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data: { user }, error: userError } = await adminClient.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const userId = user.id;
    console.log(`[delete-account] Processing deletion for user ${userId}`);

    const results: string[] = [];

    // 1. Delete Supabase storage files (code vault)
    try {
      const { data: files } = await adminClient.storage.from("code-vault").list(userId);
      if (files && files.length > 0) {
        const paths = files.map((f) => `${userId}/${f.name}`);
        await adminClient.storage.from("code-vault").remove(paths);
        results.push("code-vault files purged");
      }
    } catch (e) {
      results.push(`code-vault cleanup: ${(e as Error).message}`);
    }

    // 2. Delete chat history
    try {
      await adminClient.from("jyinx_chat_messages").delete().eq("user_id", userId);
      await adminClient.from("royal_chat_messages").delete().eq("user_id", userId);
      results.push("chat history purged");
    } catch (e) {
      results.push(`chat history cleanup: ${(e as Error).message}`);
    }

    // 3. Delete connector credentials
    try {
      await adminClient.from("connector_credentials").delete().eq("user_id", userId);
      results.push("connector credentials purged");
    } catch (e) {
      results.push(`connector credentials cleanup: ${(e as Error).message}`);
    }

    // 4. Delete token ledger
    try {
      await adminClient.from("token_ledger").delete().eq("user_id", userId);
      results.push("token ledger purged");
    } catch (e) {
      results.push(`token ledger cleanup: ${(e as Error).message}`);
    }

    // 5. Delete usage logs, cache, reports
    try {
      await adminClient.from("ai_usage_logs").delete().eq("user_id", userId);
      await adminClient.from("ai_cache").delete().eq("user_id", userId);
      await adminClient.from("content_reports").delete().eq("user_id", userId);
      results.push("usage logs, cache, reports purged");
    } catch (e) {
      results.push(`usage data cleanup: ${(e as Error).message}`);
    }

    // 6. Delete the auth user
    try {
      const { error: deleteErr } = await adminClient.auth.admin.deleteUser(userId);
      if (deleteErr) throw deleteErr;
      results.push("auth account deleted");
    } catch (e) {
      results.push(`auth deletion: ${(e as Error).message}`);
    }

    console.log(`[delete-account] Deletion complete for ${userId}:`, results);

    const response = NextResponse.json({
      ok: true,
      message: "Account and all associated data have been permanently deleted",
      details: results,
    });

    response.cookies.set("sb-access-token", "", { maxAge: 0, path: "/" });
    response.cookies.set("supabase-auth-token", "", { maxAge: 0, path: "/" });

    return response;
  } catch (err) {
    console.error("[delete-account] Fatal error:", err);
    return NextResponse.json({ error: "Internal server error during deletion" }, { status: 500 });
  }
}