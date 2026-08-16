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

  // GPT-OSS can expose its internal channel labels in several forms:
  // assistant.analysis, assistantanalysis, assistant.final, assistantfinal,
  // and can sometimes append another analysis segment after the final text.
  // Keep ONLY the final channel and stop before any later analysis channel.
  const finalMarker = /assistant(?:[.\s:_-]*)final\s*:?[ \t]*/gi;
  const analysisMarker = /assistant(?:[.\s:_-]*)analysis\s*:?[ \t]*/gi;
  const finalMatches = [...cleaned.matchAll(finalMarker)];

  if (finalMatches.length > 0) {
    const finalMatch = finalMatches[finalMatches.length - 1];
    const start = (finalMatch.index ?? 0) + finalMatch[0].length;
    cleaned = cleaned.slice(start).trim();

    const trailingAnalysis = analysisMarker.exec(cleaned);
    if (trailingAnalysis?.index !== undefined) {
      cleaned = cleaned.slice(0, trailingAnalysis.index).trim();
    }
  } else {
    // No final marker: remove any exposed analysis marker and everything after
    // it when it appears before the actual answer.
    const leadingAnalysis = cleaned.match(analysisMarker);
    if (leadingAnalysis?.index !== undefined) {
      cleaned = cleaned.slice(leadingAnalysis.index + leadingAnalysis[0].length).trim();
    }
  }

  // Remove any remaining channel labels that may be left at boundaries.
  cleaned = cleaned
    .replace(/^\s*assistant(?:[.\s:_-]*)analysis\s*:?[ \t]*/i, "")
    .replace(/^\s*assistant(?:[.\s:_-]*)final\s*:?[ \t]*/i, "")
    .trim();

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
