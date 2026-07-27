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

    // Try with department_id; fall back without if column missing
    let chunkErr = (
      await supabase.from("knowledge_chunks").upsert(
        {
          content: packet.content,
          content_hash: contentHash,
          department_id: packet.departmentId,
          domain: packet.domain,
          verification_status: "verified",
          confidence: 0.92,
          token_count: Math.ceil(packet.content.length / 4),
          source_url: `kingdom-starter://${packet.departmentId}/${packet.question.slice(0, 40)}`,
        },
        { onConflict: "content_hash", ignoreDuplicates: false }
      )
    ).error;

    if (chunkErr && /department_id|schema cache|column/i.test(chunkErr.message)) {
      chunkErr = (
        await supabase.from("knowledge_chunks").upsert(
          {
            content: packet.content,
            content_hash: contentHash,
            domain: packet.domain,
            verification_status: "verified",
            confidence: 0.92,
            token_count: Math.ceil(packet.content.length / 4),
            source_url: `kingdom-starter://${packet.departmentId}`,
          },
          { onConflict: "content_hash", ignoreDuplicates: false }
        )
      ).error;
    }

    if (chunkErr) errors.push(`chunk ${packet.departmentId}: ${chunkErr.message}`);
    else chunks++;

    let qaErr = (
      await supabase.from("golden_qa_pairs").insert({
        question: packet.question,
        answer: packet.answer,
        department_id: packet.departmentId,
        domain: packet.domain,
        style_tags: ["starter", "verified"],
        verification_status: "verified",
        confidence: 0.92,
      })
    ).error;

    if (qaErr && /department_id|schema cache|column/i.test(qaErr.message)) {
      qaErr = (
        await supabase.from("golden_qa_pairs").insert({
          question: packet.question,
          answer: packet.answer,
          domain: packet.domain,
          style_tags: ["starter", "verified"],
          verification_status: "verified",
          confidence: 0.92,
        })
      ).error;
    }

    if (qaErr) {
      if (!/duplicate/i.test(qaErr.message)) {
        errors.push(`qa ${packet.question}: ${qaErr.message}`);
      }
    } else {
      qa++;
    }
  }

  const ok = chunks > 0 || qa > 0;
  const body = {
    ok,
    chunksUpserted: chunks,
    goldenQaInserted: qa,
    packets: STARTER_PACKETS.length,
    errors,
    message: ok
      ? "Starter knowledge loaded (including MoMo in Ghana). Ask Royal again."
      : "Nothing saved — run the SQL fix in Supabase, then open this link again.",
  };

  const wantsHtml = request.nextUrl.searchParams.get("format") !== "json";
  if (!wantsHtml) return NextResponse.json(body);

  const errHtml = errors.length
    ? `<pre style="white-space:pre-wrap;color:#fca5a5;background:#1e1030;padding:12px;border-radius:8px">${errors
        .slice(0, 8)
        .map((e) => e.replace(/</g, "&lt;"))
        .join("\n")}</pre>`
    : "";

  return new NextResponse(
    `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Bootstrap</title>
<style>body{font-family:system-ui;background:#0b1220;color:#e8eefc;padding:24px;line-height:1.5}.ok{color:#4ade80}.bad{color:#fca5a5}</style>
</head><body>
<p class="${ok ? "ok" : "bad"}">${ok ? "✓" : "✗"} ${body.message}</p>
<p>${body.chunksUpserted} knowledge packets · ${body.goldenQaInserted} Q&A pairs</p>
${errHtml}
<p>If 0 packets: in Supabase SQL Editor run the column-fix SQL, then reopen this link.</p>
</body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;
