import { AI_API_BASE_URL, aiApi } from "@/lib/api";
import type { MartaRole } from "@/lib/marta-storage";

export type MartaPageContextPayload = {
  current_path: string;
  class_id: number | null;
  lecture_id: number | null;
  user_name: string | null;
  user_role: string | null;
  parish_id: number | null;
};

export type SendMartaMessageInput = {
  message: string;
  history: Array<{ role: MartaRole; content: string }>;
  context: MartaPageContextPayload;
  onToken: (chunk: string) => void;
  onTool?: (toolName: string) => void;
  signal?: AbortSignal;
};

export type SendMartaMessageResult = {
  reply: string;
  toolsUsed: string[];
};

async function sendJsonFallback(
  input: Omit<SendMartaMessageInput, "onToken" | "onTool">,
): Promise<SendMartaMessageResult> {
  const { data } = await aiApi.post<{ reply: string; tools_used?: string[] }>(
    "/marta/chat",
    {
      message: input.message,
      history: input.history,
      context: input.context,
      stream: false,
    },
    { signal: input.signal },
  );

  return {
    reply: data.reply,
    toolsUsed: data.tools_used ?? [],
  };
}

function parseSseBlock(block: string): { event: string; data: Record<string, unknown> } | null {
  const lines = block.split(/\r?\n/);
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (dataLines.length === 0) return null;
  try {
    return {
      event,
      data: JSON.parse(dataLines.join("\n")) as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}

export async function sendMartaMessage(
  input: SendMartaMessageInput,
): Promise<SendMartaMessageResult> {
  let receivedAnyToken = false;
  let fullReply = "";
  let toolsUsed: string[] = [];

  try {
    const response = await fetch(`${AI_API_BASE_URL}/marta/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: input.signal,
      body: JSON.stringify({
        message: input.message,
        history: input.history,
        context: input.context,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      const detail =
        (errBody as { detail?: string; message?: string })?.detail ??
        (errBody as { message?: string })?.message;
      throw new Error(detail || `Erro HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const json = (await response.json()) as { reply: string; tools_used?: string[] };
      input.onToken(json.reply);
      return { reply: json.reply, toolsUsed: json.tools_used ?? [] };
    }

    if (!response.body) {
      throw new Error("Stream indisponível");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        const parsed = parseSseBlock(block);
        if (!parsed) continue;

        if (parsed.event === "tool" && typeof parsed.data.tool === "string") {
          input.onTool?.(parsed.data.tool);
        } else if (parsed.event === "token" && typeof parsed.data.content === "string") {
          receivedAnyToken = true;
          fullReply += parsed.data.content;
          input.onToken(parsed.data.content);
        } else if (parsed.event === "done" && Array.isArray(parsed.data.tools_used)) {
          toolsUsed = parsed.data.tools_used.map(String);
        } else if (parsed.event === "error") {
          throw new Error(String(parsed.data.detail ?? "Erro ao processar resposta da martaAI."));
        }
      }
    }

    if (!receivedAnyToken) {
      throw new Error("Stream encerrado sem tokens");
    }

    return { reply: fullReply, toolsUsed };
  } catch (err) {
    if (input.signal?.aborted) throw err;
    if (!receivedAnyToken) {
      const fallback = await sendJsonFallback(input);
      input.onToken(fallback.reply);
      return fallback;
    }
    throw err;
  }
}
