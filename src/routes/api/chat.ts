import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

interface ChatMessage {
  role: "user" | "assistant";
  content: string | Array<Record<string, unknown>>;
}

const jsonHeaders = { "content-type": "application/json" };

type WorkersAI = {
  run: (
    model: string,
    input: {
      messages: Array<{ role: string; content: string }>;
      max_tokens: number;
    },
  ) => Promise<unknown>;
};

function serializeError(error: unknown) {
  if (error instanceof Error) {
    const details = error as Error & {
      code?: unknown;
      status?: unknown;
      statusCode?: unknown;
      cause?: unknown;
      body?: unknown;
    };

    return {
      name: error.name,
      message: error.message,
      code: details.code ?? null,
      status: details.status ?? details.statusCode ?? null,
      body: details.body ?? null,
      cause:
        details.cause instanceof Error
          ? { name: details.cause.name, message: details.cause.message }
          : details.cause ?? null,
      stack: error.stack ?? null,
    };
  }

  return {
    name: typeof error,
    message: String(error),
    code: null,
    status: null,
    body: null,
    cause: null,
    stack: null,
  };
}

function textFromValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (!value || typeof value !== "object") return null;

  if (Array.isArray(value)) {
    const parts = value.map(textFromValue).filter(Boolean) as string[];
    return parts.length ? parts.join("") : null;
  }

  const object = value as Record<string, unknown>;

  // Prefer the actual generated-text fields used by Workers AI/OpenAI-shaped results.
  for (const key of ["response", "output_text", "text", "content"]) {
    const candidate = textFromValue(object[key]);
    if (candidate) return candidate;
  }

  // Also support OpenAI chat-completions-shaped responses.
  const choices = object.choices;
  if (Array.isArray(choices)) {
    for (const choice of choices) {
      if (!choice || typeof choice !== "object") continue;
      const c = choice as Record<string, unknown>;
      const messageText = textFromValue(c.message);
      if (messageText) return messageText;
      const deltaText = textFromValue(c.delta);
      if (deltaText) return deltaText;
    }
  }

  // GPT-OSS/Responses-style results can nest output under several levels.
  for (const key of ["output", "result", "results", "data"]) {
    const candidate = textFromValue(object[key]);
    if (candidate) return candidate;
  }

  return null;
}

function extractAIText(result: unknown): string | null {
  return textFromValue(result)?.trim() || null;
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

        const aiMessages = [
          ...(body.system
            ? [{ role: "system" as const, content: body.system }]
            : []),
          ...messages
            .filter(
              (m) =>
                m &&
                (m.role === "user" || m.role === "assistant") &&
                (typeof m.content === "string" || Array.isArray(m.content)),
            )
            .map((m) => ({
              role: m.role,
              content:
                typeof m.content === "string"
                  ? m.content
                  : m.content
                      .map((block) =>
                        typeof block?.text === "string" ? block.text : "",
                      )
                      .join(""),
            })),
        ];

        try {
          const ai = env.AI as WorkersAI | undefined;
          if (!ai) {
            throw new Error("Workers AI binding AI is unavailable at runtime");
          }

          const model = "@cf/openai/gpt-oss-20b";
          const maxTokens = Math.min(body.max_tokens ?? 1000, 2000);

          console.info("[api/chat] Calling Workers AI", {
            model,
            messageCount: aiMessages.length,
            maxTokens,
          });

          const result = await ai.run(model, {
            messages: aiMessages,
            max_tokens: maxTokens,
          });

          console.info("[api/chat] Workers AI returned successfully", {
            model,
            resultType: typeof result,
          });

          const text = extractAIText(result);

          if (!text) {
            console.error("[api/chat] Workers AI returned no text", {
              model,
              resultType: typeof result,
              resultKeys:
                result && typeof result === "object"
                  ? Object.keys(result as Record<string, unknown>)
                  : [],
            });
            throw new Error("Workers AI returned a response without text");
          }

          const event = {
            type: "content_block_delta",
            delta: {
              type: "text_delta",
              text,
            },
          };

          const streamData =
            `data: ${JSON.stringify(event)}\n\n` +
            `data: [DONE]\n\n`;

          return new Response(streamData, {
            status: 200,
            headers: {
              "content-type": "text/event-stream",
              "cache-control": "no-cache, no-transform",
            },
          });
        } catch (error) {
          const diagnostic = serializeError(error);

          console.error("[api/chat] Workers AI FAILED", {
            model: "@cf/openai/gpt-oss-20b",
            messageCount: aiMessages.length,
            error: diagnostic,
          });

          const diagnosticText = [
            diagnostic.message,
            diagnostic.code ? `code=${String(diagnostic.code)}` : null,
            diagnostic.status ? `status=${String(diagnostic.status)}` : null,
          ]
            .filter(Boolean)
            .join(" | ");

          return new Response(
            JSON.stringify({
              error: {
                code: "ai_error",
                message: `THRN couldn't reach the AI engine: ${diagnosticText}`,
                diagnostic: {
                  name: diagnostic.name,
                  message: diagnostic.message,
                  code: diagnostic.code,
                  status: diagnostic.status,
                  body: diagnostic.body,
                  cause: diagnostic.cause,
                },
              },
            }),
            { status: 503, headers: jsonHeaders },
          );
        }
      },
    },
  },
});
