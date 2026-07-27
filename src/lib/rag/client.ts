export interface RagMessage {
  role: "user" | "assistant";
  content: string;
}

export interface RagRequestBody {
  messages: RagMessage[];
  userContext?: Record<string, unknown>;
  stream?: boolean;
}

export interface RagChunk {
  type: "text" | "card" | "chip" | "done" | "error";
  content?: string;
  data?: Record<string, unknown>;
}

export async function* streamRagResponse(
  messages: RagMessage[],
  accessToken?: string,
  userContext?: Record<string, unknown>
): AsyncGenerator<RagChunk> {
  const res = await fetch("/api/ai/rag", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({
      messages,
      userContext,
      stream: true,
    } satisfies RagRequestBody),
  });

  if (!res.ok) {
    yield { type: "error", content: `Request failed: ${res.status}` };
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    yield { type: "error", content: "No response body" };
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6).trim();
        if (data === "[DONE]") {
          yield { type: "done" };
          return;
        }
        try {
          const parsed = JSON.parse(data);
          if (parsed.choices?.[0]?.delta?.content) {
            yield { type: "text", content: parsed.choices[0].delta.content };
          } else if (parsed.type) {
            yield parsed as RagChunk;
          }
        } catch {
          if (data) yield { type: "text", content: data };
        }
      }
    }
  }

  if (buffer.trim()) {
    yield { type: "text", content: buffer.trim() };
  }
  yield { type: "done" };
}
