import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 12 * 1024 * 1024; // 12 MB (server tolerance above client 10MB/file)
const MAX_DATA_STRING = 16 * 1024 * 1024; // base64 overhead guard

type Incoming = {
  name?: unknown;
  mimeType?: unknown;
  kind?: unknown;
  /** base64 data (no data: prefix) OR a full data: URL */
  data?: unknown;
};

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Server-side file ingest. Stores attachment bytes and returns a fetchable
 * reference (token + url) so Royal's chat thread and the hub/Jyinx pipeline
 * can retrieve the raw bytes rather than only filenames.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Incoming | null;

  const name =
    typeof body?.name === "string" ? body.name.slice(0, 255) : "attachment";
  const mimeType =
    typeof body?.mimeType === "string" && body.mimeType
      ? body.mimeType.slice(0, 120)
      : "application/octet-stream";
  const rawKind = typeof body?.kind === "string" ? body.kind : "file";
  const kind = ["image", "file", "video"].includes(rawKind)
    ? (rawKind as "image" | "file" | "video")
    : "file";
  const data = typeof body?.data === "string" ? body.data : "";

  if (!data) {
    return NextResponse.json({ error: "No file data provided." }, { status: 400 });
  }
  if (data.length > MAX_DATA_STRING) {
    return NextResponse.json(
      { error: "File exceeds the maximum upload size." },
      { status: 413 }
    );
  }

  // Strip a `data:` prefix if the client sent a full data URL.
  const comma = data.indexOf(",");
  const base64 = comma >= 0 && /^data:/i.test(data.slice(0, 14)) ? data.slice(comma + 1) : data;

  // Approximate decoded byte size and enforce the per-file limit.
  const decodedBytes = Math.floor(base64.length * 0.75);

  const token = randomToken();
  const origin = request.nextUrl.origin;

  // Resolve the user id when a session exists (best-effort).
  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;

    const { error } = await supabase.from("jyinx_attachments").insert({
      token,
      name,
      mime_type: mimeType,
      size: decodedBytes,
      kind,
      data: base64,
      user_id: userId,
    });
    if (error) {
      return NextResponse.json(
        { error: `Failed to store attachment: ${error.message}` },
        { status: 502 }
      );
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Storage backend unreachable";
    return NextResponse.json(
      { error: `Failed to store attachment: ${message}` },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    id: token,
    token,
    url: `${origin}/api/kusai/files/${token}`,
    name,
    mimeType,
    kind,
    size: decodedBytes,
  });
}