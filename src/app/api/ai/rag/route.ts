import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decodeTextFromBase64 } from "@/utils/fileHandler";

const HUB_URL =
  process.env.NEXT_PUBLIC_HUB_URL || "https://sport-clan-nexus.vercel.app";

/**
 * Proxy to hub `/api/ai/rag` — same request body as hub client.
 * Forwards Supabase session from cookies when the client omits Authorization.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);

    if (!body || typeof body.query !== "string" || !body.query.trim()) {
      return Response.json(
        { ok: false, error: "Missing query" },
        { status: 400 }
      );
    }

    let authHeader = request.headers.get("authorization");
    if (!authHeader) {
      try {
        const supabase = await createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.access_token) {
          authHeader = `Bearer ${session.access_token}`;
        }
      } catch {
        // continue without auth
      }
    }

    // Enrich with decoded text of attached text/code files so the upstream
    // hub/LLM actually sees the bytes, not just filenames. Also resolve any
    // server-side attachment references (our /api/kusai/files/{token} uploads)
    // back into inline data URLs so image/document bytes reach the hub.
    const enrichedBody = { ...body };
    const outAttachments = Array.isArray(body.attachments) ? [...body.attachments] : [];
    const docs = outAttachments
      .map((att: unknown) => {
        if (!att || typeof att !== "object") return null;
        const { url } = att as { url?: unknown };
        if (typeof url !== "string" || !url.startsWith("data:")) return null;
        const comma = url.indexOf(",");
        const data = comma >= 0 ? url.slice(comma + 1) : "";
        if (!data) return null;
        return {
          name: (att as { name?: unknown }).name ?? "attachment",
          text: decodeTextFromBase64(data),
        };
      })
      .filter((d): d is { name: string; text: string } =>
        !!d && d.text.trim().length > 0
      );

    if (docs.length) {
      const fileBlock = docs
        .map((d) => `\n\nAttached File (${d.name}):\n\`\`\`\n${d.text.slice(0, 40_000)}\n\`\`\``)
        .join("\n");
      enrichedBody.query = `${enrichedBody.query}${fileBlock}`;
      enrichedBody.attachments = outAttachments.map((att: unknown) => {
        if (!att || typeof att !== "object") return att;
        const a = att as Record<string, unknown>;
        return { ...a, extractedText: docs.map((d) => d.text).join("\n\n") };
      });
    }

    // Resolve stored references back into data URLs for image attachments.
    const resolved = [];
    for (const att of outAttachments) {
      if (!att || typeof att !== "object") {
        resolved.push(att);
        continue;
      }
      const a = att as Record<string, unknown>;
      const url = typeof a.url === "string" ? a.url : "";
      const mimeType = typeof a.mimeType === "string" ? a.mimeType : "";
      const reg = url.match(/\/api\/kusai\/files\/([a-f0-9]{48})$/);
      if (!reg || !mimeType.startsWith("image/")) {
        resolved.push(att);
        continue;
      }
      try {
        const token = reg[1];
        const fileRes = await fetch(`${request.nextUrl.origin}/api/kusai/files/${token}`);
        if (fileRes.ok) {
          const buf = await fileRes.arrayBuffer();
          const base64 = Buffer.from(buf).toString("base64");
          resolved.push({ ...a, url: `data:${mimeType};base64,${base64}` });
          continue;
        }
      } catch {
        // fall through to original
      }
      resolved.push(att);
    }

    if (resolved.length) {
      enrichedBody.attachments = resolved;
    }

    const hubRes = await fetch(`${HUB_URL}/api/ai/rag`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: enrichedBody.stream ? "text/event-stream" : "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify(enrichedBody),
    });

    if (body.stream && hubRes.body) {
      return new Response(hubRes.body, {
        status: hubRes.status,
        headers: {
          "Content-Type":
            hubRes.headers.get("content-type") || "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    const data = await hubRes.json().catch(() => ({
      ok: false,
      error: "Invalid hub response",
    }));
    return Response.json(data, { status: hubRes.status });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Hub request failed";
    return Response.json(
      {
        ok: false,
        error: message,
        answer:
          "Couldn't reach the kingdom hub — check your connection and try again.",
      },
      { status: 502 }
    );
  }
}
