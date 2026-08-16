import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

interface ChatMessage {
  role: "user" | "assistant";
  content: string | Array<Record<string, unknown>>;
}

const jsonHeaders = { "content-type": "application/json" };

type WorkersAI = {
  run: (model: string, input: Record<string, unknown>) => Promise<unknown>;
};

function cleanAIText(text: string): string {
  let cleaned = text.trim();

  // GPT-OSS can include its internal channel labels in prompt-mode output.
  // Never expose the analysis/reasoning section to the user.
  const finalMarker = /(?:^|\n)\s*(?:assistant\.)?final\s*:?[ \t]*\n?/i;
  const finalMatch = cleaned.match(finalMarker);
  if (finalMatch && finalMatch.index !== undefined) {
    cleaned = cleaned.slice(finalMatch.index + finalMatch[0].length).trim();
  } else {
    // If there is no explicit final channel, remove common internal analysis
    // labels while preserving the actual user-facing text.
    cleaned = cleaned
      .replace(/^\s*assistant\.analysis\s*\n?/i, "")
      .replace(/^\s*assistant\.final\s*\n?/i, "")
      .trim();
  }

  return cleaned;
}

function extractAIText(result: unknown): string | null {
  if (typeof result === "string" && result.trim()) {
    const text = cleanAIText(result);
    return text || null;
  }
  if (!result || typeof result !== "object") return null;

  const seen = new Set<object>();
  const walk = (value: unknown, depth = 0): string | null => {
    if (depth > 12 || value == null) return null;
    if (typeof value === "string") {
      const text = cleanAIText(value);
      return text || null;
    }
    if (typeof value !== "object") return null;

    const objectValue = value as object;
    if (seen.has(objectValue)) return null;
    seen.add(objectValue);

    if (Array.isArray(value)) {
      for (const item of value) {
        const text = walk(item, depth + 1);
        if (text) return text;
      }
      return null;
    }

    const object = value as Record<string, unknown>;

    for (const key of [
      "response",
      "output_text",
      "text",
      "generated_text",
      "content",
      "message",
      "delta",
    ]) {
      const text = walk(object[key], depth + 1);
      if (text) return text;
    }

    for (const key of ["output", "choices", "result", "data"]) {
      const text = walk(object[key], depth + 1);
      if (text) return text;
    }

    return null;
  };

  return walk(result);
}

function messageText(message: ChatMessage): string {
  if (typeof message.content === "string") return message.content;
  return message.content
    .map((block) =>
      typeof block?.text === "string" ? block.text : "",
    )
    .join("");
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: {
          system?: string;
          messages?: ChatMessage[];
          max_tokens?: number;
        };

        try {
          body = await request.json();
        } catch {
          return new Response(
            JSON.stringify({ error: { message: "Invalid JSON body" } }),
            { status: 400, headers: jsonHeaders },
          );
        }

        const messages = Array.isArray(body.messages) ? body.messages : [];
        const validMessages = messages.filter(
          (m) =>
            m &&
            (m.role === "user" || m.role === "assistant") &&
            (typeof m.content === "string" || Array.isArray(m.content)),
        );

        const promptParts: string[] = [];
        if (body.system?.trim()) {
          promptParts.push(`SYSTEM:\n${body.system.trim()}`);
        }
        for (const message of validMessages) {
          const content = messageText(message).trim();
          if (!content) continue;
          promptParts.push(`${message.role.toUpperCase()}:\n${content}`);
        }
        promptParts.push("ASSISTANT:");
        const prompt = promptParts.join("\n\n");

        try {
          const ai = env.AI as WorkersAI | undefined;
          if (!ai) {
            throw new Error("Workers AI binding AI is unavailable at runtime");
          }

          const model = "@cf/openai/gpt-oss-20b";
          const maxTokens = Math.min(body.max_tokens ?? 1000, 2000);

          console.info("[api/chat] Calling Workers AI", {
            model,
            messageCount: validMessages.length,
            maxTokens,
            inputMode: "prompt",
          });

          const result = await ai.run(model, {
            prompt,
            max_tokens: maxTokens,
          });

          const text = extractAIText(result);
          if (!text) {
            throw new Error("Workers AI returned a response without text");
          }

          const event = {
            type: "content_block_delta",
            delta: {
              type: "text_delta",
              text,
            },
          };

          return new Response(
            `data: ${JSON.stringify(event)}\n\ndata: [DONE]\n\n`,
            {
              status: 200,
              headers: {
                "content-type": "text/event-stream",
                "cache-control": "no-cache, no-transform",
              },
            },
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);

          console.error("[api/chat] Workers AI FAILED", {
            model: "@cf/openai/gpt-oss-20b",
            error: message,
          });

          return new Response(
            JSON.stringify({
              error: {
                code: "ai_error",
                message: `THRN couldn't reach the AI engine: ${message}`,
              },
            }),
            { status: 503, headers: jsonHeaders },
          );
        }
      },
    },
  },
});
