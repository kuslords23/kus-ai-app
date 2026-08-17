import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Token-guarded read endpoint for uploaded attachments. Serves the stored
 * base64 bytes decoded to their original content type so the hub / Jyinx /
 * Gemini pipeline can pull the raw file (e.g. images) by reference.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("jyinx_attachments")
    .select("name, mime_type, data")
    .eq("token", token)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  const binary = Buffer.from(data.data, "base64");

  return new NextResponse(binary, {
    status: 200,
    headers: {
      "Content-Type": data.mime_type || "application/octet-stream",
      "Content-Length": String(binary.length),
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `inline; filename="${data.name}"`,
    },
  });
}