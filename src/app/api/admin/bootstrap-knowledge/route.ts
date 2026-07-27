import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { STARTER_PACKETS } from "@/lib/kingdom/starterKnowledge";

/**
 * Phone-friendly bootstrap of starter Kingdom knowledge (MoMo, SEO, etc.)
 *
 *   https://kus-ai-app.vercel.app/api/admin/bootstrap-knowledge?secret=CRON_SECRET
 */
async function hashText(text: string): Promise<string> {
  const data = new TextEncoder().encode(text.slice(0, 4000));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function checkSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  return request.nextUrl.searchParams.get("secret") === secret;
}

export async function GET(request: NextRequest) {
  if (!checkSecret(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json(
      { ok: false, error: "Missing Supabase service role on Vercel" },
      { status: 503 }
    );
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  let chunks = 0;
  let qa = 0;
  const errors: string[] = [];

  for (const packet of STARTER_PACKETS) {
    const contentHash = await hashText(packet.content);
    const { error: chunkErr } = await supabase.from("knowledge_chunks").upsert(
      {
        content: packet.content,
        content_hash: contentHash,
        department_id: packet.departmentId,
        domain: packet.domain,
        verification_status: "verified",
        confidence: 0.92,
        token_count: Math.ceil(packet.content.length / 4),
        source_url: `kingdom-starter://${packet.departmentId}`,
      },
      { onConflict: "content_hash", ignoreDuplicates: false }
    );
    if (chunkErr) errors.push(`chunk:${chunkErr.message}`);
    else chunks++;

    const { error: qaErr } = await supabase.from("golden_qa_pairs").insert({
      question: packet.question,
      answer: packet.answer,
      department_id: packet.departmentId,
      domain: packet.domain,
      style_tags: ["starter", "verified"],
      verification_status: "verified",
      confidence: 0.92,
    });
    if (qaErr) {
      // Ignore duplicate-ish failures; keep going
      if (!qaErr.message.toLowerCase().includes("duplicate")) {
        errors.push(`qa:${qaErr.message}`);
      }
    } else {
      qa++;
    }
  }

  const body = {
    ok: errors.length === 0,
    chunksUpserted: chunks,
    goldenQaInserted: qa,
    packets: STARTER_PACKETS.length,
    errors,
    message:
      "Starter knowledge loaded (including MoMo in Ghana). Ask Royal again.",
  };

  const wantsHtml = request.nextUrl.searchParams.get("format") !== "json";
  if (!wantsHtml) return NextResponse.json(body);

  return new NextResponse(
    `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Bootstrap done</title>
<style>body{font-family:system-ui;background:#0b1220;color:#e8eefc;padding:24px;line-height:1.5}.ok{color:#4ade80}</style>
</head><body>
<p class="ok">✓ ${body.message}</p>
<p>${body.chunksUpserted} knowledge packets · ${body.goldenQaInserted} Q&A pairs</p>
<p>Go back to Royal and ask: <strong>Explain MoMo in Ghana</strong></p>
</body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;
