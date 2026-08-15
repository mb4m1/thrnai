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

          const output = result as {
            response?: string;
            output_text?: string;
            result?: { response?: string };
          };

          const text =
            output.response ??
            output.output_text ??
            output.result?.response ??
            "THRN couldn't generate a response.";

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

          return new Response(
            JSON.stringify({
              error: {
                code: "ai_error",
                message: "THRN couldn't generate a response.",
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
